"""
A property is usually described by 2-4 documents: the glossy brochure,
a RERA certificate screenshot/PDF, a price list, maybe a floor-plan
sheet. Each gets extracted independently (extractor.py), then this
module folds them into one PropertyExtraction the human reviews.

Rule of thumb: highest confidence wins per field. The one exception is
RERA fields — a RERA ID typed on a marketing brochure is routinely a
typo risk, so if any source file's name suggests it IS the official
RERA certificate, that source is trusted for RERA fields regardless of
the brochure's confidence score.
"""

from __future__ import annotations

import re
from typing import List

from .schema import ConfigVariant, ExtractedField, PropertyExtraction

_RERA_FILENAME_HINTS = ("rera", "certificate", "registration")


def _looks_like_rera_doc(file_name: str) -> bool:
    lower = file_name.lower()
    return any(hint in lower for hint in _RERA_FILENAME_HINTS)


def _pick(a: ExtractedField, b: ExtractedField, prefer_b: bool = False) -> ExtractedField:
    if not a.found:
        return b
    if not b.found:
        return a
    if prefer_b:
        return b
    return b if b.confidence > a.confidence else a


def _dedupe_list(fields: List[ExtractedField]) -> List[ExtractedField]:
    seen = set()
    out = []
    for f in fields:
        if not f.found or f.value is None:
            continue
        key = str(f.value).strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def _is_substantive(v: ConfigVariant) -> bool:
    """Does this row tell a human anything?

    A "Typical Plan" page marks where units sit on a floor — A-101,
    B-102 as bare labels on a site drawing. Those read as layouts to
    the model but carry no rooms, no area and no price, so they arrive
    as a shelf of empty cards that bury the real ones. A layout earns
    its place with room detail or a commercial figure."""
    # Rooms only count when they carry a size. One brochure produced a "Foyer
    # Block A" holding a meter room, a substation and a DG set room, none of
    # them measured — building services, not a home, but three rooms all the
    # same, so a bare count let it through as a layout.
    if sum(1 for r in v.rooms if r.dimension.found) > 1:
        return True
    return any(
        f.found
        for f in (
            v.carpet_area,
            v.built_up_area,
            v.super_built_up_area,
            v.price,
            v.rate_per_sqft,
        )
    )


# A duplex or a penthouse occupies two storeys and is therefore drawn on two
# sheets — "5 BHK DUPLEX LOWER FLOOR PLAN" and "…UPPER FLOOR PLAN". They are
# one home: bedrooms 1-3 downstairs, 4-5 upstairs. Left unmerged they arrive as
# two half-empty layouts, and the listing shows a five-bedroom duplex as a
# three-bedroom one next to a two-bedroom one.
# Books say "UPPER FLOOR PLAN", "LOWER LEVEL", "GROUND FLOOR" — all the same
# idea, all meaning "this sheet is one storey of the home named beside it".
_FLOOR_QUALIFIER_RE = re.compile(
    r"\b(?:lower|upper|ground|first|second|third|typical)?\s*(?:floor|level)\s*(?:plan)?\b",
    re.IGNORECASE,
)

# Brochures are inconsistent about spacing a dash in a unit label — "Unit - A"
# on one page, "Unit-A" on the next for the SAME unit. Left unfolded, those
# hash to different keys and the same layout arrives as two rows instead of
# one, each with half its rooms.
_DASH_RE = re.compile(r"[-‐‑‒–—―]")


def _variant_key(v: ConfigVariant) -> str:
    """Identity of a unit layout: the unit label plus which floor
    series it's drawn for. The series matters — one plan sheet often
    draws "101 to 1101" and "102 to 1102" as mirrored units whose room
    sizes genuinely differ, so collapsing them would silently discard
    one of the two real layouts. Which STOREY of a multi-level home a
    sheet shows does not: those halves belong together."""
    raw_label = " ".join(str(v.variant_label.value or "").split()).strip().lower()
    raw_label = " ".join(_DASH_RE.sub(" ", raw_label).split()).strip()
    label = " ".join(_FLOOR_QUALIFIER_RE.sub("", raw_label).split()).strip()
    multi_level = label != raw_label

    if multi_level:
        # For one storey of a multi-level home, only the home's own name says
        # WHICH home it is. Its bedroom count describes just that sheet — a
        # penthouse arrives as "2 BHK" downstairs and "3 BHK" upstairs — and
        # its floor series says where the sheet sits, not what it belongs to.
        # A real book printed the series on the lower sheet and left it off the
        # upper one, and keying on either split one five-bedroom penthouse into
        # a two- and a three-bedroom home. Two genuinely different penthouses
        # are distinguished in the label itself ("4 BHK PENTHOUSE" vs "5 BHK").
        return f"|{label}|"

    parts = [
        str(v.bhk_type.value or "").strip().lower(),
        label,
        str(v.floor_range.value or "").strip().lower(),
    ]
    return "|".join(parts)


def _dedupe_rooms(rooms):
    seen = set()
    out = []
    for r in rooms:
        key = (
            str(r.room_name.value or "").strip().lower(),
            str(r.dimension.value or "").strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _dedupe_configurations(variants: List[ConfigVariant]) -> List[ConfigVariant]:
    """One layout can surface in more than one LLM batch (a plan page
    split across batches, or a floor-plan sheet uploaded alongside the
    brochure). Fold those into one row rather than showing the human
    the same unit twice with half its rooms each time.

    Rooms are only deduped ACROSS such re-reports, never within a
    single reported layout: a symmetric plan can legitimately show two
    identically-sized bedrooms, and the model read that off the drawing.
    The cost of this trade-off is that if two re-reports each contained
    that genuine pair, the union keeps one — a missing duplicate the
    human can re-add, which beats silently inventing rooms."""
    merged: dict[str, ConfigVariant] = {}
    order: List[str] = []
    substantive = [v for v in variants if _is_substantive(v)]
    # ...unless nothing survives, in which case whatever we have beats
    # showing the human an empty Configurations section.
    for v in (substantive or variants):
        key = _variant_key(v)
        if not key.strip("|"):
            # Nothing identifies this row — keep it as-is rather than
            # collapsing unrelated unlabelled variants together.
            order.append(f"__anon_{len(order)}")
            merged[order[-1]] = v
            continue
        if key not in merged:
            merged[key] = v
            order.append(key)
            continue
        existing = merged[key]
        for field_name in (
            "bhk_type",
            "variant_label",
            "floor_range",
            "carpet_area",
            "built_up_area",
            "super_built_up_area",
            "price",
            "rate_per_sqft",
        ):
            setattr(
                existing,
                field_name,
                _pick(getattr(existing, field_name), getattr(v, field_name)),
            )
        existing.rooms = _dedupe_rooms(existing.rooms + v.rooms)
    return [merged[k] for k in order]


def merge_extractions(extractions: List[PropertyExtraction]) -> PropertyExtraction:
    if not extractions:
        return PropertyExtraction()
    if len(extractions) == 1:
        result = extractions[0]
        result.amenities = _dedupe_list(result.amenities)
        result.highlights = _dedupe_list(result.highlights)
        result.configurations = _dedupe_configurations(result.configurations)
        return result

    merged = PropertyExtraction()
    merged.source_files = [f for e in extractions for f in e.source_files]

    rera_source_present = any(
        _looks_like_rera_doc(name) for e in extractions for name in e.source_files
    )

    for e in extractions:
        prefer_for_rera = rera_source_present and any(
            _looks_like_rera_doc(name) for name in e.source_files
        )

        for key in merged.basics.model_fields:
            current = getattr(merged.basics, key)
            setattr(merged.basics, key, _pick(current, getattr(e.basics, key)))

        for key in merged.project_structure.model_fields:
            current = getattr(merged.project_structure, key)
            setattr(merged.project_structure, key, _pick(current, getattr(e.project_structure, key)))

        for key in merged.rera.model_fields:
            current = getattr(merged.rera, key)
            setattr(
                merged.rera,
                key,
                _pick(current, getattr(e.rera, key), prefer_b=prefer_for_rera),
            )

        for key in merged.construction_amenities.model_fields:
            current = getattr(merged.construction_amenities, key)
            setattr(
                merged.construction_amenities,
                key,
                _pick(current, getattr(e.construction_amenities, key)),
            )

        for key in ("experience_years", "total_delivered_projects", "ongoing_projects", "background"):
            current = getattr(merged.developer, key)
            setattr(merged.developer, key, _pick(current, getattr(e.developer, key)))
        merged.developer.notable_delivered_projects.extend(e.developer.notable_delivered_projects)

        merged.configurations.extend(e.configurations)
        merged.amenities.extend(e.amenities)
        merged.highlights.extend(e.highlights)
        merged.image_candidates.extend(e.image_candidates)
        merged.warnings.extend(e.warnings)

    merged.amenities = _dedupe_list(merged.amenities)
    merged.highlights = _dedupe_list(merged.highlights)
    merged.configurations = _dedupe_configurations(merged.configurations)
    merged.developer.notable_delivered_projects = _dedupe_list(
        merged.developer.notable_delivered_projects
    )

    return merged

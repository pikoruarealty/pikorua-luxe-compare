"""
Light-touch normalisation applied AFTER extraction, as a safety net —
the prompt already asks the model to normalise, but models are
inconsistent, so we clean up the common cases in code rather than
trusting formatting to always come back right.

This module never invents values; it only reshapes ones that already
exist (e.g. "15th Jan 2025" -> "15-01-2025", "Rs. 1,20,000" -> "120000").

One deliberate exception, at the bottom: `derive_bhk_from_rooms`.
Floor-plan sheets label a unit "Unit - A" and never repeat the BHK
count, so a layout extracted purely from a plan page has no BHK type
and lands in the UI's "Unlabelled" bucket — useless to a human trying
to compare 4 BHKs. The bedroom count IS on the drawing, so we count it.
Anything produced that way is flagged `derived=True` and carries its
own reasoning as evidence, so it reads as a computed suggestion rather
than something the brochure said.
"""

from __future__ import annotations

import re
from typing import Optional

from .schema import ExtractedField, PropertyExtraction

_MONTHS = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}

_DATE_TEXT_RE = re.compile(
    r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})", re.IGNORECASE
)
_DATE_SLASH_RE = re.compile(r"(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})")
_MONTH_YEAR_RE = re.compile(r"([A-Za-z]{3,9})\s+(\d{4})", re.IGNORECASE)


def extract_year_month(raw: str) -> Optional[tuple[int, int]]:
    """Best-effort (year, month) out of free text like "15th Jan 2025"
    or the month-year-only "Jan 2025" possession/RERA dates print as —
    for comparing which of two dates comes first, not for display
    (normalize_date already owns that). None for anything without a
    recognisable month name and year, e.g. a possession countdown like
    "9 Months" or "RTMI"."""
    if not raw:
        return None
    m = _DATE_TEXT_RE.search(raw)
    if m:
        _, month_name, year = m.groups()
    else:
        m = _MONTH_YEAR_RE.search(raw)
        if not m:
            return None
        month_name, year = m.groups()
    month = _MONTHS.get(month_name.strip().lower()[:3])
    if not month:
        return None
    return (int(year), int(month))


def normalize_date(raw: str) -> str:
    """Best-effort convert a free-text date into dd-mm-yyyy. Returns
    the original string unchanged if it doesn't match a known pattern
    — we'd rather show the raw text for a human to fix than mangle it."""
    if not raw:
        return raw
    raw = raw.strip()

    m = _DATE_TEXT_RE.search(raw)
    if m:
        day, month_name, year = m.groups()
        month = _MONTHS.get(month_name.strip().lower()[:3])
        if month:
            return f"{int(day):02d}-{month}-{year}"

    m = _DATE_SLASH_RE.search(raw)
    if m:
        d, mo, y = m.groups()
        if len(y) == 2:
            y = "20" + y
        return f"{int(d):02d}-{int(mo):02d}-{y}"

    return raw


def normalize_number(raw) -> Optional[str]:
    """Strip currency symbols / commas / units down to a plain number
    string where the input is clearly numeric-ish. Leaves alphanumeric
    mixed strings (e.g. "18/acre") alone."""
    if raw is None:
        return raw
    s = str(raw).strip()
    cleaned = re.sub(r"[₹,\s]", "", s)
    cleaned = re.sub(r"^(rs\.?|inr)", "", cleaned, flags=re.IGNORECASE)
    if re.fullmatch(r"\d+(\.\d+)?", cleaned):
        return cleaned
    return raw


def _normalize_field(field: ExtractedField, kind: str) -> None:
    if not field.found or field.value is None:
        return
    if kind == "date":
        field.value = normalize_date(str(field.value))
    elif kind == "number":
        field.value = normalize_number(field.value)


_BEDROOM_RE = re.compile(r"\bBED\s*ROOM\b", re.IGNORECASE)


def count_bedrooms(variant) -> int:
    """Bedrooms on one unit plan. Matches the printed label only — a
    "TOILET/DRESS" attached to a bedroom is not itself a bedroom, and
    neither is a "DRAWING" or "LIVING/DINING"."""
    return sum(
        1
        for room in variant.rooms
        if room.room_name.found and _BEDROOM_RE.search(str(room.room_name.value or ""))
    )


def derive_bhk_from_rooms(extraction: PropertyExtraction) -> PropertyExtraction:
    """Fill in a missing BHK type by counting bedrooms on the plan.

    Only ever fills a BLANK bhk_type — anything the brochure actually
    stated wins, always. Confidence is capped below the "looks certain"
    range because this is a reading of the drawing, not a quote from
    it: a study or servant's room drawn as a bedroom would shift the
    count, and only a human can settle that."""
    for variant in extraction.configurations:
        if variant.bhk_type.found:
            continue
        bedrooms = count_bedrooms(variant)
        if bedrooms < 1:
            continue
        source = next(
            (r.dimension for r in variant.rooms if r.dimension.source_page), None
        )
        variant.bhk_type = ExtractedField(
            value=f"{bedrooms} BHK",
            found=True,
            confidence=0.6,
            derived=True,
            source_file=source.source_file if source else None,
            source_page=source.source_page if source else None,
            evidence=f"counted {bedrooms} bedrooms on this unit's plan",
        )
    return extraction


_RCA_IN_LABEL_RE = re.compile(
    r"""R\.?\s*C\.?\s*A\.?          # "R.C.A." / "RCA" — RERA Carpet Area
        \s*[=:\-]?\s*
        (\d[\d,]*\.?\d*)            # the number
        \s*
        (sq\.?\s*(?:mt?r?s?|m|metre?s?|ft|feet)\.?)   # and its unit
    """,
    re.IGNORECASE | re.VERBOSE,
)


def recover_carpet_area_from_label(extraction: PropertyExtraction) -> PropertyExtraction:
    """Lift a carpet area the model left inside the unit's label.

    Some plan books print the unit number and its RERA carpet area as one
    caption — "UNIT NO.-2201 R.C.A. = 130.80 Sq.Mts.", "101 R.C.A.=181.55
    SQ.MT." The model takes the unit number as the label and quotes the
    whole caption as that label's evidence, then reports `carpet_area` as
    not found — so a number plainly printed on the page never reaches the
    listing. Area is what the comparison surface ranks homes by, so losing
    it matters more than most fields.

    Both the label's value and its evidence are searched. Evidence is
    where this usually lives, and it is the better source of the two: it
    is the verbatim page text the model quoted, not a value it chose.

    This invents nothing: the number, its unit, its page and its evidence
    all come from a string the extractor already returned. It only ever
    fills a BLANK carpet_area — anything actually extracted wins. Like
    `derive_bhk_from_rooms` the result is flagged `derived=True` and
    carries its own reasoning, so a reviewer sees a lifted value rather
    than a quoted one."""
    for variant in extraction.configurations:
        if variant.carpet_area.found:
            continue
        label = variant.variant_label
        for raw in (str(label.value or ""), str(label.evidence or "")):
            match = _RCA_IN_LABEL_RE.search(raw)
            if match:
                break
        if not match:
            continue
        number, unit = match.group(1), match.group(2)
        # Kept in the brochure's own unit rather than converted here. The
        # publication mapping reads the unit off this string and converts to
        # square feet at the point of storage, so converting twice — or
        # dropping the unit and letting it be assumed — is how a square-metre
        # area ends up ten times too small.
        variant.carpet_area = ExtractedField(
            value=f"{number} {unit}".strip(),
            found=True,
            confidence=min(label.confidence, 0.7),
            derived=True,
            source_file=label.source_file,
            source_page=label.source_page,
            evidence=f"read from this unit's label: {raw.strip()}",
        )
    return extraction


def flag_lopsided_series(extraction: PropertyExtraction) -> PropertyExtraction:
    """Warn when one unit's two mirrored series disagree on bedroom count.

    A plan sheet draws e.g. Unit A twice, as series 101-1101 and
    102-1102. They mirror each other: room SIZES differ slightly, the
    room COUNT essentially never does. So when the two lists come back
    4 and 7, no new information has been discovered — rooms from one
    half have been read into the other.

    We can detect that even though we can't fix it: which room belongs
    to which half is a question about the drawing, and only a human
    looking at the drawing can settle it. Saying so plainly beats
    presenting a confident 7 BHK that does not exist."""
    by_unit: dict[str, list] = {}
    for variant in extraction.configurations:
        label = str(variant.variant_label.value or "").strip().lower()
        if label:
            by_unit.setdefault(label, []).append(variant)

    for variants in by_unit.values():
        if len(variants) < 2:
            continue
        counts = {id(v): count_bedrooms(v) for v in variants}
        if len(set(counts.values())) == 1:
            continue
        detail = ", ".join(
            f"{v.floor_range.value or 'unlabelled series'} = {counts[id(v)]}"
            for v in variants
        )
        name = variants[0].variant_label.value
        msg = (
            f"{name}: its series disagree on bedroom count ({detail}). "
            f"Mirrored series almost always match, so some rooms are likely "
            f"assigned to the wrong series — check this unit's plan page."
        )
        extraction.warnings.append(msg)
        # The BHK we counted rests on that assignment, so it inherits
        # the doubt rather than presenting as settled.
        for v in variants:
            if v.bhk_type.derived:
                v.bhk_type.confidence = min(v.bhk_type.confidence, 0.3)
    return extraction


def normalize(extraction: PropertyExtraction) -> PropertyExtraction:
    _normalize_field(extraction.basics.possession_confirmed_as_of, "date")

    for key in (
        "total_towers",
        "total_floors",
        "units_per_floor",
        "total_units",
    ):
        _normalize_field(getattr(extraction.project_structure, key), "number")

    for key in (
        "parking_levels",
        "lifts_per_tower",
        "density_units_per_acre",
    ):
        _normalize_field(getattr(extraction.construction_amenities, key), "number")

    for key in ("experience_years", "total_delivered_projects", "ongoing_projects"):
        _normalize_field(getattr(extraction.developer, key), "number")

    for variant in extraction.configurations:
        _normalize_field(variant.price, "number")

    derive_bhk_from_rooms(extraction)
    recover_carpet_area_from_label(extraction)
    flag_lopsided_series(extraction)
    return extraction

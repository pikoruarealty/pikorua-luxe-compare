"""
Cross-field consistency checks that need the MERGED, normalized
PropertyExtraction — after merge_extractions() has folded every source
file into one record and normalize() has cleaned up formatting. The
per-file checks in extractor.py (area-field ratios, room-dimension
provenance) run earlier, against a single file's raw batches; these
run once, at the end, against the property as a whole.

Every check demotes rather than deletes, using the same confidence
clamp + validation_warning shape extractor.py's own validators already
use (see `_flag` below) — a human reviews the flagged field, nothing
is silently dropped or silently trusted.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from .config import settings
from .extractor import _looks_like_sqm, _numbers, _SQ_FT_PER_SQ_M
from .normalizer import extract_year_month
from .schema import ExtractedField, PropertyExtraction

log = logging.getLogger("cross_field_validators")

_CR_RE = re.compile(r"\bcr\b|\bcrore", re.IGNORECASE)
_LAKH_RE = re.compile(r"\blakh\b|\blac\b", re.IGNORECASE)
_ACRE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*acre", re.IGNORECASE)
_BHK_NUM_RE = re.compile(r"(\d+)\s*bhk", re.IGNORECASE)
_RERA_ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9/\-. ]{5,}$", re.IGNORECASE)


def _flag(result: PropertyExtraction, message: str, *fields: ExtractedField) -> None:
    log.warning(message)
    result.warnings.append(message)
    for field in fields:
        field.confidence = min(field.confidence, 0.35)
        field.validation_warning = message


def _price_to_rupees(text: str) -> Optional[float]:
    """"6.57 Cr" -> 65,700,000; "45 Lakh" -> 4,500,000; a bare number is
    assumed to already be rupees."""
    values = _numbers(text)
    if not values:
        return None
    value = values[0]
    if _CR_RE.search(text or ""):
        return value * 1_00_00_000
    if _LAKH_RE.search(text or ""):
        return value * 1_00_000
    return value


def _area_to_sqft(text: str) -> Optional[float]:
    values = _numbers(text)
    if not values or values[0] <= 0:
        return None
    if _looks_like_sqm(text):
        return values[0] * _SQ_FT_PER_SQ_M
    return values[0]


def _plot_acres(text: str) -> Optional[float]:
    m = _ACRE_RE.search(text or "")
    return float(m.group(1)) if m else None


def _bhk_number(variant) -> Optional[int]:
    if not variant.bhk_type.found:
        return None
    m = _BHK_NUM_RE.search(str(variant.bhk_type.value))
    return int(m.group(1)) if m else None


def _variant_area_sqft(variant) -> Optional[float]:
    for field in (variant.super_built_up_area, variant.carpet_area, variant.built_up_area):
        if field.found:
            area = _area_to_sqft(str(field.value))
            if area:
                return area
    return None


def _validate_rate_consistency(result: PropertyExtraction) -> None:
    """price should equal rate_per_sqft × super_built_up_area, within a
    tolerance that absorbs rounding — the classic way this drifts is a
    misplaced decimal (6.57 Cr transcribed as 65.7 Cr), which this
    catches because the implied rate comes out 10x off."""
    for variant in result.configurations:
        price, area, rate = variant.price, variant.super_built_up_area, variant.rate_per_sqft
        if not (price.found and area.found and rate.found):
            continue
        rupees = _price_to_rupees(str(price.value))
        sqft = _area_to_sqft(str(area.value))
        rate_values = _numbers(str(rate.value))
        if not rupees or not sqft or not rate_values or rate_values[0] <= 0:
            continue
        implied_rate = rupees / sqft
        printed_rate = rate_values[0]
        deviation = abs(implied_rate - printed_rate) / printed_rate
        if deviation > settings.RATE_TOLERANCE_PCT:
            label = str(variant.variant_label.value or variant.bhk_type.value or "layout")
            msg = (
                f"{label}: price ({price.value}) ÷ super_built_up_area ({area.value}) "
                f"implies a rate of ~{implied_rate:.0f}/sq ft, more than "
                f"{settings.RATE_TOLERANCE_PCT:.0%} off the printed rate_per_sqft "
                f"({rate.value}) — one of the three was likely misread"
            )
            _flag(result, msg, price, rate)


def _validate_unit_count_consistency(result: PropertyExtraction) -> None:
    ps = result.project_structure
    if not (
        ps.total_towers.found
        and ps.total_floors.found
        and ps.units_per_floor.found
        and ps.total_units.found
    ):
        return
    towers = _numbers(str(ps.total_towers.value))
    floors = _numbers(str(ps.total_floors.value))
    per_floor = _numbers(str(ps.units_per_floor.value))
    total = _numbers(str(ps.total_units.value))
    if not (towers and floors and per_floor and total) or total[0] <= 0:
        return
    expected = towers[0] * floors[0] * per_floor[0]
    if expected <= 0:
        return
    deviation = abs(expected - total[0]) / expected
    if deviation > settings.UNIT_COUNT_TOLERANCE_PCT:
        msg = (
            f"total_units ({ps.total_units.value}) does not match total_towers × "
            f"total_floors × units_per_floor ({ps.total_towers.value} × "
            f"{ps.total_floors.value} × {ps.units_per_floor.value} = {expected:.0f}), "
            f"more than {settings.UNIT_COUNT_TOLERANCE_PCT:.0%} off — check these four "
            f"figures against the brochure"
        )
        _flag(result, msg, ps.total_units)


def _validate_density_consistency(result: PropertyExtraction) -> None:
    ps = result.project_structure
    density = result.construction_amenities.density_units_per_acre
    if not (density.found and ps.total_units.found and ps.plot_size.found):
        return
    density_values = _numbers(str(density.value))
    total = _numbers(str(ps.total_units.value))
    acres = _plot_acres(str(ps.plot_size.value))
    if not density_values or not total or not acres or density_values[0] <= 0 or acres <= 0:
        return
    expected = total[0] / acres
    deviation = abs(expected - density_values[0]) / expected
    if deviation > settings.UNIT_COUNT_TOLERANCE_PCT:
        msg = (
            f"density_units_per_acre ({density.value}) does not match total_units ÷ "
            f"plot size ({ps.total_units.value} ÷ {ps.plot_size.value} ≈ "
            f"{expected:.1f}/acre), more than {settings.UNIT_COUNT_TOLERANCE_PCT:.0%} off "
            f"— check both figures against the brochure"
        )
        _flag(result, msg, density)


def _validate_area_progression(result: PropertyExtraction) -> None:
    """A 5 BHK is not usually smaller than a 3 BHK in the same project.
    Compares AVERAGE area per bedroom count between consecutive counts
    that actually appear — a single compact 4 BHK reading smaller than
    a single spacious 3 BHK is common and not itself suspicious, but a
    whole bedroom-count group averaging smaller than the one below it
    usually means an area or a bhk_type was misread."""
    by_bhk: dict[int, list] = {}
    for variant in result.configurations:
        bhk = _bhk_number(variant)
        area = _variant_area_sqft(variant)
        if bhk and area:
            by_bhk.setdefault(bhk, []).append(variant)

    sizes = sorted(by_bhk)
    for smaller_bhk, larger_bhk in zip(sizes, sizes[1:]):
        smaller_group = by_bhk[smaller_bhk]
        larger_group = by_bhk[larger_bhk]
        smaller_avg = sum(_variant_area_sqft(v) for v in smaller_group) / len(smaller_group)
        larger_avg = sum(_variant_area_sqft(v) for v in larger_group) / len(larger_group)
        if larger_avg >= smaller_avg:
            continue
        msg = (
            f"{larger_bhk} BHK's average area (~{larger_avg:.0f} sq ft) is smaller "
            f"than {smaller_bhk} BHK's (~{smaller_avg:.0f} sq ft) across this "
            f"listing's configurations — a bigger unit reading smaller than a "
            f"smaller one usually means an area or a bhk_type was misread, check "
            f"both against the brochure"
        )
        for variant in (*smaller_group, *larger_group):
            for field in (
                variant.super_built_up_area,
                variant.carpet_area,
                variant.built_up_area,
                variant.bhk_type,
            ):
                if field.found:
                    _flag(result, msg, field)


def _validate_possession_after_start(result: PropertyExtraction) -> None:
    possession = result.basics.possession
    start = result.rera.proposed_start_date
    if not (possession.found and start.found):
        return
    possession_ym = extract_year_month(str(possession.value))
    start_ym = extract_year_month(str(start.value))
    if not possession_ym or not start_ym:
        return
    if possession_ym <= start_ym:
        msg = (
            f'possession ("{possession.value}") is not after the RERA '
            f'proposed_start_date ("{start.value}") — a project cannot hand over '
            f"before, or the same month, it starts — one of these was likely "
            f"misread"
        )
        _flag(result, msg, possession, start)


def _validate_rera_id_format(result: PropertyExtraction) -> None:
    """State RERA authorities format IDs differently (Maharashtra's
    "P51700012345", Gujarat's "PR/GJ/AHMEDABAD/.../CAA02710/280325",
    Karnataka's "PRM/KA/RERA/1251/303/PR/..."), and this list will
    never cover every state — so this only flags what's clearly NOT an
    ID (too short, no digits at all), never anything that merely
    doesn't match a known template."""
    rera_id = result.rera.rera_id
    if not rera_id.found:
        return
    value = str(rera_id.value or "").strip()
    has_digit = any(c.isdigit() for c in value)
    if not has_digit or not _RERA_ID_RE.match(value):
        msg = (
            f'rera_id ("{rera_id.value}") does not look like a RERA registration '
            f"number — check it against the certificate"
        )
        _flag(result, msg, rera_id)


def validate_cross_field(result: PropertyExtraction) -> PropertyExtraction:
    _validate_rate_consistency(result)
    _validate_unit_count_consistency(result)
    _validate_density_consistency(result)
    _validate_area_progression(result)
    _validate_possession_after_start(result)
    _validate_rera_id_format(result)
    return result

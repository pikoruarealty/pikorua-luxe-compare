import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.extractor import (
    _parse_feet_inches_dimension,
    _validate_area_fields,
    _validate_room_area_sum,
)
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction, RoomDimension


def _area(value: str) -> ExtractedField:
    return ExtractedField(value=value, found=True, confidence=0.9, evidence=value)


def _room(name: str, dim: str) -> RoomDimension:
    return RoomDimension(
        room_name=ExtractedField(value=name, found=True, confidence=0.9),
        dimension=ExtractedField(value=dim, found=True, confidence=0.9),
    )


def test_parse_feet_inches_dimension():
    assert _parse_feet_inches_dimension('11\'9" X 14\'3"') == (11 + 9 / 12) * (14 + 3 / 12)


def test_parse_feet_inches_dimension_rejects_unparseable_strings():
    assert _parse_feet_inches_dimension('3\'6" WIDE') is None
    assert _parse_feet_inches_dimension("") is None
    assert _parse_feet_inches_dimension("3.5 sq.m.") is None


def test_carpet_directly_exceeding_super_built_up_is_flagged_even_without_built_up():
    """Many brochures only ever print carpet + super (no built-up row) —
    the chain must still catch carpet > super in that case."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    variant = ConfigVariant(
        variant_label=ExtractedField(value="Unit A", found=True, confidence=0.9),
        carpet_area=_area("1400 sq.ft."),
        super_built_up_area=_area("1200 sq.ft."),
    )
    e.configurations = [variant]
    _validate_area_fields(e)
    assert variant.super_built_up_area.confidence <= 0.35
    assert variant.super_built_up_area.validation_warning is not None


def test_carpet_super_ratio_outside_plausible_band_is_flagged():
    """Neither figure looks absurd on its own (no >3x or <1x violation,
    no sq-m/sq-ft mixup) but a 95% carpet-to-super efficiency ratio is
    not realistic — one of the two was likely misread."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    variant = ConfigVariant(
        variant_label=ExtractedField(value="Unit A", found=True, confidence=0.9),
        carpet_area=_area("1000 sq.ft."),
        super_built_up_area=_area("1050 sq.ft."),
    )
    e.configurations = [variant]
    _validate_area_fields(e)
    assert variant.carpet_area.confidence <= 0.35
    assert variant.carpet_area.validation_warning is not None


def test_carpet_super_ratio_within_plausible_band_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    variant = ConfigVariant(
        variant_label=ExtractedField(value="Unit A", found=True, confidence=0.9),
        carpet_area=_area("900 sq.ft."),
        super_built_up_area=_area("1300 sq.ft."),
    )
    e.configurations = [variant]
    _validate_area_fields(e)
    assert variant.carpet_area.confidence == 0.9
    assert variant.super_built_up_area.confidence == 0.9
    assert e.warnings == []


def test_room_sum_exceeding_carpet_area_flags_carpet_and_rooms():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    variant = ConfigVariant(
        variant_label=ExtractedField(value="Unit A", found=True, confidence=0.9),
        carpet_area=_area("500 sq.ft."),
        rooms=[
            _room("BEDROOM", '20\'0" X 20\'0"'),  # 400 sq ft
            _room("KITCHEN", '12\'0" X 12\'0"'),  # 144 sq ft
        ],
    )
    e.configurations = [variant]
    _validate_room_area_sum(e)
    assert variant.carpet_area.confidence <= 0.35
    assert variant.carpet_area.validation_warning is not None
    assert variant.rooms[0].dimension.confidence <= 0.35
    assert variant.rooms[1].dimension.confidence <= 0.35


def test_room_sum_within_carpet_area_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    variant = ConfigVariant(
        variant_label=ExtractedField(value="Unit A", found=True, confidence=0.9),
        carpet_area=_area("900 sq.ft."),
        rooms=[
            _room("BEDROOM", '11\'0" X 12\'0"'),
            _room("KITCHEN", '10\'0" X 10\'0"'),
        ],
    )
    e.configurations = [variant]
    _validate_room_area_sum(e)
    assert variant.carpet_area.confidence == 0.9
    assert e.warnings == []


def test_room_sum_check_skipped_when_carpet_is_in_square_metres():
    """Room dimensions are always feet-and-inches; a carpet figure
    printed in sq m isn't comparable without a conversion this check
    deliberately doesn't attempt."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    variant = ConfigVariant(
        variant_label=ExtractedField(value="Unit A", found=True, confidence=0.9),
        carpet_area=_area("46.5 sq.m."),  # ~500 sq ft, but rooms below sum to 544
        rooms=[
            _room("BEDROOM", '20\'0" X 20\'0"'),
            _room("KITCHEN", '12\'0" X 12\'0"'),
        ],
    )
    e.configurations = [variant]
    _validate_room_area_sum(e)
    assert variant.carpet_area.confidence == 0.9
    assert e.warnings == []

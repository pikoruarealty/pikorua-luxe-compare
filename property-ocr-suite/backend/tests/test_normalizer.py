import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.normalizer import (
    derive_bhk_from_rooms,
    flag_lopsided_series,
    normalize,
    normalize_date,
    normalize_number,
)
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction, RoomDimension


def _with_rooms(*names, bhk=None) -> PropertyExtraction:
    e = PropertyExtraction()
    e.configurations = [
        ConfigVariant(
            bhk_type=ExtractedField(value=bhk, found=True, confidence=0.9)
            if bhk
            else ExtractedField(),
            rooms=[
                RoomDimension(
                    room_name=ExtractedField(value=n, found=True, confidence=0.9),
                    dimension=ExtractedField(
                        value="10'0\" X 10'0\"", found=True, confidence=0.9, source_page=13
                    ),
                )
                for n in names
            ],
        )
    ]
    return e


def test_normalize_date_text_form():
    assert normalize_date("15th Jan 2025") == "15-01-2025"
    assert normalize_date("3 March 2026") == "03-03-2026"


def test_normalize_date_slash_form():
    assert normalize_date("15/01/2025") == "15-01-2025"
    assert normalize_date("15.01.25") == "15-01-2025"


def test_normalize_date_passthrough_unknown():
    assert normalize_date("RTMI") == "RTMI"


def test_normalize_number_strips_currency():
    assert normalize_number("Rs. 1,20,000") == "120000"
    assert normalize_number("₹ 45,00,000") == "4500000"


def test_normalize_number_leaves_mixed_alone():
    assert normalize_number("18/acre") == "18/acre"


def test_normalize_pipeline_updates_possession_date():
    extraction = PropertyExtraction()
    extraction.basics.possession_confirmed_as_of = ExtractedField(
        value="20th Feb 2026", found=True, confidence=0.9
    )
    result = normalize(extraction)
    assert result.basics.possession_confirmed_as_of.value == "20-02-2026"


def test_bhk_counted_from_bedrooms_when_plan_does_not_say():
    e = _with_rooms("DRAWING", "BEDROOM", "BEDROOM", "BEDROOM", "BEDROOM", "KITCHEN")
    derive_bhk_from_rooms(e)
    field = e.configurations[0].bhk_type
    assert field.value == "4 BHK"
    assert field.derived is True
    assert field.source_page == 13


def test_bedroom_count_ignores_lookalike_labels():
    """A "TOILET/DRESS" sits inside a bedroom on the plan but is not
    itself one — counting it would inflate every layout."""
    e = _with_rooms("BEDROOM", "TOILET/DRESS", "BEDROOM", "LIVING/DINING", "WASH")
    derive_bhk_from_rooms(e)
    assert e.configurations[0].bhk_type.value == "2 BHK"


def test_stated_bhk_is_never_overwritten_by_the_count():
    """What the brochure actually printed always beats our arithmetic."""
    e = _with_rooms("BEDROOM", "BEDROOM", "BEDROOM", bhk="5 BHK")
    derive_bhk_from_rooms(e)
    field = e.configurations[0].bhk_type
    assert field.value == "5 BHK"
    assert field.derived is False


def test_layout_with_no_bedrooms_is_left_blank():
    e = _with_rooms("LOBBY", "GYM")
    derive_bhk_from_rooms(e)
    assert e.configurations[0].bhk_type.found is False


def _series(label, floors, bedrooms):
    v = ConfigVariant(
        variant_label=ExtractedField(value=label, found=True, confidence=0.9),
        floor_range=ExtractedField(value=floors, found=True, confidence=0.9),
        rooms=[
            RoomDimension(
                room_name=ExtractedField(value="BEDROOM", found=True, confidence=0.9),
                dimension=ExtractedField(
                    value="10'0\" X 10'0\"", found=True, confidence=0.9, source_page=13
                ),
            )
            for _ in range(bedrooms)
        ],
    )
    return v


def test_mirrored_series_disagreeing_on_bedrooms_is_flagged():
    """4 and 7 bedrooms for the same unit isn't a discovery — it means
    rooms from one half were read into the other."""
    e = PropertyExtraction()
    e.configurations = [_series("Unit A", "101 to 1101", 4), _series("Unit A", "102 to 1102", 7)]
    derive_bhk_from_rooms(e)
    flag_lopsided_series(e)
    assert len(e.warnings) == 1
    assert "disagree on bedroom count" in e.warnings[0]
    assert "101 to 1101 = 4" in e.warnings[0]
    # The counted BHK rests on that assignment, so it inherits the doubt.
    assert all(v.bhk_type.confidence <= 0.3 for v in e.configurations)


def test_matching_series_are_not_flagged():
    e = PropertyExtraction()
    e.configurations = [_series("Unit A", "101 to 1101", 4), _series("Unit A", "102 to 1102", 4)]
    derive_bhk_from_rooms(e)
    flag_lopsided_series(e)
    assert e.warnings == []
    assert all(v.bhk_type.confidence > 0.3 for v in e.configurations)


def test_different_units_are_compared_separately():
    """Unit A being a 4 BHK and Unit C a 5 BHK is normal — only a unit
    disagreeing with ITSELF is suspicious."""
    e = PropertyExtraction()
    e.configurations = [
        _series("Unit A", "101 to 1101", 4), _series("Unit A", "102 to 1102", 4),
        _series("Unit C", "101 to 1101", 5), _series("Unit C", "102 to 1102", 5),
    ]
    flag_lopsided_series(e)
    assert e.warnings == []

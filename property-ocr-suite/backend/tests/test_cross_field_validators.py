import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.cross_field_validators import validate_cross_field
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction


def _field(value) -> ExtractedField:
    return ExtractedField(value=value, found=True, confidence=0.9)


def _variant(**kwargs) -> ConfigVariant:
    fields = {k: _field(v) for k, v in kwargs.items()}
    return ConfigVariant(variant_label=_field("Unit A"), **fields)


def test_rate_matching_price_and_area_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant(price="6.57 Cr", super_built_up_area="700 sq.ft.", rate_per_sqft="93857")
    ]
    validate_cross_field(e)
    v = e.configurations[0]
    assert v.price.confidence == 0.9
    assert v.rate_per_sqft.confidence == 0.9
    assert e.warnings == []


def test_misplaced_decimal_in_price_is_caught_by_rate_consistency():
    """The exact regression this check exists for: a price transcribed
    with the decimal moved a place (6.57 Cr -> 65.7 Cr) throws the
    implied rate 10x off the printed rate_per_sqft, even though neither
    figure looks absurd in isolation."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant(price="65.7 Cr", super_built_up_area="700 sq.ft.", rate_per_sqft="93857")
    ]
    validate_cross_field(e)
    v = e.configurations[0]
    assert v.price.confidence <= 0.35
    assert v.price.validation_warning is not None
    assert v.rate_per_sqft.confidence <= 0.35
    assert len(e.warnings) == 1


def test_unit_count_matching_towers_floors_units_per_floor_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.project_structure.total_towers = _field("4")
    e.project_structure.total_floors = _field("20")
    e.project_structure.units_per_floor = _field("4")
    e.project_structure.total_units = _field("320")
    validate_cross_field(e)
    assert e.project_structure.total_units.confidence == 0.9
    assert e.warnings == []


def test_unit_count_far_off_towers_floors_units_per_floor_is_flagged():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.project_structure.total_towers = _field("4")
    e.project_structure.total_floors = _field("20")
    e.project_structure.units_per_floor = _field("4")
    e.project_structure.total_units = _field("450")
    validate_cross_field(e)
    assert e.project_structure.total_units.confidence <= 0.35
    assert e.project_structure.total_units.validation_warning is not None


def test_density_matching_total_units_and_plot_size_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.project_structure.total_units = _field("200")
    e.project_structure.plot_size = _field("5 Acres")
    e.construction_amenities.density_units_per_acre = _field("40")
    validate_cross_field(e)
    assert e.construction_amenities.density_units_per_acre.confidence == 0.9
    assert e.warnings == []


def test_density_far_off_total_units_and_plot_size_is_flagged():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.project_structure.total_units = _field("200")
    e.project_structure.plot_size = _field("5 Acres")
    e.construction_amenities.density_units_per_acre = _field("80")
    validate_cross_field(e)
    assert e.construction_amenities.density_units_per_acre.confidence <= 0.35


def test_density_check_skipped_when_plot_size_is_not_in_acres():
    """Plot size in an unparseable free-text form (sq m, guntha, mixed
    units) is skipped rather than guessed at."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.project_structure.total_units = _field("200")
    e.project_structure.plot_size = _field("22662 sq.m.")
    e.construction_amenities.density_units_per_acre = _field("999")
    validate_cross_field(e)
    assert e.construction_amenities.density_units_per_acre.confidence == 0.9
    assert e.warnings == []


def test_bigger_bhk_averaging_smaller_area_is_flagged():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant(bhk_type="3 BHK", super_built_up_area="1300 sq.ft."),
        _variant(bhk_type="4 BHK", super_built_up_area="1150 sq.ft."),
    ]
    validate_cross_field(e)
    assert e.configurations[0].super_built_up_area.confidence <= 0.35
    assert e.configurations[1].super_built_up_area.confidence <= 0.35


def test_bhk_area_progression_increasing_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant(bhk_type="3 BHK", super_built_up_area="1300 sq.ft."),
        _variant(bhk_type="4 BHK", super_built_up_area="1600 sq.ft."),
    ]
    validate_cross_field(e)
    assert e.configurations[0].super_built_up_area.confidence == 0.9
    assert e.configurations[1].super_built_up_area.confidence == 0.9
    assert e.warnings == []


def test_possession_after_rera_start_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.basics.possession = _field("Dec 2026")
    e.rera.proposed_start_date = _field("Jan 2025")
    validate_cross_field(e)
    assert e.basics.possession.confidence == 0.9
    assert e.warnings == []


def test_possession_not_after_rera_start_is_flagged():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.basics.possession = _field("Jan 2025")
    e.rera.proposed_start_date = _field("Jan 2025")
    validate_cross_field(e)
    assert e.basics.possession.confidence <= 0.35
    assert e.rera.proposed_start_date.confidence <= 0.35


def test_possession_as_countdown_text_skips_the_check():
    """"9 Months" is not a calendar date — nothing to compare, so this
    is silently skipped rather than treated as a mismatch."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.basics.possession = _field("9 Months")
    e.rera.proposed_start_date = _field("Jan 2025")
    validate_cross_field(e)
    assert e.basics.possession.confidence == 0.9
    assert e.warnings == []


def test_plausible_rera_id_is_untouched():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.rera.rera_id = _field("PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/CAA02710/280325")
    validate_cross_field(e)
    assert e.rera.rera_id.confidence == 0.9
    assert e.warnings == []


def test_rera_id_that_is_clearly_not_an_id_is_flagged():
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.rera.rera_id = _field("NA")
    validate_cross_field(e)
    assert e.rera.rera_id.confidence <= 0.35
    assert e.rera.rera_id.validation_warning is not None

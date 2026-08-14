"""Area tables are the most error-prone thing in a brochure. The columns are
area types and the rows are units, so one real table

    |         | CARPET AREA | WASH AREA | BALCONY AREA
    | SQ. MT. |    308.29   |    7.24   |    43.61
    | SQ. FT. |   3317.20   |   77.90   |   469.24

came back with the wash area as the carpet area and the carpet area as a
built-up area the table does not even have. Nothing here can know the right
number — but "carpet is 2% of built-up" is knowable, and so is "that figure is
not in the snippet it was quoted from"."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.extractor import _validate_area_fields
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction


def field(value, evidence=None):
    return ExtractedField(
        value=value,
        found=True,
        confidence=0.9,
        source_page=4,
        evidence=evidence if evidence is not None else str(value),
    )


def check(**kw) -> PropertyExtraction:
    e = PropertyExtraction(configurations=[ConfigVariant(variant_label=field("Type A"), **kw)])
    _validate_area_fields(e)
    return e


def test_the_reported_table_misread_is_caught():
    e = check(carpet_area=field("77.90"), built_up_area=field("3317.20"))
    assert any("implausibly small" in w for w in e.warnings)
    assert e.configurations[0].carpet_area.confidence <= 0.35


def test_a_figure_absent_from_its_own_snippet_is_caught():
    """The model quoted "CARPET AREA 74.89" and reported 6295.14."""
    e = check(carpet_area=field("6295.14 sq.ft.", evidence="CARPET AREA 74.89"))
    assert any("does not appear in the text it was quoted from" in w for w in e.warnings)


def test_two_area_fields_holding_the_same_number_is_caught():
    same = "6295.14 sq.ft."
    e = check(
        carpet_area=field(same, evidence=f"CARPET {same}"),
        built_up_area=field(same, evidence=f"BUILT UP {same}"),
    )
    assert any("are both" in w for w in e.warnings)


def test_one_area_in_two_units_is_named_as_such():
    """308.29 sq m and 3317.20 sq ft are the same area — reading one as the
    carpet and the other as the built-up means both rows of one column."""
    e = check(carpet_area=field("308.29"), built_up_area=field("3317.20"))
    assert any("sq m to sq ft factor" in w for w in e.warnings)


def test_a_built_up_smaller_than_its_carpet_is_caught():
    e = check(carpet_area=field("3000"), built_up_area=field("2500"))
    assert any("cannot be right" in w for w in e.warnings)


def test_a_sane_table_is_left_alone():
    e = check(
        carpet_area=field("3358"),
        built_up_area=field("4200"),
        super_built_up_area=field("5500"),
    )
    assert e.warnings == []
    assert e.configurations[0].carpet_area.confidence == 0.9


def test_commas_and_units_do_not_confuse_the_check():
    e = check(carpet_area=field("3,358 sq.ft."), built_up_area=field("4,200 sq.ft."))
    assert e.warnings == []


def test_fields_that_were_not_found_are_ignored():
    e = check(carpet_area=ExtractedField(), built_up_area=field("4200"))
    assert e.warnings == []

"""A duplex or penthouse is drawn one storey per sheet. Those sheets describe
one home and have to be folded back together, or a five-bedroom duplex reaches
the listing as a three-bedroom layout beside a two-bedroom one."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.merger import merge_extractions
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction, RoomDimension


def field(value, confidence=0.9):
    return ExtractedField(value=value, found=True, confidence=confidence, source_page=1)


def room(name, dimension):
    return RoomDimension(room_name=field(name), dimension=field(dimension))


def variant(label, rooms, bhk="5 BHK", **kw):
    return ConfigVariant(
        bhk_type=field(bhk),
        variant_label=field(label),
        rooms=[room(n, d) for n, d in rooms],
        **kw,
    )


def _labels(result):
    return [v.variant_label.value for v in result.configurations]


def _rooms(result, index):
    return [r.room_name.value for r in result.configurations[index].rooms]


def test_lower_and_upper_floors_of_one_home_are_merged():
    e = PropertyExtraction(
        configurations=[
            variant(
                "5 BHK DUPLEX LOWER FLOOR PLAN",
                [("M. BED-1", "15'-0\" X 24'-0\""), ("M. BED-2", "14'-0\" X 18'-4\"")],
            ),
            variant(
                "5 BHK DUPLEX UPPER FLOOR PLAN",
                [("M. BED-4", "13'-0\" X 18'-0\""), ("M. BED-5", "11'-0\" X 14'-10\"")],
            ),
        ]
    )
    merged = merge_extractions([e])
    assert len(merged.configurations) == 1
    assert _rooms(merged, 0) == ["M. BED-1", "M. BED-2", "M. BED-4", "M. BED-5"]


def test_a_penthouse_and_a_duplex_stay_separate():
    """Both are two-storey, but they are different homes."""
    e = PropertyExtraction(
        configurations=[
            variant("5 BHK DUPLEX LOWER FLOOR PLAN", [("M. BED-1", "15'-0\" X 24'-0\"")]),
            variant("5 BHK PENTHOUSE LOWER FLOOR PLAN", [("M.BED-1", "16'-0\" X 22'-0\"")]),
        ]
    )
    assert len(merge_extractions([e]).configurations) == 2


def test_a_4bhk_and_a_5bhk_duplex_stay_separate():
    e = PropertyExtraction(
        configurations=[
            variant("4 BHK DUPLEX UPPER FLOOR PLAN", [("M. BED-3", "1'-0\" X 2'-0\"")], bhk="4 BHK"),
            variant("5 BHK DUPLEX UPPER FLOOR PLAN", [("M. BED-4", "3'-0\" X 4'-0\"")], bhk="5 BHK"),
        ]
    )
    assert len(merge_extractions([e]).configurations) == 2


def test_mirrored_series_are_still_never_merged():
    """The floor SERIES a plan is drawn for still separates two layouts — one
    sheet routinely shows two mirrored units whose rooms genuinely differ."""
    e = PropertyExtraction(
        configurations=[
            variant(
                "Unit - A",
                [("BED ROOM", "12'-0\" X 18'-6\"")],
                bhk="4 BHK",
                floor_range=field("101 to 1101"),
            ),
            variant(
                "Unit - A",
                [("BED ROOM", "13'-0\" X 18'-6\"")],
                bhk="4 BHK",
                floor_range=field("102 to 1102"),
            ),
        ]
    )
    assert len(merge_extractions([e]).configurations) == 2


def test_unrelated_layouts_are_untouched():
    e = PropertyExtraction(
        configurations=[
            variant("4 BHK - A BLOCK", [("M.BED-1", "13'-0\" X 21'-11\"")], bhk="4 BHK"),
            variant("5 BHK TYPICAL FLOOR PLAN", [("M. BED-1", "15'-0\" X 24'-0\"")]),
        ]
    )
    merged = merge_extractions([e])
    assert len(merged.configurations) == 2
    assert _labels(merged) == ["4 BHK - A BLOCK", "5 BHK TYPICAL FLOOR PLAN"]


def test_levels_merge_when_only_one_sheet_printed_a_floor_series():
    """Real book: the lower sheet carried "2201 to 2202", the upper carried
    nothing. Keying on the series split one five-bedroom penthouse into a
    two-bedroom home beside a three-bedroom one."""
    e = PropertyExtraction(
        configurations=[
            variant(
                "PENT HOUSE LOWER LEVEL",
                [("BEDROOM 1", "15'-0\" X 24'-0\""), ("BEDROOM 2", "14'-0\" X 18'-4\"")],
                bhk="2 BHK",
                floor_range=field("2201 to 2202"),
            ),
            variant(
                "PENT HOUSE UPPER LEVEL",
                [
                    ("BEDROOM 3", "13'-0\" X 18'-0\""),
                    ("BEDROOM 4", "12'-0\" X 16'-0\""),
                    ("BEDROOM 5", "11'-0\" X 14'-0\""),
                ],
                bhk="3 BHK",
            ),
        ]
    )
    merged = merge_extractions([e])
    assert len(merged.configurations) == 1
    assert len(_rooms(merged, 0)) == 5


def test_upper_and_lower_LEVEL_are_treated_like_floor_plans():
    """Books say "LOWER LEVEL" as readily as "LOWER FLOOR PLAN"."""
    e = PropertyExtraction(
        configurations=[
            variant("4 BHK DUPLEX LOWER LEVEL", [("BEDROOM 1", "15'-0\" X 24'-0\"")], bhk="1 BHK"),
            variant("4 BHK DUPLEX UPPER LEVEL", [("BEDROOM 2", "14'-0\" X 18'-4\"")], bhk="3 BHK"),
        ]
    )
    assert len(merge_extractions([e]).configurations) == 1


def test_a_room_reported_on_both_sheets_is_not_duplicated():
    e = PropertyExtraction(
        configurations=[
            variant("5 BHK PENTHOUSE LOWER FLOOR PLAN", [("M.BED-1", "15'-0\" X 24'-0\"")]),
            variant(
                "5 BHK PENTHOUSE UPPER FLOOR PLAN",
                [("M.BED-1", "15'-0\" X 24'-0\""), ("M.BED-5", "11'-0\" X 14'-0\"")],
            ),
        ]
    )
    merged = merge_extractions([e])
    assert _rooms(merged, 0) == ["M.BED-1", "M.BED-5"]

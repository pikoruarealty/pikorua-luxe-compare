import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.merger import merge_extractions
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction, RoomDimension


def _variant(label: str, floors: str, rooms=()) -> ConfigVariant:
    return ConfigVariant(
        variant_label=ExtractedField(value=label, found=True, confidence=0.9),
        floor_range=ExtractedField(value=floors, found=True, confidence=0.9),
        rooms=[
            RoomDimension(
                room_name=ExtractedField(value=name, found=True, confidence=0.9),
                dimension=ExtractedField(value=dim, found=True, confidence=0.9),
            )
            for name, dim in rooms
        ],
    )


def _extraction_with_name(name: str, value: str, confidence: float) -> PropertyExtraction:
    e = PropertyExtraction(source_files=[name])
    e.basics.property_name = ExtractedField(value=value, found=True, confidence=confidence)
    return e


def test_merge_single_file_passthrough():
    e = _extraction_with_name("brochure.pdf", "Ikebana", 0.9)
    merged = merge_extractions([e])
    assert merged.basics.property_name.value == "Ikebana"


def test_merge_prefers_higher_confidence():
    a = _extraction_with_name("brochure.pdf", "Ikebana", 0.6)
    b = _extraction_with_name("floorplan.pdf", "Ikebana Residences", 0.95)
    merged = merge_extractions([a, b])
    assert merged.basics.property_name.value == "Ikebana Residences"


def test_merge_rera_id_prefers_rera_certificate_source():
    brochure = PropertyExtraction(source_files=["brochure.pdf"])
    brochure.rera.rera_id = ExtractedField(value="PR/GJ/AHMEDABAD/TYPO123", found=True, confidence=0.9)

    rera_doc = PropertyExtraction(source_files=["rera_certificate.pdf"])
    rera_doc.rera.rera_id = ExtractedField(value="PR/GJ/AHMEDABAD/CORRECT456", found=True, confidence=0.7)

    merged = merge_extractions([brochure, rera_doc])
    # Even though the brochure's confidence is higher, the RERA
    # certificate source should win for RERA fields.
    assert merged.rera.rera_id.value == "PR/GJ/AHMEDABAD/CORRECT456"


def test_merge_dedupes_amenities_case_insensitive():
    a = PropertyExtraction(source_files=["brochure.pdf"])
    a.amenities = [ExtractedField(value="Infinity Pool", found=True, confidence=0.9)]
    b = PropertyExtraction(source_files=["pricelist.pdf"])
    b.amenities = [ExtractedField(value="infinity pool", found=True, confidence=0.8)]
    merged = merge_extractions([a, b])
    assert len(merged.amenities) == 1


def test_merge_empty_list_returns_blank_extraction():
    merged = merge_extractions([])
    assert merged.basics.property_name.found is False


def test_same_unit_different_floor_series_stay_separate():
    """One plan sheet draws Unit A twice, mirrored, with genuinely
    different room sizes — collapsing them would lose a real layout."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant("Unit A", "101 to 1101", [("WASH", "11'3\" X 7'9\"")]),
        _variant("Unit A", "102 to 1102", [("WASH", "11'9\" X 7'9\"")]),
    ]
    merged = merge_extractions([e])
    assert len(merged.configurations) == 2
    assert {v.floor_range.value for v in merged.configurations} == {"101 to 1101", "102 to 1102"}


def test_same_variant_split_across_batches_merges_rooms():
    """A plan page can be reported by more than one batch; the human
    should see one layout with all its rooms, not two half-rooms."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant("Unit A", "101 to 1101", [("KITCHEN", "11'9\" X 14'3\"")]),
        _variant("Unit A", "101 to 1101", [("BALCONY", "24'9\" X 5'6\"")]),
    ]
    merged = merge_extractions([e])
    assert len(merged.configurations) == 1
    names = [r.room_name.value for r in merged.configurations[0].rooms]
    assert names == ["KITCHEN", "BALCONY"]


def test_labels_differing_only_by_dash_punctuation_still_merge():
    """The same unit shows up as "Unit - A" on the floor-plan sheet and
    "Unit-A" on the price list — punctuation drift, not two units. Left
    unfolded, they hash to different keys and the human sees the same
    layout twice, each with half its rooms."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant("Unit - A", "", [("KITCHEN", "11'9\" X 14'3\"")]),
        _variant("Unit-A", "", [("BALCONY", "24'9\" X 5'6\"")]),
    ]
    merged = merge_extractions([e])
    assert len(merged.configurations) == 1
    names = [r.room_name.value for r in merged.configurations[0].rooms]
    assert names == ["KITCHEN", "BALCONY"]


def test_repeated_room_names_with_different_sizes_are_kept():
    """A 4 BHK has four BEDROOMs — same label, different sizes. The
    label alone must never collapse them."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant("Unit A", "101 to 1101", [("BEDROOM", "11'9\" X 14'0\"")]),
        _variant("Unit A", "101 to 1101", [("BEDROOM", "12'0\" X 16'0\"")]),
    ]
    merged = merge_extractions([e])
    dims = [r.dimension.value for r in merged.configurations[0].rooms]
    assert dims == ["11'9\" X 14'0\"", "12'0\" X 16'0\""]


def test_position_marker_rows_are_dropped_in_favour_of_real_layouts():
    """A "Typical Plan" marks where units sit on a floor — A-101, B-102
    as bare labels. Those arrive looking like layouts and would bury
    the real ones under a shelf of empty cards."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant("A-101", "", [("BEDROOM", "11'0\" X 12'0\"")]),  # marker: 1 room, nothing else
        _variant("Unit A", "101 to 1101", [
            ("BEDROOM", "11'9\" X 14'0\""), ("KITCHEN", "11'9\" X 14'3\""),
        ]),
    ]
    merged = merge_extractions([e])
    assert [v.variant_label.value for v in merged.configurations] == ["Unit A"]


def test_thin_rows_survive_when_they_are_all_there_is():
    """Dropping every row would leave the human an empty section and no
    way to tell whether extraction failed or the brochure was bare."""
    e = PropertyExtraction(source_files=["pricelist.pdf"])
    e.configurations = [_variant("A-101", ""), _variant("B-102", "")]
    merged = merge_extractions([e])
    assert len(merged.configurations) == 2


def test_a_row_with_only_a_price_is_kept():
    """A price list legitimately carries no rooms at all."""
    e = PropertyExtraction(source_files=["pricelist.pdf"])
    v = _variant("4 BHK Type A", "")
    v.price = ExtractedField(value="45000000", found=True, confidence=0.9)
    e.configurations = [v, _variant("Unit A", "101 to 1101", [
        ("BEDROOM", "11'9\" X 14'0\""), ("KITCHEN", "11'9\" X 14'3\""),
    ])]
    merged = merge_extractions([e])
    assert len(merged.configurations) == 2


def test_rooms_within_one_reported_variant_are_left_alone():
    """A symmetric plan can genuinely show two identically-sized rooms.
    Within a single reported layout we trust the model's reading of the
    drawing — only re-reports of the SAME layout get folded together."""
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        _variant("Unit A", "101 to 1101", [
            ("BEDROOM", "11'0\" X 12'0\""),
            ("BEDROOM", "11'0\" X 12'0\""),
        ]),
    ]
    merged = merge_extractions([e])
    assert len(merged.configurations[0].rooms) == 2

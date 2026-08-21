import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.extractor import _validate_room_dimensions
from app.pdf_reader import PageContent, looks_like_floor_plan
from app.schema import ConfigVariant, ExtractedField, PropertyExtraction, RoomDimension

PLAN_TEXT = (
    "Unit - A\n101 to 1101\nKITCHEN\n11'9\" X 14'3\"\n"
    "BEDROOM\n12'0\" X 17'0\"\nSTORE\n4'3\"X5'0\"\n"
)


def _page(number: int, text: str) -> PageContent:
    return PageContent(
        file_name="brochure.pdf",
        page_number=number,
        text=text,
        ocr_text="",
        image_b64="",
        width=100,
        height=100,
    )


def _with_room(name: str, dim: str, page: int = 13) -> PropertyExtraction:
    e = PropertyExtraction(source_files=["brochure.pdf"])
    e.configurations = [
        ConfigVariant(
            rooms=[
                RoomDimension(
                    room_name=ExtractedField(value=name, found=True, confidence=0.9),
                    dimension=ExtractedField(
                        value=dim, found=True, confidence=0.9,
                        source_page=page, source_file="brochure.pdf",
                    ),
                )
            ]
        )
    ]
    return e


def test_dimension_printed_on_page_passes_untouched():
    e = _with_room("KITCHEN", "11'9\" X 14'3\"")
    _validate_room_dimensions(e, [_page(13, PLAN_TEXT)])
    assert e.warnings == []
    assert e.configurations[0].rooms[0].dimension.confidence == 0.9


def test_spacing_differences_still_count_as_a_match():
    """Brochures are inconsistent about spaces around the X; that is a
    formatting difference, not a misread."""
    e = _with_room("STORE", "4'3\" X 5'0\"")  # page prints 4'3"X5'0"
    _validate_room_dimensions(e, [_page(13, PLAN_TEXT)])
    assert e.warnings == []


def test_dimension_not_on_page_is_flagged_and_downgraded():
    e = _with_room("BEDROOM", "11'9\" X 11'9\"")  # never printed
    _validate_room_dimensions(e, [_page(13, PLAN_TEXT)])
    assert len(e.warnings) == 1
    assert "does not match" in e.warnings[0]
    # Kept, not deleted — the room is probably real, the size needs a human.
    assert e.configurations[0].rooms[0].dimension.found is True
    assert e.configurations[0].rooms[0].dimension.confidence == 0.35


def test_page_without_text_layer_is_not_penalised():
    """Plans whose labels are vector artwork have no text to check
    against; silence there is missing evidence, not a wrong value."""
    e = _with_room("BEDROOM", "11'9\" X 11'9\"")
    _validate_room_dimensions(e, [_page(13, "")])
    assert e.warnings == []
    assert e.configurations[0].rooms[0].dimension.confidence == 0.9


def test_page_with_title_only_text_is_not_penalised():
    """A page can have a text layer (a title, a floor list) without any
    of it being dimension-shaped — the dimensions themselves are baked
    into the plan graphic. That page has no ground truth to check
    against either, same as a fully blank one; treating "has some text"
    as "checkable" would falsely demote every room on it."""
    e = _with_room("BEDROOM", "11'9\" X 11'9\"")
    title_only = "TYPICAL FLOOR PLAN\n(2nd to 5th, 7th to 9th)\nN"
    _validate_room_dimensions(e, [_page(13, title_only)])
    assert e.warnings == []
    assert e.configurations[0].rooms[0].dimension.confidence == 0.9


def test_floor_plan_detected_by_dimension_density():
    dims_only = "KITCHEN\n11'9\" X 14'3\"\n" * 6
    assert looks_like_floor_plan(dims_only) is True
    assert looks_like_floor_plan("KITCHEN\n11'9\" X 14'3\"\n") is False


def test_floor_plan_detected_by_title_when_labels_are_artwork():
    """Plan sheets whose room labels are drawn rather than typed have
    almost no text layer — the title is all we get to go on."""
    assert looks_like_floor_plan("Ground Floor") is True
    assert looks_like_floor_plan("Typical Plan") is True
    assert looks_like_floor_plan("Unit - A\n(101-1101 | 102 - 1102)") is True


def test_photo_spread_is_not_a_floor_plan():
    assert looks_like_floor_plan("Great Outdoors\nSurrounded by posh gentry") is False
    assert looks_like_floor_plan("") is False

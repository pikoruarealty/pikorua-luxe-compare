"""Vision APIs downscale whatever you send them, so a plan sheet delivered as
one big image reaches the model no sharper than a small one — and the
4'3"X5'0" tucked into a corner is simply not resolvable. Magnification has to
come from cropping. These cover the crops themselves and, just as important,
that the model is told they are crops: five pictures of one drawing must not
read as five units."""

import base64
import io
import sys
from pathlib import Path

import fitz
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.extractor import _page_images, _pages_meta_block
from app.pdf_reader import PageContent, render_detail_tiles


@pytest.fixture
def page():
    doc = fitz.open()
    p = doc.new_page(width=1200, height=800)
    p.draw_rect(fitz.Rect(20, 20, 1180, 780), color=(0, 0, 0))
    return p


def _size(b64: str) -> tuple[int, int]:
    return Image.open(io.BytesIO(base64.b64decode(b64))).size


def _make_page(page_number: int, tiles: list[str]) -> PageContent:
    return PageContent(
        file_name="brochure.pdf",
        page_number=page_number,
        text="",
        ocr_text="",
        image_b64="FULL",
        width=100,
        height=100,
        is_floor_plan=bool(tiles),
        detail_tiles=tiles,
    )


def test_a_plan_is_cut_into_a_full_grid(page):
    assert len(render_detail_tiles(page)) == settings.FLOORPLAN_TILE_GRID**2


def test_each_crop_gets_the_whole_pixel_budget(page):
    """The point of a crop is that it is NOT downscaled along with the rest of
    the sheet — it carries a quarter of the drawing at full resolution."""
    for tile in render_detail_tiles(page):
        assert max(_size(tile)) == settings.FLOORPLAN_IMAGE_LONG_SIDE


def test_crops_overlap_so_a_label_on_a_seam_survives(page):
    """A room size printed across a tile boundary has to be whole somewhere."""
    grid, overlap = settings.FLOORPLAN_TILE_GRID, settings.FLOORPLAN_TILE_OVERLAP
    assert overlap > 0, "no overlap means labels can be cut in half"
    tile = render_detail_tiles(page)[0]
    # A corner crop covers its own share of the page plus one overlap margin.
    expected_pts = (page.rect.width / grid) * (1 + overlap)
    assert _size(tile)[0] / _size(tile)[1] == pytest.approx(
        expected_pts / ((page.rect.height / grid) * (1 + overlap)), rel=0.02
    )


def test_tiling_can_be_switched_off(page, monkeypatch):
    monkeypatch.setattr(settings, "FLOORPLAN_TILE_GRID", 1)
    assert render_detail_tiles(page) == []


def test_only_floor_plans_are_tiled():
    marketing = _make_page(3, [])
    assert [label for label, _ in _page_images([marketing])] == ["page 3"]


def test_crops_follow_their_own_page_in_order():
    """The text block promises "the whole sheet, then its close-ups". If the
    images arrived in another order that promise would be a lie."""
    pages = [_make_page(4, []), _make_page(5, ["A", "B"]), _make_page(6, [])]
    assert [label for label, _ in _page_images(pages)] == [
        "page 4",
        "page 5",
        "page 5 close-up 1",
        "page 5 close-up 2",
        "page 6",
    ]


def test_the_model_is_told_the_crops_are_one_drawing():
    """Five pictures of one plan could otherwise read as five units — the
    single most expensive way this could go wrong."""
    block = _pages_meta_block([_make_page(15, ["A", "B", "C", "D"])])
    assert "4 overlapping close-ups" in block
    assert "SAME drawing" in block
    assert "not further units" in block
    assert "report it once" in block


def test_a_page_without_crops_says_nothing_about_them():
    assert "close-up" not in _pages_meta_block([_make_page(2, [])])

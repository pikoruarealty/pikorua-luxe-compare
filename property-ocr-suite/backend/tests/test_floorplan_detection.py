"""Whether a page is recognised as a floor plan decides how many pixels it is
rendered at and whether it gets an LLM call to itself. Getting it wrong is
silent and expensive: one brochure carried no text layer at all, so every one
of its eighteen pages was classified as marketing, its plan sheets went to the
model at photo resolution three to a call, and it returned nine rooms for a
4 BHK — a different nine on every run."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.pdf_reader import looks_like_floor_plan, select_pages

PLAN_TEXT = " ".join([f"BEDROOM {i} 12'0\" X 14'0\"" for i in range(8)])
MARKETING = "A life of quiet luxury, moments from everything that matters."


def test_a_text_layer_full_of_sizes_is_a_plan():
    assert looks_like_floor_plan(PLAN_TEXT) is True


def test_marketing_prose_is_not():
    assert looks_like_floor_plan(MARKETING) is False


def test_line_art_is_a_plan_even_with_no_text_at_all():
    """The reported failure: an image-only brochure. No text, no title, so
    both text checks are blind — the drawing itself has to give it away."""
    assert looks_like_floor_plan("", vector_paths=355) is True
    assert looks_like_floor_plan("", vector_paths=7786) is True


def test_a_photo_page_is_not_promoted_by_its_handful_of_paths():
    """Measured across this project's brochures, marketing pages sit in the
    tens of vector paths. Promoting those would multiply the LLM bill for
    nothing."""
    for paths in (0, 1, 18, 38, 99):
        assert looks_like_floor_plan(MARKETING, vector_paths=paths) is False


def test_the_threshold_is_configurable(monkeypatch):
    monkeypatch.setattr(settings, "FLOORPLAN_VECTOR_PATHS", 1000)
    assert looks_like_floor_plan("", vector_paths=355) is False
    assert looks_like_floor_plan("", vector_paths=1200) is True


def test_line_art_pages_outrank_photography_when_the_budget_is_short():
    """A brochure past the page budget must spend it on the plans. Without the
    vector signal an image-only book ranks every page equally and keeps
    whichever came first — the lifestyle photography at the front."""
    texts = [""] * 10
    paths = [5, 5, 5, 5, 5, 5, 5, 900, 1200, 800]
    assert select_pages(texts, budget=3, vector_paths=paths) == [7, 8, 9]


def test_ranking_is_unchanged_when_no_path_counts_are_given():
    texts = [MARKETING] * 4 + [PLAN_TEXT]
    assert select_pages(texts, budget=2) == [0, 4]


def test_every_page_is_kept_when_it_fits_the_budget():
    assert select_pages([""] * 5, budget=40, vector_paths=[9000] * 5) == [0, 1, 2, 3, 4]

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import _summarise_pages
from app.pdf_reader import select_pages

MARKETING = "An address that redefines luxury living. Surrounded by posh gentry."
AREA_TABLE = "Unit Type\nCarpet Area 3358 sq. ft.\nBalcony\nToilet\n"
PLAN = (
    "Unit - A\n101 to 1101\nKITCHEN\n11'9\" X 14'3\"\nBEDROOM\n12'0\" X 17'0\"\n"
    "STORE\n4'3\"X5'0\"\nTOILET\n6'0\" X 13'0\"\nBALCONY\n8'0\" X 5'0\"\n"
    "DRAWING\n13'11\" X 13'0\"\nDINING\n10'11\"X7'0\"\n"
)


def test_short_document_is_read_whole():
    assert select_pages([MARKETING] * 5, 40) == list(range(5))


def test_budget_of_zero_or_less_is_ignored():
    # A misconfigured budget must not silently read nothing.
    assert select_pages([MARKETING] * 3, 0) == [0, 1, 2]


def test_plans_at_the_back_survive_the_budget():
    """The reported bug: a 57-page brochure whose floor plans sat on pages
    44-51 returned zero configurations, because the reader stopped at 40."""
    texts = [MARKETING] * 43 + [PLAN] * 8 + [MARKETING] * 6
    keep = select_pages(texts, 40)

    assert len(keep) == 40
    for i in range(43, 51):
        assert i in keep, f"plan page {i + 1} was dropped"
    # Document order is preserved so the model still reads front-to-back.
    assert keep == sorted(keep)


def test_area_tables_outrank_marketing_but_yield_to_plans():
    texts = [MARKETING] * 8 + [AREA_TABLE] * 2 + [PLAN] * 2
    keep = select_pages(texts, 4)
    assert keep == [8, 9, 10, 11]


def test_everything_kept_when_budget_exactly_fits():
    texts = [MARKETING] * 39 + [PLAN]
    assert select_pages(texts, 40) == list(range(40))


def test_summarise_pages_collapses_runs():
    assert _summarise_pages([33, 34, 35, 52, 53, 57]) == "33-35, 52-53, 57"
    assert _summarise_pages([7]) == "7"
    assert _summarise_pages([]) == ""

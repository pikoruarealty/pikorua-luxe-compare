import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import extractor
from app.pdf_reader import PageContent


def _page(number: int, plan: bool = False) -> PageContent:
    return PageContent(
        file_name="brochure.pdf",
        page_number=number,
        text="",
        ocr_text="",
        image_b64="",
        width=10,
        height=10,
        is_floor_plan=plan,
    )


def test_config_row_with_a_page_outside_the_batch_is_demoted(monkeypatch):
    """Batch 1 only ever saw page 1 — a "page": 7 on one of its own rows
    is a made-up number, not a real source, the way the duplicate-config
    bug produced one."""
    monkeypatch.setattr(
        extractor,
        "_call_llm",
        lambda batch: {
            "configurations": [
                {
                    "variant_label": {
                        "value": "Unit A",
                        "page": 7,
                        "evidence": "Unit A",
                        "confidence": 0.9,
                    },
                    "rooms": [
                        {
                            "room_name": {
                                "value": "KITCHEN",
                                "page": 1,
                                "evidence": "KITCHEN",
                                "confidence": 0.9,
                            },
                            "dimension": {
                                "value": "11'9\" X 14'3\"",
                                "page": 7,
                                "evidence": "11'9\" X 14'3\"",
                                "confidence": 0.9,
                            },
                        }
                    ],
                }
            ]
        },
    )
    result = extractor.extract_from_pages([_page(1, plan=True)], "brochure.pdf")
    variant = result.configurations[0]
    assert variant.variant_label.confidence <= 0.35
    assert variant.variant_label.validation_warning is not None
    dimension = variant.rooms[0].dimension
    assert dimension.confidence <= 0.35
    assert dimension.validation_warning is not None
    # The room name's own page (1) was in the batch — untouched.
    assert variant.rooms[0].room_name.confidence == 0.9


def test_config_row_with_pages_inside_the_batch_is_untouched(monkeypatch):
    monkeypatch.setattr(
        extractor,
        "_call_llm",
        lambda batch: {
            "configurations": [
                {
                    "variant_label": {
                        "value": "Unit A",
                        "page": 1,
                        "evidence": "Unit A",
                        "confidence": 0.9,
                    },
                    "rooms": [
                        {
                            "room_name": {
                                "value": "KITCHEN",
                                "page": 1,
                                "evidence": "KITCHEN",
                                "confidence": 0.9,
                            },
                            "dimension": {
                                "value": "11'9\" X 14'3\"",
                                "page": 1,
                                "evidence": "11'9\" X 14'3\"",
                                "confidence": 0.9,
                            },
                        }
                    ],
                }
            ]
        },
    )
    result = extractor.extract_from_pages([_page(1, plan=True)], "brochure.pdf")
    variant = result.configurations[0]
    assert variant.variant_label.confidence == 0.9
    assert variant.variant_label.validation_warning is None
    assert variant.rooms[0].dimension.confidence == 0.9


def test_provenance_check_does_not_flag_an_earlier_batchs_row(monkeypatch):
    """Two plan pages, two batches. Batch 1's row is only ever compared
    against batch 1's own pages, never against batch 2's. Batches run
    concurrently, so the fake keys its response off the page it was
    actually given rather than call order."""

    def per_batch(batch):
        page = batch[0].page_number
        label = "Unit A" if page == 1 else "Unit B"
        return {
            "configurations": [
                {
                    "variant_label": {
                        "value": label,
                        "page": page,
                        "evidence": label,
                        "confidence": 0.9,
                    },
                    "rooms": [],
                }
            ]
        }

    monkeypatch.setattr(extractor, "_call_llm", per_batch)
    result = extractor.extract_from_pages(
        [_page(1, plan=True), _page(2, plan=True)], "brochure.pdf"
    )
    labels = {v.variant_label.value: v.variant_label.confidence for v in result.configurations}
    assert labels == {"Unit A": 0.9, "Unit B": 0.9}

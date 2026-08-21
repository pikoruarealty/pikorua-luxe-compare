import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import extractor
from app.pdf_reader import PageContent

# Under OpenAI's strict json_schema mode every declared key is
# "required" — the model can no longer omit a section/field it found
# nothing for, it must return it present-but-null instead. This is the
# full-shape response a strict call now sends back for a page with
# nothing but one amenity on it: everything else explicitly null
# rather than absent.
STRICT_SHAPE_MOSTLY_NULL = {
    "basics": {
        "property_name": None,
        "developer": None,
        "category": None,
        "status": None,
        "possession": None,
        "possession_confirmed_as_of": None,
        "location": None,
        "city": None,
        "state": None,
        "tagline": None,
        "expert_note": None,
    },
    "project_structure": None,
    "rera": None,
    "construction_amenities": None,
    "developer_info": None,
    "configurations": [
        {
            "bhk_type": {"value": None, "page": None, "evidence": None, "confidence": None},
            "variant_label": None,
            "floor_range": None,
            "carpet_area": None,
            "built_up_area": None,
            "super_built_up_area": None,
            "price": None,
            "rate_per_sqft": None,
            "rooms": [{"room_name": None, "dimension": None}],
        }
    ],
    "amenities": [
        {"value": "Gym", "page": 1, "evidence": "Gym", "confidence": 0.9},
    ],
    "highlights": None,
}


def _page(number: int) -> PageContent:
    return PageContent(
        file_name="brochure.pdf",
        page_number=number,
        text="",
        ocr_text="",
        image_b64="",
        width=10,
        height=10,
    )


def test_present_but_null_strict_shape_is_read_like_omitted_keys(monkeypatch):
    """Nothing in the parsing path should care whether a key is
    missing or present-and-null — both mean "the model found nothing
    here". A wholly-null configurations row (bhk_type present-but-null,
    a room whose name/dimension are both null) must not produce a
    phantom configuration or room on the result."""
    monkeypatch.setattr(extractor, "_call_llm", lambda batch: STRICT_SHAPE_MOSTLY_NULL)
    result = extractor.extract_from_pages([_page(1)], "brochure.pdf")

    assert result.basics.property_name.found is False
    assert [a.value for a in result.amenities] == ["Gym"]
    # A config row with every field null and a room with neither a
    # name nor a dimension carries nothing a human could verify.
    assert result.configurations == [] or all(
        not c.bhk_type.found and c.rooms == [] for c in result.configurations
    )

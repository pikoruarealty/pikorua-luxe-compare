"""No API key needed. Run: python tests/test_offline.py

Feeds two fake 'brochure' payloads (they disagree on floor count and
spell the same amenity differently) through normalise -> merge and
checks the record that comes out is what the form expects.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from brochure_extractor.merger import merge  # noqa: E402
from brochure_extractor.normalizer import normalize_payload  # noqa: E402
from brochure_extractor.schema import build_json_schema, empty_payload  # noqa: E402


def _blank(**overrides):
    payload = empty_payload()
    payload["evidence"] = []
    payload.pop("images", None)
    for section, values in overrides.items():
        if section in payload and isinstance(payload[section], dict):
            payload[section].update(values)
        else:
            payload[section] = values
    return payload


BROCHURE = _blank(
    basics={
        "property_name": "  Ikebana ", "developer": "Gala", "category": "Apartment",
        "status": "Near Possession", "possession": "9 Months",
        "possession_confirmed_as_of": "12 March 2026",
        "location": "Sindhu Bhavan Road", "city": "Ahmedabad", "state": "Gujarat",
        "tagline": "Where light lives.",
    },
    project_structure={
        "plot_size": "5,400 Sq.Ft.", "available_bhk_types": ["4, 5 BHK"],
        "total_towers": "3", "total_floors": "25", "units_per_floor": 4, "total_units": "96",
    },
    construction_amenities={"clubhouse_size": "15,000 SQ.FT.", "lifts_per_tower": "3 lifts"},
    configurations=[
        {"bhk_type": "4", "variant_name": "Type A", "carpet_area": "2,450 Sq.Ft.",
         "built_up_area": None, "super_built_up_area": "3200 sqft", "bathrooms": 4,
         "balconies": 2, "servant_room": "Yes", "price": "Rs 3.75 Cr",
         "price_per_sqft": None, "floor_plan_page": 12},
        {"bhk_type": "4 BHK", "variant_name": "Type B", "carpet_area": "2700 sq ft",
         "built_up_area": None, "super_built_up_area": None, "bathrooms": 4,
         "balconies": 2, "servant_room": "Yes", "price": None,
         "price_per_sqft": None, "floor_plan_page": 13},
    ],
    amenities=["Gym, Yoga Deck & Spa", "Infinity Pool", "infinity pool"],
    highlights=["Handover within 9 months"],
    evidence=[
        {"field": "basics.property_name", "page": 1, "snippet": "IKEBANA", "confidence": 0.98},
        {"field": "project_structure.total_floors", "page": 4, "snippet": "25 floors", "confidence": 0.55},
        {"field": "basics.city", "page": 1, "snippet": "Ahmedabad", "confidence": 0.95},
    ],
    document_kind="brochure",
)
BROCHURE["_source"] = {"file": "ikebana-brochure.pdf", "chunk": 0, "pages": [1, 2, 3, 4, 5, 6]}

RERA = _blank(
    basics={"property_name": "Ikebana", "developer": "Gala Group", "city": "Ahmedabad"},
    project_structure={"total_floors": 24, "total_units": 96},
    rera_approvals={
        "rera_id": "pr / gj / ahmedabad / auda / raa12345 / ex1",
        "rera_link": "gujrera.gujarat.gov.in/project/12345",
        "proposed_start_date": "Jan 2025",
    },
    evidence=[
        {"field": "project_structure.total_floors", "page": 1, "snippet": "No. of floors: 24", "confidence": 0.93},
        {"field": "rera_approvals.rera_id", "page": 1, "snippet": "PR/GJ/...", "confidence": 0.97},
        {"field": "basics.developer", "page": 1, "snippet": "Gala Group", "confidence": 0.9},
    ],
    document_kind="rera_certificate",
)
RERA["_source"] = {"file": "rera-certificate.pdf", "chunk": 0, "pages": [1]}


def check(label, condition, actual=None):
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + ("" if condition else f"  -> got {actual!r}"))
    return condition


def main() -> int:
    schema = build_json_schema()
    ok = True

    print("\nschema")
    ok &= check("strict: required covers every property",
                set(schema["required"]) == set(schema["properties"]))
    ok &= check("configurations is an array of objects",
                schema["properties"]["configurations"]["items"]["type"] == "object")

    merged = merge([normalize_payload(BROCHURE) | {"_source": BROCHURE["_source"],
                                                   "document_kind": BROCHURE["document_kind"]},
                    normalize_payload(RERA) | {"_source": RERA["_source"],
                                               "document_kind": RERA["document_kind"]}])
    prop = merged["property"]

    print("\nnormalisation")
    ok &= check("name trimmed", prop["basics"]["property_name"] == "Ikebana", prop["basics"]["property_name"])
    ok &= check("date -> dd-mm-yyyy", prop["basics"]["possession_confirmed_as_of"] == "12-03-2026",
                prop["basics"]["possession_confirmed_as_of"])
    ok &= check("area unit normalised", prop["project_structure"]["plot_size"] == "5400 sq ft",
                prop["project_structure"]["plot_size"])
    ok &= check("'4, 5 BHK' split", prop["project_structure"]["available_bhk_types"] == ["4 BHK", "5 BHK"],
                prop["project_structure"]["available_bhk_types"])
    ok &= check("'3 lifts' -> 3", prop["construction_amenities"]["lifts_per_tower"] == 3,
                prop["construction_amenities"]["lifts_per_tower"])
    ok &= check("RERA id cleaned", prop["rera_approvals"]["rera_id"] == "PR/GJ/AHMEDABAD/AUDA/RAA12345/EX1",
                prop["rera_approvals"]["rera_id"])
    ok &= check("bare RERA link gets https", str(prop["rera_approvals"]["rera_link"]).startswith("https://"),
                prop["rera_approvals"]["rera_link"])
    ok &= check("amenities split + deduped", prop["amenities"] == ["Gym", "Yoga Deck", "Spa", "Infinity Pool"],
                prop["amenities"])

    print("\nmerge")
    ok &= check("RERA wins the floor-count fight", prop["project_structure"]["total_floors"] == 24,
                prop["project_structure"]["total_floors"])
    ok &= check("conflict recorded for review",
                any(c["field"] == "project_structure.total_floors" for c in merged["conflicts"]))
    ok &= check("two 4 BHK layouts kept separate", len(prop["configurations"]) == 2,
                len(prop["configurations"]))
    ok &= check("price normalised", prop["configurations"][0]["price"] == "\u20b9 3.75 Cr",
                prop["configurations"][0]["price"])
    ok &= check("provenance attached",
                merged["field_meta"]["rera_approvals.rera_id"]["source"]["file"] == "rera-certificate.pdf")
    ok &= check("missing required flagged", "basics.status" not in merged["missing_required"])
    ok &= check("completeness computed", merged["completeness"]["percent"] > 0,
                merged["completeness"])

    print("\nform payload")
    from brochure_extractor.pipeline import to_form_payload

    prop.setdefault("images", {})
    flat = to_form_payload(prop)
    ok &= check("flat keys match form", flat["property_name"] == "Ikebana" and "rera_id" in flat)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "examples", "sample_output.json")
    with open(out, "w", encoding="utf-8") as handle:
        json.dump({**merged, "form_payload": flat}, handle, indent=2, ensure_ascii=False)
    print(f"\nwrote {os.path.normpath(out)}")

    print("\n" + ("ALL PASS" if ok else "SOME CHECKS FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

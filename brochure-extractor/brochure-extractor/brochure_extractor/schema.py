"""
Single source of truth for the Add Property form.

Everything else (LLM JSON schema, normalisation, merging, TS types)
is generated from FORM below, so adding a field = editing one place.

spec keys
---------
type : "string" | "integer" | "string[]"
norm : how normalizer.py cleans the value
       text | int | date | url | rera | money | area | list
desc : sent to the model as the field description (drives accuracy)
"""

from __future__ import annotations

# ---------------------------------------------------------------- form spec

FORM: dict[str, list[dict]] = {
    "basics": [
        {"name": "property_name", "type": "string", "norm": "text",
         "desc": "Project / property name only, e.g. 'Ikebana'. Exclude the builder name and words like 'Residences'/'Phase' unless part of the brand."},
        {"name": "developer", "type": "string", "norm": "text",
         "desc": "Builder / developer group name, e.g. 'Gala'. Usually on the cover or the 'about the developer' page."},
        {"name": "category", "type": "string", "norm": "text",
         "desc": "One of: Apartment, Villa, Penthouse, Plot, Row House, Commercial, Mixed Use."},
        {"name": "status", "type": "string", "norm": "text",
         "desc": "Construction/sales status, e.g. 'Under Construction', 'Near Possession', 'Ready to Move In', 'New Launch'."},
        {"name": "possession", "type": "string", "norm": "text",
         "desc": "Possession timeline as printed, e.g. 'Dec 2026', '9 Months', 'RTMI'."},
        {"name": "possession_confirmed_as_of", "type": "string", "norm": "date",
         "desc": "Date the possession claim is dated in the document, dd-mm-yyyy. Use the brochure/RERA print date if given. Null if absent."},
        {"name": "location", "type": "string", "norm": "text",
         "desc": "Locality / road, e.g. 'Sindhu Bhavan Road'. Not the full postal address."},
        {"name": "city", "type": "string", "norm": "text", "desc": "City, e.g. 'Ahmedabad'."},
        {"name": "state", "type": "string", "norm": "text", "desc": "State, e.g. 'Gujarat'."},
        {"name": "tagline", "type": "string", "norm": "text",
         "desc": "Short marketing line printed under the project name on the cover. Max ~12 words."},
        {"name": "expert_note", "type": "string", "norm": "text",
         "desc": "2-3 neutral factual sentences summarising the project for a buyer. Write it yourself from the brochure facts; no hype adjectives."},
    ],
    "project_structure": [
        {"name": "plot_size", "type": "string", "norm": "area",
         "desc": "Total land / plot area with unit, e.g. '5400 sq ft', '2.4 acres'."},
        {"name": "available_bhk_types", "type": "string[]", "norm": "list",
         "desc": "Configurations offered, each as its own item: ['4 BHK', '5 BHK', 'Penthouse']."},
        {"name": "total_towers", "type": "integer", "norm": "int", "desc": "Number of towers/blocks."},
        {"name": "total_floors", "type": "integer", "norm": "int",
         "desc": "Floors above ground in the tallest tower. Exclude basements/podium."},
        {"name": "units_per_floor", "type": "integer", "norm": "int", "desc": "Flats per floor per tower."},
        {"name": "total_units", "type": "integer", "norm": "int", "desc": "Total units in the project."},
    ],
    "rera_approvals": [
        {"name": "rera_id", "type": "string", "norm": "rera",
         "desc": "RERA registration number exactly as printed, e.g. 'PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA12345/EX1'."},
        {"name": "rera_link", "type": "string", "norm": "url",
         "desc": "RERA portal URL if printed, e.g. https://gujrera.gujarat.gov.in/..."},
        {"name": "proposed_start_date", "type": "string", "norm": "text",
         "desc": "Project start date per RERA, e.g. 'Jan 2025'."},
    ],
    "construction_amenities": [
        {"name": "parking_levels", "type": "integer", "norm": "int", "desc": "Number of parking levels/basements."},
        {"name": "podium_structure", "type": "string", "norm": "text", "desc": "e.g. '2-Level Podium', 'No podium'."},
        {"name": "lifts_per_tower", "type": "integer", "norm": "int",
         "desc": "Lifts per tower including service lift if stated."},
        {"name": "open_space", "type": "string", "norm": "text", "desc": "e.g. '70% Open Area'."},
        {"name": "geyser_heat_pump", "type": "string", "norm": "text",
         "desc": "Water heating provision, e.g. 'Yes - instant geyser', 'Central heat pump'."},
        {"name": "vrv_ac", "type": "string", "norm": "text",
         "desc": "AC provision, e.g. 'Yes, VRV in all bedrooms', 'Provision only'."},
        {"name": "window_glasses", "type": "string", "norm": "text",
         "desc": "e.g. 'Double-glazed soundproof', 'Single glazed aluminium'."},
        {"name": "bath_sanitary_fittings", "type": "string", "norm": "text",
         "desc": "Brands from the specification sheet, e.g. 'Kohler, Jaquar'."},
        {"name": "flooring", "type": "string", "norm": "text",
         "desc": "e.g. 'Italian marble in living, vitrified in bedrooms'."},
        {"name": "density_units_per_acre", "type": "integer", "norm": "int",
         "desc": "Units per acre. Compute from total_units / plot area in acres only if both are printed, else null."},
        {"name": "construction_quality", "type": "string", "norm": "text",
         "desc": "Structure spec, e.g. 'RCC framed structure, seismic zone III compliant'."},
        {"name": "internal_ceiling_height", "type": "string", "norm": "text", "desc": "e.g. '10 ft', '3.2 m'."},
        {"name": "clubhouse_size", "type": "string", "norm": "area", "desc": "e.g. '15,000 sq ft'."},
    ],
    "developer_info": [
        {"name": "experience_years", "type": "integer", "norm": "int", "desc": "Years the developer has been operating."},
        {"name": "total_delivered_projects", "type": "integer", "norm": "int", "desc": "Completed projects count."},
        {"name": "ongoing_projects", "type": "integer", "norm": "int", "desc": "Currently under-construction projects count."},
        {"name": "background", "type": "string", "norm": "text",
         "desc": "2-3 sentences about the developer from the 'about us' section."},
        {"name": "notable_delivered_projects", "type": "string[]", "norm": "list",
         "desc": "Named past projects, one per item, e.g. ['Godrej Garden City']."},
    ],
}

# Configuration variants: one row per distinct layout (Type A / Type B ...)
CONFIG_FIELDS = [
    {"name": "bhk_type", "type": "string", "norm": "text",
     "desc": "e.g. '4 BHK', '5 BHK', 'Penthouse', 'Duplex'."},
    {"name": "variant_name", "type": "string", "norm": "text",
     "desc": "Layout label if the brochure distinguishes sizes, e.g. 'Type A'. Null if only one layout for this BHK."},
    {"name": "carpet_area", "type": "string", "norm": "area", "desc": "RERA carpet area with unit, e.g. '2450 sq ft'."},
    {"name": "built_up_area", "type": "string", "norm": "area", "desc": "Built-up area with unit."},
    {"name": "super_built_up_area", "type": "string", "norm": "area", "desc": "Saleable / super built-up area with unit."},
    {"name": "bathrooms", "type": "integer", "norm": "int", "desc": "Bathroom count in this layout."},
    {"name": "balconies", "type": "integer", "norm": "int", "desc": "Balcony / deck count."},
    {"name": "servant_room", "type": "string", "norm": "text", "desc": "'Yes' / 'No' / null."},
    {"name": "price", "type": "string", "norm": "money", "desc": "All-inclusive or base price if printed, e.g. '3.75 Cr'."},
    {"name": "price_per_sqft", "type": "string", "norm": "money", "desc": "Rate per sq ft if printed."},
    {"name": "floor_plan_page", "type": "integer", "norm": "int", "desc": "1-based page number of this layout's floor plan."},
]

IMAGE_SLOTS = ["cover", "living_room", "master_bedroom", "pool", "clubhouse"]

LIST_SECTIONS = {
    "amenities": "Every amenity listed, one per item, cleaned title case, e.g. 'Infinity Pool'.",
    "highlights": "Buyer-facing advantages stated in the brochure, one per item, e.g. 'Handover within 9 months'.",
}


# ------------------------------------------------------------- schema build

def _leaf(spec: dict) -> dict:
    if spec["type"] == "string[]":
        return {"type": "array", "items": {"type": "string"}, "description": spec["desc"]}
    base = "integer" if spec["type"] == "integer" else "string"
    return {"type": [base, "null"], "description": spec["desc"]}


def build_json_schema() -> dict:
    """OpenAI strict-mode JSON schema for one extraction pass."""
    props: dict = {}
    for section, fields in FORM.items():
        props[section] = {
            "type": "object",
            "additionalProperties": False,
            "properties": {f["name"]: _leaf(f) for f in fields},
            "required": [f["name"] for f in fields],
        }

    props["configurations"] = {
        "type": "array",
        "description": "One entry per distinct layout. Same BHK with two sizes = two entries.",
        "items": {
            "type": "object",
            "additionalProperties": False,
            "properties": {f["name"]: _leaf(f) for f in CONFIG_FIELDS},
            "required": [f["name"] for f in CONFIG_FIELDS],
        },
    }

    for key, desc in LIST_SECTIONS.items():
        props[key] = {"type": "array", "items": {"type": "string"}, "description": desc}

    props["evidence"] = {
        "type": "array",
        "description": (
            "One entry for EVERY non-null field you filled. field = dotted path "
            "(e.g. 'basics.property_name', 'configurations[0].carpet_area'). "
            "confidence 0.9+ = printed verbatim, 0.6-0.9 = read from a table/plan, "
            "<0.6 = inferred. Never guess without an evidence row."
        ),
        "items": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "field": {"type": "string"},
                "page": {"type": ["integer", "null"], "description": "1-based page number in this file"},
                "snippet": {"type": ["string", "null"], "description": "Max 15 words copied from the page"},
                "confidence": {"type": "number"},
            },
            "required": ["field", "page", "snippet", "confidence"],
        },
    }

    props["document_kind"] = {
        "type": "string",
        "description": "What this file is: 'brochure' | 'rera_certificate' | 'price_list' | 'floor_plans' | 'spec_sheet' | 'other'.",
    }

    return {
        "type": "object",
        "additionalProperties": False,
        "properties": props,
        "required": list(props.keys()),
    }


def empty_payload() -> dict:
    out = {s: {f["name"]: None for f in fields} for s, fields in FORM.items()}
    out["project_structure"]["available_bhk_types"] = []
    out["developer_info"]["notable_delivered_projects"] = []
    out["configurations"] = []
    for key in LIST_SECTIONS:
        out[key] = []
    out["images"] = {slot: None for slot in IMAGE_SLOTS}
    return out


def spec_for(path: str) -> dict | None:
    """Look up a field spec from a dotted path like 'basics.city'."""
    if path.startswith("configurations"):
        name = path.split(".")[-1]
        return next((f for f in CONFIG_FIELDS if f["name"] == name), None)
    if "." not in path:
        return None
    section, name = path.split(".", 1)
    return next((f for f in FORM.get(section, []) if f["name"] == name), None)

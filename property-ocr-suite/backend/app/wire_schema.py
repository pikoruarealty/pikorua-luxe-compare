"""
The lean shape the model actually returns per field — {value, page,
evidence, confidence} — as opposed to schema.py's ExtractedField, which
also carries state the model never populates (verified, derived,
validation_warning). Kept as its own small model tree so the OpenAI
"strict" json_schema handed to response_format is generated from one
place instead of hand-maintained prose that can silently drift from
what the API is actually enforcing.

FIELD_SCHEMA_HINT in prompts.py stays hand-written: under strict mode
the API itself is what guarantees the shape, so the prompt text's job
is purely to explain what each field MEANS (units, which column, which
qualifier) — content that doesn't reduce to codegen. What this module
guarantees instead is that the hint's section and field names can't
silently diverge from what's actually enforced: test_wire_schema.py
asserts the two name sets match, so an added/renamed/removed field
here fails CI immediately rather than surfacing as a mismatch a human
notices only after a real extraction goes wrong.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field as PydanticField


class WireField(BaseModel):
    value: Optional[str] = None
    page: Optional[int] = None
    evidence: Optional[str] = None
    confidence: Optional[float] = None


class WireRoom(BaseModel):
    room_name: Optional[WireField] = None
    dimension: Optional[WireField] = None


class WireConfigVariant(BaseModel):
    bhk_type: Optional[WireField] = None
    variant_label: Optional[WireField] = None
    floor_range: Optional[WireField] = None
    carpet_area: Optional[WireField] = None
    built_up_area: Optional[WireField] = None
    super_built_up_area: Optional[WireField] = None
    price: Optional[WireField] = None
    rate_per_sqft: Optional[WireField] = None
    rooms: Optional[List[WireRoom]] = None


class WireBasics(BaseModel):
    property_name: Optional[WireField] = None
    developer: Optional[WireField] = None
    category: Optional[WireField] = None
    status: Optional[WireField] = None
    possession: Optional[WireField] = None
    possession_confirmed_as_of: Optional[WireField] = None
    location: Optional[WireField] = None
    city: Optional[WireField] = None
    state: Optional[WireField] = None
    tagline: Optional[WireField] = None
    website: Optional[WireField] = None
    expert_note: Optional[WireField] = None


class WireProjectStructure(BaseModel):
    plot_size: Optional[WireField] = None
    available_bhk_types: Optional[WireField] = None
    total_towers: Optional[WireField] = None
    total_floors: Optional[WireField] = None
    units_per_floor: Optional[WireField] = None
    total_units: Optional[WireField] = None


class WireRera(BaseModel):
    rera_id: Optional[WireField] = None
    rera_link: Optional[WireField] = None
    proposed_start_date: Optional[WireField] = None


class WireConstructionAmenities(BaseModel):
    parking_levels: Optional[WireField] = None
    podium_structure: Optional[WireField] = None
    lifts_per_tower: Optional[WireField] = None
    open_space: Optional[WireField] = None
    geyser_heat_pump: Optional[WireField] = None
    vrv_ac_provided: Optional[WireField] = None
    window_glasses: Optional[WireField] = None
    bath_sanitary_fittings: Optional[WireField] = None
    flooring: Optional[WireField] = None
    density_units_per_acre: Optional[WireField] = None
    construction_quality: Optional[WireField] = None
    internal_ceiling_height: Optional[WireField] = None
    clubhouse_size: Optional[WireField] = None


class WireDeveloperInfo(BaseModel):
    experience_years: Optional[WireField] = None
    total_delivered_projects: Optional[WireField] = None
    ongoing_projects: Optional[WireField] = None
    background: Optional[WireField] = None
    notable_delivered_projects: Optional[List[WireField]] = None


class WireExtraction(BaseModel):
    """Root shape for one batch's response. Every section is optional —
    a batch of marketing-spread pages legitimately has nothing to say
    about `configurations`, say — but under strict mode "optional"
    means "present and null", never "the key is missing"."""

    basics: Optional[WireBasics] = None
    project_structure: Optional[WireProjectStructure] = None
    rera: Optional[WireRera] = None
    construction_amenities: Optional[WireConstructionAmenities] = None
    developer_info: Optional[WireDeveloperInfo] = None
    configurations: Optional[List[WireConfigVariant]] = None
    amenities: Optional[List[WireField]] = None
    highlights: Optional[List[WireField]] = None


def _strictify(node: object) -> object:
    """Turn a Pydantic v2 model_json_schema() tree into one that
    satisfies OpenAI's structured-output "strict" mode: every object
    must list EVERY one of its properties as required (nullability is
    still expressed the normal Pydantic way, via an anyOf/null union on
    the property itself, never by the key being absent), and no object
    accepts a key it didn't declare."""
    if not isinstance(node, dict):
        return node
    if node.get("type") == "object" and "properties" in node:
        node["additionalProperties"] = False
        node["required"] = list(node["properties"].keys())
    for value in node.get("properties", {}).values():
        value.pop("default", None)
        _strictify(value)
    if "items" in node:
        _strictify(node["items"])
    for combinator in ("anyOf", "oneOf", "allOf"):
        for sub in node.get(combinator, []):
            _strictify(sub)
    for sub in node.get("$defs", {}).values():
        _strictify(sub)
    return node


def openai_response_format() -> dict:
    """The `response_format` value for a strict-schema OpenAI chat
    completion, generated fresh from WireExtraction every call — cheap,
    and keeps a stale cached copy from ever being possible."""
    schema = _strictify(WireExtraction.model_json_schema())
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "property_extraction",
            "strict": True,
            "schema": schema,
        },
    }

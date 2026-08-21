import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import wire_schema
from app.prompts import FIELD_SCHEMA_HINT

# Keys that belong to WireField itself (the {value, page, evidence,
# confidence} leaf), not to any section/model — excluded from the
# name-parity check below, which is about section/field names only.
_WIRE_FIELD_KEYS = {"value", "page", "evidence", "confidence"}

_SECTION_MODELS = [
    wire_schema.WireExtraction,
    wire_schema.WireBasics,
    wire_schema.WireProjectStructure,
    wire_schema.WireRera,
    wire_schema.WireConstructionAmenities,
    wire_schema.WireDeveloperInfo,
    wire_schema.WireConfigVariant,
    wire_schema.WireRoom,
]


def test_field_schema_hint_names_match_wire_schema():
    """FIELD_SCHEMA_HINT (prompts.py) is hand-written prose — see
    wire_schema.py's module docstring for why it stays that way even
    though the API's enforced schema is generated. This test is the
    guardrail that keeps the two from silently diverging: every
    section/field name the hint text mentions must be a real field on
    the wire models, and vice versa."""
    expected: set[str] = set()
    for model in _SECTION_MODELS:
        expected |= set(model.model_fields.keys())

    mentioned = set(re.findall(r'"(\w+)":', FIELD_SCHEMA_HINT)) - _WIRE_FIELD_KEYS
    assert mentioned == expected


def test_openai_response_format_is_strict_and_names_match():
    fmt = wire_schema.openai_response_format()
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["strict"] is True
    schema = fmt["json_schema"]["schema"]

    def walk(node):
        if not isinstance(node, dict):
            return
        if node.get("type") == "object" and "properties" in node:
            assert node["additionalProperties"] is False
            assert set(node["required"]) == set(node["properties"].keys())
            for value in node["properties"].values():
                assert "default" not in value
        for value in node.get("properties", {}).values():
            walk(value)
        if "items" in node:
            walk(node["items"])
        for combinator in ("anyOf", "oneOf", "allOf"):
            for sub in node.get(combinator, []):
                walk(sub)
        for sub in node.get("$defs", {}).values():
            walk(sub)

    walk(schema)


def test_openai_response_format_is_freshly_generated_each_call():
    """Regenerated per call rather than a module-level constant, so a
    caller can't accidentally hold and mutate a shared dict."""
    a = wire_schema.openai_response_format()
    b = wire_schema.openai_response_format()
    assert a == b
    assert a["json_schema"]["schema"] is not b["json_schema"]["schema"]

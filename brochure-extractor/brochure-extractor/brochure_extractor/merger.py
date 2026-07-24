"""Combine every chunk of every PDF into one property record.

Two brochures will disagree. The RERA certificate says 24 floors, the
teaser says 25. We keep the higher-evidence value, and hand the loser
back as a conflict so a human can settle it in the admin panel instead
of the data quietly being wrong.
"""

from __future__ import annotations

import re
from collections import defaultdict

from .config import settings
from .normalizer import string_list
from .schema import CONFIG_FIELDS, FORM, LIST_SECTIONS, empty_payload

REQUIRED = [
    "basics.property_name", "basics.developer", "basics.category",
    "basics.location", "basics.city", "basics.state",
    "basics.status", "basics.possession",
    "project_structure.available_bhk_types",
]

# a document type is more trustworthy for some fields than others
SOURCE_WEIGHTS = {
    "rera_certificate": {"rera_approvals": 1.35, "project_structure": 1.15, "basics": 1.05},
    "price_list": {"configurations": 1.25},
    "floor_plans": {"configurations": 1.2},
    "spec_sheet": {"construction_amenities": 1.25},
    "brochure": {},
    "other": {},
}


def _weight(doc_kind: str, field_path: str) -> float:
    section = field_path.split(".")[0].split("[")[0]
    return SOURCE_WEIGHTS.get(doc_kind or "brochure", {}).get(section, 1.0)


def _evidence_index(payload: dict) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for row in payload.get("evidence") or []:
        field = str(row.get("field", "")).strip()
        if not field:
            continue
        try:
            confidence = float(row.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        current = index.get(field)
        if not current or confidence > current["confidence"]:
            index[field] = {
                "confidence": max(0.0, min(1.0, confidence)),
                "page": row.get("page"),
                "snippet": row.get("snippet"),
            }
    return index


def _key(value) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


class _Candidates:
    def __init__(self) -> None:
        self.bucket: dict[str, list[dict]] = defaultdict(list)

    def add(self, field: str, value, meta: dict) -> None:
        if value is None or value == "" or value == []:
            return
        self.bucket[field].append({"value": value, **meta})

    def best(self, field: str) -> tuple[object, dict, list[dict]]:
        rows = self.bucket.get(field) or []
        if not rows:
            return None, {}, []

        grouped: dict[str, dict] = {}
        for row in rows:
            key = _key(row["value"])
            entry = grouped.setdefault(key, {"row": row, "score": 0.0, "votes": 0})
            entry["votes"] += 1
            entry["score"] = max(entry["score"], row["score"])
            # a longer, more specific string wins a tie against a truncated one
            if len(str(row["value"])) > len(str(entry["row"]["value"])) and row["score"] >= entry["row"]["score"]:
                entry["row"] = row

        ranked = sorted(grouped.values(), key=lambda e: (e["score"] + 0.05 * (e["votes"] - 1)), reverse=True)
        winner = ranked[0]["row"]
        meta = {
            "confidence": round(winner["confidence"], 2),
            "source": {"file": winner["file"], "page": winner["page"]},
            "snippet": winner["snippet"],
            "agreement": ranked[0]["votes"],
        }
        others = [
            {
                "value": entry["row"]["value"],
                "confidence": round(entry["row"]["confidence"], 2),
                "source": {"file": entry["row"]["file"], "page": entry["row"]["page"]},
            }
            for entry in ranked[1:]
        ]
        return winner["value"], meta, others


def merge(payloads: list[dict]) -> dict:
    candidates = _Candidates()
    lists: dict[str, list[str]] = defaultdict(list)
    config_rows: list[dict] = []
    files: list[str] = []

    for payload in payloads:
        source = payload.get("_source") or {}
        file_name = source.get("file", "unknown.pdf")
        if file_name not in files:
            files.append(file_name)
        doc_kind = payload.get("document_kind") or "brochure"
        evidence = _evidence_index(payload)

        def meta_for(path: str, fallback_pages=None) -> dict:
            row = evidence.get(path, {})
            confidence = row.get("confidence", 0.5)
            page = row.get("page") or (source.get("pages") or [None])[0]
            return {
                "confidence": confidence,
                "score": confidence * _weight(doc_kind, path),
                "file": file_name,
                "page": page,
                "snippet": row.get("snippet"),
                "doc_kind": doc_kind,
            }

        for section, fields in FORM.items():
            block = payload.get(section) or {}
            for spec in fields:
                path = f"{section}.{spec['name']}"
                value = block.get(spec["name"])
                if spec["type"] == "string[]":
                    lists[path].extend(value or [])
                else:
                    candidates.add(path, value, meta_for(path))

        for key in LIST_SECTIONS:
            lists[key].extend(payload.get(key) or [])

        for index, row in enumerate(payload.get("configurations") or []):
            config_rows.append({"row": row, "meta": meta_for(f"configurations[{index}]"), "doc_kind": doc_kind})

    # ---------------------------------------------------------------- assemble
    result = empty_payload()
    field_meta: dict[str, dict] = {}
    conflicts: list[dict] = []

    for section, fields in FORM.items():
        for spec in fields:
            path = f"{section}.{spec['name']}"
            if spec["type"] == "string[]":
                result[section][spec["name"]] = string_list(
                    lists.get(path, []), split=spec["name"] != "notable_delivered_projects"
                )
                continue
            value, meta, others = candidates.best(path)
            result[section][spec["name"]] = value
            if meta:
                field_meta[path] = {**meta, "alternatives": others}
            if others:
                conflicts.append({"field": path, "chosen": value, "rejected": others})

    for key in LIST_SECTIONS:
        result[key] = string_list(lists.get(key, []), split=key == "amenities")

    result["configurations"] = _merge_configs(config_rows, field_meta, conflicts)

    low_confidence = sorted(
        [path for path, meta in field_meta.items() if meta["confidence"] < settings.min_confidence]
    )
    missing = [path for path in REQUIRED if not _get(result, path)]

    return {
        "property": result,
        "field_meta": field_meta,
        "conflicts": conflicts,
        "needs_review": low_confidence,
        "missing_required": missing,
        "source_files": files,
        "completeness": _completeness(result),
    }


def _merge_configs(rows: list[dict], field_meta: dict, conflicts: list) -> list[dict]:
    """Group layout rows by BHK + variant/area so the same plan seen in two files becomes one row."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for item in rows:
        row = item["row"]
        if not row.get("bhk_type"):
            continue
        variant = row.get("variant_name") or row.get("carpet_area") or row.get("super_built_up_area") or "default"
        groups[f"{_key(row['bhk_type'])}|{_key(variant)}"].append(item)

    merged: list[dict] = []
    for index, (group_key, items) in enumerate(sorted(groups.items())):
        picker = _Candidates()
        for item in items:
            for spec in CONFIG_FIELDS:
                picker.add(spec["name"], item["row"].get(spec["name"]), item["meta"])

        row: dict = {}
        for spec in CONFIG_FIELDS:
            value, meta, others = picker.best(spec["name"])
            row[spec["name"]] = value
            path = f"configurations[{index}].{spec['name']}"
            if meta:
                field_meta[path] = {**meta, "alternatives": others}
            if others:
                conflicts.append({"field": path, "chosen": value, "rejected": others})
        merged.append(row)

    order = {"studio": 0, "1 bhk": 1, "2 bhk": 2, "3 bhk": 3, "4 bhk": 4, "5 bhk": 5, "6 bhk": 6}
    merged.sort(key=lambda r: (order.get(str(r.get("bhk_type", "")).lower(), 90), str(r.get("variant_name") or "")))
    return merged


def _get(payload: dict, path: str):
    node = payload
    for part in path.split("."):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def _completeness(payload: dict) -> dict:
    total = filled = 0
    for section, fields in FORM.items():
        for spec in fields:
            total += 1
            value = payload[section].get(spec["name"])
            if value not in (None, "", []):
                filled += 1
    return {
        "fields_filled": filled,
        "fields_total": total,
        "percent": round(100 * filled / total, 1) if total else 0.0,
        "configurations_found": len(payload.get("configurations") or []),
        "amenities_found": len(payload.get("amenities") or []),
    }

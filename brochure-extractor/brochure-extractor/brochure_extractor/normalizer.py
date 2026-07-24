"""Cleans raw model output into what the Add Property form expects."""

from __future__ import annotations

import re
from datetime import datetime

from .schema import CONFIG_FIELDS, FORM, LIST_SECTIONS

_WS = re.compile(r"\s+")
_JUNK = {"", "-", "--", "n/a", "na", "nil", "none", "not specified", "not mentioned",
         "not available", "tbd", "null", "unknown", "?"}

_DATE_FORMATS = [
    "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d %b %Y", "%d %B %Y",
    "%b %d, %Y", "%B %d, %Y", "%d.%m.%Y", "%m/%d/%Y",
]

_AREA_UNITS = [
    (r"\bsq\.?\s*ft\.?\b|\bsqft\b|\bsq\.?\s*feet\b|\bsft\b", "sq ft"),
    (r"\bsq\.?\s*m\.?\b|\bsqm\b|\bsq\.?\s*meters?\b", "sq m"),
    (r"\bsq\.?\s*yd\.?\b|\bsq\.?\s*yards?\b", "sq yd"),
    (r"\bacres?\b", "acres"),
]


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and value.strip().lower() in _JUNK)


def text(value):
    if _blank(value):
        return None
    out = _WS.sub(" ", str(value)).strip(" .,;:-\u2013\u2014")
    return out or None


def integer(value):
    if _blank(value):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    match = re.search(r"\d[\d,]*", str(value))
    if not match:
        return None
    try:
        return int(match.group(0).replace(",", ""))
    except ValueError:
        return None


def date(value):
    """-> dd-mm-yyyy, or the cleaned string if only a month/year is printed."""
    if _blank(value):
        return None
    raw = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).strftime("%d-%m-%Y")
        except ValueError:
            continue
    for fmt in ("%b %Y", "%B %Y", "%m-%Y", "%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("01-%m-%Y")
        except ValueError:
            continue
    return text(raw)


def url(value):
    out = text(value)
    if not out:
        return None
    out = out.replace(" ", "")
    if not out.startswith(("http://", "https://")):
        if "." not in out:
            return None
        out = "https://" + out.lstrip("/")
    return out


def rera(value):
    out = text(value)
    if not out:
        return None
    out = re.sub(r"\s*/\s*", "/", out.upper())
    return _WS.sub(" ", out)


def area(value):
    out = text(value)
    if not out:
        return None
    low = out.lower()
    for pattern, canonical in _AREA_UNITS:
        low = re.sub(pattern, canonical, low)
    low = re.sub(r"(\d),(?=\d{3}\b)", r"\1", low)  # 2,450 -> 2450
    return _WS.sub(" ", low).strip()


def money(value):
    out = text(value)
    if not out:
        return None
    out = re.sub(r"\bcrs?\b|\bcrore[s]?\b", "Cr", out, flags=re.I)
    out = re.sub(r"\blacs?\b|\blakhs?\b|\blacks?\b", "Lakh", out, flags=re.I)
    out = re.sub(r"\brs\.?\b|\binr\b", "\u20b9", out, flags=re.I)
    return _WS.sub(" ", out).strip()


_SPLIT = re.compile(r"\s*(?:[,;\u2022\u00b7\|]|\s&\s|\sand\s)\s*", re.I)


def string_list(value, *, split: bool = True) -> list[str]:
    if value is None:
        return []
    items = value if isinstance(value, list) else [value]
    out: list[str] = []
    for item in items:
        if _blank(item):
            continue
        parts = _SPLIT.split(str(item)) if split else [str(item)]
        for part in parts:
            cleaned = text(part)
            if cleaned and (len(cleaned) > 1 or cleaned.isdigit()):
                out.append(cleaned)
    return _dedupe(out)


def _dedupe(items: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for item in items:
        key = re.sub(r"[^a-z0-9]", "", item.lower())
        if key and key not in seen:
            seen[key] = item
    return list(seen.values())


def bhk_types(value) -> list[str]:
    """['4','5','6 BHK'] or '4, 5, 6 BHK' -> ['4 BHK', '5 BHK', '6 BHK']"""
    out: list[str] = []
    for item in string_list(value):
        low = item.lower()
        if any(word in low for word in ("penthouse", "duplex", "villa", "studio", "jodi")):
            out.append(item.title())
            continue
        nums = re.findall(r"\d+(?:\.\d+)?", item)
        if nums:
            out.extend(f"{n} BHK" for n in nums)
        else:
            out.append(item)
    return _dedupe(out)


_NORMALIZERS = {
    "text": text, "int": integer, "date": date, "url": url,
    "rera": rera, "area": area, "money": money, "list": string_list,
}


def _apply(spec: dict, value):
    fn = _NORMALIZERS.get(spec.get("norm", "text"), text)
    if spec["name"] == "available_bhk_types":
        return bhk_types(value)
    if spec["type"] == "string[]":
        return string_list(value, split=spec["name"] != "notable_delivered_projects")
    return fn(value)


def normalize_payload(payload: dict) -> dict:
    """In-place-safe clean of one model payload."""
    out = dict(payload)

    for section, fields in FORM.items():
        block = dict(out.get(section) or {})
        for spec in fields:
            block[spec["name"]] = _apply(spec, block.get(spec["name"]))
        out[section] = block

    configs = []
    for row in out.get("configurations") or []:
        if not isinstance(row, dict):
            continue
        cleaned = {spec["name"]: _apply(spec, row.get(spec["name"])) for spec in CONFIG_FIELDS}
        if cleaned.get("bhk_type"):
            cleaned["bhk_type"] = (bhk_types(cleaned["bhk_type"]) or [cleaned["bhk_type"]])[0]
            configs.append(cleaned)
    out["configurations"] = configs

    for key in LIST_SECTIONS:
        out[key] = string_list(out.get(key), split=key == "amenities")

    out["evidence"] = [e for e in (out.get("evidence") or []) if isinstance(e, dict) and e.get("field")]
    return out

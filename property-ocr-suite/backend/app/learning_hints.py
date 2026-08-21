"""
Per-developer review corrections, fed back as hints on that developer's
next brochure — Phase 4(e) of the implementation plan.

Every field a reviewer changes between the OCR draft and what they finally
submit is one correction: (developer, format_fingerprint, field, extracted,
corrected, page). Corrections are appended to a JSONL file per developer
under settings.HINTS_DIR and read back at the start of the NEXT extraction
for that same developer, folded into the system prompt as a short list of
"this developer's brochures have tripped on this before" notes.

This is a nudge, not a rule: the model still reads the actual pages and can
disagree with a stale hint. Nothing here changes what gets auto-accepted —
cross_field_validators.py and the confidence floor still gate that.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .config import settings

log = logging.getLogger("learning_hints")

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _safe_key(developer_name: str) -> str:
    """Filesystem-safe stand-in for a developer name — collapses whatever
    punctuation/casing a reviewer typed into one stable file per developer,
    without ever using the raw string as a path component."""
    slug = _SLUG_RE.sub("-", developer_name.strip().lower()).strip("-")
    return slug or "unknown-developer"


def format_fingerprint(source_file_count: int, total_pages: int) -> str:
    """Coarse proxy for "which template this developer's brochure used" —
    not a content hash, just a bucket. A 6-page single-sheet flyer and a
    45-page full catalogue are different documents worth different hints
    even from the same developer; two catalogues that both land in the same
    page-count band are treated as the same format. Deliberately simple:
    a real layout fingerprint would need the page structure this module
    never sees, and a wrong-but-honest bucket beats a precise-looking one
    that isn't."""
    if total_pages <= 10:
        band = "1-10p"
    elif total_pages <= 25:
        band = "11-25p"
    elif total_pages <= 40:
        band = "26-40p"
    else:
        band = "40p+"
    return f"{source_file_count}f-{band}"


@dataclass(frozen=True)
class Correction:
    field: str
    corrected: str
    extracted: str | None
    page: int | None
    job_id: str
    format_fingerprint: str
    recorded_at: float


def _hints_path(developer_name: str) -> Path:
    return settings.HINTS_DIR / f"{_safe_key(developer_name)}.jsonl"


def record_corrections(
    developer_name: str,
    format_fingerprint_value: str,
    job_id: str,
    corrections: list[dict[str, Any]],
) -> int:
    """Appends one line per correction. `corrections` items need "field" and
    "corrected"; "extracted" and "page" are optional (a gap-fill has no
    prior extracted value). Returns how many were written — callers treat
    this as best-effort telemetry, not something to fail the review over."""
    if not developer_name or not corrections:
        return 0
    written = 0
    path = _hints_path(developer_name)
    with path.open("a", encoding="utf-8") as handle:
        for raw in corrections:
            field = str(raw.get("field") or "").strip()
            corrected = str(raw.get("corrected") or "").strip()
            if not field or not corrected:
                continue
            extracted = raw.get("extracted")
            record = Correction(
                field=field,
                corrected=corrected,
                extracted=str(extracted).strip() if extracted else None,
                page=raw.get("page"),
                job_id=job_id,
                format_fingerprint=format_fingerprint_value,
                recorded_at=time.time(),
            )
            handle.write(json.dumps(asdict(record)) + "\n")
            written += 1
    if written:
        log.info("Recorded %d correction(s) for developer %r", written, developer_name)
    return written


def _read_corrections(developer_name: str) -> list[Correction]:
    path = _hints_path(developer_name)
    if not path.exists():
        return []
    out: list[Correction] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(Correction(**json.loads(line)))
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def get_hint_text(developer_name: str | None, limit: int | None = None) -> str | None:
    """Most recent correction per field, newest-first, folded into a short
    prompt addendum. None when there's nothing to say — an empty hint block
    would just be noise in the system prompt."""
    if not developer_name:
        return None
    corrections = _read_corrections(developer_name)
    if not corrections:
        return None

    latest_by_field: dict[str, Correction] = {}
    for correction in corrections:
        latest_by_field[correction.field] = correction
    ordered = sorted(latest_by_field.values(), key=lambda c: c.recorded_at, reverse=True)
    ordered = ordered[: limit or settings.LEARNING_HINTS_LIMIT]
    if not ordered:
        return None

    lines = [
        f"Notes from reviewing this developer's past brochures — check these fields "
        f"especially carefully, they were corrected before:"
    ]
    for c in ordered:
        if c.extracted:
            lines.append(f'- "{c.field}": was misread as "{c.extracted}", should read like "{c.corrected}"')
        else:
            lines.append(f'- "{c.field}": was previously missed — look for it before leaving it out')
    return "\n".join(lines)

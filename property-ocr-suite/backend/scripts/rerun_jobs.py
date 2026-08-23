"""Re-run the OCR pipeline over brochures whose first extraction came back thin.

Drives `main._run_extraction` rather than reimplementing it: the point of a
re-run is to exercise the same code the upload endpoint does, so a result that
looks good here is a result the portal would have produced.

Jobs are rewritten in place under their existing ids — the images directory,
the citations and every downstream script are keyed on those — so each job file
is copied to `<id>.json.bak-<stamp>` first. Nothing else is touched.

Usage (from property-ocr-suite/backend, with .venv active):
    python -m scripts.rerun_jobs 012a87f61db9 48e01deba85e ...
"""

from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main  # noqa: E402
from app.config import settings  # noqa: E402


def source_pdf_for(job_id: str) -> tuple[Path, str]:
    payload = json.loads((settings.JOB_DIR / f"{job_id}.json").read_text(encoding="utf-8"))
    sources = payload.get("source_files") or []
    if len(sources) != 1:
        raise SystemExit(f"{job_id}: expected exactly one source file, got {sources!r}")
    label = sources[0]
    path = main._resolve_source_pdf(job_id, label)
    if path is None:
        raise SystemExit(f"{job_id}: cannot find the PDF for {label!r}")
    return path, label


def rerun(job_id: str) -> None:
    path, label = source_pdf_for(job_id)
    job_file = settings.JOB_DIR / f"{job_id}.json"
    backup = job_file.with_suffix(f".json.bak-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(job_file, backup)

    images = settings.JOB_DIR.parent / "images" / job_id
    images.mkdir(parents=True, exist_ok=True)

    print(f"\n=== {job_id}  {label}", flush=True)
    started = time.time()
    main._run_extraction(job_id, [(path, label)], images)
    progress = main._get_progress(job_id) or {}

    payload = json.loads(job_file.read_text(encoding="utf-8"))
    configurations = payload.get("configurations") or []
    rooms = sum(len(c.get("rooms") or []) for c in configurations)
    print(
        f"    {progress.get('status')} in {time.time() - started:.0f}s — "
        f"{len(configurations)} configuration(s), {rooms} room(s)"
    )
    for warning in payload.get("warnings") or []:
        print(f"    warning: {warning.encode('ascii', 'replace').decode()}")
    if progress.get("error"):
        print(f"    error: {progress['error']}")
    # A re-run that lost ground is worth saying out loud; the backup is the
    # way back, and only a human should decide to keep the thinner result.
    before = json.loads(backup.read_text(encoding="utf-8")).get("configurations") or []
    if len(configurations) < len(before):
        print(f"    REGRESSED: was {len(before)} configuration(s). Backup at {backup.name}")


if __name__ == "__main__":
    job_ids = sys.argv[1:]
    if not job_ids:
        raise SystemExit(__doc__)
    print(
        f"MAX_PAGES_PER_DOC={settings.MAX_PAGES_PER_DOC} "
        f"LLM_CALL_TIMEOUT_SECONDS={settings.LLM_CALL_TIMEOUT_SECONDS}"
    )
    for job_id in job_ids:
        rerun(job_id)

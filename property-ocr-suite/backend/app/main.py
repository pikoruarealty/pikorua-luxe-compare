"""
FastAPI service exposing the OCR pipeline.

Endpoints:
  POST /api/properties/extract
      Upload 1+ PDF brochures for one property. Saves the files and
      kicks off extraction as a background task, returning a job_id
      immediately — page rendering + vision-LLM calls take tens of
      seconds to a few minutes, so the frontend polls progress instead
      of blocking on one long request.

  GET  /api/properties/{job_id}/progress
      Poll while a job is running: batches done/total and status
      (queued -> processing -> done|error). Once status is "done",
      GET /api/properties/{job_id} has the full result.

  GET  /api/properties/{job_id}
      Re-fetch a previously extracted job (e.g. on page reload).

  PATCH /api/properties/{job_id}
      Save the human-reviewed version — ticked/unticked verification
      state and any manual edits — back over the extracted draft.
      This is what "Create property" ultimately calls before handing
      off to the developer portal / main database.

  GET  /api/images/{job_id}/{filename}
      Serve an embedded image candidate pulled from a brochure page.

Auth: every request under /api needs header `X-Service-Key` matching
SERVICE_API_KEY from .env. This is a shared secret between this
service and whatever calls it (your friend's developer portal) — it
is NOT the OpenAI/Anthropic key, and it never touches the LLM.
"""

from __future__ import annotations

import json
import logging
import shutil
import threading
import uuid
from pathlib import Path
from typing import Dict, List

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .config import settings
from .extractor import ExtractionUnavailable, batch_pages, extract_from_pages
from .merger import merge_extractions
from .normalizer import normalize
from .pdf_reader import extract_embedded_images, read_pdf
from .schema import ImageCandidate, PropertyExtraction

log = logging.getLogger("api")

app = FastAPI(title="Property Brochure OCR", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your actual frontend origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_service_key(x_service_key: str | None = Header(default=None)) -> None:
    if not settings.SERVICE_API_KEY:
        return  # no key configured -> auth disabled (local dev convenience)
    if x_service_key != settings.SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Service-Key header")


def _job_path(job_id: str) -> Path:
    return settings.JOB_DIR / f"{job_id}.json"


def _save_job(job_id: str, extraction: PropertyExtraction) -> None:
    # encoding is explicit because Path.write_text defaults to the locale
    # encoding, which on Windows is cp1252 — brochures routinely carry
    # characters it cannot represent (the fl ligature, the rupee sign, curly
    # quotes), and the whole extraction was being lost at the final save.
    _job_path(job_id).write_text(extraction.model_dump_json(indent=2), encoding="utf-8")


def _load_job(job_id: str) -> PropertyExtraction:
    path = _job_path(job_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    return PropertyExtraction.model_validate_json(path.read_text(encoding="utf-8"))


# job_id -> {"status": "queued"|"processing"|"done"|"error", "batches_done": int,
#            "batches_total": int, "current_file": str, "error": str}
# Plain dict + lock, not a queue/db: one process, low volume, and it
# only ever needs to answer "how far along is this job right now".
_progress_lock = threading.Lock()
_progress: Dict[str, dict] = {}
_cancelled_jobs: set[str] = set()


def _set_progress(job_id: str, **kwargs) -> None:
    with _progress_lock:
        _progress.setdefault(job_id, {}).update(kwargs)


def _get_progress(job_id: str) -> dict | None:
    with _progress_lock:
        entry = _progress.get(job_id)
        return dict(entry) if entry is not None else None


def _request_cancel(job_id: str) -> None:
    with _progress_lock:
        _cancelled_jobs.add(job_id)


def _is_cancelled(job_id: str) -> bool:
    with _progress_lock:
        return job_id in _cancelled_jobs


def _run_extraction(job_id: str, saved_paths: List[Path], job_image_dir: Path) -> None:
    try:
        pages_by_file = [(path, read_pdf(path)) for path in saved_paths]
        # Ask the extractor how it will actually split these, rather
        # than recomputing the arithmetic here — floor-plan pages get
        # their own calls, so a plain divide would under-count.
        batches_total = sum(len(batch_pages(pages)) for _, pages in pages_by_file)
        _set_progress(job_id, status="processing", batches_done=0, batches_total=batches_total)

        progress_state = {"done": 0}
        should_cancel = lambda: _is_cancelled(job_id)  # noqa: E731

        def on_batch_done(file_name: str, page_numbers: list) -> None:
            progress_state["done"] += 1
            _set_progress(
                job_id,
                batches_done=progress_state["done"],
                current_file=file_name,
                current_pages=page_numbers,
            )

        per_file_extractions = []
        for path, pages in pages_by_file:
            if should_cancel():
                break
            result = extract_from_pages(
                pages, path.name, on_batch_done=on_batch_done, should_cancel=should_cancel
            )
            result.image_candidates = [
                ImageCandidate(
                    source_file=img.file_name,
                    source_page=img.page_number,
                    image_path=f"/api/images/{job_id}/{img.path.name}",
                    width=img.width,
                    height=img.height,
                )
                for img in extract_embedded_images(path, job_image_dir)
            ]
            per_file_extractions.append(result)

        if should_cancel():
            _set_progress(job_id, status="cancelled")
            return

        merged = merge_extractions(per_file_extractions)
        merged = normalize(merged)
        _save_job(job_id, merged)
        _set_progress(job_id, status="done")
    except ExtractionUnavailable as exc:
        # A known, explainable failure (no credit, bad key) — the user
        # needs the reason, not a stack trace.
        log.warning("Extraction job %s unavailable: %s", job_id, exc)
        _set_progress(job_id, status="error", error=f"the extraction service rejected the request — {exc}")
    except Exception as exc:  # noqa: BLE001
        log.exception("Extraction job %s failed", job_id)
        _set_progress(job_id, status="error", error=str(exc))


@app.post("/api/properties/extract", dependencies=[Depends(require_service_key)])
async def extract_property(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one PDF file")

    job_id = uuid.uuid4().hex[:12]
    job_upload_dir = settings.UPLOAD_DIR / job_id
    job_image_dir = settings.IMAGE_DIR / job_id
    job_upload_dir.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for upload in files:
        if not upload.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"{upload.filename} is not a PDF")
        dest = job_upload_dir / upload.filename
        with dest.open("wb") as f:
            shutil.copyfileobj(upload.file, f)
        saved_paths.append(dest)

    _set_progress(job_id, status="queued", batches_done=0, batches_total=0)
    background_tasks.add_task(_run_extraction, job_id, saved_paths, job_image_dir)
    return {"job_id": job_id}


@app.get("/api/properties/{job_id}/progress", dependencies=[Depends(require_service_key)])
async def get_extraction_progress(job_id: str):
    progress = _get_progress(job_id)
    if progress is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    return progress


@app.post("/api/properties/{job_id}/cancel", dependencies=[Depends(require_service_key)])
async def cancel_extraction(job_id: str):
    # Flips a flag the background task checks between batches — it
    # can't interrupt an LLM call already in flight, but it stops any
    # further ones from starting, so a 7-batch job stops within one
    # batch's worth of time instead of running to completion anyway.
    if _get_progress(job_id) is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    _request_cancel(job_id)
    _set_progress(job_id, status="cancelling")
    return {"job_id": job_id, "status": "cancelling"}


@app.get("/api/properties/{job_id}", dependencies=[Depends(require_service_key)])
async def get_property(job_id: str):
    extraction = _load_job(job_id)
    return {"job_id": job_id, "extraction": json.loads(extraction.model_dump_json())}


class SavePayload(BaseModel):
    extraction: dict


@app.patch("/api/properties/{job_id}", dependencies=[Depends(require_service_key)])
async def save_property(job_id: str, payload: SavePayload):
    # Validate shape, then persist exactly what the human reviewed —
    # this is the human-verified record of truth from this point on.
    validated = PropertyExtraction.model_validate(payload.extraction)
    _save_job(job_id, validated)
    return {"job_id": job_id, "status": "saved"}


@app.get("/api/images/{job_id}/{filename}")
async def get_image(job_id: str, filename: str):
    path = settings.IMAGE_DIR / job_id / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@app.get("/api/health")
async def health():
    return {"status": "ok", "provider": settings.LLM_PROVIDER}

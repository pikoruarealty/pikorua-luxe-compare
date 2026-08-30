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

  GET  /api/properties/{job_id}/page-image?file=&page=
      Render one page of a source PDF on demand, for a reviewer checking
      a citation's snippet against the actual page.

Auth: every request under /api needs header `X-Service-Key` matching
SERVICE_API_KEY from .env. This is a shared secret between this
service and whatever calls it (the developer portal) — it is NOT the
OpenAI/Anthropic key, and it never touches the LLM. The service will
not start without one unless ALLOW_INSECURE_LOCAL=1 says so out loud.

Two routes also accept a short-lived signed ticket, because a browser
has to reach them directly and must never hold the shared key:

  POST /api/properties/extract
      `Authorization: Bearer <expiry>.<hmac>`. Brochures run to tens of
      megabytes and the website is deployed to hosts that cap request
      bodies at a few MB, so the file cannot be relayed through it.

  GET  /api/images/{job_id}/{filename}
  GET  /api/properties/{job_id}/page-image
      `?t=<expiry>.<hmac>`, because an <img> tag cannot send a header.
      Both share the same ticket scope.

The scope is part of the signed message, so the two kinds of ticket are
not interchangeable and neither opens anything else.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from . import learning_hints
from .config import settings
from .cross_field_validators import validate_cross_field
from .extractor import ExtractionUnavailable, batch_pages, extract_from_pages
from .merger import merge_extractions
from .normalizer import normalize
from .pdf_reader import extract_embedded_images, read_pdf, render_page_jpeg
from .schema import ImageCandidate, PropertyExtraction

log = logging.getLogger("api")

app = FastAPI(title="Property Brochure OCR", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["X-Service-Key", "Authorization", "Content-Type"],
)


def _auth_disabled() -> bool:
    """True only when the service was deliberately started without a key.

    config.check_auth_configured() refuses to boot in that state unless
    ALLOW_INSECURE_LOCAL=1, so reaching this is a local-development choice
    rather than a missing environment variable in production."""
    return not settings.SERVICE_API_KEY and settings.ALLOW_INSECURE_LOCAL


def require_service_key(x_service_key: str | None = Header(default=None)) -> None:
    if _auth_disabled():
        return
    # compare_digest, not !=, so the comparison does not leak the key one
    # character at a time through its own timing.
    if not x_service_key or not hmac.compare_digest(x_service_key, settings.SERVICE_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Service-Key header")


def _verify_signed_ticket(token: str, scope: str = "") -> bool:
    """`<unix-expiry>.<hex hmac of scope+expiry>`, signed with the shared key.

    A brochure is tens of megabytes and the website runs on serverless hosts
    that cap request bodies at a few MB, so the file cannot be relayed through
    it — the browser has to reach this service directly. It still must not hold
    the shared key, so the website mints one of these instead: good for minutes,
    useless for anything but the scope it was signed for.

    `scope` is part of the signed message, so a ticket minted to upload a
    brochure will not also open the extracted images, and vice versa."""
    try:
        expiry_str, signature = token.split(".", 1)
        expiry = int(expiry_str)
    except (ValueError, AttributeError):
        return False
    if expiry < int(time.time()):
        return False
    expected = hmac.new(
        settings.SERVICE_API_KEY.encode(), f"{scope}{expiry_str}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


JOB_ID_RE = re.compile(r"^[a-f0-9]{12,32}$")


def _verify_upload_token(token: str, job_id: str) -> bool:
    return bool(JOB_ID_RE.fullmatch(job_id)) and _verify_signed_ticket(
        token, f"upload:{job_id}:"
    )


def require_upload_auth(
    job_id: str | None = Query(default=None),
    x_service_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> None:
    """Upload accepts the shared key OR a short-lived signed token. Only this
    one endpoint does — a leaked token must not also read back other jobs."""
    if _auth_disabled():
        return
    if x_service_key and hmac.compare_digest(x_service_key, settings.SERVICE_API_KEY):
        return
    if job_id and authorization and authorization.startswith("Bearer "):
        if _verify_upload_token(authorization[7:], job_id):
            return
    raise HTTPException(status_code=401, detail="Invalid or missing upload credentials")


def _job_path(job_id: str) -> Path:
    return settings.JOB_DIR / f"{job_id}.json"


def _legacy_job_path(job_id: str) -> Path:
    return settings.LEGACY_STORAGE_DIR / "jobs" / f"{job_id}.json"


def _readable_job_path(job_id: str) -> Path | None:
    for path in (_job_path(job_id), _legacy_job_path(job_id)):
        if path.is_file():
            return path
    return None


def _save_job(job_id: str, extraction: PropertyExtraction) -> None:
    # encoding is explicit because Path.write_text defaults to the locale
    # encoding, which on Windows is cp1252 — brochures routinely carry
    # characters it cannot represent (the fl ligature, the rupee sign, curly
    # quotes), and the whole extraction was being lost at the final save.
    _job_path(job_id).write_text(extraction.model_dump_json(indent=2), encoding="utf-8")


def _load_job(job_id: str) -> PropertyExtraction:
    path = _readable_job_path(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return PropertyExtraction.model_validate_json(path.read_text(encoding="utf-8"))


def _job_meta_path(job_id: str) -> Path:
    return settings.JOB_DIR / f"{job_id}.meta.json"


def _save_job_meta(job_id: str, developer_name: str, fingerprint: str) -> None:
    # Sidecar rather than a PropertyExtraction field: this is bookkeeping for
    # the learning loop (which developer/format this job belongs to), not
    # part of the extracted record itself.
    _job_meta_path(job_id).write_text(
        json.dumps({"developer_name": developer_name, "format_fingerprint": fingerprint}),
        encoding="utf-8",
    )


def _load_job_meta(job_id: str) -> dict | None:
    path = _job_meta_path(job_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _resolve_source_pdf(job_id: str, source_file: str) -> Path | None:
    """Finds the PDF a citation's `source_file` label names.

    Uploads through /api/properties/extract land at
    UPLOAD_DIR/{job_id}/{random-hex}.pdf — the human-readable name is kept
    only as a label, never as the on-disk filename (see extract_property's
    comment on why). Jobs seeded outside that endpoint (a batch/manual run)
    instead keep the original filename under UPLOAD_DIR/manual/, which is
    tried first since it needs no per-job disambiguation."""
    original = Path(source_file).name
    for upload_dir in (settings.UPLOAD_DIR, settings.LEGACY_STORAGE_DIR / "uploads"):
        manual = (upload_dir / "manual" / original).resolve()
        if manual.is_relative_to(upload_dir.resolve()) and manual.is_file():
            return manual
        job_dir = upload_dir / job_id
        if job_dir.is_dir():
            pdfs = sorted(p for p in job_dir.iterdir() if p.suffix.lower() == ".pdf")
            if len(pdfs) == 1:
                return pdfs[0]
    return None


def _download_archived_pdf(job_id: str, destination: Path) -> bool:
    """Fetch a historical brochure only for the duration of page rendering.

    The object name is deterministic, so the old extraction JSON does not
    need a new mutable field just to locate its original source document."""
    if not settings.GCS_PRIVATE_SOURCE_BUCKET or not JOB_ID_RE.fullmatch(job_id):
        return False
    try:
        from google.cloud import storage

        storage.Client().bucket(settings.GCS_PRIVATE_SOURCE_BUCKET).blob(
            f"brochure-archive/legacy/{job_id}/source.pdf"
        ).download_to_filename(destination)
        return True
    except Exception:  # noqa: BLE001
        log.exception("Could not read archived brochure for job %s", job_id)
        return False


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


def _summarise_pages(numbers: List[int]) -> str:
    """"41-57" rather than seventeen comma-separated integers."""
    if not numbers:
        return ""
    runs: List[tuple[int, int]] = []
    start = prev = numbers[0]
    for n in numbers[1:]:
        if n == prev + 1:
            prev = n
            continue
        runs.append((start, prev))
        start = prev = n
    runs.append((start, prev))
    return ", ".join(str(a) if a == b else f"{a}-{b}" for a, b in runs)


def _run_extraction(
    job_id: str,
    saved_paths: List[tuple[Path, str]],
    job_image_dir: Path,
    developer_name: str | None = None,
) -> None:
    """`saved_paths` pairs each stored file with the name the uploader gave it.

    The two differ on purpose: what lands on disk is a generated name, because
    the uploaded one is attacker-controlled, but every message the human reads
    should still say "Prestige Park Grove.pdf" rather than a hex string."""
    try:
        read_warnings: List[str] = []
        pages_by_file = []
        for path, label in saved_paths:
            document = read_pdf(path)
            pages_by_file.append((path, label, document.pages))
            if document.skipped_pages:
                # Never let this be silent. A brochure longer than the page
                # budget is the single likeliest reason an extraction comes
                # back thin, and without this the human blames the model.
                read_warnings.append(
                    f"{label}: {len(document.skipped_pages)} page(s) skipped — over the "
                    f"{settings.MAX_PAGES_PER_DOC}-page limit (pages "
                    f"{_summarise_pages(document.skipped_pages)}). Floor plans and price "
                    f"tables were kept in preference to marketing pages; raise "
                    f"MAX_PAGES_PER_DOC to read the whole document."
                )
        # Ask the extractor how it will actually split these, rather
        # than recomputing the arithmetic here — floor-plan pages get
        # their own calls, so a plain divide would under-count.
        batches_total = sum(len(batch_pages(pages)) for _, _, pages in pages_by_file)
        _set_progress(job_id, status="processing", batches_done=0, batches_total=batches_total)

        total_pages = sum(len(pages) for _, _, pages in pages_by_file)
        fingerprint = learning_hints.format_fingerprint(len(pages_by_file), total_pages)
        hint_text = learning_hints.get_hint_text(developer_name) or ""
        if developer_name:
            _save_job_meta(job_id, developer_name, fingerprint)

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
        for path, label, pages in pages_by_file:
            if should_cancel():
                break
            result = extract_from_pages(
                pages,
                label,
                on_batch_done=on_batch_done,
                should_cancel=should_cancel,
                extra_instructions=hint_text,
            )
            result.image_candidates = [
                ImageCandidate(
                    source_file=img.file_name,
                    source_page=img.page_number,
                    image_path=f"/api/images/{job_id}/{img.path.name}",
                    width=img.width,
                    height=img.height,
                )
                for img in extract_embedded_images(path, job_image_dir, display_name=label)
            ]
            per_file_extractions.append(result)

        if should_cancel():
            _set_progress(job_id, status="cancelled")
            return

        merged = merge_extractions(per_file_extractions)
        merged = normalize(merged)
        validate_cross_field(merged)
        merged.warnings.extend(read_warnings)
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


def _copy_within_limit(upload: UploadFile, dest: Path) -> None:
    """Stream one upload to disk, stopping the moment it exceeds the cap.

    Checked while copying rather than afterwards: the point is to not write an
    unbounded file, and Content-Length is the client's word for it."""
    written = 0
    with dest.open("wb") as handle:
        while chunk := upload.file.read(1024 * 1024):
            written += len(chunk)
            if written > settings.MAX_UPLOAD_BYTES:
                handle.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Each brochure must be under {settings.MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
                )
            handle.write(chunk)


@app.post("/api/properties/extract", dependencies=[Depends(require_upload_auth)])
async def extract_property(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    job_id: str | None = None,
    # Optional: when given, this developer's past review corrections (if
    # any) are folded into the extraction prompt, and this job is tagged so
    # a later POST .../corrections call can record new ones against it.
    developer_name: str | None = Form(default=None),
):
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one PDF file")
    # The browser posts here directly, so the upload screen's own limit is a
    # courtesy rather than a control. Every extra document is another fan-out
    # into per-page vision-LLM calls, billed.
    if len(files) > settings.MAX_FILES:
        raise HTTPException(
            status_code=400, detail=f"Upload at most {settings.MAX_FILES} brochures at once"
        )

    if job_id is None:
        job_id = uuid.uuid4().hex[:12]
    elif not JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    job_upload_dir = settings.UPLOAD_DIR / job_id
    job_image_dir = settings.IMAGE_DIR / job_id
    job_upload_dir.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for upload in files:
        # The multipart filename is attacker-controlled and was previously used
        # as the path component verbatim, so a name like
        # ../../../../app/app/config.pdf wrote straight out of the job
        # directory. The stored name is now generated; the original is kept only
        # as a label, and only after basename() has stripped any path in it.
        original = Path(upload.filename or "").name
        if not original.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"{original or 'file'} is not a PDF")
        dest = job_upload_dir / f"{uuid.uuid4().hex}.pdf"
        _copy_within_limit(upload, dest)
        saved_paths.append((dest, original))

    _set_progress(job_id, status="queued", batches_done=0, batches_total=0)
    background_tasks.add_task(
        _run_extraction, job_id, saved_paths, job_image_dir, developer_name
    )
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


@app.get("/api/properties/summaries", dependencies=[Depends(require_service_key)])
async def get_property_summaries(job_ids: str = Query(...)):
    """Cheap batch lookup backing a "resume" picker: property + developer
    name for many jobs in one call, instead of the caller fetching (and
    re-resolving every image URL of) a full extraction per row just to
    label a dropdown. Reads the job file directly rather than going through
    `_load_job`/`PropertyExtraction` — this only ever needs two string
    fields, and the full model validates every image candidate too.

    Declared ahead of GET /api/properties/{job_id} — FastAPI matches routes
    in declaration order, and "summaries" would otherwise be swallowed as a
    literal job id by that path param."""
    summaries = []
    for job_id in job_ids.split(","):
        job_id = job_id.strip()
        if not JOB_ID_RE.fullmatch(job_id):
            continue
        path = _readable_job_path(job_id)
        if path is None:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        basics = data.get("basics") or {}
        summaries.append(
            {
                "job_id": job_id,
                "property_name": (basics.get("property_name") or {}).get("value"),
                "developer_name": (basics.get("developer") or {}).get("value"),
            }
        )
    return {"summaries": summaries}


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


class Correction(BaseModel):
    field: str
    corrected: str
    extracted: str | None = None
    page: int | None = None


class CorrectionsPayload(BaseModel):
    corrections: List[Correction]


@app.post("/api/properties/{job_id}/corrections", dependencies=[Depends(require_service_key)])
async def record_corrections(job_id: str, payload: CorrectionsPayload):
    """Called once a reviewer's final, human-approved values are known —
    the developer portal diffs what it showed the reviewer against what
    they actually submitted and posts the differences here. Silently a
    no-op for a job that was never tagged with a developer_name (extracted
    before this feature, or the uploader left the field blank): there's
    nothing to learn from an anonymous job, and that isn't the caller's
    fault, so this returns success with recorded=0 rather than a 404."""
    meta = _load_job_meta(job_id)
    if not meta:
        return {"job_id": job_id, "recorded": 0}
    recorded = learning_hints.record_corrections(
        meta["developer_name"],
        meta["format_fingerprint"],
        job_id,
        [c.model_dump() for c in payload.corrections],
    )
    return {"job_id": job_id, "recorded": recorded}


IMAGE_TICKET_SCOPE = "img:"


def require_image_auth(
    x_service_key: str | None = Header(default=None),
    t: str | None = Query(default=None),
) -> None:
    """Images are the one thing a browser loads directly, in an <img> tag that
    cannot carry a header — so this route also accepts a scoped ticket in the
    query string. The website mints it; the shared key stays server-side."""
    if _auth_disabled():
        return
    if x_service_key and hmac.compare_digest(x_service_key, settings.SERVICE_API_KEY):
        return
    if t and _verify_signed_ticket(t, IMAGE_TICKET_SCOPE):
        return
    raise HTTPException(status_code=401, detail="Invalid or missing image credentials")


@app.get("/api/images/{job_id}/{filename}", dependencies=[Depends(require_image_auth)])
async def get_image(job_id: str, filename: str):
    # This was the one route without an auth dependency, contradicting the
    # module docstring above. Extracted brochure pages are a client's unreleased
    # marketing material; anyone holding the URL could read them.
    root = settings.IMAGE_DIR.resolve()
    path = (root / job_id / filename).resolve()
    # Starlette's route matching already rejects the obvious traversal, but the
    # join is the thing actually reaching the filesystem, so it states its own
    # invariant rather than relying on a caller two layers up.
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@app.get("/api/properties/{job_id}/page-image", dependencies=[Depends(require_image_auth)])
async def get_page_image(job_id: str, file: str, page: int):
    """Renders one brochure page on demand, for a reviewer checking a
    citation against the source — not saved anywhere, since it's cheap to
    re-render and would otherwise be one more file per page per job."""
    pdf_path = _resolve_source_pdf(job_id, file)
    if pdf_path is not None:
        try:
            image_bytes = render_page_jpeg(pdf_path, page)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    else:
        with tempfile.TemporaryDirectory(prefix="propcompare-citation-") as directory:
            archived_pdf = Path(directory) / "source.pdf"
            if not _download_archived_pdf(job_id, archived_pdf):
                raise HTTPException(status_code=404, detail="Source PDF not found")
            try:
                image_bytes = render_page_jpeg(archived_pdf, page)
            except ValueError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "provider": settings.LLM_PROVIDER}

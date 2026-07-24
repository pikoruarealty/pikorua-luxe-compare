"""HTTP wrapper — this is what the developer portal talks to.

    POST /v1/extract          multipart files=@a.pdf files=@b.pdf   (sync)
    POST /v1/extract/async    same, returns {job_id}
    GET  /v1/jobs/{job_id}    poll status/result
    GET  /v1/schema           field list, for rendering the form
    GET  /health
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import threading
import traceback
import uuid
from datetime import datetime, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .pipeline import extract_property
from .schema import CONFIG_FIELDS, FORM, IMAGE_SLOTS, LIST_SECTIONS

log = logging.getLogger(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

SERVICE_KEY = os.getenv("SERVICE_API_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
PUBLIC_IMAGE_BASE = os.getenv("PUBLIC_IMAGE_BASE", "/images")

app = FastAPI(title="Brochure Extractor", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(settings.image_out_dir, exist_ok=True)
app.mount("/images", StaticFiles(directory=settings.image_out_dir), name="images")

_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()


def auth(x_api_key: str | None = Header(default=None)) -> None:
    if SERVICE_KEY and x_api_key != SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def _stage(files: list[UploadFile]) -> tuple[str, list[str]]:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one PDF")
    folder = tempfile.mkdtemp(prefix="brochure_")
    paths: list[str] = []
    for upload in files:
        name = os.path.basename(upload.filename or "file.pdf")
        if not name.lower().endswith(".pdf"):
            shutil.rmtree(folder, ignore_errors=True)
            raise HTTPException(status_code=400, detail=f"{name}: only PDF files are accepted")
        path = os.path.join(folder, name)
        with open(path, "wb") as handle:
            shutil.copyfileobj(upload.file, handle)
        paths.append(path)
    return folder, paths


def _run(paths: list[str], with_images: bool) -> dict:
    return extract_property(paths, with_images=with_images, image_url_base=PUBLIC_IMAGE_BASE)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": settings.model,
        "openai_key_loaded": bool(settings.api_key),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/v1/schema")
def get_schema() -> dict:
    return {
        "sections": {name: [{k: v for k, v in f.items()} for f in fields] for name, fields in FORM.items()},
        "configuration_fields": CONFIG_FIELDS,
        "list_sections": list(LIST_SECTIONS),
        "image_slots": IMAGE_SLOTS,
    }


@app.post("/v1/extract", dependencies=[Depends(auth)])
def extract(
    files: list[UploadFile] = File(...),
    with_images: bool = Query(True, description="Pull and auto-label photos from the PDFs"),
):
    folder, paths = _stage(files)
    try:
        return _run(paths, with_images)
    except Exception as exc:  # noqa: BLE001
        log.error("extraction failed: %s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        shutil.rmtree(folder, ignore_errors=True)


@app.post("/v1/extract/async", dependencies=[Depends(auth)])
def extract_async(
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    with_images: bool = Query(True),
) -> dict:
    folder, paths = _stage(files)
    job_id = uuid.uuid4().hex

    with _LOCK:
        _JOBS[job_id] = {
            "status": "queued",
            "files": [os.path.basename(p) for p in paths],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def worker() -> None:
        with _LOCK:
            _JOBS[job_id]["status"] = "running"
        try:
            result = _run(paths, with_images)
            with _LOCK:
                _JOBS[job_id].update(status="done", result=result)
        except Exception as exc:  # noqa: BLE001
            log.error("job %s failed: %s", job_id, traceback.format_exc())
            with _LOCK:
                _JOBS[job_id].update(status="error", error=str(exc))
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    background.add_task(worker)
    return {"job_id": job_id, "status": "queued", "poll": f"/v1/jobs/{job_id}"}


@app.get("/v1/jobs/{job_id}", dependencies=[Depends(auth)])
def job_status(job_id: str) -> dict:
    with _LOCK:
        job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return job

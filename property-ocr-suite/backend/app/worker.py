"""Separate, restart-safe OCR worker process for V2_OCR."""

from __future__ import annotations

import logging
import os
import socket
import tempfile
import time
from pathlib import Path

from .config import settings
from .cross_field_validators import validate_cross_field
from .durable_jobs import GcsPrivateStorage, PostgresJobStore, sha256_file, validate_extraction
from .extractor import batch_pages, extract_from_pages
from .merger import merge_extractions
from .normalizer import normalize
from .pdf_reader import extract_embedded_images, read_pdf
from .schema import ImageCandidate

log = logging.getLogger("durable-ocr-worker")


def process_job(store: PostgresJobStore, objects: GcsPrivateStorage, job) -> None:
    with tempfile.TemporaryDirectory(prefix="propcompare-ocr-") as directory:
        work = Path(directory)
        brochure = work / "source.pdf"
        images = work / "evidence"
        images.mkdir()
        objects.download(job.bucket, job.object_path, brochure)
        if sha256_file(brochure) != job.sha256:
            raise ValueError("document_checksum_mismatch")

        document = read_pdf(brochure)
        batches = batch_pages(document.pages)
        completed = {"count": 0}

        def cancelled() -> bool:
            return store.cancellation_requested(job.id)

        def on_batch_done(_file_name: str, _page_numbers: list) -> None:
            completed["count"] += 1
            store.update_progress(job.id, int(completed["count"] * 90 / max(1, len(batches))))

        extraction = extract_from_pages(
            document.pages,
            job.original_filename,
            on_batch_done=on_batch_done,
            should_cancel=cancelled,
        )
        if cancelled():
            store.cancel(job.id)
            return

        candidates = extract_embedded_images(brochure, images, display_name=job.original_filename)
        extraction.image_candidates = []
        for candidate in candidates:
            object_path = f"ocr-evidence/{job.id}/{candidate.path.name}"
            objects.upload_evidence(job.bucket, object_path, candidate.path)
            extraction.image_candidates.append(
                ImageCandidate(
                    source_file=candidate.file_name,
                    source_page=candidate.page_number,
                    image_path=f"gcs://{job.bucket}/{object_path}",
                    width=candidate.width,
                    height=candidate.height,
                )
            )
        normalized = normalize(merge_extractions([extraction]))
        validate_cross_field(normalized)
        payload = normalized.model_dump(mode="json")
        validation = validate_extraction(payload)
        if not validation.can_continue:
            raise ValueError("hard_validation_failed")
        store.complete(
            job.id,
            payload,
            validation,
            {
                "model": os.getenv(
                    "OCR_MODEL_VERSION",
                    settings.OPENAI_MODEL
                    if settings.LLM_PROVIDER == "openai"
                    else settings.ANTHROPIC_MODEL,
                ),
                "prompt": os.getenv("OCR_PROMPT_VERSION", "property-v1"),
                "parser": os.getenv("OCR_PARSER_VERSION", "pymupdf-v1"),
                "formula": os.getenv("OCR_FORMULA_VERSION", "commercial-bounds-v1"),
            },
        )


def run() -> None:
    database_url = os.environ["DATABASE_URL"]
    worker_id = os.getenv("OCR_WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")
    store = PostgresJobStore(database_url, worker_id)
    objects = GcsPrivateStorage()
    while True:
        job = store.claim()
        if not job:
            time.sleep(float(os.getenv("OCR_IDLE_POLL_SECONDS", "2")))
            continue
        try:
            process_job(store, objects, job)
        except Exception as exc:  # noqa: BLE001
            error_code = str(exc).splitlines()[0][:100] or type(exc).__name__
            log.exception("OCR job %s failed with %s", job.id, error_code)
            store.fail(job, error_code)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    run()

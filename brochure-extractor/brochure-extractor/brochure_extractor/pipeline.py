"""PDFs in -> one form-ready property record out."""

from __future__ import annotations

import logging
import os
import time

from .config import settings
from .extractor import _client, extract_document
from .images import classify, save_images
from .merger import merge
from .normalizer import normalize_payload
from .pdf_reader import load_pdf
from .schema import IMAGE_SLOTS

log = logging.getLogger(__name__)


def extract_property(
    pdf_paths: list[str],
    *,
    with_images: bool | None = None,
    image_out_dir: str | None = None,
    image_url_base: str | None = None,
) -> dict:
    """
    pdf_paths       : 1..N brochures/RERA/price lists for the SAME project
    with_images     : pull + auto-label photos (defaults to EXTRACT_IMAGES)
    image_url_base  : if given, saved images also get a public url
    """
    if not pdf_paths:
        raise ValueError("No PDF supplied")

    started = time.time()
    with_images = settings.extract_images if with_images is None else with_images
    client = _client()

    payloads: list[dict] = []
    photos: list[dict] = []
    per_file: list[dict] = []

    for path in pdf_paths:
        file_started = time.time()
        doc = load_pdf(path)
        chunks = extract_document(doc, client=client)
        chunks = [{**normalize_payload(chunk), "_source": chunk.get("_source"),
                   "document_kind": chunk.get("document_kind")} for chunk in chunks]
        payloads.extend(chunks)

        if with_images:
            photos.extend(doc.embedded_images)

        per_file.append(
            {
                "file": doc.file_name,
                "pages": len(doc.pages),
                "scanned_pages": sum(1 for p in doc.pages if p.scanned),
                "document_kind": next((c.get("document_kind") for c in chunks if c.get("document_kind")), "brochure"),
                "seconds": round(time.time() - file_started, 1),
            }
        )

    result = merge(payloads)

    if with_images and photos:
        saved = save_images(photos, out_dir=image_out_dir)
        for photo, meta in zip(photos, saved):
            photo.update(meta)
        tagged = classify(photos, client=client)
        if image_url_base:
            base = image_url_base.rstrip("/")
            for slot in IMAGE_SLOTS:
                if tagged["images"].get(slot):
                    tagged["images"][slot]["url"] = f"{base}/{tagged['images'][slot]['file_name']}"
            for item in tagged["unassigned"]:
                item["url"] = f"{base}/{item['file_name']}"
        result["property"]["images"] = tagged["images"]
        result["image_pool"] = tagged["unassigned"]
    else:
        result["property"]["images"] = {slot: None for slot in IMAGE_SLOTS}
        result["image_pool"] = []

    result["form_payload"] = to_form_payload(result["property"])
    result["meta"] = {
        "files": per_file,
        "model": settings.model,
        "chunks": len(payloads),
        "seconds": round(time.time() - started, 1),
    }
    return result


def to_form_payload(prop: dict) -> dict:
    """Flat snake_case dict matching the Add Property form 1:1."""
    flat: dict = {}
    for section, block in prop.items():
        if section in {"configurations", "amenities", "highlights", "images"}:
            continue
        if isinstance(block, dict):
            flat.update(block)
    flat["configurations"] = prop.get("configurations", [])
    flat["amenities"] = prop.get("amenities", [])
    flat["highlights"] = prop.get("highlights", [])
    images = prop.get("images") or {}
    flat["images"] = {
        slot: (images.get(slot) or {}).get("url") or (images.get(slot) or {}).get("file_name")
        for slot in IMAGE_SLOTS
    }
    return flat


def extract_from_dir(folder: str, **kwargs) -> dict:
    pdfs = sorted(
        os.path.join(folder, name) for name in os.listdir(folder) if name.lower().endswith(".pdf")
    )
    if not pdfs:
        raise ValueError(f"No PDFs in {folder}")
    return extract_property(pdfs, **kwargs)

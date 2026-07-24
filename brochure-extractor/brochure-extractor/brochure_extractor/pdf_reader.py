"""PDF -> per-page text + page PNGs + embedded images.

Strategy:
  1. Pull the text layer with PyMuPDF (free, exact).
  2. If a page has almost no text it is a scanned/vector-art page ->
     mark it, run Tesseract if available, and always send the rendered
     PNG to the vision model (brochures are 80% design, so the image
     matters even when a text layer exists).
"""

from __future__ import annotations

import base64
import io
import logging
import os
from dataclasses import dataclass, field

import fitz  # PyMuPDF

from .config import settings

log = logging.getLogger(__name__)


@dataclass
class Page:
    number: int  # 1-based
    text: str
    scanned: bool
    png: bytes = b""

    @property
    def b64(self) -> str:
        return base64.b64encode(self.png).decode()


@dataclass
class Document:
    file_name: str
    pages: list[Page] = field(default_factory=list)
    embedded_images: list[dict] = field(default_factory=list)

    @property
    def full_text(self) -> str:
        return "\n".join(f"[p{p.number}] {p.text}" for p in self.pages if p.text.strip())


def _ocr(png: bytes) -> str:
    if not settings.use_tesseract:
        return ""
    try:
        import pytesseract
        from PIL import Image

        return pytesseract.image_to_string(Image.open(io.BytesIO(png)))
    except Exception as exc:  # tesseract binary or lib missing -> vision model covers it
        log.debug("tesseract unavailable (%s); relying on the vision model", exc)
        return ""


def load_pdf(path: str, *, render: bool = True) -> Document:
    size_mb = os.path.getsize(path) / 1_048_576
    if size_mb > settings.max_file_mb:
        raise ValueError(f"{os.path.basename(path)} is {size_mb:.1f} MB, limit is {settings.max_file_mb} MB")

    doc = fitz.open(path)
    out = Document(file_name=os.path.basename(path))
    zoom = settings.render_dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    for index, page in enumerate(doc):
        if index >= settings.max_pages_per_file:
            log.warning("%s: stopping at page %s", out.file_name, settings.max_pages_per_file)
            break

        text = page.get_text("text").strip()
        scanned = len(text) < settings.scanned_text_threshold
        png = page.get_pixmap(matrix=matrix).tobytes("png") if render else b""

        if scanned and png:
            ocr_text = _ocr(png).strip()
            if len(ocr_text) > len(text):
                text = ocr_text

        out.pages.append(Page(number=index + 1, text=text, scanned=scanned, png=png))

    if settings.extract_images:
        out.embedded_images = _pull_images(doc, out.file_name)

    doc.close()
    return out


def _pull_images(doc: "fitz.Document", file_name: str) -> list[dict]:
    """Photos big enough to be usable as gallery images."""
    found: list[dict] = []
    seen: set[int] = set()

    for index, page in enumerate(doc):
        if index >= settings.max_pages_per_file:
            break
        for info in page.get_images(full=True):
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                raw = doc.extract_image(xref)
            except Exception:
                continue
            if min(raw.get("width", 0), raw.get("height", 0)) < settings.min_image_px:
                continue
            found.append(
                {
                    "source_file": file_name,
                    "page": index + 1,
                    "xref": xref,
                    "ext": raw.get("ext", "png"),
                    "width": raw.get("width"),
                    "height": raw.get("height"),
                    "bytes": raw["image"],
                }
            )
    return found


def chunk_pages(pages: list[Page], size: int | None = None) -> list[list[Page]]:
    size = size or settings.pages_per_chunk
    return [pages[i : i + size] for i in range(0, len(pages), size)]

"""
Turns a PDF into per-page material the extractor can work with.

For each page we produce:
  - `text`: whatever text layer PyMuPDF can pull out directly (fast,
    exact, free — most digitally-designed brochures have at least some
    real text even if it's mostly laid out as graphics).
  - `image_b64`: the full page rendered to a PNG and base64-encoded.
    Brochures are 80% design — logos, spec tables baked into graphics,
    floor plans — so the vision model gets the rendered page even when
    a text layer exists, not just the text.
  - `ocr_text`: if the text layer is suspiciously thin (a scanned page,
    or a page that's basically one big image), we run Tesseract over
    the rendered image as a second opinion and pass that along too.

Nothing here decides what the *values* are — that's extractor.py.
This module only prepares evidence.
"""

from __future__ import annotations

import base64
import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List

import fitz  # PyMuPDF
from PIL import Image

from .config import settings

# Matches the feet-and-inches sizes printed on floor plans:
#   11'9" X 14'0"   ·   4'3"X5'0"   ·   19'0" x 12'6"
# Deliberately loose about spacing and the inches mark, which vary
# between drawings even inside one brochure.
DIMENSION_RE = re.compile(
    r"\d+\s*'\s*\d*\s*[\"”]?\s*[xX×]\s*[\"”]?\s*\d+\s*'\s*\d*\s*[\"”]?"
)

# Some plan sheets carry their room labels as vector artwork rather than
# real text, so the page's text layer is just its title ("Ground Floor",
# "Typical Plan"). Those pages still need the extra pixels — the sizes
# are there, only the text layer can't see them.
PLAN_TITLE_RE = re.compile(
    r"\b(floor\s*plan|typical\s*plan|ground\s*floor|basement|unit\s*-)", re.IGNORECASE
)

try:
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    _HAS_TESSERACT = True
except Exception:
    _HAS_TESSERACT = False


@dataclass
class PageContent:
    file_name: str
    page_number: int  # 1-indexed, matches what a human sees in a PDF viewer
    text: str
    ocr_text: str
    image_b64: str
    width: int
    height: int
    is_floor_plan: bool = False


@dataclass
class EmbeddedImage:
    file_name: str
    page_number: int
    path: Path
    width: int
    height: int


def looks_like_floor_plan(text: str) -> bool:
    """A page whose text layer is peppered with feet-and-inches sizes
    is a floor plan, not a photo spread. Cheap to check and it decides
    how many pixels that page is worth. Falls back to the page title
    for plans whose labels are artwork rather than text."""
    text = text or ""
    if len(DIMENSION_RE.findall(text)) >= settings.FLOORPLAN_DIMENSION_HITS:
        return True
    return bool(PLAN_TITLE_RE.search(text))


def _render_page_image_b64(page: "fitz.Page", dpi: int, detailed: bool = False) -> tuple[str, int, int]:
    """Render the page, then cap it to a size a vision model actually
    uses. Large-format brochure pages (posters, spreads) at 150 DPI can
    come out several thousand pixels on a side — vision models
    downsample internally anyway, so shipping that raw just adds
    upload time. JPEG (not PNG) for the same reason: this is
    photographic marketing content, not line art, so lossy compression
    costs no real OCR accuracy but cuts payload size drastically.

    `detailed` pages (floor plans) get a bigger cap and finer JPEG:
    their whole informational payload is small type scattered across a
    drawing, so the usual cap would blur exactly what we came for."""
    long_cap = settings.FLOORPLAN_IMAGE_LONG_SIDE if detailed else settings.MAX_IMAGE_LONG_SIDE
    quality = settings.FLOORPLAN_JPEG_QUALITY if detailed else settings.IMAGE_JPEG_QUALITY
    # Render at least as large as the cap we intend to keep, so a floor
    # plan is never upscaled from a too-small pixmap. Page dimensions
    # are in points (72 per inch).
    long_side_pts = max(page.rect.width, page.rect.height) or 1
    needed_dpi = long_cap * 72 / long_side_pts
    zoom = max(dpi, needed_dpi) / 72
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    long_side = max(img.width, img.height)
    if long_side > long_cap:
        scale = long_cap / long_side
        img = img.resize(
            (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
            Image.LANCZOS,
        )
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii"), img.width, img.height


def _ocr_if_needed(text: str, image_b64: str) -> str:
    """Run Tesseract only when the text layer looks too thin to trust."""
    if len(text.strip()) >= settings.MIN_TEXT_CHARS_FOR_TEXT_LAYER:
        return ""
    if not _HAS_TESSERACT:
        return ""
    try:
        raw = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw))
        return pytesseract.image_to_string(img) or ""
    except Exception:
        return ""


def read_pdf(path: Path) -> List[PageContent]:
    """Extract per-page text + rendered image for one PDF file."""
    doc = fitz.open(path)
    pages: List[PageContent] = []
    try:
        page_count = min(doc.page_count, settings.MAX_PAGES_PER_DOC)
        for i in range(page_count):
            page = doc.load_page(i)
            text = page.get_text("text") or ""
            is_floor_plan = looks_like_floor_plan(text)
            image_b64, width, height = _render_page_image_b64(
                page, settings.PAGE_RENDER_DPI, detailed=is_floor_plan
            )
            ocr_text = _ocr_if_needed(text, image_b64)
            pages.append(
                PageContent(
                    file_name=path.name,
                    page_number=i + 1,
                    text=text.strip(),
                    ocr_text=ocr_text.strip(),
                    image_b64=image_b64,
                    width=width,
                    height=height,
                    is_floor_plan=is_floor_plan,
                )
            )
    finally:
        doc.close()
    return pages


def extract_embedded_images(path: Path, out_dir: Path, min_side: int = 300) -> List[EmbeddedImage]:
    """
    Pull real embedded images (not the whole rendered page) out of the
    PDF — these are candidates for Cover / Living room / Pool / etc.
    We deliberately do NOT try to guess which slot each one belongs
    to; that categorisation is left for a human to drag into place on
    the frontend. `min_side` filters out small icons/logos.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(path)
    found: List[EmbeddedImage] = []
    try:
        page_count = min(doc.page_count, settings.MAX_PAGES_PER_DOC)
        for i in range(page_count):
            page = doc.load_page(i)
            for img_index, img in enumerate(page.get_images(full=True)):
                xref = img[0]
                try:
                    base_image = doc.extract_image(xref)
                except Exception:
                    continue
                width = base_image.get("width", 0)
                height = base_image.get("height", 0)
                if width < min_side or height < min_side:
                    continue
                ext = base_image.get("ext", "png")
                fname = f"{path.stem}_p{i + 1}_{img_index}.{ext}"
                fpath = out_dir / fname
                fpath.write_bytes(base_image["image"])
                found.append(
                    EmbeddedImage(
                        file_name=path.name,
                        page_number=i + 1,
                        path=fpath,
                        width=width,
                        height=height,
                    )
                )
    finally:
        doc.close()
    return found

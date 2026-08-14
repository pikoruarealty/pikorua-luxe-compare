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
import logging
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

# Area statements and price lists: the other place the numbers live, on
# pages that carry no dimension strings at all (the sizes sit in a table,
# not on a drawing) and so read as ordinary marketing text.
AREA_TABLE_RE = re.compile(
    r"carpet|built[\s-]*up|super\s*(built|area)|saleable|area\s*statement"
    r"|price\s*list|rate\s*per|sq\.?\s*(ft|mt|m\b)",
    re.IGNORECASE,
)

try:
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    # Importing the wrapper proves nothing — the binary it shells out to is a
    # separate install, and without this check the module reported OCR as
    # available while every call silently returned "". Ask it for its version.
    pytesseract.get_tesseract_version()
    _HAS_TESSERACT = True
except Exception as exc:  # noqa: BLE001
    logging.getLogger("pdf_reader").warning(
        "Tesseract is not usable (%s) — pages with no text layer will be read "
        "from their image alone. Floor plans are still detected from their line "
        "art, so this degrades a scanned brochure rather than breaking it.",
        exc.__class__.__name__,
    )
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
    # Overlapping magnified crops of THIS page, for floor plans only. Not extra
    # pages and not extra units — the same drawing, close up. See
    # FLOORPLAN_TILE_GRID for why one big image is not enough.
    detail_tiles: List[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.detail_tiles is None:
            self.detail_tiles = []


@dataclass
class PdfDocument:
    """One PDF's readable pages, plus the ones the budget forced out —
    reported so a thin extraction is never silently blamed on the model."""

    pages: List["PageContent"]
    skipped_pages: List[int]  # 1-indexed, as a human sees them


@dataclass
class EmbeddedImage:
    file_name: str
    page_number: int
    path: Path
    width: int
    height: int


def looks_like_floor_plan(text: str, vector_paths: int = 0) -> bool:
    """A page whose text layer is peppered with feet-and-inches sizes
    is a floor plan, not a photo spread. Cheap to check and it decides
    how many pixels that page is worth. Falls back to the page title
    for plans whose labels are artwork rather than text.

    `vector_paths` covers the brochures that have no text layer at all,
    where neither check above can fire. A drawing is line art: plan
    sheets carry hundreds to thousands of vector paths where marketing
    pages carry tens. Without this, an image-only brochure has every
    page classified as marketing and its plans read at photo
    resolution, three to an LLM call."""
    text = text or ""
    if len(DIMENSION_RE.findall(text)) >= settings.FLOORPLAN_DIMENSION_HITS:
        return True
    if PLAN_TITLE_RE.search(text):
        return True
    return vector_paths >= settings.FLOORPLAN_VECTOR_PATHS


def _page_priority(text: str, vector_paths: int = 0) -> int:
    """What a page is worth when there isn't budget for all of them.
    Floor plans first, then area/price tables, then everything else —
    the marketing prose is the only part a listing can survive without."""
    if looks_like_floor_plan(text, vector_paths):
        return 0
    if AREA_TABLE_RE.search(text or ""):
        return 1
    return 2


def select_pages(texts: List[str], budget: int, vector_paths: List[int] | None = None) -> List[int]:
    """Which page indices to actually read, in document order.

    A brochure running past the budget is the normal case, not an edge
    case — and its floor plans and price tables sit at the BACK, after
    forty pages of lifestyle photography. Taking simply the first N
    therefore drops precisely the pages the extraction exists for: a
    57-page brochure whose plans were on 44-51 returned zero
    configurations, because the reader stopped at 40. So rank pages by
    what they carry, take the budget from the top, then restore document
    order — the model still sees a coherent front-to-back document."""
    if budget <= 0 or len(texts) <= budget:
        return list(range(len(texts)))
    paths = vector_paths or [0] * len(texts)
    ranked = sorted(range(len(texts)), key=lambda i: (_page_priority(texts[i], paths[i]), i))
    return sorted(ranked[:budget])


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
    return _encode(pix, long_cap, quality)


def _encode(pix: "fitz.Pixmap", long_cap: int, quality: int) -> tuple[str, int, int]:
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


def render_detail_tiles(page: "fitz.Page") -> List[str]:
    """A floor plan cut into overlapping crops, each rendered to the full
    floor-plan pixel budget.

    This is the only way to give the model more detail than one image can
    carry: the APIs downscale whatever they are sent, so magnification has to
    come from cropping rather than from a bigger picture. The crops overlap so
    that a room label sitting on a seam is whole in at least one of them."""
    grid = max(1, settings.FLOORPLAN_TILE_GRID)
    if grid < 2:
        return []
    overlap = max(0.0, min(0.4, settings.FLOORPLAN_TILE_OVERLAP))
    rect = page.rect
    tile_w = rect.width / grid
    tile_h = rect.height / grid
    tiles: List[str] = []
    for row in range(grid):
        for col in range(grid):
            clip = fitz.Rect(
                rect.x0 + col * tile_w - tile_w * overlap,
                rect.y0 + row * tile_h - tile_h * overlap,
                rect.x0 + (col + 1) * tile_w + tile_w * overlap,
                rect.y0 + (row + 1) * tile_h + tile_h * overlap,
            ) & rect
            if clip.is_empty:
                continue
            long_pts = max(clip.width, clip.height) or 1
            zoom = settings.FLOORPLAN_IMAGE_LONG_SIDE / long_pts
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
            b64, _, _ = _encode(
                pix, settings.FLOORPLAN_IMAGE_LONG_SIDE, settings.FLOORPLAN_JPEG_QUALITY
            )
            tiles.append(b64)
    return tiles


def _ocr(image_b64: str) -> str:
    if not _HAS_TESSERACT:
        return ""
    try:
        raw = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw))
        return pytesseract.image_to_string(img) or ""
    except Exception:
        return ""


def _has_text_layer(text: str) -> bool:
    return len(text.strip()) >= settings.MIN_TEXT_CHARS_FOR_TEXT_LAYER


def read_pdf(path: Path) -> PdfDocument:
    """Extract per-page text + rendered image for one PDF file.

    Text for every page is pulled first — it is cheap next to rendering,
    and it is the only way to tell which pages are worth the budget."""
    doc = fitz.open(path)
    pages: List[PageContent] = []
    try:
        texts = [(doc.load_page(i).get_text("text") or "") for i in range(doc.page_count)]
        # How much line art each page carries. This is what identifies a plan
        # sheet in a brochure with no text layer, which is a large minority of
        # them — see looks_like_floor_plan.
        paths = [len(doc.load_page(i).get_drawings()) for i in range(doc.page_count)]
        keep = select_pages(texts, settings.MAX_PAGES_PER_DOC, paths)
        for i in keep:
            page = doc.load_page(i)
            text = texts[i]
            is_floor_plan = looks_like_floor_plan(text, paths[i])
            image_b64, width, height = _render_page_image_b64(
                page, settings.PAGE_RENDER_DPI, detailed=is_floor_plan
            )
            ocr_text = "" if _has_text_layer(text) else _ocr(image_b64)
            tiles = render_detail_tiles(page) if is_floor_plan else []
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
                    detail_tiles=tiles,
                )
            )
        kept = set(keep)
        skipped = [i + 1 for i in range(len(texts)) if i not in kept]
    finally:
        doc.close()
    return PdfDocument(pages=pages, skipped_pages=skipped)


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

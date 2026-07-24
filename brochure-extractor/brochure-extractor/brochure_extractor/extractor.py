"""Vision + text extraction against the OpenAI API."""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from openai import OpenAI

from .config import settings
from .pdf_reader import Document, Page, chunk_pages
from .schema import build_json_schema

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You extract structured data from Indian real-estate project brochures for a property comparison platform.

Rules — follow them exactly:
1. Extract only what is printed in the pages given to you. Never invent, never complete a pattern, never use outside knowledge about the builder or the city.
2. If a field is not on these pages, return null (or [] for lists). A null is correct; a guess is a bug that ships wrong data to buyers.
3. Copy identifiers (RERA number, URLs, area figures, prices) character for character. Do not tidy them up.
4. Marketing copy is not a fact. "World-class clubhouse" is not a clubhouse_size. "Sky-high living" is not a floor count.
5. Numbers: strip commas and units for integer fields (towers, floors, units, years). Keep the unit for area/price strings exactly as printed ("2,450 sq ft" -> "2450 sq ft" is fine, "2450" alone is not).
6. Configurations: one entry per distinct layout. If the brochure shows 4 BHK Type A at 2450 sq ft and 4 BHK Type B at 2700 sq ft, that is TWO entries. Read the area table and the floor-plan pages carefully.
7. Amenities: split combined lines into separate items. "Gym, Yoga Deck & Spa" -> three items.
8. expert_note and developer_info.background are the only fields you compose yourself: plain factual sentences built from what is printed, no adjectives like luxurious/premium/iconic.
9. For every non-null field, add an evidence row with the page number, a short verbatim snippet and an honest confidence. No evidence row means the field must be null.

You are given both the extracted text layer and the rendered page image. The text layer often misses tables and floor plans — trust the image for those."""

USER_TEMPLATE = """File: {file_name} (page {start} to {end} of {total})
Document type guess: read the pages and decide.

--- TEXT LAYER ---
{text}
--- END TEXT LAYER ---

The page images follow in the same order. Extract everything present on THESE pages only."""


def _client() -> OpenAI:
    settings.require_key()
    kwargs = {"api_key": settings.api_key, "timeout": settings.request_timeout}
    if settings.base_url:
        kwargs["base_url"] = settings.base_url
    return OpenAI(**kwargs)


def _call(client: OpenAI, content: list[dict]) -> dict:
    schema = build_json_schema()
    last_error: Exception | None = None

    for attempt in range(settings.max_retries):
        try:
            resp = client.chat.completions.create(
                model=settings.model,
                temperature=0,
                max_tokens=settings.max_output_tokens,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": content},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "property_extraction", "strict": True, "schema": schema},
                },
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as exc:  # noqa: BLE001 - retry on rate limit / transient / parse
            last_error = exc
            wait = 2 ** attempt
            log.warning("extraction call failed (attempt %s/%s): %s", attempt + 1, settings.max_retries, exc)
            time.sleep(wait)

    raise RuntimeError(f"OpenAI extraction failed after {settings.max_retries} attempts: {last_error}")


def _content_for(doc: Document, chunk: list[Page]) -> list[dict]:
    text = "\n\n".join(f"[page {p.number}]\n{p.text or '(no text layer - scanned page)'}" for p in chunk)
    parts: list[dict] = [
        {
            "type": "text",
            "text": USER_TEMPLATE.format(
                file_name=doc.file_name,
                start=chunk[0].number,
                end=chunk[-1].number,
                total=len(doc.pages),
                text=text[:60000],
            ),
        }
    ]
    for page in chunk:
        if page.png:
            parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{page.b64}", "detail": "high"},
                }
            )
    return parts


def extract_document(doc: Document, client: OpenAI | None = None) -> list[dict]:
    """Run the model over every chunk of one PDF. Returns raw chunk payloads."""
    client = client or _client()
    chunks = chunk_pages(doc.pages)
    log.info("%s: %s pages -> %s chunks", doc.file_name, len(doc.pages), len(chunks))

    def run(pair):
        index, chunk = pair
        payload = _call(client, _content_for(doc, chunk))
        payload["_source"] = {
            "file": doc.file_name,
            "chunk": index,
            "pages": [p.number for p in chunk],
        }
        return payload

    workers = max(1, min(settings.parallel_chunks, len(chunks)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(run, enumerate(chunks)))

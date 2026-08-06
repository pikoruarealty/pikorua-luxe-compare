"""
Calls the vision LLM page-batch by page-batch and turns its raw JSON
into a PropertyExtraction for a single source file. Multi-file merging
happens later in merger.py — this module never sees more than one PDF.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List

from tenacity import RetryError, retry, retry_if_exception, stop_after_attempt, wait_exponential

from .config import settings
from .pdf_reader import PageContent
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .schema import (
    BasicsSection,
    ConfigVariant,
    ConstructionAmenitiesSection,
    DeveloperSection,
    ExtractedField,
    ProjectStructureSection,
    PropertyExtraction,
    ReraSection,
    RoomDimension,
)

log = logging.getLogger("extractor")


class ExtractionUnavailable(RuntimeError):
    """Every batch failed for the same systemic reason (no credit, bad
    key, provider down). Distinct from "this brochure was hard to
    read" — there is nothing to review and nothing to retry per-page."""


def _is_retryable(exc: BaseException) -> bool:
    """Retry transient trouble; fail fast on anything a retry can't fix.

    A 402 (out of credit) or 401 (bad key) is not going to resolve
    itself in four seconds — retrying it three times per batch just
    turns one clear error into a slow one."""
    status = getattr(exc, "status_code", None)
    if status is None:
        return True  # timeouts, connection resets — worth another go
    return status == 429 or status >= 500


def _is_systemic(exc: BaseException) -> bool:
    """Is this about the account rather than the page we just sent?

    Credit, key and permission failures answer identically for every
    request, so the first one has already told us about the last. A
    400/413, by contrast, may be this particular page's fault — the
    rest of the brochure still deserves a try."""
    return getattr(_root_cause(exc), "status_code", None) in (401, 402, 403)


def _root_cause(exc: BaseException) -> BaseException:
    """tenacity wraps the real error in a RetryError whose repr is
    useless in a warning ("RetryError[<Future at 0x...>]")."""
    if isinstance(exc, RetryError) and exc.last_attempt.failed:
        return exc.last_attempt.exception()
    return exc


def _describe(exc: BaseException) -> str:
    """A one-line reason fit to show a human.

    Providers disagree on where the message lives: some nest it under
    "error", others (and some SDKs, having already unwrapped it) put it
    at the top level. Fall back to str(exc), trimming the "Error code:
    402 - " prefix the SDK adds since we print the status ourselves."""
    exc = _root_cause(exc)
    status = getattr(exc, "status_code", None)
    body = getattr(exc, "body", None)
    message = None
    if isinstance(body, dict):
        nested = body.get("error")
        if isinstance(nested, dict):
            message = nested.get("message")
        message = message or body.get("message")
    if not message:
        message = re.sub(r"^Error code:\s*\d+\s*-\s*", "", str(exc))
    return f"{status}: {message}" if status else str(message)


def _field(raw: Dict[str, Any] | None, file_name: str) -> ExtractedField:
    """Convert one {"value":..,"page":..,"evidence":..,"confidence":..}
    blob from the model into an ExtractedField, applying the confidence
    floor. Anything malformed or below floor is treated as not found —
    better a blank the human fills in than a wrong pre-filled guess."""
    if not raw or "value" not in raw:
        return ExtractedField()
    confidence = float(raw.get("confidence", 0) or 0)
    if confidence < settings.CONFIDENCE_FLOOR:
        return ExtractedField()
    value = raw.get("value")
    if value in (None, ""):
        return ExtractedField()
    return ExtractedField(
        value=value,
        found=True,
        confidence=confidence,
        source_file=file_name,
        source_page=raw.get("page"),
        evidence=raw.get("evidence"),
        verified=False,
    )


def _field_list(raw: List[Dict[str, Any]] | None, file_name: str) -> List[ExtractedField]:
    out = []
    for item in raw or []:
        f = _field(item, file_name)
        if f.found:
            out.append(f)
    return out


def _parse_section(model, raw: Dict[str, Any] | None, file_name: str):
    raw = raw or {}
    kwargs = {}
    for key in model.model_fields:
        kwargs[key] = _field(raw.get(key), file_name)
    return model(**kwargs)


def _merge_batch_into(target: PropertyExtraction, raw: Dict[str, Any], file_name: str) -> None:
    """A single LLM call only ever sees a handful of pages, so most
    batches will be mostly-empty. We fold each batch's non-empty
    fields into the running total for this file, first-found-wins
    (a field already filled by an earlier, higher-quality batch is
    not overwritten by a later low-confidence duplicate)."""

    def keep_if_better(current: ExtractedField, new: ExtractedField) -> ExtractedField:
        if not current.found:
            return new
        if new.found and new.confidence > current.confidence:
            return new
        return current

    b = raw.get("basics") or {}
    for key in target.basics.model_fields:
        new = _field(b.get(key), file_name)
        setattr(target.basics, key, keep_if_better(getattr(target.basics, key), new))

    ps = raw.get("project_structure") or {}
    for key in target.project_structure.model_fields:
        new = _field(ps.get(key), file_name)
        setattr(target.project_structure, key, keep_if_better(getattr(target.project_structure, key), new))

    r = raw.get("rera") or {}
    for key in target.rera.model_fields:
        new = _field(r.get(key), file_name)
        setattr(target.rera, key, keep_if_better(getattr(target.rera, key), new))

    ca = raw.get("construction_amenities") or {}
    for key in target.construction_amenities.model_fields:
        new = _field(ca.get(key), file_name)
        setattr(
            target.construction_amenities,
            key,
            keep_if_better(getattr(target.construction_amenities, key), new),
        )

    di = raw.get("developer_info") or {}
    for key in ("experience_years", "total_delivered_projects", "ongoing_projects", "background"):
        new = _field(di.get(key), file_name)
        setattr(target.developer, key, keep_if_better(getattr(target.developer, key), new))
    target.developer.notable_delivered_projects.extend(
        _field_list(di.get("notable_delivered_projects"), file_name)
    )

    for row in raw.get("configurations") or []:
        rooms = []
        for room in row.get("rooms") or []:
            name = _field(room.get("room_name"), file_name)
            dimension = _field(room.get("dimension"), file_name)
            # A room with neither a name nor a size carries nothing a
            # human could verify, so it isn't worth a row on the form.
            if name.found or dimension.found:
                rooms.append(RoomDimension(room_name=name, dimension=dimension))
        target.configurations.append(
            ConfigVariant(
                bhk_type=_field(row.get("bhk_type"), file_name),
                variant_label=_field(row.get("variant_label"), file_name),
                floor_range=_field(row.get("floor_range"), file_name),
                carpet_area=_field(row.get("carpet_area"), file_name),
                built_up_area=_field(row.get("built_up_area"), file_name),
                super_built_up_area=_field(row.get("super_built_up_area"), file_name),
                price=_field(row.get("price"), file_name),
                rate_per_sqft=_field(row.get("rate_per_sqft"), file_name),
                rooms=rooms,
            )
        )

    target.amenities.extend(_field_list(raw.get("amenities"), file_name))
    target.highlights.extend(_field_list(raw.get("highlights"), file_name))


def _squash(text: str) -> str:
    """Strip whitespace and case so 4'3"X5'0" and 4'3" X 5'0" compare
    equal — brochures are inconsistent about spacing around the X."""
    return re.sub(r"\s+", "", text or "").upper()


def _validate_room_dimensions(result: PropertyExtraction, pages: List[PageContent]) -> None:
    """Cross-check every extracted room size against the page's own text
    layer, which for a vector-drawn plan is ground truth — the exact
    strings the draughtsman typed.

    A size the model reports that does NOT appear on that page is a
    misread (transposed digit, a number borrowed from the neighbouring
    unit). We don't delete it — the room is probably real and the human
    needs to see it — but we drop its confidence and name it in
    warnings, so it surfaces for review instead of passing as verified
    fact. Pages with no text layer (labels drawn as artwork) can't be
    checked this way and are left alone rather than penalised."""
    text_by_page = {p.page_number: _squash(p.text) for p in pages if p.text}
    if not text_by_page:
        return

    for variant in result.configurations:
        for room in variant.rooms:
            field = room.dimension
            if not field.found or field.source_page is None:
                continue
            page_text = text_by_page.get(field.source_page)
            if not page_text:
                continue
            if _squash(str(field.value)) in page_text:
                continue
            label = room.room_name.value or "room"
            msg = (
                f"{field.source_file or ''} page {field.source_page}: "
                f'"{label} {field.value}" does not match any size printed on that '
                f"page — check it against the plan"
            ).strip()
            log.warning(msg)
            result.warnings.append(msg)
            field.confidence = min(field.confidence, 0.35)


def _pages_meta_block(pages: List[PageContent]) -> str:
    # Measured on the sample brochure: feeding plan pages as x,y-tagged
    # blocks — on the theory that position disambiguates which of a
    # page's two mirrored units a room belongs to — read WORSE than
    # plain reading order (121 room sizes vs 134, and 8 spurious
    # layouts when both forms were supplied). Reading order keeps each
    # room label adjacent to its own size, and that adjacency turns out
    # to matter more than the grouping hint. Kept simple deliberately.
    parts = []
    for p in pages:
        text_block = p.text or p.ocr_text or "(no extractable text layer on this page)"
        header = f"--- PAGE {p.page_number} (file: {p.file_name}) ---"
        if p.detail_tiles:
            header += (
                f"\n[Images for this page: the whole sheet, then {len(p.detail_tiles)} "
                "overlapping close-ups of it, in reading order. The close-ups are the "
                "SAME drawing magnified so the small print is legible — they are not "
                "further pages and not further units. Because they overlap, a room "
                "may appear in two of them; report it once.]"
            )
        parts.append(f"{header}\n{text_block}")
    return "\n\n".join(parts)


def _page_images(pages: List[PageContent]) -> List[tuple[str, str]]:
    """(page label, base64 jpeg) for everything we send, whole sheets first
    and their close-ups immediately after, so the order matches what the text
    block above says the model is looking at."""
    out: List[tuple[str, str]] = []
    for p in pages:
        out.append((f"page {p.page_number}", p.image_b64))
        for n, tile in enumerate(p.detail_tiles, start=1):
            out.append((f"page {p.page_number} close-up {n}", tile))
    return out


def _chunk(items: List[PageContent], size: int) -> List[List[PageContent]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def batch_pages(pages: List[PageContent]) -> List[List[PageContent]]:
    """Group pages into LLM calls.

    Marketing spreads batch happily — they're mostly prose and one
    headline idea per page. Floor plans do NOT: a single plan sheet
    carries two mirrored units, ~20 rooms each, and the only thing
    separating them is where they sit on the drawing. Asking the model
    to hold three of those at once is what makes rooms leak between
    units, so plan pages get a call to themselves."""
    batches: List[List[PageContent]] = []
    run: List[PageContent] = []
    for page in pages:
        if page.is_floor_plan:
            if run:
                batches.extend(_chunk(run, settings.PAGES_PER_LLM_CALL))
                run = []
            batches.append([page])
        else:
            run.append(page)
    if run:
        batches.extend(_chunk(run, settings.PAGES_PER_LLM_CALL))
    return batches


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    retry=retry_if_exception(_is_retryable),
)
def _call_openai(pages: List[PageContent]) -> Dict[str, Any]:
    from openai import OpenAI

    # timeout+max_retries=0: tenacity above already retries the whole
    # call with backoff, so the SDK's own internal retry loop would
    # otherwise stack on top of it and multiply worst-case wait time.
    client = OpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL or None,
        timeout=60.0,
        max_retries=0,
    )
    content = [{"type": "text", "text": build_user_prompt(_pages_meta_block(pages))}]
    for _, b64 in _page_images(pages):
        content.append(
            {
                "type": "image_url",
                # "high" keeps the API from downsampling a plan sheet to the
                # point its room labels stop being letters.
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"},
            }
        )
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
    )
    raw = resp.choices[0].message.content
    return json.loads(raw)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    retry=retry_if_exception(_is_retryable),
)
def _call_anthropic(pages: List[PageContent]) -> Dict[str, Any]:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0, max_retries=0)
    content = [{"type": "text", "text": build_user_prompt(_pages_meta_block(pages))}]
    for _, b64 in _page_images(pages):
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
            }
        )
    resp = client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=4000,
        temperature=0,
        system=SYSTEM_PROMPT + "\nRespond with raw JSON only, no markdown fences.",
        messages=[{"role": "user", "content": content}],
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{") :]
    return json.loads(text)


def _call_llm(pages: List[PageContent]) -> Dict[str, Any]:
    if settings.LLM_PROVIDER == "anthropic":
        return _call_anthropic(pages)
    return _call_openai(pages)


def extract_from_pages(
    pages: List[PageContent],
    file_name: str,
    on_batch_done=None,
    should_cancel=None,
) -> PropertyExtraction:
    """Run the full batched extraction for one PDF's pages and return
    a PropertyExtraction populated with whatever was found.

    `on_batch_done(file_name, page_numbers)` is called after each
    batch, success or failure — it exists purely so a caller (the API
    layer) can report page-by-page progress on what's otherwise a
    several-batch, tens-of-seconds-per-batch call.

    `should_cancel()`, if given, is checked before starting each batch.
    It can't abort a call already in flight, but it stops any further
    ones from starting once a user asks to stop."""
    result = PropertyExtraction(source_files=[file_name])
    batches = batch_pages(pages)
    succeeded = 0
    last_failure: BaseException | None = None
    for batch in batches:
        if should_cancel and should_cancel():
            break
        page_nums = [p.page_number for p in batch]
        try:
            raw = _call_llm(batch)
        except Exception as exc:  # noqa: BLE001
            last_failure = exc
            msg = f"{file_name} pages {page_nums}: extraction call failed ({_describe(exc)})"
            log.warning(msg)
            result.warnings.append(msg)
            if on_batch_done:
                on_batch_done(file_name, page_nums)
            # An account-level rejection answers the same for every
            # remaining call. Stop now rather than spending a minute
            # proving what the first one already told us.
            if _is_systemic(exc):
                raise ExtractionUnavailable(_describe(exc)) from exc
            continue
        succeeded += 1
        try:
            _merge_batch_into(result, raw, file_name)
        except Exception as exc:  # noqa: BLE001
            msg = f"{file_name} pages {page_nums}: could not parse model output ({exc})"
            log.warning(msg)
            result.warnings.append(msg)
        if on_batch_done:
            on_batch_done(file_name, page_nums)

    # Every single call failing is not "a brochure we struggled with" —
    # it's the service being unusable (no credit, bad key, provider
    # down). Handing back a blank form plus a wall of identical warnings
    # would look like the brochure's fault; say what actually happened.
    if batches and succeeded == 0 and last_failure is not None:
        raise ExtractionUnavailable(_describe(last_failure))

    _validate_room_dimensions(result, pages)
    return result

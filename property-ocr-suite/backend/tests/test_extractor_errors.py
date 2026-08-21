import sys
from pathlib import Path

import pytest
from tenacity import Future, RetryError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import extractor
from app.config import settings
from app.extractor import (
    ExtractionUnavailable,
    _describe,
    _is_retryable,
    _is_systemic,
    batch_pages,
)
from app.pdf_reader import PageContent


class FakeAPIError(Exception):
    """Providers disagree on the error body shape: `nested=True` is the
    {"error": {"message": ...}} form, `nested=False` the flat one some
    SDKs hand back having already unwrapped it."""

    def __init__(self, status_code, message, nested=True, body=...):
        super().__init__(f"Error code: {status_code} - {message}")
        self.status_code = status_code
        if body is not ...:
            self.body = body
        else:
            self.body = {"error": {"message": message}} if nested else {"message": message}


def _page(number: int, plan: bool = False) -> PageContent:
    return PageContent(
        file_name="brochure.pdf",
        page_number=number,
        text="text",
        ocr_text="",
        image_b64="",
        width=10,
        height=10,
        is_floor_plan=plan,
    )


def test_billing_and_auth_errors_are_not_retried():
    """Retrying a 402 three times per batch turns one clear error into
    a slow one — nothing about it is going to change in four seconds."""
    assert _is_retryable(FakeAPIError(402, "Insufficient credits")) is False
    assert _is_retryable(FakeAPIError(401, "Bad key")) is False


def test_account_level_rejections_are_systemic():
    """These answer identically for every request, so the first one has
    already told us about the last."""
    assert _is_systemic(FakeAPIError(402, "Insufficient credits")) is True
    assert _is_systemic(FakeAPIError(401, "Bad key")) is True


def test_content_level_rejections_are_not_systemic():
    """A 400 may be about the page we just sent, not the account — the
    rest of the brochure still deserves a try."""
    assert _is_systemic(FakeAPIError(400, "bad image")) is False
    assert _is_systemic(FakeAPIError(413, "payload too large")) is False
    assert _is_systemic(FakeAPIError(500, "upstream down")) is False


def test_transient_errors_are_retried():
    assert _is_retryable(FakeAPIError(429, "Rate limited")) is True
    assert _is_retryable(FakeAPIError(503, "Upstream down")) is True
    assert _is_retryable(TimeoutError("connection reset")) is True


def test_describe_reads_the_message_from_either_body_shape():
    nested = _describe(FakeAPIError(402, "Insufficient credits", nested=True))
    flat = _describe(FakeAPIError(402, "Insufficient credits", nested=False))
    assert nested == flat == "402: Insufficient credits"


def test_describe_falls_back_without_repeating_the_status_code():
    """The SDK prefixes str(exc) with "Error code: 402 - "; we already
    print the status, so repeating it reads as noise."""
    described = _describe(FakeAPIError(402, "Insufficient credits", body=None))
    assert described == "402: Insufficient credits"


def test_describe_unwraps_retry_error_and_reads_the_real_message():
    """tenacity's own repr is "RetryError[<Future at 0x...>]", which
    tells a human nothing about what went wrong."""
    attempt = Future(1)
    attempt.set_exception(FakeAPIError(402, "Insufficient credits. Add more at ..."))
    described = _describe(RetryError(attempt))
    assert "402" in described
    assert "Insufficient credits" in described
    assert "Future at" not in described


def test_all_batches_failing_raises_rather_than_returning_a_blank_form(monkeypatch):
    """A blank form plus a wall of identical warnings reads as "this
    brochure was hard to parse". It wasn't — the service was unusable."""
    monkeypatch.setattr(
        extractor, "_call_llm",
        lambda batch: (_ for _ in ()).throw(FakeAPIError(402, "Insufficient credits")),
    )
    with pytest.raises(ExtractionUnavailable) as err:
        extractor.extract_from_pages([_page(1), _page(2)], "brochure.pdf")
    assert "Insufficient credits" in str(err.value)


def test_systemic_failure_aborts_without_walking_every_batch(monkeypatch):
    """With no credit, batch 1 already knows the answer for batch 13.
    Batches run concurrently, so up to MAX_CONCURRENT_BATCHES calls may
    already be in flight when the first failure lands and is recognised
    as systemic — those are allowed to finish rather than wasting the
    whole remaining batch — but no further ones should be submitted
    after that."""
    calls = {"n": 0}

    def always_402(batch):
        calls["n"] += 1
        raise FakeAPIError(402, "Insufficient credits")

    monkeypatch.setattr(extractor, "_call_llm", always_402)
    pages = [_page(i, plan=True) for i in range(1, 14)]  # 13 separate batches
    with pytest.raises(ExtractionUnavailable):
        extractor.extract_from_pages(pages, "brochure.pdf")
    assert calls["n"] <= settings.MAX_CONCURRENT_BATCHES


def test_page_specific_failure_does_not_abort_the_whole_job(monkeypatch):
    """A 400 on one oversized page is not a reason to abandon a
    brochure whose other pages read fine."""
    calls = {"n": 0}

    def first_page_bad(batch):
        calls["n"] += 1
        if calls["n"] == 1:
            raise FakeAPIError(400, "that page upset the model")
        return {"amenities": [{"value": "Gym", "page": 2, "evidence": "Gym", "confidence": 0.9}]}

    monkeypatch.setattr(extractor, "_call_llm", first_page_bad)
    result = extractor.extract_from_pages(
        [_page(1, True), _page(2, True), _page(3, True)], "brochure.pdf"
    )
    assert calls["n"] == 3  # kept going after the bad page
    assert "Gym" in [a.value for a in result.amenities]
    assert len(result.warnings) == 1


def test_partial_failure_still_returns_what_was_read(monkeypatch):
    """One bad page must not throw away the other eighteen."""
    calls = {"n": 0}

    def flaky(batch):
        calls["n"] += 1
        if calls["n"] == 1:
            raise FakeAPIError(500, "hiccup")
        return {"amenities": [{"value": "Pool", "page": 4, "evidence": "Pool", "confidence": 0.9}]}

    monkeypatch.setattr(extractor, "_call_llm", flaky)
    result = extractor.extract_from_pages([_page(1, True), _page(2, True)], "brochure.pdf")
    assert [a.value for a in result.amenities] == ["Pool"]
    assert len(result.warnings) == 1


def test_floor_plans_get_their_own_call():
    """Three dense plans in one call is what makes rooms leak between
    units; marketing spreads batch together fine."""
    pages = [_page(1), _page(2), _page(3), _page(4, True), _page(5, True), _page(6)]
    batches = [[p.page_number for p in b] for b in batch_pages(pages)]
    assert batches == [[1, 2, 3], [4], [5], [6]]

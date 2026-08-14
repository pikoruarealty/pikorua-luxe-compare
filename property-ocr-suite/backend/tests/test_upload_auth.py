import hashlib
import hmac
import sys
import time
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import main
from app.config import settings

SECRET = "test-shared-secret-0123456789"
JOB_ID = "a1b2c3d4e5f6a7b8"


@pytest.fixture(autouse=True)
def _with_key(monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", SECRET)


def _scoped_token(expiry: int, scope: str = "", secret: str = SECRET) -> str:
    expiry_str = str(expiry)
    signature = hmac.new(
        secret.encode(), f"{scope}{expiry_str}".encode(), hashlib.sha256
    ).hexdigest()
    return f"{expiry_str}.{signature}"


def _token(expiry: int, secret: str = SECRET) -> str:
    return _scoped_token(expiry, f"upload:{JOB_ID}:", secret)


def test_valid_token_is_accepted():
    assert main._verify_upload_token(_token(int(time.time()) + 600), JOB_ID) is True


def test_expired_token_is_rejected():
    assert main._verify_upload_token(_token(int(time.time()) - 1), JOB_ID) is False


def test_token_signed_with_another_key_is_rejected():
    assert main._verify_upload_token(_token(int(time.time()) + 600, "wrong-key"), JOB_ID) is False


@pytest.mark.parametrize(
    "token",
    ["", "not-a-token", "abc.def", "1800000000", "1800000000.", ".deadbeef"],
)
def test_malformed_tokens_are_rejected(token):
    assert main._verify_upload_token(token, JOB_ID) is False


def test_tampered_signature_is_rejected():
    good = _token(int(time.time()) + 600)
    tampered = good[:-1] + ("0" if good[-1] != "0" else "1")
    assert main._verify_upload_token(tampered, JOB_ID) is False


def test_expiry_cannot_be_extended_without_resigning():
    """The expiry is what's signed, so moving it invalidates the token."""
    expiry, signature = _token(int(time.time()) - 1).split(".")
    assert main._verify_upload_token(f"{int(expiry) + 10_000}.{signature}", JOB_ID) is False


def test_upload_ticket_is_bound_to_one_job():
    token = _token(int(time.time()) + 600)
    assert main._verify_upload_token(token, "ffffffffffffffff") is False


def test_upload_accepts_the_shared_key_directly():
    main.require_upload_auth(x_service_key=SECRET, authorization=None)


def test_upload_accepts_a_bearer_ticket():
    main.require_upload_auth(
        job_id=JOB_ID,
        x_service_key=None,
        authorization=f"Bearer {_token(int(time.time()) + 600)}",
    )


def test_upload_rejects_no_credentials():
    with pytest.raises(HTTPException) as exc:
        main.require_upload_auth(x_service_key=None, authorization=None)
    assert exc.value.status_code == 401


def test_a_ticket_does_not_open_the_other_endpoints():
    """A leaked upload ticket must not also read back extracted jobs — those
    still require the shared key, which never leaves the website's server."""
    with pytest.raises(HTTPException):
        main.require_service_key(x_service_key=_token(int(time.time()) + 600))


def test_no_key_and_no_opt_in_rejects_rather_than_opening_up(monkeypatch):
    """The previous behaviour was the opposite: an empty key disabled auth on
    every endpoint. One unset environment variable published the whole service,
    silently. Now it takes an explicit opt-in, and config.check_auth_configured
    refuses to boot without one."""
    monkeypatch.setattr(settings, "SERVICE_API_KEY", "")
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", False)
    with pytest.raises(HTTPException) as exc:
        main.require_upload_auth(x_service_key=None, authorization=None)
    assert exc.value.status_code == 401


def test_auth_is_disabled_only_when_explicitly_opted_into(monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", "")
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", True)
    main.require_upload_auth(x_service_key=None, authorization=None)


def test_boot_refuses_a_missing_key(monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", "")
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", False)
    with pytest.raises(RuntimeError, match="SERVICE_API_KEY"):
        settings.check_auth_configured()


def test_boot_allows_the_documented_escape_hatch(monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", "")
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", True)
    settings.check_auth_configured()  # warns, does not raise


def test_an_upload_ticket_does_not_open_the_images(monkeypatch):
    """Scopes are part of the signed message, so the two ticket kinds are not
    interchangeable — a ticket scraped from an upload request must not also
    fetch a client's unreleased brochure pages."""
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", False)
    upload_ticket = _token(int(time.time()) + 600)
    with pytest.raises(HTTPException):
        main.require_image_auth(x_service_key=None, t=upload_ticket)


def test_an_image_ticket_does_not_start_an_extraction(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", False)
    image_ticket = _scoped_token(int(time.time()) + 600, main.IMAGE_TICKET_SCOPE)
    with pytest.raises(HTTPException):
        main.require_upload_auth(
            job_id=JOB_ID, x_service_key=None, authorization=f"Bearer {image_ticket}"
        )


def test_a_valid_image_ticket_is_accepted():
    main.require_image_auth(
        x_service_key=None, t=_scoped_token(int(time.time()) + 600, main.IMAGE_TICKET_SCOPE)
    )


def test_an_expired_image_ticket_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", False)
    with pytest.raises(HTTPException):
        main.require_image_auth(
            x_service_key=None, t=_scoped_token(int(time.time()) - 1, main.IMAGE_TICKET_SCOPE)
        )

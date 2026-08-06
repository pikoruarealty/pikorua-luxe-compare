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


@pytest.fixture(autouse=True)
def _with_key(monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", SECRET)


def _token(expiry: int, secret: str = SECRET) -> str:
    expiry_str = str(expiry)
    signature = hmac.new(secret.encode(), expiry_str.encode(), hashlib.sha256).hexdigest()
    return f"{expiry_str}.{signature}"


def test_valid_token_is_accepted():
    assert main._verify_upload_token(_token(int(time.time()) + 600)) is True


def test_expired_token_is_rejected():
    assert main._verify_upload_token(_token(int(time.time()) - 1)) is False


def test_token_signed_with_another_key_is_rejected():
    assert main._verify_upload_token(_token(int(time.time()) + 600, "wrong-key")) is False


@pytest.mark.parametrize(
    "token",
    ["", "not-a-token", "abc.def", "1800000000", "1800000000.", ".deadbeef"],
)
def test_malformed_tokens_are_rejected(token):
    assert main._verify_upload_token(token) is False


def test_tampered_signature_is_rejected():
    good = _token(int(time.time()) + 600)
    tampered = good[:-1] + ("0" if good[-1] != "0" else "1")
    assert main._verify_upload_token(tampered) is False


def test_expiry_cannot_be_extended_without_resigning():
    """The expiry is what's signed, so moving it invalidates the token."""
    expiry, signature = _token(int(time.time()) - 1).split(".")
    assert main._verify_upload_token(f"{int(expiry) + 10_000}.{signature}") is False


def test_upload_accepts_the_shared_key_directly():
    main.require_upload_auth(x_service_key=SECRET, authorization=None)


def test_upload_accepts_a_bearer_ticket():
    main.require_upload_auth(
        x_service_key=None, authorization=f"Bearer {_token(int(time.time()) + 600)}"
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


def test_auth_is_disabled_when_no_key_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", "")
    main.require_upload_auth(x_service_key=None, authorization=None)

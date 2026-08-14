"""Cover for the upload endpoint's handling of hostile input.

None of this was tested before: the multipart filename went straight into a
path join, nothing capped how many files or how many bytes arrived, and the
image route resolved a caller-supplied path without checking where it landed.
"""

import asyncio
import io
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import main
from app.config import settings

SECRET = "test-shared-secret-0123456789"


def run(coro):
    """The endpoints are async; the rest of this suite is not, and one helper
    beats a plugin and its config just to await four calls."""
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _isolated_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_API_KEY", SECRET)
    monkeypatch.setattr(settings, "ALLOW_INSECURE_LOCAL", False)
    monkeypatch.setattr(settings, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(settings, "IMAGE_DIR", tmp_path / "images")
    monkeypatch.setattr(settings, "JOB_DIR", tmp_path / "jobs")
    settings.ensure_dirs()
    return tmp_path


def _upload(name, data: bytes = b"%PDF-1.4 fake") -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(data))


class _Tasks:
    """Stands in for FastAPI's BackgroundTasks so extraction never actually runs."""

    def __init__(self):
        self.added = []

    def add_task(self, fn, *args, **kwargs):
        self.added.append((fn, args, kwargs))


def test_a_traversing_filename_stays_inside_the_job_directory():
    tasks = _Tasks()
    result = run(main.extract_property(tasks, files=[_upload("../../../../etc/pwned.pdf")]))

    job_dir = settings.UPLOAD_DIR / result["job_id"]
    written = list(job_dir.iterdir())
    assert len(written) == 1
    # The stored name is generated, so the traversal has nothing to act on.
    assert written[0].parent == job_dir
    assert written[0].suffix == ".pdf"
    assert ".." not in written[0].name
    assert not (settings.UPLOAD_DIR.parent / "etc").exists()


def test_the_original_name_still_reaches_the_reviewer():
    tasks = _Tasks()
    run(main.extract_property(tasks, files=[_upload("Prestige Park Grove.pdf")]))

    # _run_extraction is handed (path, label) pairs; the label is what every
    # progress line and skipped-page warning shows.
    _fn, args, _kwargs = tasks.added[0]
    saved_paths = args[1]
    assert saved_paths[0][1] == "Prestige Park Grove.pdf"
    assert saved_paths[0][0].name != "Prestige Park Grove.pdf"


def test_a_non_pdf_is_refused():
    with pytest.raises(HTTPException) as exc:
        run(main.extract_property(_Tasks(), files=[_upload("payload.exe")]))
    assert exc.value.status_code == 400


def test_a_missing_filename_is_refused_not_crashed():
    """`upload.filename` may be absent; .lower() on it used to raise straight
    out of the handler as a 500."""
    with pytest.raises(HTTPException) as exc:
        run(main.extract_property(_Tasks(), files=[_upload(None)]))
    assert exc.value.status_code == 400


def test_too_many_files_are_refused(monkeypatch):
    monkeypatch.setattr(settings, "MAX_FILES", 2)
    with pytest.raises(HTTPException) as exc:
        run(main.extract_property(_Tasks(), files=[_upload(f"b{i}.pdf") for i in range(3)]))
    assert exc.value.status_code == 400


def test_an_oversized_file_is_refused_and_not_left_on_disk(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 1024)
    with pytest.raises(HTTPException) as exc:
        run(main.extract_property(_Tasks(), files=[_upload("huge.pdf", b"x" * 5000)]))
    assert exc.value.status_code == 413
    # The partial write must not survive the rejection.
    leftovers = [p for p in settings.UPLOAD_DIR.rglob("*") if p.is_file()]
    assert leftovers == []


def test_the_image_route_refuses_a_path_outside_its_root():
    secret = settings.IMAGE_DIR.parent / "jobs" / "secret.json"
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text("{}", encoding="utf-8")

    with pytest.raises(HTTPException) as exc:
        run(main.get_image(job_id="..", filename="jobs/secret.json"))
    assert exc.value.status_code == 404


def test_the_image_route_requires_credentials():
    with pytest.raises(HTTPException) as exc:
        main.require_image_auth(x_service_key=None, t=None)
    assert exc.value.status_code == 401

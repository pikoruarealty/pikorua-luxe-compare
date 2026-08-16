"""Durable OCR queue and private object-storage adapters.

This module is the authority for the V2_OCR worker. The legacy FastAPI flow is
kept behind its disabled flag during migration, but production jobs use these
Postgres transitions and GCS objects; process memory and local disk are never
authoritative.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - production dependency guard
    psycopg = None
    dict_row = None

try:
    from google.cloud import storage
except ImportError:  # pragma: no cover - production dependency guard
    storage = None


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    source_document_id: str
    developer_id: str
    bucket: str
    object_path: str
    sha256: str
    original_filename: str
    attempts: int


@dataclass(frozen=True)
class ValidationResult:
    hard_failures: tuple[str, ...]
    soft_anomalies: tuple[str, ...]

    @property
    def can_continue(self) -> bool:
        return not self.hard_failures

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "hard_failures": list(self.hard_failures),
            "soft_anomalies": list(self.soft_anomalies),
        }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_extraction(payload: dict[str, Any]) -> ValidationResult:
    """Conservative machine checks. Human review is still mandatory."""
    hard: list[str] = []
    soft: list[str] = []
    configurations = payload.get("configurations")
    if not isinstance(configurations, list):
        hard.append("invalid_configuration_relationship")
        configurations = []

    def scalar(field: Any) -> Any:
        return field.get("value") if isinstance(field, dict) else field

    for index, configuration in enumerate(configurations):
        if not isinstance(configuration, dict):
            hard.append(f"configuration_{index}_malformed")
            continue
        for key in ("super_built_up_area", "carpet_area", "built_up_area", "price", "rate_per_sqft"):
            value = scalar(configuration.get(key))
            if isinstance(value, (int, float)) and value < 0:
                hard.append(f"configuration_{index}_{key}_negative")
        area = scalar(configuration.get("super_built_up_area"))
        carpet = scalar(configuration.get("carpet_area"))
        if isinstance(area, (int, float)) and isinstance(carpet, (int, float)) and carpet > area:
            soft.append(f"configuration_{index}_carpet_exceeds_super_area")

    basics = payload.get("basics")
    if not isinstance(basics, dict):
        hard.append("malformed_required_identity")
    return ValidationResult(tuple(sorted(set(hard))), tuple(sorted(set(soft))))


class PostgresJobStore:
    def __init__(self, database_url: str, worker_id: str, lease_minutes: int = 15):
        if psycopg is None:
            raise RuntimeError("psycopg is required for the durable OCR worker")
        self.database_url = database_url
        self.worker_id = worker_id
        self.lease_minutes = lease_minutes

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def claim(self) -> ClaimedJob | None:
        with self._connect() as connection, connection.transaction():
            row = connection.execute(
                """
                SELECT j.id, j.source_document_id, j.developer_id, j.attempts,
                       d.storage_bucket, d.storage_object_path, d.sha256,
                       d.original_filename
                FROM public.ocr_jobs j
                JOIN public.source_documents d ON d.id = j.source_document_id
                WHERE j.cancel_requested_at IS NULL
                  AND (
                    j.state = 'queued'
                    OR (j.state = 'processing' AND j.locked_at < now() - (%s * interval '1 minute'))
                  )
                  AND j.available_at <= now()
                ORDER BY j.available_at, j.created_at
                FOR UPDATE OF j SKIP LOCKED
                LIMIT 1
                """,
                (self.lease_minutes,),
            ).fetchone()
            if not row:
                return None
            updated = connection.execute(
                """
                UPDATE public.ocr_jobs
                SET state = 'processing', attempts = attempts + 1,
                    locked_by = %s, locked_at = now(), progress = 0, updated_at = now()
                WHERE id = %s
                RETURNING attempts
                """,
                (self.worker_id, row["id"]),
            ).fetchone()
            return ClaimedJob(
                id=str(row["id"]),
                source_document_id=str(row["source_document_id"]),
                developer_id=str(row["developer_id"]),
                bucket=row["storage_bucket"],
                object_path=row["storage_object_path"],
                sha256=row["sha256"],
                original_filename=row["original_filename"],
                attempts=updated["attempts"],
            )

    def update_progress(self, job_id: str, progress: int) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE public.ocr_jobs SET progress = %s, locked_at = now(), updated_at = now()
                WHERE id = %s AND locked_by = %s AND state = 'processing'
                """,
                (max(0, min(99, progress)), job_id, self.worker_id),
            )

    def cancellation_requested(self, job_id: str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT cancel_requested_at IS NOT NULL AS requested FROM public.ocr_jobs WHERE id = %s",
                (job_id,),
            ).fetchone()
            return not row or bool(row["requested"])

    def cancel(self, job_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE public.ocr_jobs
                SET state = 'cancelled', progress = 0, locked_by = NULL,
                    locked_at = NULL, updated_at = now()
                WHERE id = %s
                """,
                (job_id,),
            )

    def complete(
        self,
        job_id: str,
        payload: dict[str, Any],
        validation: ValidationResult,
        versions: dict[str, str],
    ) -> None:
        """Commit result and completion together; retrying cannot duplicate revision 1."""
        with self._connect() as connection, connection.transaction():
            connection.execute(
                "SELECT id FROM public.ocr_jobs WHERE id = %s FOR UPDATE", (job_id,)
            ).fetchone()
            existing = connection.execute(
                "SELECT id FROM public.ocr_extraction_revisions WHERE job_id = %s AND revision = 1",
                (job_id,),
            ).fetchone()
            if not existing:
                connection.execute(
                    """
                    INSERT INTO public.ocr_extraction_revisions
                      (job_id, revision, schema_version, model_version, prompt_version,
                       parser_version, formula_version, extraction_payload, validation_result)
                    VALUES (%s, 1, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    """,
                    (
                        job_id,
                        1,
                        versions["model"],
                        versions["prompt"],
                        versions["parser"],
                        versions["formula"],
                        json.dumps(payload),
                        json.dumps(validation.as_dict()),
                    ),
                )
            state = "needs_correction" if validation.soft_anomalies else "ready_for_review"
            connection.execute(
                """
                UPDATE public.ocr_jobs
                SET state = %s, progress = 100, locked_by = NULL, locked_at = NULL,
                    last_error_code = NULL, updated_at = now()
                WHERE id = %s
                """,
                (state, job_id),
            )

    def fail(self, job: ClaimedJob, error_code: str, max_attempts: int = 3) -> None:
        with self._connect() as connection:
            terminal = job.attempts >= max_attempts
            connection.execute(
                """
                UPDATE public.ocr_jobs
                SET state = %s, available_at = CASE WHEN %s THEN available_at ELSE now() + interval '5 minutes' END,
                    locked_by = NULL, locked_at = NULL, last_error_code = %s, updated_at = now()
                WHERE id = %s
                """,
                ("failed" if terminal else "queued", terminal, error_code[:100], job.id),
            )


class GcsPrivateStorage:
    def __init__(self):
        if storage is None:
            raise RuntimeError("google-cloud-storage is required for the durable OCR worker")
        self.client = storage.Client()

    def download(self, bucket: str, object_path: str, destination: Path) -> None:
        self.client.bucket(bucket).blob(object_path).download_to_filename(destination)

    def upload_evidence(self, bucket: str, object_path: str, source: Path) -> None:
        self.client.bucket(bucket).blob(object_path).upload_from_filename(source)

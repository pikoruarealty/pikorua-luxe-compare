"""
One-off backfill for `basics.website` on jobs extracted before that field
existed in the schema (see app/schema.py, added 2026-08-23).

Deliberately NOT a re-extraction. Re-running the LLM extractor over every
brochure would cost real API spend and — worse — `_save_job` overwrites the
whole file, so it would also blow away any human review already done on
these jobs (edited values, ticked "verified" boxes). All of that is avoidable
here: a project's own website is normal PDF text, not something that needs a
vision model to read, so this scans each brochure's text layer directly with
PyMuPDF (already a dependency, already used for the real pipeline) and only
ever touches the one new field.

Only accepts a "www.something.tld" match — no bare-domain guessing — because
a bare domain has too many ways to be an email provider, a table caption, or
someone else's URL rather than the project's own site. If a page prints more
than one distinct www. domain, that brochure is flagged as ambiguous and
skipped rather than guessed at, same as everywhere else in this pipeline.

Dry-run by default (--apply to write). Backs up every file it touches to
storage/jobs_website_backup/ before overwriting, same as clean_amenities.py.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

import fitz  # PyMuPDF

BACKEND_DIR = Path(__file__).resolve().parent.parent
JOBS_DIR = BACKEND_DIR / "storage" / "jobs"
UPLOAD_DIR = BACKEND_DIR / "storage" / "uploads"
BACKUP_DIR = JOBS_DIR.parent / "jobs_website_backup"

WWW_RE = re.compile(r"\bwww\.([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b", re.IGNORECASE)

# Real domains that turn up in brochure text but are never the project's own
# site: RERA/government portals, social platforms, link shorteners, generic
# tools a designer's PDF export leaves behind.
_DOMAIN_BLOCKLIST = {
    "www.facebook.com",
    "www.instagram.com",
    "www.twitter.com",
    "www.x.com",
    "www.linkedin.com",
    "www.youtube.com",
    "www.pinterest.com",
    "www.whatsapp.com",
    "www.google.com",
    "www.maps.google.com",
    "www.canva.com",
    "www.adobe.com",
    "www.bit.ly",
}


def _resolve_source_pdf(job_id: str, source_files: list[str]) -> Path | None:
    """Mirrors main.py's _resolve_source_pdf without importing main (which
    boots the whole FastAPI app / settings). Tries the per-job upload
    directory first (single PDF, unambiguous), then storage/uploads/manual/
    by the original filename recorded in the job's own source_files."""
    job_dir = UPLOAD_DIR / job_id
    if job_dir.is_dir():
        pdfs = sorted(p for p in job_dir.iterdir() if p.suffix.lower() == ".pdf")
        if len(pdfs) == 1:
            return pdfs[0]
    for name in source_files:
        candidate = UPLOAD_DIR / "manual" / Path(name).name
        if candidate.is_file():
            return candidate
    return None


def find_website(pdf_path: Path) -> tuple[str, int, str] | None | str:
    """Returns (domain, page_number, evidence_snippet) on a single confident
    match, None on no match, or the string "ambiguous" when more than one
    distinct www. domain is printed in the brochure."""
    doc = fitz.open(pdf_path)
    try:
        found: dict[str, tuple[int, str]] = {}
        for i in range(doc.page_count):
            text = doc.load_page(i).get_text("text") or ""
            for m in WWW_RE.finditer(text):
                domain = m.group(0).lower().rstrip(".,;:")
                # .gov.in domains are RERA/other government portals, never a
                # project's own site — and this brochure pipeline has already
                # seen a stray typo'd variant (gujrerar1.gujarat.gov.in), so
                # match the suffix rather than one hardcoded hostname.
                if domain in _DOMAIN_BLOCKLIST or domain.endswith(".gov.in") or domain in found:
                    continue
                start = max(0, m.start() - 20)
                end = min(len(text), m.end() + 20)
                snippet = " ".join(text[start:end].split())
                found[domain] = (i + 1, snippet)
    finally:
        doc.close()

    if not found:
        return None
    if len(found) > 1:
        return "ambiguous"
    (domain, (page, snippet)) = next(iter(found.items()))
    return (domain, page, snippet)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = parser.parse_args()

    filled = 0
    ambiguous = 0
    no_pdf = 0
    no_match = 0
    already_had = 0

    for path in sorted(JOBS_DIR.glob("*.json")):
        if path.name.startswith("_") or path.name.endswith(".meta.json"):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        basics = data.get("basics")
        if not isinstance(basics, dict) or "property_name" not in basics:
            continue  # not a PropertyExtraction-shaped job file
        if (basics.get("website") or {}).get("found"):
            already_had += 1
            continue

        job_id = path.stem
        source_files = data.get("source_files") or []
        pdf_path = _resolve_source_pdf(job_id, source_files)
        if not pdf_path:
            print(f"{path.name}: no source PDF on disk — skipping")
            no_pdf += 1
            continue

        result = find_website(pdf_path)
        if result is None:
            no_match += 1
            continue
        if result == "ambiguous":
            print(f"{path.name} ({source_files}): multiple www. domains printed — needs a human pick")
            ambiguous += 1
            continue

        domain, page, snippet = result
        print(f"{path.name} ({source_files}): {domain}  (page {page})")
        print(f"  evidence: {snippet!r}")
        filled += 1

        if args.apply:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, BACKUP_DIR / path.name)
            basics["website"] = {
                "value": domain,
                "found": True,
                "confidence": 0.75,
                "source_file": source_files[0] if source_files else pdf_path.name,
                "source_page": page,
                "evidence": snippet,
                "verified": False,
                "derived": False,
                "validation_warning": None,
            }
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{'Applied' if args.apply else 'Dry run'}:")
    print(f"  filled            : {filled}")
    print(f"  already had it    : {already_had}")
    print(f"  ambiguous (skip)  : {ambiguous}")
    print(f"  no www. printed   : {no_match}")
    print(f"  no source PDF     : {no_pdf}")
    if not args.apply:
        print("\nRe-run with --apply to write changes (originals backed up to jobs_website_backup/).")


if __name__ == "__main__":
    main()

"""
One-off cleanup for amenities already sitting in storage/jobs/*.json.

The extraction prompt used to let two kinds of noise into the "amenities"
list: (1) the model guessing a specific amenity name from a lifestyle photo
instead of reading a printed caption, and (2) numbered site-plan / clubhouse
legends (ENTRY, TOILET, W.C., KITCHEN, GARBAGE COLLECTION...) being scraped
in wholesale even though they're floor-plan callouts, not amenities. The
prompt (prompts.py) and the dedupe key (merger.py:_normalize_list_key) are
now fixed for new extractions; this script re-applies the same two rules to
jobs already on disk, without re-calling the model, since the underlying
per-item evidence needed to make the call is already stored.

Dry-run by default (--apply to write). Backs up every file it touches to
storage/jobs_amenities_backup/ before overwriting.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

JOBS_DIR = Path(__file__).resolve().parent.parent / "storage" / "jobs"
BACKUP_DIR = JOBS_DIR.parent / "jobs_amenities_backup"

# Functional/back-of-house labels that show up on numbered site-plan or
# clubhouse-plan legends alongside genuine amenities. Never real amenities on
# their own, regardless of the brochure.
_LEGEND_BLOCKLIST = {
    "entry", "exit", "entry/exit to ramp", "ramp to basement parking",
    "driveway plaza", "driveway", "drop-off plaza", "drop-off",
    "security cabin", "way to foyer", "entry lobby", "visitor parking",
    "service area", "service yard", "garbage collection", "manager cabin",
    "reception", "kitchen", "toilet", "w.c.", "wc", "shower",
    "outdoor shower", "changing room", "double height entrance",
}


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


_BLOCKLIST_KEYS = {_normalize_key(v) for v in _LEGEND_BLOCKLIST}

# Kept in sync with app/merger.py's _AMENITY_SYNONYM_GROUPS — same feature,
# genuinely different words, so punctuation-stripping alone can't merge them.
_AMENITY_SYNONYM_GROUPS = [
    {"totlot", "kidsplayarea", "childrensplayarea", "childrenplayarea", "kidsplayzone", "toddlerplayarea", "kidszone"},
    {"gym", "gymnasium", "fitnesscentre", "fitnesscenter"},
    {"amphitheatre", "amphitheater", "openairtheatre", "openairtheater"},
    {"seniorcitizenarea", "seniorcitizensittingarea", "seniorcitizenspark", "elderssittingarea", "elderlysittingarea"},
    {"multipurposehall", "multipurposeroom", "communityhall"},
]

_AMENITY_SYNONYM_MAP = {
    variant: sorted(group)[0] for group in _AMENITY_SYNONYM_GROUPS for variant in group
}


def _canonical_key(value: str) -> str:
    key = _normalize_key(value)
    return _AMENITY_SYNONYM_MAP.get(key, key)


_PHOTO_GUESS_PHRASES = ("visible", "seen in the image", "shown in the image", "pictured in")


def _is_photo_guess(item: dict) -> bool:
    """The model described what a photo shows instead of reading a caption.

    Real captions get echoed back near-verbatim as evidence, even when the
    "value" is a cleaned-up/shortened version of it (quote-mark style,
    capitalisation, a typo) - so a loose value/evidence mismatch is NOT a
    safe signal on its own; it flagged genuine amenities like "Jogging
    track" (evidence "JOGGING TRACK 6'0\" WIDE") as false positives. The
    actual bug pattern only shows up in the sentence itself: a photo guess
    writes a description of a scene ("swimming pool with water features
    visible in the clubhouse area"), not a caption. Require that phrasing
    explicitly rather than guessing from string distance."""
    evidence = (item.get("evidence") or "").strip().lower()
    return any(phrase in evidence for phrase in _PHOTO_GUESS_PHRASES)


def clean_amenities(items: list[dict]) -> tuple[list[dict], list[dict]]:
    kept: list[dict] = []
    dropped: list[dict] = []
    seen: set[str] = set()
    for item in items:
        value = item.get("value")
        if not item.get("found") or not value:
            continue
        key = _canonical_key(str(value))
        if key in _BLOCKLIST_KEYS:
            dropped.append(item)
            continue
        if _is_photo_guess(item):
            dropped.append(item)
            continue
        if key in seen:
            dropped.append(item)
            continue
        seen.add(key)
        kept.append(item)
    return kept, dropped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = parser.parse_args()

    total_dropped = 0
    for path in sorted(JOBS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        amenities = data.get("amenities")
        if not isinstance(amenities, list) or not amenities:
            continue
        kept, dropped = clean_amenities(amenities)
        if not dropped:
            continue
        total_dropped += len(dropped)
        print(f"\n{path.name} ({data.get('source_files')}): dropping {len(dropped)} of {len(amenities)}")
        for item in dropped:
            print(f"  - {item.get('value')!r}  (page {item.get('source_page')}, evidence: {item.get('evidence')!r})")
        if args.apply:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, BACKUP_DIR / path.name)
            data["amenities"] = kept
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{'Applied' if args.apply else 'Dry run'}: {total_dropped} amenity entries flagged across all jobs.")
    if not args.apply:
        print("Re-run with --apply to write changes (originals backed up to jobs_amenities_backup/).")


if __name__ == "__main__":
    main()

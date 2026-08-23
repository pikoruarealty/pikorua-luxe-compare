"""One-off backfill: apply `recover_carpet_area_from_label` to job JSONs that
were extracted before that step existed.

New extractions get this inside `normalize()`, so this script exists only to
bring the already-extracted corpus up to the same state. It imports the very
same function rather than reimplementing the regex, so the backfilled files and
any future extraction cannot drift apart.

    python -m scripts.backfill_carpet_area            # report only
    python -m scripts.backfill_carpet_area --apply    # rewrite the job files

Run from the backend directory. Idempotent: a variant whose carpet_area is
already filled is skipped, so re-running changes nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.normalizer import recover_carpet_area_from_label  # noqa: E402
from app.schema import PropertyExtraction  # noqa: E402

JOBS_DIR = Path(__file__).resolve().parents[1] / "storage" / "jobs"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="rewrite the job files; without it nothing is written",
    )
    args = parser.parse_args()

    changed_files = 0
    changed_variants = 0

    for path in sorted(JOBS_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            print(f"skip {path.name}: unreadable ({exc})")
            continue
        # A job file is the extraction payload itself; anything that does not
        # parse as one (a manifest, a stray file) is not ours to touch.
        try:
            extraction = PropertyExtraction.model_validate(payload)
        except Exception as exc:  # noqa: BLE001 - pydantic raises its own type
            print(f"skip {path.name}: not an extraction ({type(exc).__name__})")
            continue

        before = [v.carpet_area.found for v in extraction.configurations]
        recover_carpet_area_from_label(extraction)
        after = [v.carpet_area.found for v in extraction.configurations]

        filled = [i for i, (b, a) in enumerate(zip(before, after)) if a and not b]
        if not filled:
            continue

        changed_files += 1
        changed_variants += len(filled)
        for i in filled:
            variant = extraction.configurations[i]
            print(
                f"{path.name}[{i}] carpet_area = {variant.carpet_area.value!r}"
                f"  <- {variant.variant_label.value!r}"
            )

        if args.apply:
            path.write_text(
                json.dumps(extraction.model_dump(mode="json"), indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    verb = "filled" if args.apply else "would fill"
    print(f"\n{verb} {changed_variants} carpet areas across {changed_files} files")
    if not args.apply and changed_variants:
        print("re-run with --apply to write them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

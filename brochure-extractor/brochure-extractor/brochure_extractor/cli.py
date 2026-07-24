"""
    python -m brochure_extractor.cli ikebana.pdf rera.pdf -o out.json
    python -m brochure_extractor.cli ./brochures --images-dir ./out_images
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from .pipeline import extract_from_dir, extract_property


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract Add Property fields from brochure PDFs")
    parser.add_argument("inputs", nargs="+", help="PDF paths, or one folder of PDFs")
    parser.add_argument("-o", "--out", default="extraction.json", help="Output JSON path")
    parser.add_argument("--no-images", action="store_true", help="Skip photo extraction")
    parser.add_argument("--images-dir", default=None, help="Where to save extracted photos")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")

    kwargs = {"with_images": not args.no_images, "image_out_dir": args.images_dir}
    if len(args.inputs) == 1 and os.path.isdir(args.inputs[0]):
        result = extract_from_dir(args.inputs[0], **kwargs)
    else:
        missing = [p for p in args.inputs if not os.path.isfile(p)]
        if missing:
            print(f"Not found: {', '.join(missing)}", file=sys.stderr)
            return 1
        result = extract_property(args.inputs, **kwargs)

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False)

    stats = result["completeness"]
    print(f"\nSaved {args.out}")
    print(f"  filled       : {stats['fields_filled']}/{stats['fields_total']} ({stats['percent']}%)")
    print(f"  layouts      : {stats['configurations_found']}")
    print(f"  amenities    : {stats['amenities_found']}")
    print(f"  conflicts    : {len(result['conflicts'])}")
    print(f"  needs review : {len(result['needs_review'])}")
    if result["missing_required"]:
        print(f"  MISSING      : {', '.join(result['missing_required'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

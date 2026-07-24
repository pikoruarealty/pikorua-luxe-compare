"""Pull photos out of the PDFs and fill the cover / living room / master
bedroom / pool / clubhouse slots automatically.

The model only ever *labels* images it is shown; it never invents a URL.
Anything it is unsure about lands in `unassigned` for manual pick.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import uuid

from .config import settings
from .schema import IMAGE_SLOTS

log = logging.getLogger(__name__)

MAX_CANDIDATES = 24
_PROMPT = f"""You are labelling photos pulled from a real-estate brochure.

For each numbered image return one label from:
{", ".join(IMAGE_SLOTS)}, exterior, floor_plan, location_map, amenity, logo, other

Rules:
- cover = the hero exterior/night render of the tower used on the front page
- living_room / master_bedroom = interior renders of those rooms only
- pool = swimming pool. clubhouse = clubhouse interior or its facade
- floor plans, site maps, logos and text pages are never cover/living_room/etc
- quality 0-1: how usable it is as a website gallery image (crops, watermarks, low detail lower it)

Return ONLY JSON: {{"labels":[{{"index":0,"label":"cover","quality":0.9}}]}}"""


def _thumb(raw: bytes, ext: str) -> str | None:
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((768, 768))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as exc:  # noqa: BLE001
        log.debug("thumbnail failed (%s); sending original", exc)
        try:
            return base64.b64encode(raw).decode()
        except Exception:
            return None


def save_images(images: list[dict], out_dir: str | None = None, prefix: str = "") -> list[dict]:
    out_dir = out_dir or settings.image_out_dir
    os.makedirs(out_dir, exist_ok=True)
    saved: list[dict] = []
    for image in images:
        name = f"{prefix}{uuid.uuid4().hex[:10]}.{image['ext']}"
        path = os.path.join(out_dir, name)
        with open(path, "wb") as handle:
            handle.write(image["bytes"])
        saved.append(
            {
                "file_name": name,
                "path": path,
                "source_file": image["source_file"],
                "page": image["page"],
                "width": image["width"],
                "height": image["height"],
            }
        )
    return saved


def classify(images: list[dict], client=None) -> dict:
    """-> {"images": {slot: {...}|None}, "unassigned": [...]}"""
    result = {"images": {slot: None for slot in IMAGE_SLOTS}, "unassigned": []}
    if not images:
        return result

    ranked = sorted(images, key=lambda i: (i.get("width") or 0) * (i.get("height") or 0), reverse=True)
    shortlist = ranked[:MAX_CANDIDATES]

    labels: list[dict] = []
    try:
        from .extractor import _client

        client = client or _client()
        content: list[dict] = [{"type": "text", "text": _PROMPT}]
        for index, image in enumerate(shortlist):
            b64 = _thumb(image["bytes"], image["ext"])
            if not b64:
                continue
            content.append({"type": "text", "text": f"Image {index} (page {image['page']} of {image['source_file']})"})
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"}})

        resp = client.chat.completions.create(
            model=settings.vision_tag_model,
            temperature=0,
            max_tokens=1500,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": content}],
        )
        labels = json.loads(resp.choices[0].message.content).get("labels", [])
    except Exception as exc:  # noqa: BLE001 - classification is best effort
        log.warning("image classification skipped: %s", exc)

    best: dict[str, tuple[float, int]] = {}
    labelled: dict[int, str] = {}
    for row in labels:
        try:
            index = int(row.get("index"))
            label = str(row.get("label", "")).strip()
            quality = float(row.get("quality") or 0)
        except (TypeError, ValueError):
            continue
        if index >= len(shortlist):
            continue
        labelled[index] = label
        if label in IMAGE_SLOTS and quality >= 0.4:
            if label not in best or quality > best[label][0]:
                best[label] = (quality, index)

    used = set()
    for slot, (quality, index) in best.items():
        image = shortlist[index]
        result["images"][slot] = {
            "file_name": image.get("file_name"),
            "path": image.get("path"),
            "source_file": image["source_file"],
            "page": image["page"],
            "quality": round(quality, 2),
        }
        used.add(index)

    for index, image in enumerate(shortlist):
        if index in used:
            continue
        result["unassigned"].append(
            {
                "file_name": image.get("file_name"),
                "path": image.get("path"),
                "source_file": image["source_file"],
                "page": image["page"],
                "guess": labelled.get(index, "other"),
            }
        )
    return result

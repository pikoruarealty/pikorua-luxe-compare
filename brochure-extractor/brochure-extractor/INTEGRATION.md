# Integration guide (for the developer portal)

Everything you need to wire the "Upload brochure → auto-fill Add Property" flow.
You don't need to read the Python.

---

## 1. Run the service

```bash
cp .env.example .env        # set OPENAI_API_KEY and SERVICE_API_KEY
./run.sh                    # http://localhost:8000
```

or `docker build -t brochure-extractor . && docker run -p 8000:8000 --env-file .env brochure-extractor`

Set `ALLOWED_ORIGINS` to the portal origin, and `SERVICE_API_KEY` to a shared
secret. Call it **from your backend**, not the browser — that key must not ship
to the client.

Interactive docs: `http://localhost:8000/docs`

---

## 2. Endpoints

| Method | Path                | Notes                                                                   |
| ------ | ------------------- | ----------------------------------------------------------------------- |
| POST   | `/v1/extract`       | multipart `files` (repeatable). Blocks 25–60 s, returns the full result |
| POST   | `/v1/extract/async` | same input, returns `{job_id}` immediately                              |
| GET    | `/v1/jobs/{job_id}` | `queued` → `running` → `done` (with `result`) / `error`                 |
| GET    | `/v1/schema`        | field list + descriptions — render your form from this                  |
| GET    | `/health`           | liveness + whether the OpenAI key loaded                                |
| GET    | `/images/{file}`    | photos pulled out of the PDFs                                           |

All except `/health` and `/v1/schema` need the header `X-API-Key: <SERVICE_API_KEY>`.
Query param `?with_images=false` skips photo extraction (faster, cheaper).

Use the async endpoint if your host has a request timeout under 60 s (Vercel,
most API gateways).

---

## 3. Response shape

```jsonc
{
  "form_payload": {            // ← the one you actually bind to the form
    "property_name": "Ikebana",
    "developer": "Gala",
    "category": "Apartment",
    "status": "Near Possession",
    "possession": "9 Months",
    "possession_confirmed_as_of": "12-03-2026",
    "location": "Sindhu Bhavan Road",
    "city": "Ahmedabad",
    "state": "Gujarat",
    "tagline": "...",
    "expert_note": "...",
    "plot_size": "5400 sq ft",
    "available_bhk_types": ["4 BHK", "5 BHK"],
    "total_towers": 3, "total_floors": 24, "units_per_floor": 4, "total_units": 96,
    "rera_id": "PR/GJ/AHMEDABAD/...", "rera_link": "https://gujrera...",
    "proposed_start_date": "Jan 2025",
    "parking_levels": 2, "podium_structure": "2-Level Podium", "lifts_per_tower": 3,
    "open_space": "70% Open Area", "geyser_heat_pump": "...", "vrv_ac": "...",
    "window_glasses": "...", "bath_sanitary_fittings": "Kohler, Jaquar",
    "flooring": "Italian marble", "density_units_per_acre": 18,
    "construction_quality": "RCC framed structure", "internal_ceiling_height": "10 ft",
    "clubhouse_size": "15000 sq ft",
    "experience_years": 25, "total_delivered_projects": 40, "ongoing_projects": 6,
    "background": "...", "notable_delivered_projects": ["Godrej Garden City"],
    "configurations": [
      { "bhk_type": "4 BHK", "variant_name": "Type A", "carpet_area": "2450 sq ft",
        "super_built_up_area": "3200 sq ft", "bathrooms": 4, "balconies": 2,
        "servant_room": "Yes", "price": "₹ 3.75 Cr", "floor_plan_page": 12 }
    ],
    "amenities": ["Infinity Pool", "Gym"],
    "highlights": ["Handover within 9 months"],
    "images": { "cover": "/images/ab12.jpg", "living_room": null,
                "master_bedroom": null, "pool": "/images/cd34.jpg", "clubhouse": null }
  },

  "property": { /* same data, grouped by form section */ },

  "field_meta": {
    "basics.property_name": {
      "confidence": 0.98,
      "source": { "file": "ikebana-brochure.pdf", "page": 1 },
      "snippet": "IKEBANA",
      "agreement": 2,
      "alternatives": []
    }
  },

  "conflicts": [
    { "field": "project_structure.total_floors", "chosen": 24,
      "rejected": [{ "value": 25, "confidence": 0.55,
                     "source": { "file": "teaser.pdf", "page": 4 } }] }
  ],

  "needs_review": ["construction_amenities.flooring"],
  "missing_required": ["basics.status"],
  "image_pool": [ { "url": "/images/ef56.jpg", "page": 7, "guess": "exterior" } ],
  "completeness": { "fields_filled": 31, "fields_total": 38, "percent": 81.6,
                    "configurations_found": 2, "amenities_found": 14 },
  "meta": { "files": [...], "model": "gpt-4.1-mini", "seconds": 38.4 }
}
```

`form_payload` keys are exactly the form's field names, so binding is a spread —
no mapping table to maintain.

---

## 4. UX that makes this actually reliable

The model is good, not perfect. Please don't auto-save the result. Three cheap
things make the difference:

1. **Prefill, then let the user confirm.** Show the form filled in, with a Save
   button. This is a draft, not a submission.
2. **Badge every field from `field_meta`.**
   `confidence >= 0.85` green · `0.6–0.85` amber · `< 0.6` red.
   Show `snippet` + `source.file p.N` in a tooltip so the reviewer can verify in
   two seconds instead of reopening the PDF.
3. **Surface `conflicts` and `missing_required` at the top.** A conflict means
   two documents disagreed — that's exactly the thing a human should settle,
   and it's where wrong data would otherwise slip in silently.

`needs_review` is a ready-made "check these first" list.

---

## 5. Frontend sketch

```tsx
import type { ExtractionResult } from "./types/property";

async function autofill(files: File[]) {
  const body = new FormData();
  files.forEach((f) => body.append("files", f));

  const res = await fetch("/api/brochure/extract", { method: "POST", body });
  if (!res.ok) throw new Error((await res.json()).error ?? "Extraction failed");

  const data: ExtractionResult = await res.json();
  setForm((prev) => ({ ...prev, ...data.form_payload })); // prefill
  setMeta(data.field_meta);
  setConflicts(data.conflicts);
  setReview(new Set(data.needs_review));
}
```

Your `/api/brochure/extract` route just proxies to the service and adds
`X-API-Key`.

Async version:

```ts
const { job_id } = await post("/v1/extract/async", body);
const poll = setInterval(async () => {
  const job = await get(`/v1/jobs/${job_id}`);
  if (job.status === "done") {
    clearInterval(poll);
    apply(job.result);
  }
  if (job.status === "error") {
    clearInterval(poll);
    toast(job.error);
  }
}, 3000);
```

---

## 6. Images

Photos found inside the PDFs are saved to `IMAGE_OUT_DIR` and served at
`/images/...`. The five slots are auto-filled where the model is confident;
everything else lands in `image_pool` with a `guess` label — render that as a
picker so the reviewer can drag one into an empty slot.

For production, point `IMAGE_OUT_DIR` at a mounted volume or swap
`save_images()` in `brochure_extractor/images.py` for an S3/Supabase Storage
upload and set `PUBLIC_IMAGE_BASE` to the CDN URL. That's a ~10-line change.

---

## 7. Errors

| Status                               | Meaning                    | Fix                             |
| ------------------------------------ | -------------------------- | ------------------------------- |
| 400                                  | non-PDF uploaded / no file | validate on the client too      |
| 401                                  | bad `X-API-Key`            | check env on both sides         |
| 500 `OPENAI_API_KEY is not set`      | env not loaded             | `.env` / container env          |
| 500 `... is 52.3 MB, limit is 40 MB` | oversized PDF              | raise `MAX_FILE_MB` or compress |
| 500 after retries                    | OpenAI rate limit / outage | retry; raise `MAX_RETRIES`      |

Failures are per-request; nothing is written anywhere, so a retry is always safe.

---

## 8. Contract note

If you add a field to the Add Property form, tell me — one line in
`brochure_extractor/schema.py` covers the model, the normaliser, the merger,
`/v1/schema` and the TS types. Please don't hand-patch the output JSON on your
side; it'll drift.

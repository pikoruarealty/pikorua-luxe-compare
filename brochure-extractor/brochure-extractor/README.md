# Brochure Extractor

Upload 1..N property PDFs (brochure + RERA certificate + price list + floor plans)
→ get back one JSON that fills the **Add Property** form, with a confidence score,
page-level provenance and a conflict list for every field.

Built to be dropped into the developer portal as a service. Nothing here touches
the admin panel or the website.

---

## How it works

```
PDF ──► PyMuPDF text layer ─┐
    └─► page render @150dpi ┴─► chunk (6 pages) ─► gpt-4.1-mini vision
                                                     (strict JSON schema)
                                                          │
              embedded photos ─► auto-label slots         │
                                                          ▼
                                       normalise ─► merge across files
                                                          │
                                                          ▼
                                   property + form_payload + conflicts
```

Design decisions worth knowing:

- **Vision, not plain OCR.** Brochures are 80% design — specs live inside tables,
  floor plans and image overlays that a text layer misses entirely. Every page is
  sent as an image _and_ as text. Tesseract is used only as an extra signal on
  scanned pages, and is optional.
- **Strict JSON schema.** The model physically cannot return a field we don't
  know about or skip one we do — no fragile response parsing.
- **Evidence-or-null.** The prompt forces an evidence row (page + verbatim
  snippet + confidence) for every filled field. No evidence ⇒ the field stays
  null. This is what stops hallucinated RERA numbers and invented clubhouse sizes.
- **Multi-file merge with source weighting.** A RERA certificate outranks a
  teaser on floor counts; a price list outranks a brochure on rates. Losing
  values are returned in `conflicts[]` instead of being thrown away, so the
  reviewer decides.
- **Nothing auto-publishes.** Output is a draft for the developer portal's
  review screen.

## Setup

```bash
cp .env.example .env      # put OPENAI_API_KEY in it
./run.sh                  # venv + deps + server on :8000
```

Docker:

```bash
docker build -t brochure-extractor .
docker run -p 8000:8000 --env-file .env brochure-extractor
```

## Use it

CLI:

```bash
python -m brochure_extractor.cli ikebana.pdf rera.pdf -o out.json
python -m brochure_extractor.cli ./brochures --images-dir ./photos
```

HTTP:

```bash
curl -X POST http://localhost:8000/v1/extract \
  -H "X-API-Key: $SERVICE_API_KEY" \
  -F "files=@ikebana-brochure.pdf" \
  -F "files=@rera-certificate.pdf"
```

Python:

```python
from brochure_extractor import extract_property
result = extract_property(["ikebana.pdf", "rera.pdf"])
print(result["form_payload"]["property_name"])
```

Full endpoint + response docs: **[INTEGRATION.md](INTEGRATION.md)**
TypeScript types: **[types/property.d.ts](types/property.d.ts)**

## Adding or renaming a field

Edit `brochure_extractor/schema.py` only — the LLM schema, the normaliser, the
merger, the API `/v1/schema` response and the TS types all regenerate from it.
Then `python tools/gen_types.py`.

## Tuning

| Symptom                         | Change                                                                |
| ------------------------------- | --------------------------------------------------------------------- |
| Misses specs in dense tables    | `RENDER_DPI=200`, `PAGES_PER_CHUNK=4`                                 |
| Too slow                        | `PARALLEL_CHUNKS=8`, `RENDER_DPI=120`                                 |
| Bad on scanned/photocopied PDFs | `EXTRACTOR_MODEL=gpt-4o`, install tesseract                           |
| Cost too high                   | `PAGES_PER_CHUNK=8`, `MAX_PAGES_PER_FILE=30`                          |
| Too many nulls                  | lower `MIN_CONFIDENCE` (only changes what's flagged, not what's kept) |

Rough numbers for a 24-page brochure at default settings: ~4 chunk calls,
25–45 s wall clock with parallelism, a few rupees of tokens per property.
Measure on your own brochures before promising anything.

## Tests

```bash
python tests/test_offline.py    # no API key needed - schema, normaliser, merger
```

## Known limits

- Prices are frequently absent from Indian brochures by design; expect nulls.
- `density_units_per_acre` is only computed when both inputs are printed.
- Image auto-labelling is best-effort; everything unassigned comes back in
  `image_pool` for manual pick.
- Job state for `/v1/extract/async` is in-memory — fine for one worker, swap for
  Redis before scaling out.

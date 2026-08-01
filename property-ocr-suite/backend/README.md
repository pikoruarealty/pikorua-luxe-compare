# Backend — architecture notes

## Pipeline

```
PDF(s) → pdf_reader.py → extractor.py → merger.py → normalizer.py → PropertyExtraction
         (text+image        (vision LLM,     (combine multi-  (dates,
          per page)          batched pages,    file results)    numbers)
                              evidence-or-
                              null JSON)
```

- **pdf_reader.py** — pulls the text layer with PyMuPDF, renders each
  page to a JPEG, and runs Tesseract OCR as a fallback only when a
  page's text layer looks too thin to trust (scanned pages, or pages
  that are basically one big graphic). Also extracts embedded images
  as candidates for the Images section.

  Pages are capped at `MAX_IMAGE_LONG_SIDE` (1600px) because vision
  models downsample past that anyway — an uncapped large-format spread
  is ~9MB of PNG that only slows the call down. Floor plans are the
  exception: their whole payload is small type scattered over a
  drawing, so pages detected as plans (`looks_like_floor_plan` — a
  density of `11'9" X 14'0"` strings, or a plan-ish page title for
  sheets whose labels are vector artwork) get
  `FLOORPLAN_IMAGE_LONG_SIDE` (2600px) and a higher JPEG quality.

- **prompts.py** — the entire "don't hallucinate" contract lives here.
  The model is told, explicitly: omit any field with no evidence on
  these pages, never infer a total by multiplying other numbers
  yourself, always cite a page + verbatim snippet, and be honest about
  confidence. Everything downstream trusts this contract rather than
  re-verifying it.

- **extractor.py** — batches pages (default 3 per LLM call — brochures
  are usually short enough that a handful of calls covers the whole
  thing), calls whichever provider you configured, and applies the
  confidence floor (`CONFIDENCE_FLOOR` in `.env`, default 0.55) — below
  that, a field is treated as not-found rather than shown pre-filled.
  A failed batch doesn't kill the whole job; it gets logged into
  `warnings` and surfaces in the frontend so you know which pages to
  eyeball manually.

- **merger.py** — when you upload multiple PDFs (brochure + RERA
  certificate + price list, say), each is extracted independently
  and then merged. Highest confidence wins per field, EXCEPT RERA
  fields, which prefer whichever source file looks like the actual
  RERA certificate (filename contains "rera"/"certificate"/
  "registration") regardless of the brochure's confidence — a RERA ID
  hand-typed on a marketing brochure is a real typo risk.

  Unit layouts are keyed on BHK type + unit label + **floor series**.
  That last part matters: one plan sheet routinely draws "Unit A" twice
  as mirrored series (101-1101 and 102-1102) whose room sizes genuinely
  differ, so keying without it would silently discard a real layout.

- **Room dimensions** — each unit layout carries a `rooms` list of
  `{room_name, dimension}` read off the plan. `dimension` is kept as
  the VERBATIM printed string (`11'9" X 14'0"`), never converted to
  sq ft or reformatted — a buyer comparing layouts is reading the same
  drawing, so the number on screen has to match the number on paper.
  `normalizer.py` deliberately does not touch these.

  After extraction, `_validate_room_dimensions` cross-checks every
  reported size against that page's own text layer, which for a
  vector-drawn plan is ground truth. A size that appears nowhere on
  the page is a misread (transposed digit, a number borrowed from the
  neighbouring unit): it is kept — the room is probably real — but its
  confidence is dropped to 0.35 and it is named in `warnings`, so it
  surfaces for review instead of passing as fact. On the sample
  19-page brochure this caught 1 bad size out of 141. Pages with no
  text layer can't be checked this way and are left alone rather than
  penalised.

- **normalizer.py** — a safety net, not the primary mechanism. The
  prompt already asks the model to normalize dates/numbers; this
  cleans up the common cases (dd-mm-yyyy dates, stripped currency
  symbols) in code so formatting doesn't depend entirely on the model
  getting it right every time.

## Extending the field list

Every field lives in exactly 3 places — add it to all 3 and it flows
through the whole pipeline automatically:

1. `app/schema.py` — add the field to the relevant section class.
2. `app/prompts.py` — add it to `FIELD_SCHEMA_HINT` so the model knows
   to look for it.
3. `app/extractor.py` — add the key to whichever `for key in ...`
   loop matches its section in `_merge_batch_into`.
4. `frontend/app.js` — add `{ key, label, example }` to the matching
   array in `FIELD_CONFIGS`.

## Switching LLM provider

Set `LLM_PROVIDER=anthropic` (or `openai`) in `.env` — that's it,
`extractor.py` branches on this at call time. Both providers get the
exact same prompt and page images, so output shape is identical either
way.

## Deploying for real (beyond localhost)

- Set a real `SERVICE_API_KEY` in `.env` and send the same value as
  the `X-Service-Key` header from whatever calls this API.
- Tighten `allow_origins` in `app/main.py` (currently `["*"]`) to your
  actual frontend's origin.
- `storage/` holds uploaded PDFs, extracted images, and saved job
  JSON on local disk — fine for one server, but swap for S3/GCS +
  a real database if this needs to run on more than one instance.
- Nothing here is async-job-queued — extraction runs synchronously
  inside the request. Fine for brochures up to ~40 pages (the default
  cap); for bulk/batch imports, wrap `extract_from_pages` in a
  background task queue (Celery, RQ, etc.) instead.

# Property Brochure OCR — Add Property review tool

Upload one or more property PDFs (brochure, RERA certificate, price
list, floor plan) → it reads them with OCR + a vision LLM → the
extracted data pre-fills the exact "Add Property" form, field by
field, each one tagged with a page number + confidence so you can
tick-verify it in one glance. Anything it couldn't find is left blank
for manual entry — nothing is ever guessed or fabricated.

```
property-ocr-suite/
├── backend/     FastAPI service that does the actual OCR + extraction
└── frontend/    The review screen — checkboxes, edit, images, all of it
```

## 1. Backend setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# open .env and paste in ONE of:
#   OPENAI_API_KEY=sk-...      (leave LLM_PROVIDER=openai)
#   ANTHROPIC_API_KEY=sk-ant-... (set LLM_PROVIDER=anthropic)

uvicorn app.main:app --reload --port 8000
```

Sanity check it's alive: open http://localhost:8000/api/health — should
return `{"status":"ok",...}`. Interactive API docs at
http://localhost:8000/docs.

Run the offline tests any time (no API key needed, no network calls):
```bash
cd backend && python -m pytest tests/ -v
```

## 2. Frontend setup

No build step — it's plain HTML/CSS/JS.

```bash
cd frontend
python3 -m http.server 5500
```

Open http://localhost:5500 in a browser. If your backend isn't on
`localhost:8000`, edit the top of `frontend/app.js`:

```js
const API_BASE = "http://localhost:8000";
const SERVICE_KEY = ""; // only needed if you set SERVICE_API_KEY in .env
```

## 3. Using it

1. Drop in the PDF(s) for one property and hit **Extract from
   brochure** — or click **No brochure — fill in manually** if you're
   starting from scratch.
2. Every field either shows up pre-filled with a checkbox + a small
   tag like `p.4 · 92%` (hover it to see the exact sentence it came
   from), or sits blank with a dashed border waiting for you to type
   it in.
3. Tick the checkbox once you've confirmed a value is right. Edit
   inline if it's slightly off — you never have to re-extract.
4. Amenities, highlights, notable projects, and BHK configurations all
   work the same way — extracted ones are removable/editable chips,
   plus an "Add" box for anything OCR missed.
5. Images: candidates pulled straight out of the PDF show up in a
   strip at the bottom of the Images section — click one and pick
   which slot (cover / living room / pool / etc.) it belongs in.
   OCR never auto-assigns these; that judgment call stays with you.
6. **Create property** saves everything — ticked, edited, and
   manually-filled fields alike — back to the backend.

## Handing this to someone else's system

See `INTEGRATION.md` for the API contract (endpoints, auth, the exact
JSON shape) if you're wiring this into another portal instead of
using the frontend here directly.

## A note on accuracy

Vision-LLM extraction is very good at "this exact sentence says X" and
deliberately bad at "let me guess X" — that's enforced in the prompt,
not just hoped for. Still, brochures are inconsistent by nature (bad
scans, marketing fluff, tables baked into images at weird angles), so
treat every un-ticked field as a suggestion, not a fact, until you've
looked at the evidence snippet. If you run it against a handful of
real brochures and a category of field is consistently wrong or
consistently missed, that's a prompt-tuning fix in
`backend/app/prompts.py`, not a sign the whole approach is broken.

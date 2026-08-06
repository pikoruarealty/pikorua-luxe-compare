# Integration guide

For wiring this OCR service into a different frontend/portal instead
of using `frontend/` as-is.

## Auth

Every `/api/*` request needs header:
```
X-Service-Key: <value of SERVICE_API_KEY in backend/.env>
```
(If `SERVICE_API_KEY` is left empty in `.env`, auth is disabled —
convenient for local dev, not for anything public-facing.)

### Uploading from a browser

`POST /api/properties/extract` alone also accepts a short-lived signed
ticket, so a browser can send the file here directly without ever
holding the shared key:

```
Authorization: Bearer <unix-expiry>.<hex hmac-sha256 of that expiry>
```

signed with `SERVICE_API_KEY`. This exists because brochures run to
tens of megabytes while serverless hosts cap request bodies at a few
(Vercel: 4.5 MB) — relaying the file through your own server simply
cannot work at that size. Mint the ticket server-side, hand only the
ticket to the browser, and keep every other endpoint on the key.

An expired, re-timed or wrongly signed ticket is rejected, and a ticket
opens no endpoint but this one.

## Endpoints

### `POST /api/properties/extract`
Multipart form upload, one or more PDF files under the field name
`files`.

```
curl -X POST http://localhost:8000/api/properties/extract \
  -H "X-Service-Key: your-key" \
  -F "files=@brochure.pdf" \
  -F "files=@rera_certificate.pdf"
```

Returns:
```json
{
  "job_id": "5e446a91ebb5",
  "extraction": { ...full form_payload, see shape below... }
}
```

### `GET /api/properties/{job_id}`
Re-fetch a previously extracted/saved job. Same response shape as
above.

### `PATCH /api/properties/{job_id}`
Save the human-reviewed version.
```json
{ "extraction": { ...same shape, with your edits/verified flags... } }
```
Returns `{"job_id": "...", "status": "saved"}`. This also works as a
"create" call for a job_id that doesn't exist yet — the manual-entry
frontend flow uses this to save fully-manual properties that were
never extracted at all.

### `GET /api/images/{job_id}/{filename}`
Serves an embedded image pulled from a brochure page (the paths
returned in `image_candidates[].image_path` already point here).

## The `form_payload` shape

Every scalar field is wrapped, not a bare value:

```json
{
  "value": "Ikebana",
  "found": true,
  "confidence": 0.94,
  "source_file": "brochure.pdf",
  "source_page": 2,
  "evidence": "Welcome to Ikebana, an address on Sindhu Bhavan Road",
  "verified": false
}
```

- `found: false` means OCR didn't find it — `value` will be `null`.
  Render this as a blank input, not a missing-data error.
- `verified` is `false` until a human ticks a checkbox in your UI —
  the backend never sets this to `true` on its own. Treat `found:
  true, verified: false` as "needs a human look," not "done."
- `confidence` below `CONFIDENCE_FLOOR` (0.55 by default) is never
  returned as `found: true` — the backend already filtered those out.

Top-level keys: `basics`, `project_structure`, `rera`,
`construction_amenities`, `developer` (scalar fields +
`notable_delivered_projects` as a list of the same wrapped-field
shape), `configurations` (list of BHK variant rows), `amenities` /
`highlights` (lists of wrapped fields), `image_candidates` (list of
`{source_file, source_page, image_path, width, height}`), `images`
(plain `{cover, living_room, master_bedroom, pool, clubhouse}` URL
strings — never OCR-filled, always human-assigned).

Full field list and exact keys: see `backend/app/schema.py` — it's
the single source of truth this whole pipeline is generated from.

## If you're building your own review UI

The pattern that makes tick-verify-edit work: `verified` starts
`false` on every OCR-extracted field. A human confirms it one of two
ways — ticking the checkbox as-is, or editing the value directly
(which counts as a correction, so it auto-ticks `verified` too, no
separate click needed). Fields the human typed into a blank
(never-extracted) slot don't get a checkbox at all — there's nothing
to "verify" about typing your own data in. `frontend/app.js` does
exactly this in `renderScalarField` if you want a reference
implementation before writing your own.

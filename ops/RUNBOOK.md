# PropCompare deployment runbook

Ground truth for how PropCompare is actually deployed and where things live, as of 2026-08-26.
Only covers what's live now — see `PROGRESS.md` for the history of how it got this way (incidents,
replaced approaches, phase-by-phase migration notes).

## 1. Where things run

- **VM:** `instance-small-mumbai`, zone `asia-south1-a`, project `project-2f5d7375-d77f-44ae-b19`
  (numeric id `795659717457`). A **shared** VM — also runs HRM/PropSight natively alongside
  PropCompare's Docker containers. 2GB RAM (this is why builds moved off the VM, see §4).
- **Access:** IAP tunnel only — direct SSH (port 22 open to the internet) is closed by firewall.
  No one has standing shell access outside a session; every VM command has to be run explicitly.
  Repo lives at `/opt/propcompare` on the VM.
- **Containers** (one Postgres, two web slots, two OCR services, one nginx) run via Docker Compose
  from `docker-compose.production.yml`, on the `propcompare-production` network. `db` publishes no
  host port — it's reachable only from other containers on that network, never from outside.
- **The VM's service account is the default Compute Engine SA**
  (`795659717457-compute@developer.gserviceaccount.com`), *not* the `propcompare-runtime` SA that
  Terraform (`infra/terraform/main.tf`) declares for this purpose. Terraform's VM resource name
  (`propcompare-production-web`) also doesn't match the live VM name (`instance-small-mumbai`) —
  the live VM was provisioned outside/before this Terraform config. Terraform describes the
  *intended* design; treat PROGRESS.md and this file as the source of truth for what's actually
  running.

## 2. GCP resources in use

| Resource | Name / value | Purpose |
|---|---|---|
| Artifact Registry repo | `propcompare` (Docker, `asia-south1`) | holds `web`, `ocr-worker`, `ocr-api` images, tagged by commit SHA |
| GCS bucket (public) | `project-2f5d7375-d77f-44ae-b19-propcompare-images` | property images served directly (`https://storage.googleapis.com/<bucket>/...`), `allUsers: Storage Object Viewer` at bucket level |
| GCS bucket (private source) | value of `GCS_PRIVATE_SOURCE_BUCKET` in `propcompare-web-env` | private uploads (brochures etc.) — not publicly readable |
| Secret Manager | `propcompare-web-env` | newline-delimited env vars for `web-blue`/`web-green` (Supabase keys, session secret, Upstash, SMS, Maps, GCS bucket names, Sentry, feature flags) |
| Secret Manager | `propcompare-ocr-env` | env vars for `ocr-worker`/`ocr-api` (DB, GCS, model-provider creds) |
| Secret Manager | `propcompare-db-env` | `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` for the `db` container. Not declared in Terraform (a real gap — everything else is) |
| Service account (CI) | `propcompare-github-deploy@project-2f5d7375-d77f-44ae-b19.iam.gserviceaccount.com` | used by GitHub Actions via Workload Identity Federation to push images and SSH-deploy |
| Service account (VM, live) | `795659717457-compute@developer.gserviceaccount.com` | default Compute Engine SA the VM actually runs as |

**IAM grants that matter day to day:**
- CI SA → `Artifact Registry Writer` on the `propcompare` repo (push images)
- VM SA → `Artifact Registry Reader` on the `propcompare` repo (pull images)
- VM SA → Secret Manager accessor on the three `propcompare-*-env` secrets, plus GCS write access
  on the public images bucket (all granted manually/out-of-band — not all present in Terraform)

## 3. Secrets and env files

Nothing sensitive lives in the repo or in GitHub Actions secrets except the CI deploy identity.
Runtime secrets live in **Secret Manager** and are pulled onto the VM at deploy time:

```bash
# ops/fetch-secrets.sh — runs as part of every deploy
gcloud secrets versions access latest --secret=propcompare-web-env > /run/propcompare/web.env
gcloud secrets versions access latest --secret=propcompare-ocr-env > /run/propcompare/ocr.env
gcloud secrets versions access latest --secret=propcompare-db-env > /run/propcompare/db.env
chmod 600 /run/propcompare/web.env /run/propcompare/ocr.env /run/propcompare/db.env
```

`docker-compose.production.yml` points each service at the matching file via `env_file:`. These
files use `KEY="value"` (quoted) format — Docker Compose's `env_file` parser strips the quotes
correctly; **`docker run --env-file` does not** (see §6, debugging gotcha).

**GitHub Actions repo variables** (Settings → Secrets and variables → Actions → Variables):
`GCP_PROJECT_ID`, `GCP_VM_NAME`, `GCP_VM_ZONE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
`VITE_STAFF_MFA_ENFORCE` is deliberately **not** set here — it's not a real distinct secret (only
server-side `STAFF_MFA_ENFORCE` exists) and both the build and the deploy script already default it
to empty string when unset.

**GitHub Actions repo secrets:** `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`
(both used for WIF auth — no long-lived key ever leaves GCP), `DATABASE_URL_PRODUCTION` (only used
by the manual `migrate-production.yml` workflow, currently Supabase-pooler shaped — will need
updating once the DB migration off Supabase finishes).

## 4. CI/CD pipelines

### `deploy-shared-vm.yml` — the one that actually runs, on every push to `main`

```
push to main
  → verify (runs ci.yml: lint, tsc, test, schema/drift checks, build)
  → build-and-push (GitHub-hosted runner):
        auth via WIF → gcloud auth configure-docker asia-south1-docker.pkg.dev
        docker build + push:
          asia-south1-docker.pkg.dev/$PROJECT_ID/propcompare/web:$SHA
          asia-south1-docker.pkg.dev/$PROJECT_ID/propcompare/ocr-worker:$SHA
          asia-south1-docker.pkg.dev/$PROJECT_ID/propcompare/ocr-api:$SHA
  → deploy (concurrency-locked, one at a time):
        gcloud compute ssh instance-small-mumbai --tunnel-through-iap \
          --command="sudo bash /opt/propcompare/ops/deploy-shared-vm.sh '$WEB' '$OCR_WORKER' '$OCR_API'"
```

Images are built in CI, **not on the VM** — the VM only pulls. This was a deliberate fix
(2026-08-26): building 3 images locally on a 2GB shared VM alongside already-running containers
OOM-killed the build (exit 137). `ops/deploy-shared-vm.sh` on the VM then:
1. `git fetch && git reset --hard origin/main` (repo self-updates every deploy)
2. `fetch-secrets.sh`
3. `sed`-patches the three `*_IMAGE=` lines into `.env.deploy`
4. `docker compose pull` the three images, replays migrations via a throwaway
   `postgres:16-alpine` container, applies `ops/db/seed.sql`, then
   `docker compose up -d --no-deps db web-blue ocr-worker ocr-api`
5. `docker image prune -f`

Single-slot only — always `web-blue`, no blue/green swap on this path.

### `deploy-production.yml` — manual, blue/green, currently unused in practice

`workflow_dispatch` with a `slot` input (`blue`/`green`), gated by a GitHub `production` environment
approval. Builds `web` + `ocr-worker` (not `ocr-api`), scp's `docker-compose.production.yml` + `ops/`
to the VM, then runs `ops/install-release.sh` → `ops/deploy-slot.sh`, which pulls the new slot, polls
`/readyz`, flips `ops/nginx/active-upstream.conf`, reloads nginx. Rollback: `ops/rollback-slot.sh
blue|green` — instant, no health check, just flips nginx back.

This pipeline exists and works structurally but references the same Artifact Registry repo that
didn't exist until 2026-08-26, so it likely has never been run successfully end-to-end.

### `ci.yml` — reusable, called by the above and on every PR
`lint`, `tsc --noEmit`, `test`, `check`, `schema:check`, `db:drift`, `build`,
`check:built-leakage` for the web app; `pytest` for the OCR backend; a Supabase-CLI-based
migration-replay check; a throwaway container build check.

### `migrate-production.yml` — manual, separate from app deploy
`workflow_dispatch` only, runs `supabase db push --db-url "$DATABASE_URL_PRODUCTION" --include-all`.
DB schema changes are never bundled into an app deploy.

## 5. Docker Compose services (`docker-compose.production.yml`)

| Service | Image | Port | Mem | env_file |
|---|---|---|---|---|
| `db` | `postgres:16-alpine` | none published | 512m | `db.env` |
| `web-blue` / `web-green` | `${WEB_BLUE_IMAGE}` / `${WEB_GREEN_IMAGE}` | 3000, internal only | 512m each | `web.env` |
| `ocr-worker` | `${OCR_WORKER_IMAGE}` | none | 1g | `ocr.env` |
| `ocr-api` | `${OCR_API_IMAGE}` | 8000, internal only | 512m | `ocr.env` |
| `nginx` | `nginx:1.29-alpine` | 80/443 published to host | 128m | none (`environment:` only) |

nginx is the only thing exposed to the internet; it proxies to whichever `web-*` slot
`ops/nginx/active-upstream.conf` currently names (`server web-blue:3000;` at present). TLS certs
come from `/etc/letsencrypt/live/${PROPCOMPARE_DOMAIN}/`.

`docker-compose.override.yml` is referenced by `ops/deploy-shared-vm.sh` but **does not exist in
this repo** — it must be a VM-local, untracked file (or the `-f` reference is currently a no-op).
Verify directly on the VM if this matters (`ls -la /opt/propcompare/docker-compose.override.yml`).

## 6. Common debugging commands (run via IAP SSH on the VM)

```bash
# Get a shell on the VM
gcloud compute ssh instance-small-mumbai --project project-2f5d7375-d77f-44ae-b19 \
  --zone asia-south1-a --tunnel-through-iap

# Container status / logs
cd /opt/propcompare
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml ps
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml logs -f web-blue
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml logs -f ocr-worker

# Which slot is live
cat ops/nginx/active-upstream.conf

# Memory / OOM check (this is what caught the build-on-VM OOM)
free -h
sudo docker ps -a
sudo dmesg -T | grep -i "killed process"

# Run a one-off script against production data (see scripts/migrate-property-images-to-gcs.ts
# for a worked example). docker run --env-file does NOT strip quotes from KEY="value" secrets —
# source the file as a shell script instead:
sudo docker run --rm \
  --network propcompare-production \
  -v /opt/propcompare:/repo -w /repo \
  -v /run/propcompare:/run/propcompare:ro \
  oven/bun:1.3.14-alpine \
  sh -c "set -a; . /run/propcompare/web.env; set +a; bun install --frozen-lockfile && bun scripts/<script>.ts"

# psql into production DB (db publishes no host port — must go through a container on the network)
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml \
  exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Manual rollback to the other blue/green slot (only meaningful after a deploy-production.yml run)
sudo sh ops/rollback-slot.sh blue   # or green

# Re-pull secrets without redeploying (e.g. after rotating a value in Secret Manager)
sudo bash ops/fetch-secrets.sh
```

**Local dev Postgres is not a tunnel into production.** `127.0.0.1:5433` locally is a native
Windows Postgres install with its own data — a different database from the VM's `db` container,
which publishes no host port at all. There is no way to reach production Postgres except by running
something on the VM itself.

## 7. Known gaps / discrepancies (worth resolving, not blocking)

- VM's live service account (default Compute SA) doesn't match Terraform's declared
  `propcompare-runtime` SA — either apply Terraform's SA to the VM, or update Terraform to match
  reality.
- `propcompare-db-env` Secret Manager secret is fetched by `ops/fetch-secrets.sh` but not declared
  in `infra/terraform/main.tf` (the other two are).
- `docker-compose.override.yml` referenced by `ops/deploy-shared-vm.sh` isn't in the repo — confirm
  whether it exists on the VM or the reference is dead.
- `deploy-production.yml` (blue/green manual pipeline) has likely never been run successfully
  end-to-end against real infra — the Artifact Registry repo it depends on didn't exist until
  2026-08-26.

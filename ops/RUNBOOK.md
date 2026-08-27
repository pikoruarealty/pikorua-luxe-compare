# PropCompare deployment runbook

Ground truth for the live deployment as of 2026-08-27. This is a shared VM;
`PROGRESS.md` records migration history and this file records current operation.

## Where it runs

- **VM:** `instance-small-mumbai`, zone `asia-south1-a`, project
  `project-2f5d7375-d77f-44ae-b19`. Repository: `/opt/propcompare`.
- **Access:** IAP SSH only. Run all VM commands explicitly in the active IAP
  session.
- **Containers:** self-hosted Postgres, `web-blue`, OCR API/worker, and nginx
  run through `docker-compose.production.yml` on `propcompare-production`.
  Postgres is internal-only; nginx is the public HTTP/HTTPS entry point.
- **Public property media:** GCS bucket
  `project-2f5d7375-d77f-44ae-b19-propcompare-images`.
- **Authentication:** Better Auth, backed by the self-hosted Postgres database.

## Secrets

Runtime secrets are stored in Secret Manager and fetched to `/run/propcompare`
on every deployment:

```bash
sudo bash ops/fetch-secrets.sh
```

This creates `web.env`, `ocr.env`, and `db.env`, each mode `0600`.
`web.env` includes `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SESSION_SECRET`,
GCS, Upstash, SMS, Maps, Sentry, and feature-flag values. Do not print or
commit those files.

GitHub repository variables are `GCP_PROJECT_ID`, `GCP_VM_NAME`, and
`GCP_VM_ZONE`. The deploy identity uses
`GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` secrets.

## Deployment

Every push to `main` runs `deploy-shared-vm.yml`:

1. CI runs lint, type checking, tests, schema checks, and production build.
2. GitHub Actions builds and pushes immutable web and OCR images to Artifact
   Registry.
3. The deployment job connects to the VM through IAP and executes
   `ops/deploy-shared-vm.sh`.
4. The script resets `/opt/propcompare` to `origin/main`, fetches secrets,
   pulls images, applies every unapplied database migration with
   `ops/db/migrate.sh`, seeds idempotent data, and restarts `web-blue` and OCR
   services.

There is no separate hosted-database migration workflow. Schema migrations are
part of the shared-VM deployment and run before updated application containers
start.

Images are built in CI, not on the 2 GB VM. `web-blue` is the single active
application slot on this deployment path. The older manual blue/green workflow
is retained only as a recovery path and is not the normal release mechanism.

## Verification and debugging

```bash
cd /opt/propcompare

# Service state and application logs
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml ps
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml logs --tail=100 web-blue

# Internal application health
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml \
  exec -T web-blue wget -S -qO- http://127.0.0.1:3000/healthz
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml \
  exec -T web-blue wget -S -qO- http://127.0.0.1:3000/readyz

# Production database shell (the DB has no host port)
sudo docker compose --env-file .env.deploy -f docker-compose.production.yml \
  exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Inspect current host nginx proxy configuration
sudo nginx -T
```

To run an approved one-off Bun script against production, source the runtime
environment inside the container. `docker run --env-file` does not correctly
handle the quoted Secret Manager format:

```bash
sudo docker run --rm --network propcompare-production \
  -v /opt/propcompare:/repo -w /repo \
  -v /run/propcompare:/run/propcompare:ro \
  oven/bun:1.3.14-alpine \
  sh -c "set -a; . /run/propcompare/web.env; set +a; bun install --frozen-lockfile && bun scripts/<script>.ts"
```

## Known operational gaps

- The live VM uses the default Compute Engine service account, while Terraform
  describes a separate intended runtime account.
- `propcompare-db-env` is fetched at deployment but is not fully declared in
  the Terraform configuration.
- `docker-compose.override.yml` is VM-local and untracked; confirm it exists
  before changing its use in the deploy script.

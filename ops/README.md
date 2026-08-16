# PropCompare production operations

This directory defines the initial stateless Mumbai GCP VM deployment. It does not create or
modify cloud resources by itself. Production provisioning and both GitHub workflows require the
owner-controlled `production` environment approval.

## Required cloud resources

- GCP project and `asia-south1` Artifact Registry repository named `propcompare`.
- One patched Compute Engine VM in Mumbai with only SSH/IAP, HTTP and HTTPS firewall access.
- VM service account with read-only Artifact Registry, Secret Manager accessor for the two named
  environment secrets, private GCS object access, and Ops Agent permissions.
- Private Mumbai/India GCS source/evidence bucket with uniform access, public access prevention,
  versioning and access logs. Approved public media uses a separate delivery bucket/CDN path.
- Separate production Supabase project and pooler URL. Do not reuse development credentials.
- Upstash Redis, Google Maps Platform server key restricted by API/quota, 2Factor.in, Sentry, and
  Pub/Sub/BigQuery resources with budget and failure alerts.

## Secret files

Secret Manager entries `propcompare-web-env` and `propcompare-ocr-env` contain newline-delimited
environment files. `fetch-secrets.sh` writes them to the tmpfs-style `/run/propcompare` path with
mode 0600. Neither Docker images nor this repository contain secrets. Required web values include
the production Supabase keys/pooler, session secret, Upstash, SMS, Google Maps, GCS, Sentry and
server feature flags. OCR holds only its database, GCS and model-provider credentials.

## First installation

1. Install Docker Engine, the Compose plugin, Google Cloud CLI and Google Cloud Ops Agent.
2. Copy this repository's `ops` directory and `docker-compose.production.yml` to
   `/opt/propcompare`; create `.env.deploy` from `.env.deploy.example`.
3. Install TLS certificates under `/etc/letsencrypt/live/<domain>` and enable
   `propcompare.service`.
4. Configure the Ops Agent with `google-cloud-ops-agent.yaml`; create uptime checks for `/healthz`
   and `/readyz` plus alerts for restarts, 5xx, OTP delivery, OCR failures, enquiry delivery,
   publication failures, Upstash errors and Google quota/cost.
5. Verify Supabase backups with a restore rehearsal before enabling a public feature flag.

`infra/terraform` declares the GCP-owned portion of this foundation. Review and apply it from a
protected infrastructure workflow; Terraform never supplies secret values or performs application
deployment. Direct SSH is closed—the deployment workflow uses an IAP tunnel.

## Delivery and rollback

`deploy-production.yml` is manual-only. It runs CI, builds immutable web and OCR images, pushes to
Artifact Registry, starts the chosen inactive web slot, waits for database readiness, switches the
Nginx upstream and retains the previous slot. Roll back with `sh ops/rollback-slot.sh blue|green`.
Database migration is a separate manual environment-protected workflow. Only expand/migrate/
contract changes are accepted; do not contract until the prior image can no longer be a rollback
target.

## Release gates

Keep all V2 server flags disabled until the matching release checklist is signed. Production also
requires `CSP_ENFORCE=1`, `STAFF_MFA_ENFORCE=1`, tested Upstash enforcement, legal approval,
zero-leakage tests, backup restore evidence and an exercised blue-green rollback.

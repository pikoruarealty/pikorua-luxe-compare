#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploys PropCompare on the shared VM (instance-small-mumbai), which also
# runs HRM/PropSight natively. Single-slot (web-blue only, no blue/green
# swap — native nginx proxies straight to it), builds images locally on the
# VM (no Artifact Registry), replays migrations/seed idempotently, then
# prunes dangling images/build cache so repeated deploys don't fill the
# shared disk. Invoked over an IAP SSH tunnel by
# .github/workflows/deploy-shared-vm.yml on every push to main.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR=/opt/propcompare
cd "$REPO_DIR"
sudo git fetch origin main
sudo git reset --hard origin/main

sudo bash ops/fetch-secrets.sh

export $(sudo cat /run/propcompare/db.env | xargs)

sudo docker compose --env-file .env.deploy \
  -f docker-compose.production.yml -f docker-compose.override.yml \
  build web-blue ocr-worker

sudo docker run --rm --network propcompare-production \
  -v "$REPO_DIR":/repo -w /repo \
  -e PGURL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
  postgres:16-alpine sh -c "apk add --no-cache bash >/dev/null && bash ops/db/migrate.sh"

sudo docker compose --env-file .env.deploy -f docker-compose.production.yml \
  exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < ops/db/seed.sql

sudo docker compose --env-file .env.deploy \
  -f docker-compose.production.yml -f docker-compose.override.yml \
  up -d --no-deps db web-blue ocr-worker

sudo docker image prune -f
sudo docker builder prune -f --filter until=72h

echo "deploy complete: $(sudo git rev-parse --short HEAD)"

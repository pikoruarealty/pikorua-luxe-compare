#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploys PropCompare on the shared VM (instance-small-mumbai), which also
# runs HRM/PropSight natively. Single-slot (web-blue only, no blue/green
# swap — native nginx proxies straight to it). Images are built and pushed
# to Artifact Registry by .github/workflows/deploy-shared-vm.yml's
# build-and-push job (the VM is too memory-constrained to build 3 images
# itself alongside the containers already running); this script just pulls
# the versioned tags that job pushed, replays migrations/seed idempotently,
# then prunes dangling images so repeated deploys don't fill the shared
# disk. Invoked over an IAP SSH tunnel with the three image refs as
# positional args on every push to main.
#
# Everything lives inside main(), called only at the very end. This script
# git-resets its own file on disk mid-run (line below) — bash reads a
# top-level script by file offset as it executes, so without this wrapper a
# reset that changes the file's byte layout silently corrupts which lines
# run next (no error, just skipped/misaligned commands). A function body is
# parsed as one complete block before it's ever invoked, so main() is immune
# to the file changing underneath it once execution reaches the call below.
# ---------------------------------------------------------------------------
set -euo pipefail

main() {
  WEB_BLUE_IMAGE="${1:?Usage: deploy-shared-vm.sh <web-image> <ocr-worker-image> <ocr-api-image>}"
  OCR_WORKER_IMAGE="${2:?Usage: deploy-shared-vm.sh <web-image> <ocr-worker-image> <ocr-api-image>}"
  OCR_API_IMAGE="${3:?Usage: deploy-shared-vm.sh <web-image> <ocr-worker-image> <ocr-api-image>}"

  REPO_DIR=/opt/propcompare
  cd "$REPO_DIR"
  sudo git fetch origin main
  sudo git reset --hard origin/main

  sudo bash ops/fetch-secrets.sh

  export $(sudo cat /run/propcompare/db.env | xargs)

  sudo sed -i "s|^WEB_BLUE_IMAGE=.*|WEB_BLUE_IMAGE=${WEB_BLUE_IMAGE}|" .env.deploy
  sudo sed -i "s|^OCR_WORKER_IMAGE=.*|OCR_WORKER_IMAGE=${OCR_WORKER_IMAGE}|" .env.deploy
  sudo sed -i "s|^OCR_API_IMAGE=.*|OCR_API_IMAGE=${OCR_API_IMAGE}|" .env.deploy

  sudo gcloud auth configure-docker asia-south1-docker.pkg.dev --quiet
  sudo docker compose --env-file .env.deploy \
    -f docker-compose.production.yml -f docker-compose.override.yml \
    pull web-blue ocr-worker ocr-api

  sudo docker run --rm --network propcompare-production \
    -v "$REPO_DIR":/repo -w /repo \
    -e PGURL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
    postgres:16-alpine sh -c "apk add --no-cache bash >/dev/null && bash ops/db/migrate.sh"

  sudo docker compose --env-file .env.deploy -f docker-compose.production.yml \
    exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < ops/db/seed.sql

  sudo docker compose --env-file .env.deploy \
    -f docker-compose.production.yml -f docker-compose.override.yml \
    up -d --no-deps db web-blue ocr-worker ocr-api

  sudo docker image prune -f

  echo "deploy complete: $(sudo git rev-parse --short HEAD)"
}

main "$@"

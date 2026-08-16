#!/usr/bin/env sh
set -eu
slot="${1:-}"
web_image="${2:-}"
ocr_image="${3:-}"
release_sha="${4:-}"
case "$slot" in blue|green) ;; *) echo "invalid slot" >&2; exit 2 ;; esac
test -n "$web_image" && test -n "$ocr_image" && test -n "$release_sha"

install_root=/opt/propcompare
mkdir -p "$install_root"
tar -xzf /tmp/propcompare-deployment.tgz -C "$install_root"
rm -f /tmp/propcompare-deployment.tgz
cd "$install_root"

sed -i "s|^OCR_WORKER_IMAGE=.*|OCR_WORKER_IMAGE=${ocr_image}|" .env.deploy
sh ./ops/fetch-secrets.sh
docker compose --env-file .env.deploy -f docker-compose.production.yml pull ocr-worker
docker compose --env-file .env.deploy -f docker-compose.production.yml up -d --no-deps ocr-worker
sh ./ops/deploy-slot.sh "$slot" "$web_image"
printf '%s\n' "$release_sha" > RELEASE

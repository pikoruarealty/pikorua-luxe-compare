#!/usr/bin/env sh
set -eu
slot="${1:-}"
case "$slot" in blue|green) ;; *) echo "slot must be blue or green" >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
printf 'server web-%s:3000;\n' "$slot" > ops/nginx/active-upstream.conf
docker compose --env-file .env.deploy -f docker-compose.production.yml exec -T nginx nginx -t
docker compose --env-file .env.deploy -f docker-compose.production.yml exec -T nginx nginx -s reload

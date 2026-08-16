#!/usr/bin/env sh
set -eu

slot="${1:-}"
image="${2:-}"
case "$slot" in blue|green) ;; *) echo "slot must be blue or green" >&2; exit 2 ;; esac
case "$image" in *"@sha256:"*|*":"*) ;; *) echo "image must be versioned" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."
env_file=.env.deploy
test -f "$env_file"
active_line=$(cat ops/nginx/active-upstream.conf 2>/dev/null || true)
case "$active_line" in
  *"web-$slot:3000"*) echo "refusing to redeploy active slot $slot" >&2; exit 3 ;;
esac
variable="WEB_$(printf '%s' "$slot" | tr '[:lower:]' '[:upper:]')_IMAGE"
sed -i "s|^${variable}=.*|${variable}=${image}|" "$env_file"

docker compose --env-file "$env_file" -f docker-compose.production.yml pull "web-$slot"
docker compose --env-file "$env_file" -f docker-compose.production.yml up -d --no-deps "web-$slot"

attempt=0
until docker compose --env-file "$env_file" -f docker-compose.production.yml exec -T "web-$slot" \
  wget -qO- http://127.0.0.1:3000/readyz >/dev/null; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { echo "candidate failed readiness" >&2; exit 1; }
  sleep 2
done

printf 'server web-%s:3000;\n' "$slot" > ops/nginx/active-upstream.conf
docker compose --env-file "$env_file" -f docker-compose.production.yml exec -T nginx nginx -t
docker compose --env-file "$env_file" -f docker-compose.production.yml exec -T nginx nginx -s reload
echo "traffic switched to $slot; previous slot retained for rollback"

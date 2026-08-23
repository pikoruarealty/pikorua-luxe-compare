#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Replay supabase/migrations/*.sql against a plain PostgreSQL server, in
# filename order, each in its own transaction, stopping on the first failure.
#
# Run ops/db/bootstrap.sql first (see the note at the top of that file).
#
# Usage:
#   PGURL='postgresql://postgres:pw@127.0.0.1:5433/propcompare' ops/db/migrate.sh
#   PGURL=... ops/db/migrate.sh --dry-run     # list what would run, apply nothing
#
# Already-applied migrations (recorded in supabase_migrations.schema_migrations)
# are skipped, so re-running is safe.
# ---------------------------------------------------------------------------
set -euo pipefail

: "${PGURL:?Set PGURL to the target connection string}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION_DIR="$REPO_ROOT/supabase/migrations"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

psql_q() { psql "$PGURL" -w -v ON_ERROR_STOP=1 -tAc "$1"; }

applied="$(psql_q "SELECT version FROM supabase_migrations.schema_migrations" || true)"

for file in "$MIGRATION_DIR"/*.sql; do
  base="$(basename "$file")"
  version="${base%%_*}"

  if grep -qx "$version" <<<"$applied"; then
    echo "skip    $base (already applied)"
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "would apply  $base"
    continue
  fi

  echo "applying $base"
  # --single-transaction so a failing migration leaves nothing half-applied.
  psql "$PGURL" -w -v ON_ERROR_STOP=1 --single-transaction -f "$file" >/dev/null
  psql_q "INSERT INTO supabase_migrations.schema_migrations (version, name)
          VALUES ('$version', '$base') ON CONFLICT (version) DO NOTHING" >/dev/null
  echo "applied  $base"
done

echo
echo "migrations applied: $(psql_q "SELECT count(*) FROM supabase_migrations.schema_migrations")"
echo "public tables:      $(psql_q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"

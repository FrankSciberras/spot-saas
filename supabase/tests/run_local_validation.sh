#!/usr/bin/env bash
# =============================================================================
# Self-contained local validation of the SaaS migrations + isolation test.
# Spins up a throwaway Postgres container, applies the full schema + saas
# migrations, then runs the isolation test. Tears the container down at the end.
#
# Requires: Docker running. No Supabase project/init needed.
# Usage: bash supabase/tests/run_local_validation.sh
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(cd "$HERE/.." && pwd)"
CONTAINER="spot_saas_validate"
PGIMAGE="postgres:16"
PGPASSWORD="postgres"
PORT="55433"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Starting throwaway Postgres ($PGIMAGE) on :$PORT"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD="$PGPASSWORD" -p "$PORT:5432" "$PGIMAGE" >/dev/null

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

# psql shorthand executed *inside* the container against a file piped on stdin.
run() {
  local label="$1"; local file="$2"
  echo "==> Applying: $label"
  docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q < "$file"
}

run "00_local_bootstrap.sql (auth stub + roles)" "$HERE/00_local_bootstrap.sql"
run "saas_install.sql (full single-tenant base)"  "$SUPA/saas_install.sql"
run "20260529_saas_01_organizations.sql"          "$SUPA/migrations/20260529_saas_01_organizations.sql"
run "20260529_saas_02_tenant_columns.sql"         "$SUPA/migrations/20260529_saas_02_tenant_columns.sql"
run "20260529_saas_03_rls.sql"                     "$SUPA/migrations/20260529_saas_03_rls.sql"
run "20260530_saas_04_autostamp_org.sql"          "$SUPA/migrations/20260530_saas_04_autostamp_org.sql"
run "20260530_saas_05_onboarding_rpc.sql"         "$SUPA/migrations/20260530_saas_05_onboarding_rpc.sql"
run "99_local_grants.sql (test grants)"           "$HERE/99_local_grants.sql"

echo "==> Running isolation test (asserts cross-tenant reads return 0 rows)"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$HERE/saas_isolation_test.sql"

echo ""
echo "============================================================"
echo " ✅ VALIDATION COMPLETE — schema applied & isolation passed "
echo "============================================================"

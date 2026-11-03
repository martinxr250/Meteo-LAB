#!/usr/bin/env bash
# Aplica la migración en un PostgreSQL+PostGIS efímero y corre las pruebas de RLS.
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=meteolab-rls-test
docker rm -f $NAME >/dev/null 2>&1 || true
docker run -d --name $NAME -e POSTGRES_PASSWORD=test postgis/postgis:16-3.4 >/dev/null
trap 'docker rm -f $NAME >/dev/null' EXIT
until docker exec $NAME pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2
psql() { docker exec -i $NAME psql -v ON_ERROR_STOP=1 -q -U postgres "$@"; }
psql < supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do psql < "$f"; done
psql < supabase/tests/rls_test.sql

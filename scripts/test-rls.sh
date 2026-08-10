#!/usr/bin/env bash
#
# Proves the RLS policies actually isolate two users, against a real Postgres.
#
# Private shelves are enforced by RLS alone — see supabase/migrations — so this is the
# only thing standing between "shelves are private" and a claim nobody has checked.
#
#   CI:     services: postgres, psql on PATH, DATABASE_URL set.
#   Local:  no psql needed. Start a throwaway container and point PSQL at it:
#             podman run -d --rm --name mt-pg -e POSTGRES_PASSWORD=postgres \
#               -p 55432:5432 docker.io/library/postgres:16-alpine
#             PSQL="podman exec -i mt-pg psql" npm run test:rls
#
# Files are fed over stdin rather than by path so that the same command works whether psql
# is on this machine or inside a container that cannot see this directory.
set -euo pipefail

DB="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
PSQL="${PSQL:-psql}"

run() { $PSQL "$DB" -v ON_ERROR_STOP=1 -q < "$1"; }

run supabase/tests/harness.sql
for migration in supabase/migrations/*.sql; do run "$migration"; done

# Not -q: the assertions are the point, so let their output through.
$PSQL "$DB" -v ON_ERROR_STOP=1 < supabase/tests/rls.sql

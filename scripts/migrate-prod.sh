#!/usr/bin/env bash
# migrate-prod.sh — apply schema migrations and seed vocab data on a target DB.
#
# Input: host / port / user / password / dbname (flags or env vars).
#
# Usage:
#   ./scripts/migrate-prod.sh --host localhost --port 5433 \
#       --user postgres --password 'secret' --dbname engstack
#
#   DB_HOST=prod.internal DB_PORT=5432 DB_USER=app DB_PASSWORD='s3cr&t' \
#       DB_NAME=engstack ./scripts/migrate-prod.sh
#
#   # prod stack (postgres KHÔNG expose port): chạy trong network của compose
#   docker compose -f infras/docker-compose.deploy.yml run --rm --no-deps \
#       --entrypoint /app/bin/migrate api
#
# Flags:
#   --host HOST       DB host            (env DB_HOST,     default localhost)
#   --port PORT       DB port            (env DB_PORT,     default 5432)
#   --user USER       DB user            (env DB_USER,     default postgres)
#   --password PASS   DB password        (env DB_PASSWORD, hoặc nhập khi thiếu)
#   --dbname NAME     DB name            (env DB_NAME,     default engstack)
#   --sslmode MODE    sslmode            (env DB_SSLMODE,  default require;
#                                         dùng 'disable' cho DB local/private)
#   --schema-only     run migrations, skip the vocab seed import
#   --data-dir DIR    override seed data directory (default: <repo>/data)
#   --force-seed      import even when topics table is not empty (default: skip if seeded)
#   DATABASE_URL=...  bỏ qua host/port/user/pass, dùng connection string sẵn có
#
# Notes:
#   - Idempotent: golang-migrate tracks applied versions; seed runs --if-empty.
#   - Requires Go toolchain (chạy từ máy dev/CI, không phải trong image prod).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
DATA_DIR="$REPO_ROOT/data"
SCHEMA_ONLY=0
IF_EMPTY="--if-empty"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-engstack}"
DB_SSLMODE="${DB_SSLMODE:-require}"
DATABASE_URL="${DATABASE_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)        shift; DB_HOST="$1" ;;
    --port)        shift; DB_PORT="$1" ;;
    --user)        shift; DB_USER="$1" ;;
    --password)    shift; DB_PASSWORD="$1" ;;
    --dbname)      shift; DB_NAME="$1" ;;
    --sslmode)     shift; DB_SSLMODE="$1" ;;
    --schema-only) SCHEMA_ONLY=1 ;;
    --data-dir)    shift; DATA_DIR="$1" ;;
    --force-seed)  IF_EMPTY="" ;;
    -h|--help)     sed -n '2,32p' "$0"; exit 0 ;;
    postgres://*|postgresql://*) DATABASE_URL="$1" ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
  shift
done

if [[ -z "$DATABASE_URL" ]]; then
  if [[ -z "$DB_PASSWORD" ]]; then
    read -rsp "DB password for ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}: " DB_PASSWORD
    echo >&2
  fi
  # URL-encode user/password: ký tự đặc biệt (@, :, /, %) phá vỡ DSN parse.
  urlenc() { jq -rn --arg v "$1" '$v|@uri'; }
  if ! command -v jq >/dev/null; then
    echo "error: cần jq để encode credentials (hoặc truyền DATABASE_URL đã encode sẵn)" >&2
    exit 65
  fi
  DATABASE_URL="postgres://$(urlenc "$DB_USER"):$(urlenc "$DB_PASSWORD")@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
  TARGET_DESC="${DB_HOST}:${DB_PORT}/${DB_NAME} (sslmode=${DB_SSLMODE})"
else
  # caller truyền URL sẵn: không echo host mặc định gây nhầm
  TARGET_DESC="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@##')"
fi
export DATABASE_URL

echo "==> target: ${TARGET_DESC}"
echo "==> applying schema migrations"
(cd "$BACKEND_DIR" && go run ./cmd/migrate)

if [[ "$SCHEMA_ONLY" -eq 0 ]]; then
  echo "==> seeding vocab data from $DATA_DIR"
  (cd "$BACKEND_DIR" && go run ./cmd/seed --data-dir "$DATA_DIR" $IF_EMPTY)
fi

echo "==> done"

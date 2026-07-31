#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backend_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

"$script_dir/start_restore_db.sh"

cd "$backend_dir"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
export APP_ENV="development"
export BACKUP_RESTORE_ENABLED="true"
export BACKUP_RESTORE_TARGET="local"
export BACKUP_LOCAL_DIR=".data/backups/restore-test"
export SUPABASE_DATABASE_URL="postgresql://postgres@127.0.0.1:5433/employee_restore_test?sslmode=disable"

exec go run ./cmd/api

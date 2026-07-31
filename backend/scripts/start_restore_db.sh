#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backend_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
postgres_bin="/opt/homebrew/opt/postgresql@18/bin"
restore_data_dir="$backend_dir/.data/postgres-restore"
restore_log="$backend_dir/.data/postgres-restore.log"

if "$postgres_bin/pg_isready" -h 127.0.0.1 -p 5433 -d employee_restore_test >/dev/null 2>&1; then
  echo "PostgreSQL Restore Local is already running on 127.0.0.1:5433"
  exit 0
fi

"$postgres_bin/pg_ctl" \
  -D "$restore_data_dir" \
  -l "$restore_log" \
  -o "-p 5433 -h 127.0.0.1" \
  start

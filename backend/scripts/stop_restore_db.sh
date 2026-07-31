#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backend_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
postgres_bin="/opt/homebrew/opt/postgresql@18/bin"
restore_data_dir="$backend_dir/.data/postgres-restore"

"$postgres_bin/pg_ctl" -D "$restore_data_dir" stop -m fast

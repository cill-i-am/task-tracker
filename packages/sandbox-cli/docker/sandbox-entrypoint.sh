#!/bin/sh
set -eu

filter="${1:-}"

if [ -z "$filter" ]; then
  echo "sandbox-entrypoint.sh requires a package filter argument (app or api)." >&2
  exit 1
fi

lock_hash="$(sha256sum /workspace/pnpm-lock.yaml | awk '{print $1}')"
cache_file="/workspace/node_modules/.sandbox-lock.sha256"

if [ ! -d /workspace/node_modules/.pnpm ] || [ ! -f "$cache_file" ] || [ "$(cat "$cache_file")" != "$lock_hash" ]; then
  CI=true pnpm install --frozen-lockfile
  mkdir -p /workspace/node_modules
  printf '%s' "$lock_hash" > "$cache_file"
fi

exec pnpm turbo run sandbox:dev --filter="$filter"

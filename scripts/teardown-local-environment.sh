#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

pnpm sandbox:down
echo "Local sandbox stopped or already absent"

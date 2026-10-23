#!/usr/bin/env bash
# Starts the React dashboard at http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")/../dashboard"
[ -d node_modules ] || pnpm install
exec pnpm dev

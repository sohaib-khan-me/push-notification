#!/usr/bin/env bash
# Starts the FastAPI backend. Use HOST=0.0.0.0 to let a phone on your Wi-Fi reach it.
set -euo pipefail
cd "$(dirname "$0")/../backend"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -r requirements.txt; }
exec .venv/bin/uvicorn app.main:get_app --factory --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"

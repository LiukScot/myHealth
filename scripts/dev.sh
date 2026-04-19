#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

./scripts/stop-frontend-dev.sh

backend_pid=""

cleanup() {
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

./scripts/run-bun.sh --cwd backend --watch src/server.ts &
backend_pid=$!

printf '%s\n' 'Health dev is starting on http://localhost:5555'
printf '%s\n' 'Running backend and frontend locally for fast reload. Press Ctrl+C to stop both.'
printf '%s\n' 'Use `bun run dev:docker` if you want the backend container instead.'

bun run dev:frontend

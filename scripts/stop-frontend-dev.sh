#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PORT=5173

pids="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -z "$pids" ]]; then
  exit 0
fi

killed_any=0

for pid in $pids; do
  cmdline="$(tr '\0' ' ' </proc/"$pid"/cmdline 2>/dev/null || true)"
  cwd="$(readlink -f /proc/"$pid"/cwd 2>/dev/null || true)"

  if [[ "$cwd" == "$FRONTEND_DIR" ]] || [[ "$cmdline" == *"$FRONTEND_DIR/node_modules/.bin/vite"* ]]; then
    kill "$pid" 2>/dev/null || true
    killed_any=1
  fi
done

if [[ "$killed_any" -eq 0 ]]; then
  printf '%s\n' "Port $PORT already in use by another app. Not killing it automatically." >&2
  exit 1
fi

for _ in $(seq 1 30); do
  sleep 0.1
  if ! lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    exit 0
  fi
done

printf '%s\n' "Timed out waiting for frontend dev server on port $PORT to stop." >&2
exit 1

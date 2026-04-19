#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

./scripts/stop-frontend-dev.sh

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --remove-orphans health

printf '%s\n' 'Health dev is starting on http://localhost:5555'
printf '%s\n' 'Frontend edits hot-reload there automatically; use `bun run dev:stop` to stop the backend container.'

exec bun run dev:frontend

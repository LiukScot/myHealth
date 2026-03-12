#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/run-bun.sh" --cwd "$SCRIPT_DIR/../backend" src/user-cli.ts "$@"

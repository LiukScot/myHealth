#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="$ROOT_DIR/rollback/legacy-runtime.tar.gz"
if [[ ! -f "$ARCHIVE" ]]; then
  echo "Missing $ARCHIVE" >&2
  exit 1
fi
cd "$ROOT_DIR"
tar -xzf "$ARCHIVE"
echo "Legacy runtime restored from $ARCHIVE"

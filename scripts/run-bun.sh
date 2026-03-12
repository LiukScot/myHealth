#!/usr/bin/env bash
set -euo pipefail

if command -v bun >/dev/null 2>&1; then
  exec bun "$@"
fi

if [ -x "${HOME}/.bun/bin/bun" ]; then
  exec "${HOME}/.bun/bin/bun" "$@"
fi

echo "bun binary not found. Install Bun or add it to PATH." >&2
exit 127

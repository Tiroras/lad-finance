#!/bin/sh
set -eu

cd /workspace

# node_modules lives in a Docker volume, separately from the host installation.
# Send installation messages to stderr so Maestro MCP keeps stdout for JSON-RPC.
if ! sha256sum --check --status node_modules/.lad-packages 2>/dev/null; then
  echo '[Лад] Устанавливаю зависимости контейнера из package-lock.json…' >&2
  npm ci --no-audit --no-fund >&2
  sha256sum package.json package-lock.json > node_modules/.lad-packages
fi

exec "$@"

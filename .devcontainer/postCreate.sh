#!/usr/bin/env bash
set -euo pipefail

echo "[postCreate] Installing project dependencies (includes Checkly CLI via package.json)..."
if command -v npm >/dev/null 2>&1; then
  npm ci || npm install
else
  echo "npm not found; skipping npm install"
fi

echo "[postCreate] Preparing CLI config directories..."
mkdir -p /home/node/.railway /home/node/.checkly
if command -v sudo >/dev/null 2>&1; then
  sudo chown -R node:node /home/node/.railway /home/node/.checkly || true
else
  chown -R node:node /home/node/.railway /home/node/.checkly || true
fi

echo "[postCreate] Done. Available commands: checkly, railway"

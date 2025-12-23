#!/usr/bin/env bash
set -euo pipefail

echo "[postCreate] Installing project dependencies..."
npm ci || npm install

echo "[postCreate] Installing Checkly CLI..."
npm install -g checkly

echo "[postCreate] Installing Railway CLI..."
curl -fsSL https://railway.com/install.sh | sh

echo "[postCreate] Creating CLI config directories..."
mkdir -p ~/.railway ~/.checkly

echo "[postCreate] Done. Available commands: checkly, railway"

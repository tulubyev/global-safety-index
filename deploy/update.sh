#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/app"

echo "==> Pulling latest changes"
cd "$APP_DIR" && git pull

echo "==> Installing backend dependencies"
cd "$APP_DIR/backend" && npm install --production

echo "==> Installing frontend dependencies and building"
cd "$APP_DIR/frontend" && npm install && npm run build

echo "==> Reloading PM2 processes"
pm2 reload all

echo "Deploy complete"

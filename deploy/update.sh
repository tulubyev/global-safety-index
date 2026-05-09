#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/safety"

echo "==> Pulling latest changes"
cd "$APP_DIR" && git fetch origin && git reset --hard origin/main

echo "==> Installing backend dependencies"
cd "$APP_DIR/backend" && npm install --production

echo "==> Building frontend"
cd "$APP_DIR/frontend" && npm install && npm run build

echo "==> Restarting PM2 processes"
pm2 restart safety-backend
pm2 restart safety-frontend

echo "==> Status"
pm2 status

echo "Deploy complete ✅"

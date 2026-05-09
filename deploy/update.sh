#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/safety"

echo "==> Pulling latest changes"
cd "$APP_DIR"
git fetch origin && git reset --hard origin/main

echo "==> Rebuilding and restarting containers"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Status"
docker compose -f docker-compose.prod.yml ps

echo "Deploy complete ✅"

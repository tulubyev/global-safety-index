#!/usr/bin/env bash
set -euo pipefail

REPO_URL="YOUR_REPO_URL"
APP_DIR="/app"

echo "==> Updating system packages"
apt-get update -y && apt-get upgrade -y

echo "==> Installing Node.js 20 via NodeSource"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Installing nginx and redis-server"
apt-get install -y nginx redis-server

echo "==> Installing PM2 globally"
npm install -g pm2

echo "==> Creating /app directory"
mkdir -p "$APP_DIR"

echo "==> Cloning repository"
git clone "$REPO_URL" "$APP_DIR"

echo "==> Installing backend dependencies"
cd "$APP_DIR/backend" && npm install --production

echo "==> Installing frontend dependencies and building"
cd "$APP_DIR/frontend" && npm install && npm run build

echo "==> Configuring nginx"
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/safety
ln -sf /etc/nginx/sites-available/safety /etc/nginx/sites-enabled/safety
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Starting redis-server"
systemctl enable redis-server
systemctl start redis-server

echo "==> Starting application with PM2"
cd "$APP_DIR"
pm2 start deploy/ecosystem.config.js

echo "==> Saving PM2 process list and enabling startup"
pm2 save
pm2 startup systemd -u root --hp /root

echo "==> Setup complete. Application is running."
echo "    Backend  -> http://localhost:3001"
echo "    Frontend -> http://localhost:3000"
echo "    Nginx    -> http://0.0.0.0:80"

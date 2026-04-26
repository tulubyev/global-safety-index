#!/bin/bash
# ============================================================
# Добавить новый проект на VPS
# Использование: ./add-project.sh myproject myproject.com 3010 3011
# ============================================================

PROJECT=$1    # имя проекта (delivery, shop, blog...)
DOMAIN=$2     # домен (delivery.example.com)
FE_PORT=$3    # порт фронтенда (3010, 3020...)
BE_PORT=$4    # порт бэкенда  (3011, 3021...)

if [ -z "$PROJECT" ] || [ -z "$DOMAIN" ] || [ -z "$FE_PORT" ] || [ -z "$BE_PORT" ]; then
  echo "Использование: $0 <project> <domain> <fe_port> <be_port>"
  echo "Пример:        $0 delivery delivery.example.com 3010 3011"
  exit 1
fi

echo "==> Создаём папку /var/www/$PROJECT"
mkdir -p /var/www/$PROJECT

echo "==> Создаём nginx конфиг"
NGINX_CONF="/etc/nginx/sites-available/$PROJECT.conf"
cp "$(dirname $0)/nginx/_template.conf" $NGINX_CONF
sed -i "s/DOMAIN/$DOMAIN/g"           $NGINX_CONF
sed -i "s/FRONTEND_PORT/$FE_PORT/g"   $NGINX_CONF
sed -i "s/BACKEND_PORT/$BE_PORT/g"    $NGINX_CONF
sed -i "s/PROJECT_NAME/$PROJECT/g"    $NGINX_CONF

echo "==> Включаем сайт в nginx"
ln -sf $NGINX_CONF /etc/nginx/sites-enabled/$PROJECT.conf

echo "==> Проверяем nginx"
nginx -t && systemctl reload nginx

echo "==> Получаем SSL сертификат"
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

echo ""
echo "✅ Готово! Теперь:"
echo "   1. Склонируй проект в /var/www/$PROJECT"
echo "   2. Добавь запись в deploy/ecosystem.all.config.js (порты $FE_PORT / $BE_PORT)"
echo "   3. pm2 start deploy/ecosystem.all.config.js --only $PROJECT-backend"
echo "   4. pm2 start deploy/ecosystem.all.config.js --only $PROJECT-frontend"
echo "   5. pm2 save"

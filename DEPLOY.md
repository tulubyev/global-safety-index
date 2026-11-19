# Развёртывание на Dhost

## Архитектура

Frontend и API работают из `/var/www/safety` через Docker Compose и Traefik.
Общая сеть HTTPS — `traefik-public`, entrypoint `websecure`, resolver
`letsencrypt`. API дополнительно подключён к внешней сети `dhost-database`.

База `safety_db` находится в общем PostgreSQL 16 с PostGIS. Отдельный экземпляр
PostgreSQL для проекта не требуется. Расширения `postgis` и `postgis_topology`
включены в базе Safety. Приложение подключается ролью `safety_app` с правами
на таблицы приложения; административная роль используется только для обслуживания.

## Настройки

На сервере нужен `backend/.env` с правами 600 (не коммитить):

```dotenv
DATABASE_URL=postgresql://safety_app:REPLACE_ME@dhost-postgres-1:5432/safety_db
PORT=3001
NODE_ENV=production
ADMIN_TOKEN=REPLACE_WITH_RANDOM_TOKEN_AT_LEAST_16_CHARACTERS
# RELIEFWEB_APPNAME=approved-appname
```

Redis необязателен. ReliefWeb требует заранее одобренного appname.
Без него пересчёт работает с остальными источниками, но события ReliefWeb
не учитываются. ML-сервис не запускается (см. `ml/README.md`).

## Обновление

После первоначального развёртывания серверный `docker-compose.dhost.yml`
существовал как локальный файл. Перед первым обновлением из GitHub сохраните
его копию за пределами клона и уберите локальный файл, чтобы `git pull`
мог получить отслеживаемую версию. Сравните копию с версией репозитория.

```bash
cd /var/www/safety
git pull --ff-only origin main
docker compose -p safety -f docker-compose.prod.yml -f docker-compose.dhost.yml \
  up -d --build --wait --wait-timeout 180
docker exec safety-api wget -qO- http://localhost:3001/health
docker exec safety-api wget -qO- http://localhost:3001/api/meta
```

Всегда указывайте оба Compose-файла. После изменения `backend/.env` используйте
`up -d`, чтобы контейнер получил новое окружение.

## Восстановление и проверки

19 ноября 2026 база восстановлена из проверенного дампа за 29 октября:
238 стран, 6389 записей показателей, 238 строк `latest_risks`.
Затем выполнен пересчёт: 238 записей за 19 ноября, без пропусков при записи.
Все семь измерений доступны у 140 стран; ReliefWeb пока не подключён.

Проверены HTTPS, `/health`, `/api/meta`, `/api/map/all`, `/api/top10`.
Карта возвращает 237 объектов: маршрут намеренно исключает HK.
Локальные тесты backend: 55 passed. Визуальная проверка браузером ещё не выполнена.

Полный дамп восстанавливайте в новую пустую базу одной транзакцией через
`pg_restore --no-owner --no-acl --single-transaction --exit-on-error`.
Миграции 001–009 повторно поверх восстановленного полного дампа не запускайте.
Перед пересчётом и изменением инфраструктуры создавайте резервную копию.

## Резервные копии

Общий серверный `backup-postgres.sh` использует `pg_dumpall`, включает Safety
и роли автоматически. Расписание: ежедневно 03:15 UTC (11:15 Asia/Irkutsk),
хранение 14 дней. Свежий архив проверен по SHA-256 и наличию базы и роли.
Пробное восстановление нового общего архива ещё не выполнено.

Настройки Safety (`backend/.env` и оба Compose-файла) сохранены отдельной
разовой копией. Автоматический бэкап этих настроек и внешняя копия Dhost
пока не настроены. Архивы с паролями хранить закрыто и не добавлять в Git.

## Оставшиеся работы

- Подключить одобренный ReliefWeb appname.
- Настроить внешние копии и проверить восстановление общего бэкапа.
- Автоматизировать сохранение настроек Safety.
- Проверить ошибки Server Action в логах frontend и обновить старую Next.js 14.2.0.

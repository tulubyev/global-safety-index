# World Safety Index

Открытый индекс безопасности стран по семи измерениям: вооружённый конфликт,
насильственная преступность, безопасность дорог, стихийные бедствия,
продовольственная безопасность, сейсмика, пандемический риск.
Веса измерений настраиваются пользователем, карта и рейтинг пересчитываются мгновенно.

**Продакшн:** https://worldsafetyindex.org
**Методология:** [METHODOLOGY.md](METHODOLOGY.md)

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js (standalone), React Leaflet, Recharts, TanStack Query |
| Backend | Node.js + Express |
| БД | PostgreSQL 16 + PostGIS |
| Кэш | Redis (необязателен) |
| Деплой | Docker Compose за Traefik v2.11 |

## Структура

```
backend/src/
  parsers/     загрузка и разбор внешних источников → Map<iso2, значение>
  cron/        weeklyUpdate.js — недельный конвейер пересчёта
  routes/      map, top10, custom-weights, safety, trends, alerts
  services/    scoreService (формула), dbService, cacheService
  scripts/     разовые импорты
frontend/src/
  components/  SafetyMap, Top10List, CountryPanel, WeightSliders, AboutModal
  lib/score.ts зеркало backend/src/services/scoreService.js
db/migrations/ SQL-миграции, применяются вручную по порядку
```

**Формула живёт в двух местах** — `backend/src/services/scoreService.js` и
`frontend/src/lib/score.ts`. Меняешь одно — меняй второе, иначе карта и рейтинг
разойдутся.

**Шкалы абсолютные.** Перевод величин в 0–100 идёт через фиксированные опорные
точки в `backend/src/parsers/scale.js`, не через min-max: балл страны не должен
зависеть от того, кто ещё попал в выборку.

**NULL ≠ 0.** Измерение без данных хранится как NULL и выбрасывается из
формулы с перевешиванием остальных; измеренный ноль остаётся нулём. API отдаёт
`coverage`/`dimensions`, фронт показывает это бейджем и прочерком.

**Риск-данные пишет только конвейер.** В `backend/src/scripts/` остался лишь
`importCountries.js` для первичного наполнения таблицы стран — см.
[scripts/README](backend/src/scripts/README.md).

**Добавить измерение:** миграция с колонкой, запись в `DIMENSIONS`
(`scoreService.js`), источник в конвейере, пункт в `WEIGHT_DIMS`
(`frontend/src/types/weights.ts`). Роуты перебирают `DIMENSIONS` и правки не требуют.

---

## Локальная разработка

```bash
cp .env.example backend/.env    # заполнить DATABASE_URL
docker compose up -d            # postgres + redis
cd backend  && npm ci && npm run dev
cd frontend && npm ci && npm run dev
```

Тесты (чистые функции: шкалы, формула, резолверы стран, CSV-ридер):

```bash
cd backend && npm test
```

Первичное наполнение БД: миграции → `node src/scripts/importCountries.js` →
запуск конвейера.

Миграции применяются по порядку:

```bash
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

---

## Переменные окружения

Контейнеры читают **`backend/.env`** (см. `env_file` в `docker-compose.prod.yml`).

| Переменная | Обязательна | Назначение |
|---|---|---|
| `DATABASE_URL` | да | из контейнера — хост `172.28.0.1`, не публичный IP |
| `REDIS_URL` | нет | без неё запросы идут напрямую в БД |
| `RELIEFWEB_APPNAME` | для ReliefWeb | регистрация appname, ~1 рабочий день |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | нет | резервный источник конфликтов |
| `ADMIN_TOKEN` | нет | включает `POST /api/admin/run-update`; 16+ символов, пусто = выключено |

UCDP, INFORM, USGS, World Bank (включая данные UNODC по убийствам) и WHO
ключей не требуют.

---

## Деплой

```bash
cd /var/www/safety
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

Пересчёт данных после деплоя (конвейер иначе ждёт понедельника):

```bash
docker exec safety-api node -e "require('./src/cron/weeklyUpdate').runWeeklyUpdate().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
```

---

## Эксплуатация: грабли

Всё перечисленное уже ломало продакшн — не повторять.

**`up -d`, а не `restart`.** `docker compose restart` не перечитывает `env_file`.
После правки `backend/.env` нужен `up -d safety-api`.

**`NEXT_PUBLIC_*` подставляются на этапе сборки.** Next.js инлайнит их в бандл
при `next build`, а не читает в рантайме. Передавать через `build.args`
в compose и `ARG`/`ENV` в `frontend/Dockerfile`; в `environment` они бесполезны —
фронт будет ходить на `localhost:3001`.

**`HOSTNAME=0.0.0.0` обязателен** для Next standalone, иначе сервер слушает
только loopback и Traefik получает 502.

**`frontend/.dockerignore` обязателен.** Без него локальная папка `.next`
попадает в build context, все слои кэшируются и в образ уезжает старый код.

**Порты контейнеров не привязаны к хосту.** В compose `expose`, не `ports`:
Traefik ходит в контейнер по docker-сети. `curl localhost:3001` с хоста
ничего не найдёт — проверять через публичный URL или `docker exec`.

**Redis не должен блокировать.** У `ioredis` включена офлайн-очередь по
умолчанию: при недоступном Redis команды копятся, и запрос висит вечно вместо
того чтобы упасть в БД. В `cacheService.js` выставлены `enableOfflineQueue: false`
и `maxRetriesPerRequest: 0`.

**`CREATE OR REPLACE VIEW` не умеет менять порядок колонок.** При добавлении
колонок в `latest_risks` нужен `DROP VIEW` + `CREATE VIEW` (миграция 006).

**Traefik: после правки `dynamic.yml` — рестарт вручную.** `watch=true`
срабатывает не всегда: `cd /opt/traefik && docker compose restart traefik`.
Изменения `dynamic.yml` всегда коммитить в репозиторий инфраструктуры —
локальные правки на сервере теряются при `git pull`.

**Один домен — один провайдер маршрутов.** Если проект переехал с file-провайдера
на docker-labels, старые маршруты из `dynamic.yml` удалить. Два роутера на один
домен ломают статику: HTML отдаёт один бэкенд, чанки — другой, хеши не совпадают.

---

## API

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/map/all` | FeatureCollection всех стран с геометрией и измерениями |
| `GET` | `/api/map?country=IS` | одна страна |
| `POST` | `/api/custom-weights` | рейтинг по пользовательским весам |
| `GET` | `/api/top10?n=10` | рейтинг по весам по умолчанию |
| `GET` | `/api/safety?lat=&lon=` | страна по координатам |
| `GET` | `/api/trends/:code` | история измерений текущего поколения формулы |
| `POST` | `/api/admin/run-update` | ручной запуск конвейера (Bearer `ADMIN_TOKEN`) |
| `GET` | `/api/admin/status` | идёт ли пересчёт (Bearer `ADMIN_TOKEN`) |
| `GET` | `/health` | health-check |

Ручной пересчёт без захода в контейнер:

```bash
curl -X POST https://worldsafetyindex.org/api/admin/run-update -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Поколение формулы.** Строки в `risks` помечаются версией
(`services/pipelineVersion.js`). Баллы разных поколений несопоставимы, поэтому
`/api/trends` отдаёт только текущее — иначе на графике был бы виден скачок в
момент смены методики, неотличимый от реального изменения в стране. Версию
нужно поднимать при любом изменении шкалы или формулы.

ML-сервис прогноза намеренно не поднят — [почему](ml/README.md).

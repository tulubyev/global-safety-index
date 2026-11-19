# CLAUDE.md — World Safety Index

Индекс безопасности стран по 7 измерениям с настраиваемыми весами

## Где что лежит

| | |
|---|---|
| GitHub | https://github.com/tulubyev/global-safety-index |
| Локально | `~/Dropbox/DEV/safety` |
| VPS | Dhost, `/var/www/safety`; актуальная инструкция — `DEPLOY.md` |
| Прод | worldsafetyindex.org |
| Стек | Next.js 14 + Express + общий PostgreSQL 16/PostGIS, Docker; ML не запущен |

## Как ведётся работа

Проект подключён к общей доске **DEV Control** (реестр — `tulubyev/dev-control`).

- Работа идёт по issues этого репозитория. Перед началом проверь, есть ли задача:
  `gh issue list --label agent:claude` — задачи, назначенные Claude.
- Каждая задача делается в отдельной ветке (`feat/<номер>-кратко`, `fix/<номер>-кратко`)
  и завершается PR с `Closes #<номер>` в описании — тогда карточка на доске сама
  уйдёт в Done после merge.
- Если задача заблокирована (нужен ответ, доступ, решение) — комментарий в issue
  с вопросом и метка `blocked`, не гадать.
- В PR: что сделано, как проверено, что осталось.
- Секреты только в `.env` (в git не попадают), в `.env.example` — имена переменных.

## Команды

Тесты: `cd backend && npm test`.
Деплой: `docker compose -p safety -f docker-compose.prod.yml -f docker-compose.dhost.yml up -d --build --wait`.
Подробности, восстановление и бэкапы — `DEPLOY.md`.

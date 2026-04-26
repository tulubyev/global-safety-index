# Nginx — схема портов для VPS

## Структура на сервере

```
/etc/nginx/
├── nginx.conf                  ← главный конфиг (включает все сайты)
└── sites-enabled/
    ├── safety-index.conf       ← проект 1
    ├── delivery.conf           ← проект 2
    └── ...                     ← остальные проекты
```

## Таблица портов

| # | Проект         | Домен                    | Frontend | Backend |
|---|----------------|--------------------------|----------|---------|
| 1 | safety-index   | worldsafetyindex.org     | 3000     | 3001    |
| 2 | delivery       | delivery.example.com     | 3010     | 3011    |
| 3 | project3       | project3.example.com     | 3020     | 3021    |
| 4 | project4       | project4.example.com     | 3030     | 3031    |
| 5 | project5       | project5.example.com     | 3040     | 3041    |
| 6 | project6       | project6.example.com     | 3050     | 3051    |
| 7 | project7       | project7.example.com     | 3060     | 3061    |
| 8 | project8       | project8.example.com     | 3070     | 3071    |
| 9 | project9       | project9.example.com     | 3080     | 3081    |
|10 | project10      | project10.example.com    | 3090     | 3091    |

Правило: проект N → frontend = 3000 + N*10, backend = 3001 + N*10

## Добавить новый проект

1. Скопировать `_template.conf` → `myproject.conf`
2. Заменить: DOMAIN, FRONTEND_PORT, BACKEND_PORT, PROJECT_NAME
3. На сервере: `sudo ln -s /etc/nginx/sites-available/myproject.conf /etc/nginx/sites-enabled/`
4. Получить SSL: `sudo certbot --nginx -d mydomain.com`
5. Перезагрузить nginx: `sudo nginx -t && sudo systemctl reload nginx`
6. Добавить запись в `ecosystem.config.js`

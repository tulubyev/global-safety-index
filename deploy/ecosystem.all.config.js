/**
 * PM2 ecosystem — все проекты на VPS
 *
 * Схема портов:
 *   Проект N → frontend: 3000 + N*10,  backend: 3001 + N*10
 *
 * Управление:
 *   pm2 start deploy/ecosystem.all.config.js          ← запустить все
 *   pm2 start deploy/ecosystem.all.config.js --only safety-backend  ← один
 *   pm2 restart safety-backend
 *   pm2 stop delivery-frontend
 */

module.exports = {
  apps: [

    // ─── Проект 1: Safety Index (порты 3000-3001) ──────────────────────────
    {
      name: 'safety-backend',
      cwd:  '/var/www/safety/backend',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV:     'production',
        PORT:         3001,
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL:    'redis://localhost:6379',
      },
    },
    {
      name: 'safety-frontend',
      cwd:  '/var/www/safety/frontend',
      script: 'node_modules/.bin/next',
      args:   'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV:            'production',
        NEXT_PUBLIC_API_URL: 'https://worldsafetyindex.org',
      },
    },

    // ─── Проект 2: Delivery (порты 3010-3011) ──────────────────────────────
    // {
    //   name: 'delivery-backend',
    //   cwd:  '/var/www/delivery/backend',
    //   script: 'src/index.js',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '512M',
    //   env: {
    //     NODE_ENV:     'production',
    //     PORT:         3011,
    //     DATABASE_URL: process.env.DELIVERY_DATABASE_URL,
    //   },
    // },
    // {
    //   name: 'delivery-frontend',
    //   cwd:  '/var/www/delivery/frontend',
    //   script: 'node_modules/.bin/next',
    //   args:   'start -p 3010',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '512M',
    //   env: {
    //     NODE_ENV:            'production',
    //     NEXT_PUBLIC_API_URL: 'https://delivery.example.com',
    //   },
    // },

    // ─── Проект 3 (порты 3020-3021) ────────────────────────────────────────
    // ... раскомментировать по мере добавления проектов

  ],
};

module.exports = {
  apps: [
    {
      name: 'safety-backend',
      cwd: '/var/www/safety/backend',
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
      cwd: '/var/www/safety/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV:              'production',
        NEXT_PUBLIC_API_URL:   'https://worldsafetyindex.org',
      },
    },
  ],
};

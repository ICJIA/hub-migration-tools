// PM2 ecosystem config for Strapi 5 production
// Copy to the Strapi 5 project root on the server, then:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [
    {
      name: 'strapi5-researchhub',
      cwd: '/home/forge/v2.researchhub.icjia-api.cloud',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 1337,
        APP_KEYS: 'replace-with-your-app-key-1,replace-with-your-app-key-2',
        API_TOKEN_SALT: 'replace-with-your-api-token-salt',
        ADMIN_JWT_SECRET: 'replace-with-your-admin-jwt-secret',
        JWT_SECRET: 'replace-with-your-jwt-secret',
        DATABASE_FILENAME: '.tmp/data.db',
      },
      // Restart if memory exceeds 512MB
      max_memory_restart: '512M',
      // Auto-restart on crash
      autorestart: true,
      // Watch for file changes (disable in production)
      watch: false,
    },
  ],
};

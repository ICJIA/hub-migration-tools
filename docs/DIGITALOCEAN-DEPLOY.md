# DigitalOcean Production Deployment Guide

Step-by-step instructions for deploying Strapi 5 on a DigitalOcean droplet and running the production migration.

## Prerequisites

- A DigitalOcean droplet (Ubuntu 22.04+ recommended) with SSH access
- DNS A record pointing `v2.hub.icjia-api.cloud` to the droplet IP
- Let's Encrypt SSL certificate already provisioned
- Node.js 22+ installed on the server
- This migration repo cloned on your local machine (tested locally first)

## 1. Install Strapi 5 on the Server

SSH into the droplet:

```bash
ssh forge@your-droplet-ip
```

Create the Strapi 5 project:

```bash
cd /home/forge
npx create-strapi@latest v2.hub.icjia-api.cloud
# TypeScript? No | Install with npm? Yes | Init git? Yes
cd v2.hub.icjia-api.cloud
```

Install the GraphQL plugin:

```bash
npm install @strapi/plugin-graphql
```

Build for production:

```bash
npm run build
```

## 2. Configure PM2

Copy the ecosystem config from the migration project, or create it:

```bash
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: 'strapi5-researchhub',
      cwd: '/home/forge/v2.hub.icjia-api.cloud',
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
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
    },
  ],
};
EOF
```

> **Important:** Replace the `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, and `JWT_SECRET` values with the ones from your Strapi 5 `.env` file. You can generate new ones with `openssl rand -base64 32`.

Start with PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # auto-start on reboot
```

Verify Strapi 5 is running:

```bash
curl http://localhost:1337
# Should return JSON (or 403 if public access isn't configured)
```

## 3. Configure Nginx

Create the site config:

```bash
sudo tee /etc/nginx/sites-available/v2.hub.icjia-api.cloud << 'EOF'
server {
    listen 443 ssl http2;
    server_name v2.hub.icjia-api.cloud;

    ssl_certificate /etc/letsencrypt/live/v2.hub.icjia-api.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/v2.hub.icjia-api.cloud/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:1337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Large timeouts for media uploads during migration
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 200M;
    }
}

server {
    listen 80;
    server_name v2.hub.icjia-api.cloud;
    return 301 https://$host$request_uri;
}
EOF
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/v2.hub.icjia-api.cloud /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Verify from your local machine:

```bash
curl https://v2.hub.icjia-api.cloud
```

## 4. Create Admin User + API Token

1. Open `https://v2.hub.icjia-api.cloud/admin` in your browser
2. Create the first admin user
3. Go to **Settings → API Tokens → Create new API Token**
4. Name: `migration`, Type: **Full access**, Save and copy the token

## 5. Copy Schemas to the Server

On your local machine, the schemas were already generated during local testing. Copy them to the server:

```bash
scp -r migration/output/strapi5-schemas/* forge@your-droplet-ip:/home/forge/v2.hub.icjia-api.cloud/src/api/
```

Then restart Strapi 5 on the server to pick up the schemas:

```bash
ssh forge@your-droplet-ip "cd /home/forge/v2.hub.icjia-api.cloud && npm run build && pm2 restart strapi5-researchhub"
```

## 6. Run the Production Migration

On your local machine:

```bash
cd hub-cms-migration-2026

# Point at production
cp config.prod.js config.js
pnpm set-strapi5
# URL: https://v2.hub.icjia-api.cloud
# Token: (paste your production token)

# Clean any local test data
pnpm migrate:clean

# Run all phases
pnpm migrate:phase01    # verify schemas on production
pnpm migrate:phase02    # extract from Strapi 3
pnpm migrate:phase03    # media migration (uploads go to production S5)
pnpm migrate:phase04    # load content + link relations
```

### Phase 4c: Timestamp Fix (Remote SQLite)

The timestamp fix requires direct SQLite access. Since the database is on the server, you have two options:

**Option A: Run the timestamp script on the server**

```bash
# Copy the migration project to the server
scp -r . forge@your-droplet-ip:/home/forge/hub-cms-migration-2026/

# SSH in, stop Strapi 5, run the fix
ssh forge@your-droplet-ip
cd /home/forge/hub-cms-migration-2026
npm install    # need better-sqlite3 compiled on the server
export STRAPI5_DB_PATH="/home/forge/v2.hub.icjia-api.cloud/.tmp/data.db"
pm2 stop strapi5-researchhub
node migration/scripts/04c-fix-timestamps.js
pm2 start strapi5-researchhub
```

**Option B: Download the DB, fix locally, upload back**

```bash
# Stop Strapi 5
ssh forge@your-droplet-ip "pm2 stop strapi5-researchhub"

# Download
scp forge@your-droplet-ip:/home/forge/v2.hub.icjia-api.cloud/.tmp/data.db ./data.db.remote

# Fix locally
STRAPI5_DB_PATH=./data.db.remote node migration/scripts/04c-fix-timestamps.js

# Upload back
scp ./data.db.remote forge@your-droplet-ip:/home/forge/v2.hub.icjia-api.cloud/.tmp/data.db

# Restart
ssh forge@your-droplet-ip "pm2 start strapi5-researchhub"
```

### Continue Validation

```bash
pnpm migrate:phase05    # validate
pnpm migrate:phase06    # parity audit
```

## 7. Post-Migration

- [ ] Verify `https://v2.hub.icjia-api.cloud/admin` — browse content
- [ ] Set "Entry title" to `title` for all content types (if not auto-set)
- [ ] Configure public API permissions: Settings → Roles → Public → enable `find`/`findOne` for each type
- [ ] Back up the SQLite database: `cp .tmp/data.db .tmp/data.db.bak`
- [ ] Update the ResearchHub frontend to point to the new API URL
- [ ] Monitor for 2 weeks before decommissioning Strapi 3

## 8. Ongoing: Sync New Content

If new content is added to Strapi 3 before the frontend switches over:

```bash
pnpm sync
```

## Stopping / Restarting Strapi 5

```bash
ssh forge@your-droplet-ip
pm2 stop strapi5-researchhub      # stop
pm2 start strapi5-researchhub     # start
pm2 restart strapi5-researchhub   # restart
pm2 logs strapi5-researchhub      # view logs
```

## Full Reset on Production

If you need to start the production migration from scratch:

```bash
ssh forge@your-droplet-ip
pm2 stop strapi5-researchhub
rm /home/forge/v2.hub.icjia-api.cloud/.tmp/data.db
pm2 start strapi5-researchhub
# Create new admin user + API token, then re-run migration from local machine
```

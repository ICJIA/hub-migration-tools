# Strapi 5 Setup Guide

Instructions for setting up a fresh Strapi 5 instance for the ResearchHub migration.

## 1. Create the Strapi 5 Project

On your server (or locally for development):

```bash
npx create-strapi@latest strapi5-researchhub
```

The installer will ask several questions:

| Prompt | Answer |
|---|---|
| Ok to proceed? | **y** |
| Use TypeScript? | **No** (JavaScript) |
| Install dependencies with npm? | **Yes** |
| Initialize a git repository? | Your choice (yes if standalone, no if part of a larger repo) |

> **Why npm and not pnpm for Strapi 5?** Strapi depends on `better-sqlite3`, a native C++ module that must be compiled during install. pnpm blocks build scripts by default and its strict module isolation causes binding resolution failures. npm handles native modules reliably. The migration project itself uses pnpm — this only applies to the Strapi 5 project.

If you already installed with pnpm and get `Could not locate the bindings file` errors:

```bash
cd strapi5-researchhub
rm -rf node_modules pnpm-lock.yaml
npm install
```

## 2. Install the GraphQL Plugin

Required for Phase 1c schema verification:

```bash
pnpm add @strapi/plugin-graphql
```

## 3. Copy Generated Schemas

After running Phase 1 (`pnpm migrate:phase01`), copy the generated schemas:

```bash
cp -r /path/to/hub-cms-migration-2026/migration/output/strapi5-schemas/* ./src/api/
```

## 4. Start in Development Mode

Start Strapi 5 to auto-create the database tables from the schemas:

```bash
pnpm develop
```

Watch the console for schema errors. Once you see "Welcome back!", the tables are created.

## 5. Create an Admin User

Open `http://localhost:1338/admin` and create an admin account.

## 6. Create a Full-Access API Token

1. Go to **Settings → API Tokens → Create new API Token**
2. Name: `migration`
3. Token type: **Full access**
4. Save and copy the token

Set the token in the migration project:

```bash
# Option A: environment variable
export STRAPI5_TOKEN="your-token-here"

# Option B: config.js
# Edit config.js and set strapi5.token
```

## 7. Configure API Permissions (Public Access)

If you want the REST API to be publicly readable after migration:

1. Go to **Settings → Roles → Public**
2. For each content type (Article, Dataset, App): enable `find` and `findOne`
3. Save

## Production Setup: PM2 + Nginx

### PM2

Install PM2 and create an ecosystem file:

```bash
pnpm add -g pm2
```

Create `ecosystem.config.cjs` in the Strapi 5 project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'strapi5-researchhub',
      cwd: '/home/forge/researchhub2.icjia-api.cloud',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 1338,
        APP_KEYS: 'your-app-key-1,your-app-key-2',
        API_TOKEN_SALT: 'your-api-token-salt',
        ADMIN_JWT_SECRET: 'your-admin-jwt-secret',
        JWT_SECRET: 'your-jwt-secret',
      },
    },
  ],
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # auto-start on reboot
```

### Nginx Reverse Proxy

Create `/etc/nginx/sites-available/researchhub2.icjia-api.cloud`:

```nginx
server {
    listen 80;
    server_name researchhub2.icjia-api.cloud;

    location / {
        proxy_pass http://127.0.0.1:1338;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for large media uploads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 200M;
    }
}
```

Enable the site and add SSL:

```bash
sudo ln -s /etc/nginx/sites-available/researchhub2.icjia-api.cloud /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Add SSL with Let's Encrypt (if using Certbot)
sudo certbot --nginx -d researchhub2.icjia-api.cloud
```

### Laravel Forge

If using Laravel Forge to manage the server:

1. **Create a new site** for `researchhub2.icjia-api.cloud`
2. **Set the web directory** to `/` (not `/public`)
3. **Deploy script:** `cd /home/forge/researchhub2.icjia-api.cloud && pnpm install && pnpm build && pm2 restart strapi5-researchhub`
4. **SSL:** Use Forge's built-in Let's Encrypt integration
5. **Nginx config:** Forge auto-generates the config. Override the location block with the proxy config above via Forge's "Edit Nginx Configuration" feature.

## 8. Update Migration Config

Once the Strapi 5 instance is running in production, update the migration config:

```bash
# In your migration project
export STRAPI5_API_URL="https://researchhub2.icjia-api.cloud"
export STRAPI5_GRAPHQL_URL="https://researchhub2.icjia-api.cloud/graphql"
export STRAPI5_TOKEN="your-production-token"
```

Or edit `config.js`:

```javascript
strapi5: {
  graphqlUrl: 'https://researchhub2.icjia-api.cloud/graphql',
  apiUrl: 'https://researchhub2.icjia-api.cloud',
  token: 'your-production-token',
},
```

## 9. Verify

Run Phase 1c verification against the production instance:

```bash
node migration/scripts/01c-verify-schemas.js
```

Should report all checks passing with the production URL.

## Stopping Strapi 5 (for Phase 4 Timestamp Fix)

Phase 4c requires Strapi 5 to be stopped for direct SQLite access:

```bash
# PM2
pm2 stop strapi5-researchhub

# After timestamp fix
pm2 start strapi5-researchhub
```

## SQLite Database Location

The SQLite database is typically at:
- **Development:** `.tmp/data.db`
- **Production:** `.tmp/data.db` or `database/data.db` (check `config/database.js`)

Set this path in the migration config:

```bash
export STRAPI5_DB_PATH="/home/forge/researchhub2.icjia-api.cloud/.tmp/data.db"
```

/**
 * @module config.prod
 * @description Production migration configuration.
 *
 * Use this profile for the actual production migration:
 *   - Strapi 3: production ResearchHub API (remote, DigitalOcean)
 *   - Strapi 5: production Strapi 5 instance (remote, DigitalOcean, proxied via Nginx)
 *
 * To use: cp config.prod.js config.js
 * Or: MIGRATION_ENV=prod node migration/scripts/01-run-phase.js
 *
 * IMPORTANT: Set STRAPI5_TOKEN before running. Never hardcode tokens here
 * if you plan to share this file.
 */

export default {
  strapi3: {
    graphqlUrl: 'https://researchhub.icjia-api.cloud/graphql',
    apiUrl: 'https://researchhub.icjia-api.cloud',
    token: process.env.STRAPI3_TOKEN || '',
  },

  strapi5: {
    graphqlUrl: 'https://researchhub2.icjia-api.cloud/graphql',
    apiUrl: 'https://researchhub2.icjia-api.cloud',
    token: process.env.STRAPI5_TOKEN || '',  // REQUIRED — create in Strapi 5 admin → Settings → API Tokens
    dbPath: process.env.STRAPI5_DB_PATH || '',  // SSH to server: /home/forge/researchhub2.icjia-api.cloud/.tmp/data.db
  },

  strapi3ProjectPath: '../strapi3-project',
  strapi5ProjectPath: process.env.STRAPI5_PROJECT_PATH || '/home/forge/researchhub2.icjia-api.cloud',
  contentTypes: ['article', 'dataset', 'app'],

  paths: {
    schemas: './schemas',
    introspection: './migration/data/introspection',
    output: './migration/output/strapi5-schemas',
    fieldTypeMap: './migration/config/field-type-map.json',
    fieldMap: './migration/config/field-map.json',
    rawData: './migration/data/raw',
    transformedData: './migration/data/transformed',
    media: './migration/data/media',
    maps: './migration/data/maps',
  },

  settings: {
    paginationLimit: 100,
    requestDelayMs: 200,       // Slightly slower for remote — respect the server
    requestTimeoutMs: 60000,   // Longer timeout for remote connections
    pollMaxAttempts: 30,
    pollDelayMs: 3000,
  },
};

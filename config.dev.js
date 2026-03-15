/**
 * @module config.dev
 * @description Development/testing configuration.
 *
 * Use this profile for local testing:
 *   - Strapi 3: production ResearchHub API (read-only, remote)
 *   - Strapi 5: local instance on your Mac (localhost:1338)
 *
 * To use: cp config.dev.js config.js
 * Or: MIGRATION_ENV=dev node migration/scripts/01-run-phase.js
 */

export default {
  strapi3: {
    graphqlUrl: 'https://researchhub.icjia-api.cloud/graphql',
    apiUrl: 'https://researchhub.icjia-api.cloud',
    token: '',  // Production Strapi 3 — no token needed for public GraphQL
  },

  strapi5: {
    graphqlUrl: 'http://localhost:1338/graphql',
    apiUrl: 'http://localhost:1338',
    token: process.env.STRAPI5_TOKEN || '',  // Set after creating token in local Strapi 5 admin
    dbPath: process.env.STRAPI5_DB_PATH || '../strapi5-project/.tmp/data.db',
  },

  strapi3ProjectPath: '../strapi3-project',
  strapi5ProjectPath: process.env.STRAPI5_PROJECT_PATH || '../strapi5-researchhub',
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
    requestDelayMs: 100,
    requestTimeoutMs: 30000,
    pollMaxAttempts: 30,
    pollDelayMs: 2000,
  },
};

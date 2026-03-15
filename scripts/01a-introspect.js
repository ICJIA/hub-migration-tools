/**
 * @module 01a-introspect
 * @description Phase 1a: Introspect Strapi 3
 *
 * Collects schema information from two sources:
 * 1. GraphQL introspection query against a running Strapi 3 instance (optional —
 *    gracefully degrades if Strapi 3 is not running)
 * 2. Strapi 3 model files from the local `schemas/` directory (primary source)
 *
 * Outputs:
 * - `data/introspection/strapi3.json` — GraphQL introspection result (filtered to content types)
 * - `data/introspection/strapi3-models.json` — Parsed model file data (authoritative)
 *
 * @example
 *   node scripts/01a-introspect.js
 *
 * Prerequisites:
 * - Strapi 3 model files in `schemas/` directory (article.settings.json, etc.)
 * - Optionally, Strapi 3 running at the configured GraphQL URL for cross-validation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** ANSI color codes for terminal output */
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Load config — fall back to example if config.js doesn't exist
let config;
try {
  config = (await import(path.join(ROOT, 'config.js'))).default;
} catch {
  console.warn('config.js not found — using config.example.js defaults');
  config = (await import(path.join(ROOT, 'config.example.js'))).default;
}

const INTROSPECTION_QUERY = `{
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
}`;

// Content type names as they appear in GraphQL (capitalized)
const GQL_TYPE_NAMES = new Set(['Article', 'Dataset', 'App']);

/**
 * Run a GraphQL introspection query against Strapi 3.
 * Returns filtered content type data, or null if Strapi 3 is unreachable.
 *
 * @returns {Promise<{types: Object[], allRelatedTypes: Object[]}|null>}
 *   Filtered introspection data, or null if connection failed
 */
async function introspectGraphQL() {
  const url = config.strapi3.graphqlUrl;
  console.log(`\nIntrospecting Strapi 3 GraphQL at ${url}...`);

  const headers = { 'Content-Type': 'application/json' };
  if (config.strapi3.token) {
    headers['Authorization'] = `Bearer ${config.strapi3.token}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      signal: AbortSignal.timeout(config.settings?.requestTimeoutMs || 30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
    }

    // Filter to only content type types
    const allTypes = json.data.__schema.types;
    const contentTypes = allTypes.filter(t => GQL_TYPE_NAMES.has(t.name) && t.kind === 'OBJECT');
    const systemTypes = allTypes.filter(t =>
      t.name.startsWith('Article') || t.name.startsWith('Dataset') || t.name.startsWith('App')
    );

    console.log(`  Found ${contentTypes.length} content types: ${contentTypes.map(t => t.name).join(', ')}`);
    for (const ct of contentTypes) {
      console.log(`    ${ct.name}: ${ct.fields?.length || 0} fields`);
    }

    return { types: contentTypes, allRelatedTypes: systemTypes };
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      console.warn(`  ${YELLOW}WARNING: Could not connect to Strapi 3 at ${url}${RESET}`);
      console.warn(`  ${YELLOW}GraphQL introspection skipped. Model files will be used as the sole source.${RESET}`);
      return null;
    }
    throw err;
  }
}

/**
 * Read Strapi 3 model definition files from the local `schemas/` directory,
 * falling back to the Strapi 3 project path if local files aren't found.
 *
 * @returns {Promise<Object>} Parsed models keyed by content type name
 */
async function readModelFiles() {
  console.log('\nReading Strapi 3 model files...');

  const models = {};

  for (const ctName of config.contentTypes) {
    // Try local schemas/ directory first
    const localPath = path.resolve(ROOT, config.paths.schemas, `${ctName}.settings.json`);
    // Fallback: Strapi 3 project directory
    const projectPath = path.resolve(ROOT, config.strapi3ProjectPath, `api/${ctName}/models/${ctName}.settings.json`);

    let filePath = localPath;
    try {
      await fs.access(localPath);
    } catch {
      try {
        await fs.access(projectPath);
        filePath = projectPath;
      } catch {
        console.error(`  ${RED}ERROR: Model file not found for "${ctName}" at:${RESET}`);
        console.error(`  ${RED}  ${localPath}${RESET}`);
        console.error(`  ${RED}  ${projectPath}${RESET}`);
        process.exit(1);
      }
    }

    const raw = await fs.readFile(filePath, 'utf8');
    models[ctName] = JSON.parse(raw);

    const attrs = Object.keys(models[ctName].attributes || {});
    console.log(`  ${ctName}: ${attrs.length} attributes (from ${path.relative(ROOT, filePath)})`);
  }

  return models;
}

async function main() {
  console.log('=== Phase 1a: Introspect Strapi 3 ===');

  // Show current config so user can verify
  console.log('\nConfiguration:');
  console.log(`  Strapi 3 GraphQL: ${config.strapi3.graphqlUrl}`);
  console.log(`  Strapi 3 API:     ${config.strapi3.apiUrl}`);
  console.log(`  Strapi 3 token:   ${config.strapi3.token ? '(set)' : '(not set)'}`);
  console.log(`  Schemas dir:      ${config.paths.schemas}`);
  console.log(`  Content types:    ${config.contentTypes.join(', ')}`);

  // Run both data collection tasks
  const [gqlResult, models] = await Promise.all([
    introspectGraphQL(),
    readModelFiles(),
  ]);

  // Create output directory
  const outputDir = path.resolve(ROOT, config.paths.introspection);
  await fs.mkdir(outputDir, { recursive: true });

  // Save GraphQL introspection (may be null if Strapi 3 was unreachable)
  const gqlPath = path.join(outputDir, 'strapi3.json');
  if (gqlResult) {
    await fs.writeFile(gqlPath, JSON.stringify(gqlResult, null, 2));
    console.log(`\nGraphQL introspection saved to ${path.relative(ROOT, gqlPath)}`);
  } else {
    await fs.writeFile(gqlPath, JSON.stringify({ types: [], note: 'GraphQL introspection skipped — Strapi 3 not reachable' }, null, 2));
    console.log(`\nGraphQL introspection skipped (placeholder saved to ${path.relative(ROOT, gqlPath)})`);
  }

  // Save model data
  const modelsPath = path.join(outputDir, 'strapi3-models.json');
  await fs.writeFile(modelsPath, JSON.stringify(models, null, 2));
  console.log(`Model data saved to ${path.relative(ROOT, modelsPath)}`);

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Content types: ${config.contentTypes.join(', ')}`);
  for (const [ctName, model] of Object.entries(models)) {
    const attrs = Object.entries(model.attributes || {});
    const scalars = attrs.filter(([, d]) => d.type && !d.plugin).length;
    const relations = attrs.filter(([, d]) => (d.collection || d.model) && !d.plugin).length;
    const media = attrs.filter(([, d]) => d.plugin === 'upload').length;
    console.log(`  ${ctName}: ${scalars} scalar, ${relations} relation, ${media} media`);
  }
  console.log('\nPhase 1a complete. Run `node scripts/01b-generate-schemas.js` next.');
}

main().catch(err => {
  console.error(`\n${RED}FATAL: ${err.message}${RESET}`);
  process.exit(1);
});

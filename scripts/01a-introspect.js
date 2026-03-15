/**
 * Phase 1a: Introspect Strapi 3
 *
 * 1. Run GraphQL introspection query against Strapi 3
 * 2. Read Strapi 3 model files from schemas/ directory
 * 3. Save both to data/introspection/
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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
      signal: AbortSignal.timeout(30000),
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
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      console.warn(`  WARNING: Could not connect to Strapi 3 at ${url}`);
      console.warn('  GraphQL introspection skipped. Model files will be used as the sole source.');
      return null;
    }
    throw err;
  }
}

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
        console.error(`  ERROR: Model file not found for "${ctName}" at:`);
        console.error(`    ${localPath}`);
        console.error(`    ${projectPath}`);
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
  console.error('\nFATAL:', err.message);
  process.exit(1);
});

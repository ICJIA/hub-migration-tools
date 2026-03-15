# Migration Scripts

All scripts are ES modules (Node 18+). Run from the **project root**:

```bash
node scripts/<script-name>.js
```

## Configuration

All scripts read from `config.js` in the project root. If `config.js` doesn't exist, they fall back to `config.example.js` defaults.

To customize, copy the example and edit:

```bash
cp config.example.js config.js
```

**Defaults:**
- **Strapi 3:** `https://researchhub.icjia-api.cloud` (production ResearchHub API)
- **Strapi 5:** `http://localhost:1338` (local development instance)
- **API tokens:** Empty by default — set via environment variables or in `config.js`

Every script prints its configuration at startup so you can verify the target URLs before it runs.

---

## Phase 1: Introspection & Schema Generation

### `01a-introspect.js`

**What it does:** Reads Strapi 3 model schemas and optionally runs a GraphQL introspection query against the Strapi 3 instance.

**Requires:** Schema files in `schemas/` directory (already in the repo). Strapi 3 does NOT need to be running — if unreachable, introspection is skipped and local schema files are used instead.

**Produces:**
- `data/introspection/strapi3-models.json` — parsed model definitions (authoritative source)
- `data/introspection/strapi3.json` — GraphQL introspection result (supplementary)

```bash
node scripts/01a-introspect.js
```

### `01b-generate-schemas.js`

**What it does:** Takes the Strapi 3 model data from 01a and generates complete Strapi 5 `schema.json` files with correct field types, relation mappings (inversedBy/mappedBy), Base64-to-media overrides, and boilerplate files (routes, controllers, services).

**Requires:** Phase 1a output (`data/introspection/strapi3-models.json`).

**Produces:**
- `output/strapi5-schemas/article/content-types/article/schema.json` + boilerplate
- `output/strapi5-schemas/dataset/content-types/dataset/schema.json` + boilerplate
- `output/strapi5-schemas/app/content-types/app/schema.json` + boilerplate
- `config/field-map.json` — per-field mapping details

```bash
node scripts/01b-generate-schemas.js
```

After running, copy the output to your Strapi 5 project:

```bash
cp -r output/strapi5-schemas/* /path/to/strapi5-project/src/api/
```

### `01c-verify-schemas.js`

**What it does:** Verifies that a running Strapi 5 instance has the correct schemas by:
1. Polling until Strapi 5 is ready (up to 60 seconds)
2. Running GraphQL introspection against Strapi 5
3. Diffing against Strapi 3 introspection data
4. Checking REST API responses
5. Verifying `legacyId` field exists on all content types

**Requires:**
- Strapi 5 running with the generated schemas applied
- `@strapi/plugin-graphql` installed in the Strapi 5 project
- Phase 1a output (`data/introspection/strapi3.json`)

**Produces:**
- `data/introspection/strapi5.json` — Strapi 5 introspection data
- `data/introspection/schema-diff.json` — categorized differences + REST/legacyId checks

**Exit codes:** 0 = all checks pass, 1 = unexpected differences found.

```bash
node scripts/01c-verify-schemas.js
```

---

## Phase 2–5: Not Yet Implemented

Scripts for phases 2–5 will be added here as they are implemented. Each will follow the same pattern:
- Reads configuration from `config.js`
- Prints configuration at startup
- Shows red error messages for failures
- Uses colored console output for pass/fail status
- Is independently re-runnable (idempotent where possible)

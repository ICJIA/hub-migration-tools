# Migration Scripts

All scripts are ES modules (Node 18+). Run from the **project root**:

```bash
node migration/scripts/<script-name>.js
```

Or use the pnpm shortcuts defined in `package.json`:

```bash
pnpm introspect    # runs 01a-introspect.js
pnpm generate      # runs 01b-generate-schemas.js
pnpm verify        # runs 01c-verify-schemas.js
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

## Directory Structure

```
migration/
├── scripts/         # Runnable migration scripts (this directory)
├── lib/             # Shared libraries used by scripts
├── config/          # Field type maps and generated field mappings
├── data/            # Generated intermediate data (introspection, extracts, transforms)
│   ├── introspection/   # GraphQL introspection results and schema diffs
│   ├── raw/             # Raw Strapi 3 data extracts (Phase 2, gitignored)
│   ├── transformed/     # Transformed data for Strapi 5 (Phase 3, gitignored)
│   ├── media/           # Decoded media files (Phase 3, gitignored)
│   └── maps/            # ID translation tables (Phase 4+)
└── output/          # Generated Strapi 5 schema files and boilerplate
```

---

## Reset / Clean

### `00-clean.js`

**What it does:** Removes all generated data and output from the `migration/` directory so you can start fresh. Preserves scripts, libraries, and static config (`field-type-map.json`).

**What gets removed:**
- `migration/data/` — introspection results, raw extracts, transformed data, media, maps
- `migration/output/` — generated Strapi 5 schemas and boilerplate
- `migration/config/field-map.json` — generated field mapping

**What is preserved:**
- `migration/scripts/`, `migration/lib/` — code
- `migration/config/field-type-map.json` — static config
- `schemas/` — source Strapi 3 schemas
- `config.js` / `config.example.js` — configuration

```bash
node migration/scripts/00-clean.js    # or: pnpm clean
```

---

## Phase 1: Introspection & Schema Generation

### `01-run-phase.js` (recommended)

**What it does:** Orchestrates all Phase 1 steps in sequence with interactive prompts. This is the easiest way to run Phase 1 — it handles the flow, explains what's happening at each step, and gives clear recovery instructions if anything fails.

```bash
node migration/scripts/01-run-phase.js    # or: pnpm migrate:phase01
```

The orchestrator runs: `01a` → `01b` → (manual copy + start Strapi 5) → `01c`, with confirmation prompts between each step. If a step fails, it tells you exactly which script to re-run — you don't need to start Phase 1 over.

You can also run each script individually (see below) if you prefer.

### `01a-introspect.js`

**What it does:** Reads Strapi 3 model schemas and optionally runs a GraphQL introspection query against the Strapi 3 instance.

**Requires:** Schema files in `schemas/` directory (already in the repo). Strapi 3 does NOT need to be running — if unreachable, introspection is skipped and local schema files are used instead.

**Produces:**
- `migration/data/introspection/strapi3-models.json` — parsed model definitions (authoritative source)
- `migration/data/introspection/strapi3.json` — GraphQL introspection result (supplementary)

```bash
node migration/scripts/01a-introspect.js
```

### `01b-generate-schemas.js`

**What it does:** Takes the Strapi 3 model data from 01a and generates complete Strapi 5 `schema.json` files with correct field types, relation mappings (inversedBy/mappedBy), Base64-to-media overrides, and boilerplate files (routes, controllers, services).

**Requires:** Phase 1a output (`migration/data/introspection/strapi3-models.json`).

**Produces:**
- `migration/output/strapi5-schemas/article/content-types/article/schema.json` + boilerplate
- `migration/output/strapi5-schemas/dataset/content-types/dataset/schema.json` + boilerplate
- `migration/output/strapi5-schemas/app/content-types/app/schema.json` + boilerplate
- `migration/config/field-map.json` — per-field mapping details

```bash
node migration/scripts/01b-generate-schemas.js
```

After running, copy the output to your Strapi 5 project:

```bash
cp -r migration/output/strapi5-schemas/* /path/to/strapi5-project/src/api/
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
- Phase 1a output (`migration/data/introspection/strapi3.json`)

**Produces:**
- `migration/data/introspection/strapi5.json` — Strapi 5 introspection data
- `migration/data/introspection/schema-diff.json` — categorized differences + REST/legacyId checks

**Exit codes:** 0 = all checks pass, 1 = unexpected differences found.

```bash
node migration/scripts/01c-verify-schemas.js
```

---

## Phase 2–5: Not Yet Implemented

Scripts for phases 2–5 will be added here as they are implemented. Each will follow the same pattern:
- Reads configuration from `config.js` at the project root
- Prints configuration at startup
- Shows red error messages for failures
- Uses colored console output for pass/fail status
- Is independently re-runnable (idempotent where possible)

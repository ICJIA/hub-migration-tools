# ResearchHub CMS Migration (Strapi 3 → Strapi 5)

**Project:** ResearchHub Content Migration
**Team:** ICJIA Development Team
**Date:** March 2026
**Version:** 0.8.0 ([Changelog](CHANGELOG.md))

---

## Overview

ResearchHub is ICJIA's platform for publishing research articles, datasets, and data dashboards. This project migrates ResearchHub's content management system from Strapi 3 (MongoDB) to Strapi 5 (SQLite).

Strapi 3 reached end of life in 2022 and no longer receives security patches or compatibility updates. Strapi 5 runs on SQLite, reducing infrastructure complexity and hosting costs while restoring active security and feature support.

## Migration Approach

We use an **API-to-API transfer** rather than direct database conversion:

1. **Read** all content from Strapi 3 via its GraphQL API
2. **Transform** content to match Strapi 5's format, including extracting Base64-encoded images from article and app fields into proper media library files
3. **Write** transformed content into Strapi 5 via its REST API
4. **Verify** completeness and correctness with automated gate checks at every phase

## Content Scope

| Content Type | Count | Complexity | Key Challenges |
|---|---|---|---|
| Articles | ~250 | High | `splash` + `thumbnail` (Base64), inline images in `markdown`, `mainfile`/`extrafile` (upload plugin), 2 m2m relations |
| Datasets | ~42 | Medium | `datafile` (upload plugin), multiple JSON metadata fields, 2 non-dominant m2m relations |
| Apps (Dashboards) | ~15 | Medium | `image` (Base64), 2 dominant m2m relations to articles and datasets |

### Relation Graph

All three content types are interconnected in a triangle:

```
article ──m2m── dataset   (article dominant)
article ──m2m── app       (app dominant)
app     ──m2m── dataset   (app dominant)
```

## Project Phases

| Phase | Description | Est. Effort |
|---|---|---|
| 1. Schema Setup | Introspect Strapi 3 schema, generate Strapi 5 content types | 1–2 days |
| 2. Data Extraction | Pull all content from Strapi 3 into local JSON files | 1 day |
| 3. Image & Media Migration | Extract Base64 images, upload media files, rewrite references | 2–3 days |
| 4. Content Loading | Load transformed content into Strapi 5, link relations, restore timestamps | 1–2 days |
| 5. Validation | Automated verification of migration completeness and correctness | 1–2 days |

**Total estimated effort:** 7–11 working days (single developer, sequential phases).

## Documentation

Detailed documentation for every aspect of this migration is available in the [`docs/`](docs/) directory:

- **Executive Summary** — High-level overview for project stakeholders and management: [Markdown](docs/researchhub-migration-executive-summary.md) | [Word (.docx)](https://github.com/ICJIA/hub-cms-migration-2026/raw/main/docs/researchhub-migration-executive-summary.docx)
- **[Doc 00 — Master Design](docs/researchhub-migration-doc00.md)** — Full technical architecture: API-to-API approach, data model mapping, Base64 extraction strategy, relation triangle, and end-to-end migration pipeline
- **[Doc 01 — Phase 1: Introspection & Schema Generation](docs/researchhub-migration-doc01.md)** — Strapi 3 schema discovery and Strapi 5 content type generation
- **[Doc 02 — Phase 2: Data Extraction](docs/researchhub-migration-doc02.md)** — GraphQL-based content extraction to local JSON files
- **[Doc 03 — Phase 3: Base64 Extraction & Media Migration](docs/researchhub-migration-doc03.md)** — Image decoding, media library upload, and content rewriting
- **[Doc 04 — Phase 4: Data Loading & Timestamp Restoration](docs/researchhub-migration-doc04.md)** — Content loading via REST API, relation triangle linking, and timestamp correction
- **[Doc 05 — Phase 5: Validation & Reconciliation](docs/researchhub-migration-doc05.md)** — Automated verification checks and migration integrity report

### Strapi 3 Schemas

The actual Strapi 3 model schemas are stored in [`schemas/`](schemas/) for reference:

- [`article.settings.json`](schemas/article.settings.json) — 16 scalar fields, 2 upload-plugin media fields, 2 m2m relations
- [`dataset.settings.json`](schemas/dataset.settings.json) — 14 scalar fields, 1 upload-plugin media field, 2 m2m relations
- [`app.settings.json`](schemas/app.settings.json) — 12 scalar fields, 2 m2m relations (both dominant)

## Getting Started

### Prerequisites

- Node.js 18+ (see `.nvmrc` — project targets Node 22)
- pnpm (`npm install -g pnpm` if not already installed)
- A fresh Strapi 5 project (`npx create-strapi@latest`) for Phase 1c onward
- `@strapi/plugin-graphql` installed in the Strapi 5 project (for schema verification)

### Configuration

All scripts read from a single config file at the project root. Copy the example and customize:

```bash
pnpm install
cp config.example.js config.js
```

**Defaults** (work out of the box for most cases):
- **Strapi 3:** `https://researchhub.icjia-api.cloud` (production ResearchHub API)
- **Strapi 5:** `http://localhost:1338` (local development instance)
- **API tokens:** Empty — set via `STRAPI3_TOKEN` / `STRAPI5_TOKEN` env vars or in `config.js`

Every script prints its configuration at startup so you can verify target URLs before it runs. See [`config.example.js`](config.example.js) for all available settings.

> **Security:** `config.js` is gitignored because it may contain API tokens. Never commit it.

### Resetting

To wipe all generated data and start fresh:

```bash
node migration/scripts/00-clean.js    # or: pnpm clean
```

This removes `migration/data/`, `migration/output/`, and the generated field map. Scripts, libraries, static config, and source schemas are preserved.

### Phase 1: Schema Setup

Generates Strapi 5 content type schemas from the Strapi 3 model definitions. See [`migration/scripts/README.md`](migration/scripts/README.md) for detailed script documentation.

**Recommended — run the interactive orchestrator:**

```bash
pnpm migrate:phase01
```

This walks you through all steps with prompts, explains what's needed at each stage, and gives clear recovery instructions if anything fails. You can pause and resume at any point.

**Or run each step individually:**

```bash
# Step 1: Read Strapi 3 schemas (works without Strapi 3 running — uses local files)
node migration/scripts/01a-introspect.js

# Step 2: Generate Strapi 5 schema.json files + boilerplate
node migration/scripts/01b-generate-schemas.js

# Step 3: Copy generated schemas to your Strapi 5 project
cp -r migration/output/strapi5-schemas/* /path/to/strapi5-project/src/api/

# Step 4: Start Strapi 5 in dev mode (it reads schemas and creates tables)
cd /path/to/strapi5-project && pnpm develop

# Step 5: Verify schemas were applied correctly (Strapi 5 must be running)
node migration/scripts/01c-verify-schemas.js
```

**What gets generated:**
- 3 `schema.json` files with all fields, relations (triangle), and `legacyId`
- Route, controller, and service boilerplate for each content type
- Field mapping reference at `migration/config/field-map.json`

### Phase 2: Data Extraction *(not yet implemented)*

Pulls all content from Strapi 3 via GraphQL and stores it as local JSON files. After this phase, Strapi 3 is no longer needed — all data exists locally.

```bash
pnpm migrate:phase02          # orchestrator (when implemented)
node migration/scripts/02-extract.js    # extract all content types
node migration/scripts/02-verify.js     # verify counts and data integrity
```

**What it will produce:** `migration/data/raw/articles.json`, `datasets.json`, `apps.json`, and an extraction manifest. See [Doc 02](docs/researchhub-migration-doc02.md) for details.

### Phase 3: Base64 Extraction & Media Migration *(not yet implemented)*

Extracts Base64 images from article `splash`/`thumbnail`/`markdown` and app `image` fields, decodes them to files, uploads to Strapi 5's media library, and rewrites content references. Also downloads and re-uploads `mainfile`/`extrafile`/`datafile` media.

```bash
pnpm migrate:phase03          # orchestrator (when implemented)
node migration/scripts/03a-scan-base64.js       # scan for Base64 images
node migration/scripts/03b-decode-base64.js      # decode to binary files
node migration/scripts/03c-upload-media.js       # upload to Strapi 5
node migration/scripts/03d-rewrite-content.js    # replace Base64 with media URLs
node migration/scripts/03e-transform.js          # transform datasets + apps, migrate upload-plugin files
node migration/scripts/03-verify.js              # verify zero Base64 remnants, all media accessible
```

**What it will produce:** decoded images in `migration/data/media/`, media ID map, and transformed content in `migration/data/transformed/`. See [Doc 03](docs/researchhub-migration-doc03.md) for details.

### Phase 4: Data Loading & Timestamp Restoration *(not yet implemented)*

Loads all transformed content into Strapi 5 via REST API in dependency order (datasets → apps → articles), links the m2m relation triangle, and restores original `createdAt`/`updatedAt` timestamps via direct SQLite updates.

```bash
pnpm migrate:phase04          # orchestrator (when implemented)
node migration/scripts/04-load.js               # load all content types
node migration/scripts/04b-link-relations.js     # link relation triangle
node migration/scripts/04c-fix-timestamps.js     # restore original timestamps
node migration/scripts/04-verify.js              # verify counts, relations, timestamps
```

**What it will produce:** fully populated Strapi 5 with all content, relations, and correct timestamps. ID maps in `migration/data/maps/`. See [Doc 04](docs/researchhub-migration-doc04.md) for details.

### Phase 5: Validation & Reconciliation *(not yet implemented)*

Runs 10 automated checks comparing Strapi 3 and Strapi 5 end-to-end: record counts, legacy ID coverage, zero Base64 remnants, media accessibility, relation integrity (all three m2m sets), timestamp preservation, content integrity spot checks, and duplicate detection.

```bash
pnpm migrate:phase05          # orchestrator (when implemented)
node migration/scripts/05-validate.js           # run all 10 validation checks
```

**What it will produce:** `migration/data/validation-report.json` with pass/fail per check and a console summary. See [Doc 05](docs/researchhub-migration-doc05.md) for details.

## Success Criteria

1. All records transferred (matching counts between source and target)
2. All Base64 images extracted (`splash`, `thumbnail`, `image`) and stored as media library files
3. All upload-plugin files migrated (`mainfile`, `extrafile`, `datafile`)
4. All relationships preserved (article↔dataset, article↔app, app↔dataset)
5. All original `createdAt`/`updatedAt` timestamps preserved
6. Zero Base64 remnants in any text field
7. No duplicate records
8. ResearchHub website functions correctly with the new backend

## License

Copyright (c) 2026 Illinois Criminal Justice Information Authority (ICJIA)

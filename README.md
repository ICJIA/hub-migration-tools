# ResearchHub CMS Migration (Strapi 3 → Strapi 5)

![ResearchHub CMS Migration](docs/og-image.png)

A complete, automated migration tool for converting a legacy Strapi 3 (MongoDB) content management system to a current Strapi 5 (SQLite) instance. Performs a full API-to-API transfer — extracting all content, media, and relations from Strapi 3, transforming and loading them into Strapi 5, then running automated validation and field-by-field parity checks. The end result is a fully migrated, verified Strapi 5 database running on SQLite.

**Project:** ResearchHub Content Migration
**Team:** ICJIA Development Team
**Date:** March 2026
**Version:** 3.0.0 ([Changelog](CHANGELOG.md))

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Phase Details with CLI Output](#phase-details-with-cli-output)
- [Configuration](#configuration)
- [Resetting & Starting Over](#resetting--starting-over)
- [Incremental Sync](#incremental-sync)
- [Migration Checklist](#migration-checklist)
- [Documentation](#documentation)
- [Risks and Mitigations](#risks-and-mitigations)
- [Success Criteria](#success-criteria)
- [License](#license)

---

## Overview

ResearchHub is ICJIA's platform for publishing research articles, datasets, and data dashboards. This project migrates all content from Strapi 3 (MongoDB, end-of-life since 2022) to Strapi 5 (SQLite).

### What gets migrated

| Content Type | Count | Key Challenges |
|---|---|---|
| Articles | ~246 | `splash` + `thumbnail` (Base64 images), inline images in `markdown`, `mainfile`/`extrafile` (upload plugin), 2 m2m relations |
| Datasets | ~35 | `datafile` (upload plugin), multiple JSON metadata fields, 2 m2m relations |
| Apps | ~14 | `image` (Base64), 2 dominant m2m relations to articles and datasets |

### Relation graph

All three content types are interconnected:

```mermaid
graph LR
    A[Article<br/>~246 records] -->|m2m<br/>article dominant| D[Dataset<br/>~35 records]
    AP[App<br/>~14 records] -->|m2m<br/>app dominant| A
    AP -->|m2m<br/>app dominant| D

    style A fill:#4a90d9,stroke:#2c5f8a,color:#fff
    style D fill:#50b87a,stroke:#2d7a4d,color:#fff
    style AP fill:#e8a838,stroke:#b07a1a,color:#fff
```

### How it works

| Phase | Command | What happens |
|---|---|---|
| 1. Schema Setup | `pnpm migrate:phase01` | Reads Strapi 3 schemas, generates Strapi 5 content types, verifies |
| 2. Data Extraction | `pnpm migrate:phase02` | Pulls all content from Strapi 3 via GraphQL into local JSON files |
| 3. Media Migration | `pnpm migrate:phase03` | Extracts Base64 images, uploads media, rewrites content references |
| 4. Content Loading | `pnpm migrate:phase04` | Loads content into Strapi 5, links relation triangle, restores timestamps |
| 5. Validation | `pnpm migrate:phase05` | 10 automated pass/fail checks comparing Strapi 3 and Strapi 5 |
| 6. Parity Audit | `pnpm migrate:phase06` | Field-by-field comparison of every record; detailed audit report |

**Estimated effort:** 8–12 working days (single developer, sequential phases).

---

## Quick Start

> **Test locally first.** The entire migration runs on `localhost:1338` — no cloud server needed. The scripts read from the remote Strapi 3 API and write to your local Strapi 5. Run it, verify everything, then deploy to production.

### Platform support

| Platform | Status | Notes |
|---|---|---|
| **macOS** | Supported | Primary development platform. Tested on macOS Tahoe. |
| **Linux** | Supported | Ubuntu preferred. Any distro with Node.js 18+ and pnpm. |
| **Windows** | WSL2 required | Install [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) with Ubuntu. |

### Step 0: Install prerequisites

```bash
# Node.js 22 (using nvm)
nvm install 22 && nvm use 22

# pnpm
npm install -g pnpm

# Verify
node --version   # v22.x
pnpm --version   # 10.x+
```

### Step 1: Clone and install

```bash
git clone https://github.com/ICJIA/hub-cms-migration-2026.git
cd hub-cms-migration-2026
pnpm install
```

### Step 2: Create a fresh Strapi 5 project

In a **separate directory** (not inside the migration project):

```bash
cd ..
npx create-strapi@latest strapi5-researchhub
# TypeScript? No | Install with npm? Yes | Init git? Your choice
cd strapi5-researchhub
echo "PORT=1338" >> .env
npm install @strapi/plugin-graphql
npm run develop
```

Wait for "Welcome back!" then open `http://localhost:1338/admin` and create your admin account.

### Step 3: Create an API token

In the Strapi 5 admin: **Settings → API Tokens → Create new API Token** → Name: `migration`, Type: **Full access** → Save and copy the token.

### Step 4: Configure

```bash
cd ../hub-cms-migration-2026
pnpm set-strapi5    # prompts for URL and token, tests connectivity
```

Or manually: `cp config.dev.js config.js` and paste the token into `strapi5.token`.

### Step 5–10: Run all phases

```bash
pnpm migrate:phase01    # Schema setup (reads S3 schemas, generates S5 types, verifies)
pnpm migrate:phase02    # Data extraction (pulls all content from S3 into local JSON)
pnpm migrate:phase03    # Media migration (Base64 extraction, upload, content rewrite)
pnpm migrate:phase04    # Content loading (load → link relations → fix timestamps)
pnpm migrate:phase05    # Validation (10 automated checks)
pnpm migrate:phase06    # Parity audit (field-by-field comparison, audit report)
```

Each phase is interactive — prompts between steps, explains what's needed, and gives recovery instructions if anything fails. You can pause and resume at any point.

### Step 11: Manual QA

Open `http://localhost:1338/admin` and verify: articles have images, relations show titles, files download, dates are historic.

### Done!

Your local Strapi 5 is a verified copy of production Strapi 3 data. When ready for production:

1. Set up a Strapi 5 instance on DigitalOcean (see [Strapi 5 Setup Guide](docs/STRAPI5-SETUP.md))
2. Point at production: `pnpm set-strapi5`
3. Run all phases again: `pnpm migrate:clean` then `pnpm migrate:phase01` through `phase06`

---

## Phase Details with CLI Output

Each phase's orchestrator handles the full flow. Individual scripts can also be run for targeted re-runs. See [`migration/scripts/README.md`](migration/scripts/README.md) for per-script documentation.

### Phase 1: Schema Setup

Reads Strapi 3 model schemas, generates Strapi 5 `schema.json` files with correct field types, relation triangle (inversedBy/mappedBy), Base64-to-media overrides, and `legacyId` field. Auto-copies schemas to the Strapi 5 project.

```bash
pnpm migrate:phase01                              # recommended: interactive orchestrator

# Or run individually:
node migration/scripts/01a-introspect.js           # read Strapi 3 schemas
node migration/scripts/01b-generate-schemas.js     # generate Strapi 5 schemas
node migration/scripts/01c-verify-schemas.js       # verify against running Strapi 5
```

<details>
<summary>Example CLI output</summary>

```console
=== Phase 1a: Introspect Strapi 3 ===

Configuration:
  Strapi 3 GraphQL: https://researchhub.icjia-api.cloud/graphql
  Schemas dir:      ./schemas
  Content types:    article, dataset, app

Reading Strapi 3 model files...
  article: 22 attributes | dataset: 19 attributes | app: 15 attributes

--- Summary ---
  article: 18 scalar, 2 relation, 2 media
  dataset: 16 scalar, 2 relation, 1 media
  app: 13 scalar, 2 relation, 0 media

=== Phase 1b: Generate Strapi 5 Schemas ===

  article: 23 fields (2 overrides) | dataset: 20 fields | app: 16 fields (1 override)
  Content types generated: 3 | Total fields: 59 | Overrides applied: 3

=== Phase 1c: Verify ===

  Expected differences (36): splash→media, thumbnail→media, image→media, ...
  REST API: PASS ✓ | legacyId field: PASS ✓ | Schema diff: PASS ✓

  Overall: PASS ✓ — Ready for Phase 2
```

</details>

### Phase 2: Data Extraction

Pulls all content from Strapi 3 via paginated GraphQL. After this phase, all data exists locally.

```bash
pnpm migrate:phase02

# Or individually:
node migration/scripts/02-extract.js     # extract all content types
node migration/scripts/02-verify.js      # verify counts and integrity
```

<details>
<summary>Example CLI output</summary>

```console
Extracting articles... page 1 — 100 | page 2 — 200 | page 3 — 246
  ✓ 246 articles saved
Extracting datasets... ✓ 35 datasets saved
Extracting apps... ✓ 14 apps saved

Verifying counts against Strapi 3 REST endpoints...
  ✓ articles: 246 = 246 | ✓ datasets: 35 = 35 | ✓ apps: 14 = 14

=== Verification ===
  ✓ article mainfile refs: 203/203 valid (43 null)
  ✓ article extrafile refs: 4/4 valid (242 null)
  ✓ dataset datafile refs: 34/34 valid (1 null)
  ✓ app image field: 14/14 have non-null image
  All 26 checks passed ✓
```

</details>

### Phase 3: Base64 Extraction & Media Migration

Scans articles and apps for Base64 images, decodes them, uploads to Strapi 5 media library, rewrites all content references. Also migrates upload-plugin files (mainfile, extrafile, datafile).

```bash
pnpm migrate:phase03

# Or individually:
node migration/scripts/03a-scan-base64.js        # scan + produce manifest
node migration/scripts/03b-decode-base64.js       # decode to binary files
node migration/scripts/03c-upload-media.js        # upload to Strapi 5
node migration/scripts/03d-rewrite-content.js     # rewrite articles
node migration/scripts/03e-transform.js           # transform datasets + apps
node migration/scripts/03-verify.js               # verify everything
```

<details>
<summary>Example CLI output</summary>

```console
Scan complete: 1091 images (239 splash, 239 thumbnail, 599 inline, 14 app images)
Decode complete: 1091 succeeded, 0 failed
Upload complete: 1091 files processed
Post-rewrite scan: 0 Base64 remnants found ✓

Phase 3e: Datasets 35 | Articles 246 updated | Apps 14 | Media map: 1331 entries

=== Verification ===
  ✓ Splash parity: 239/239 | Thumbnail: 239/239 | Mainfile: 203/203
  ✓ Zero data:image/ substrings in transformed markdown
  All 36 checks passed ✓
```

</details>

### Phase 4: Data Loading & Timestamp Restoration

Loads content in dependency order (datasets → apps → articles), links the relation triangle, restores original timestamps via SQLite, auto-configures admin display settings.

```bash
pnpm migrate:phase04

# Or individually:
node migration/scripts/04-load.js                # load content
node migration/scripts/04b-link-relations.js      # link relation triangle
node migration/scripts/04c-fix-timestamps.js      # restore timestamps (stop Strapi 5 first!)
node migration/scripts/04-verify.js               # verify everything
```

<details>
<summary>Example CLI output</summary>

```console
Loading datasets: 35/35 ✓ | Loading apps: 14/14 ✓ | Loading articles: 246/246 ✓
Linking relations: 246 articles + 14 apps processed
Timestamp restoration: 295 records updated
  ✓ article.article: mainField legacyId → title
  ✓ dataset.dataset: mainField legacyId → title
  ✓ app.app: mainField legacyId → title

=== Verification ===
  [PASS] 246 articles, 35 datasets, 14 apps — counts match
  [PASS] No duplicate legacyIds
  [PASS] All relations correct | All timestamps historic | All media set
  All 21 checks passed ✓
```

</details>

### Phase 5: Validation

10 automated end-to-end checks comparing Strapi 3 and Strapi 5.

```bash
pnpm migrate:phase05

# Or directly:
node migration/scripts/05-validate.js
```

<details>
<summary>Example CLI output</summary>

```console
╔═══════════════════════════════════╗
║  ResearchHub Migration Validation ║
╚═══════════════════════════════════╝

  ✓ Record counts ................. PASS (246 articles, 35 datasets, 14 apps)
  ✓ Legacy ID coverage ............ PASS (295/295 mapped)
  ✓ Zero Base64 remnants .......... PASS (0 found)
  ✓ Image/media migration ......... PASS (splash 239, thumbnail 239, mainfile 203, extrafile 4, app 14)
  ✓ Dataset file migration ........ PASS (34/34)
  ✓ Media accessibility ........... PASS (1331/1331)
  ✓ Relation integrity ............ PASS (all 3 m2m sets correct)
  ✓ Timestamp preservation ........ PASS (295/295)
  ✓ Content integrity ............. PASS (25/25 spot checks)
  ✓ No duplicates ................. PASS (0 duplicates)

  Result: 10/10 checks passed — MIGRATION VALIDATED ✓
```

</details>

### Phase 6: Parity Audit

Field-by-field comparison of every record. Categorizes differences as ERROR (unexpected), EXPECTED (Base64 → media, date format, boolean defaults), or INFO. Produces JSON + Markdown reports.

```bash
pnpm migrate:phase06

# Or directly:
node migration/scripts/06-audit.js
```

<details>
<summary>Example CLI output</summary>

```console
Auditing articles: 246/246 | datasets: 35/35 | apps: 14/14

Media audit: 1331 accessible, 0 inaccessible

╔═════════════════════════════════════╗
║  Parity Audit — Summary             ║
╚═════════════════════════════════════╝

  Records compared:    295
  Fields compared:     6,877

  ERROR:     0
  EXPECTED:  1,315
  INFO:      6
  OK:        5,571

  RESULT: 0 ERROR(s) — migration verified ✓
```

</details>

---

## Configuration

All scripts read from `config.js` at the project root (gitignored — may contain tokens).

| Profile | Strapi 3 | Strapi 5 | Use case |
|---|---|---|---|
| `config.dev.js` | `researchhub.icjia-api.cloud` (remote) | `localhost:1338` (local) | Development testing |
| `config.prod.js` | `researchhub.icjia-api.cloud` (remote) | `researchhubv2.icjia-api.cloud` (remote) | Production migration |

```bash
cp config.dev.js config.js          # local testing
cp config.prod.js config.js         # production
pnpm set-strapi5                    # interactive: prompts for URL + token
```

Every script prints its configuration at startup. See [`config.example.js`](config.example.js) for all settings.

---

## Resetting & Starting Over

```bash
# Wipe migration data only (keep Strapi 5 database)
pnpm migrate:clean

# Full reset (start from scratch)
# 1. Stop Strapi 5 (Ctrl+C)
rm /path/to/strapi5-project/.tmp/data.db   # delete the database
pnpm migrate:clean                          # clean migration data
# 2. Restart Strapi 5 (npm run develop) — recreates DB from existing schema files
# 3. Create new admin user + API token
# 4. Run all phases again
```

This is safe and expected — the migration is designed for repeated runs.

---

## Incremental Sync

If new content is added to Strapi 3 while Strapi 5 is in dev:

```bash
pnpm sync
```

Compares all records by `legacyId`, automatically loads new records, flags updated/deleted records for review. Safe to run multiple times.

---

<details>
<summary><h2>Migration Checklist (click to expand)</h2></summary>

### Phase 1: Schema Setup

- [ ] Connect to Strapi 3 GraphQL and read model files
- [ ] Convert field types with overrides (splash/thumbnail/image → media)
- [ ] Convert upload plugin fields (mainfile/extrafile/datafile → media)
- [ ] Convert relations with correct dominance (triangle graph)
- [ ] Add `legacyId` (string, unique) to all content types
- [ ] Generate CommonJS boilerplate (routes, controllers, services)
- [ ] Auto-copy schemas to Strapi 5 project
- [ ] Verify all 3 content types in Strapi 5 via GraphQL introspection
- [ ] Verify REST API responds and `legacyId` field exists

### Phase 2: Data Extraction

- [ ] Extract ~246 articles with all fields, relations, and media references
- [ ] Extract ~35 datasets with all fields and datafile media references
- [ ] Extract ~14 apps with all fields, image, and relations
- [ ] Verify counts against Strapi 3 REST endpoints
- [ ] Validate ObjectId format, timestamps, relation arrays, media refs

### Phase 3: Base64 Extraction & Media Migration

- [ ] Scan articles: splash, thumbnail, images (JSON), markdown inline, HTML fallback
- [ ] Scan apps: image field
- [ ] Decode ~1,091 Base64 images to binary files with magic byte validation
- [ ] Upload all files to Strapi 5 media library (idempotent)
- [ ] Download and re-upload mainfile/extrafile (articles) and datafile (datasets)
- [ ] Rewrite article markdown: Base64 → `/uploads/` URLs
- [ ] Replace splash/thumbnail/image with Strapi 5 media IDs
- [ ] Verify zero `data:image/` remnants in transformed content
- [ ] Verify all media accessible in Strapi 5 (HTTP 200)

### Phase 4: Data Loading & Timestamp Restoration

- [ ] Load datasets (35) → apps (14) → articles (246) in dependency order
- [ ] Check `legacyId` for duplicates before each POST (idempotent)
- [ ] Link article → datasets (article dominant)
- [ ] Link app → articles + app → datasets (app dominant for both)
- [ ] Stop Strapi 5, restore timestamps via SQLite UPDATE
- [ ] Set "Entry title" to `title` for admin display
- [ ] Restart Strapi 5, verify counts/relations/timestamps/media

### Phase 5: Validation (10 checks)

- [ ] Record counts match between Strapi 3 and Strapi 5
- [ ] Every Strapi 3 ID maps to exactly one Strapi 5 record
- [ ] Zero Base64 remnants in all text fields
- [ ] All media fields populated (splash, thumbnail, mainfile, extrafile, image, datafile)
- [ ] All media URLs return HTTP 200
- [ ] All 3 relation sets intact
- [ ] All timestamps match originals (±1 second)
- [ ] Content spot check: 10% of articles pass title/slug/markdown comparison
- [ ] Zero duplicate legacyId values

### Phase 6: Parity Audit

- [ ] Every scalar field compared for every record
- [ ] JSON fields deep-compared (categories, tags, authors, etc.)
- [ ] Markdown text compared (stripped of image refs)
- [ ] Media fields: Base64 → media = EXPECTED, null/null = OK, mismatch = ERROR
- [ ] Timestamps: ±1 second tolerance
- [ ] Relations: set comparison by legacyId
- [ ] 0 ERRORs in final audit report

### Post-Migration

- [ ] Manual QA in Strapi 5 admin panel
- [ ] Share audit-report.md with stakeholders
- [ ] Back up Strapi 5 SQLite database
- [ ] Run `pnpm sync` if new Strapi 3 content before cutover
- [ ] Switch frontend to Strapi 5 API

</details>

---

## Documentation

| Document | Description |
|---|---|
| **Executive Summary** | Stakeholder overview: [Markdown](docs/researchhub-migration-executive-summary.md) \| [Word (.docx)](https://github.com/ICJIA/hub-cms-migration-2026/raw/main/docs/researchhub-migration-executive-summary.docx) |
| **[Doc 00 — Master Design](docs/researchhub-migration-doc00.md)** | Full technical architecture, data model, relation triangle |
| **[Doc 01 — Phase 1](docs/researchhub-migration-doc01.md)** | Schema introspection and generation |
| **[Doc 02 — Phase 2](docs/researchhub-migration-doc02.md)** | GraphQL data extraction |
| **[Doc 03 — Phase 3](docs/researchhub-migration-doc03.md)** | Base64 extraction and media migration |
| **[Doc 04 — Phase 4](docs/researchhub-migration-doc04.md)** | Content loading, relations, timestamps |
| **[Doc 05 — Phase 5](docs/researchhub-migration-doc05.md)** | Automated validation checks |
| **[Doc 06 — Phase 6](docs/researchhub-migration-doc06.md)** | Field-by-field parity audit |
| **[Strapi 5 Setup Guide](docs/STRAPI5-SETUP.md)** | Installation, PM2, Nginx, Laravel Forge |
| **[Scripts Reference](migration/scripts/README.md)** | Per-script documentation |

Strapi 3 schemas: [`article.settings.json`](schemas/article.settings.json) · [`dataset.settings.json`](schemas/dataset.settings.json) · [`app.settings.json`](schemas/app.settings.json)

---

## Risks and Mitigations

| Risk | Impact | Mitigation | Phase |
|---|---|---|---|
| Image extraction misses images | High | Regex scan + HTML fallback + post-rewrite remnant check | 3, 5 |
| Content corrupted during transfer | High | Original data preserved in `data/raw/`; field-by-field audit | 2, 6 |
| Timestamps overwritten | High | Captured during extraction, restored via direct SQLite update | 2, 4 |
| Migration fails partway | Medium | Idempotent scripts (legacyId dedup); re-run picks up where it left off | 4 |
| Relation triangle broken | Medium | Linked from dominant side; verified by 3 automated checks | 4, 5 |
| Media files fail to transfer | Medium | Each verified individually; failures logged for targeted re-run | 3 |

Full risk register: [Doc 00, Section 7](docs/researchhub-migration-doc00.md)

---

## Success Criteria

1. All records transferred (matching counts)
2. All Base64 images extracted and stored as media library files
3. All upload-plugin files migrated (mainfile, extrafile, datafile)
4. All relationships preserved (article↔dataset, article↔app, app↔dataset)
5. All original timestamps preserved
6. Zero Base64 remnants
7. No duplicate records
8. Phase 6 audit: 0 ERRORs

---

## License

[MIT License](LICENSE) — Copyright (c) 2026 Illinois Criminal Justice Information Authority (ICJIA)

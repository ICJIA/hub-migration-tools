# ResearchHub CMS Migration (Strapi 3 → Strapi 5)

![ResearchHub CMS Migration](docs/og-image.png)

A complete, automated migration tool for converting a legacy Strapi 3 (MongoDB) content management system to a current Strapi 5 (SQLite) instance. Performs a full API-to-API transfer — extracting all content, media, and relations from Strapi 3, transforming and loading them into Strapi 5, then running automated validation and field-by-field parity checks. The end result is a fully migrated, verified Strapi 5 database running on SQLite.

**Project:** ResearchHub Content Migration
**Team:** ICJIA Development Team
**Date:** March 2026
**Version:** 4.0.0 ([Changelog](CHANGELOG.md))

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
| Articles | ~236 | `splash` + `thumbnail` (Base64 images), inline/reference-style images in `markdown`, `mainfile`/`extrafile` (upload plugin), 2 m2m relations |
| Datasets | ~26 | `datafile` (upload plugin), multiple JSON metadata fields, 2 m2m relations |
| Apps | ~13 | `image` (Base64), 2 dominant m2m relations to articles and datasets |

> **Note:** Only records with `published` or `archived` status are migrated. Draft and pending-approval records are excluded and can be migrated individually once published. See `allowedStatuses` in config.

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
| 4. Content Loading | `pnpm migrate:phase04` | Loads content, links relations, fixes timestamps (SSH), fixes image references |
| 5. Validation | `pnpm migrate:phase05` | 10 automated pass/fail checks comparing Strapi 3 and Strapi 5 |
| 6. Parity Audit | `pnpm migrate:phase06` | Field-by-field comparison of every record; detailed audit report |
| 7. Reports | `pnpm report` | Generates shareable HTML + DOCX migration parity reports |

**Estimated effort:** 8–12 working days (single developer, sequential phases).

### Phase pipeline

```mermaid
graph LR
    P1[Phase 1<br/>Schema] --> P2[Phase 2<br/>Extract]
    P2 --> P3[Phase 3<br/>Media]
    P3 --> P4[Phase 4<br/>Load]
    P4 --> P5[Phase 5<br/>Validate]
    P5 --> P6[Phase 6<br/>Parity Audit]
    P6 --> P7[Phase 7<br/>Reports]

    style P1 fill:#4a90d9,stroke:#2c5f8a,color:#fff
    style P2 fill:#4a90d9,stroke:#2c5f8a,color:#fff
    style P3 fill:#e8a838,stroke:#b07a1a,color:#fff
    style P4 fill:#e8a838,stroke:#b07a1a,color:#fff
    style P5 fill:#50b87a,stroke:#2d7a4d,color:#fff
    style P6 fill:#50b87a,stroke:#2d7a4d,color:#fff
    style P7 fill:#50b87a,stroke:#2d7a4d,color:#fff
```

### Deployment architecture

Local dev and production use the same scripts — only the Strapi 5 URL changes.

```mermaid
graph TB
    subgraph "Your Mac"
        M[Migration Scripts<br/>pnpm migrate:phase*]
    end

    subgraph "Local Dev"
        S5L[Strapi 5<br/>localhost:1338]
    end

    subgraph "Cloud (DigitalOcean)"
        S3[Strapi 3<br/>researchhub.icjia-api.cloud]
        S5P[Strapi 5<br/>v2.hub.icjia-api.cloud]
        NX[Nginx :443 → :1337]
        PM[PM2]
        PM --> S5P
        NX --> S5P
    end

    M -- "GraphQL (read)" --> S3
    M -- "REST (write)" --> S5L
    M -. "REST (write)<br/>production mode" .-> NX

    style M fill:#4a90d9,stroke:#2c5f8a,color:#fff
    style S3 fill:#e8a838,stroke:#b07a1a,color:#fff
    style S5L fill:#50b87a,stroke:#2d7a4d,color:#fff
    style S5P fill:#50b87a,stroke:#2d7a4d,color:#fff
    style NX fill:#21262d,stroke:#30363d,color:#8b949e
    style PM fill:#21262d,stroke:#30363d,color:#8b949e
```

> **Dev mode:** Mac → Strapi 3 (cloud) + Strapi 5 (localhost). **Production mode:** Mac → Strapi 3 (cloud) + Strapi 5 (cloud). Same scripts, same commands — just a different URL in `config.js`.

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

### Step 5–11: Run all phases

```bash
pnpm migrate:phase01    # Schema setup (reads S3 schemas, generates S5 types, verifies)
pnpm migrate:phase02    # Data extraction (pulls all content from S3 into local JSON)
pnpm migrate:phase03    # Media migration (Base64 extraction, upload, content rewrite)
pnpm migrate:phase04    # Content loading (load → link relations → fix timestamps → fix image refs)
pnpm migrate:phase05    # Validation (10 automated checks)
pnpm migrate:phase06    # Parity audit (field-by-field comparison, audit report)
pnpm report             # Generate HTML + DOCX parity audit reports
```

Each phase is **idempotent** — if any phase fails (timeout, network glitch), just re-run it. It detects previously completed work and picks up where it left off. No data will be duplicated.

To see the full runbook with a one-liner: `pnpm migrate:full`

### Step 11: Manual QA

Open `http://localhost:1338/admin` and verify: articles have images, relations show titles, files download, dates are historic.

### Done! (Locally)

Your local Strapi 5 is a verified copy of production Strapi 3 data. Browse the admin panel, check the content, verify relations.

### When ready for production

> **You run everything from your Mac.** The migration scripts on your Mac talk to both cloud servers over HTTPS. The DO server just needs Strapi 5 running — you don't run migration scripts on the server.

```
Your Mac                    Cloud
┌──────────────────┐        ┌──────────────────────────────────┐
│  Migration        │ ─GQL─▶│  Strapi 3 (researchhub.icjia-   │
│  Scripts          │        │  api.cloud) — read-only          │
│                   │        └──────────────────────────────────┘
│  pnpm migrate:*   │
│                   │        ┌──────────────────────────────────┐
│                   │ ─REST─▶│  Strapi 5 (v2.hub.icjia-        │
│                   │        │  api.cloud) — write via API      │
└──────────────────┘        └──────────────────────────────────┘
```

| Where | What runs | Why |
|---|---|---|
| **Your Mac** | All migration scripts (Phases 1–7) | Orchestrates the entire migration over HTTPS |
| **DO server** | Strapi 5 via PM2 | Just serves the API — receives content from your Mac |
| **DO server (SSH)** | Phase 4c timestamp fix (automated) | The script SSHs in automatically — no manual login needed |

**Setup the DO server** (one time):

1. Install Strapi 5, PM2, Nginx on the droplet — see **[DigitalOcean Deployment Guide](docs/DIGITALOCEAN-DEPLOY.md)**
2. Deploy configs are in [`deploy/`](deploy/):
   - [`nginx-strapi5.conf`](deploy/nginx-strapi5.conf) — Nginx reverse proxy (port 1337 → HTTPS, 200MB upload limit)
   - [`ecosystem.config.cjs`](deploy/ecosystem.config.cjs) — PM2 process manager config
   - [`restart.sh`](deploy/restart.sh) — pulls latest, optional rebuild, restarts PM2, health check

> **Nginx gotcha:** Laravel Forge's default Nginx config includes a dotfile deny rule (`location ~ /\.`) that blocks Strapi 5's admin panel (served from `/.strapi/`). Remove it — Strapi handles its own security. See the [troubleshooting section](docs/DIGITALOCEAN-DEPLOY.md#troubleshooting-nginx--strapi-5) in the DO deployment guide.

**Run the production migration** (from your Mac):

```bash
# Point at production
cp config.prod.js config.js
export STRAPI5_TOKEN="<your-production-token>"

# Full reset (wipes remote DB + media, redeploys schemas)
pnpm migrate:reset      # type "RESET" to confirm

# Create admin account + API token at https://v2.hub.icjia-api.cloud/admin
export STRAPI5_TOKEN="<new-token>"

# Run all phases — see runbook for one-liner
pnpm migrate:full

# Or run individually:
pnpm migrate:phase02    # extract from remote S3
pnpm migrate:phase03    # upload media TO remote S5
pnpm migrate:phase04    # load content, timestamps (SSH), image refs — all automated
pnpm migrate:phase05    # validate both remote servers
pnpm migrate:phase06    # parity audit across both remote servers
pnpm report             # generate HTML + DOCX parity audit reports
```

All steps run from your Mac over HTTPS. The timestamp fix (Phase 4, Step 3) automatically SSHs into the server, stops Strapi 5, updates the database, and restarts — no manual SSH required.

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
  ✓ articles: 246 = 246 | ✓ datasets: 35 = 35 | ✓ apps: 14 = 14p

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

### Phase 4: Data Loading & Post-Processing

Loads content in dependency order (datasets → apps → articles), links the relation triangle, restores original timestamps via SSH, converts reference-style markdown images to inline URLs, and verifies everything.

All 5 steps run automatically from your Mac — including the SSH-based timestamp fix.

```bash
pnpm migrate:phase04

# Or individually:
node migration/scripts/04-load.js                     # Step 1: load content
node migration/scripts/04b-link-relations.js           # Step 2: link relation triangle
node migration/scripts/04c-fix-timestamps-remote.js    # Step 3: restore timestamps (SSH, auto stop/restart)
node migration/scripts/04d-fix-image-refs.js           # Step 4: convert reference-style images to inline URLs
node migration/scripts/04-verify.js                    # Step 5: verify everything
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

### Phase 7: Parity Audit Reports

Generates shareable HTML and DOCX parity audit reports from the Phase 5 and Phase 6 data. Designed for non-technical stakeholders — includes plain-language explanations of why the audit matters, NoSQL-to-SQL migration risks, and a glossary.

```bash
pnpm report
```

**Outputs:**
- `migration/data/migration-report.html` — self-contained HTML, viewable in any browser
- `migration/data/migration-report.docx` — Word document for emailing to managers

---

## Configuration

All scripts read from `config.js` at the project root (gitignored — may contain tokens).

| Profile | Strapi 3 | Strapi 5 | Use case |
|---|---|---|---|
| `config.dev.js` | `researchhub.icjia-api.cloud` (remote) | `localhost:1338` (local) | Development testing |
| `config.prod.js` | `researchhub.icjia-api.cloud` (remote) | `v2.hub.icjia-api.cloud` (remote) | Production migration |

```bash
cp config.dev.js config.js          # local testing
cp config.prod.js config.js         # production
pnpm set-strapi5                    # interactive: prompts for URL + token
```

Every script prints its configuration at startup. See [`config.example.js`](config.example.js) for all settings.

---

## Resetting & Starting Over

```bash
# Wipe local migration data only (keep Strapi 5 database)
pnpm migrate:clean

# Full reset — local data + remote Strapi 5 database + media (production)
pnpm migrate:reset      # type "RESET" to confirm
# → Cleans local data, wipes remote DB + uploads, redeploys schemas, rebuilds, restarts
# → Then create admin account + API token and run: pnpm migrate:full

# Show the full runbook with copy-paste commands
pnpm migrate:full
```

**Every phase is idempotent.** If a phase fails (timeout, network glitch), just re-run it — no need to reset. Only use `migrate:reset` to start completely from scratch.

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
| **[Strapi 5 Setup Guide](docs/STRAPI5-SETUP.md)** | Local installation, GraphQL plugin, port config |
| **[DigitalOcean Deployment](docs/DIGITALOCEAN-DEPLOY.md)** | Production deploy: PM2, Nginx, SSL, remote timestamp fix |
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

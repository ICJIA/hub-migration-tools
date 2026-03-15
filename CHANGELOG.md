# Changelog

All notable changes to this project will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH where:
- **MAJOR** — breaking changes to migration scripts or data formats
- **MINOR** — new features, new documentation, schema corrections
- **PATCH** — bug fixes, typo corrections, minor doc clarifications

---

## [0.9.0] - 2026-03-15

### Added
- MIT LICENSE file
- README: Platform Support table (macOS, Linux/Ubuntu, Windows via WSL2)

## [0.8.3] - 2026-03-15

### Added
- README: Risks and Mitigations table with impact levels, mitigation strategies, and phase cross-references

## [3.0.0] - 2026-03-15

### Added
- `pnpm reset` — one command to delete Strapi 5 DB, clean migration data, then chain
  into `set-strapi5` → `phase01` automatically
- `pnpm set-strapi5` now launches Phase 1 after saving config (prompt, default Y)
- `migration/scripts/reset-strapi5.js` — full reset with guided flow
- Schema: `slug` fields now `uid` type with `targetField: "title"` (auto-generated, unique)
- Schema: `markdown` field now `richtext` (large rich text editor in Strapi 5 admin)
- Load script handles slug collisions: appends legacyId suffix for duplicate slugs
- Audit script: slug suffixes flagged as EXPECTED, unrestored timestamps as INFO

### Changed
- All config profiles default Strapi 5 to `http://localhost:1338`
  (use `pnpm set-strapi5` to change for production)
- `set-strapi5` prompt defaults to `localhost:1338` (not previous URL)
- Phase 5 success message now reminds to run Phase 6

### Fixed
- `legacyId`: removed `writable: false` that blocked API writes during migration
- Slug collision: "Victim Needs Assessment" duplicate now loads with suffixed slug

## [2.9.0] - 2026-03-15

### Changed
- README consolidated from 1,123 lines to 567 — removed redundant phase descriptions
  (phases now described once with CLI output examples, not three times)
- Migration Checklist moved to collapsible `<details>` block
- Configuration, resetting, platform support consolidated into Quick Start
- CLI output examples use `console` code fence for better GitHub rendering

## [2.8.0] - 2026-03-15

### Added
- README: table of contents with links to all major sections
- OG image (1200x630, dark mode) with project stats, phase indicators, and tech badges
  - SVG source: `docs/og-image.svg`
  - PNG render: `docs/og-image.png`
- Image displayed at top of README
- All scripts now show `pnpm migrate:phaseXX` as primary command with individual node commands as alternatives

## [2.7.0] - 2026-03-15

### Added
- README: detailed "Migration Checklist" section with per-phase, per-step checkbox items
  covering every operation from schema introspection through post-migration QA
- README Quick Start: Step 0 with pnpm/Node.js installation instructions

## [2.6.0] - 2026-03-15

### Added
- README: comprehensive "Quick Start: Complete Migration Walkthrough" — 11 detailed steps
  from clone to verified migration, written for a new developer testing locally before
  deploying to production

## [2.5.0] - 2026-03-15

### Added
- `migration/scripts/07-sync.js` — incremental sync script that catches up new Strapi 3
  content without re-running the full migration. Automatically loads new records; flags
  updated and deleted records for review.
- `pnpm sync` shortcut
- `migration/scripts/set-strapi5-url.js` — interactive script to update Strapi 5 URL
  and token in config.js. Prompts for URL, derives GraphQL URL, updates config, tests connectivity.
- `pnpm set-strapi5` shortcut
- README: "Incremental Sync" section explaining usage

## [2.4.0] - 2026-03-15

### Added
- README: "Starting Over Completely" section with step-by-step reset instructions
- Strapi 5 setup guide: "Resetting Strapi 5 for a Fresh Migration" section (local + production)
- Phase 4c now auto-sets "Entry title" to `title` for all content types (no manual admin config needed)
- Schema generator puts `title` before `legacyId` so Strapi 5 auto-selects it as relation display label
- `legacyId` field marked `configurable: false` (non-editable in Strapi 5 admin Content-Type Builder)

## [2.3.0] - 2026-03-15

### Fixed
- Phase 1c verification: handle all expected Strapi 3→5 GraphQL type differences
  (_connection fields, _id removal, DateTime→Date, nullable wrappers, 403 as passing)
- Phase 4 verification: use indexed populate params for Strapi 5 REST API
- Phase 5 validation: fix ID map lookups (object key, not array.find); fix documentId property name
- Phase 6 audit: use indexed populate params; handle date format (DateTime→Date) and null→false
  boolean defaults as EXPECTED differences
- Strapi 5 boilerplate: use CommonJS require() instead of ESM import (Strapi 5 defaults to CJS)
- Default Strapi 5 DB path corrected to `strapi5-researchhub`
- Native module compilation: npm install for better-sqlite3 in migration project

### Changed
- Production Strapi 5 URL updated to `researchhubv2.icjia-api.cloud`

### Results
- Local migration completed successfully against production Strapi 3
  (researchhub.icjia-api.cloud) and local Strapi 5 (localhost:1338):
  - 295 records (246 articles, 35 datasets, 14 apps)
  - 1,331 media files (239 splash, 239 thumbnail, 613 inline, 14 app images, 241 upload-plugin files)
  - Phase 5: 10/10 validation checks passed
  - Phase 6: 0 ERRORs, 1,315 EXPECTED, 6 INFO, 5,571 OK across 6,877 fields

## [2.2.0] - 2026-03-15

### Added
- Environment profiles for dev vs production migration:
  - `config.dev.js` — remote Strapi 3 + local Strapi 5 (localhost:1338)
  - `config.prod.js` — remote Strapi 3 + remote Strapi 5 (researchhub2.icjia-api.cloud)
  - `MIGRATION_ENV` environment variable support (e.g., `MIGRATION_ENV=prod`)
- `migration/lib/load-config.js` — shared config loader with profile resolution
- All 17 scripts now use the shared `loadConfig()` for consistent config handling

### Changed
- README Configuration section rewritten with profile table and MIGRATION_ENV usage
- Production config uses longer timeouts (60s) and slower request delays (200ms)

## [2.1.0] - 2026-03-15

### Added
- **Phase 6 implementation: parity audit**
  - `docs/researchhub-migration-doc06.md` — design doc for field-by-field parity audit
  - `migration/scripts/06-audit.js` — compares every record in Strapi 3 vs Strapi 5, categorizes differences as ERROR/EXPECTED/INFO
  - `migration/scripts/06-run-phase.js` — interactive orchestrator
  - Produces JSON + Markdown audit reports for stakeholder sign-off
- **Strapi 5 Setup Guide** (`docs/STRAPI5-SETUP.md`)
  - Fresh Strapi 5 installation steps
  - PM2 ecosystem configuration
  - Nginx reverse proxy with SSL
  - Laravel Forge deployment instructions
  - API token creation and permissions setup
- `pnpm migrate:phase06` and `pnpm audit` shortcuts
- Project Phases table updated to 6 phases (8–12 working days)

## [2.0.0] - 2026-03-15

### Added
- **Phase 3 implementation: Base64 extraction & media migration**
  - `migration/lib/base64-scanner.js` — detects Base64 in string fields and markdown
  - `migration/lib/base64-decoder.js` — decodes Base64 to binary with magic byte validation
  - `migration/lib/markdown-rewriter.js` — replaces Base64 refs with upload URLs
  - `migration/scripts/03a-scan-base64.js` — scans articles + apps, produces manifest
  - `migration/scripts/03b-decode-base64.js` — decodes Base64 to image files
  - `migration/scripts/03c-upload-media.js` — uploads to Strapi 5 media library
  - `migration/scripts/03d-rewrite-content.js` — rewrites articles with media IDs/URLs
  - `migration/scripts/03e-transform.js` — transforms datasets + apps, migrates upload-plugin files
  - `migration/scripts/03-verify.js` — verifies zero remnants, media accessible
  - `migration/scripts/03-run-phase.js` — interactive orchestrator
- **Phase 4 implementation: data loading & timestamp restoration**
  - `migration/lib/rest-client.js` — REST client with auth, timeout, upload support
  - `migration/scripts/04-load.js` — loads content: datasets → apps → articles
  - `migration/scripts/04b-link-relations.js` — links relation triangle from dominant sides
  - `migration/scripts/04c-fix-timestamps.js` — restores timestamps via SQLite
  - `migration/scripts/04-verify.js` — post-load verification
  - `migration/scripts/04-run-phase.js` — interactive orchestrator
- **Phase 5 implementation: validation & reconciliation**
  - `migration/scripts/05-validate.js` — 10 automated checks (counts, legacy IDs, Base64, media, relations, timestamps, content integrity, duplicates)
  - `migration/scripts/05-run-phase.js` — orchestrator with manual QA sign-off checklist
- `better-sqlite3` dependency for timestamp restoration and validation
- `pnpm migrate:phase03`, `pnpm migrate:phase04`, `pnpm migrate:phase05` shortcuts
- `pnpm validate` shortcut for standalone validation

### Changed
- All generated migration data now gitignored (`migration/data/`, `migration/output/`, `migration/config/field-map.json`)

### Fixed
- GraphQL client warns when sending token over plaintext HTTP to non-localhost
- Extraction has MAX_RECORDS (10000) safety valve against infinite pagination
- Extraction now uses `requestDelayMs` between pagination requests

## [1.0.0] - 2026-03-15

### Added
- Phase 2 implementation: data extraction from Strapi 3
  - `migration/scripts/02-extract.js` — paginated GraphQL extraction for all 3 content types
  - `migration/scripts/02-verify.js` — standalone verification of extracted data integrity
  - `migration/scripts/02-run-phase.js` — Phase 2 orchestrator with interactive prompts
  - `migration/lib/graphql-client.js` — reusable GraphQL client with auth, timeout, error handling
- `pnpm migrate:phase02` and `pnpm extract` shortcuts

### Changed
- All generated migration data (`migration/data/`, `migration/output/`, `migration/config/field-map.json`)
  is now gitignored — stays on the developer's local machine only
- README Phase 2 section updated with implemented commands and usage

## [0.8.2] - 2026-03-15

### Added
- README: Mermaid diagram for the relation graph (renders natively on GitHub with colors and dominance arrows)

## [0.8.1] - 2026-03-15

### Fixed
- README: .docx executive summary now uses a raw GitHub download link instead of an internal link that GitHub can't render
- README: replaced generic "not yet implemented" with detailed Phase 2–5 descriptions (scripts, commands, outputs)

## [0.8.0] - 2026-03-15

### Added
- `migration/scripts/01-run-phase.js` — Phase 1 orchestrator that runs all steps
  in sequence with interactive prompts, graceful failure recovery, and clear
  instructions for resuming from any failed step
- `pnpm migrate:phase01` shortcut in package.json

## [0.7.0] - 2026-03-15

### Added
- `migration/scripts/00-clean.js` — reset script to wipe all generated data for fresh runs
- `pnpm clean` shortcut in package.json

### Changed
- Reorganized project: all tooling moved under `migration/` directory
  - `scripts/` → `migration/scripts/`
  - `lib/` → `migration/lib/`
  - `config/` → `migration/config/`
  - `data/` → `migration/data/`
  - `output/` → `migration/output/`
- Updated all import paths, config paths, JSDoc examples, and README instructions
- Scripts README updated with directory structure diagram and pnpm shortcuts

## [0.6.0] - 2026-03-15

### Added
- Comprehensive JSDoc comments on all exported functions and modules
- `scripts/README.md` — developer-facing documentation for all scripts
- Getting Started section in main README with Phase 1 step-by-step instructions
- Red ANSI error messages in all scripts for connection failures and missing files
- Config display at startup in all scripts so users can verify target URLs
- `config.example.js` expanded as single source of truth: all paths, timeouts, pagination limits, polling settings with JSDoc

### Changed
- Strapi 3 default URL changed to `https://researchhub.icjia-api.cloud` (production)
- Package manager switched to pnpm (`packageManager` field in package.json, pnpm-lock.yaml)
- Strapi 3 introspection data updated from live production instance

## [0.5.0] - 2026-03-15

### Added
- Phase 1 implementation: all scripts and libraries
  - `scripts/01a-introspect.js` — reads Strapi 3 schemas (local files + optional GraphQL)
  - `scripts/01b-generate-schemas.js` — generates Strapi 5 schema.json + boilerplate
  - `scripts/01c-verify-schemas.js` — introspects Strapi 5, diffs against Strapi 3, verifies REST API
  - `lib/schema-generator.js` — core logic: field type mapping, relation conversion, upload plugin handling
- `package.json` with `type: "module"` and pnpm script shortcuts
- `config.example.js` — config template using environment variables for tokens
- `config/field-type-map.json` — field type mapping rules with 3 Base64-to-media overrides
- `.gitignore` now excludes `config.js` (contains API tokens)

## [0.4.0] - 2026-03-15

### Fixed
- Executive summary: apps complexity changed from "Low" to "Medium"
- Doc 00: content type count changed from "< 10" to "3"; "10 content types" reference fixed
- Doc 00: dataset.apps `via` value corrected from "via apps" to "via datasets" (matching actual schema)
- Doc 00: Phase 3 substep count changed from "four" to "six"
- Doc 00: `documentId` description changed from "UUID" to "auto-generated alphanumeric string"
- Doc 00: SQL example now notes table names need verification via `sqlite_master`
- Doc 02: GraphQL client now includes optional Authorization header
- Doc 03: image count math fixed (230+225+182+15=652, not 412)
- Doc 03: app scan count fixed from 30 to 15
- Doc 03: `require()` calls replaced with ES module `import` statements
- Doc 03: step 3e now reads from `data/transformed/articles.json` (not raw), preventing overwrite of step 3d output
- Doc 03: removed `documentId` from media upload response (media files don't have documentId)
- Doc 03: removed `_relatedAppIds` from article transform (articles are non-dominant on article-app)
- Doc 03: LLM prompt regex typo fixed (`!/\[` → `/!\[`)
- Doc 04: removed `_relatedAppIds` reference from article load instructions
- Doc 04: SQL column/table name verification guidance added
- Doc 05: check name in report template fixed (`splash_image_migration` → `image_media_migration`)
- Doc 05: transformed data field descriptions corrected per content type
- Doc 05: Check 3 scope expanded to scan all content types, not just articles

### Added
- Doc 00: Section 5.11 — Draft/Publish State guidance for `draftAndPublish: false`
- Doc 00: Security note about `config.js` containing tokens; recommends env vars
- Doc 04: Draft/publish verification note at start of loading steps
- Doc 04: Rate limiting guidance (100ms delay) in LLM build prompt
- Doc 05: SQL column name verification notes (snake_case `legacy_id`, plural table names)
- `.gitignore`: added `config.js` to prevent committing API tokens
- Executive summary .docx regenerated with corrected app complexity
- Dataset/app record counts updated from "TBD" to ~42/~15 in doc 00

## [0.3.0] - 2026-03-15

### Changed
- Updated all six phase docs (00–05) to match actual Strapi 3 schemas obtained from production
- Body field corrected from `body` (richtext) to `markdown` (text) throughout all docs
- Relation graph corrected from star (article hub) to triangle (article↔dataset, article↔app, app↔dataset)
- App complexity upgraded from LOW to MEDIUM — has `image` (Base64), `description`, 2 dominant m2m relations
- Load order corrected: datasets → apps → articles (was apps → datasets → articles)
- Timestamps corrected to camelCase (`createdAt`/`updatedAt`)
- Field type mapping updated: no richtext fields, no uid fields, no required/unique constraints
- Relation dominance corrected: app is dominant for article↔app (not article)

### Added
- Actual Strapi 3 schemas added to `schemas/` directory (article, dataset, app)
- 13+ previously undocumented fields per content type (status, date, external, authors/contributors, funding, citation, doi, etc.)
- Article `thumbnail` field (string, Base64) — same extraction pipeline as `splash`
- Article `mainfile` and `extrafile` fields (upload plugin) — need download+reupload
- App `image` field (string, Base64) — needs extraction pipeline
- App↔dataset m2m relation (previously undocumented)
- Dataset fields: sources, unit, timeperiod, notes, variables, project

## [0.2.0] - 2026-03-15

### Added
- Executive summary converted to .docx for stakeholder distribution
- README updated to link both Markdown and Word versions of exec summary
- Per-phase validation/parity checklists added to docs 01–05
- Validation strategy overview added to doc 00 (master design)
- Gate verification scripts added to project structure (02-verify, 03-verify, 04-verify)

## [0.1.0] - 2026-03-15

### Added
- Initial project setup with README, .gitignore, .nvmrc (Node 22)
- Executive summary for project stakeholders
- Master design document (doc 00) with full technical architecture
- Phase 1 doc: Introspection & Schema Generation
- Phase 2 doc: Data Extraction
- Phase 3 doc: Base64 Extraction & Media Migration
- Phase 4 doc: Data Loading & Timestamp Restoration
- Phase 5 doc: Validation & Reconciliation

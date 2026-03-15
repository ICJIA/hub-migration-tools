# Changelog

All notable changes to this project will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH where:
- **MAJOR** — breaking changes to migration scripts or data formats
- **MINOR** — new features, new documentation, schema corrections
- **PATCH** — bug fixes, typo corrections, minor doc clarifications

---

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

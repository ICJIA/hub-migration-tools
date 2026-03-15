# Changelog

All notable changes to this project will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH where:
- **MAJOR** — breaking changes to migration scripts or data formats
- **MINOR** — new features, new documentation, schema corrections
- **PATCH** — bug fixes, typo corrections, minor doc clarifications

---

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

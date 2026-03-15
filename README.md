# ResearchHub CMS Migration (Strapi 3 → Strapi 5)

**Project:** ResearchHub Content Migration
**Team:** ICJIA Development Team
**Date:** March 2026
**Version:** 0.3.0 ([Changelog](CHANGELOG.md))

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

- **Executive Summary** — High-level overview for project stakeholders and management: [Markdown](docs/researchhub-migration-executive-summary.md) | [Word (.docx)](docs/researchhub-migration-executive-summary.docx)
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

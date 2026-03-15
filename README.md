# ResearchHub CMS Migration (Strapi 3 → Strapi 5)

**Project:** ResearchHub Content Migration
**Team:** ICJIA Development Team
**Date:** March 2026

---

## Overview

ResearchHub is ICJIA's platform for publishing research articles, datasets, and data dashboards. This project migrates ResearchHub's content management system from Strapi 3 (MongoDB) to Strapi 5 (SQLite).

Strapi 3 reached end of life in 2022 and no longer receives security patches or compatibility updates. Strapi 5 runs on SQLite, reducing infrastructure complexity and hosting costs while restoring active security and feature support.

## Migration Approach

We use an **API-to-API transfer** rather than direct database conversion:

1. **Read** all content from Strapi 3 via its GraphQL API
2. **Transform** content to match Strapi 5's format, including extracting ~500–1,500 Base64-encoded images from article text into proper media library files
3. **Write** transformed content into Strapi 5 via its REST API
4. **Verify** completeness and correctness with automated checks

## Content Scope

| Content Type | Count | Complexity |
|---|---|---|
| Articles | ~250 | High — embedded images must be extracted and stored as media assets |
| Datasets | ~42 | Medium — Excel files transferred between media libraries |
| Apps (Dashboards) | ~15 | Low — text and URL transfer |

## Project Phases

| Phase | Description | Est. Effort |
|---|---|---|
| 1. Schema Setup | Introspect Strapi 3 schema, generate Strapi 5 content types | 1–2 days |
| 2. Data Extraction | Pull all content from Strapi 3 into local JSON files | 1 day |
| 3. Image & Media Migration | Extract Base64 images, upload to media library, rewrite references | 2–3 days |
| 4. Content Loading | Load transformed content into Strapi 5, restore timestamps | 1–2 days |
| 5. Validation | Automated verification of migration completeness and correctness | 1–2 days |

**Total estimated effort:** 7–11 working days (single developer, sequential phases).

## Documentation

Detailed documentation for every aspect of this migration is available in the [`docs/`](docs/) directory:

- **Executive Summary** — High-level overview for project stakeholders and management: [Markdown](docs/researchhub-migration-executive-summary.md) | [Word (.docx)](docs/researchhub-migration-executive-summary.docx)
- **[Doc 00 — Master Design](docs/researchhub-migration-doc00.md)** — Full technical architecture: API-to-API approach, data model mapping, Base64 extraction strategy, and end-to-end migration pipeline
- **[Doc 01 — Phase 1: Introspection & Schema Generation](docs/researchhub-migration-doc01.md)** — Strapi 3 schema discovery and Strapi 5 content type generation
- **[Doc 02 — Phase 2: Data Extraction](docs/researchhub-migration-doc02.md)** — GraphQL-based content extraction to local JSON files
- **[Doc 03 — Phase 3: Base64 Extraction & Media Migration](docs/researchhub-migration-doc03.md)** — Image decoding, media library upload, and article content rewriting
- **[Doc 04 — Phase 4: Data Loading & Timestamp Restoration](docs/researchhub-migration-doc04.md)** — Content loading via REST API, relation linking, and timestamp correction
- **[Doc 05 — Phase 5: Validation & Reconciliation](docs/researchhub-migration-doc05.md)** — Automated verification checks and migration integrity report

## Success Criteria

1. All records transferred (matching counts between source and target)
2. All images extracted from Base64 and stored as proper media library files
3. All data files (Excel) accessible in Strapi 5
4. All relationships between content types preserved
5. All original creation/modification dates preserved
6. No duplicate records
7. ResearchHub website functions correctly with the new backend

## License

Copyright (c) 2026 Illinois Criminal Justice Information Authority (ICJIA)

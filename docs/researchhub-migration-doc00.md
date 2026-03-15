# Doc 00 — Master Design: ResearchHub Strapi 3 → Strapi 5 Migration

**Project:** ResearchHub API-to-API Migration  
**Stack:** Strapi 3 (MongoDB) → Strapi 5 (SQLite)  
**Transfer Method:** GraphQL-to-API  
**Date:** March 2026  
**Status:** Draft

---

## 1. Overview

Migrate the ResearchHub content database from Strapi 3 (MongoDB) to Strapi 5 (SQLite) using an API-to-API transfer approach. The source instance exposes data via GraphQL; the target instance receives data via REST and/or GraphQL mutations.

### Why API-to-API (Not Direct DB Migration)

- MongoDB → SQLite has no direct migration path.
- Strapi 3 and Strapi 5 have fundamentally different data models (integer/ObjectId IDs → UUID `documentId`, different relation storage, different component handling).
- API-to-API lets each version's ORM handle its own schema, avoiding manual SQL/Mongo surgery.
- Intermediate JSON files provide a checkpoint/debugging layer between extract and load.

### Scope

- **In scope:** All ResearchHub content types (< 10), ~250 articles with embedded Base64 images requiring extraction and media library migration, media files (images, PDFs), relations between content types, field mapping and transformation.
- **Out of scope:** i18n/localization (not used), dynamic zones (not used), draft/publish state preservation (all content treated as published), user accounts and permissions (recreated manually in Strapi 5), Strapi admin customizations or plugins.

### The Central Challenge: Base64 Image Extraction

The `article` content type is the most complex migration target. Articles contain Base64-encoded images in two locations:

1. **Splash image field** — A dedicated field (e.g., `splashImage`) stores a single Base64 string representing the hero image. This is not a media library reference; it's raw Base64 text in a Text/LongText field.
2. **Inline images in markdown body** — The article body is a markdown rich text field. Images are embedded using standard markdown syntax with Base64 data URIs: `![alt text](data:image/png;base64,iVBOR...)`.

**Migration goal:** Extract every Base64 image, upload it to the Strapi 5 media library as an actual file, and replace the Base64 data with a URL pointing to the newly uploaded media asset. After migration, zero Base64 strings should remain in any content field.

With ~250 articles, each potentially containing a splash image plus multiple inline images, the extraction pipeline must be fully automated and idempotent (safe to re-run).

---

## 2. Architecture

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│   Strapi 3 (Mongo)  │         │  Migration Node   │         │  Strapi 5 (SQLite)  │
│   :1337/graphql     │ ──GQL──▶│  Scripts (local)  │──REST──▶│   :1338/api         │
│   (read-only)       │         │                    │         │   :1338/graphql     │
└─────────────────────┘         │  data/raw/         │         └─────────────────────┘
                                │  data/transformed/ │
                                │  data/maps/        │
                                └──────────────────┘
```

### Both Instances Run Simultaneously

| Instance | Port | Database | Role | API Token |
|----------|------|----------|------|-----------|
| Strapi 3 | 1337 | MongoDB | Source (read-only) | Read-only |
| Strapi 5 | 1338 | SQLite | Target | Full-access |

---

## 3. Content Type Inventory

| # | Strapi 3 Content Type | Strapi 5 Equivalent | Key Fields | Relations | Media Fields | Est. Records |
|---|----------------------|---------------------|-----------|-----------|-------------|-------------|
| 1 | `article` | `article` | title, slug, body (markdown), abstract, category, tags, dates | `datasets` (m2m → dataset), `apps` (m2m → app) | `splash` (Base64 in text field), inline Base64 in body | ~250 |
| 2 | `dataset` | `dataset` | title, slug, description, category, tags, dates | Referenced by articles (m2m) | `datafile` (Excel file, actual media library reference) | TBD |
| 3 | `app` | `app` | title, summary, URL (Tableau or ShinyProxy) | Referenced by articles (m2m) | None | TBD |

### Relation Graph

```
article ──m2m──▶ dataset
article ──m2m──▶ app
```

Both relations are many-to-many. Articles point outward; datasets and apps do not point back (one-directional m2m). No circular dependencies. No components or dynamic zones on any content type.

### Load Order (Phase 4)

1. **Apps** — zero dependencies, zero media
2. **Datasets** — zero content-type dependencies, but media files (`datafile`) must be uploaded first
3. **Articles** — depends on apps + datasets (for relation linking) and media (splash + inline images)

### Content Type Complexity

**Articles (high complexity):** The bulk of the migration work. Two Base64 extraction targets (`splash` field + inline markdown images), markdown body field, two m2m relations. ~250 records × potentially multiple images each.

**Datasets (medium complexity):** The `datafile` field points to Excel files already stored in the Strapi 3 media library (not Base64). These are proper media references, so the migration needs to download the files from Strapi 3's upload directory and re-upload to Strapi 5. Simpler than the Base64 extraction pipeline but still requires media ID translation.

**Apps (low complexity):** Essentially flat data — title, summary, and an external URL pointing to Tableau Public or a ShinyProxy instance. No media, no rich text, no Base64. Straightforward field-for-field copy with minimal transformation.

### Known Data Issues

- **Base64 splash images:** The `article` content type has a `splash` field that stores a hero image as a raw Base64 string — not a media library reference. Each article's splash image must be decoded, saved as a file, uploaded to Strapi 5's media library, and the field replaced with a media relation.
- **Base64 inline images in markdown:** Article body fields contain markdown with embedded Base64 images in standard syntax: `![alt](data:image/png;base64,...)`. Each must be extracted, uploaded, and the markdown rewritten to reference the new media URL: `![alt](https://strapi5-host/uploads/filename.png)`.
- **Scale:** ~250 articles, each potentially containing 1 splash image + N inline images. Estimated total image count: 500–1,500+ (to be confirmed during Phase 2 extraction).
- **MongoDB ObjectIds:** All Strapi 3 IDs are MongoDB ObjectId strings (e.g., `507f1f77bcf86cd799439011`), not integers. The ID translation table maps these to Strapi 5 UUID `documentId` values.

---

## 4. Phase Structure

The migration is split into five phases, each with its own design document. Phases are sequential — each depends on the prior phase's output.

| Phase | Doc | Title | Description | Input | Output |
|-------|-----|-------|-------------|-------|--------|
| 1 | Doc 01 | Introspection & Schema Generation | Introspect Strapi 3 via GraphQL, generate Strapi 5 `schema.json` files programmatically, produce field mapping | Running Strapi 3 | Strapi 5 `src/api/` schema files + `config/field-map.json` |
| 2 | Doc 02 | Data Extraction | Pull all content from Strapi 3 via GraphQL, store as local JSON | Running Strapi 3, field map | `data/raw/*.json` |
| 3 | Doc 03 | Base64 Extraction & Media Migration | Decode all Base64 images (splash + inline), upload to Strapi 5 media library, rewrite markdown with media URLs | `data/raw/`, field map | `data/media/`, `data/maps/media.json`, `data/transformed/` |
| 4 | Doc 04 | Data Loading & Timestamp Restoration | Insert transformed content into Strapi 5 via API in dependency order, link relations, then correct `createdAt`/`updatedAt` via direct SQLite update | `data/transformed/`, `data/maps/` | Populated Strapi 5 with original timestamps |
| 5 | Doc 05 | Validation & Reconciliation | Count checks, spot checks, media verification, relation integrity, zero Base64 remaining | Both instances running | Validation report |

### Dependency Graph

```
Phase 1 (Schema) → Phase 2 (Extract) → Phase 3 (Base64 + Media) → Phase 4 (Load) → Phase 5 (Validate)
```

### Validation Strategy: Gate Checks at Every Phase

Each phase has a **gate** — a set of automated and manual checks that must pass before proceeding to the next phase. This prevents cascading errors that are expensive to diagnose later. The principle is: **never advance with dirty data.**

| Phase | Gate Script | What It Validates | Blocks |
|-------|-------------|-------------------|--------|
| 1 | `scripts/01c-verify-schemas.js` | All content types exist in Strapi 5, all fields present with correct types, relations properly defined, `legacyId` field present, splash is media type | Phase 2 |
| 2 | Built into `scripts/02-extract.js` (post-extraction checks) | Record counts match Strapi 3 REST count endpoints, all records have IDs, timestamps present, JSON files parseable | Phase 3 |
| 3 | `scripts/03-verify.js` (dedicated Phase 3 validation) | Zero Base64 remnants in transformed articles, all manifest images decoded and uploaded, all splash fields are media IDs, all dataset files uploaded, media accessible in Strapi 5 | Phase 4 |
| 4 | `scripts/04-verify.js` (dedicated Phase 4 validation) | Record counts match in Strapi 5, all relations linked correctly, timestamps restored to original values, no duplicate records, splash/datafile media accessible | Phase 5 |
| 5 | `scripts/05-validate.js` | End-to-end reconciliation across Strapi 3 and Strapi 5 — the final comprehensive check | Deployment |

**Rule:** If any gate check fails, stop. Diagnose and fix before proceeding. Re-running a later phase on bad upstream data wastes time and creates confusing error trails.

### Phase 1 Detail: Programmatic Schema Generation

Strapi 5 defines content types as `schema.json` files stored in `./src/api/[api-name]/content-types/[content-type-name]/`. When Strapi 5 starts in development mode, it reads these files and auto-creates the corresponding database tables. This means content types can be generated entirely by writing JSON files — no admin UI interaction required.

Phase 1 automates this with three substeps:

**Step 1a — Introspect Strapi 3.** Run a GraphQL introspection query against the Strapi 3 instance to discover all content types, their fields, field types, and relations. Also inspect the Strapi 3 model JSON files (e.g., `api/article/models/article.settings.json`) to capture details that GraphQL introspection may not fully expose, such as field-level constraints (`required`, `unique`, `default`), relation specifics (`via`, `model`, `collection`), and the distinction between `richtext` vs. `text` vs. `string` field types.

**Step 1b — Map & Transform Field Types.** Apply a Strapi 3 → Strapi 5 field type mapping table to convert each field definition. Key mappings:

| Strapi 3 Field | Strapi 5 Equivalent | Notes |
|----------------|---------------------|-------|
| `string` | `string` | Direct |
| `text` | `text` | Direct |
| `richtext` | `richtext` | Use richtext (markdown), NOT the blocks editor |
| `integer` / `biginteger` / `float` / `decimal` | Same types | Direct |
| `boolean` | `boolean` | Direct |
| `date` / `datetime` / `time` | Same types | Direct |
| `enumeration` | `enumeration` | Values array syntax may differ |
| `json` | `json` | Direct |
| `uid` | `uid` | Add `targetField` if present |
| `media` (single/multiple) | `media` | Specify `allowedTypes`, `multiple` |
| Text field storing Base64 (e.g., `splashImage`) | `media` | **Type change** — see Section 5.3 |
| Relation via `model`/`collection` + `via` | `relation` with `type`, `target`, `mappedBy`/`inversedBy` | Strapi 5 relation syntax is completely different |

**Step 1c — Generate `schema.json` Files.** For each content type, produce a Strapi 5-compatible `schema.json` and write it to the correct location in the Strapi 5 project directory:

```
strapi5-project/src/api/
├── article/
│   └── content-types/
│       └── article/
│           └── schema.json
├── dataset/
│   └── content-types/
│       └── dataset/
│           └── schema.json
├── app/
│   └── content-types/
│       └── app/
│           └── schema.json
└── ...
```

After generating all schema files, also generate the corresponding route, controller, and service files (minimal boilerplate — Strapi 5 requires these to exist for each API even though they can be mostly empty). Then start Strapi 5 in dev mode (`npm run develop`) — it reads the schemas and creates the SQLite tables automatically.

**Step 1d — Verify.** Run the GraphQL introspection query against the now-running Strapi 5 instance. Diff the Strapi 3 and Strapi 5 introspection results to confirm all content types and fields are present and correctly typed. Output the diff as `data/schema-diff.json` for review. Also output the final field map as `config/field-map.json`.

**Manual review checkpoint:** Before proceeding to Phase 2, visually inspect the Strapi 5 admin panel to confirm content types appear correctly. This is the one human-in-the-loop step — everything else is automated, but a quick sanity check here prevents cascading issues downstream.

### Phase 3 Detail: Base64 Extraction Pipeline

Phase 3 is the most complex phase and the heart of the migration. It has four substeps executed in order:

**Step 3a — Scan & Inventory.** Parse all raw article JSON files. For each article, detect Base64 content in (1) the `splash` field and (2) inline markdown images. Produce a manifest: `data/media/manifest.json` listing every image found, its source article, location (splash vs. inline), MIME type (detected from the Base64 header `data:image/png;base64,` or `data:image/jpeg;base64,`), and a generated filename.

**Filename convention:** `{articleSlug}-splash.{ext}` for splash images, `{articleSlug}-{index}.{ext}` for inline images (e.g., `violent-crime-trends-2024-splash.png`, `violent-crime-trends-2024-001.jpg`).

**Step 3b — Decode & Save.** Decode each Base64 string to a binary file, save to `data/media/files/`. Verify each file is a valid image (check magic bytes, not just the declared MIME type). Log any corrupt or zero-byte files.

**Step 3c — Upload to Strapi 5.** Upload each file to Strapi 5's `/api/upload` REST endpoint. Capture the returned media object (ID, URL, metadata). Write the mapping to `data/maps/media.json`:

```json
{
  "violent-crime-trends-2024-splash.png": {
    "sourceArticleId": "507f1f77bcf86cd799439011",
    "location": "splash",
    "strapi5MediaId": 42,
    "strapi5Url": "/uploads/violent-crime-trends-2024-splash.png"
  }
}
```

**Step 3d — Rewrite Content.** For each article:

- **Splash field:** Replace the Base64 string in `splash` with a media relation ID pointing to the uploaded Strapi 5 media asset. In the transformed article JSON, the `splash` field becomes a relation to the media library rather than a text field.
- **Markdown body:** Find each `![alt](data:image/...;base64,...)` and replace with `![alt](/uploads/filename.ext)` using the URL from the media map. The markdown itself stays as markdown — only the image references change.

Write the rewritten articles to `data/transformed/articles.json`.

**Step 3e — Dataset Media Migration.** Datasets reference Excel files via the `datafile` field, stored in the Strapi 3 media library (actual media references, not Base64). For each dataset, download the referenced Excel file from Strapi 3's `/uploads/` directory, re-upload to Strapi 5's media library via `/api/upload`, and record the old-to-new media ID mapping in `data/maps/media.json`. The dataset's `datafile` reference in the transformed JSON is updated to point to the new Strapi 5 media ID.

**Step 3f — Transform Remaining Content Types.** Apps require minimal transformation — just field mapping and ID handling. No media, no rich text. Transform and write to `data/transformed/apps.json`.

---

## 5. Technical Decisions

### 5.1 File-Based Schema Generation (Strapi 5 Content Types)

**Decision: Generate `schema.json` files programmatically; do not use the admin UI Content-Type Builder.**

Strapi 5 content types are defined by `schema.json` files in `./src/api/[api-name]/content-types/[content-type-name]/`. When Strapi starts in development mode, it reads these files and creates the corresponding database tables. This is the same mechanism the Content-Type Builder UI uses internally — it writes JSON files, then restarts the server.

**Rationale:**

- Fully automatable — a script reads Strapi 3's schema, applies a field-type mapping, and writes Strapi 5 `schema.json` files.
- Version-controllable — schema files live in the Strapi 5 project repo.
- Repeatable — if the schema needs adjustment, re-run the generator and restart Strapi 5 (drop and recreate the SQLite DB during development).
- No dependency on the admin panel being accessible or on undocumented admin APIs.

**Alternatives considered:**

- *Admin UI (Content-Type Builder):* Manual, error-prone for 10 content types with multiple fields each. Not scriptable.
- *`strapi generate` CLI:* Interactive wizard, not easily automated.
- *Content-Type Builder internal API:* Undocumented, unstable, only works in dev mode. Fragile for automation.

**Required boilerplate:** Each API in Strapi 5 also needs minimal route, controller, and service files alongside the `schema.json`. The generator script produces these as well (they can be nearly empty — Strapi 5's core handles the REST/GraphQL layer automatically).

### 5.2 GraphQL for Extraction (Strapi 3)

**Rationale:** A single GraphQL query per content type returns fully hydrated data — all fields, nested relations, and components resolved in one request. REST would require cascading fetches to populate relations, multiplying API calls by an order of magnitude.

**Pagination:** Use `start` / `limit` arguments. Strapi 3 GraphQL defaults to a max of 100 per query; adjust via `plugins.graphql.amountLimit` in Strapi 3 config if needed.

### 5.3 REST for Media Upload (Strapi 5)

**Rationale:** Strapi 5's GraphQL plugin does not support multipart file uploads. The `/api/upload` REST endpoint is the only reliable method. This is especially critical here since the bulk of the migration work is media uploads — potentially 500–1,500+ images extracted from Base64.

### 5.4 Splash Image Field Type Change (Strapi 3 → Strapi 5)

**Strapi 3:** `splash` is a Text/LongText field containing a raw Base64 string.  
**Strapi 5:** `splash` should be redefined as a **Media field** (single image) that references an asset in the media library.

This is a structural schema change, not just a data migration. The Strapi 5 content type must be built with the splash image as a media relation from the start (Phase 1). The Base64 → file → upload → relation pipeline (Phase 3) populates it.

### 5.5 Markdown Body: Rewrite Strategy

The article body field remains a markdown/rich text field in Strapi 5. The Base64 inline images are replaced with standard markdown image references pointing to Strapi 5 media URLs. The regex pattern for detection:

```
/!\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)\)/g
```

This captures: (1) alt text, (2) MIME subtype, (3) Base64 payload. Each match is replaced with `![alt](/uploads/generated-filename.ext)` after the corresponding file is uploaded.

**Edge cases to handle:**
- Base64 strings may contain line breaks (some encoders wrap at 76 chars).
- Alt text may be empty (`![](data:image/...)`).
- Rare: HTML `<img>` tags with Base64 `src` mixed into otherwise-markdown content. The scan step should check for these too as a safety net.

### 5.6 REST or GraphQL for Content Loading (Strapi 5)

**Decision: REST (default), with GraphQL as fallback.**

REST is better documented for Strapi 5 write operations, especially for nested components. The payload format is more forgiving. GraphQL mutations are an option if we find REST problematic for specific content types.

### 5.7 Intermediate Storage

All extracted and transformed data is stored as local JSON files in a `data/` directory. This provides:

- A checkpoint between phases (re-run transform without re-extracting).
- A debugging artifact (inspect raw vs. transformed data).
- A rollback mechanism (re-run load from transformed data without starting over).

### 5.8 ID Translation Strategy

| Source (Strapi 3) | Target (Strapi 5) | Stored In |
|-------------------|-------------------|-----------|
| MongoDB ObjectId (string) | `documentId` (UUID, auto-generated) | `data/maps/{contentType}.json` |
| Media file ID (ObjectId) | New media ID (integer) | `data/maps/media.json` |

After creating each entry in Strapi 5, capture the returned `documentId` and record the mapping. Use this table in Phase 4 to resolve relations.

### 5.9 Timestamp Preservation (`createdAt` / `updatedAt`)

**Problem:** Strapi 5's API ignores `createdAt` and `updatedAt` values in POST payloads. It auto-stamps the current time on every new entry. A naive migration would make all ~250 articles (and every other record) appear to have been created on migration day, destroying the audit trail.

**Decision: Post-load SQL correction (Phase 4 substep).**

After all entries are created via the API (which handles relations, media linking, and validation), a follow-up script directly updates the SQLite database to set the original timestamps:

```sql
UPDATE articles
SET created_at = ?, updated_at = ?
WHERE document_id = ?;
```

This approach is preferred over alternatives because:

- **vs. Strapi lifecycle hooks:** No need to modify the Strapi 5 codebase; the hook would need to be added before migration and removed after.
- **vs. Direct DB insert (skipping the API):** The API handles relation wiring, media linking, and field validation. Bypassing it for all writes just to set timestamps is not worth the risk.
- **vs. Custom Strapi script:** Requires running inside the Strapi runtime. The SQL approach works from any Node.js script with `better-sqlite3`.

**Implementation:**

- During Phase 2 (Extract), capture `created_at` / `createdAt` and `updated_at` / `updatedAt` from every Strapi 3 record.
- During Phase 3 (Transform), include original timestamps in the transformed JSON alongside the content payload.
- During Phase 4 (Load), after API creation, run `04c-fix-timestamps.js` which reads each ID map, looks up the original timestamps from the transformed data, and executes the SQL UPDATE against the Strapi 5 SQLite file.

**Strapi 3 vs. Strapi 5 field names:**

| Strapi 3 (MongoDB) | Strapi 5 (SQLite) |
|--------------------|--------------------|
| `created_at` or `createdAt` | `created_at` (DB column) / `createdAt` (API response) |
| `updated_at` or `updatedAt` | `updated_at` (DB column) / `updatedAt` (API response) |

The GraphQL extraction query should request both forms to be safe; the transform step normalizes to Strapi 5's column names.

### 5.10 Legacy ID Field (`legacyId`)

**Decision: Add a `legacyId` string field to all three Strapi 5 content types.**

Each record in Strapi 5 stores its original Strapi 3 MongoDB ObjectId in a `legacyId` field. This field is indexed for fast lookups.

**Benefits:**

- **Idempotent migration:** The load script (Phase 4) checks `legacyId` before creating a record. If a record with that `legacyId` already exists, it skips or updates rather than creating a duplicate. This makes the entire migration safe to re-run after partial failures.
- **Traceability:** Any record in Strapi 5 can be traced back to its Strapi 3 origin for debugging or auditing.
- **Redirect support:** If external systems, bookmarks, or URLs reference old Strapi 3 IDs, a simple lookup on `legacyId` resolves to the new Strapi 5 `documentId`.
- **Post-migration cleanup:** The field can be removed later once the migration is fully validated and no references to old IDs remain. Or it can be kept permanently — it's a harmless string field.

**Schema addition (all three content types):**

```json
{
  "legacyId": {
    "type": "string",
    "unique": true
  }
}
```

The schema generator (Phase 1) adds this field automatically to every generated `schema.json`. The extraction (Phase 2) captures the `id` field. The transform (Phase 3) maps it to `legacyId`. The load script (Phase 4) uses it for duplicate detection.

---

## 6. Project Structure

```
researchhub-migration/
├── package.json
├── config.js                  # API URLs, tokens, content type list
├── config/
│   ├── field-type-map.json    # Strapi 3 → Strapi 5 field type mapping rules
│   └── field-map.json         # Generated: per-content-type field mapping
├── queries/                   # GraphQL queries (one per content type)
│   ├── articles.graphql
│   ├── datasets.graphql
│   ├── apps.graphql
│   └── ...
├── scripts/
│   ├── 01a-introspect.js      # Phase 1: GQL introspection on Strapi 3
│   ├── 01b-generate-schemas.js # Phase 1: Generate Strapi 5 schema.json files
│   ├── 01c-verify-schemas.js  # Phase 1: Introspect Strapi 5, diff against Strapi 3
│   ├── 02-extract.js          # Phase 2: Pull data from Strapi 3
│   ├── 02-verify.js           # Phase 2: Post-extraction validation gate
│   ├── 03a-scan-base64.js     # Phase 3a: Scan articles, produce media manifest
│   ├── 03b-decode-base64.js   # Phase 3b: Decode Base64 → binary files
│   ├── 03c-upload-media.js    # Phase 3c: Upload files to Strapi 5 media library
│   ├── 03d-rewrite-content.js # Phase 3d: Replace Base64 with media URLs in articles
│   ├── 03e-transform.js       # Phase 3e: Reshape all other content types
│   ├── 03-verify.js           # Phase 3: Post-transform validation gate
│   ├── 04-load.js             # Phase 4: Insert into Strapi 5
│   ├── 04b-link-relations.js  # Phase 4: Second pass for relations
│   ├── 04c-fix-timestamps.js  # Phase 4: Restore createdAt/updatedAt via SQLite
│   ├── 04-verify.js           # Phase 4: Post-load validation gate
│   └── 05-validate.js         # Phase 5: End-to-end reconciliation
├── lib/
│   ├── graphql-client.js      # Shared GQL fetch wrapper
│   ├── rest-client.js         # Shared REST fetch wrapper
│   ├── id-map.js              # ID translation table utilities
│   ├── schema-generator.js    # Generate Strapi 5 schema.json + boilerplate files
│   ├── base64-scanner.js      # Detect Base64 in splash fields + markdown
│   ├── base64-decoder.js      # Decode Base64 → file with magic byte validation
│   └── markdown-rewriter.js   # Replace Base64 image refs with media URLs
├── output/
│   └── strapi5-schemas/       # Generated schema.json + route/controller/service files
│       ├── article/
│       │   └── content-types/
│       │       └── article/
│       │           └── schema.json
│       ├── dataset/
│       │   └── content-types/
│       │       └── dataset/
│       │           └── schema.json
│       ├── app/
│       │   └── content-types/
│       │       └── app/
│       │           └── schema.json
│       └── ...
├── data/
│   ├── raw/                   # Strapi 3 API responses (JSON)
│   ├── introspection/         # GraphQL introspection results from both instances
│   │   ├── strapi3.json
│   │   ├── strapi5.json
│   │   └── schema-diff.json
│   ├── media/
│   │   ├── manifest.json      # Inventory of all Base64 images found
│   │   └── files/             # Decoded binary image files
│   ├── transformed/           # Reshaped for Strapi 5 (JSON)
│   └── maps/                  # ID translation tables (JSON)
│       ├── media.json         # Base64 source → Strapi 5 media ID/URL
│       ├── articles.json      # Strapi 3 ObjectId → Strapi 5 documentId
│       └── ...                # One map per content type
└── README.md
```

---

## 7. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Strapi 3 → 5 field type mapping produces invalid schema | High — Strapi 5 won't start | Medium | Validate generated `schema.json` against Strapi 5 model docs; test with `strapi develop` before proceeding |
| Relation syntax conversion errors (v3 `via`/`model` → v5 `relation`/`target`/`mappedBy`) | High — relations broken or missing | Medium | Manual review of generated relation definitions; cross-reference with Strapi 5 relation docs |
| Missing boilerplate files (routes, controllers, services) | Medium — Strapi 5 ignores content type | Low | Generator script produces all required files; verify with `strapi routes:list` |
| Base64 splash images corrupt or zero-byte | High — articles display with broken hero images | Medium | Magic byte validation in decode step; log and flag failures for manual review |
| Base64 inline images with line breaks or unusual encoding | High — regex misses images, Base64 remnants in production | Medium | Pre-strip whitespace from Base64 payloads; secondary scan for `data:image/` after rewrite to catch misses |
| HTML `<img>` tags with Base64 mixed into markdown | Medium — missed images | Low | Secondary regex scan for `<img[^>]+src="data:image/` as safety net |
| Strapi 5 media upload rejects files (size, format) | Medium — images lost | Low | Validate MIME type and file size before upload; log rejections |
| Markdown rewrite breaks other content | High — article bodies corrupted | Low | Diff original vs. rewritten markdown; only image references should change |
| Strapi 5 API rejects nested payloads | Medium — blocks content loading | Medium | Test with manual curl/Postman for each content type before scripting |
| Rate limiting on either API | Low — slows migration | Low (local instances) | Add configurable delay between requests, retry with backoff |
| Strapi 3 GraphQL pagination edge cases | Medium — missing records | Low | Post-extract count check vs. MongoDB record count |
| Relation ordering (forward references) | Medium — load fails | Low | Only 3 content types with shallow relations; load dashboards first (no deps), then datasets, then articles. Two-pass only if articles↔datasets have circular refs |
| Rich text field format differences | Medium — broken content | Medium | Audit rich text format in Phase 1; use markdown/plaintext field in Strapi 5 if Strapi 3 content is markdown |
| Timestamps lost on API creation | High — audit trail destroyed | High (certain without mitigation) | Post-load SQLite UPDATE to restore original `createdAt`/`updatedAt` from Strapi 3 |
| SQLite timestamp format mismatch | Medium — dates display wrong | Low | Verify Strapi 5 expects ISO 8601 in SQLite; normalize during transform |

---

## 8. Introspection Queries

### 8.1 Strapi 3 Introspection (Phase 1a — Input to Schema Generation)

Run against the Strapi 3 GraphQL endpoint to discover all content types and their fields:

```graphql
{
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
  }
}
```

Also inspect the Strapi 3 model files directly (`api/*/models/*.settings.json`) for field constraints and relation details that GraphQL introspection doesn't expose (e.g., `required`, `unique`, `default`, `via`, `model`, `collection`). The script `01a-introspect.js` combines both sources into a unified schema representation saved as `data/introspection/strapi3.json`.

### 8.2 Strapi 5 Verification (Phase 1c — After Schema Generation)

After `01b-generate-schemas.js` writes the `schema.json` files and Strapi 5 is restarted, run the same introspection query against Strapi 5's GraphQL endpoint. Save as `data/introspection/strapi5.json`. The script `01c-verify-schemas.js` diffs the two introspection results to confirm:

- All content types from Strapi 3 exist in Strapi 5
- All fields are present with correct types
- Relations are properly defined
- The splash image field is now a media type (not text)

Output: `data/introspection/schema-diff.json` — should show only expected differences (new Strapi 5 system fields like `documentId`, the splash field type change, relation syntax differences).

---

## 9. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| All content types generated | Every Strapi 3 content type has a corresponding `schema.json` in the Strapi 5 project; Strapi 5 starts without errors |
| Schema diff clean | `schema-diff.json` shows only expected differences (system fields, splash type change); no missing fields or types |
| All content types migrated | Record count matches between Strapi 3 and Strapi 5 for every content type |
| All 250 articles migrated | Article count in Strapi 5 = article count in Strapi 3 |
| All Base64 images extracted | Manifest image count = decoded file count = uploaded media count |
| Zero Base64 remnants | Scan all Strapi 5 text/markdown fields for `data:image/` — zero matches |
| All splash images converted | Every article with a Base64 splash in Strapi 3 has a media relation in Strapi 5 |
| All inline images rewritten | Every `![alt](data:image/...)` in Strapi 3 markdown is now `![alt](/uploads/...)` in Strapi 5 |
| All media files accessible | HTTP GET on every Strapi 5 media URL returns 200 with correct content-type |
| All relations intact | Spot check 10% of entries with relations; all resolve correctly |
| Timestamps preserved | For every record, Strapi 5 `createdAt` matches Strapi 3 `created_at`; same for `updatedAt`. Spot check + automated diff of 100% of article timestamps |
| Strapi 5 API serves content correctly | Manual QA of ResearchHub frontend against Strapi 5 backend |

---

## 10. Open Questions

1. ~~**Rich text format:**~~ **Resolved.** Article bodies are markdown. Strapi 5 should use a markdown or plaintext/LongText field (not the blocks editor) to preserve content as-is.
2. ~~**Content type creation method:**~~ **Resolved.** Content types will be generated programmatically as `schema.json` files (see Section 5.1). No manual admin UI work required.
3. ~~**Content types:**~~ **Resolved.** Three content types: `article`, `dataset`, `app`. Apps have no relations or media. Datasets reference Excel files via `datafile`. Articles have Base64 `splash` + inline images.
4. ~~**Components:**~~ **Resolved.** No components on any content type.
5. ~~**Relations:**~~ **Resolved.** Articles have two m2m relation fields: `datasets` (→ dataset) and `apps` (→ app). Both are many-to-many. No reverse relations. No circular dependencies.
6. ~~**Splash image field name:**~~ **Resolved.** `splash`.
7. ~~**Dataset file field name:**~~ **Resolved.** `datafile`.
8. ~~**Strapi 5 hosting:**~~ **Resolved.** DigitalOcean via Laravel Forge.
9. **Base64 image formats:** Are all embedded images PNG, or is there a mix of PNG/JPEG/GIF/WebP? (The scan step will detect this, but knowing upfront helps.)
10. **Exact field inventory:** The introspection step (Phase 1a) will capture the complete field list for all three content types. The fields listed in Section 3 are approximate — the authoritative list comes from the Strapi 3 model JSON files.

---

## Appendix A: Phase Document Template

Each phase doc (01–05) follows this structure:

1. **Objective** — What this phase accomplishes.
2. **Prerequisites** — What must be complete before starting.
3. **Inputs / Outputs** — Files and services consumed and produced.
4. **Step-by-step procedure** — Detailed implementation instructions.
5. **Error handling** — What can go wrong and how to recover.
6. **Verification** — How to confirm the phase succeeded.
7. **LLM Build Prompt** — Self-contained prompt for Claude to implement this phase.

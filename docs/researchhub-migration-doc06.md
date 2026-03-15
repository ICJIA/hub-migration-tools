# Doc 06 — Phase 6: Parity Audit

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration
**Phase:** 6 (post-validation)
**Depends on:** Phase 5 complete (all automated pass/fail checks green)
**Produces:** Detailed, field-by-field audit report documenting every difference between Strapi 3 and Strapi 5
**Date:** March 2026
**Status:** Draft

---

## 1. Objective

Produce a comprehensive, human-readable audit report that compares every record, every field, and every relation between Strapi 3 and Strapi 5. Unlike Phase 5, which runs automated pass/fail gates (did the migration succeed?), Phase 6 generates a detailed, auditable record of exactly what changed, what stayed the same, and what needs human review.

**Phase 5 vs. Phase 6 — the distinction:**

| Aspect | Phase 5 (Validation) | Phase 6 (Parity Audit) |
|--------|---------------------|----------------------|
| Purpose | Go/no-go gate — did the migration succeed? | Audit trail — what exactly changed? |
| Scope | Spot checks (10% sample for content), aggregate counts, pass/fail checks | Field-by-field comparison for 100% of records |
| Output | `validation-report.json` with PASS/FAIL/WARN per check | `audit-report.json` with per-record, per-field findings + `audit-report.md` with tables and summaries |
| Finding types | PASS or FAIL (binary) | ERROR (unexpected), EXPECTED (known change), INFO (worth noting) |
| Content comparison | Title/slug exact match + markdown length check on 10% sample | Every scalar field compared for every record, markdown stripped and compared, JSON fields deep-compared |
| Media comparison | Checks that media relations exist and URLs return 200 | Verifies specific field-level transformations (Base64 string to media relation) per record |
| Relation comparison | Verifies relation sets match transformed data | Compares relation sets between Strapi 3 and Strapi 5 directly, both dominant and non-dominant sides |
| When to run | Before deployment — blocks if FAIL | After Phase 5 passes — provides the audit record for sign-off |

Phase 5 answers: "Is the migration safe to deploy?" Phase 6 answers: "Here is the complete, reviewable evidence."

---

## 2. Prerequisites

- Phase 5 complete: `data/validation-report.json` shows `overallStatus: "PASS"` with zero failures.
- Strapi 3 running at `http://localhost:1337` (source of truth for comparison).
- Strapi 5 running at `http://localhost:1338` (migration target).
- Strapi 5 SQLite database accessible (for timestamp comparisons).
- All ID maps exist: `data/maps/articles.json`, `data/maps/datasets.json`, `data/maps/apps.json`, `data/maps/media.json`.
- Raw extraction data still available: `data/raw/articles.json`, `data/raw/datasets.json`, `data/raw/apps.json`.
- `better-sqlite3` npm package installed (for direct SQLite timestamp reads).

---

## 3. Inputs / Outputs

### Inputs

| Input | Location | Description |
|-------|----------|-------------|
| Strapi 3 GraphQL/REST API | `http://localhost:1337` | Source of truth — every record fetched live |
| Strapi 5 REST API | `http://localhost:1338/api/` | Migration target — every record fetched live |
| Strapi 5 SQLite DB | Path from `config.js` as `strapi5DbPath` | Direct access for timestamp reads |
| Raw extraction data | `data/raw/*.json` | Original Strapi 3 data (for reference and Base64 field detection) |
| ID maps | `data/maps/*.json` | Legacy ID to Strapi 5 documentId mappings |
| Media map | `data/maps/media.json` | Filename to Strapi 5 media ID/URL mappings |
| Strapi 3 model schemas | `schemas/*.settings.json` | Authoritative field list per content type |

### Outputs

| Output | Location | Description |
|--------|----------|-------------|
| Audit report (JSON) | `data/audit-report.json` | Structured findings: per-record, per-field, categorized |
| Audit report (Markdown) | `data/audit-report.md` | Human-readable tables and summaries |

---

## 4. Step-by-Step Procedure

### Step 6a: Schema Parity Comparison

**Script:** `scripts/06-audit.js` (single script, all steps)

Compare the field definitions between Strapi 3 and Strapi 5 for all three content types. This is not a data comparison — it documents the structural changes.

**Method:**

1. Read the Strapi 3 model schemas from `schemas/article.settings.json`, `schemas/dataset.settings.json`, `schemas/app.settings.json`.
2. Read the Strapi 5 schemas from the generated `schema.json` files (or introspect the running Strapi 5 instance via `GET /api/content-type-builder/content-types`).
3. For each content type, compare:
   - Field names present in Strapi 3 but not Strapi 5 (removed fields — none expected).
   - Field names present in Strapi 5 but not Strapi 3 (added fields — `legacyId` expected).
   - Fields whose type changed between Strapi 3 and Strapi 5.
   - `collectionName` changes (Strapi 3 uses singular: `article`, `dataset`, `app`; Strapi 5 may use plural).
   - Timestamp format differences (camelCase in Strapi 3 schemas vs. snake_case in SQLite columns).

**Expected findings (all should be EXPECTED, not ERROR):**

| Content Type | Field | Strapi 3 | Strapi 5 | Category |
|-------------|-------|----------|----------|----------|
| article | `splash` | `string` (Base64) | `media` (single) | EXPECTED |
| article | `thumbnail` | `string` (Base64) | `media` (single) | EXPECTED |
| article | `legacyId` | (not present) | `string` (unique) | EXPECTED |
| app | `image` | `string` (Base64) | `media` (single) | EXPECTED |
| app | `legacyId` | (not present) | `string` (unique) | EXPECTED |
| dataset | `legacyId` | (not present) | `string` (unique) | EXPECTED |
| all | `collectionName` | singular | plural (if changed) | INFO |
| all | timestamps | `createdAt`/`updatedAt` (camelCase) | `created_at`/`updated_at` (snake_case in DB) | INFO |

**Output:** A `schema` section in the audit report listing every field for every content type with its Strapi 3 type, Strapi 5 type, and finding category.

---

### Step 6b: Record-Level Field Parity

For EVERY record in EVERY content type, fetch the full record from both Strapi 3 and Strapi 5 and compare every scalar field value.

**Method:**

1. **Fetch all records from Strapi 3.** Use GraphQL to fetch all articles, datasets, and apps with all scalar fields. Paginate as needed (use `start`/`limit`).

2. **Fetch all records from Strapi 5.** Use the REST API with pagination (`pagination[pageSize]=100`). For each record, look up its corresponding Strapi 3 record using the `legacyId` field.

3. **For each matched record pair (Strapi 3 record + Strapi 5 record):**

   Compare every scalar field. The field comparison rules are:

   | Field Type | Comparison Method | Notes |
   |-----------|-------------------|-------|
   | `string` (title, slug, status, doi, mainfiletype, unit, url, funding, citation) | Exact string equality | Any difference is ERROR |
   | `boolean` (external, project, hideFromBanner) | Exact equality | Any difference is ERROR |
   | `date` (date) | Exact string equality (ISO date format) | Any difference is ERROR |
   | `text` (abstract) | Exact string equality | Any difference is ERROR |
   | `text` (markdown — articles) | Strip all image references from both, then compare remaining text | See markdown comparison below |
   | `text` (description — apps, datasets) | Exact string equality | Any difference is ERROR |
   | `json` (categories, tags, authors, contributors, sources, timeperiod, notes, variables, images) | Deep equality (`JSON.stringify` after sorting keys) | Any difference is ERROR |
   | `string` (splash, thumbnail — articles) | Skip direct comparison | EXPECTED: was Base64 string, now media relation. Checked in Step 6c instead |
   | `string` (image — apps) | Skip direct comparison | EXPECTED: was Base64 string, now media relation. Checked in Step 6c instead |

   **Markdown comparison for articles:**

   The `markdown` field in Strapi 3 contains inline Base64 images (`![alt](data:image/...;base64,...)`). In Strapi 5, these have been replaced with media URLs (`![alt](/uploads/...)`). A direct comparison would flag every article as different.

   Instead:
   1. Strip all markdown image references from both versions using regex: `!\[[^\]]*\]\([^)]+\)`.
   2. Normalize whitespace (trim, collapse multiple newlines to single).
   3. Compare the remaining text.
   4. If they match after stripping images, log as INFO: "markdown matches after image reference removal."
   5. If they differ, log as ERROR with a character-level diff position.

4. **For each field comparison, record a finding:**

   ```json
   {
     "contentType": "article",
     "legacyId": "507f1f77bcf86cd799439011",
     "field": "title",
     "strapi3Value": "Violent Crime Trends 2024",
     "strapi5Value": "Violent Crime Trends 2024",
     "match": true,
     "category": null
   }
   ```

   Only non-matching fields produce findings in the report (matching fields are counted but not individually listed):

   ```json
   {
     "contentType": "article",
     "legacyId": "507f1f77bcf86cd799439011",
     "field": "title",
     "strapi3Value": "Violent Crime Trends 2024",
     "strapi5Value": "violent Crime Trends 2024",
     "match": false,
     "category": "ERROR",
     "note": "Title mismatch: first character case differs"
   }
   ```

---

### Step 6c: Media Parity

For each record that had a media-related field in Strapi 3, verify the corresponding Strapi 5 media relation is correct.

**Method:**

1. **Article splash images:**
   - For each article in `data/raw/articles.json` where `splash` is non-null and non-empty:
     - Fetch the Strapi 5 article with `?populate=splash`.
     - Verify `splash` returns a media object (not null).
     - Log as EXPECTED: "splash field converted from Base64 string to media relation."
   - For articles where `splash` was null/empty in Strapi 3:
     - Verify `splash` is null in Strapi 5.
     - If not null, log as ERROR: "splash has media in Strapi 5 but was empty in Strapi 3."

2. **Article thumbnail images:** Same logic as splash.

3. **App image field:** Same logic — for each app where `image` was non-null in Strapi 3, verify media relation exists in Strapi 5.

4. **Article mainfile / extrafile:**
   - For each article in raw data where `mainfile` is non-null:
     - Fetch from Strapi 5 with `?populate=mainfile`.
     - Verify the media object exists.
     - Verify the media URL is accessible (HEAD request, expect 200).
     - Log as INFO: "mainfile migrated successfully" or ERROR: "mainfile missing/inaccessible."
   - Same for `extrafile`.

5. **Dataset datafile:**
   - For each dataset in raw data where `datafile` is non-null:
     - Fetch from Strapi 5 with `?populate=datafile`.
     - Verify the media object exists and URL is accessible.

6. **Inline Base64 images from markdown:**
   - For each article, count the number of Base64 inline images in the Strapi 3 `markdown` field (using the Base64 detection regex from Doc 00 Section 5.5).
   - Count the number of `/uploads/` image references in the Strapi 5 `markdown` field.
   - Compare counts: they should match.
   - Log as INFO: "Article {legacyId}: {N} inline images converted from Base64 to media URLs."
   - If counts differ, log as ERROR: "Inline image count mismatch: Strapi 3 had {N} Base64 images, Strapi 5 has {M} media URLs."

**Output:** A `media` section in the audit report with per-record findings.

---

### Step 6d: Relation Parity

Compare all many-to-many relations between Strapi 3 and Strapi 5 for every record.

**Method:**

1. **Article-to-dataset relations (article dominant):**
   - For EVERY article, fetch from Strapi 3 via GraphQL with related datasets (get dataset IDs).
   - Fetch from Strapi 5 with `?populate[datasets][fields][0]=legacyId`.
   - Convert Strapi 5 dataset `legacyId` values to a set.
   - Convert Strapi 3 dataset IDs to a set.
   - Compare the sets.
   - Log missing relations (in Strapi 3 but not Strapi 5) as ERROR.
   - Log extra relations (in Strapi 5 but not Strapi 3) as ERROR.
   - Log matching relations as INFO (counted, not individually listed).

2. **App-to-article relations (app dominant):**
   - For EVERY app, fetch from Strapi 3 via GraphQL with related articles.
   - Fetch from Strapi 5 with `?populate[articles][fields][0]=legacyId`.
   - Compare sets. Log mismatches as ERROR.

3. **App-to-dataset relations (app dominant):**
   - Same pattern: fetch from both sides, compare sets.

4. **Non-dominant side verification:**
   - For EVERY dataset, fetch from Strapi 5 with `?populate[articles][fields][0]=legacyId&populate[apps][fields][0]=legacyId`.
   - Verify that the non-dominant side reflects the same relations as the dominant side.
   - For example, if article A relates to dataset D (from the article side), dataset D should also show article A (from the dataset side).
   - Log any asymmetry as ERROR: "Relation asymmetry: article {legacyId} lists dataset {legacyId}, but dataset does not list article."

**Output:** A `relations` section in the audit report with per-record findings.

---

### Step 6e: Timestamp Parity

Compare `createdAt` and `updatedAt` for EVERY record between Strapi 3 and Strapi 5.

**Method:**

1. Open the Strapi 5 SQLite database in read-only mode using `better-sqlite3`.
2. For each content type, query the SQLite table for `document_id`, `created_at`, `updated_at`.
3. Using the ID map, match each Strapi 5 record to its Strapi 3 counterpart.
4. For each matched pair, compare timestamps:
   - Parse both as Date objects.
   - Allow a tolerance of +/-1 second (to account for rounding during ISO string conversion).
   - If within tolerance: no finding (counted as clean).
   - If outside tolerance: log as ERROR with both timestamps and the delta in seconds.

**Output:** A `timestamps` section in the audit report.

---

### Step 6f: Generate Audit Reports

After all comparisons are complete, produce two output files.

**6f.1: JSON report (`data/audit-report.json`)**

```json
{
  "generatedAt": "2026-03-15T18:30:00.000Z",
  "summary": {
    "totalRecordsCompared": {
      "articles": 250,
      "datasets": 42,
      "apps": 15,
      "total": 307
    },
    "totalFieldsCompared": 8750,
    "findingsByCategory": {
      "ERROR": 0,
      "EXPECTED": 523,
      "INFO": 1842
    },
    "recordsClean": 307,
    "recordsWithFindings": 0,
    "recordsWithErrors": 0
  },
  "schema": {
    "article": {
      "fieldsInBoth": ["title", "status", "slug", "date", "external", "categories", "tags", "authors", "abstract", "markdown", "mainfiletype", "funding", "citation", "doi", "hideFromBanner", "images"],
      "addedInStrapi5": ["legacyId"],
      "removedInStrapi5": [],
      "typeChanges": [
        {
          "field": "splash",
          "strapi3Type": "string",
          "strapi5Type": "media",
          "category": "EXPECTED",
          "note": "Base64 string converted to media relation"
        },
        {
          "field": "thumbnail",
          "strapi3Type": "string",
          "strapi5Type": "media",
          "category": "EXPECTED",
          "note": "Base64 string converted to media relation"
        }
      ]
    },
    "dataset": { "..." : "..." },
    "app": { "..." : "..." }
  },
  "records": {
    "articles": [
      {
        "legacyId": "507f1f77bcf86cd799439011",
        "strapi5DocumentId": "abc123def456",
        "title": "Violent Crime Trends 2024",
        "fieldComparisons": {
          "totalFields": 16,
          "matchingFields": 16,
          "findings": []
        },
        "media": {
          "splash": { "category": "EXPECTED", "note": "Base64 string → media relation (mediaId: 42)" },
          "thumbnail": { "category": "EXPECTED", "note": "Base64 string → media relation (mediaId: 43)" },
          "mainfile": { "category": "INFO", "note": "Upload-plugin file migrated, accessible at /uploads/mainfile.pdf" },
          "inlineImages": { "strapi3Count": 3, "strapi5Count": 3, "category": "INFO", "note": "3 inline Base64 images converted to media URLs" }
        },
        "relations": {
          "datasets": { "strapi3Count": 2, "strapi5Count": 2, "missing": [], "extra": [], "category": null },
          "apps": { "strapi3Count": 1, "strapi5Count": 1, "missing": [], "extra": [], "category": null }
        },
        "timestamps": {
          "createdAt": { "strapi3": "2024-03-15T10:00:00.000Z", "strapi5": "2024-03-15T10:00:00.000Z", "match": true },
          "updatedAt": { "strapi3": "2024-06-20T14:30:00.000Z", "strapi5": "2024-06-20T14:30:00.000Z", "match": true }
        }
      }
    ],
    "datasets": [ "..." ],
    "apps": [ "..." ]
  }
}
```

**6f.2: Markdown report (`data/audit-report.md`)**

The markdown report is designed for human review. It contains:

**Header and summary table:**

```markdown
# ResearchHub Migration Parity Audit

Generated: 2026-03-15T18:30:00.000Z

## Summary

| Metric | Value |
|--------|-------|
| Total records compared | 307 |
| Total fields compared | 8,750 |
| ERROR findings | 0 |
| EXPECTED findings | 523 |
| INFO findings | 1,842 |
| Records with zero errors | 307 |
| Records needing review | 0 |
```

**Schema parity table (one per content type):**

```markdown
## Schema Parity

### Article

| Field | Strapi 3 Type | Strapi 5 Type | Status |
|-------|--------------|--------------|--------|
| title | string | string | MATCH |
| splash | string | media | EXPECTED |
| thumbnail | string | media | EXPECTED |
| legacyId | — | string | EXPECTED (added) |
| ... | ... | ... | ... |
```

**Record findings (only records with non-INFO findings):**

```markdown
## Records With Findings

### Articles

No ERROR findings.

### Datasets

No ERROR findings.

### Apps

No ERROR findings.
```

If there are ERROR findings, each is listed with the record's legacyId, title, field name, Strapi 3 value, Strapi 5 value, and a note.

**Statistics tables:**

```markdown
## Media Migration Summary

| Media Type | Total in Strapi 3 | Migrated to Strapi 5 | Missing |
|-----------|-------------------|----------------------|---------|
| Article splash | 230 | 230 | 0 |
| Article thumbnail | 180 | 180 | 0 |
| Article mainfile | 100 | 100 | 0 |
| Article extrafile | 25 | 25 | 0 |
| Article inline images | 850 | 850 | 0 |
| App image | 12 | 12 | 0 |
| Dataset datafile | 38 | 38 | 0 |

## Relation Summary

| Relation | Total in Strapi 3 | Matched in Strapi 5 | Missing | Extra |
|----------|-------------------|---------------------|---------|-------|
| Article → Dataset | 387 | 387 | 0 | 0 |
| App → Article | 45 | 45 | 0 | 0 |
| App → Dataset | 55 | 55 | 0 | 0 |

## Timestamp Summary

| Content Type | Records | Matching (±1s) | Mismatched |
|-------------|---------|----------------|------------|
| Articles | 250 | 250 | 0 |
| Datasets | 42 | 42 | 0 |
| Apps | 15 | 15 | 0 |
```

---

## 5. Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| Strapi 3 not accessible | Instance shut down | Restart Strapi 3 at `:1337`; it's needed for live comparison |
| Strapi 5 not accessible | Not started or crashed | Start Strapi 5: `cd strapi5-project && npm run develop` |
| Record in Strapi 3 has no matching `legacyId` in Strapi 5 | Record was not migrated or `legacyId` was not set | Log as ERROR in audit report; do not abort — continue auditing remaining records |
| Record in Strapi 5 has no matching record in Strapi 3 | Orphan record created during testing or partial re-run | Log as ERROR: "Orphan record in Strapi 5 with no Strapi 3 counterpart" |
| SQLite database locked | Strapi 5 running during read | Use read-only mode (`{ readonly: true }` in `better-sqlite3`); should work even with Strapi 5 running |
| GraphQL pagination returns fewer records than expected | Strapi 3 pagination limit | Increase `amountLimit` in Strapi 3 GraphQL config or reduce page size and iterate |
| JSON field comparison fails on key ordering | Object key order differs between MongoDB and SQLite | Sort keys before comparison (`JSON.stringify(sortKeys(obj))`) |
| Large audit report file | Many records with many fields | Expected — the JSON report for 307 records may be several MB. This is acceptable for an audit artifact |
| Timeout on media HEAD requests | Many files or slow responses | Use concurrency limit (10 parallel requests); increase per-request timeout to 10 seconds |

**Critical design rule:** The audit script should NEVER abort on a single record failure. It processes every record and collects all findings. Individual failures are logged as ERROR findings in the report. The script only exits with a non-zero code if it cannot connect to either Strapi instance.

---

## 6. Verification (Meta-Audit)

How to verify the audit itself is correct:

1. **Record count verification.** The total records audited per content type must match Phase 5's validated counts. If Phase 5 confirmed 250 articles, 42 datasets, 15 apps, the audit report must show exactly those counts.

2. **Spot-check ERROR findings.** If the audit reports any ERROR findings, manually verify 100% of them by fetching the specific records from both Strapi 3 and Strapi 5 and comparing the flagged fields by hand.

3. **Spot-check EXPECTED findings.** Manually verify a sample of 5 EXPECTED findings to confirm the audit correctly identified them (e.g., pick 5 articles with splash images, confirm Strapi 3 has a Base64 string and Strapi 5 has a media relation).

4. **Cross-reference with Phase 5.** The audit should not contradict Phase 5. If Phase 5 said "relation integrity PASS," the audit should show zero missing/extra relations. If there is a contradiction, investigate — either Phase 5 had a bug or Phase 6 has a bug.

5. **Markdown comparison sanity check.** Pick 3 articles with known inline images. Read the Strapi 3 `markdown` field and the Strapi 5 `markdown` field manually. Confirm the only differences are `data:image/...` replaced by `/uploads/...`. Confirm the audit correctly categorized this as INFO rather than ERROR.

6. **Empty-field edge cases.** Verify the audit handles null/empty fields correctly. If both Strapi 3 and Strapi 5 have null for a field, it should count as a match, not a finding.

---

## 7. Phase Completion Checklist

- [ ] `scripts/06-audit.js` runs without aborting
- [ ] `data/audit-report.json` exists and is valid JSON
- [ ] `data/audit-report.md` exists and is readable
- [ ] Summary shows total records compared matches Phase 5 counts (250 articles, 42 datasets, 15 apps)
- [ ] Zero ERROR findings across all content types (or all ERRORs reviewed and accepted)
- [ ] All EXPECTED findings are genuinely expected changes (splash/thumbnail/image type change, legacyId addition)
- [ ] Schema parity section lists all fields for all content types
- [ ] Every article has been compared field-by-field
- [ ] Every dataset has been compared field-by-field
- [ ] Every app has been compared field-by-field
- [ ] Media parity confirms all splash/thumbnail/image/mainfile/extrafile/datafile migrations
- [ ] Inline image counts match between Strapi 3 Base64 and Strapi 5 media URLs for all articles
- [ ] Relation parity confirms all three m2m relation sets (article-dataset, app-article, app-dataset)
- [ ] Non-dominant side relations verified (dataset sees its articles and apps correctly)
- [ ] Timestamp parity confirms all `createdAt`/`updatedAt` values match within +/-1 second
- [ ] Audit report reviewed by a human and signed off
- [ ] `06-audit.js` exits with code 0 (no connection failures)

---

## 8. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

````
You are building Phase 6 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub migrated 3 content types from Strapi 3 (MongoDB) to Strapi 5 (SQLite):
- `article` (~250 records) — has `splash`, `thumbnail` (were Base64 strings, now media relations), `mainfile`, `extrafile` (upload plugin → media), `markdown` (text field with inline images, NOT body), m2m relation to datasets (article is dominant)
- `dataset` (~42 records) — has `datafile` (upload plugin → media), non-dominant sides of article and app relations
- `app` (~15 records) — has `image` (was Base64 string, now media relation), `description` (text, NOT summary), `url`, `contributors` (json), m2m relations to articles and datasets (app is dominant for both)

All content types have a `legacyId` field storing the original Strapi 3 MongoDB ObjectId.

The relation graph is a **triangle** with three m2m relation sets:
- Article → datasets (article is dominant)
- App → articles (app is dominant)
- App → datasets (app is dominant)

The `collectionName` for each type is singular in Strapi 3: `article`, `dataset`, `app`. Timestamps in source data use camelCase (`createdAt`/`updatedAt`), while Strapi 5 SQLite columns use snake_case (`created_at`/`updated_at`).

Phase 5 (validation) has already passed — all automated pass/fail checks are green. Phase 6 is a DIFFERENT concern: producing a detailed, auditable, field-by-field comparison report.

Strapi 3: http://localhost:1337 (GraphQL at /graphql)
Strapi 5: http://localhost:1338, API token in `config.js` as `strapi5Token`
Strapi 5 SQLite: path in `config.js` as `strapi5DbPath`

Available data files:
- `data/raw/articles.json`, `data/raw/datasets.json`, `data/raw/apps.json` (original Strapi 3 data)
- `data/maps/articles.json`, `data/maps/datasets.json`, `data/maps/apps.json` (legacyId → strapi5DocumentId)
- `data/maps/media.json` (filename → strapi5MediaId, strapi5Url)
- `schemas/article.settings.json`, `schemas/dataset.settings.json`, `schemas/app.settings.json` (Strapi 3 model schemas)

## Your Task

Create one script:

### `scripts/06-audit.js`

This script performs a comprehensive parity audit and produces two output files. It NEVER aborts on individual record failures — it collects all findings and continues.

**Finding categories:**
- `ERROR` — unexpected difference that needs investigation (e.g., title mismatch, missing relation)
- `EXPECTED` — known, planned change (e.g., splash string → media, legacyId added)
- `INFO` — worth noting but not a problem (e.g., markdown images rewritten, timestamp match confirmed)

**Step 1: Schema parity.**
Read Strapi 3 schemas from `schemas/*.settings.json`. For each content type, list all fields with their Strapi 3 type. Compare against Strapi 5 by introspecting the running instance or reading the generated schema files. Report:
- Fields in both (with type match/mismatch)
- Fields added in Strapi 5 (`legacyId` — EXPECTED)
- Fields removed in Strapi 5 (none expected — any removal is ERROR)
- Type changes (`splash` string → media, `thumbnail` string → media, `image` string → media — all EXPECTED)

**Step 2: Record-level field parity.**
For EVERY record in EVERY content type:
1. Fetch from Strapi 3 via GraphQL (all scalar fields).
2. Fetch from Strapi 5 via REST (using legacyId filter: `?filters[legacyId][$eq]={id}&populate=*`).
3. Compare every scalar field:
   - `title`, `slug`, `status`, `date`, `external`, `doi`, `mainfiletype`, `hideFromBanner`, `funding`, `citation`, `url`, `unit`, `project` — exact match required. Mismatch = ERROR.
   - `categories`, `tags`, `authors`, `contributors`, `sources`, `timeperiod`, `notes`, `variables`, `images` (all JSON fields) — deep equality after sorting keys. Mismatch = ERROR.
   - `abstract` — exact string match. Mismatch = ERROR.
   - `markdown` (articles) — strip all image references (`!\[[^\]]*\]\([^)]+\)`) from both versions, normalize whitespace, then compare. Match = INFO. Mismatch = ERROR.
   - `description` (apps, datasets) — exact string match. Mismatch = ERROR.
   - Skip `splash`, `thumbnail`, `image` for direct comparison (handled in media step).

**Step 3: Media parity.**
For each record:
- Article `splash`: If non-null in raw data, verify Strapi 5 has media relation. Log as EXPECTED.
- Article `thumbnail`: Same.
- App `image`: Same.
- Article `mainfile`/`extrafile`: If non-null in raw data, verify Strapi 5 has media relation AND URL is accessible (HEAD request, expect 200). Log as INFO if accessible, ERROR if missing or inaccessible.
- Dataset `datafile`: Same as mainfile/extrafile.
- Inline images: Count `data:image/` occurrences in Strapi 3 markdown. Count `/uploads/` image references in Strapi 5 markdown. Compare counts. Match = INFO. Mismatch = ERROR.

**Step 4: Relation parity.**
For EVERY record, compare relations:
- Article → datasets: Fetch Strapi 3 article's dataset IDs via GraphQL. Fetch Strapi 5 article's datasets with `?populate[datasets][fields][0]=legacyId`. Compare sets of IDs. Missing = ERROR. Extra = ERROR.
- App → articles: Same pattern.
- App → datasets: Same pattern.
- Non-dominant side verification: For each dataset, fetch its articles and apps from Strapi 5. Verify they match the dominant side. Asymmetry = ERROR.

**Step 5: Timestamp parity.**
Open SQLite database (read-only). For each content type, query `SELECT document_id, created_at, updated_at FROM {table}`. Match against Strapi 3 timestamps (from raw data). Allow +/-1 second tolerance. Outside tolerance = ERROR.

**Step 6: Generate reports.**

**JSON report (`data/audit-report.json`):**
- `generatedAt` timestamp
- `summary` object with counts: totalRecordsCompared (by type and total), totalFieldsCompared, findingsByCategory (ERROR/EXPECTED/INFO counts), recordsClean, recordsWithFindings, recordsWithErrors
- `schema` object with per-content-type field comparisons
- `records` object with per-content-type arrays of record-level findings (only records with findings are listed individually; clean records are counted in summary)

**Markdown report (`data/audit-report.md`):**
- Title and generation timestamp
- Summary table (total records, fields, findings by category)
- Schema parity tables (one per content type showing every field with its Strapi 3 and Strapi 5 types)
- Records with ERROR findings (listed individually with field, expected value, actual value)
- Media migration summary table (counts by media type)
- Relation summary table (counts by relation type, missing/extra)
- Timestamp summary table (counts by content type, matching/mismatched)
- If zero ERRORs: a clear "AUDIT CLEAN" statement at the top

**Console output:**
Print a formatted summary similar to Phase 5's output style:

```
╔════════════════════════════════════════════╗
║  ResearchHub Migration Parity Audit        ║
╚════════════════════════════════════════════╝

  Schema parity .............. 3/3 content types compared
  Record parity .............. 307/307 records compared (8,750 fields)
  Media parity ............... 1,435 media references verified
  Relation parity ............ 487 relations verified (3 relation types)
  Timestamp parity ........... 307/307 timestamps match (±1s)

  Findings:
    ERROR .................... 0
    EXPECTED ................. 523
    INFO ..................... 1,842

  Result: AUDIT CLEAN — zero unexpected differences

  Full reports:
    JSON: data/audit-report.json
    Markdown: data/audit-report.md
```

If there are ERROR findings:

```
  Result: 3 ERROR findings — review required

  Errors:
    → article "507f1f77bcf86cd799439011" (Violent Crime Trends): title mismatch
    → dataset "60a8c9f2e4b0a12345678901" (UCR Data 2023): missing relation to article
    → app "60b9d0a3f5c1b23456789012" (Crime Dashboard): timestamp delta 45s
```

**Exit code:** 0 always (this is an audit, not a gate). The report documents findings; it does not block.

## Technical Requirements
- ES modules (import/export)
- Native fetch (Node 18+)
- fs/promises for file I/O
- `better-sqlite3` for SQLite (read-only mode: `new Database(path, { readonly: true })`)
- Runnable with `node scripts/06-audit.js`
- For media HEAD requests, use concurrency limit of 10 parallel requests
- Config values from `config.js`
- Handle null/undefined fields gracefully: null === null is a match, null !== "value" is a finding
- For JSON field comparison: use `JSON.stringify(sortObjectKeys(a)) === JSON.stringify(sortObjectKeys(b))` to handle key ordering differences
- Paginate all Strapi 5 REST queries (pageSize=100)
- Paginate all Strapi 3 GraphQL queries (start/limit=100)
- Produce clear, readable console output with progress indicators
- Never abort on individual record errors — collect all findings
````

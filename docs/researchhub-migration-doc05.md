# Doc 05 — Phase 5: Validation & Reconciliation

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 5 of 5  
**Depends on:** Phase 4 complete (all content loaded, relations linked, timestamps restored)  
**Produces:** Validation report confirming migration integrity  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Run a comprehensive set of automated checks to verify that the migration from Strapi 3 to Strapi 5 is complete and correct. This covers record counts, field content integrity, media accessibility, relation correctness, timestamp preservation, and zero Base64 remnants. The output is a validation report that either confirms the migration is clean or lists every discrepancy requiring attention.

---

## 2. Prerequisites

- Phase 4 complete: Strapi 5 is fully populated with all content, relations, and corrected timestamps.
- Strapi 3 running at `http://localhost:1337` (needed for comparison queries).
- Strapi 5 running at `http://localhost:1338` (restarted after timestamp restoration).
- All ID maps exist: `data/maps/articles.json`, `data/maps/datasets.json`, `data/maps/apps.json`, `data/maps/media.json`.
- Raw extraction data still available: `data/raw/articles.json`, `data/raw/datasets.json`, `data/raw/apps.json`.
- Transformed data still available: `data/transformed/articles.json`, `data/transformed/datasets.json`, `data/transformed/apps.json`.

---

## 3. Inputs / Outputs

### Inputs

| Input | Location | Description |
|-------|----------|-------------|
| Strapi 3 GraphQL/REST API | `http://localhost:1337` | Source of truth for comparison |
| Strapi 5 REST API | `http://localhost:1338/api/` | Migration target to validate |
| Strapi 5 SQLite DB | `strapi5-project/.tmp/data.db` | Direct access for timestamp checks |
| Raw extraction data | `data/raw/*.json` | Original Strapi 3 data |
| Transformed data | `data/transformed/*.json` | Expected Strapi 5 data |
| ID maps | `data/maps/*.json` | Legacy → Strapi 5 ID mappings |

### Outputs

| Output | Location | Description |
|--------|----------|-------------|
| Validation report | `data/validation-report.json` | Full results of all checks |
| Validation summary | Console output | Pass/fail summary with counts |

---

## 4. Validation Checks

### Check 1: Record Counts

Compare total record counts between Strapi 3 and Strapi 5 for each content type.

**Strapi 3 counts:**
```
GET http://localhost:1337/articles/count
GET http://localhost:1337/datasets/count
GET http://localhost:1337/apps/count
```

**Strapi 5 counts:**
```
GET http://localhost:1338/api/articles?pagination[pageSize]=1 → meta.pagination.total
GET http://localhost:1338/api/datasets?pagination[pageSize]=1 → meta.pagination.total
GET http://localhost:1338/api/apps?pagination[pageSize]=1 → meta.pagination.total
```

**Pass criteria:** All counts match exactly.

**Output:**
```json
{
  "check": "record_counts",
  "status": "PASS",
  "details": {
    "articles": { "strapi3": 250, "strapi5": 250, "match": true },
    "datasets": { "strapi3": 42, "strapi5": 42, "match": true },
    "apps": { "strapi3": 15, "strapi5": 15, "match": true }
  }
}
```

---

### Check 2: Legacy ID Coverage

Verify that every Strapi 3 record has a corresponding `legacyId` in Strapi 5.

For each content type, fetch all `legacyId` values from Strapi 5 and compare against the `id` values in the raw extraction data.

**Strapi 5 query (paginated):**
```
GET http://localhost:1338/api/articles?fields[0]=legacyId&pagination[pageSize]=100&pagination[page]=1
```

**Pass criteria:** Every Strapi 3 `id` appears exactly once as a `legacyId` in Strapi 5. No orphans in either direction.

**Output:**
```json
{
  "check": "legacy_id_coverage",
  "status": "PASS",
  "details": {
    "articles": { "strapi3Count": 250, "strapi5LegacyIds": 250, "missing": [], "orphaned": [] },
    "datasets": { "strapi3Count": 42, "strapi5LegacyIds": 42, "missing": [], "orphaned": [] },
    "apps": { "strapi3Count": 15, "strapi5LegacyIds": 15, "missing": [], "orphaned": [] }
  }
}
```

---

### Check 3: Zero Base64 Remnants

Scan all text/markdown fields in Strapi 5 for any remaining `data:image/` strings.

Fetch all articles from Strapi 5 (paginated) and check the `body` field and any other text fields for the substring `data:image/`.

**Pass criteria:** Zero matches across all records.

**Output:**
```json
{
  "check": "zero_base64_remnants",
  "status": "PASS",
  "details": {
    "articlesScanned": 250,
    "fieldsScanned": ["body"],
    "remnantsFound": 0,
    "affectedArticles": []
  }
}
```

If any remnants are found, list the article `legacyId` and the field name.

---

### Check 4: Splash Image Migration

Verify that every article that had a Base64 splash image in Strapi 3 now has a media relation in Strapi 5.

**Method:**
1. Read `data/raw/articles.json` — identify articles where `splash` is non-null and non-empty.
2. For each such article, fetch from Strapi 5 with `?populate=splash`.
3. Verify the `splash` field returns a media object (not null).

**Pass criteria:** Every article that had a splash image in Strapi 3 has a media relation in Strapi 5. Articles that had no splash should have `splash: null` in Strapi 5.

**Output:**
```json
{
  "check": "splash_image_migration",
  "status": "PASS",
  "details": {
    "articlesWithSplashInStrapi3": 230,
    "articlesWithSplashInStrapi5": 230,
    "missingInStrapi5": [],
    "unexpectedInStrapi5": []
  }
}
```

---

### Check 5: Dataset File Migration

Verify that every dataset with a `datafile` in Strapi 3 has a media relation in Strapi 5.

**Method:** Same pattern as Check 4 but for datasets and the `datafile` field.

**Pass criteria:** All dataset file references intact.

---

### Check 6: Media Accessibility

Verify that every media file in Strapi 5 is actually accessible via HTTP.

**Method:**
1. Read `data/maps/media.json` — get all `strapi5Url` values.
2. For each URL, `HEAD http://localhost:1338{url}`.
3. Check for HTTP 200 and a valid content-type header.

**Pass criteria:** All media URLs return 200.

**Output:**
```json
{
  "check": "media_accessibility",
  "status": "PASS",
  "details": {
    "totalMediaFiles": 452,
    "accessible": 452,
    "inaccessible": 0,
    "failures": []
  }
}
```

---

### Check 7: Relation Integrity

Verify that many-to-many relations between articles and datasets/apps are correct.

**Method:**
1. For a sample of articles (all articles, or at least 25%), fetch from Strapi 5 with `?populate=datasets,apps`.
2. Compare the related entry `legacyId` values against `_relatedDatasetIds` and `_relatedAppIds` in the transformed data.

**Pass criteria:** For every sampled article, the set of related dataset/app `legacyId` values in Strapi 5 matches the set of `_relatedDatasetIds` / `_relatedAppIds` from the transformed data.

**Output:**
```json
{
  "check": "relation_integrity",
  "status": "PASS",
  "details": {
    "articlesSampled": 250,
    "relationsChecked": 487,
    "correctRelations": 487,
    "missingRelations": [],
    "extraRelations": []
  }
}
```

---

### Check 8: Timestamp Preservation

Verify that `createdAt` and `updatedAt` in Strapi 5 match the original Strapi 3 values.

**Method:**
1. Open the Strapi 5 SQLite database.
2. For each content type, join the transformed data (with `_originalCreatedAt` / `_originalUpdatedAt`) against the Strapi 5 records (by `document_id` via the ID map).
3. Compare timestamps. Allow a tolerance of ±1 second for rounding differences.

**Pass criteria:** All timestamps match within tolerance.

**Output:**
```json
{
  "check": "timestamp_preservation",
  "status": "PASS",
  "details": {
    "recordsChecked": 307,
    "matches": 307,
    "mismatches": 0,
    "mismatchDetails": []
  }
}
```

---

### Check 9: Content Integrity (Spot Check)

For a random sample of 10% of articles, compare key fields between Strapi 3 and Strapi 5 to verify content wasn't corrupted during migration.

**Method:**
1. Select a random 10% sample of articles.
2. For each, fetch the full record from both Strapi 3 (GraphQL) and Strapi 5 (REST with `?populate=*`).
3. Compare `title`, `slug`, and the length of `body` (exact body comparison is tricky due to the Base64 → URL rewrite, but length should be shorter in Strapi 5 since URLs are shorter than Base64 strings).

**Pass criteria:** `title` and `slug` match exactly. `body` length in Strapi 5 is less than or equal to Strapi 3 (Base64 replaced by shorter URLs).

---

### Check 10: No Duplicate Records

Verify no content type has duplicate entries.

**Method:** Query the SQLite database directly:

```sql
SELECT "legacyId", COUNT(*) as cnt 
FROM articles 
GROUP BY "legacyId" 
HAVING cnt > 1;
```

Repeat for datasets and apps.

**Pass criteria:** Zero rows returned for all three queries.

---

## 5. Validation Report Format

The complete report is saved as `data/validation-report.json`:

```json
{
  "generatedAt": "2026-03-15T16:00:00.000Z",
  "overallStatus": "PASS",
  "checksRun": 10,
  "checksPassed": 10,
  "checksFailed": 0,
  "checksWarned": 0,
  "checks": [
    { "check": "record_counts", "status": "PASS", "details": { ... } },
    { "check": "legacy_id_coverage", "status": "PASS", "details": { ... } },
    { "check": "zero_base64_remnants", "status": "PASS", "details": { ... } },
    { "check": "splash_image_migration", "status": "PASS", "details": { ... } },
    { "check": "dataset_file_migration", "status": "PASS", "details": { ... } },
    { "check": "media_accessibility", "status": "PASS", "details": { ... } },
    { "check": "relation_integrity", "status": "PASS", "details": { ... } },
    { "check": "timestamp_preservation", "status": "PASS", "details": { ... } },
    { "check": "content_integrity", "status": "PASS", "details": { ... } },
    { "check": "no_duplicates", "status": "PASS", "details": { ... } }
  ]
}
```

**Status values:**

- `PASS` — check succeeded, all criteria met
- `FAIL` — check found discrepancies that must be fixed
- `WARN` — check found minor issues that should be reviewed but may be acceptable

---

## 6. Console Output

The script prints a summary table at the end:

```
╔═══════════════════════════════════╗
║  ResearchHub Migration Validation ║
╚═══════════════════════════════════╝

  ✓ Record counts .............. PASS (250 articles, 42 datasets, 15 apps)
  ✓ Legacy ID coverage ......... PASS (307/307 mapped)
  ✓ Zero Base64 remnants ....... PASS (0 found in 250 articles)
  ✓ Splash image migration ..... PASS (230/230 migrated)
  ✓ Dataset file migration ..... PASS (38/38 migrated)
  ✓ Media accessibility ........ PASS (452/452 accessible)
  ✓ Relation integrity ......... PASS (487/487 correct)
  ✓ Timestamp preservation ..... PASS (307/307 match)
  ✓ Content integrity .......... PASS (25/25 spot checks passed)
  ✓ No duplicates .............. PASS (0 duplicates)

  Result: 10/10 checks passed — MIGRATION VALIDATED ✓

  Full report: data/validation-report.json
```

If any check fails:

```
  ✗ Media accessibility ........ FAIL (3 files inaccessible)
    → violent-crime-trends-2024-003.png: 404
    → old-report-splash.png: 404
    → dataset-file-2019.xlsx: 404

  Result: 9/10 checks passed, 1 FAILED — REVIEW REQUIRED

  Full report: data/validation-report.json
```

---

## 7. Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| Strapi 3 not accessible | Instance shut down after Phase 2 | Restart Strapi 3; it's needed for comparison counts and content spot checks |
| Strapi 5 not accessible | Not restarted after timestamp fix | Start Strapi 5: `cd strapi5-project && npm run develop` |
| SQLite database locked | Strapi 5 running while script accesses DB | Timestamp checks use read-only access; this should work even with Strapi 5 running |
| Timeout on media HEAD requests | Slow responses or many files | Increase timeout; batch checks with concurrency limit (e.g., 10 concurrent requests) |
| Pagination exhausted but count doesn't match | Strapi 5 pagination issue | Use SQLite direct query as fallback for counts |

---

## 8. Post-Validation Actions

### If All Checks Pass

1. The migration is considered complete.
2. Take a backup of the Strapi 5 SQLite database.
3. Update the ResearchHub frontend to point to the Strapi 5 API.
4. Run manual QA: browse the ResearchHub site and spot-check articles, images, datasets, and app links.
5. After a confidence period (e.g., 2 weeks), consider removing the `legacyId` field from Strapi 5 schemas if it's no longer needed. Or keep it permanently — it costs nothing.

### If Any Check Fails

1. Review the validation report details for each failed check.
2. Identify the root cause (Phase 3 rewrite issue, Phase 4 load issue, etc.).
3. Fix the issue in the appropriate phase script.
4. Re-run from the failing phase forward. The idempotent design (`legacyId` checks, media duplicate detection) makes partial re-runs safe.
5. Re-run validation.

---

## 9. Migration Sign-Off Checklist

This is the final checklist before the migration is considered complete and the frontend is switched to Strapi 5. Every item must pass.

### Automated Validation (all from `05-validate.js`)

- [ ] Check 1: Record counts — all 3 content types match between Strapi 3 and Strapi 5
- [ ] Check 2: Legacy ID coverage — every Strapi 3 ID maps to exactly one Strapi 5 record
- [ ] Check 3: Zero Base64 remnants — no `data:image/` strings in any Strapi 5 text field
- [ ] Check 4: Splash image migration — all articles with splash images have media relations
- [ ] Check 5: Dataset file migration — all datasets with files have media relations
- [ ] Check 6: Media accessibility — every media URL returns HTTP 200
- [ ] Check 7: Relation integrity — all m2m relations match between source and target
- [ ] Check 8: Timestamp preservation — all `createdAt`/`updatedAt` match originals (±1s)
- [ ] Check 9: Content integrity — title/slug exact match, body length plausible for sampled articles
- [ ] Check 10: No duplicates — zero duplicate `legacyId` values in any table
- [ ] `data/validation-report.json` shows `overallStatus: "PASS"` and `checksFailed: 0`
- [ ] `05-validate.js` exits with code 0

### Manual QA (Human Verification)

- [ ] Browse ResearchHub frontend pointed at Strapi 5 — homepage loads correctly
- [ ] Open 5 articles with known splash images — hero images render correctly
- [ ] Open 5 articles with known inline images — all inline images render in the body
- [ ] Open 3 articles with known dataset relations — "Related Datasets" links work
- [ ] Open 3 articles with known app/dashboard relations — dashboard links work
- [ ] Download 3 dataset Excel files — files download and open correctly
- [ ] Check 3 app/dashboard links — external Tableau/ShinyProxy URLs resolve
- [ ] Verify article publication dates display correctly (not migration date)
- [ ] Search or browse for an article known to be the oldest — confirm date is historic
- [ ] Check the Strapi 5 admin panel — can browse, search, and edit content without errors

### Deployment Readiness

- [ ] Strapi 5 SQLite database backed up (`cp data.db data.db.bak`)
- [ ] Frontend configuration updated to point to Strapi 5 API (`:1338` or production URL)
- [ ] Strapi 5 production environment configured (API tokens, CORS, upload settings)
- [ ] DNS/proxy routing updated if applicable
- [ ] Rollback plan documented: if issues found post-deploy, revert frontend to Strapi 3 while investigating

### Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Developer | | | [ ] |
| QA / Reviewer | | | [ ] |
| Project Lead | | | [ ] |

---

## 10. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

````
You are building Phase 5 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub migrated 3 content types from Strapi 3 (MongoDB) to Strapi 5 (SQLite):
- `article` (~250 records) — has `splash` (media field), `body` (markdown), m2m relations to datasets and apps
- `dataset` (~42 records) — has `datafile` (media field for Excel files)
- `app` (~15 records) — flat data (title, summary, url)

All content types have a `legacyId` field storing the original Strapi 3 MongoDB ObjectId.
Articles have m2m relations: `datasets` and `apps`.

Strapi 3: http://localhost:1337
Strapi 5: http://localhost:1338, API token in `config.js` as `strapi5Token`
Strapi 5 SQLite: path in `config.js` as `strapi5DbPath`

Available data files:
- `data/raw/articles.json`, `data/raw/datasets.json`, `data/raw/apps.json` (original Strapi 3 data)
- `data/transformed/articles.json`, `data/transformed/datasets.json`, `data/transformed/apps.json` (expected Strapi 5 data, with `_originalCreatedAt`, `_originalUpdatedAt`, `_relatedDatasetIds`, `_relatedAppIds`)
- `data/maps/articles.json`, `data/maps/datasets.json`, `data/maps/apps.json` (legacyId → strapi5DocumentId)
- `data/maps/media.json` (filename → strapi5MediaId, strapi5Url)

## Your Task

Create one script:

### `scripts/05-validate.js`

Runs 10 validation checks in sequence and produces a report:

**Check 1: Record counts** — Compare counts between Strapi 3 REST (`/articles/count`) and Strapi 5 REST (`/api/articles?pagination[pageSize]=1` → meta.pagination.total) for all 3 types.

**Check 2: Legacy ID coverage** — Fetch all legacyIds from Strapi 5 (paginated), compare against ids in `data/raw/*.json`. Report any missing or orphaned.

**Check 3: Zero Base64 remnants** — Fetch all article bodies from Strapi 5 (paginated, `fields[0]=body`), search each for `data:image/`. Report any matches.

**Check 4: Splash image migration** — Identify articles with non-null `splash` in `data/raw/articles.json`. Fetch those articles from Strapi 5 with `?populate=splash`. Verify splash is a media object (not null).

**Check 5: Dataset file migration** — Same pattern for datasets and `datafile` field.

**Check 6: Media accessibility** — For every URL in `data/maps/media.json`, send `HEAD http://localhost:1338{url}`. Check for HTTP 200.

**Check 7: Relation integrity** — For all articles, fetch from Strapi 5 with `?populate[datasets][fields][0]=legacyId&populate[apps][fields][0]=legacyId`. Compare related legacyIds against `_relatedDatasetIds` and `_relatedAppIds` in transformed data.

**Check 8: Timestamp preservation** — Open SQLite database (read-only). For each content type, compare `created_at` and `updated_at` values against `_originalCreatedAt`/`_originalUpdatedAt` from transformed data. Allow ±1 second tolerance.

**Check 9: Content integrity** — Select random 10% of articles. Fetch from both Strapi 3 (GraphQL) and Strapi 5 (REST). Compare `title` and `slug` exactly. Verify `body` length in Strapi 5 ≤ Strapi 3 (Base64 replaced by shorter URLs).

**Check 10: No duplicates** — Query SQLite: `SELECT legacyId, COUNT(*) FROM {table} GROUP BY legacyId HAVING COUNT(*) > 1` for all 3 types.

**Output:**
- Save full report to `data/validation-report.json` with status (PASS/FAIL/WARN) per check and overall
- Print a formatted summary table to console with ✓/✗ indicators
- Exit 0 if all pass, exit 1 if any fail

## Technical Requirements
- ES modules (import/export)
- Native fetch (Node 18+)
- fs/promises for file I/O
- `better-sqlite3` for SQLite (read-only mode)
- Runnable with `node scripts/05-validate.js`
- For media accessibility checks, use concurrency limit of 10 parallel HEAD requests
- Config values from `config.js`
- Produce clear, readable console output with progress indicators
````

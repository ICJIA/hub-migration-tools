# Doc 04 — Phase 4: Data Loading & Timestamp Restoration

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 4 of 5  
**Depends on:** Phase 3 complete (all media uploaded, all content transformed)  
**Produces:** Fully populated Strapi 5 instance with all content, relations, and correct timestamps  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Load all transformed content into Strapi 5 via the REST API in the correct dependency order, link many-to-many relations between articles, datasets, and apps (a relation triangle), and restore original `createdAt`/`updatedAt` timestamps via direct SQLite updates. At the end of this phase, Strapi 5 contains all ResearchHub data with intact relations and audit timestamps.

---

## 2. Prerequisites

- Phase 3 complete: `data/transformed/articles.json`, `data/transformed/datasets.json`, `data/transformed/apps.json` exist with all media references resolved.
- `data/maps/media.json` exists (media ID mappings from Phase 3).
- Strapi 5 running at `http://localhost:1338` with full-access API token.
- Strapi 5 SQLite database file location known (typically `strapi5-project/.tmp/data.db` or `strapi5-project/database/data.db`).
- `better-sqlite3` npm package installed in the migration project (for timestamp restoration).

---

## 3. Inputs / Outputs

### Inputs

| Input | Location | Description |
|-------|----------|-------------|
| Transformed articles | `data/transformed/articles.json` | Articles with media IDs, rewritten markdown, legacy IDs |
| Transformed datasets | `data/transformed/datasets.json` | Datasets with updated media references |
| Transformed apps | `data/transformed/apps.json` | Apps ready for direct loading |
| Media map | `data/maps/media.json` | Image/file → Strapi 5 media ID |
| Strapi 5 REST API | `http://localhost:1338/api/` | Target for content creation |
| Strapi 5 SQLite DB | `strapi5-project/.tmp/data.db` | Direct access for timestamp fixes |

### Outputs

| Output | Location | Description |
|--------|----------|-------------|
| App ID map | `data/maps/apps.json` | Strapi 3 ObjectId → Strapi 5 documentId |
| Dataset ID map | `data/maps/datasets.json` | Strapi 3 ObjectId → Strapi 5 documentId |
| Article ID map | `data/maps/articles.json` | Strapi 3 ObjectId → Strapi 5 documentId |
| Load report | `data/load-report.json` | Summary of created/skipped/failed records |

---

## 4. Step-by-Step Procedure

### Step 4a: Load Datasets (No Outbound Relations)

**Script:** `scripts/04-load.js`

> **Note on publish state:** All content type schemas set `draftAndPublish: false`. Verify during Phase 1 that entries created via the API are immediately visible at the public REST endpoint. If Strapi 5 requires entries to be explicitly published even with `draftAndPublish: false`, the POST payloads will need to include `publishedAt` with a timestamp value.

Datasets go first because they have no outbound dominant relations — only media (`datafile`), which was already uploaded in Phase 3. The `datafile` field in the transformed data is already a Strapi 5 media ID.

For each dataset in `data/transformed/datasets.json`:

**1. Check for duplicates.** Query Strapi 5:

```
GET http://localhost:1338/api/datasets?filters[legacyId][$eq]={legacyId}
```

If a record with this `legacyId` already exists, skip it and log the existing `documentId` to the ID map.

**2. Create the entry.** POST to Strapi 5:

```
POST http://localhost:1338/api/datasets
Content-Type: application/json
Authorization: Bearer {API_TOKEN}

{
  "data": {
    "legacyId": "60b8d295f1d2c72a4c9e1234",
    "title": "Illinois Crime Statistics 2023",
    "status": "published",
    "slug": "illinois-crime-statistics-2023",
    "date": "2023-06-15",
    "external": false,
    "categories": ["crime", "justice"],
    "tags": ["illinois", "annual"],
    "project": true,
    "sources": [{"name": "ISP", "url": "https://isp.illinois.gov"}],
    "unit": "county",
    "timeperiod": {"start": 2010, "end": 2023},
    "description": "Annual crime data compiled from...",
    "notes": ["Excludes federal offenses"],
    "variables": [{"name": "offense_type", "type": "string"}],
    "funding": "Bureau of Justice Statistics",
    "citation": "ICJIA, Illinois Crime Statistics 2023",
    "datafile": 88
  }
}
```

The `datafile: 88` is the Strapi 5 media ID. Strapi 5's REST API accepts an integer media ID to set a media relation field.

Note: Relations (`articles`, `apps`) are NOT included in the initial create. They are the non-dominant sides and will be linked from the dominant side in Step 4d.

**3. Capture the response.** Record the mapping:

```json
{
  "60b8d295f1d2c72a4c9e1234": {
    "strapi5Id": 1,
    "strapi5DocumentId": "abc123def456",
    "legacyId": "60b8d295f1d2c72a4c9e1234"
  }
}
```

Save to `data/maps/datasets.json` after all datasets are loaded.

---

### Step 4b: Load Apps (Depends on Datasets)

Apps are dominant on both `app↔dataset` and `app↔article` relations. They need datasets loaded first (for later linking) and have an `image` media field. Relations are NOT included in the initial create — they are linked in Step 4d.

For each app in `data/transformed/apps.json`:

**1. Duplicate check** (same as datasets — query by `legacyId`).

**2. Create the entry:**

```json
{
  "data": {
    "legacyId": "60b8d295f1d2c72a4c9eabcd",
    "title": "Illinois Sentence Policy Dashboard",
    "status": "published",
    "slug": "illinois-sentence-policy-dashboard",
    "date": "2024-01-10",
    "external": true,
    "categories": ["sentencing", "policy"],
    "tags": ["dashboard", "tableau"],
    "contributors": ["John Doe", "Jane Smith"],
    "image": 55,
    "description": "Interactive visualization of sentencing data across Illinois counties...",
    "url": "https://public.tableau.com/views/SentencingDashboard",
    "funding": "MacArthur Foundation",
    "citation": "ICJIA, Sentence Policy Dashboard, 2024"
  }
}
```

Note: The field is `description` (not `summary`). The `image` field is a Strapi 5 media ID (integer). Relations (`datasets`, `articles`) are NOT included — they are linked in Step 4d.

**3. Capture and save** to `data/maps/apps.json`.

---

### Step 4c: Load Articles (Depends on Datasets + Apps)

Articles depend on datasets and apps for relation linking. They also have multiple media fields (`splash`, `thumbnail`, `mainfile`, `extrafile`), all already resolved as Strapi 5 media IDs. Relations are NOT included in the initial create.

For each article in `data/transformed/articles.json`:

**1. Duplicate check** (query by `legacyId`).

**2. Create the entry (without relations):**

```json
{
  "data": {
    "legacyId": "507f1f77bcf86cd799439011",
    "title": "Violent Crime Trends 2024",
    "status": "published",
    "slug": "violent-crime-trends-2024",
    "date": "2024-03-15",
    "external": false,
    "categories": ["crime", "research"],
    "tags": ["violence", "trends"],
    "authors": ["Dr. Alice Johnson"],
    "splash": 42,
    "thumbnail": 43,
    "images": ["/uploads/chart1.png", "/uploads/chart2.png"],
    "abstract": "This report examines violent crime trends across Illinois...",
    "markdown": "# Introduction\n\nThis report examines...\n\n![Chart](/uploads/violent-crime-trends-2024-001.jpg)\n\n...",
    "mainfiletype": "pdf",
    "funding": "ICJIA",
    "citation": "Johnson, A. (2024). Violent Crime Trends.",
    "doi": "10.1234/icjia.2024.001",
    "mainfile": 44,
    "extrafile": 45,
    "hideFromBanner": false
  }
}
```

Note: The content field is `markdown` (not `body`). Relations (`datasets`, `apps`) are NOT included in the initial create. They are linked in Step 4d after all content types exist. The `splash`, `thumbnail`, `mainfile`, and `extrafile` fields are Strapi 5 media IDs (integers).

**3. Capture and save** to `data/maps/articles.json`.

---

### Step 4d: Link Relations (Relation Triangle)

**Script:** `scripts/04b-link-relations.js`

After all content types are loaded, link the many-to-many relations. The relation graph forms a **triangle** — three sets of relations must be linked:

1. **Article → datasets** — article is dominant (`dominant: true` in article schema)
2. **App → articles** — app is dominant (`dominant: true` in app schema)
3. **App → datasets** — app is dominant (`dominant: true` in app schema)

Relations must be linked from the **dominant side** using the `connect` syntax.

**Pass 1: Link article → datasets**

For each article in `data/transformed/articles.json`:

1. Read `_relatedDatasetIds` — array of Strapi 3 ObjectIds.
2. Look up each ObjectId in `data/maps/datasets.json` to get the Strapi 5 `documentId`.
3. Update the article in Strapi 5:

```
PUT http://localhost:1338/api/articles/{documentId}
Content-Type: application/json
Authorization: Bearer {API_TOKEN}

{
  "data": {
    "datasets": {
      "connect": [
        { "documentId": "strapi5-dataset-doc-id-1" },
        { "documentId": "strapi5-dataset-doc-id-2" }
      ]
    }
  }
}
```

**Pass 2: Link app → articles and app → datasets**

For each app in `data/transformed/apps.json`:

1. Read `_relatedArticleIds` — array of Strapi 3 ObjectIds.
2. Look up each ObjectId in `data/maps/articles.json` to get the Strapi 5 `documentId`.
3. Read `_relatedDatasetIds` — same process with `data/maps/datasets.json`.
4. Update the app in Strapi 5:

```
PUT http://localhost:1338/api/apps/{documentId}
Content-Type: application/json
Authorization: Bearer {API_TOKEN}

{
  "data": {
    "articles": {
      "connect": [
        { "documentId": "strapi5-article-doc-id-1" }
      ]
    },
    "datasets": {
      "connect": [
        { "documentId": "strapi5-dataset-doc-id-1" },
        { "documentId": "strapi5-dataset-doc-id-2" }
      ]
    }
  }
}
```

Note: `article.apps` is the NON-dominant side of the article↔app relation. Linking must happen from the app side (`app.articles` is dominant). Similarly, `dataset.apps` is non-dominant; linking happens from `app.datasets`.

Strapi 5's REST API uses the `connect` syntax for relation management. This adds relations without removing any existing ones.

**Handling missing relations:** If a related ID doesn't exist in the corresponding ID map (the referenced record wasn't migrated for some reason), log a warning and skip that relation. Don't fail the entire record.

**Console output:**
```
Linking article → dataset relations for 250 articles...
  Article 1/250: violent-crime-trends-2024 — 2 datasets ✓
  Article 2/250: recidivism-study-2023 — 0 datasets (no relations)
  ...
  Article 87/250: old-report — WARNING: dataset 60b8d295... not found in map, skipping
  ...
Article → dataset relations: 250 articles processed, 1 warning

Linking app → article and app → dataset relations for 15 apps...
  App 1/15: illinois-sentence-policy-dashboard — 3 articles, 2 datasets ✓
  App 2/15: recidivism-tracker — 1 article, 1 dataset ✓
  ...
App relations: 15 apps processed, 0 warnings

All relations linked: 250 articles + 15 apps processed, 1 total warning
```

---

### Step 4e: Restore Timestamps

**Script:** `scripts/04c-fix-timestamps.js`

After all content is loaded via the API, directly update the SQLite database to restore original `createdAt` and `updatedAt` values.

**1. Stop Strapi 5** (or at minimum, ensure no writes are happening). The SQLite file should not be written to by two processes simultaneously.

> **Important — column and table name verification:** Before running any SQL queries, verify actual names with:
> ```sql
> SELECT name FROM sqlite_master WHERE type='table';
> PRAGMA table_info(articles);  -- or whatever the actual table name is
> ```
> Strapi 5 typically uses plural table names (e.g., `articles`, `datasets`, `apps`) from the schema's `pluralName`, and snake_case column names (e.g., `legacy_id` for `legacyId`, `document_id` for `documentId`, `created_at`/`updated_at`). The examples in this document use the expected names but they MUST be verified against the actual database before running migration scripts.

**2. Open the SQLite database:**

```javascript
import Database from 'better-sqlite3';

const db = new Database('/path/to/strapi5-project/.tmp/data.db');
```

**3. For each content type, update timestamps:**

The source data uses camelCase field names (`createdAt`, `updatedAt`) while the SQLite columns use snake_case (`created_at`, `updated_at`). The transformed data stores the originals as `_originalCreatedAt` and `_originalUpdatedAt`.

```javascript
const updateStmt = db.prepare(`
  UPDATE article
  SET created_at = ?, updated_at = ?
  WHERE document_id = ?
`);

const articlesMap = JSON.parse(await fs.readFile('data/maps/articles.json', 'utf8'));
const transformedArticles = JSON.parse(await fs.readFile('data/transformed/articles.json', 'utf8'));

for (const article of transformedArticles) {
  const mapping = articlesMap[article.legacyId];
  if (!mapping) continue;

  updateStmt.run(
    article._originalCreatedAt,
    article._originalUpdatedAt,
    mapping.strapi5DocumentId
  );
}
```

Repeat for `dataset` and `app` tables.

**4. Verify a sample:**

```javascript
const sample = db.prepare(`
  SELECT document_id, created_at, updated_at
  FROM article
  LIMIT 5
`).all();
console.log('Sample timestamps:', sample);
```

**5. Close the database and restart Strapi 5.**

**Timestamp format:** Strapi 5 with SQLite stores timestamps as ISO 8601 strings (e.g., `"2024-03-15T10:30:00.000Z"`). The transform step should have already normalized Strapi 3 timestamps to this format. If Strapi 3 used a different format (Unix timestamp, non-UTC timezone), the transform step must convert.

**Table name mapping:** The actual Strapi 3 `collectionName` values are **singular**: `article`, `dataset`, `app`. Strapi 5 may follow the same convention. Check with:

```sql
SELECT name FROM sqlite_master WHERE type='table';
```

The script should verify the actual table names before running updates — look for `article`/`dataset`/`app` (singular, matching the `collectionName` from the Strapi 3 schemas).

**Column name for document ID:** The column is typically `document_id` in the SQLite table. Verify with:

```sql
PRAGMA table_info(article);
```

**Console output:**
```
Restoring timestamps in Strapi 5 SQLite database...
  Updating article: 250 records
  Updating dataset: 42 records
  Updating app: 15 records
Timestamp restoration complete: 307 records updated
Sample verification:
  article.document_id=abc123 → created_at=2024-03-15T10:30:00.000Z ✓
  article.document_id=def456 → created_at=2023-11-01T09:00:00.000Z ✓
```

---

## 5. Load Order Summary

```
Step 4a: Load datasets      → data/maps/datasets.json
Step 4b: Load apps          → data/maps/apps.json
Step 4c: Load articles      → data/maps/articles.json
Step 4d: Link relations     (triangle: article→datasets, app→articles, app→datasets)
Step 4e: Fix timestamps     (direct SQLite, Strapi 5 stopped)
```

Each step is independently re-runnable due to `legacyId` duplicate detection. If the load crashes at Step 4c after 100 articles, re-running starts from article 101 (the first 100 are skipped because their `legacyId` already exists).

---

## 6. Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| Strapi 5 API returns 400 on create | Invalid field value, missing required field, or payload format issue | Log the full request payload and response body; fix the transformed data and re-run |
| Strapi 5 API returns 403 | API token doesn't have write permissions | Check token permissions in Strapi 5 admin → Settings → API Tokens |
| Duplicate `legacyId` detected | Script re-run after partial completion | Expected behavior — script skips existing records |
| Relation target not found during linking | Referenced dataset/app wasn't migrated | Log warning with missing legacy ID; skip that relation |
| SQLite database locked | Strapi 5 is still running during timestamp fix | Stop Strapi 5 before running `04c-fix-timestamps.js` |
| SQLite table name doesn't match expected | Strapi 5 uses different `collectionName` | Query `sqlite_master` for actual table names; update script accordingly |
| Timestamp format rejected by SQLite | Non-ISO-8601 format from Strapi 3 | Normalize in transform step; re-run Phase 3d/3e if needed |
| Media relation rejected (splash field) | Media ID doesn't exist in Strapi 5 | Check `data/maps/media.json` for the expected ID; verify media was uploaded in Phase 3 |

---

## 7. Verification

| Check | Method | Pass Criteria |
|-------|--------|--------------|
| All datasets loaded | Count in Strapi 5 API: `GET /api/datasets?pagination[pageSize]=1` → `meta.pagination.total` | Matches raw count |
| All apps loaded | Same pattern for apps | Matches raw count |
| All articles loaded | Same pattern for articles | Matches raw count |
| Legacy IDs populated | `GET /api/articles?fields[0]=legacyId&pagination[pageSize]=5` | Every record has a `legacyId` |
| Splash images linked | Spot check 10 articles: `GET /api/articles/{docId}?populate=splash` | `splash` field returns media object (not null, not Base64) |
| Thumbnails linked | Spot check 10 articles: `GET /api/articles/{docId}?populate=thumbnail` | `thumbnail` field returns media object where expected |
| App images linked | Spot check 10 apps: `GET /api/apps/{docId}?populate=image` | `image` field returns media object where expected |
| Dataset files linked | Spot check 10 datasets: `GET /api/datasets/{docId}?populate=datafile` | `datafile` returns media object |
| Article mainfile/extrafile linked | Spot check articles: `GET /api/articles/{docId}?populate=mainfile,extrafile` | `mainfile`/`extrafile` return media objects where expected |
| Article → dataset relations | Spot check 10 articles: `GET /api/articles/{docId}?populate=datasets` | `datasets` array contains expected entries |
| App → article relations | Spot check 10 apps: `GET /api/apps/{docId}?populate=articles` | `articles` array contains expected entries |
| App → dataset relations | Spot check 10 apps: `GET /api/apps/{docId}?populate=datasets` | `datasets` array contains expected entries |
| Article `markdown` field | Spot check 10 articles: `GET /api/articles/{docId}?fields[0]=markdown` | `markdown` field contains content (not null/empty) |
| Timestamps correct | Query SQLite directly: `SELECT created_at FROM article LIMIT 10` | Dates are historic (not migration day) |
| No duplicate records | `SELECT legacyId, COUNT(*) FROM article GROUP BY legacyId HAVING COUNT(*) > 1` | Zero rows returned (repeat for `dataset`, `app`) |

---

## 8. Phase 4 Completion Checklist

Before proceeding to Phase 5 (final validation), every item below must pass. A dedicated `scripts/04-verify.js` script should automate all **(auto)** checks. Run this script **after restarting Strapi 5** following the timestamp fix.

### Automated Gate Checks (`scripts/04-verify.js`)

**Record Loading:**

- [ ] **(auto)** Strapi 5 article count (`GET /api/articles?pagination[pageSize]=1` → `meta.pagination.total`) matches raw extraction count
- [ ] **(auto)** Strapi 5 dataset count matches raw extraction count
- [ ] **(auto)** Strapi 5 app count matches raw extraction count
- [ ] **(auto)** ID maps exist and are complete: `data/maps/articles.json`, `data/maps/datasets.json`, `data/maps/apps.json`
- [ ] **(auto)** Every record in transformed data has a corresponding entry in its ID map
- [ ] **(auto)** No duplicate `legacyId` values in Strapi 5 (SQLite query: `SELECT legacyId, COUNT(*) ... HAVING COUNT(*) > 1` returns 0 rows for all 3 tables)
- [ ] **(auto)** Every Strapi 5 record has a non-null `legacyId` (`GET /api/articles?fields[0]=legacyId` — paginate through all, verify none are null)

**Media Relations:**

- [ ] **(auto)** Spot check 10 articles with known splash images: `GET /api/articles/{docId}?populate=splash` returns a media object
- [ ] **(auto)** Spot check 10 articles with known thumbnails: `GET /api/articles/{docId}?populate=thumbnail` returns a media object
- [ ] **(auto)** Spot check articles with known mainfile/extrafile: `GET /api/articles/{docId}?populate=mainfile,extrafile` returns media objects
- [ ] **(auto)** Spot check 10 apps with known images: `GET /api/apps/{docId}?populate=image` returns a media object
- [ ] **(auto)** Spot check 10 datasets with known datafiles: `GET /api/datasets/{docId}?populate=datafile` returns a media object
- [ ] **(auto)** Count of articles with non-null `splash` in Strapi 5 matches count of articles with non-null splash in raw data

**Relations (Triangle):**

- [ ] **(auto)** For all articles with `_relatedDatasetIds`: fetch from Strapi 5 with `?populate[datasets][fields][0]=legacyId`
- [ ] **(auto)** Related dataset `legacyId` sets in Strapi 5 match `_relatedDatasetIds` from transformed article data
- [ ] **(auto)** For all apps with `_relatedArticleIds`: fetch from Strapi 5 with `?populate[articles][fields][0]=legacyId`
- [ ] **(auto)** Related article `legacyId` sets in Strapi 5 match `_relatedArticleIds` from transformed app data
- [ ] **(auto)** For all apps with `_relatedDatasetIds`: fetch from Strapi 5 with `?populate[datasets][fields][0]=legacyId`
- [ ] **(auto)** Related dataset `legacyId` sets in Strapi 5 match `_relatedDatasetIds` from transformed app data
- [ ] **(auto)** No orphaned relations (related entries that don't exist)
- [ ] **(auto)** `data/load-report.json` exists with summary of created/skipped/failed counts

**Timestamps:**

- [ ] **(auto)** For all records in all 3 content types: `created_at` in SQLite matches `_originalCreatedAt` from transformed data (±1 second tolerance)
- [ ] **(auto)** For all records: `updated_at` in SQLite matches `_originalUpdatedAt` (±1 second tolerance)
- [ ] **(auto)** No record has `created_at` equal to the migration run date (would indicate the timestamp fix missed it)

### Parity Assertions

| Assertion | How to Verify |
|-----------|---------------|
| All records loaded | Strapi 5 counts = raw extraction counts for all 3 types |
| No records duplicated | SQLite `GROUP BY legacyId HAVING COUNT(*) > 1` returns 0 rows (tables: `article`, `dataset`, `app`) |
| All article→dataset relations intact | Sum of related datasets across all articles in Strapi 5 matches sum from transformed data |
| All app→article relations intact | Sum of related articles across all apps in Strapi 5 matches sum from transformed data |
| All app→dataset relations intact | Sum of related datasets across all apps in Strapi 5 matches sum from transformed data |
| Timestamps are historic | Sample 10 `created_at` values — all predate the migration run date |
| Media relations set correctly | Count of articles with non-null `splash`/`thumbnail`/`mainfile`/`extrafile` in Strapi 5 = count in raw data; count of apps with non-null `image` matches |
| ID maps are complete | Every transformed record's `legacyId` appears in the ID map |

### Recommended: `scripts/04-verify.js`

A standalone script that validates the full Phase 4 output:

```
node scripts/04-verify.js
```

This script should:
1. Verify Strapi 5 is running (poll REST API)
2. Check record counts via REST API
3. Check for duplicates via SQLite (tables: `article`, `dataset`, `app`)
4. Validate all relations: article→datasets, app→articles, app→datasets (relation triangle)
5. Validate timestamps by comparing SQLite `created_at`/`updated_at` against transformed data `_originalCreatedAt`/`_originalUpdatedAt`
6. Validate media relations (splash, thumbnail, mainfile, extrafile, image, datafile) for all records
7. Print pass/fail for each category (counts, duplicates, relations, timestamps, media)
8. Exit 0 if all pass, exit 1 if any fail

### Pre-Flight for Phase 5

Before running Phase 5 validation:

- [ ] Strapi 5 has been restarted after the timestamp fix (Step 4e)
- [ ] Strapi 3 is still running (Phase 5 needs it for cross-instance comparison)
- [ ] All `data/maps/` files are complete and up to date
- [ ] `04-verify.js` passed (no point running Phase 5 on known-broken data)

### Go / No-Go

**Go:** All counts match, zero duplicates, all relations correct, all timestamps restored, all media relations set.

**No-go:** Count mismatch (load script failed partway — re-run, it's idempotent), missing relations (re-run `04b-link-relations.js`), wrong timestamps (re-run `04c-fix-timestamps.js` after stopping Strapi 5), duplicates found (investigate — may need to delete duplicates manually or wipe and re-load).

---

## 9. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

````
You are building Phase 4 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub has 3 content types: `article`, `dataset`, `app`.
Phase 3 has produced transformed JSON files ready for loading:
- `data/transformed/datasets.json` — records with `legacyId`, `title`, `status`, `slug`, `date`, `external`, `categories`, `tags`, `project`, `sources`, `unit`, `timeperiod`, `description`, `notes`, `variables`, `funding`, `citation`, media ID in `datafile` field, `_originalCreatedAt`, `_originalUpdatedAt`
- `data/transformed/apps.json` — records with `legacyId`, `title`, `status`, `slug`, `date`, `external`, `categories`, `tags`, `contributors`, media ID in `image` field, `description` (NOT summary), `url`, `funding`, `citation`, `_relatedArticleIds` (array of Strapi 3 ObjectIds), `_relatedDatasetIds` (array of Strapi 3 ObjectIds), `_originalCreatedAt`, `_originalUpdatedAt`
- `data/transformed/articles.json` — records with `legacyId`, `title`, `status`, `slug`, `date`, `external`, `categories`, `tags`, `authors`, media IDs in `splash`, `thumbnail`, `mainfile`, `extrafile` fields, `images`, `abstract`, rewritten `markdown` (NOT body), `mainfiletype`, `funding`, `citation`, `doi`, `hideFromBanner`, `_relatedDatasetIds` (array of Strapi 3 ObjectIds), `_originalCreatedAt`, `_originalUpdatedAt`

Strapi 5 runs at http://localhost:1338 with API token in `config.js` as `strapi5Token`.
Strapi 5 SQLite database path is in `config.js` as `strapi5DbPath`.

All content types have a `legacyId` field (string, unique) for duplicate detection.

The relation graph is a **triangle** with three many-to-many relations:
- Article → datasets (article is dominant)
- App → articles (app is dominant)
- App → datasets (app is dominant)

The `collectionName` for each type is singular: `article`, `dataset`, `app`.

## Your Task

Create three scripts:

### 1. `scripts/04-load.js`
Loads all content in dependency order:

**Step 1: Load datasets**
- For each dataset in `data/transformed/datasets.json`:
  - Check if `legacyId` already exists: `GET /api/datasets?filters[legacyId][$eq]={legacyId}`
  - If exists, skip and record existing documentId in map
  - If not, POST to `/api/datasets` with `{ data: { legacyId, title, status, slug, date, external, categories, tags, project, sources, unit, timeperiod, description, notes, variables, funding, citation, datafile } }`
  - `datafile` is an integer media ID
  - Do NOT include relations (`articles`, `apps`) or `_original*` fields in the API payload
  - Record legacyId → { strapi5Id, strapi5DocumentId } in map
- Save map to `data/maps/datasets.json`

**Step 2: Load apps**
- Same pattern as datasets
- POST to `/api/apps` with `{ data: { legacyId, title, status, slug, date, external, categories, tags, contributors, image, description, url, funding, citation } }`
- `image` is an integer media ID; `description` (NOT summary)
- Do NOT include relations (`datasets`, `articles`) or `_original*`/`_related*` fields
- Save map to `data/maps/apps.json`

**Step 3: Load articles**
- Same pattern
- POST to `/api/articles` with `{ data: { legacyId, title, status, slug, date, external, categories, tags, authors, splash, thumbnail, images, abstract, markdown, mainfiletype, funding, citation, doi, mainfile, extrafile, hideFromBanner } }`
- `splash`, `thumbnail`, `mainfile`, `extrafile` are integer media IDs; content field is `markdown` (NOT body)
- Do NOT include `datasets` or `apps` relations yet — those are linked in the next script
- Do NOT include `_relatedDatasetIds` or `_original*` fields
- Save map to `data/maps/articles.json`

Log progress throughout: "Loading apps: 1/15... 2/15... done. Loading datasets: 1/42..."

### 2. `scripts/04b-link-relations.js`
Links the relation triangle (three sets of many-to-many relations):

- Read all transformed data and all ID maps

**Pass 1: Article → datasets** (article is dominant)
- For each article in `data/transformed/articles.json`:
  - Translate `_relatedDatasetIds` (Strapi 3 ObjectIds) → Strapi 5 documentIds using the dataset map
  - PUT to `/api/articles/{documentId}` with `{ data: { datasets: { connect: [...] } } }`
  - Skip articles with no dataset relations
  - Warn (don't fail) if a related ID isn't found in the map

**Pass 2: App → articles and app → datasets** (app is dominant for both)
- For each app in `data/transformed/apps.json`:
  - Translate `_relatedArticleIds` → Strapi 5 documentIds using the article map
  - Translate `_relatedDatasetIds` → Strapi 5 documentIds using the dataset map
  - PUT to `/api/apps/{documentId}` with `{ data: { articles: { connect: [...] }, datasets: { connect: [...] } } }`
  - Skip apps with no relations
  - Warn (don't fail) if a related ID isn't found in the map

Note: `article.apps` is the NON-dominant side. Relations must be linked FROM the app side (`app.articles` is dominant). Same for `dataset.apps` — link from `app.datasets`.

- Log progress for both passes

### 3. `scripts/04c-fix-timestamps.js`
Restores original timestamps via SQLite:

- IMPORTANT: Print a warning that Strapi 5 should be stopped before running this script
- Open the SQLite database at `config.strapi5DbPath` using `better-sqlite3`
- Query `sqlite_master` to find actual table names — expect singular names: `article`, `dataset`, `app` (matching the `collectionName` from the Strapi 3 schemas)
- Query `PRAGMA table_info({table})` to confirm column names (`created_at`, `updated_at`, `document_id`)
- For each content type:
  - Read the transformed JSON for `_originalCreatedAt` / `_originalUpdatedAt` (camelCase — these come from Strapi 3's `createdAt`/`updatedAt` fields)
  - Read the ID map for legacyId → strapi5DocumentId
  - Run `UPDATE {table} SET created_at = ?, updated_at = ? WHERE document_id = ?` for each record (snake_case column names in SQLite)
- Verify by querying 5 sample records and printing their timestamps
- Close the database

## Technical Requirements
- ES modules (import/export)
- Native fetch (Node 18+)
- fs/promises for file I/O
- `better-sqlite3` for SQLite access (add to package.json dependencies)
- Add a configurable delay between API requests (default 100ms) to prevent overwhelming Strapi 5
- All scripts runnable individually: `node scripts/04-load.js`, `node scripts/04b-link-relations.js`, `node scripts/04c-fix-timestamps.js`
- Idempotent: all scripts safe to re-run (duplicate detection via legacyId, connect relations are additive)
- Fields prefixed with `_` are metadata — never send them to the Strapi 5 API
- Config values (API URL, token, DB path) come from `config.js`
````

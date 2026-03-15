# Doc 04 — Phase 4: Data Loading & Timestamp Restoration

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 4 of 5  
**Depends on:** Phase 3 complete (all media uploaded, all content transformed)  
**Produces:** Fully populated Strapi 5 instance with all content, relations, and correct timestamps  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Load all transformed content into Strapi 5 via the REST API in the correct dependency order, link many-to-many relations between articles and datasets/apps, and restore original `createdAt`/`updatedAt` timestamps via direct SQLite updates. At the end of this phase, Strapi 5 contains all ResearchHub data with intact relations and audit timestamps.

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

### Step 4a: Load Apps (No Dependencies)

**Script:** `scripts/04-load.js`

Apps go first because they have no dependencies on other content types or media.

For each app in `data/transformed/apps.json`:

**1. Check for duplicates.** Query Strapi 5:

```
GET http://localhost:1338/api/apps?filters[legacyId][$eq]={legacyId}
```

If a record with this `legacyId` already exists, skip it and log the existing `documentId` to the ID map.

**2. Create the entry.** POST to Strapi 5:

```
POST http://localhost:1338/api/apps
Content-Type: application/json
Authorization: Bearer {API_TOKEN}

{
  "data": {
    "legacyId": "60b8d295f1d2c72a4c9eabcd",
    "title": "Illinois Sentence Policy Dashboard",
    "summary": "Interactive visualization of sentencing data...",
    "url": "https://public.tableau.com/views/SentencingDashboard"
  }
}
```

**3. Capture the response.** Record the mapping:

```json
{
  "60b8d295f1d2c72a4c9eabcd": {
    "strapi5Id": 1,
    "strapi5DocumentId": "abc123def456",
    "legacyId": "60b8d295f1d2c72a4c9eabcd"
  }
}
```

Save to `data/maps/apps.json` after all apps are loaded.

---

### Step 4b: Load Datasets (Media Dependencies Only)

Datasets depend on media (the `datafile` field) but media was already uploaded in Phase 3. The `datafile` field in the transformed data is already a Strapi 5 media ID.

For each dataset in `data/transformed/datasets.json`:

**1. Duplicate check** (same as apps — query by `legacyId`).

**2. Create the entry:**

```json
{
  "data": {
    "legacyId": "60b8d295f1d2c72a4c9e1234",
    "title": "Illinois Crime Statistics 2023",
    "slug": "illinois-crime-statistics-2023",
    "description": "Annual crime data compiled from...",
    "datafile": 88
  }
}
```

The `datafile: 88` is the Strapi 5 media ID. Strapi 5's REST API accepts an integer media ID to set a media relation field.

**3. Capture and save** to `data/maps/datasets.json`.

---

### Step 4c: Load Articles (Depends on Apps + Datasets)

Articles depend on apps and datasets for relation linking. They also have media dependencies (splash image), but those are already resolved as media IDs.

For each article in `data/transformed/articles.json`:

**1. Duplicate check** (query by `legacyId`).

**2. Create the entry (without relations first):**

```json
{
  "data": {
    "legacyId": "507f1f77bcf86cd799439011",
    "title": "Violent Crime Trends 2024",
    "slug": "violent-crime-trends-2024",
    "body": "# Introduction\n\nThis report examines...\n\n![Chart](/uploads/violent-crime-trends-2024-001.jpg)\n\n...",
    "splash": 42
  }
}
```

Note: Relations (`datasets`, `apps`) are NOT included in the initial create. They are linked in a second pass (Step 4d) after all articles exist. This avoids ordering issues where an article references a dataset that hasn't been created yet (shouldn't happen given our load order, but the two-pass approach is more robust).

**3. Capture and save** to `data/maps/articles.json`.

---

### Step 4d: Link Relations

**Script:** `scripts/04b-link-relations.js`

After all content types are loaded, link the many-to-many relations.

For each article in `data/transformed/articles.json`:

1. Read `_relatedDatasetIds` — array of Strapi 3 ObjectIds.
2. Look up each ObjectId in `data/maps/datasets.json` to get the Strapi 5 `documentId`.
3. Read `_relatedAppIds` — same process with `data/maps/apps.json`.
4. Update the article in Strapi 5:

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
    },
    "apps": {
      "connect": [
        { "documentId": "strapi5-app-doc-id-1" }
      ]
    }
  }
}
```

Strapi 5's REST API uses the `connect` syntax for relation management. This adds relations without removing any existing ones.

**Handling missing relations:** If a `_relatedDatasetId` doesn't exist in the dataset ID map (the referenced dataset wasn't migrated for some reason), log a warning and skip that relation. Don't fail the entire article.

**Console output:**
```
Linking relations for 250 articles...
  Article 1/250: violent-crime-trends-2024 — 2 datasets, 1 app ✓
  Article 2/250: recidivism-study-2023 — 0 datasets, 0 apps (no relations)
  ...
  Article 87/250: old-report — WARNING: dataset 60b8d295... not found in map, skipping
  ...
Relations linked: 250 articles processed, 1 warning
```

---

### Step 4e: Restore Timestamps

**Script:** `scripts/04c-fix-timestamps.js`

After all content is loaded via the API, directly update the SQLite database to restore original `createdAt` and `updatedAt` values.

**1. Stop Strapi 5** (or at minimum, ensure no writes are happening). The SQLite file should not be written to by two processes simultaneously.

**2. Open the SQLite database:**

```javascript
import Database from 'better-sqlite3';

const db = new Database('/path/to/strapi5-project/.tmp/data.db');
```

**3. For each content type, update timestamps:**

```javascript
const updateStmt = db.prepare(`
  UPDATE articles 
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

Repeat for datasets and apps.

**4. Verify a sample:**

```javascript
const sample = db.prepare(`
  SELECT document_id, created_at, updated_at 
  FROM articles 
  LIMIT 5
`).all();
console.log('Sample timestamps:', sample);
```

**5. Close the database and restart Strapi 5.**

**Timestamp format:** Strapi 5 with SQLite stores timestamps as ISO 8601 strings (e.g., `"2024-03-15T10:30:00.000Z"`). The transform step should have already normalized Strapi 3 timestamps to this format. If Strapi 3 used a different format (Unix timestamp, non-UTC timezone), the transform step must convert.

**Table name mapping:** Strapi 5 may use a different table name than the content type name. Check with:

```sql
SELECT name FROM sqlite_master WHERE type='table';
```

Common patterns: `articles`, `datasets`, `apps` (matching the `collectionName` in the schema). The script should verify the table names before running updates.

**Column name for document ID:** The column is typically `document_id` in the SQLite table. Verify with:

```sql
PRAGMA table_info(articles);
```

**Console output:**
```
Restoring timestamps in Strapi 5 SQLite database...
  Updating articles: 250 records
  Updating datasets: 42 records
  Updating apps: 15 records
Timestamp restoration complete: 307 records updated
Sample verification:
  articles.document_id=abc123 → created_at=2024-03-15T10:30:00.000Z ✓
  articles.document_id=def456 → created_at=2023-11-01T09:00:00.000Z ✓
```

---

## 5. Load Order Summary

```
Step 4a: Load apps          → data/maps/apps.json
Step 4b: Load datasets      → data/maps/datasets.json
Step 4c: Load articles      → data/maps/articles.json
Step 4d: Link relations     (uses all three maps)
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
| All apps loaded | Count in Strapi 5 API: `GET /api/apps?pagination[pageSize]=1` → `meta.pagination.total` | Matches raw count |
| All datasets loaded | Same pattern | Matches raw count |
| All articles loaded | Same pattern | Matches raw count |
| Legacy IDs populated | `GET /api/articles?fields[0]=legacyId&pagination[pageSize]=5` | Every record has a `legacyId` |
| Splash images linked | Spot check 10 articles: `GET /api/articles/{docId}?populate=splash` | `splash` field returns media object (not null, not Base64) |
| Dataset files linked | Spot check 10 datasets: `GET /api/datasets/{docId}?populate=datafile` | `datafile` returns media object |
| M2M relations linked | Spot check 10 articles: `GET /api/articles/{docId}?populate=datasets,apps` | `datasets` and `apps` arrays contain expected entries |
| Timestamps correct | Query SQLite directly: `SELECT created_at FROM articles LIMIT 10` | Dates are historic (not migration day) |
| No duplicate records | `SELECT legacyId, COUNT(*) FROM articles GROUP BY legacyId HAVING COUNT(*) > 1` | Zero rows returned |

---

## 8. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

````
You are building Phase 4 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub has 3 content types: `article`, `dataset`, `app`.
Phase 3 has produced transformed JSON files ready for loading:
- `data/transformed/apps.json` — flat records with `legacyId`, `title`, `summary`, `url`, `_originalCreatedAt`, `_originalUpdatedAt`
- `data/transformed/datasets.json` — records with `legacyId`, media ID in `datafile` field, `_originalCreatedAt`, `_originalUpdatedAt`  
- `data/transformed/articles.json` — records with `legacyId`, media ID in `splash`, rewritten `body` (markdown with media URLs), `_relatedDatasetIds` (array of Strapi 3 ObjectIds), `_relatedAppIds` (array of Strapi 3 ObjectIds), `_originalCreatedAt`, `_originalUpdatedAt`

Strapi 5 runs at http://localhost:1338 with API token in `config.js` as `strapi5Token`.
Strapi 5 SQLite database path is in `config.js` as `strapi5DbPath`.

All content types have a `legacyId` field (string, unique) for duplicate detection.

Articles have many-to-many relations to datasets and apps.

## Your Task

Create three scripts:

### 1. `scripts/04-load.js`
Loads all content in dependency order:

**Step 1: Load apps**
- For each app in `data/transformed/apps.json`:
  - Check if `legacyId` already exists: `GET /api/apps?filters[legacyId][$eq]={legacyId}`
  - If exists, skip and record existing documentId in map
  - If not, POST to `/api/apps` with `{ data: { legacyId, title, summary, url } }`
  - Do NOT include `_original*` fields in the API payload
  - Record legacyId → { strapi5Id, strapi5DocumentId } in map
- Save map to `data/maps/apps.json`

**Step 2: Load datasets**
- Same pattern as apps
- Include `datafile` (integer media ID) in the API payload
- Save map to `data/maps/datasets.json`

**Step 3: Load articles**
- Same pattern
- Include `splash` (integer media ID) and `body` (rewritten markdown) in the API payload
- Do NOT include `datasets` or `apps` relations yet — those are linked in the next script
- Do NOT include `_relatedDatasetIds`, `_relatedAppIds`, or `_original*` fields
- Save map to `data/maps/articles.json`

Log progress throughout: "Loading apps: 1/15... 2/15... done. Loading datasets: 1/42..."

### 2. `scripts/04b-link-relations.js`
Links many-to-many relations:

- Read `data/transformed/articles.json` for `_relatedDatasetIds` and `_relatedAppIds`
- Read `data/maps/articles.json`, `data/maps/datasets.json`, `data/maps/apps.json`
- For each article:
  - Translate `_relatedDatasetIds` (Strapi 3 ObjectIds) → Strapi 5 documentIds using the dataset map
  - Translate `_relatedAppIds` → Strapi 5 documentIds using the app map
  - PUT to `/api/articles/{documentId}` with `{ data: { datasets: { connect: [...] }, apps: { connect: [...] } } }`
  - Skip articles with no relations
  - Warn (don't fail) if a related ID isn't found in the map
- Log progress

### 3. `scripts/04c-fix-timestamps.js`
Restores original timestamps via SQLite:

- IMPORTANT: Print a warning that Strapi 5 should be stopped before running this script
- Open the SQLite database at `config.strapi5DbPath` using `better-sqlite3`
- Query `sqlite_master` to find actual table names for articles, datasets, apps
- Query `PRAGMA table_info({table})` to confirm column names (`created_at`, `updated_at`, `document_id`)
- For each content type:
  - Read the transformed JSON for `_originalCreatedAt` / `_originalUpdatedAt`
  - Read the ID map for legacyId → strapi5DocumentId
  - Run `UPDATE {table} SET created_at = ?, updated_at = ? WHERE document_id = ?` for each record
- Verify by querying 5 sample records and printing their timestamps
- Close the database

## Technical Requirements
- ES modules (import/export)
- Native fetch (Node 18+)
- fs/promises for file I/O
- `better-sqlite3` for SQLite access (add to package.json dependencies)
- All scripts runnable individually: `node scripts/04-load.js`, `node scripts/04b-link-relations.js`, `node scripts/04c-fix-timestamps.js`
- Idempotent: all scripts safe to re-run (duplicate detection via legacyId, connect relations are additive)
- Fields prefixed with `_` are metadata — never send them to the Strapi 5 API
- Config values (API URL, token, DB path) come from `config.js`
````

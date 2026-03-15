# Doc 02 — Phase 2: Data Extraction

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 2 of 5  
**Depends on:** Phase 1 complete (Strapi 5 schemas generated and verified)  
**Produces:** Raw JSON extracts of all content from Strapi 3  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Extract all content from the Strapi 3 ResearchHub instance via GraphQL queries and store it as local JSON files. These files become the input for Phase 3 (Transform & Media Migration). After this phase, the Strapi 3 instance is no longer needed for the migration — all data exists locally.

---

## 2. Prerequisites

- Phase 1 complete (schemas verified, field map generated).
- Strapi 3 instance running at `http://localhost:1337` with GraphQL enabled.
- `config/field-map.json` exists (produced by Phase 1).
- GraphQL pagination limit configured: Strapi 3 defaults to max 100 results per query. If any content type has more than 100 records (articles has ~250), either:
  - Set `plugins.graphql.amountLimit` to a higher value (e.g., 1000) in Strapi 3's `config/plugins.js`, OR
  - The extraction script handles pagination automatically (preferred — no Strapi 3 config change needed).

---

## 3. Inputs / Outputs

### Inputs

| Input | Location | Description |
|-------|----------|-------------|
| Strapi 3 GraphQL endpoint | `http://localhost:1337/graphql` | Live data source |
| Field map | `config/field-map.json` | Tells the script which fields to request per content type |
| Strapi 3 model data | `data/introspection/strapi3-models.json` | Used to build GraphQL queries dynamically |

### Outputs

| Output | Location | Description |
|--------|----------|-------------|
| Raw articles | `data/raw/articles.json` | All ~250 articles with full field data |
| Raw datasets | `data/raw/datasets.json` | All datasets with full field data |
| Raw apps | `data/raw/apps.json` | All apps with full field data |
| Extraction manifest | `data/raw/manifest.json` | Record counts, timestamps, extraction metadata |

---

## 4. Step-by-Step Procedure

### Step 2a: Build GraphQL Queries

**Script:** `scripts/02-extract.js`  
**Library:** `lib/graphql-client.js`

The script dynamically builds a GraphQL query for each content type based on the field map. This ensures we capture every field, including relations and media references.

#### Article Query

```graphql
query GetArticles($start: Int!, $limit: Int!) {
  articles(start: $start, limit: $limit, sort: "created_at:asc") {
    id
    title
    slug
    body
    splash
    abstract
    category
    tags
    created_at
    updated_at
    published_at
    datasets {
      id
      title
      slug
    }
    apps {
      id
      title
    }
  }
}
```

> **Note:** The field list above is approximate. The script reads `data/introspection/strapi3-models.json` and dynamically includes all scalar fields plus one level of relation expansion (id + identifying fields for related entries). The `created_at` and `updated_at` fields are always included for timestamp preservation (Phase 4).

#### Dataset Query

```graphql
query GetDatasets($start: Int!, $limit: Int!) {
  datasets(start: $start, limit: $limit, sort: "created_at:asc") {
    id
    title
    slug
    description
    category
    tags
    created_at
    updated_at
    published_at
    datafile {
      id
      url
      name
      mime
      size
      ext
    }
  }
}
```

The `datafile` field is expanded to include the full media object — we need the `url` to download the file in Phase 3, and the `name`/`mime`/`ext` for re-upload metadata.

#### App Query

```graphql
query GetApps($start: Int!, $limit: Int!) {
  apps(start: $start, limit: $limit, sort: "created_at:asc") {
    id
    title
    summary
    url
    created_at
    updated_at
    published_at
  }
}
```

Apps are flat — no relations to expand (the inverse `articles` relation is not needed here; it will be reconstructed from the article side during loading).

### Step 2b: Execute Queries with Pagination

For each content type, the script:

1. Fetch the first page: `start: 0, limit: 100`.
2. If 100 results returned, fetch the next page: `start: 100, limit: 100`.
3. Continue until a page returns fewer than `limit` results.
4. Concatenate all pages into a single array.

**Pagination implementation:**

```javascript
async function extractAll(contentType, query, client) {
  const limit = 100;
  let start = 0;
  let allRecords = [];
  let page;

  do {
    page = await client.query(query, { start, limit });
    const records = page.data[contentType];
    allRecords = allRecords.concat(records);
    console.log(`  ${contentType}: fetched ${allRecords.length} records (page ${Math.floor(start / limit) + 1})`);
    start += limit;
  } while (page.data[contentType].length === limit);

  return allRecords;
}
```

**Sort order:** All queries sort by `created_at:asc` to ensure deterministic pagination. Without a sort, Strapi 3's MongoDB backend may return records in inconsistent order across pages, potentially causing duplicates or gaps.

### Step 2c: Save Raw Data

Write each content type's data as a JSON file:

```javascript
await fs.writeFile(
  'data/raw/articles.json',
  JSON.stringify(articles, null, 2)
);
```

Also write a manifest summarizing the extraction:

```json
{
  "extractedAt": "2026-03-15T14:30:00.000Z",
  "source": "http://localhost:1337/graphql",
  "counts": {
    "articles": 250,
    "datasets": 42,
    "apps": 15
  },
  "paginationLimit": 100,
  "sortOrder": "created_at:asc"
}
```

### Step 2d: Post-Extraction Count Check

After extraction, verify counts by querying Strapi 3's count endpoints (REST, since GraphQL count queries vary by Strapi version):

```
GET http://localhost:1337/articles/count
GET http://localhost:1337/datasets/count
GET http://localhost:1337/apps/count
```

Compare these counts to the number of records extracted. If they don't match, log a warning with the discrepancy. Common causes: pagination bug, records created during extraction, or Strapi 3's GraphQL filtering out unpublished entries.

---

## 5. GraphQL Client (`lib/graphql-client.js`)

A thin wrapper around `fetch` for GraphQL queries:

```javascript
export class GraphQLClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async query(queryString, variables = {}) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryString, variables })
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json;
  }
}
```

**Error handling:**

- Network errors (connection refused): Strapi 3 isn't running. Exit with clear message.
- HTTP errors (4xx/5xx): Authentication issue or malformed query. Log the response body.
- GraphQL errors (returned in `errors` array): Field doesn't exist, type mismatch, etc. Log the specific error messages — they usually point to the exact field causing the problem.
- Timeout: Add a configurable timeout (default 30 seconds per request). For large article bodies with Base64 images, responses can be several MB.

---

## 6. Handling Large Payloads

Articles with Base64 images embedded in the `splash` field and `body` field can produce very large GraphQL responses. A single article with a splash image and 3 inline images could easily be 5–10 MB of Base64 text.

With ~250 articles, the total raw extract could be **1–3 GB**.

**Mitigations:**

- **Pagination keeps individual responses manageable.** 100 articles per page means each response is ~100–300 MB at worst, which is within Node.js's default memory limits.
- **If memory is a concern,** reduce the pagination limit to 25 or 50. The extraction takes longer but uses less memory per page.
- **Stream to disk per page** rather than concatenating all pages in memory, then assemble afterward. This is optional but recommended if the dataset is larger than expected.
- **JSON.stringify with `null, 2`** (pretty-printed) makes the files larger on disk but much easier to debug. For a one-time migration, disk space is not a concern.

---

## 7. Edge Cases

### Unpublished Content

Strapi 3's GraphQL API may filter out unpublished (draft) entries by default. If ResearchHub uses draft/publish:

- Check if any articles have `published_at: null` in the REST API but don't appear in GraphQL results.
- If so, use the REST API as a fallback for unpublished entries, or query Strapi 3's admin GraphQL endpoint (which returns all entries regardless of publish state).

Since we're migrating all content with `draftAndPublish: false` in Strapi 5, we want everything — published or not.

### Null/Empty Relations

Articles may have empty `datasets` or `apps` arrays. The extraction handles this naturally — empty arrays are valid JSON. The transform step doesn't need special handling for these.

### Null Splash Field

Some articles may not have a splash image (field is `null` or empty string). The extraction captures this as-is. Phase 3's Base64 scanner skips articles with no splash data.

### Special Characters in Body

Markdown body fields may contain characters that need careful JSON encoding: backslashes, quotes, newlines, Unicode. `JSON.stringify` handles all of these correctly. The risk is in the reverse direction — when loading into Strapi 5, ensure the API accepts the content without double-escaping.

### MongoDB ObjectId Format

All `id` fields in the extracted data will be MongoDB ObjectId strings (e.g., `"507f1f77bcf86cd799439011"`). These are preserved as-is in the raw extraction. During Phase 3 (Transform), each record's `id` value is mapped to the `legacyId` field in the Strapi 5 payload. During Phase 4 (Load), the `legacyId` is used for duplicate detection — if a record with that `legacyId` already exists in Strapi 5, the load script skips it rather than creating a duplicate. This makes the entire migration idempotent and safe to re-run.

---

## 8. Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| Connection refused on port 1337 | Strapi 3 not running | Start Strapi 3: `cd strapi3-project && npm run develop` |
| GraphQL query returns `errors` | Invalid field name in query | Check field name against `strapi3-models.json`; adjust query |
| Fewer records than expected | Pagination bug or draft filtering | Reduce `limit`, check `published_at` filtering, try REST count endpoint |
| More records than expected | Records created during extraction | Re-run extraction; consider putting Strapi 3 in read-only mode |
| Response timeout | Large Base64 payloads causing slow responses | Increase timeout, reduce pagination limit |
| Out of memory | Too many large articles in memory at once | Reduce pagination limit, stream pages to disk individually |
| `null` or missing `created_at` / `updated_at` | Field might be named differently in GraphQL vs. model | Check introspection data for actual field name (`created_at` vs. `createdAt`) |

---

## 9. Verification

| Check | Method | Pass Criteria |
|-------|--------|--------------|
| All articles extracted | Count in `manifest.json` matches REST `/articles/count` | Counts equal |
| All datasets extracted | Count in `manifest.json` matches REST `/datasets/count` | Counts equal |
| All apps extracted | Count in `manifest.json` matches REST `/apps/count` | Counts equal |
| Timestamps present | Spot check 10 articles in `articles.json` | Every record has `created_at` and `updated_at` (non-null) |
| Relations captured | Spot check 10 articles with known relations | `datasets` and `apps` arrays contain expected related entry IDs |
| Base64 data present | Spot check articles with known splash images | `splash` field contains `data:image/` prefix |
| Media references captured | Spot check datasets with files | `datafile` object contains `url`, `name`, `mime` |
| File integrity | Parse each JSON file with `JSON.parse()` | No parse errors |
| IDs are ObjectIds | Spot check `id` fields | Format matches `/^[a-f0-9]{24}$/` |

---

## 10. Phase 2 Completion Checklist

Before proceeding to Phase 3, every item below must pass. Items marked **(auto)** are checked by the post-extraction verification built into `scripts/02-extract.js`. Items marked **(script)** would benefit from a dedicated `scripts/02-verify.js` script for re-verification without re-extracting.

### Automated Gate Checks (built into `02-extract.js` + recommended `02-verify.js`)

- [ ] **(auto)** Article count in `data/raw/articles.json` matches `GET /articles/count` from Strapi 3
- [ ] **(auto)** Dataset count in `data/raw/datasets.json` matches `GET /datasets/count` from Strapi 3
- [ ] **(auto)** App count in `data/raw/apps.json` matches `GET /apps/count` from Strapi 3
- [ ] **(script)** Every record in all 3 files has a non-null `id` field matching MongoDB ObjectId format (`/^[a-f0-9]{24}$/`)
- [ ] **(script)** Every record has `created_at` and `updated_at` fields (non-null)
- [ ] **(script)** All 3 JSON files parse without errors (`JSON.parse` succeeds)
- [ ] **(script)** No duplicate `id` values within any single file
- [ ] **(script)** Article `datasets` and `apps` relation arrays are present (even if empty)
- [ ] **(script)** Dataset `datafile` objects (when non-null) contain `url`, `name`, `mime`, `ext`
- [ ] **(script)** Manifest `data/raw/manifest.json` exists and counts match file contents

### Parity Assertions

These confirm the extraction faithfully captured all source data:

| Assertion | How to Verify |
|-----------|---------------|
| Record counts match exactly | Compare `manifest.json` counts against Strapi 3 REST `/count` endpoints |
| No records lost to pagination | Total extracted = sum of all pages; no page returned 0 records unexpectedly |
| No records lost to draft filtering | If Strapi 3 has `draftAndPublish`, compare GQL count vs REST count (REST may include drafts GQL filters out) |
| Timestamps captured for every record | Count records with non-null `created_at` = total record count |
| Relations captured | For articles with known relations (spot check 10), verify `datasets`/`apps` arrays are non-empty |
| Base64 data present | For articles with known splash images (spot check 10), verify `splash` field contains `data:image/` or raw Base64 |
| Media references complete | For datasets with files (spot check 10), verify `datafile.url` is non-null |

### Recommended: `scripts/02-verify.js`

A standalone verification script that can be run independently of extraction:

```
node scripts/02-verify.js
```

This script should:
1. Read all 3 raw JSON files and the manifest
2. Validate every record has `id`, `created_at`, `updated_at`
3. Check for duplicate IDs
4. Verify manifest counts match actual file record counts
5. Hit Strapi 3 REST count endpoints and compare
6. Spot-check 10 random articles for `splash` field presence and relation arrays
7. Spot-check 10 random datasets for `datafile` object completeness
8. Print a pass/fail summary and exit 0 (all pass) or 1 (any fail)

This is useful when re-verifying after Strapi 3 data changes without re-running the full extraction.

### Go / No-Go

**Go:** All counts match, all records have IDs and timestamps, JSON files are valid, spot checks confirm relations and media references are captured.

**No-go:** Count mismatch (pagination bug or draft filtering), missing timestamps (field name mismatch), or corrupt JSON (encoding issues). Diagnose, fix the extraction query or pagination logic, and re-extract.

---

## 11. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

```
You are building Phase 2 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub has 3 content types in Strapi 3 (MongoDB):
- `article` (~250 records) — has a `splash` field (Base64 text), `body` (markdown with inline Base64 images), and m2m relations to `datasets` and `apps`
- `dataset` — has a `datafile` media field (Excel files in the Strapi 3 media library)
- `app` — flat data (title, summary, url), no media

Strapi 3 runs at http://localhost:1337 with GraphQL enabled.
Phase 1 has already run, producing:
- `data/introspection/strapi3-models.json` (parsed Strapi 3 model definitions)
- `config/field-map.json` (field mapping between Strapi 3 and Strapi 5)

## Your Task

Create one script and update the GraphQL client library:

### 1. `lib/graphql-client.js`
Export a `GraphQLClient` class that:
- Takes an endpoint URL in the constructor
- Has an async `query(queryString, variables)` method
- Uses native `fetch` (Node 18+)
- Throws clear errors for network failures, HTTP errors, and GraphQL errors
- Supports a configurable timeout (default 30 seconds)

### 2. `scripts/02-extract.js`
This script:
- Reads `data/introspection/strapi3-models.json` to know which fields to query
- For each content type (articles, datasets, apps), dynamically builds a GraphQL query that requests all scalar fields plus one level of relation/media expansion
- Always includes `id`, `created_at`, `updated_at`, `published_at` on every content type
- For the `article` type, expands `datasets { id title slug }` and `apps { id title }`
- For the `dataset` type, expands `datafile { id url name mime size ext }`
- Paginates using `start` and `limit` (100 per page), sorted by `created_at:asc`
- Continues fetching until a page returns fewer than `limit` results
- Saves each content type to `data/raw/{contentType}.json` (pretty-printed JSON)
- Saves an extraction manifest to `data/raw/manifest.json` with counts, timestamp, and source URL
- After extraction, hits the Strapi 3 REST count endpoints to verify record counts:
  - GET http://localhost:1337/articles/count
  - GET http://localhost:1337/datasets/count  
  - GET http://localhost:1337/apps/count
- Logs a warning if any count doesn't match
- Logs clear progress throughout: "Extracting articles... page 1 (100 records)... page 2 (200 records)... page 3 (250 records) — done."

## Technical Requirements
- ES modules (import/export)
- Native fetch (Node 18+)
- fs/promises for file I/O
- Create `data/raw/` directory recursively if it doesn't exist
- Runnable with `node scripts/02-extract.js`
- Handle the case where articles contain very large Base64 strings (multi-MB responses) — use appropriate timeout
- Sort all queries by `created_at:asc` for deterministic pagination
```

# Doc 03 — Phase 3: Base64 Extraction & Media Migration

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 3 of 5  
**Depends on:** Phase 2 complete (raw JSON extracts in `data/raw/`)  
**Produces:** Decoded image files, uploaded media in Strapi 5, rewritten article content, transformed data for all content types  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Extract all Base64-encoded images from articles and apps, decode them to binary files, upload them to the Strapi 5 media library, and rewrite all content to reference the new media URLs. Article has THREE potential Base64 fields: `splash`, `thumbnail` (both string fields, likely Base64), and `images` (json — needs investigation, may contain Base64 data or image references). The article body field is called `markdown` (not `body`), and inline Base64 images in that field must also be extracted. Article also has `mainfile` and `extrafile` media upload fields that need download+reupload (same pattern as dataset `datafile`). App has an `image` field (string, likely Base64) that needs the same extraction pipeline. App also requires full transformation (it has description, contributors, categories, tags, relations, and other fields — not "flat data"). Also migrate dataset Excel files and article media uploads from the Strapi 3 media library to Strapi 5. At the end of this phase, all media exists in Strapi 5 and all content is transformed and ready for loading.

---

## 2. Prerequisites

- Phase 2 complete: `data/raw/articles.json`, `data/raw/datasets.json`, `data/raw/apps.json` exist.
- Strapi 5 running at `http://localhost:1338` with a full-access API token configured.
- Strapi 3 still running at `http://localhost:1337` (needed to download dataset Excel files from its `/uploads/` directory).
- `config/field-map.json` exists (produced by Phase 1).

---

## 3. Inputs / Outputs

### Inputs

| Input | Location | Description |
|-------|----------|-------------|
| Raw articles | `data/raw/articles.json` | ~250 articles with Base64 splash/thumbnail/images + inline markdown images + mainfile/extrafile media |
| Raw datasets | `data/raw/datasets.json` | Datasets with `datafile` media references |
| Raw apps | `data/raw/apps.json` | Apps with Base64 `image` field, description, contributors, categories, tags, relations |
| Field map | `config/field-map.json` | Field name/type mapping |
| Strapi 3 uploads | `http://localhost:1337/uploads/` | Source for dataset Excel files |
| Strapi 5 upload endpoint | `http://localhost:1338/api/upload` | Target for all media uploads |

### Outputs

| Output | Location | Description |
|--------|----------|-------------|
| Media manifest | `data/media/manifest.json` | Inventory of every image found |
| Decoded image files | `data/media/files/` | Binary image files extracted from Base64 |
| Media ID map | `data/maps/media.json` | Source image → Strapi 5 media ID/URL |
| Transformed articles | `data/transformed/articles.json` | Articles with Base64 replaced by media URLs/IDs |
| Transformed datasets | `data/transformed/datasets.json` | Datasets with updated media references |
| Transformed apps | `data/transformed/apps.json` | Apps with field mapping applied |

---

## 4. Step-by-Step Procedure

### Step 3a: Scan & Inventory Base64 Images

**Script:** `scripts/03a-scan-base64.js`  
**Library:** `lib/base64-scanner.js`

Scan every article in `data/raw/articles.json` and every app in `data/raw/apps.json` for Base64 image data:

**Article fields to scan:**

**1. Splash field.** Check if the `splash` field is non-null and contains a Base64 data URI. Detection: the string starts with `data:image/` or contains a raw Base64 payload (no data URI prefix — some Strapi setups store just the Base64 without the `data:image/...;base64,` header).

**2. Thumbnail field.** Same detection logic as splash — the `thumbnail` is a string field that follows the same Base64 pattern as `splash`.

**3. Images field (JSON).** The `images` field is JSON — investigate its contents. It may contain Base64 data, image references, or structured image metadata. Log the structure of non-null `images` fields for manual review.

**4. Inline markdown images.** Scan the `markdown` field for markdown images with Base64 data URIs using the regex:

```javascript
const MARKDOWN_BASE64_RE = /!\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)\)/g;
```

**5. HTML fallback scan.** Also check the `markdown` field for `<img>` tags with Base64 `src` attributes as a safety net:

```javascript
const HTML_BASE64_RE = /<img[^>]+src="data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)"[^>]*>/g;
```

**App field to scan:**

**6. App image field.** Check if the `image` field on each app is non-null and contains a Base64 data URI or raw Base64 payload (same detection logic as article splash/thumbnail).

For each image found, record an entry in the manifest:

```json
{
  "images": [
    {
      "articleId": "507f1f77bcf86cd799439011",
      "articleSlug": "violent-crime-trends-2024",
      "location": "splash",
      "mimeType": "image/png",
      "filename": "violent-crime-trends-2024-splash.png",
      "altText": null,
      "base64Length": 184320,
      "estimatedFileSize": "~135 KB"
    },
    {
      "articleId": "507f1f77bcf86cd799439011",
      "articleSlug": "violent-crime-trends-2024",
      "location": "inline",
      "index": 0,
      "mimeType": "image/jpeg",
      "filename": "violent-crime-trends-2024-001.jpg",
      "altText": "Chart showing crime rate decline",
      "base64Length": 256000,
      "estimatedFileSize": "~188 KB"
    }
  ],
  "summary": {
    "totalImages": 652,
    "splashImages": 230,
    "thumbnailImages": 225,
    "inlineImages": 182,
    "appImages": 15,
    "articlesWithNoSplash": 20,
    "articlesWithNoThumbnail": 25,
    "articlesWithNoInlineImages": 95,
    "byMimeType": {
      "image/png": 280,
      "image/jpeg": 130,
      "image/gif": 2
    },
    "estimatedTotalSize": "~58 MB"
  }
}
```

**Filename convention:**

- Splash: `{slug}-splash.{ext}`
- Thumbnail: `{slug}-thumbnail.{ext}`
- Inline: `{slug}-{NNN}.{ext}` (zero-padded 3-digit index)
- App image: `app-{slug}-image.{ext}`
- If slug is missing or empty, fall back to `article-{legacyId}-splash.{ext}` (or `-thumbnail`, etc.)
- Sanitize slugs: replace any non-alphanumeric characters (except hyphens) with hyphens, truncate to 80 chars

**MIME type detection:**

- Primary: parse the `data:image/{type};base64,` prefix
- Fallback (if no prefix): decode the first 16 bytes and check magic bytes:
  - PNG: `89 50 4E 47`
  - JPEG: `FF D8 FF`
  - GIF: `47 49 46 38`
  - WebP: `52 49 46 46` + `57 45 42 50` at offset 8

Save manifest to `data/media/manifest.json`.

**Console output:**
```
Scanning 250 articles for Base64 images...
  Article 1/250: violent-crime-trends-2024 — 1 splash + 1 thumbnail + 3 inline
  Article 2/250: recidivism-study-2023 — 1 splash + 1 thumbnail + 0 inline
  ...
Scanning apps for Base64 images...
  App 1/15: sentencing-dashboard — 1 image
  ...
Scan complete: 652 images found (230 splash, 225 thumbnail, 182 inline, 15 app images)
Manifest saved to data/media/manifest.json
```

---

### Step 3b: Decode Base64 to Binary Files

**Script:** `scripts/03b-decode-base64.js`  
**Library:** `lib/base64-decoder.js`

Read each entry in `data/media/manifest.json`. For each image:

1. Extract the Base64 payload from the raw article data (re-read `data/raw/articles.json`) or app data (`data/raw/apps.json`).
2. Strip any whitespace/newlines from the Base64 string (some encoders wrap at 76 chars).
3. Strip the `data:image/...;base64,` prefix if present.
4. Decode using `Buffer.from(base64String, 'base64')`.
5. Validate the decoded file:
   - Check file size > 0 bytes.
   - Check magic bytes match the declared MIME type.
   - If mismatch, log a warning and use the MIME type from magic bytes instead.
6. Save to `data/media/files/{filename}`.

**Error handling per image:**

- If Base64 decoding fails (invalid characters), log the error with article ID and image index, skip the image, and add it to a `failures` array in the manifest.
- If the decoded file is 0 bytes, same treatment.
- Do not abort the entire script on individual image failures — continue processing remaining images.

**Console output:**
```
Decoding 652 images...
  [1/652] violent-crime-trends-2024-splash.png — 135 KB ✓
  [2/652] violent-crime-trends-2024-001.jpg — 188 KB ✓
  ...
  [287/652] old-report-figure-003.png — 0 bytes ✗ FAILED (empty file)
  ...
Decode complete: 410 succeeded, 2 failed
Failures logged in data/media/manifest.json under "failures"
```

---

### Step 3c: Upload Media to Strapi 5

**Script:** `scripts/03c-upload-media.js`  
**Library:** `lib/rest-client.js`

Upload every decoded file in `data/media/files/` to Strapi 5's media library.

**Upload request format:**

```javascript
import FormData from 'form-data';  // or use native Node 18+ FormData
import fs from 'fs';

const form = new FormData();
form.append('files', fs.createReadStream(`data/media/files/${filename}`), {
  filename: filename,
  contentType: mimeType
});

const response = await fetch('http://localhost:1338/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_TOKEN}`,
    ...form.getHeaders()
  },
  body: form
});
```

**Response format (Strapi 5):**

```json
[
  {
    "id": 42,
    "name": "violent-crime-trends-2024-splash.png",
    "url": "/uploads/violent-crime-trends-2024-splash.png",
    "mime": "image/png",
    "size": 135.2,
    "width": 1200,
    "height": 630
  }
]
```

For each successful upload, record the mapping in `data/maps/media.json`:

```json
{
  "violent-crime-trends-2024-splash.png": {
    "sourceArticleId": "507f1f77bcf86cd799439011",
    "location": "splash",
    "strapi5MediaId": 42,
    "strapi5Url": "/uploads/violent-crime-trends-2024-splash.png"
  },
  "violent-crime-trends-2024-001.jpg": {
    "sourceArticleId": "507f1f77bcf86cd799439011",
    "location": "inline",
    "index": 0,
    "strapi5MediaId": 43,
    "strapi5Url": "/uploads/violent-crime-trends-2024-001.jpg"
  }
}
```

**Rate limiting:** Add a configurable delay between uploads (default: 100ms). Running locally this shouldn't be necessary, but it prevents overwhelming the Strapi 5 instance if processing hundreds of files quickly.

**Idempotency:** Before uploading, check if a file with the same name already exists in Strapi 5 (query `GET /api/upload/files?filters[name][$eq]={filename}`). If it exists, skip the upload and use the existing media record. This makes the script safe to re-run.

**Console output:**
```
Uploading 410 files to Strapi 5 media library...
  [1/410] violent-crime-trends-2024-splash.png — uploaded (ID: 42)
  [2/410] violent-crime-trends-2024-001.jpg — uploaded (ID: 43)
  ...
  [156/410] some-old-chart.png — already exists (ID: 89), skipping
  ...
Upload complete: 410 files processed (398 uploaded, 12 already existed)
Media map saved to data/maps/media.json
```

---

### Step 3d: Rewrite Article Content

**Script:** `scripts/03d-rewrite-content.js`  
**Library:** `lib/markdown-rewriter.js`

For each article in `data/raw/articles.json`, produce a transformed version with all Base64 replaced:

**1. Splash field → media relation.**

The `splash` field changes from a text field containing Base64 to a media relation ID. In the transformed article JSON:

```json
{
  "splash": 42
}
```

Where `42` is the Strapi 5 media ID from `data/maps/media.json`. When loading via the REST API (Phase 4), Strapi 5 accepts a media ID to set a media relation.

If the article had no splash image (null/empty), set `splash` to `null`.

**2. Thumbnail field → media relation.**

Same as splash — the `thumbnail` field changes from a text field containing Base64 to a media relation ID. If the article had no thumbnail (null/empty), set `thumbnail` to `null`.

**3. Markdown field → rewritten markdown.**

Find each `![alt](data:image/...;base64,...)` in the `markdown` field and replace with `![alt](/uploads/filename.ext)`:

```javascript
function rewriteMarkdownImages(markdown, articleId, mediaMap) {
  let imageIndex = 0;

  return markdown.replace(MARKDOWN_BASE64_RE, (match, altText, mimeSubtype, base64Data) => {
    const filename = getFilenameForInlineImage(articleId, imageIndex);
    const mediaEntry = mediaMap[filename];
    imageIndex++;

    if (!mediaEntry) {
      console.warn(`  WARNING: No media entry for ${filename} — Base64 preserved`);
      return match;  // preserve original if upload failed
    }

    return `![${altText}](${mediaEntry.strapi5Url})`;
  });
}
```

Also run the HTML `<img>` fallback replacement for any HTML-style Base64 images found in the `markdown` field.

**4. Map remaining fields.**

Apply the field map from `config/field-map.json` to rename/convert any other fields. Key mappings:

- `id` → `legacyId` (store the MongoDB ObjectId)
- `createdAt` → `_originalCreatedAt` (preserved for Phase 4 timestamp fix, not sent to the API)
- `updatedAt` → `_originalUpdatedAt` (same)
- `thumbnail` → media ID (same processing as splash — extract Base64, upload, replace with Strapi 5 media ID)
- `mainfile` / `extrafile` → preserve media references for download+reupload (same pattern as dataset `datafile`)
- Relation fields (`datasets`) → preserve the array of related IDs as `_relatedDatasetIds` for Phase 4 relation linking

**5. Write transformed articles.**

```json
[
  {
    "legacyId": "507f1f77bcf86cd799439011",
    "title": "Violent Crime Trends 2024",
    "status": "published",
    "slug": "violent-crime-trends-2024",
    "date": "2024-03-15",
    "external": false,
    "categories": ["crime", "statistics"],
    "tags": ["violent-crime", "trends"],
    "authors": ["John Smith"],
    "splash": 42,
    "thumbnail": 43,
    "images": null,
    "abstract": "This report examines violent crime trends across Illinois...",
    "markdown": "# Introduction\n\nThis report examines...\n\n![Chart showing decline](/uploads/violent-crime-trends-2024-001.jpg)\n\n...",
    "mainfiletype": "pdf",
    "funding": "Grant #12345",
    "citation": "Smith, J. (2024). Violent Crime Trends.",
    "doi": "10.1234/example",
    "hideFromBanner": false,
    "mainfile": 90,
    "extrafile": null,
    "_originalCreatedAt": "2024-03-15T10:30:00.000Z",
    "_originalUpdatedAt": "2024-06-01T14:22:00.000Z",
    "_relatedDatasetIds": ["60b8d295f1d2c72a4c9e1234", "60b8d295f1d2c72a4c9e5678"]
  }
]
```

Fields prefixed with `_` are metadata consumed by Phase 4 scripts but not sent directly to the Strapi 5 API.

Save to `data/transformed/articles.json`.

**Post-rewrite verification:** After rewriting all articles, scan every transformed `markdown` field for the string `data:image/`. If any matches are found, log them as warnings — these are Base64 images that were missed by the rewrite process.

**Console output:**
```
Rewriting 250 articles...
  Article 1/250: violent-crime-trends-2024 — splash ✓, thumbnail ✓, 3 inline images ✓, mainfile ✓
  Article 2/250: recidivism-study-2023 — splash ✓, thumbnail ✓, 0 inline images
  ...
Rewrite complete: 250 articles processed
Post-rewrite scan: 0 Base64 remnants found ✓
Saved to data/transformed/articles.json
```

---

### Step 3e: Migrate Dataset Media

**Script:** `scripts/03e-transform.js` (handles datasets, article media files, and apps together)

**Dataset media:**

For each dataset in `data/raw/datasets.json`:

1. Check if the `datafile` field is non-null and contains a media reference with a `url`.
2. Download the file from Strapi 3: `GET http://localhost:1337{datafile.url}` (the URL is usually relative, like `/uploads/filename.xlsx`).
3. Save the downloaded file to `data/media/files/{original-filename}`.
4. Upload to Strapi 5 via `/api/upload` (same process as image uploads in Step 3c).
5. Record the mapping in `data/maps/media.json`.
6. In the transformed dataset JSON, set `datafile` to the new Strapi 5 media ID.

**Article media files (mainfile/extrafile):**

Read `data/transformed/articles.json` (output from Step 3d). For each article:

1. Check if `mainfile` and/or `extrafile` fields are non-null and contain a media reference with a `url`.
2. Download each file from Strapi 3: `GET http://localhost:1337{mainfile.url}` (same pattern as dataset datafile).
3. Save the downloaded file to `data/media/files/{original-filename}`.
4. Upload to Strapi 5 via `/api/upload`.
5. Record the mapping in `data/maps/media.json`.
6. In the transformed article JSON, set `mainfile`/`extrafile` to the new Strapi 5 media ID.

**Transformed dataset:**

```json
{
  "legacyId": "60b8d295f1d2c72a4c9e1234",
  "title": "Illinois Crime Statistics 2023",
  "status": "published",
  "slug": "illinois-crime-statistics-2023",
  "date": "2023-11-01",
  "external": false,
  "categories": ["crime", "statistics"],
  "tags": ["illinois", "annual"],
  "project": true,
  "sources": [{"name": "ISP", "url": "https://isp.illinois.gov"}],
  "unit": "incidents",
  "timeperiod": {"start": "2023-01-01", "end": "2023-12-31"},
  "description": "Annual crime data compiled from...",
  "notes": [],
  "variables": [{"name": "offense_type", "type": "string"}],
  "funding": "Grant #12345",
  "citation": "ICJIA (2023). Illinois Crime Statistics.",
  "datafile": 88,
  "_originalCreatedAt": "2023-11-01T09:00:00.000Z",
  "_originalUpdatedAt": "2024-01-15T11:30:00.000Z"
}
```

Note: Dataset relations to articles and apps are defined on the article/app side (article.datasets is dominant, app.datasets is dominant), so dataset does not carry forward relation IDs. Relations are linked from the article/app side in Phase 4.

Save to `data/transformed/datasets.json`.

---

### Step 3f: Transform Apps

Apps have an `image` field (string, likely Base64) that needs the same extraction pipeline as article splash/thumbnail. Apps also have multiple data fields and TWO many-to-many relations. For each app in `data/raw/apps.json`:

1. Map `id` → `legacyId`.
2. Check the `image` field — if it contains Base64 data, look up the uploaded media ID from `data/maps/media.json` and replace with the Strapi 5 media ID. If it's not Base64 (e.g., a URL), preserve the value as-is.
3. Copy all fields: `title`, `status`, `slug`, `date`, `external`, `categories` (json), `tags` (json), `contributors` (json), `description` (text), `url`, `funding`, `citation`.
4. Preserve timestamps as `_originalCreatedAt` / `_originalUpdatedAt`.
5. Preserve relation IDs: `datasets` → `_relatedDatasetIds`, `articles` → `_relatedArticleIds` (app is the dominant side of both relations — Phase 4 will link these).

**Transformed app:**

```json
{
  "legacyId": "60b8d295f1d2c72a4c9eabcd",
  "title": "Illinois Sentence Policy Dashboard",
  "status": "published",
  "slug": "sentencing-dashboard",
  "date": "2023-06-15",
  "external": false,
  "categories": ["corrections", "sentencing"],
  "tags": ["dashboard", "interactive"],
  "contributors": ["Jane Doe"],
  "image": 95,
  "description": "Interactive visualization of sentencing data across Illinois counties.",
  "url": "https://public.tableau.com/views/SentencingDashboard",
  "funding": "Grant #67890",
  "citation": "ICJIA (2023). Sentencing Dashboard.",
  "_originalCreatedAt": "2023-06-15T08:00:00.000Z",
  "_originalUpdatedAt": "2023-06-15T08:00:00.000Z",
  "_relatedDatasetIds": ["60b8d295f1d2c72a4c9e1234"],
  "_relatedArticleIds": ["507f1f77bcf86cd799439011"]
}
```

Save to `data/transformed/apps.json`.

---

## 5. Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| Base64 regex misses an image | Unusual encoding, missing data URI prefix, or non-standard markdown | Post-rewrite scan catches remnants; add the missed pattern to the regex and re-run |
| Base64 decode produces corrupt file | Truncated Base64 string, encoding errors | Magic byte validation catches this; file logged to failures list; manual review needed |
| Strapi 5 upload rejects a file | File too large, unsupported MIME type, or Strapi config limits | Check Strapi 5 upload settings (`config/plugins.js` — `sizeLimit`, `allowedTypes`); adjust and retry |
| Dataset Excel file download fails (404) | File missing from Strapi 3 uploads directory | Log the missing file with dataset ID; skip and flag for manual resolution |
| Strapi 5 already has a file with the same name | Re-running the script after partial completion | Idempotency check skips existing files; no action needed |
| Memory issues processing large articles | Multiple large Base64 strings in a single article markdown | Process articles one at a time rather than loading all into memory |
| Markdown rewrite corrupts non-image content | Regex matches something it shouldn't | Diff original vs. rewritten markdown; only `![...](data:image/...)` patterns should change |
| Article mainfile/extrafile download fails (404) | File missing from Strapi 3 uploads directory | Log the missing file with article ID; skip and flag for manual resolution |

---

## 6. Verification

| Check | Method | Pass Criteria |
|-------|--------|--------------|
| All Base64 images found | Manifest image count is plausible (~1–6 per article average) | Manifest summary looks reasonable |
| All files decoded | `ls data/media/files/ | wc -l` matches manifest `totalImages` minus failures | Counts match |
| All files uploaded | Count entries in `data/maps/media.json` matches decoded file count | Counts match |
| Zero Base64 remnants | Grep all `markdown` fields in `data/transformed/articles.json` for `data:image/` | Zero matches |
| Splash fields are media IDs | Spot check 10 articles in `data/transformed/articles.json` | `splash` is an integer (Strapi 5 media ID), not a Base64 string |
| Thumbnail fields are media IDs | Spot check 10 articles in `data/transformed/articles.json` | `thumbnail` is an integer (Strapi 5 media ID), not a Base64 string |
| App image fields are media IDs | Spot check apps with non-null `image` in `data/transformed/apps.json` | `image` is an integer (Strapi 5 media ID), not a Base64 string |
| Inline images are URLs | Spot check 10 article `markdown` fields | Image markdown uses `/uploads/...` URLs, not `data:image/...` |
| Article mainfile/extrafile uploaded | Count articles with non-null `mainfile`/`extrafile` in raw vs. transformed | Counts match; all have integer media IDs |
| Dataset files uploaded | Count datasets with non-null `datafile` in raw vs. transformed | Counts match; all have integer media IDs |
| Media accessible in Strapi 5 | Spot check 10 media URLs with `curl http://localhost:1338{url}` | HTTP 200 with correct content-type |
| Legacy IDs present | Spot check all three transformed JSON files | Every record has a `legacyId` string matching MongoDB ObjectId format |
| Timestamps preserved | Spot check `_originalCreatedAt` / `_originalUpdatedAt` in transformed files | Non-null, ISO 8601 format, matches raw data |

---

## 7. Phase 3 Completion Checklist

Phase 3 is the most complex phase. Before proceeding to Phase 4, every item below must pass. A dedicated `scripts/03-verify.js` script should automate all **(auto)** checks.

### Automated Gate Checks (`scripts/03-verify.js`)

**Scan & Decode:**

- [ ] **(auto)** `data/media/manifest.json` exists and contains an `images` array
- [ ] **(auto)** Every manifest entry has: `articleId`, `articleSlug`, `location`, `mimeType`, `filename`
- [ ] **(auto)** No duplicate filenames in the manifest
- [ ] **(auto)** File count in `data/media/files/` matches manifest `totalImages` minus manifest `failures` count
- [ ] **(auto)** Every file in `data/media/files/` is > 0 bytes
- [ ] **(auto)** Magic bytes of each decoded file match declared MIME type (PNG, JPEG, GIF, WebP)

**Upload:**

- [ ] **(auto)** `data/maps/media.json` exists
- [ ] **(auto)** Entry count in `data/maps/media.json` matches decoded file count
- [ ] **(auto)** Every media map entry has: `strapi5MediaId` (integer), `strapi5Url` (string starting with `/uploads/`)
- [ ] **(auto)** Every media URL is accessible: `HEAD http://localhost:1338{url}` returns HTTP 200

**Rewrite:**

- [ ] **(auto)** `data/transformed/articles.json` exists with same record count as `data/raw/articles.json`
- [ ] **(auto)** Zero `data:image/` substrings in any `markdown` field across all transformed articles
- [ ] **(auto)** Every article that had a non-null `splash` in raw data now has an integer `splash` value in transformed data
- [ ] **(auto)** Every article that had a null/empty `splash` in raw data has `splash: null` in transformed data
- [ ] **(auto)** Every article that had a non-null `thumbnail` in raw data now has an integer `thumbnail` value in transformed data
- [ ] **(auto)** Every article that had a null/empty `thumbnail` in raw data has `thumbnail: null` in transformed data
- [ ] **(auto)** Every article that had a non-null `mainfile` in raw data now has an integer `mainfile` value in transformed data
- [ ] **(auto)** Every article that had a non-null `extrafile` in raw data now has an integer `extrafile` value in transformed data
- [ ] **(auto)** All inline image references in transformed `markdown` fields use `/uploads/` URLs (not Base64)
- [ ] **(auto)** Every transformed article has: `legacyId`, `_originalCreatedAt`, `_originalUpdatedAt`

**Dataset & App Transform:**

- [ ] **(auto)** `data/transformed/datasets.json` exists with same record count as `data/raw/datasets.json`
- [ ] **(auto)** Every dataset with a non-null `datafile` in raw data has an integer `datafile` value in transformed data
- [ ] **(auto)** `data/transformed/apps.json` exists with same record count as `data/raw/apps.json`
- [ ] **(auto)** Every app that had a non-null Base64 `image` in raw data now has an integer `image` value in transformed data
- [ ] **(auto)** Every app has `_relatedDatasetIds` and `_relatedArticleIds` arrays
- [ ] **(auto)** Every record in all 3 transformed files has: `legacyId` matching MongoDB ObjectId format

### Parity Assertions

| Assertion | How to Verify |
|-----------|---------------|
| No images lost | Manifest `totalImages` = decoded file count + failure count |
| No uploads lost | Media map entry count = decoded file count |
| No articles gained or lost | `data/transformed/articles.json` record count = `data/raw/articles.json` record count |
| Splash parity | Count of non-null `splash` in raw = count of integer `splash` in transformed |
| Thumbnail parity | Count of non-null `thumbnail` in raw = count of integer `thumbnail` in transformed |
| App image parity | Count of non-null Base64 `image` in raw apps = count of integer `image` in transformed apps |
| Mainfile parity | Count of non-null `mainfile` in raw = count of integer `mainfile` in transformed |
| Extrafile parity | Count of non-null `extrafile` in raw = count of integer `extrafile` in transformed |
| Dataset file parity | Count of non-null `datafile` in raw = count of integer `datafile` in transformed |
| Markdown content preserved | For 10 random articles: non-image text in `markdown` is identical between raw and transformed (only image references changed) |
| Timestamps carried forward | For all records: `_originalCreatedAt` in transformed matches `createdAt` in raw |
| Relations carried forward | For all articles: `_relatedDatasetIds` count in transformed matches `datasets` array length in raw |

### Recommended: `scripts/03-verify.js`

A standalone script that validates the full Phase 3 output:

```
node scripts/03-verify.js
```

This script should:
1. Load manifest, media map, and all raw/transformed files
2. Run all automated checks above
3. For the markdown-content parity check: strip all image markdown from both raw and transformed `markdown` fields, then compare — non-image content should be identical
4. For media accessibility: HEAD-request a random sample of 20 media URLs (or all, if < 100)
5. Print pass/fail for each check category (scan, decode, upload, rewrite, dataset, app)
6. Exit 0 if all pass, exit 1 if any fail

### Go / No-Go

**Go:** Zero Base64 remnants, all media uploaded and accessible, all transformed files have correct record counts and `legacyId` fields, splash/datafile fields are integer media IDs.

**No-go:** Base64 remnants found (regex missed images — expand the pattern), media upload failures (check Strapi 5 upload limits), missing/corrupt decoded files (check Base64 data integrity). Fix the issue in the appropriate substep and re-run from that point forward.

---

## 8. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

````
You are building Phase 3 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub has 3 content types:
- `article` (~250 records) — has `splash` and `thumbnail` fields (Base64 images stored as string), an `images` field (json, needs investigation), a `markdown` field (text with inline Base64 images as `![alt](data:image/...;base64,...)`), and `mainfile`/`extrafile` media upload fields (same download+reupload pattern as dataset datafile)
- `dataset` — has `datafile` media field pointing to files in Strapi 3's media library, plus many data fields (categories, tags, sources, unit, timeperiod, variables, notes, project, funding, citation, etc.)
- `app` — has an `image` field (string, likely Base64), `description` (text), contributors/categories/tags (json), funding, citation, and TWO dominant m2m relations (datasets, articles). Medium complexity — not trivial

Phase 2 has run, producing:
- `data/raw/articles.json` — all articles with raw Base64 data
- `data/raw/datasets.json` — all datasets with media references  
- `data/raw/apps.json` — all apps

Strapi 3 runs at http://localhost:1337 (needed to download dataset files).
Strapi 5 runs at http://localhost:1338 with API token configured in `config.js` as `strapi5Token`.

## Your Task

Create six scripts and three library modules:

### Libraries

#### `lib/base64-scanner.js`
Export functions:
- `scanStringField(fieldValue)` — returns `{ found: boolean, mimeType, base64Data }` or null. Works for article `splash`, article `thumbnail`, and app `image` fields (all string fields that may contain Base64)
- `scanMarkdownImages(markdown)` — returns array of `{ altText, mimeType, base64Data, matchIndex }` for each Base64 image found in the `markdown` field
- `scanHtmlImages(markdown)` — returns array of `{ mimeType, base64Data }` for any `<img>` tags with Base64 src (safety net)
- `scanJsonField(jsonValue)` — inspects article `images` (json) field and logs its structure; returns any Base64 data found

Detection rules:
- String fields (splash, thumbnail, app image): field starts with `data:image/` OR is a raw Base64 string (check if it decodes to valid image magic bytes)
- Markdown: regex `/!\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)\)/g`
- HTML: regex `/<img[^>]+src="data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)"[^>]*>/g`

#### `lib/base64-decoder.js`
Export functions:
- `decodeBase64ToFile(base64String, outputPath)` — strips whitespace/newlines, strips data URI prefix, decodes with Buffer.from, validates magic bytes, writes to outputPath
- `detectMimeFromBytes(buffer)` — checks first 16 bytes against known magic bytes (PNG, JPEG, GIF, WebP), returns mime string or null

#### `lib/markdown-rewriter.js`
Export functions:
- `rewriteMarkdownImages(markdown, imageMap)` — replaces each `![alt](data:image/...;base64,...)` with `![alt](/uploads/filename.ext)` using the imageMap
- `rewriteHtmlImages(markdown, imageMap)` — same for `<img>` tags
- `checkForRemnants(markdown)` — returns array of positions where `data:image/` still appears

### Scripts

#### `scripts/03a-scan-base64.js`
- Read `data/raw/articles.json` and `data/raw/apps.json`
- For each article, scan `splash`, `thumbnail`, `images` (json), and `markdown` fields using the scanner library
- For each app, scan the `image` field using the scanner library
- Generate filenames: `{slug}-splash.{ext}` for splash, `{slug}-thumbnail.{ext}` for thumbnail, `{slug}-{NNN}.{ext}` for inline (NNN = zero-padded 3-digit index), `app-{slug}-image.{ext}` for app images
- Sanitize slugs (replace non-alphanumeric except hyphens, truncate to 80 chars)
- If no slug, use `article-{id}` or `app-{id}`
- Save manifest to `data/media/manifest.json` with per-image entries and summary stats
- Log progress per article and per app

#### `scripts/03b-decode-base64.js`
- Read `data/media/manifest.json`
- Read `data/raw/articles.json` (to access the actual Base64 data)
- For each manifest entry, extract the Base64 data from the article, decode, validate, save to `data/media/files/{filename}`
- On failure: log error, add to manifest `failures` array, continue processing
- Log progress with success/failure indicators

#### `scripts/03c-upload-media.js`
- Read `data/media/manifest.json`
- For each decoded file in `data/media/files/`:
  - Check if already uploaded (GET `/api/upload/files?filters[name][$eq]={filename}`)
  - If not, upload via POST to `http://localhost:1338/api/upload` with multipart form data
  - Record mapping in `data/maps/media.json`: filename → { sourceArticleId, location, strapi5MediaId, strapi5Url }
- Use configurable delay between uploads (default 100ms)
- Log progress with upload/skip indicators

#### `scripts/03d-rewrite-content.js`
- Read `data/raw/articles.json` and `data/maps/media.json`
- For each article:
  - Replace splash Base64 with Strapi 5 media ID (integer)
  - Replace thumbnail Base64 with Strapi 5 media ID (integer)
  - Rewrite `markdown` field inline images with media URLs
  - Replace `mainfile`/`extrafile` media references with Strapi 5 media IDs
  - Map `id` → `legacyId`
  - Preserve `createdAt`/`updatedAt` as `_originalCreatedAt`/`_originalUpdatedAt`
  - Preserve all other fields: title, status, slug, date, external, categories, tags, authors, images, abstract, mainfiletype, funding, citation, doi, hideFromBanner
  - Preserve relation IDs as `_relatedDatasetIds` (array of Strapi 3 ObjectId strings)
- After all rewrites, scan all `markdown` fields for `data:image/` remnants and warn
- Save to `data/transformed/articles.json`

#### `scripts/03e-transform.js`
Handles datasets, article media files, and apps:

**Datasets:**
- Read `data/raw/datasets.json`
- For each dataset with a non-null `datafile`:
  - Download the file from `http://localhost:1337{datafile.url}`
  - Save to `data/media/files/{original-filename}`
  - Upload to Strapi 5 via `/api/upload`
  - Set `datafile` to new Strapi 5 media ID
- Map `id` → `legacyId`, preserve `createdAt`/`updatedAt` as `_originalCreatedAt`/`_originalUpdatedAt`
- Preserve all fields: title, status, slug, date, external, categories, tags, project, sources, unit, timeperiod, description, notes, variables, funding, citation
- Save to `data/transformed/datasets.json`

**Article media files:**
- Read `data/transformed/articles.json` (output from Step 3d)
- For each article with non-null `mainfile` and/or `extrafile`:
  - Download each file from `http://localhost:1337{mainfile.url}` / `{extrafile.url}`
  - Save to `data/media/files/{original-filename}`
  - Upload to Strapi 5 via `/api/upload`
  - Set `mainfile`/`extrafile` to new Strapi 5 media IDs in the transformed article

**Apps:**
- Read `data/raw/apps.json`
- Map `id` → `legacyId`, preserve `createdAt`/`updatedAt` as `_originalCreatedAt`/`_originalUpdatedAt`
- Process `image` field: if Base64, replace with Strapi 5 media ID from `data/maps/media.json`
- Preserve all fields: title, status, slug, date, external, categories, tags, contributors, description, url, funding, citation
- Preserve relation IDs: `datasets` → `_relatedDatasetIds`, `articles` → `_relatedArticleIds`
- Save to `data/transformed/apps.json`

## Technical Requirements
- ES modules (import/export)
- Native fetch (Node 18+)
- fs/promises for file I/O
- For multipart uploads, use native FormData (Node 18+) or the `form-data` npm package
- Create directories recursively as needed
- All scripts runnable with `node scripts/03x-xxx.js`
- Never abort on individual image/file failures — log and continue
- Config values (API URLs, tokens, delays) come from `config.js`
````

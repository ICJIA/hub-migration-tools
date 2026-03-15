# Doc 03 — Phase 3: Base64 Extraction & Media Migration

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 3 of 5  
**Depends on:** Phase 2 complete (raw JSON extracts in `data/raw/`)  
**Produces:** Decoded image files, uploaded media in Strapi 5, rewritten article content, transformed data for all content types  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Extract all Base64-encoded images from articles (splash fields and inline markdown), decode them to binary files, upload them to the Strapi 5 media library, and rewrite all content to reference the new media URLs. Also migrate dataset Excel files from the Strapi 3 media library to Strapi 5. At the end of this phase, all media exists in Strapi 5 and all content is transformed and ready for loading.

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
| Raw articles | `data/raw/articles.json` | ~250 articles with Base64 splash + inline images |
| Raw datasets | `data/raw/datasets.json` | Datasets with `datafile` media references |
| Raw apps | `data/raw/apps.json` | Flat app data |
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

Scan every article in `data/raw/articles.json` for Base64 image data in two locations:

**1. Splash field.** Check if the `splash` field is non-null and contains a Base64 data URI. Detection: the string starts with `data:image/` or contains a raw Base64 payload (no data URI prefix — some Strapi setups store just the Base64 without the `data:image/...;base64,` header).

**2. Inline markdown images.** Scan the `body` field for markdown images with Base64 data URIs using the regex:

```javascript
const MARKDOWN_BASE64_RE = /!\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)\)/g;
```

**3. HTML fallback scan.** Also check for `<img>` tags with Base64 `src` attributes as a safety net:

```javascript
const HTML_BASE64_RE = /<img[^>]+src="data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)"[^>]*>/g;
```

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
    "totalImages": 412,
    "splashImages": 230,
    "inlineImages": 182,
    "articlesWithNoSplash": 20,
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
- Inline: `{slug}-{NNN}.{ext}` (zero-padded 3-digit index)
- If slug is missing or empty, fall back to `article-{legacyId}-splash.{ext}`
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
  Article 1/250: violent-crime-trends-2024 — 1 splash + 3 inline
  Article 2/250: recidivism-study-2023 — 1 splash + 0 inline
  ...
Scan complete: 412 images found (230 splash, 182 inline)
Manifest saved to data/media/manifest.json
```

---

### Step 3b: Decode Base64 to Binary Files

**Script:** `scripts/03b-decode-base64.js`  
**Library:** `lib/base64-decoder.js`

Read each entry in `data/media/manifest.json`. For each image:

1. Extract the Base64 payload from the raw article data (re-read `data/raw/articles.json`).
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
Decoding 412 images...
  [1/412] violent-crime-trends-2024-splash.png — 135 KB ✓
  [2/412] violent-crime-trends-2024-001.jpg — 188 KB ✓
  ...
  [287/412] old-report-figure-003.png — 0 bytes ✗ FAILED (empty file)
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
const FormData = require('form-data');  // or use native Node 18+ FormData
const fs = require('fs');

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
    "documentId": "abc123def456",
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
    "strapi5DocumentId": "abc123def456",
    "strapi5Url": "/uploads/violent-crime-trends-2024-splash.png"
  },
  "violent-crime-trends-2024-001.jpg": {
    "sourceArticleId": "507f1f77bcf86cd799439011",
    "location": "inline",
    "index": 0,
    "strapi5MediaId": 43,
    "strapi5DocumentId": "def456ghi789",
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

**2. Body field → rewritten markdown.**

Find each `![alt](data:image/...;base64,...)` in the body and replace with `![alt](/uploads/filename.ext)`:

```javascript
function rewriteMarkdownImages(body, articleId, mediaMap) {
  let imageIndex = 0;

  return body.replace(MARKDOWN_BASE64_RE, (match, altText, mimeSubtype, base64Data) => {
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

Also run the HTML `<img>` fallback replacement for any HTML-style Base64 images found in the body.

**3. Map remaining fields.**

Apply the field map from `config/field-map.json` to rename/convert any other fields. Key mappings:

- `id` → `legacyId` (store the MongoDB ObjectId)
- `created_at` / `createdAt` → `_originalCreatedAt` (preserved for Phase 4 timestamp fix, not sent to the API)
- `updated_at` / `updatedAt` → `_originalUpdatedAt` (same)
- `published_at` → dropped (draftAndPublish is disabled in Strapi 5)
- Relation fields (`datasets`, `apps`) → preserve the array of related IDs for Phase 4 relation linking

**4. Write transformed articles.**

```json
[
  {
    "legacyId": "507f1f77bcf86cd799439011",
    "title": "Violent Crime Trends 2024",
    "slug": "violent-crime-trends-2024",
    "body": "# Introduction\n\nThis report examines...\n\n![Chart showing decline](/uploads/violent-crime-trends-2024-001.jpg)\n\n...",
    "splash": 42,
    "_originalCreatedAt": "2024-03-15T10:30:00.000Z",
    "_originalUpdatedAt": "2024-06-01T14:22:00.000Z",
    "_relatedDatasetIds": ["60b8d295f1d2c72a4c9e1234", "60b8d295f1d2c72a4c9e5678"],
    "_relatedAppIds": ["60b8d295f1d2c72a4c9eabcd"]
  }
]
```

Fields prefixed with `_` are metadata consumed by Phase 4 scripts but not sent directly to the Strapi 5 API.

Save to `data/transformed/articles.json`.

**Post-rewrite verification:** After rewriting all articles, scan every transformed `body` field for the string `data:image/`. If any matches are found, log them as warnings — these are Base64 images that were missed by the rewrite process.

**Console output:**
```
Rewriting 250 articles...
  Article 1/250: violent-crime-trends-2024 — splash ✓, 3 inline images ✓
  Article 2/250: recidivism-study-2023 — splash ✓, 0 inline images
  ...
Rewrite complete: 250 articles processed
Post-rewrite scan: 0 Base64 remnants found ✓
Saved to data/transformed/articles.json
```

---

### Step 3e: Migrate Dataset Media

**Script:** `scripts/03e-transform.js` (handles datasets and apps together)

For each dataset in `data/raw/datasets.json`:

1. Check if the `datafile` field is non-null and contains a media reference with a `url`.
2. Download the file from Strapi 3: `GET http://localhost:1337{datafile.url}` (the URL is usually relative, like `/uploads/filename.xlsx`).
3. Save the downloaded file to `data/media/files/{original-filename}`.
4. Upload to Strapi 5 via `/api/upload` (same process as image uploads in Step 3c).
5. Record the mapping in `data/maps/media.json`.
6. In the transformed dataset JSON, set `datafile` to the new Strapi 5 media ID.

**Transformed dataset:**

```json
{
  "legacyId": "60b8d295f1d2c72a4c9e1234",
  "title": "Illinois Crime Statistics 2023",
  "slug": "illinois-crime-statistics-2023",
  "description": "Annual crime data compiled from...",
  "datafile": 88,
  "_originalCreatedAt": "2023-11-01T09:00:00.000Z",
  "_originalUpdatedAt": "2024-01-15T11:30:00.000Z",
  "_relatedArticleIds": []
}
```

Note: Datasets don't have a forward relation to articles (the relation is defined on the article side), so `_relatedArticleIds` will be empty. Relations are linked from the article side in Phase 4.

Save to `data/transformed/datasets.json`.

---

### Step 3f: Transform Apps

Apps have no media and no complex fields. For each app in `data/raw/apps.json`:

1. Map `id` → `legacyId`.
2. Copy `title`, `summary`, `url` directly.
3. Preserve timestamps as `_originalCreatedAt` / `_originalUpdatedAt`.

**Transformed app:**

```json
{
  "legacyId": "60b8d295f1d2c72a4c9eabcd",
  "title": "Illinois Sentence Policy Dashboard",
  "summary": "Interactive visualization of sentencing data across Illinois counties.",
  "url": "https://public.tableau.com/views/SentencingDashboard",
  "_originalCreatedAt": "2023-06-15T08:00:00.000Z",
  "_originalUpdatedAt": "2023-06-15T08:00:00.000Z"
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
| Memory issues processing large articles | Multiple large Base64 strings in a single article body | Process articles one at a time rather than loading all into memory |
| Markdown rewrite corrupts non-image content | Regex matches something it shouldn't | Diff original vs. rewritten body; only `![...](data:image/...)` patterns should change |

---

## 6. Verification

| Check | Method | Pass Criteria |
|-------|--------|--------------|
| All Base64 images found | Manifest image count is plausible (~1–6 per article average) | Manifest summary looks reasonable |
| All files decoded | `ls data/media/files/ | wc -l` matches manifest `totalImages` minus failures | Counts match |
| All files uploaded | Count entries in `data/maps/media.json` matches decoded file count | Counts match |
| Zero Base64 remnants | Grep all `body` fields in `data/transformed/articles.json` for `data:image/` | Zero matches |
| Splash fields are media IDs | Spot check 10 articles in `data/transformed/articles.json` | `splash` is an integer (Strapi 5 media ID), not a Base64 string |
| Inline images are URLs | Spot check 10 article bodies | Image markdown uses `/uploads/...` URLs, not `data:image/...` |
| Dataset files uploaded | Count datasets with non-null `datafile` in raw vs. transformed | Counts match; all have integer media IDs |
| Media accessible in Strapi 5 | Spot check 10 media URLs with `curl http://localhost:1338{url}` | HTTP 200 with correct content-type |
| Legacy IDs present | Spot check all three transformed JSON files | Every record has a `legacyId` string matching MongoDB ObjectId format |
| Timestamps preserved | Spot check `_originalCreatedAt` / `_originalUpdatedAt` in transformed files | Non-null, ISO 8601 format, matches raw data |

---

## 7. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

````
You are building Phase 3 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub.

## Context

ResearchHub has 3 content types:
- `article` (~250 records) — has a `splash` field (Base64 image stored as text) and a `body` field (markdown with inline Base64 images as `![alt](data:image/...;base64,...)`)
- `dataset` — has a `datafile` media field pointing to Excel files in Strapi 3's media library
- `app` — flat data (title, summary, url), no media

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
- `scanSplash(splashField)` — returns `{ found: boolean, mimeType, base64Data }` or null
- `scanMarkdownImages(body)` — returns array of `{ altText, mimeType, base64Data, matchIndex }` for each Base64 image found
- `scanHtmlImages(body)` — returns array of `{ mimeType, base64Data }` for any `<img>` tags with Base64 src (safety net)

Detection rules:
- Splash: field starts with `data:image/` OR is a raw Base64 string (check if it decodes to valid image magic bytes)
- Markdown: regex `!/\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)\)/g`
- HTML: regex `/<img[^>]+src="data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)"[^>]*>/g`

#### `lib/base64-decoder.js`
Export functions:
- `decodeBase64ToFile(base64String, outputPath)` — strips whitespace/newlines, strips data URI prefix, decodes with Buffer.from, validates magic bytes, writes to outputPath
- `detectMimeFromBytes(buffer)` — checks first 16 bytes against known magic bytes (PNG, JPEG, GIF, WebP), returns mime string or null

#### `lib/markdown-rewriter.js`
Export functions:
- `rewriteMarkdownImages(body, imageMap)` — replaces each `![alt](data:image/...;base64,...)` with `![alt](/uploads/filename.ext)` using the imageMap
- `rewriteHtmlImages(body, imageMap)` — same for `<img>` tags
- `checkForRemnants(body)` — returns array of positions where `data:image/` still appears

### Scripts

#### `scripts/03a-scan-base64.js`
- Read `data/raw/articles.json`
- For each article, scan splash field and body field using the scanner library
- Generate filenames: `{slug}-splash.{ext}` for splash, `{slug}-{NNN}.{ext}` for inline (NNN = zero-padded 3-digit index)
- Sanitize slugs (replace non-alphanumeric except hyphens, truncate to 80 chars)
- If no slug, use `article-{id}`
- Save manifest to `data/media/manifest.json` with per-image entries and summary stats
- Log progress per article

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
  - Rewrite body markdown images with media URLs
  - Map `id` → `legacyId`
  - Preserve `created_at`/`updated_at` as `_originalCreatedAt`/`_originalUpdatedAt`
  - Preserve relation IDs as `_relatedDatasetIds` and `_relatedAppIds` (arrays of Strapi 3 ObjectId strings)
- After all rewrites, scan all bodies for `data:image/` remnants and warn
- Save to `data/transformed/articles.json`

#### `scripts/03e-transform.js`
Handles datasets and apps:

**Datasets:**
- Read `data/raw/datasets.json`
- For each dataset with a non-null `datafile`:
  - Download the file from `http://localhost:1337{datafile.url}`
  - Save to `data/media/files/{original-filename}`
  - Upload to Strapi 5 via `/api/upload`
  - Set `datafile` to new Strapi 5 media ID
- Map `id` → `legacyId`, preserve timestamps
- Save to `data/transformed/datasets.json`

**Apps:**
- Read `data/raw/apps.json`
- Map `id` → `legacyId`, preserve timestamps, copy all fields
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

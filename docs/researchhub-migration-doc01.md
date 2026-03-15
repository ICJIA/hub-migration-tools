# Doc 01 — Phase 1: Introspection & Schema Generation

**Project:** ResearchHub Strapi 3 → Strapi 5 Migration  
**Phase:** 1 of 5  
**Depends on:** Running Strapi 3 instance with GraphQL enabled  
**Produces:** Strapi 5 `schema.json` files, field mapping, introspection data  
**Date:** March 2026  
**Status:** Draft

---

## 1. Objective

Introspect the Strapi 3 ResearchHub instance to discover the exact schema of all three content types (`article`, `dataset`, `app`), then programmatically generate the equivalent Strapi 5 `schema.json` files and supporting boilerplate. At the end of this phase, a fresh Strapi 5 instance should start cleanly with all content types, fields, and relations defined — ready to receive data in Phase 2+.

---

## 2. Prerequisites

- Strapi 3 ResearchHub instance running locally with GraphQL plugin enabled (default port 1337).
- Access to the Strapi 3 project source code (specifically `api/*/models/*.settings.json` files).
- A fresh Strapi 5 project initialized (`npx create-strapi@latest`) but with no custom content types yet.
- Node.js 18+ and pnpm installed.
- The migration project scaffolded per the structure in Doc 00, Section 6.

---

## 3. Inputs / Outputs

### Inputs

| Input | Location | Description |
|-------|----------|-------------|
| Strapi 3 GraphQL endpoint | `http://localhost:1337/graphql` | Live introspection target |
| Strapi 3 model files | `strapi3-project/api/*/models/*.settings.json` | Authoritative field definitions with constraints |
| Field type mapping rules | `config/field-type-map.json` | Strapi 3 → Strapi 5 type conversion table |

### Outputs

| Output | Location | Description |
|--------|----------|-------------|
| Strapi 3 introspection data | `data/introspection/strapi3.json` | Full schema snapshot |
| Strapi 3 model data | `data/introspection/strapi3-models.json` | Parsed model JSON files |
| Strapi 5 schema files | `output/strapi5-schemas/*/content-types/*/schema.json` | Generated content type definitions |
| Strapi 5 boilerplate | `output/strapi5-schemas/*/controllers/*.js`, `routes/*.js`, `services/*.js` | Minimal required files |
| Field mapping | `config/field-map.json` | Per-content-type field mapping with type conversions |
| Strapi 5 introspection data | `data/introspection/strapi5.json` | Post-generation verification |
| Schema diff | `data/introspection/schema-diff.json` | Differences between Strapi 3 and Strapi 5 schemas |

---

## 4. Step-by-Step Procedure

### Step 1a: Introspect Strapi 3

**Script:** `scripts/01a-introspect.js`

**What it does:**

1. Run a GraphQL introspection query against `http://localhost:1337/graphql`:

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
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
}
```

2. Filter the introspection result to only include the content type types (exclude built-in GraphQL types like `Query`, `Mutation`, `__Schema`, etc.). The ResearchHub content types will appear as `Article`, `Dataset`, `App` (capitalized) in the GraphQL schema.

3. Parse the Strapi 3 model JSON files directly from the filesystem. For each content type, read:
   - `api/article/models/article.settings.json`
   - `api/dataset/models/dataset.settings.json`
   - `api/app/models/app.settings.json`

   These files contain the authoritative field definitions including:
   - Field types (`string`, `text`, `richtext`, `integer`, `boolean`, `date`, `enumeration`, `json`, `uid`, `media`, etc.)
   - Constraints (`required`, `unique`, `default`, `minLength`, `maxLength`)
   - Relation definitions (`model`, `collection`, `via`, `plugin`)
   - The `splash` field's actual Strapi type (likely `text` or `richtext` — storing Base64)
   - The `datafile` field's type (should be `media`)
   - The `datasets` and `apps` relation field definitions

4. Merge the GraphQL introspection data with the model file data into a unified schema representation. The model files are the source of truth for field types and constraints; the GraphQL data is useful for verifying what's actually exposed via the API.

5. Save:
   - `data/introspection/strapi3.json` — GraphQL introspection result (filtered)
   - `data/introspection/strapi3-models.json` — parsed model file data

**Expected model file structure (Strapi 3):**

```json
{
  "kind": "collectionType",
  "collectionName": "articles",
  "info": {
    "name": "article",
    "description": ""
  },
  "options": {
    "increments": true,
    "timestamps": true
  },
  "attributes": {
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title"
    },
    "body": {
      "type": "richtext"
    },
    "splash": {
      "type": "text"
    },
    "datasets": {
      "collection": "dataset",
      "via": "articles",
      "dominant": true
    },
    "apps": {
      "collection": "app",
      "via": "articles",
      "dominant": true
    }
  }
}
```

> **Note:** The actual field names and types will be confirmed by this step. The above is an educated guess based on what we know. If the model files differ, the schema generator adapts accordingly.

---

### Step 1b: Generate Strapi 5 Schema Files

**Script:** `scripts/01b-generate-schemas.js`  
**Library:** `lib/schema-generator.js`

**What it does:**

1. Read `data/introspection/strapi3-models.json` (output of Step 1a).
2. Read `config/field-type-map.json` (the conversion rules).
3. For each content type, generate a Strapi 5 `schema.json` by:
   - Converting the `info` block to Strapi 5 format (`singularName`, `pluralName`, `displayName`).
   - Converting each attribute using the field type mapping table.
   - Applying special-case overrides (e.g., `splash`: text → media).
   - Converting relations from Strapi 3 syntax to Strapi 5 syntax.
4. Generate boilerplate route, controller, and service files.
5. Write everything to `output/strapi5-schemas/`.
6. Write the field mapping to `config/field-map.json`.

#### Field Type Mapping (`config/field-type-map.json`)

```json
{
  "directMappings": {
    "string": "string",
    "text": "text",
    "richtext": "richtext",
    "integer": "integer",
    "biginteger": "biginteger",
    "float": "float",
    "decimal": "decimal",
    "boolean": "boolean",
    "date": "date",
    "datetime": "datetime",
    "time": "time",
    "json": "json",
    "uid": "uid",
    "enumeration": "enumeration",
    "email": "email",
    "password": "password",
    "media": "media"
  },
  "overrides": {
    "article.splash": {
      "from": "text",
      "to": {
        "type": "media",
        "allowedTypes": ["images"],
        "multiple": false
      },
      "reason": "Base64 string in Strapi 3 → proper media reference in Strapi 5"
    }
  }
}
```

#### Relation Conversion

Strapi 3 and Strapi 5 define relations completely differently. The generator must convert:

**Strapi 3 (article model):**
```json
{
  "datasets": {
    "collection": "dataset",
    "via": "articles",
    "dominant": true
  }
}
```

**Strapi 5 (article schema.json):**
```json
{
  "datasets": {
    "type": "relation",
    "relation": "manyToMany",
    "target": "api::dataset.dataset",
    "inversedBy": "articles"
  }
}
```

**Strapi 5 (dataset schema.json — inverse side):**
```json
{
  "articles": {
    "type": "relation",
    "relation": "manyToMany",
    "target": "api::article.article",
    "mappedBy": "datasets"
  }
}
```

The `dominant: true` side in Strapi 3 becomes the `inversedBy` side in Strapi 5 (the side that "owns" the join table). The non-dominant side gets `mappedBy`.

> **Important:** Even though datasets and apps don't currently define a reverse relation field in Strapi 3, Strapi 5's many-to-many requires both sides to be defined. The generator must add the `articles` field to the dataset and app schemas.

#### Generated Schema Example: Article

```json
{
  "kind": "collectionType",
  "collectionName": "articles",
  "info": {
    "singularName": "article",
    "pluralName": "articles",
    "displayName": "Article",
    "description": "Research articles with markdown body and media"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "legacyId": {
      "type": "string",
      "unique": true
    },
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title"
    },
    "body": {
      "type": "richtext"
    },
    "splash": {
      "type": "media",
      "allowedTypes": ["images"],
      "multiple": false
    },
    "datasets": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::dataset.dataset",
      "inversedBy": "articles"
    },
    "apps": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::app.app",
      "inversedBy": "articles"
    }
  }
}
```

#### Generated Schema Example: App

```json
{
  "kind": "collectionType",
  "collectionName": "apps",
  "info": {
    "singularName": "app",
    "pluralName": "apps",
    "displayName": "App",
    "description": "Dashboard links to Tableau or ShinyProxy"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "legacyId": {
      "type": "string",
      "unique": true
    },
    "title": {
      "type": "string",
      "required": true
    },
    "summary": {
      "type": "text"
    },
    "url": {
      "type": "string",
      "required": true
    },
    "articles": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::article.article",
      "mappedBy": "apps"
    }
  }
}
```

#### Generated Schema Example: Dataset

```json
{
  "kind": "collectionType",
  "collectionName": "datasets",
  "info": {
    "singularName": "dataset",
    "pluralName": "datasets",
    "displayName": "Dataset",
    "description": "Downloadable datasets with Excel files"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "legacyId": {
      "type": "string",
      "unique": true
    },
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title"
    },
    "description": {
      "type": "text"
    },
    "datafile": {
      "type": "media",
      "allowedTypes": ["files"],
      "multiple": false
    },
    "articles": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::article.article",
      "mappedBy": "datasets"
    }
  }
}
```

> **Note:** The above examples show the expected output. The actual generated schemas will include all fields discovered during introspection — these examples only show known fields.

#### Boilerplate Files

For each content type, generate minimal boilerplate that Strapi 5 requires:

**`routes/{content-type}.js`:**
```javascript
const { createCoreRouter } = require('@strapi/strapi').factories;
module.exports = createCoreRouter('api::{name}.{name}');
```

**`controllers/{content-type}.js`:**
```javascript
const { createCoreController } = require('@strapi/strapi').factories;
module.exports = createCoreController('api::{name}.{name}');
```

**`services/{content-type}.js`:**
```javascript
const { createCoreService } = require('@strapi/strapi').factories;
module.exports = createCoreService('api::{name}.{name}');
```

#### Output Directory Structure

```
output/strapi5-schemas/
├── article/
│   ├── content-types/
│   │   └── article/
│   │       └── schema.json
│   ├── controllers/
│   │   └── article.js
│   ├── routes/
│   │   └── article.js
│   └── services/
│       └── article.js
├── dataset/
│   ├── content-types/
│   │   └── dataset/
│   │       └── schema.json
│   ├── controllers/
│   │   └── dataset.js
│   ├── routes/
│   │   └── dataset.js
│   └── services/
│       └── dataset.js
└── app/
    ├── content-types/
    │   └── app/
    │       └── schema.json
    ├── controllers/
    │   └── app.js
    ├── routes/
    │   └── app.js
    └── services/
        └── app.js
```

#### Deploying Schemas to Strapi 5

After generation, copy the output into the Strapi 5 project:

```bash
cp -r output/strapi5-schemas/* /path/to/strapi5-project/src/api/
```

Then start (or restart) Strapi 5 in development mode:

```bash
cd /path/to/strapi5-project
npm run develop
```

Strapi 5 reads the `schema.json` files on startup and auto-creates the SQLite tables. Watch the console output for any schema errors.

---

### Step 1c: Verify Schemas

**Script:** `scripts/01c-verify-schemas.js`

**What it does:**

1. Wait for Strapi 5 to be running (poll `http://localhost:1338/graphql` until it responds).
2. Run the same GraphQL introspection query against Strapi 5.
3. Save as `data/introspection/strapi5.json`.
4. Diff the Strapi 3 and Strapi 5 introspection results.
5. Output `data/introspection/schema-diff.json`.

**Expected diff (things that SHOULD differ):**

- `splash` field: `String` in Strapi 3 → `UploadFile` relation in Strapi 5
- System fields present in Strapi 5 but not Strapi 3: `documentId`, `locale`, `publishedAt` (if draft/publish enabled)
- Relation fields on `dataset` and `app` schemas: `articles` field added (inverse side of m2m)
- ID type: Strapi 3 uses `ID` (MongoDB ObjectId), Strapi 5 uses `ID` (integer) + `documentId` (UUID)

**Unexpected diff (things that SHOULD NOT differ):**

- Missing content types
- Missing fields (other than the expected additions above)
- Wrong field types (e.g., `richtext` became `string`)
- Missing relations

The script exits with a non-zero code if any unexpected differences are found, printing a clear error message listing each discrepancy.

---

### Step 1d: Manual Review Checkpoint

**Human action required.**

Before proceeding to Phase 2:

1. Open the Strapi 5 admin panel at `http://localhost:1338/admin`.
2. Navigate to Content-Type Builder.
3. Verify all three content types appear: Article, Dataset, App.
4. Spot-check that fields look correct — especially:
   - Article `splash` is a Media field (single image), not a text field.
   - Article `datasets` and `apps` are relation fields (many-to-many).
   - Dataset `datafile` is a Media field (single file).
   - App has no media or relation fields other than the inverse `articles` relation.
5. Navigate to Content Manager and confirm each content type is listed and creatable (try creating a dummy entry for each, then delete it).

If anything looks wrong, adjust the `config/field-type-map.json` overrides or the model data, re-run `01b-generate-schemas.js`, copy to Strapi 5, and restart.

---

## 5. Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| GraphQL introspection returns empty or errors | Strapi 3 not running, GraphQL plugin not installed, or authentication required | Start Strapi 3, verify GraphQL plugin is in `plugins.js`, check if API tokens are needed |
| Model JSON files not found | Wrong path to Strapi 3 project | Update `config.js` with correct `strapi3ProjectPath` |
| Strapi 5 won't start after copying schemas | Invalid `schema.json` syntax, unsupported field type, or relation target mismatch | Check Strapi 5 console errors. Common fixes: verify `singularName`/`pluralName` are kebab-case, ensure relation targets use `api::name.name` format, check for typos in field types |
| Strapi 5 starts but content types don't appear | Schema files in wrong directory, or missing `info.singularName`/`info.pluralName` | Verify files are in `src/api/{name}/content-types/{name}/schema.json` (exact path matters) |
| Schema diff shows unexpected missing fields | Field type mapping didn't handle a Strapi 3 type | Add the missing type to `config/field-type-map.json` `directMappings` and re-run |
| Relation errors ("target not found") | Content types generated in wrong order, or `api::` prefix incorrect | Strapi loads all schemas at once, so order shouldn't matter. Check the `target` string format: must be `api::singular-name.singular-name` |

---

## 6. Verification

| Check | Method | Pass Criteria |
|-------|--------|--------------|
| All 3 content types exist in Strapi 5 | GraphQL introspection | `Article`, `Dataset`, `App` types present |
| All fields from Strapi 3 present in Strapi 5 | Schema diff | No unexpected missing fields in `schema-diff.json` |
| `splash` field is media type | Strapi 5 admin panel + introspection | Field type is `UploadFile` relation, not `String` |
| `datafile` field is media type | Strapi 5 admin panel + introspection | Field type is `UploadFile` relation |
| `datasets` m2m relation works | Strapi 5 admin panel | Can see relation picker on Article edit form |
| `apps` m2m relation works | Strapi 5 admin panel | Can see relation picker on Article edit form |
| Inverse relations exist | Strapi 5 admin panel | Dataset and App edit forms show `articles` relation |
| Strapi 5 API responds | `curl http://localhost:1338/api/articles` | Returns `{ "data": [], "meta": { "pagination": {...} } }` |
| Strapi 5 GraphQL responds | POST to `http://localhost:1338/graphql` | Introspection query returns valid schema |
| Field constraints preserved | Compare model files to generated schemas | `required`, `unique`, `default` values match |
| `legacyId` field present on all types | Strapi 5 admin panel + introspection | All three content types have a `legacyId` string field marked unique |

---

## 7. Phase 1 Completion Checklist

Before proceeding to Phase 2, every item below must pass. Items marked **(auto)** should be checked by `scripts/01c-verify-schemas.js`. Items marked **(manual)** require human verification in the Strapi 5 admin panel.

### Automated Gate Checks (`scripts/01c-verify-schemas.js`)

The verification script should exit 0 only if ALL of the following pass:

- [ ] **(auto)** Strapi 5 is running and responds at `http://localhost:1338`
- [ ] **(auto)** GraphQL introspection succeeds against Strapi 5
- [ ] **(auto)** All 3 content types exist in Strapi 5: `Article`, `Dataset`, `App`
- [ ] **(auto)** Every field from Strapi 3 has a corresponding field in Strapi 5 (accounting for expected type changes)
- [ ] **(auto)** `splash` field on Article is type `UploadFile` (media), not `String`
- [ ] **(auto)** `datafile` field on Dataset is type `UploadFile` (media)
- [ ] **(auto)** `datasets` relation on Article exists and is `manyToMany` targeting `api::dataset.dataset`
- [ ] **(auto)** `apps` relation on Article exists and is `manyToMany` targeting `api::app.app`
- [ ] **(auto)** Inverse `articles` relation exists on both Dataset and App schemas
- [ ] **(auto)** `legacyId` field exists on all 3 content types, typed as `string`, marked `unique`
- [ ] **(auto)** `draftAndPublish` is `false` for all 3 content types
- [ ] **(auto)** Strapi 5 REST API responds with empty collection: `GET /api/articles` returns `{ data: [], meta: {...} }`
- [ ] **(auto)** `schema-diff.json` contains only expected differences (system fields, splash type change, inverse relations)
- [ ] **(auto)** Field constraints (`required`, `unique`) from Strapi 3 models are preserved in generated schemas

### Manual Gate Checks (Step 1d)

- [ ] **(manual)** Open Strapi 5 admin panel → Content-Type Builder → all 3 types visible
- [ ] **(manual)** Article edit form shows: `splash` as single image upload, `datasets` and `apps` as relation pickers
- [ ] **(manual)** Dataset edit form shows: `datafile` as single file upload, `articles` as relation picker
- [ ] **(manual)** App edit form shows: `articles` as relation picker, no media fields
- [ ] **(manual)** Create a dummy entry for each content type → save → delete → no errors
- [ ] **(manual)** Review `config/field-map.json` — field names and type conversions look correct

### Parity Assertions

These confirm the generated schemas faithfully represent the source:

| Assertion | How to Verify |
|-----------|---------------|
| Same number of content types | Count types in `strapi3-models.json` vs. generated schemas |
| Same number of fields per type (±expected additions like `legacyId`, inverse relations) | Compare field counts in `schema-diff.json` |
| No fields dropped silently | `schema-diff.json` lists no unexpected missing fields |
| Relation cardinality matches | Both m2m relations in Strapi 3 are m2m in Strapi 5 |
| Field type mapping is correct | `config/field-map.json` entries match the mapping table in this doc |

### Go / No-Go

**Go:** All automated checks pass (exit 0), all manual checks confirmed, `schema-diff.json` reviewed and contains only expected differences.

**No-go:** Any automated check fails, any field is missing or wrong-typed, Strapi 5 won't start. Fix the schema generator, re-run `01b`, re-copy to Strapi 5, restart, and re-verify.

---

## 8. LLM Build Prompt

The following prompt can be fed to Claude to implement this phase. It is self-contained.

---

```
You are building Phase 1 of a Strapi 3 → Strapi 5 migration tool for a project called ResearchHub. 

## Context

ResearchHub has 3 content types in Strapi 3 (MongoDB):
- `article` — research articles with markdown body, a `splash` field (Base64 text), and m2m relations to datasets and apps
- `dataset` — downloadable datasets with a `datafile` media field (Excel files)  
- `app` — dashboard links (title, summary, URL) with no media

The Strapi 3 instance runs at http://localhost:1337 with GraphQL enabled.
A fresh Strapi 5 project exists but has no custom content types yet.

## Your Task

Create three Node.js scripts and one library module:

### 1. `scripts/01a-introspect.js`
- Run a GraphQL introspection query against Strapi 3 at http://localhost:1337/graphql
- Read Strapi 3 model JSON files from the filesystem (path provided in config.js as `strapi3ProjectPath`)
- Parse each `api/*/models/*.settings.json` file
- Save GraphQL introspection to `data/introspection/strapi3.json`
- Save parsed model data to `data/introspection/strapi3-models.json`

### 2. `lib/schema-generator.js`
Export a function `generateStrapi5Schemas(strapi3Models, fieldTypeMap)` that:
- Takes the parsed Strapi 3 model data and a field type mapping config
- Returns an object keyed by content type name, each containing:
  - `schema` — a valid Strapi 5 schema.json object
  - `boilerplate` — controller, route, service file contents
- Converts field types using directMappings from the field type map
- Applies overrides from the field type map (e.g., article.splash: text → media)
- Converts Strapi 3 relation syntax (collection/model/via/dominant) to Strapi 5 syntax (type/relation/target/mappedBy/inversedBy)
- For m2m relations, generates the inverse relation field on the target content type
- Adds a `legacyId` field (type: string, unique: true) to every content type — used to store the original Strapi 3 MongoDB ObjectId for idempotent migration and traceability
- Preserves field constraints (required, unique, default, minLength, maxLength, enum values)
- Sets draftAndPublish: false for all content types
- Uses kebab-case for singularName/pluralName in the info block

### 3. `scripts/01b-generate-schemas.js`
- Read `data/introspection/strapi3-models.json`
- Read `config/field-type-map.json`
- Call `generateStrapi5Schemas()`
- Write each schema.json to `output/strapi5-schemas/{name}/content-types/{name}/schema.json`
- Write boilerplate files to `output/strapi5-schemas/{name}/controllers/{name}.js`, etc.
- Write the field mapping to `config/field-map.json`
- Print a summary of what was generated

### 4. `scripts/01c-verify-schemas.js`
- Run GraphQL introspection against Strapi 5 at http://localhost:1338/graphql
- Load Strapi 3 introspection from `data/introspection/strapi3.json`
- Diff the two schemas, categorizing differences as "expected" or "unexpected"
- Expected: splash type change, new system fields (documentId, etc.), inverse relation fields added
- Save diff to `data/introspection/schema-diff.json`
- Exit 0 if only expected differences; exit 1 if unexpected differences found

### Also create:
- `config/field-type-map.json` with the mapping rules
- `config.js` with API URLs, ports, and path settings

## Technical Requirements
- Use ES modules (import/export)
- Use native fetch (Node 18+)
- No external dependencies beyond what Node.js provides (except for filesystem operations)
- All file I/O uses fs/promises
- Create output directories recursively if they don't exist
- Scripts should be runnable with `node scripts/01a-introspect.js`
- Include clear console.log output showing progress and results
```

---

## Appendix: Strapi 3 → Strapi 5 Relation Conversion Reference

| Strapi 3 Syntax | Strapi 5 Equivalent | Notes |
|-----------------|---------------------|-------|
| `"model": "author"` | `"relation": "manyToOne", "target": "api::author.author"` | belongsTo / many-to-one |
| `"model": "author", "via": "articles"` | `"relation": "oneToOne", "target": "api::author.author", "inversedBy": "articles"` | One-to-one bidirectional |
| `"collection": "tag"` | `"relation": "oneToMany", "target": "api::tag.tag"` | hasMany / one-to-many (unidirectional) |
| `"collection": "dataset", "via": "articles", "dominant": true` | `"relation": "manyToMany", "target": "api::dataset.dataset", "inversedBy": "articles"` | m2m, dominant side owns join table |
| `"collection": "dataset", "via": "articles"` (non-dominant) | `"relation": "manyToMany", "target": "api::article.article", "mappedBy": "datasets"` | m2m, inverse side |

**Key rule:** In Strapi 5, `inversedBy` goes on the side that "owns" the relation (was `dominant: true` in Strapi 3). `mappedBy` goes on the other side.

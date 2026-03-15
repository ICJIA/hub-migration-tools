# ResearchHub Database Migration: Executive Summary

**Project:** ResearchHub Content Migration (Strapi 3 → Strapi 5)  
**Prepared by:** ICJIA Development Team  
**Date:** March 2026  
**Audience:** Project stakeholders and management

---

## What Is This Project?

ResearchHub is ICJIA's platform for publishing research articles, datasets, and data dashboards. The content behind ResearchHub — articles, Excel files, dashboard links, and images — lives in a content management system (CMS) called Strapi. Think of the CMS as a structured filing cabinet that stores all of ResearchHub's content and serves it to the website when someone visits a page.

We are migrating ResearchHub's content from an older version of this CMS (Strapi 3, released in 2020) to the current version (Strapi 5, released in 2024). This is comparable to migrating from an old version of SharePoint or WordPress to a new major release — the fundamental job is the same, but the internal architecture has changed significantly between versions.

---

## Why Is This Migration Necessary?

Strapi 3 reached end of life in 2022. It no longer receives security patches, bug fixes, or compatibility updates. Running production systems on unsupported software creates growing risk over time — both for security vulnerabilities and for compatibility with modern infrastructure. Additionally, Strapi 3 depends on MongoDB, a database that adds hosting complexity and cost. Strapi 5 runs on SQLite, a simpler and more portable database that reduces our infrastructure burden.

This is not a reflection of a poor initial technology choice. Content management systems — whether commercial (Adobe Experience Manager, Sitecore) or open source (WordPress, Drupal, Strapi) — undergo major architectural changes between versions. These changes bring real improvements in performance, security, and developer experience, but they also mean that upgrading between major versions is never a simple "click update." This is an industry-wide reality, not a Strapi-specific problem. A comparable WordPress migration (say, a heavily customized WordPress 4 site to WordPress 6) would involve similar complexity around database schema changes, plugin compatibility, and content restructuring.

---

## What Makes This Migration Complex?

Three factors make this project more involved than a typical version upgrade.

### 1. The Database Engine Changed

Strapi 3 stores its data in MongoDB (a document-oriented database). Strapi 5 stores its data in SQLite (a relational database). These are fundamentally different technologies — there is no "export from one, import to the other" button. It's analogous to migrating from a filing system organized by project folders to one organized by alphabetical index: the same documents exist, but their internal organization is completely different. Every piece of content must be extracted, restructured, and reloaded.

### 2. Images Are Embedded in Article Text

When ResearchHub was originally built, article images — including the hero/splash image for each article — were stored directly inside the article text as encoded data (a format called Base64). This is like pasting a photograph directly into a Word document rather than linking to an image file. It works, but it means each article carries its images as enormous blocks of encoded text rather than as separate files in a media library.

As part of this migration, we are correcting this. Every embedded image (~500–1,500 across ~250 articles) will be extracted, saved as a proper image file in the new system's media library, and the article text will be updated to reference the image by its file location. After migration, images will be properly managed assets rather than text blobs — easier to find, replace, resize, and serve efficiently to users.

### 3. The Data Model Changed Between Versions

Strapi 3 and Strapi 5 use different internal conventions for identifying records, defining relationships between content types, and organizing fields. Record identifiers changed format. Relationship definitions use a different syntax. Field type names shifted. These are not visible to end users, but they mean the migration cannot simply copy data from one system to the other — every record must be translated to the new format.

---

## How Are We Doing It?

We are using an API-to-API transfer approach. Rather than attempting to directly convert one database format into another (which would be fragile and error-prone), we:

1. **Read** all content out of the old system through its standard data interface (API).
2. **Transform** the content to match the new system's format, including extracting and properly storing all embedded images.
3. **Write** the transformed content into the new system through its standard data interface.
4. **Verify** that everything arrived correctly.

This approach is safer than a direct database conversion because each system handles its own internal complexity. We talk to each system in the language it already understands. The tradeoff is that it requires more development work upfront, but it produces a more reliable and verifiable result.

---

## What Content Is Being Migrated?

| Content Type | Description | Approximate Count | Complexity |
|-------------|-------------|-------------------|------------|
| Articles | Research articles with text, images, and links to related datasets and dashboards | ~250 | High — images must be extracted from text and properly stored |
| Datasets | Downloadable data files (Excel spreadsheets) with titles and descriptions | ~42 | Medium — files must be transferred between media libraries |
| Apps (Dashboards) | Links to interactive Tableau and ShinyProxy dashboards | ~15 | Medium — has Base64 image field, two many-to-many relations to articles and datasets |

All relationships between content types (e.g., an article linking to its related datasets) will be preserved.

---

## Project Phases

The migration is divided into five sequential phases. Each phase produces verifiable intermediate results.

| Phase | What Happens | Key Output |
|-------|-------------|------------|
| 1. Schema Setup | Analyze the old system's structure and configure the new system to accept the same content types | New system ready to receive content |
| 2. Data Extraction | Pull all content out of the old system and save it locally | Complete local copy of all ResearchHub content |
| 3. Image & Media Migration | Extract embedded images from articles, store them as proper files, update article text | All images and files transferred; article text cleaned up |
| 4. Content Loading | Load all transformed content into the new system, restore original creation dates | New system fully populated |
| 5. Validation | Automated checks confirming everything migrated correctly | Migration verified or issues identified |

---

## Risk Summary

| Risk | What Could Go Wrong | Impact | How We're Addressing It |
|------|---------------------|--------|------------------------|
| Image extraction misses some images | Some articles could display with broken images or leftover encoded data in their text | High | Automated scanning catches all images; post-migration verification confirms zero encoded images remain |
| Content is corrupted during transfer | Article text, titles, or descriptions could be garbled or truncated | High | Automated comparison between old and new system catches discrepancies; content is never modified in place — the original data is preserved throughout |
| Original dates are overwritten | All articles would appear to have been created on migration day, losing the historical publication timeline | High | Dates are explicitly captured from the old system and restored in the new system after loading |
| Migration fails partway through | Some content loaded, some not — leaving the new system in an inconsistent state | Medium | The migration is designed to be safely re-runnable. If it fails at article #150, re-running picks up at #151 without duplicating the first 150 |
| Relationships between content are lost | Articles lose their connections to related datasets and dashboards | Medium | Relationships are migrated in a dedicated step and verified by automated checks |
| Data files (Excel) fail to transfer | Datasets would link to missing files | Medium | Each file transfer is verified individually; failures are logged for manual resolution |

---

## Success Criteria

The migration will be considered complete when all of the following are confirmed by automated verification:

1. **All records transferred.** The new system contains exactly the same number of articles, datasets, and dashboards as the old system.
2. **All images properly stored.** Every image that was embedded as encoded text in the old system is now a proper file in the new system's media library. Zero encoded images remain in any article text.
3. **All data files transferred.** Every Excel file associated with a dataset is accessible in the new system.
4. **All relationships intact.** Articles link to the same datasets and dashboards they linked to in the old system.
5. **All dates preserved.** Original creation and modification dates match between the old and new systems.
6. **No duplicate records.** Every piece of content appears exactly once.
7. **Website functions correctly.** Manual review of the live ResearchHub site confirms articles, images, datasets, and dashboard links all work as expected.

---

## Timeline and Effort

The migration is a development project, not a content editing task. No manual data entry is required — all content transfer is automated by custom scripts. The primary effort is in building and testing these scripts.

| Activity | Estimated Effort |
|----------|-----------------|
| Phase 1: Schema setup and configuration | 1–2 days |
| Phase 2: Data extraction scripts | 1 day |
| Phase 3: Image extraction and media migration scripts | 2–3 days |
| Phase 4: Content loading and timestamp restoration | 1–2 days |
| Phase 5: Validation and issue resolution | 1–2 days |
| Manual QA and frontend verification | 1 day |
| **Total estimated effort** | **7–11 working days** |

These estimates assume a single developer. The work is sequential — each phase depends on the previous phase's output.

---

## What This Project Does NOT Change

- **The ResearchHub website itself.** End users will not see a different website. The frontend remains the same; only the backend content system is replaced.
- **The content.** No articles, datasets, or dashboards are being added, removed, or edited. The content is migrated as-is.
- **Who manages the content.** The same staff who currently manage ResearchHub content will continue to do so. The Strapi 5 admin interface is similar to Strapi 3's.

---

## A Note on CMS Migrations

Content management system migrations are one of the most common and most underestimated tasks in web development. Every major CMS — whether it's WordPress, Drupal, Adobe Experience Manager, Sitecore, or Strapi — eventually requires a major version upgrade that involves data migration. This is not a failure of any particular product; it's a natural consequence of software evolution.

The complexity of a CMS migration is driven by how much content exists, how that content is structured, and how much the internal architecture changed between versions. ResearchHub's migration is moderately complex: a manageable number of content types (3) with a manageable volume (~250 articles), but with the added wrinkle of embedded images that need extraction and proper storage.

The approach we're taking — automated extraction, transformation, loading, and verification — is industry best practice for this type of migration. It prioritizes data integrity over speed, and it produces a verifiable result at every stage.

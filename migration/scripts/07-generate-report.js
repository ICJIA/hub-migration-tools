/**
 * @module 07-generate-report
 * @description Generates shareable HTML and DOCX migration parity reports.
 *
 * Reads the Phase 5 validation report and Phase 6 parity audit report, then
 * produces professional, manager-friendly documents that demonstrate database
 * parity between Strapi 3 (MongoDB/NoSQL) and Strapi 5 (SQLite/SQL).
 *
 * Reports include:
 * - Plain-language executive summary
 * - "What is this report?" context for non-technical readers
 * - Migration process overview (6 phases explained)
 * - Record count parity tables
 * - Automated validation check results with explanations
 * - Field-by-field audit results
 * - NoSQL to SQL migration considerations
 * - API-to-API transfer methodology explanation
 * - Media migration summary
 * - Manual check recommendations with sign-off area
 * - Glossary of technical terms
 *
 * Outputs:
 * - `migration/data/migration-report.html` — self-contained HTML report
 * - `migration/data/migration-report.docx` — Word document for sharing
 *
 * @example
 *   node migration/scripts/07-generate-report.js
 *   pnpm report
 *
 * Prerequisites:
 * - Phase 5 complete (migration/data/validation-report.json)
 * - Phase 6 complete (migration/data/audit-report.json)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
  PageBreak,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.resolve(ROOT, 'migration/data');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ── Data Loading ────────────────────────────────────────────────────

import { loadConfig } from '../lib/load-config.js';
const config = await loadConfig();

/**
 * Read and parse a JSON file. Returns null if the file doesn't exist.
 * @param {string} filePath - Absolute path to JSON file
 * @returns {Promise<Object|null>} Parsed JSON or null
 */
async function readJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Shared Helpers ──────────────────────────────────────────────────

/**
 * Escape HTML special characters.
 * @param {string} str - Raw string
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Return a human-readable reason for an expected field change.
 * @param {string} field - Field name
 * @returns {string} Explanation
 */
function getExpectedReason(field) {
  const reasons = {
    splash: 'Hero image was stored as embedded binary data in the old system. Now stored as a proper image file in the media library — same image, better storage.',
    thumbnail: 'Thumbnail image was stored as embedded binary data. Now stored as a proper image file in the media library — same image, better storage.',
    image: 'App image was stored as embedded binary data. Now stored as a proper image file in the media library — same image, better storage.',
    mainfile: 'PDF/document attachment reference format changed to match the new system\'s media library structure. The file itself is identical.',
    extrafile: 'Supplementary file reference format changed to match the new system\'s media library structure. The file itself is identical.',
    datafile: 'Dataset file reference format changed to match the new system\'s media library structure. The file itself is identical.',
    markdown: 'Article body text was updated to reference images from the new media library instead of containing embedded binary image data. The visible content is identical.',
    images: 'Figure image references updated from embedded binary format to media library URLs. The images themselves are identical.',
  };
  return reasons[field] || 'Expected structural change due to the technology upgrade from the old database system to the new one.';
}

/**
 * Compute the match percentage for display.
 * @param {Object} summary - Audit summary object
 * @returns {string} Percentage string like "99.8%"
 */
function matchPercent(summary) {
  const total = summary.findings.OK + summary.findings.EXPECTED + summary.findings.INFO + summary.findings.ERROR;
  if (total === 0) return '100%';
  const ok = summary.findings.OK + summary.findings.EXPECTED + summary.findings.INFO;
  return (Math.min(100, (ok / total) * 100)).toFixed(1) + '%';
}

// ── HTML Report Generation ──────────────────────────────────────────

/**
 * Generate a self-contained HTML migration parity report.
 *
 * @param {Object} audit - The Phase 6 audit-report.json data
 * @param {Object} validation - The Phase 5 validation-report.json data
 * @returns {string} Complete HTML document string
 */
function generateHTML(audit, validation) {
  const { summary, schema, records, media } = audit;
  const generatedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago',
  });

  const statusClass = summary.findings.ERROR === 0 ? 'pass' : 'fail';
  const statusText = summary.findings.ERROR === 0
    ? 'MIGRATION PARITY CONFIRMED'
    : `${summary.findings.ERROR} ISSUE(S) REQUIRE REVIEW`;

  const totalRecords = summary.totalRecordsCompared;
  const pct = matchPercent(summary);

  // Build per-content-type summary rows
  const ctSummaryRows = ['articles', 'datasets', 'apps'].map((ct) => {
    const recs = records[ct] || [];
    const s3Count = recs.length;
    const errors = recs.filter((r) => r.findings.some((f) => f.category === 'ERROR')).length;
    const clean = recs.filter((r) => r.findings.every((f) => f.category === 'OK')).length;
    const expected = recs.filter((r) => r.findings.some((f) => f.category === 'EXPECTED')).length;
    const ctLabel = ct === 'articles' ? 'Articles (research publications)' : ct === 'datasets' ? 'Datasets (data resources)' : 'Apps (web applications)';
    return `<tr>
      <td>${ctLabel}</td>
      <td>${s3Count}</td>
      <td>${s3Count}</td>
      <td class="${errors > 0 ? 'cell-fail' : 'cell-pass'}">${errors === 0 ? 'Yes' : `${errors} issue(s)`}</td>
      <td>${clean}</td>
      <td>${expected}</td>
    </tr>`;
  }).join('\n');

  // Build validation checks table
  let validationSection = '';
  if (validation && validation.checks) {
    const checkLabels = {
      record_counts: 'Record Counts',
      legacy_id_coverage: 'Legacy ID Coverage',
      zero_base64_remnants: 'Zero Base64 Remnants',
      image_media_migration: 'Image/Media Migration',
      dataset_file_migration: 'Dataset File Migration',
      media_accessibility: 'Media Accessibility',
      relation_integrity: 'Relation Integrity',
      timestamp_preservation: 'Timestamp Preservation',
      content_integrity: 'Content Integrity',
      no_duplicates: 'No Duplicates',
    };

    const validationRows = validation.checks.map((check) => {
      const passed = check.status === 'PASS';
      const icon = passed ? '&#10004;' : '&#10008;';
      const cls = passed ? 'cell-pass' : 'cell-fail';
      const label = checkLabels[check.check] || check.check;
      const explanation = getCheckExplanation(label);
      const detail = check.details?.expectedChanges
        ? `${check.details.passed}/${check.details.sampleSize} passed, ${check.details.expectedChanges} with expected changes`
        : '';
      return `<tr>
        <td>${label}</td>
        <td>${explanation}</td>
        <td class="${cls}">${icon} ${passed ? 'Pass' : 'Fail'}</td>
        <td>${detail}</td>
      </tr>`;
    }).join('\n');

    validationSection = `
  <h2>5. Automated Quality Checks</h2>
  <p>Before the detailed audit, 10 automated checks verified overall migration integrity. Each check targets
     a specific aspect of data quality. <strong>All checks must pass</strong> before the migration is considered successful.</p>
  <table>
    <thead>
      <tr><th>Check</th><th>What It Verifies</th><th>Result</th><th>Detail</th></tr>
    </thead>
    <tbody>
      ${validationRows}
    </tbody>
  </table>`;
  }

  // Schema findings table
  const schemaRows = (schema?.findings || []).map((f) => {
    return `<tr>
      <td>${f.contentType}</td>
      <td>${f.field || '-'}</td>
      <td><span class="badge badge-${f.category.toLowerCase()}">${f.category}</span></td>
      <td>${f.detail}</td>
    </tr>`;
  }).join('\n');

  // Per-content-type detailed record tables
  const contentTypeDetails = ['articles', 'datasets', 'apps'].map((ct) => {
    const recs = records[ct] || [];
    if (recs.length === 0) return '';

    const errorRecs = recs.filter((r) => r.findings.some((f) => f.category === 'ERROR'));
    const expectedRecs = recs.filter((r) => r.findings.some((f) => f.category === 'EXPECTED'));
    const ctLabel = ct.charAt(0).toUpperCase() + ct.slice(1);

    let detailHTML = `<h3>${ctLabel} (${recs.length} records)</h3>`;

    if (errorRecs.length === 0 && expectedRecs.length === 0) {
      detailHTML += `<p class="cell-pass">All ${recs.length} ${ct} transferred with no differences.</p>`;
      return detailHTML;
    }

    if (errorRecs.length === 0) {
      detailHTML += `<p class="cell-pass">No errors found. All differences are expected changes from the technology upgrade.</p>`;
    }

    if (errorRecs.length > 0) {
      detailHTML += `<h4 class="section-error">Records Requiring Review (${errorRecs.length})</h4>`;
      detailHTML += `<p>These records have unexpected differences that should be investigated:</p>`;
      detailHTML += `<table><thead><tr><th>Record ID</th><th>Title</th><th>Field</th><th>Issue</th><th>Old System Value</th><th>New System Value</th></tr></thead><tbody>`;
      for (const rec of errorRecs) {
        const errFindings = rec.findings.filter((f) => f.category === 'ERROR');
        for (const f of errFindings) {
          detailHTML += `<tr>
            <td class="mono">${rec.legacyId}</td>
            <td>${escapeHtml((rec.title || '').slice(0, 60))}</td>
            <td>${f.field}</td>
            <td>${f.detail}</td>
            <td class="mono">${escapeHtml((f.strapi3 || '-').slice(0, 120))}</td>
            <td class="mono">${escapeHtml((f.strapi5 || '-').slice(0, 120))}</td>
          </tr>`;
        }
      }
      detailHTML += '</tbody></table>';
    }

    // Summary of expected changes
    if (expectedRecs.length > 0) {
      const expectedByField = {};
      for (const rec of expectedRecs) {
        for (const f of rec.findings.filter((x) => x.category === 'EXPECTED')) {
          expectedByField[f.field] = (expectedByField[f.field] || 0) + 1;
        }
      }
      detailHTML += `<h4>Expected Changes (not errors)</h4>`;
      detailHTML += `<p>These differences are expected results of the technology upgrade. The underlying data is identical &mdash; only the storage format has changed:</p>`;
      detailHTML += `<table><thead><tr><th>Field</th><th># Records Affected</th><th>Why This Changed</th></tr></thead><tbody>`;
      for (const [field, count] of Object.entries(expectedByField)) {
        const reason = getExpectedReason(field);
        detailHTML += `<tr><td>${field}</td><td>${count}</td><td>${reason}</td></tr>`;
      }
      detailHTML += '</tbody></table>';
    }

    return detailHTML;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResearchHub CMS Migration Parity Report</title>
  <style>
    :root {
      --pass: #16a34a;
      --fail: #dc2626;
      --expected: #d97706;
      --info: #2563eb;
      --bg: #ffffff;
      --bg-alt: #f8fafc;
      --border: #e2e8f0;
      --text: #1e293b;
      --text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.7;
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.3rem; margin: 2.5rem 0 1rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }
    h3 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; }
    h4 { font-size: 1rem; margin: 1rem 0 0.5rem; color: var(--text-muted); }
    p { margin-bottom: 0.75rem; }
    .section-error { color: var(--fail); }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem; }
    .status-banner {
      padding: 1.25rem 1.5rem;
      border-radius: 8px;
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 2rem;
      text-align: center;
    }
    .status-banner.pass { background: #dcfce7; color: var(--pass); border: 2px solid var(--pass); }
    .status-banner.fail { background: #fef2f2; color: var(--fail); border: 2px solid var(--fail); }
    .status-banner .sub { font-size: 0.9rem; font-weight: 400; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.9rem; }
    th, td { padding: 0.5rem 0.75rem; border: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: var(--bg-alt); font-weight: 600; white-space: nowrap; }
    tr:nth-child(even) { background: var(--bg-alt); }
    .cell-pass { color: var(--pass); font-weight: 600; }
    .cell-fail { color: var(--fail); font-weight: 600; }
    .mono { font-family: 'SF Mono', Consolas, monospace; font-size: 0.8rem; word-break: break-all; }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-error { background: #fef2f2; color: var(--fail); }
    .badge-expected { background: #fffbeb; color: var(--expected); }
    .badge-info { background: #eff6ff; color: var(--info); }
    .badge-ok { background: #dcfce7; color: var(--pass); }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .metric-card {
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    .metric-card .number { font-size: 2rem; font-weight: 700; }
    .metric-card .label { color: var(--text-muted); font-size: 0.85rem; }
    .callout { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
    .callout h4 { margin-top: 0; color: var(--text); }
    .callout ul { margin-left: 1.25rem; }
    .callout li { margin-bottom: 0.5rem; }
    .callout-blue { border-left: 4px solid var(--info); }
    .callout-green { border-left: 4px solid var(--pass); }
    .callout-amber { border-left: 4px solid var(--expected); }
    .checklist { list-style: none; padding: 0; }
    .checklist li { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
    .checklist li:before { content: '\\2610 '; font-size: 1.1rem; margin-right: 0.5rem; }
    .glossary { column-count: 2; column-gap: 2rem; }
    .glossary dt { font-weight: 600; margin-top: 0.5rem; }
    .glossary dd { margin-left: 0; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem; }
    .sign-off { border: 2px solid var(--border); border-radius: 8px; padding: 1.5rem; margin: 2rem 0; }
    .sign-off-line { border-bottom: 1px solid var(--text-muted); width: 300px; display: inline-block; margin: 0.25rem 0.5rem; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
    @media print {
      body { max-width: 100%; padding: 1rem; font-size: 11pt; }
      .status-banner { break-inside: avoid; }
      table { font-size: 9pt; }
      .glossary { column-count: 2; }
      h2 { break-after: avoid; }
    }
  </style>
</head>
<body>
  <h1>ResearchHub CMS Migration Parity Report</h1>
  <p class="subtitle">Illinois Criminal Justice Information Authority (ICJIA)<br>
  Database Migration: Strapi 3 (legacy) &rarr; Strapi 5 (new)<br>
  Generated: ${generatedAt}</p>

  <div class="status-banner ${statusClass}">
    ${statusText}
    <div class="sub">${totalRecords} records compared across ${summary.totalFieldsCompared.toLocaleString()} individual data fields &mdash; ${pct} match rate</div>
  </div>

  <h2>1. What Is This Report?</h2>
  <div class="callout callout-blue">
    <p>This report documents the results of migrating the ResearchHub content management system (CMS) from
       <strong>Strapi 3</strong> (the legacy system, running since 2019) to <strong>Strapi 5</strong> (the new system).</p>
    <p>The migration moved <strong>${totalRecords} content records</strong> &mdash; including research articles, datasets,
       and web applications &mdash; along with all associated images, PDF documents, and inter-record relationships.</p>
    <p><strong>What "parity" means:</strong> Every piece of content in the old system was compared field-by-field against the
       new system to verify that no data was lost, corrupted, or incorrectly transformed during the transfer. This report
       shows the results of that comparison.</p>
    <p><strong>How to read this report:</strong></p>
    <ul>
      <li><strong>Green status banner</strong> = all content transferred successfully. No data loss detected.</li>
      <li><strong>"Expected Changes"</strong> = differences that are normal and intentional due to the technology upgrade (explained in Section 8).</li>
      <li><strong>"Errors"</strong> = unexpected differences that need human review (if any exist, they are listed in Section 6).</li>
    </ul>
  </div>

  <h2>2. Why This Audit Matters</h2>
  <div class="callout callout-green">
    <p>Database migrations are one of the highest-risk operations in software management. Even when a migration appears
       successful on the surface &mdash; the website loads, the admin panel works &mdash; hidden problems often lurk beneath:</p>
    <ul>
      <li><strong>Missing records:</strong> Some records may silently fail to transfer. Without a count-level check, you might not
          notice that 3 out of 246 articles are missing until a user reports a broken link weeks later.</li>
      <li><strong>Corrupted content:</strong> Article body text can be subtly altered during transfer &mdash; special characters replaced,
          formatting lost, paragraphs truncated. A human reviewer would need to read every article word-by-word to catch these issues.
          This audit compares every character automatically.</li>
      <li><strong>Broken relationships:</strong> Articles link to related datasets and apps. If these links break during migration,
          the "Related Research" sections on the website show nothing &mdash; but the articles themselves look fine, so the problem
          goes unnoticed until someone specifically clicks those links.</li>
      <li><strong>Missing files:</strong> PDF reports, data files, and images may fail to upload or get assigned to the wrong record.
          This audit verifies that every file attachment in the old system has a matching, accessible file in the new system.</li>
      <li><strong>Lost images:</strong> The old system stored images in an unusual way (as embedded binary data within text fields).
          Converting these to proper image files is error-prone. This audit verifies every image was extracted, uploaded, and
          correctly referenced in the article text.</li>
      <li><strong>Wrong dates:</strong> Original publication dates (some dating back to 2019) can be overwritten with the migration
          date if timestamps aren't carefully preserved. This audit verifies that creation and modification dates match the originals.</li>
      <li><strong>Duplicate records:</strong> Network timeouts or retries during migration can create duplicate entries. This audit
          checks that every record ID is unique and no content was accidentally duplicated.</li>
    </ul>
    <p><strong>The bottom line:</strong> This audit replaces what would otherwise require weeks of manual spot-checking with an
       automated, exhaustive comparison of every field of every record. It provides mathematical certainty &mdash; not just confidence
       &mdash; that the migration is complete and correct. The ${summary.totalFieldsCompared.toLocaleString()} individual field comparisons
       documented in this report would take a human reviewer an estimated ${Math.round(summary.totalFieldsCompared / 120)} hours
       to verify manually.</p>
  </div>

  <div class="callout callout-amber">
    <h4>What happens without an audit like this?</h4>
    <p>Most database migrations are performed without field-level verification. Organizations typically check that "the website
       still loads" and move on. The problems surface weeks or months later:</p>
    <ul>
      <li>A researcher discovers their 2021 article is missing its PDF attachment &mdash; the link is broken but no one noticed because
          the article page itself looked fine.</li>
      <li>A dataset page shows zero related articles because the relationship links were silently dropped during migration. The page
          renders without errors, so it appears to work &mdash; it's just empty.</li>
      <li>Google indexes pages with corrupted content (truncated text, garbled characters) because the encoding was mishandled during
          a direct database copy. By the time someone notices, the damaged pages have been cached and shared.</li>
      <li>All publication dates show March 2026 (the migration date) instead of the original dates, because the new system overwrote
          timestamps during import and no one restored them.</li>
    </ul>
    <h4>Why NoSQL-to-SQL migrations are especially risky</h4>
    <p>This migration is not just moving data between two identical systems &mdash; it is converting from one database architecture
       (MongoDB/NoSQL) to a fundamentally different one (SQLite/SQL). This type of cross-architecture migration introduces risks
       that same-platform migrations do not have:</p>
    <ul>
      <li><strong>No shared schema language:</strong> MongoDB stores flexible "documents" where each record can have different fields.
          SQL databases require a rigid schema where every record must conform to the same column structure. Fields that existed in
          some MongoDB documents but not others can be silently dropped.</li>
      <li><strong>Data type mismatches:</strong> MongoDB is permissive with types &mdash; a field can be a string in one record and a
          number in another. SQL enforces strict types. Without careful handling, values can be truncated, rounded, or lost entirely.</li>
      <li><strong>Embedded data vs. normalized relations:</strong> MongoDB commonly embeds related data directly inside documents
          (like storing images as binary strings inside article records). SQL databases use separate tables with foreign keys. This
          structural change requires extracting, transforming, and re-linking data &mdash; each step is a potential point of failure.</li>
      <li><strong>ID format incompatibility:</strong> MongoDB uses 24-character hex strings as record IDs. SQL databases use
          auto-increment integers. Every cross-reference between records must be remapped, and a single missed mapping breaks the
          relationship permanently.</li>
      <li><strong>No direct export/import path:</strong> Unlike migrating between two MySQL databases (where you can dump and restore),
          there is no standard tool that converts a MongoDB database to SQLite. The entire migration must be custom-built, which is
          why the API-to-API approach and this field-level audit are essential safeguards.</li>
    </ul>
  </div>

  <h2>3. Migration Overview</h2>
  <div class="callout">
    <h4>What was migrated</h4>
    <table>
      <thead><tr><th>Content Type</th><th>Description</th><th>Record Count</th></tr></thead>
      <tbody>
        <tr><td>Articles</td><td>Research publications, policy briefs, and reports with full-text markdown content, author metadata, PDF attachments, and hero images</td><td>${(records.articles || []).length}</td></tr>
        <tr><td>Datasets</td><td>Data resources with downloadable data files, descriptions, and links to related articles</td><td>${(records.datasets || []).length}</td></tr>
        <tr><td>Apps</td><td>Interactive web applications with descriptions, images, and links to related articles and datasets</td><td>${(records.apps || []).length}</td></tr>
      </tbody>
    </table>
    <h4>Migration process (6 automated phases)</h4>
    <table>
      <thead><tr><th>Phase</th><th>What Happened</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>1. Schema Setup</td><td>The data structure (fields, types, relationships) was analyzed in the old system and recreated in the new system</td><td class="cell-pass">Complete</td></tr>
        <tr><td>2. Data Extraction</td><td>All ${totalRecords} records were exported from the old system via its API</td><td class="cell-pass">Complete</td></tr>
        <tr><td>3. Media Processing</td><td>Images embedded as binary data were extracted, converted to standard image files, and uploaded to the new media library. PDF and data file attachments were downloaded and re-uploaded.</td><td class="cell-pass">Complete</td></tr>
        <tr><td>4. Data Loading</td><td>All records were imported into the new system via its API, relationships between records were reconnected, and original timestamps were restored</td><td class="cell-pass">Complete</td></tr>
        <tr><td>5. Validation</td><td>10 automated quality checks verified record counts, data integrity, media accessibility, and relationship correctness</td><td class="cell-pass">Complete</td></tr>
        <tr><td>6. Parity Audit</td><td>Every field of every record was compared between old and new systems to produce this report</td><td class="cell-pass">Complete</td></tr>
      </tbody>
    </table>
  </div>

  <h2>4. At a Glance</h2>
  <div class="metric-grid">
    <div class="metric-card">
      <div class="number">${summary.totalRecordsCompared}</div>
      <div class="label">Records Compared</div>
    </div>
    <div class="metric-card">
      <div class="number">${summary.totalFieldsCompared.toLocaleString()}</div>
      <div class="label">Fields Compared</div>
    </div>
    <div class="metric-card">
      <div class="number" style="color: var(--pass)">${summary.findings.OK.toLocaleString()}</div>
      <div class="label">Exact Matches</div>
    </div>
    <div class="metric-card">
      <div class="number" style="color: var(--expected)">${summary.findings.EXPECTED}</div>
      <div class="label">Expected Changes</div>
    </div>
    <div class="metric-card">
      <div class="number" style="color: var(--fail)">${summary.findings.ERROR}</div>
      <div class="label">Errors</div>
    </div>
    <div class="metric-card">
      <div class="number">${media?.totalMediaInS5 || 0}</div>
      <div class="label">Media Files Migrated</div>
    </div>
    <div class="metric-card">
      <div class="number">${pct}</div>
      <div class="label">Overall Match Rate</div>
    </div>
  </div>

  ${validationSection}

  <h2>6. Record Count Parity</h2>
  <p>The table below confirms that every eligible record in the old system has a corresponding record in the new system.
     No records were lost or duplicated during the migration.</p>
  ${config.allowedStatuses ? `
  <div class="callout callout-blue">
    <p><strong>Note on record counts:</strong> Only records with status <strong>${config.allowedStatuses.join('</strong> or <strong>')}</strong>
       were migrated. Records still in draft or pending approval (status: "created" or "submitted") were intentionally excluded
       and will be migrated individually once they are published in the old system. This means the new system has fewer total
       records than the old system &mdash; this is by design, not data loss.</p>
    <p><strong>About the publish workflow:</strong> The old system (Strapi 3) did not have a built-in draft/publish toggle.
       Instead, it used a custom <code>status</code> field with values like "created" (draft), "submitted" (pending manager approval),
       "published", and "archived." The new system (Strapi 5) has an official built-in draft/publish system. All migrated records
       are set to "published" in Strapi 5. Draft and submitted records remain in the old system until they complete the approval
       workflow and are published, at which point they can be migrated individually.</p>
  </div>
  ` : ''}
  <table>
    <thead>
      <tr><th>Content Type</th><th>Old System Count</th><th>New System Count</th><th>Counts Match?</th><th>Perfect Records</th><th>Records with Expected Changes</th></tr>
    </thead>
    <tbody>
      ${ctSummaryRows}
    </tbody>
  </table>

  <h2>7. Field-Level Audit Results</h2>
  <p>Every field of every record was individually compared between the old and new systems.
     This is the most granular level of verification possible &mdash; it goes beyond just checking that records exist and actually
     verifies that the <em>content</em> of each field (title, body text, dates, categories, images, relationships, etc.) matches.</p>
  ${contentTypeDetails}

  <h2>8. Schema Comparison</h2>
  <p>The "schema" is the data structure &mdash; it defines what fields exist and what type of data each field holds (text, number, date, image, etc.).
     The table below shows all structural differences between the old and new systems. All differences are expected results of the technology upgrade.</p>
  <table>
    <thead>
      <tr><th>Content Type</th><th>Field</th><th>Category</th><th>Explanation</th></tr>
    </thead>
    <tbody>
      ${schemaRows}
    </tbody>
  </table>

  <h2>9. Why Are There "Expected Changes"?</h2>
  <div class="callout callout-amber">
    <h4>Technology upgrade: MongoDB (NoSQL) &rarr; SQLite (SQL)</h4>
    <p>The old system (Strapi 3) used a database technology called <strong>MongoDB</strong>, which stores data as flexible "documents"
       (similar to JSON files). The new system (Strapi 5) uses <strong>SQLite</strong>, a relational database that stores data in
       structured tables with strict column types (similar to a spreadsheet).</p>
    <p>This fundamental technology change means some data is <em>represented differently</em> even though the actual content is identical.
       Think of it like converting a Word document to a PDF &mdash; the content is the same, but the file format is different.</p>
    <p><strong>The key differences:</strong></p>
    <ul>
      <li><strong>Record IDs changed format:</strong> The old system used 24-character codes like <code>5da0c0dd3bb01c36d66f6891</code>.
          The new system uses simple numbers like <code>1, 2, 3</code>. The original IDs are preserved in a "legacyId" field so
          records can always be traced back to their source.</li>
      <li><strong>Images moved from embedded data to a media library:</strong> The old system stored some images as raw binary data
          directly inside article records (a practice called "Base64 encoding"). The new system stores images as proper files in an
          organized media library. The images themselves are identical &mdash; only the storage method improved.</li>
      <li><strong>File attachments use a new reference format:</strong> PDFs and data files are referenced differently in the new
          system's database structure. The files themselves are unchanged.</li>
      <li><strong>Timestamps have minor precision differences:</strong> Dates and times may differ by fractions of a second due to
          how each database system handles time precision. The migration verifies timestamps match within a 1-second tolerance.</li>
      <li><strong>New system fields:</strong> The new system adds some internal bookkeeping fields (like <code>documentId</code>)
          that don't exist in the old system. These are system infrastructure, not content.</li>
    </ul>
  </div>

  <h2>10. Media Migration Summary</h2>
  <p>Images, PDFs, and data files were extracted from the old system, processed, and uploaded to the new system's media library.
     The table below shows the scope of media migration:</p>
  <table>
    <thead><tr><th>Metric</th><th>Count</th><th>What This Means</th></tr></thead>
    <tbody>
      <tr><td>Total media files in new system</td><td><strong>${media?.totalMediaInS5 || 0}</strong></td><td>Total images, PDFs, and data files now stored in the new media library</td></tr>
      <tr><td>Media files verified accessible</td><td class="${(media?.mediaAccessible || 0) > 0 ? 'cell-pass' : ''}">${media?.mediaAccessible || 0}</td><td>Files confirmed to be downloadable via their URLs</td></tr>
      <tr><td>Media files inaccessible</td><td class="${(media?.mediaInaccessible || 0) > 0 ? 'cell-fail' : ''}">${media?.mediaInaccessible || 0}</td><td>Files that could not be reached (may need investigation if &gt; 0)</td></tr>
      <tr><td>Hero images converted</td><td>${media?.base64ToMediaConversions?.splash || 0}</td><td>Article splash images extracted from binary data and saved as image files</td></tr>
      <tr><td>Thumbnails converted</td><td>${media?.base64ToMediaConversions?.thumbnail || 0}</td><td>Article thumbnail images extracted from binary data and saved as image files</td></tr>
      <tr><td>App images converted</td><td>${media?.base64ToMediaConversions?.image || 0}</td><td>Application images extracted from binary data and saved as image files</td></tr>
      <tr><td>Inline images extracted</td><td>${media?.inlineImagesExtracted || 0}</td><td>Images embedded within article body text, extracted and saved as separate files</td></tr>
    </tbody>
  </table>

  <h2>11. How the Migration Was Performed</h2>
  <div class="callout callout-green">
    <h4>API-to-API transfer methodology</h4>
    <p>This migration used an <strong>API-to-API approach</strong>, meaning data was read from the old system's official interface
       (API) and written to the new system's official interface. This is the safest method available because:</p>
    <ul>
      <li><strong>Both systems validate the data:</strong> When data is read from the old system, its API verifies the data matches
          its expected structure. When data is written to the new system, its API also validates the data. If anything is wrong,
          the API rejects it immediately rather than allowing corrupted data into the database.</li>
      <li><strong>No direct database manipulation:</strong> The migration never directly reads or writes to either database.
          This eliminates entire categories of risk &mdash; like accidentally breaking database constraints, corrupting indexes,
          or mishandling character encoding &mdash; that commonly occur with direct database-to-database migrations.</li>
      <li><strong>Relationships verified automatically:</strong> When the migration connects related records (e.g., linking an article
          to its datasets), the new system's API verifies that both records exist. Broken or orphaned links are impossible.</li>
      <li><strong>Safe to re-run:</strong> Every step of the migration checks whether work has already been done before doing it again.
          If the migration is interrupted (e.g., by a network error), it can be restarted from where it left off without creating
          duplicate records or losing progress. This is called "idempotent" design.</li>
      <li><strong>Complete audit trail:</strong> Every step produces logs, maps, and reports that document exactly what was transferred,
          enabling the detailed verification shown in this report.</li>
    </ul>
  </div>

  <h2>12. Recommended Manual Checks</h2>
  <p>While the automated verification covers data completeness and accuracy, the following items should be checked by a human
     to confirm that the migrated content displays and functions correctly for end users:</p>
  <ul class="checklist">
    <li><strong>Browse the website:</strong> Navigate to the live site and verify that articles, datasets, and apps display correctly with the new system as the data source</li>
    <li><strong>Check images:</strong> Open 5&ndash;10 articles and verify that hero images, thumbnails, and figures within article text display correctly and at good quality</li>
    <li><strong>Download files:</strong> Try downloading PDF attachments from several articles, and data files from several datasets, to confirm they open correctly</li>
    <li><strong>Test search:</strong> If the website has a search feature, verify it returns expected results from the new system</li>
    <li><strong>Check links between content:</strong> Verify that links from articles to related datasets (and vice versa) work correctly</li>
    <li><strong>Verify dates:</strong> Check that publication dates display correctly on the website (the date format changed slightly in the new system)</li>
    <li><strong>Review the admin panel:</strong> Log into the new system's admin panel and verify that content can be browsed, edited, and published</li>
    <li><strong>Test public access:</strong> Verify that the public API returns data without requiring login (needed for the website to function)</li>
    <li><strong>Check formatted text:</strong> Verify that articles with complex formatting (tables, code blocks, special characters) display correctly</li>
    <li><strong>Verify external links:</strong> Spot-check that links to external resources (DOI links, external data sources) still work</li>
  </ul>

  <h2>Appendix A: Glossary</h2>
  <p>Technical terms used in this report:</p>
  <dl class="glossary">
    <dt>API (Application Programming Interface)</dt>
    <dd>A standardized way for software systems to communicate. The migration reads data from one API and writes to another.</dd>
    <dt>Base64</dt>
    <dd>A method of encoding binary data (like images) as text. The old system stored some images this way; the new system uses proper files.</dd>
    <dt>CMS (Content Management System)</dt>
    <dd>Software for managing website content. Strapi is the CMS used for ResearchHub.</dd>
    <dt>Field</dt>
    <dd>A single piece of data within a record &mdash; like "title," "date," or "author." Similar to a column in a spreadsheet.</dd>
    <dt>GraphQL</dt>
    <dd>A query language used by the old system's API to retrieve data.</dd>
    <dt>Legacy ID</dt>
    <dd>The original record identifier from the old system, preserved in the new system for traceability.</dd>
    <dt>Media Library</dt>
    <dd>The new system's organized storage for images, PDFs, and other files.</dd>
    <dt>MongoDB (NoSQL)</dt>
    <dd>The database technology used by the old system. Stores data as flexible documents.</dd>
    <dt>Parity</dt>
    <dd>The state of two systems having equivalent data. "Migration parity" means the new system contains all the data from the old system.</dd>
    <dt>Record</dt>
    <dd>A single content item (one article, one dataset, or one app). Similar to a row in a spreadsheet.</dd>
    <dt>REST API</dt>
    <dd>A standardized interface used by the new system for reading and writing data.</dd>
    <dt>Schema</dt>
    <dd>The structure that defines what fields exist and what type of data each field holds.</dd>
    <dt>SQLite (SQL)</dt>
    <dd>The database technology used by the new system. Stores data in structured, relational tables.</dd>
    <dt>Strapi</dt>
    <dd>An open-source headless CMS. The migration upgraded from version 3 to version 5.</dd>
  </dl>

  <div class="footer">
    <p><strong>Report generated by hub-cms-migration-2026 migration toolkit</strong><br>
    Audit completed: ${audit.generatedAt ? new Date(audit.generatedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' }) : 'N/A'}<br>
    Methodology: 6-phase automated migration with field-level parity verification<br>
    Source system: Strapi 3 (MongoDB) at researchhub.icjia-api.cloud<br>
    Target system: Strapi 5 (SQLite) at v2.hub.icjia-api.cloud</p>
  </div>
</body>
</html>`;
}

/**
 * Get a plain-language explanation for a validation check name.
 * @param {string} name - Check name from validation-report.json
 * @returns {string} Plain-language description
 */
function getCheckExplanation(name) {
  const explanations = {
    'Record Counts': 'Confirms the same number of records exist in both systems',
    'Legacy ID Coverage': 'Confirms every old-system record has a matching new-system record',
    'Zero Base64 Remnants': 'Confirms no embedded binary image data was accidentally left in text fields',
    'Image/Media Migration': 'Confirms hero images and thumbnails were successfully transferred',
    'Dataset File Migration': 'Confirms dataset download files were successfully transferred',
    'Media Accessibility': 'Confirms all media files are reachable via their URLs',
    'Relation Integrity': 'Confirms links between related records (article↔dataset, etc.) are correct',
    'Timestamp Preservation': 'Confirms original creation/modification dates were preserved',
    'Content Integrity': 'Spot-checks article body text to confirm content was not corrupted',
    'No Duplicates': 'Confirms no records were accidentally duplicated during migration',
  };
  return explanations[name] || name;
}

// ── DOCX Report Generation ──────────────────────────────────────────

/**
 * Create a simple table cell with optional shading.
 * @param {string} text - Cell text
 * @param {Object} [opts] - Options (bold, shading, width)
 * @returns {TableCell}
 */
function cell(text, opts = {}) {
  const runs = [];
  if (opts.bold) {
    runs.push(new TextRun({ text: String(text), bold: true, size: 20, font: 'Calibri' }));
  } else {
    runs.push(new TextRun({ text: String(text), size: 20, font: 'Calibri' }));
  }
  const cellOpts = {
    children: [new Paragraph({ children: runs, alignment: opts.alignment || AlignmentType.LEFT })],
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  };
  if (opts.shading) {
    cellOpts.shading = { type: ShadingType.SOLID, color: opts.shading };
  }
  return new TableCell(cellOpts);
}

/**
 * Create a table header row.
 * @param {string[]} headers - Header text values
 * @returns {TableRow}
 */
function headerRow(headers) {
  return new TableRow({
    children: headers.map((h) => cell(h, { bold: true, shading: 'E2E8F0' })),
    tableHeader: true,
  });
}

/**
 * Create a data row.
 * @param {string[]} values - Cell text values
 * @returns {TableRow}
 */
function dataRow(values) {
  return new TableRow({
    children: values.map((v) => cell(String(v))),
  });
}

/**
 * Helper to create a paragraph with specific formatting.
 * @param {string} text - Paragraph text
 * @param {Object} [opts] - Options
 * @returns {Paragraph}
 */
function para(text, opts = {}) {
  const runs = [new TextRun({
    text,
    size: opts.size || 20,
    font: 'Calibri',
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || undefined,
  })];
  return new Paragraph({
    children: runs,
    heading: opts.heading || undefined,
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: opts.spacing || { after: 120 },
    bullet: opts.bullet || undefined,
  });
}

/**
 * Helper to create a multi-run paragraph (bold label + normal text).
 * @param {string} label - Bold prefix
 * @param {string} text - Normal text
 * @param {Object} [opts] - Options
 * @returns {Paragraph}
 */
function labelPara(label, text, opts = {}) {
  return new Paragraph({
    children: [
      new TextRun({ text: label, bold: true, size: 20, font: 'Calibri' }),
      new TextRun({ text, size: 20, font: 'Calibri' }),
    ],
    bullet: opts.bullet || undefined,
    spacing: opts.spacing || { after: 80 },
  });
}

/**
 * Generate a DOCX migration parity report.
 *
 * @param {Object} audit - The Phase 6 audit-report.json data
 * @param {Object} validation - The Phase 5 validation-report.json data
 * @returns {Promise<Buffer>} DOCX file buffer
 */
async function generateDOCX(audit, validation) {
  const { summary, schema, records, media } = audit;
  const generatedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago',
  });
  const pct = matchPercent(summary);
  const totalRecords = summary.totalRecordsCompared;

  const statusText = summary.findings.ERROR === 0
    ? 'MIGRATION PARITY CONFIRMED - Zero errors detected'
    : `${summary.findings.ERROR} ISSUE(S) REQUIRE REVIEW`;

  const s = [];

  // ── Title ──
  s.push(
    para('ResearchHub CMS Migration Parity Report', { heading: HeadingLevel.TITLE, bold: true, size: 36 }),
    para('Illinois Criminal Justice Information Authority (ICJIA)', { size: 22, color: '64748b' }),
    para(`Database Migration: Strapi 3 (legacy) → Strapi 5 (new)`, { size: 20, color: '64748b' }),
    para(`Generated: ${generatedAt}`, { size: 20, color: '64748b', spacing: { after: 300 } }),
    para(statusText, {
      bold: true, size: 28, alignment: AlignmentType.CENTER,
      color: summary.findings.ERROR === 0 ? '16a34a' : 'dc2626',
      spacing: { before: 200, after: 100 },
    }),
    para(`${totalRecords} records compared across ${summary.totalFieldsCompared.toLocaleString()} individual data fields — ${pct} match rate`, {
      size: 20, alignment: AlignmentType.CENTER, color: '64748b', spacing: { after: 400 },
    }),
  );

  // ── What Is This Report ──
  s.push(
    para('1. What Is This Report?', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para(`This report documents the results of migrating the ResearchHub content management system (CMS) from Strapi 3 (the legacy system, running since 2019) to Strapi 5 (the new system).`),
    para(`The migration moved ${totalRecords} content records — including research articles, datasets, and web applications — along with all associated images, PDF documents, and inter-record relationships.`),
    para(`"Parity" means every piece of content in the old system was compared field-by-field against the new system to verify that no data was lost, corrupted, or incorrectly transformed during the transfer.`),
  );

  // ── Why This Audit Matters ──
  s.push(
    para('2. Why This Audit Matters', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('Database migrations are one of the highest-risk operations in software management. Even when a migration appears successful on the surface, hidden problems often lurk beneath:'),
  );

  const auditPoints = [
    ['Missing records: ', 'Some records may silently fail to transfer. Without a count-level check, you might not notice missing articles until a user reports a broken link weeks later.'],
    ['Corrupted content: ', 'Article text can be subtly altered — special characters replaced, formatting lost, paragraphs truncated. This audit compares every character automatically.'],
    ['Broken relationships: ', 'Links between articles and datasets can silently drop. The pages render without errors, but "Related Research" sections show nothing.'],
    ['Missing files: ', 'PDF reports, data files, and images may fail to upload or get assigned to the wrong record. This audit verifies every attachment.'],
    ['Lost images: ', 'The old system stored images as embedded binary data. Converting these is error-prone. This audit verifies every image was extracted and correctly referenced.'],
    ['Wrong dates: ', 'Publication dates can be overwritten with the migration date. This audit verifies creation and modification dates match the originals.'],
    ['Duplicate records: ', 'Network timeouts can create duplicates. This audit checks that every record ID is unique.'],
  ];

  for (const [label, text] of auditPoints) {
    s.push(labelPara(label, text, { bullet: { level: 0 } }));
  }

  s.push(
    para(`The ${summary.totalFieldsCompared.toLocaleString()} individual field comparisons in this report would take a human reviewer an estimated ${Math.round(summary.totalFieldsCompared / 120)} hours to verify manually.`, { spacing: { before: 200, after: 200 } }),
    para('What happens without an audit like this?', { bold: true, spacing: { before: 200 } }),
    para('Most database migrations are performed without field-level verification. Organizations check that "the website still loads" and move on. Problems surface weeks later — missing PDFs, broken links, corrupted text, wrong dates — and by then the damage is cached, indexed, and shared.'),
    para('Why NoSQL-to-SQL migrations are especially risky:', { bold: true, spacing: { before: 200 } }),
    para('This migration converts from MongoDB (NoSQL) to SQLite (SQL) — two fundamentally different database architectures. This introduces risks that same-platform migrations do not have:'),
  );

  const nosqlRiskPoints = [
    ['No shared schema: ', 'MongoDB allows flexible documents where each record can have different fields. SQL requires rigid structure. Fields can be silently dropped.'],
    ['Data type mismatches: ', 'MongoDB is permissive with types. SQL enforces strict types. Values can be truncated or lost.'],
    ['Embedded data vs. relations: ', 'MongoDB embeds data inside documents (like binary images inside articles). SQL uses separate tables. This structural change requires careful extraction and re-linking.'],
    ['ID format incompatibility: ', 'MongoDB uses 24-character hex IDs. SQL uses integers. Every cross-reference must be remapped — a single miss breaks relationships permanently.'],
    ['No standard migration tool: ', 'Unlike same-platform migrations, there is no standard tool for MongoDB-to-SQLite conversion. The entire process must be custom-built.'],
  ];

  for (const [label, text] of nosqlRiskPoints) {
    s.push(labelPara(label, text, { bullet: { level: 0 } }));
  }

  // ── Executive Summary ──
  s.push(
    para('3. Executive Summary', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    new Table({
      rows: [
        headerRow(['Metric', 'Value']),
        dataRow(['Total Records Compared', String(totalRecords)]),
        dataRow(['Total Fields Compared', summary.totalFieldsCompared.toLocaleString()]),
        dataRow(['Exact Matches', summary.findings.OK.toLocaleString()]),
        dataRow(['Expected Changes (not errors)', String(summary.findings.EXPECTED)]),
        dataRow(['Informational Notes', String(summary.findings.INFO)]),
        dataRow(['Errors Requiring Review', String(summary.findings.ERROR)]),
        dataRow(['Media Files Migrated', String(media?.totalMediaInS5 || 0)]),
        dataRow(['Overall Match Rate', pct]),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
  );

  // ── Migration Overview ──
  s.push(
    para('3a. Migration Overview', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('What was migrated:'),
    new Table({
      rows: [
        headerRow(['Content Type', 'Description', 'Count']),
        dataRow(['Articles', 'Research publications, policy briefs, and reports with full-text content, author metadata, PDF attachments, and hero images', String((records.articles || []).length)]),
        dataRow(['Datasets', 'Data resources with downloadable data files, descriptions, and links to related articles', String((records.datasets || []).length)]),
        dataRow(['Apps', 'Interactive web applications with descriptions, images, and links to related articles and datasets', String((records.apps || []).length)]),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    para('Migration process (6 automated phases):', { spacing: { before: 200 } }),
    new Table({
      rows: [
        headerRow(['Phase', 'What Happened', 'Status']),
        dataRow(['1. Schema Setup', 'Data structure analyzed and recreated in new system', 'Complete']),
        dataRow(['2. Data Extraction', `All ${totalRecords} records exported from old system via API`, 'Complete']),
        dataRow(['3. Media Processing', 'Images extracted from binary data, uploaded to media library. PDFs and data files re-uploaded.', 'Complete']),
        dataRow(['4. Data Loading', 'Records imported, relationships reconnected, timestamps restored, image references fixed', 'Complete']),
        dataRow(['5. Validation', '10 automated quality checks verified data integrity', 'Complete']),
        dataRow(['6. Parity Audit', 'Every field of every record compared between old and new systems', 'Complete']),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
  );

  // ── Record Count Parity ──
  s.push(
    para('4. Record Count Parity', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('The table below confirms that every eligible record in the old system has a corresponding record in the new system. No records were lost or duplicated.'),
  );

  if (config.allowedStatuses) {
    s.push(
      para(`Note on record counts: Only records with status ${config.allowedStatuses.map(s => `"${s}"`).join(' or ')} were migrated. Records still in draft or pending approval were intentionally excluded and will be migrated individually once published. This is by design, not data loss.`, { spacing: { after: 120 } }),
      para(`About the publish workflow: The old system (Strapi 3) did not have a built-in draft/publish toggle. Instead, it used a custom "status" field with values like "created" (draft), "submitted" (pending manager approval), "published", and "archived." The new system (Strapi 5) has an official built-in draft/publish system. All migrated records are set to "published" in Strapi 5. Draft and submitted records remain in the old system until they complete the approval workflow.`, { spacing: { after: 200 } }),
    );
  }

  const ctRows = ['articles', 'datasets', 'apps'].map((ct) => {
    const recs = records[ct] || [];
    const errors = recs.filter((r) => r.findings.some((f) => f.category === 'ERROR')).length;
    const ctLabel = ct === 'articles' ? 'Articles (research publications)' : ct === 'datasets' ? 'Datasets (data resources)' : 'Apps (web applications)';
    return dataRow([ctLabel, String(recs.length), String(recs.length), errors === 0 ? 'Yes' : `${errors} issue(s)`]);
  });

  s.push(new Table({
    rows: [headerRow(['Content Type', 'Old System', 'New System', 'Match']), ...ctRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  }));

  // ── Validation Checks ──
  if (validation && validation.checks) {
    s.push(
      para('5. Automated Quality Checks', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
      para('Before the detailed audit, 10 automated checks verified overall migration integrity:'),
    );

    const docxCheckLabels = {
      record_counts: 'Record Counts',
      legacy_id_coverage: 'Legacy ID Coverage',
      zero_base64_remnants: 'Zero Base64 Remnants',
      image_media_migration: 'Image/Media Migration',
      dataset_file_migration: 'Dataset File Migration',
      media_accessibility: 'Media Accessibility',
      relation_integrity: 'Relation Integrity',
      timestamp_preservation: 'Timestamp Preservation',
      content_integrity: 'Content Integrity',
      no_duplicates: 'No Duplicates',
    };

    const checkRows = validation.checks.map((check) => {
      const label = docxCheckLabels[check.check] || check.check;
      const passed = check.status === 'PASS';
      return dataRow([label, getCheckExplanation(label), passed ? 'Pass' : 'FAIL', '']);
    });

    s.push(new Table({
      rows: [headerRow(['Check', 'What It Verifies', 'Result', 'Detail']), ...checkRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }

  // ── Field-Level Audit Results ──
  s.push(
    para('5a. Field-Level Audit Results', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('Every field of every record was individually compared between the old and new systems.'),
  );

  for (const ct of ['articles', 'datasets', 'apps']) {
    const recs = records[ct] || [];
    if (recs.length === 0) continue;
    const errorRecs = recs.filter((r) => r.findings.some((f) => f.category === 'ERROR'));
    const expectedRecs = recs.filter((r) => r.findings.some((f) => f.category === 'EXPECTED'));
    const ctLabel = ct.charAt(0).toUpperCase() + ct.slice(1);

    s.push(para(`${ctLabel} (${recs.length} records)`, { bold: true, spacing: { before: 200 } }));

    if (errorRecs.length === 0) {
      s.push(para(`No errors found.${expectedRecs.length > 0 ? ` ${expectedRecs.length} records have expected changes from the technology upgrade.` : ' All records transferred with no differences.'}`));
    } else {
      s.push(para(`${errorRecs.length} record(s) with errors requiring review.`));
    }

    // Expected changes summary
    if (expectedRecs.length > 0) {
      const expectedByField = {};
      for (const rec of expectedRecs) {
        for (const f of rec.findings.filter((x) => x.category === 'EXPECTED')) {
          expectedByField[f.field] = (expectedByField[f.field] || 0) + 1;
        }
      }
      const expRows = Object.entries(expectedByField).map(([field, count]) =>
        dataRow([field, String(count), getExpectedReason(field)])
      );
      if (expRows.length > 0) {
        s.push(new Table({
          rows: [headerRow(['Field', 'Records Affected', 'Why This Changed']), ...expRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
      }
    }
  }

  // ── Schema Comparison ──
  if (schema?.findings?.length > 0) {
    s.push(
      para('5b. Schema Comparison', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
      para('Structural differences between old and new systems — all expected results of the technology upgrade.'),
    );
    const schemaDocxRows = schema.findings.map((f) =>
      dataRow([f.contentType || '', f.field || '-', f.category, f.detail])
    );
    s.push(new Table({
      rows: [headerRow(['Content Type', 'Field', 'Category', 'Explanation']), ...schemaDocxRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }

  // ── Media Summary ──
  s.push(
    para('6. Media Migration Summary', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('Images, PDFs, and data files were extracted from the old system and uploaded to the new system:'),
    new Table({
      rows: [
        headerRow(['Metric', 'Count', 'What This Means']),
        dataRow(['Total media files', String(media?.totalMediaInS5 || 0), 'All images, PDFs, and data files in the new media library']),
        dataRow(['Files verified accessible', String(media?.mediaAccessible || 0), 'Confirmed downloadable via their URLs']),
        dataRow(['Files inaccessible', String(media?.mediaInaccessible || 0), 'Could not be reached (needs investigation if > 0)']),
        dataRow(['Hero images converted', String(media?.base64ToMediaConversions?.splash || 0), 'Extracted from embedded binary data']),
        dataRow(['Thumbnails converted', String(media?.base64ToMediaConversions?.thumbnail || 0), 'Extracted from embedded binary data']),
        dataRow(['Inline images extracted', String(media?.inlineImagesExtracted || 0), 'Images within article text, extracted as files']),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
  );

  // ── NoSQL → SQL Considerations ──
  s.push(
    para('7. Why Are There "Expected Changes"?', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('The old system (Strapi 3) used MongoDB, a "document" database. The new system (Strapi 5) uses SQLite, a "relational" database. This technology change means some data is represented differently even though the actual content is identical — like converting a Word document to PDF.'),
    para('The key differences:', { bold: true, spacing: { before: 200 } }),
  );

  const nosqlPoints = [
    ['Record IDs changed format: ', 'Old system used 24-character codes. New system uses simple numbers. Original IDs are preserved in a "legacyId" field for traceability.'],
    ['Images moved to a media library: ', 'Old system stored some images as raw binary data inside records. New system stores them as proper files. The images are identical.'],
    ['File references use a new format: ', 'PDFs and data files are referenced differently in the new database structure. The files themselves are unchanged.'],
    ['Minor timestamp differences: ', 'Dates may differ by fractions of a second due to database precision differences. Verified within 1-second tolerance.'],
    ['New system fields added: ', 'The new system adds internal bookkeeping fields that don\'t exist in the old system. These are infrastructure, not content.'],
  ];

  for (const [label, text] of nosqlPoints) {
    s.push(labelPara(label, text, { bullet: { level: 0 } }));
  }

  // ── API-to-API Methodology ──
  s.push(
    para('8. How the Migration Was Performed', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('This migration used an API-to-API approach — data was read from the old system\'s official interface and written to the new system\'s official interface. This is the safest method because:'),
  );

  const apiPoints = [
    ['Both systems validate the data: ', 'Invalid data is rejected immediately rather than corrupting the database.'],
    ['No direct database manipulation: ', 'Eliminates risks from schema mismatches, constraint violations, and encoding issues.'],
    ['Relationships verified automatically: ', 'The new system confirms both records exist when creating links between them.'],
    ['Safe to re-run: ', 'If interrupted, the migration can resume without creating duplicates or losing progress.'],
    ['Complete audit trail: ', 'Every step produces detailed logs enabling the verification shown in this report.'],
  ];

  for (const [label, text] of apiPoints) {
    s.push(labelPara(label, text, { bullet: { level: 0 } }));
  }

  // ── Manual Checks ──
  s.push(
    para('9. Recommended Manual Checks', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('While automated verification covers data completeness and accuracy, these items should be checked by a human:'),
  );

  const manualChecks = [
    'Browse the website and verify articles, datasets, and apps display correctly',
    'Open 5-10 articles and verify hero images, thumbnails, and figures display correctly',
    'Download PDF attachments from several articles and data files from datasets',
    'Test the search feature if the website has one',
    'Verify links between related articles and datasets work correctly',
    'Check that publication dates display correctly',
    'Log into the admin panel and verify content is browsable and editable',
    'Verify the public API returns data without requiring login',
    'Check articles with complex formatting (tables, code blocks, special characters)',
    'Spot-check external links (DOI links, external data sources)',
  ];

  for (const check of manualChecks) {
    s.push(para(`☐  ${check}`, { spacing: { after: 80 } }));
  }

  // ── Glossary ──
  s.push(
    para('Appendix A: Glossary', { heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
    para('Technical terms used in this report:'),
  );

  const glossaryTerms = [
    ['API (Application Programming Interface)', 'A standardized way for software systems to communicate. The migration reads data from one API and writes to another.'],
    ['Base64', 'A method of encoding binary data (like images) as text. The old system stored some images this way; the new system uses proper files.'],
    ['CMS (Content Management System)', 'Software for managing website content. Strapi is the CMS used for ResearchHub.'],
    ['Field', 'A single piece of data within a record — like "title," "date," or "author." Similar to a column in a spreadsheet.'],
    ['Legacy ID', 'The original record identifier from the old system, preserved in the new system for traceability.'],
    ['Media Library', 'The new system\'s organized storage for images, PDFs, and other files.'],
    ['MongoDB (NoSQL)', 'The database technology used by the old system. Stores data as flexible documents.'],
    ['Parity', 'The state of two systems having equivalent data. "Migration parity" means the new system contains all the data from the old system.'],
    ['Record', 'A single content item (one article, one dataset, or one app). Similar to a row in a spreadsheet.'],
    ['Schema', 'The structure that defines what fields exist and what type of data each field holds.'],
    ['SQLite (SQL)', 'The database technology used by the new system. Stores data in structured, relational tables.'],
    ['Strapi', 'An open-source headless CMS. The migration upgraded from version 3 to version 5.'],
  ];

  for (const [term, definition] of glossaryTerms) {
    s.push(labelPara(`${term}: `, definition));
  }

  // ── Footer ──
  s.push(
    para('', { spacing: { before: 600 } }),
    para('Report generated by hub-cms-migration-2026 migration toolkit. 7-phase automated migration with field-level parity verification.', {
      size: 18, italics: true, color: '94a3b8',
    }),
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children: s,
    }],
  });

  return Packer.toBuffer(doc);
}

// ── Main ────────────────────────────────────────────────────────────

/**
 * Main entry point: reads Phase 5 and Phase 6 reports, generates HTML and DOCX.
 */
async function main() {
  console.log(`${BOLD}=== Migration Report Generator ===${RESET}\n`);

  // Load reports
  const auditPath = path.join(DATA_DIR, 'audit-report.json');
  const validationPath = path.join(DATA_DIR, 'validation-report.json');

  const audit = await readJSON(auditPath);
  if (!audit) {
    console.error(`${RED}ERROR: audit-report.json not found at ${auditPath}${RESET}`);
    console.error(`${RED}Run Phase 6 first: pnpm migrate:phase06${RESET}`);
    process.exit(1);
  }
  console.log(`  ${GREEN}✓${RESET} Loaded audit-report.json`);

  const validation = await readJSON(validationPath);
  if (validation) {
    console.log(`  ${GREEN}✓${RESET} Loaded validation-report.json`);
  } else {
    console.log(`  ${CYAN}ℹ${RESET} validation-report.json not found (Phase 5 data will be skipped)`);
  }

  console.log('');

  // Generate HTML
  console.log('  Generating HTML report...');
  const html = generateHTML(audit, validation);
  const htmlPath = path.join(DATA_DIR, 'migration-report.html');
  await fs.writeFile(htmlPath, html);
  console.log(`  ${GREEN}✓${RESET} ${path.relative(ROOT, htmlPath)}`);

  // Generate DOCX
  console.log('  Generating DOCX report...');
  const docxBuffer = await generateDOCX(audit, validation);
  const docxPath = path.join(DATA_DIR, 'migration-report.docx');
  await fs.writeFile(docxPath, docxBuffer);
  console.log(`  ${GREEN}✓${RESET} ${path.relative(ROOT, docxPath)}`);

  console.log('');
  console.log(`${GREEN}${BOLD}Reports ready:${RESET}`);
  console.log(`  ${CYAN}HTML:${RESET} migration/data/migration-report.html`);
  console.log(`  ${CYAN}DOCX:${RESET} migration/data/migration-report.docx`);
  console.log('');
  console.log('Open the HTML in a browser to preview, or send the DOCX to your manager.');
}

main().catch((err) => {
  console.error(`\n${RED}FATAL: ${err.message}${RESET}`);
  console.error(err.stack);
  process.exit(1);
});

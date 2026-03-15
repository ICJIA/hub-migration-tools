/**
 * @module 01-run-phase
 * @description Phase 1 orchestrator: runs all Phase 1 scripts in sequence.
 *
 * Executes 01a → 01b → 01c with interactive prompts between each step.
 * If a step fails, explains exactly what went wrong and how to resume
 * from that specific step — no need to start over from the beginning.
 *
 * Steps:
 * 1. `01a-introspect.js` — Read Strapi 3 schemas (includes clean prompt)
 * 2. `01b-generate-schemas.js` — Generate Strapi 5 schema files
 * 3. Manual: copy schemas to Strapi 5 project and start it
 * 4. `01c-verify-schemas.js` — Verify schemas against running Strapi 5
 *
 * @example
 *   node migration/scripts/01-run-phase.js
 *   # or: pnpm migrate:phase01
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Run a Node.js script as a child process, streaming its output to the console.
 * Returns the exit code.
 *
 * @param {string} scriptPath - Path to the script relative to project root
 * @returns {Promise<number>} Exit code (0 = success)
 */
function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      stdio: 'inherit',  // Stream stdin/stdout/stderr directly (preserves colors + prompts)
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`${RED}Failed to start ${scriptPath}: ${err.message}${RESET}`);
      resolve(1);
    });
  });
}

/**
 * Prompt the user with a yes/no question. Default is Y (enter = yes).
 *
 * @param {string} question - The prompt text
 * @returns {Promise<boolean>} True if user answered yes (or pressed enter)
 */
function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/**
 * Wait for the user to press enter.
 *
 * @param {string} message - The prompt text
 * @returns {Promise<void>}
 */
function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Print a failure message with recovery instructions.
 *
 * @param {string} stepName - Human-readable step name
 * @param {string} scriptPath - Script that failed
 * @param {number} exitCode - Exit code from the script
 * @param {string} [hint] - Additional recovery hint
 */
function printFailure(stepName, scriptPath, exitCode, hint) {
  console.log('');
  console.log(`${RED}╔══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${RED}║  ${stepName} failed (exit code ${exitCode})${' '.repeat(Math.max(0, 38 - stepName.length - String(exitCode).length))}║${RESET}`);
  console.log(`${RED}╚══════════════════════════════════════════════════════════╝${RESET}`);
  console.log('');
  console.log(`${YELLOW}You do NOT need to start Phase 1 over from the beginning.${RESET}`);
  console.log(`${YELLOW}Fix the issue above, then resume by running:${RESET}`);
  console.log('');
  console.log(`  ${CYAN}node ${scriptPath}${RESET}`);
  console.log('');
  if (hint) {
    console.log(`${YELLOW}Hint: ${hint}${RESET}`);
    console.log('');
  }
  console.log(`Once that step passes, continue with the remaining steps manually:`);
}

async function main() {
  console.log('');
  console.log(`${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║        Phase 1: Introspection & Schema Generation       ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}`);
  console.log('');
  console.log('This will run all Phase 1 steps in sequence:');
  console.log(`  ${CYAN}Step 1:${RESET} Introspect Strapi 3 schemas (01a)`);
  console.log(`  ${CYAN}Step 2:${RESET} Generate Strapi 5 schema files (01b)`);
  console.log(`  ${CYAN}Step 3:${RESET} Copy schemas to Strapi 5 and start it (manual)`);
  console.log(`  ${CYAN}Step 4:${RESET} Verify schemas against running Strapi 5 (01c)`);
  console.log('');

  // ── Step 1: Introspect ──────────────────────────────────────────────
  console.log(`${BOLD}── Step 1/4: Introspect Strapi 3 ──${RESET}\n`);

  const code1 = await runScript('migration/scripts/01a-introspect.js');
  if (code1 !== 0) {
    printFailure('Step 1 (Introspect)', 'migration/scripts/01a-introspect.js', code1,
      'Check that schemas/ directory contains the Strapi 3 model files. ' +
      'If using GraphQL introspection, verify the Strapi 3 URL in config.js.');
    console.log(`  ${CYAN}node migration/scripts/01b-generate-schemas.js${RESET}`);
    console.log(`  ${CYAN}node migration/scripts/01c-verify-schemas.js${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}✓ Step 1 complete.${RESET}\n`);

  // ── Step 2: Generate ────────────────────────────────────────────────
  const continue2 = await promptYesNo(
    `${CYAN}Step 2/4: Generate Strapi 5 schemas.${RESET}\n` +
    'This reads the introspection data and generates schema.json files.\n' +
    'Continue? [Y/n] '
  );
  if (!continue2) {
    console.log(`\nPaused. Resume later with: ${CYAN}node migration/scripts/01b-generate-schemas.js${RESET}`);
    process.exit(0);
  }

  console.log(`\n${BOLD}── Step 2/4: Generate Strapi 5 Schemas ──${RESET}\n`);

  const code2 = await runScript('migration/scripts/01b-generate-schemas.js');
  if (code2 !== 0) {
    printFailure('Step 2 (Generate)', 'migration/scripts/01b-generate-schemas.js', code2,
      'Check the error above. Common causes: missing strapi3-models.json (run 01a first), ' +
      'or invalid field-type-map.json.');
    console.log(`  ${CYAN}node migration/scripts/01c-verify-schemas.js${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}✓ Step 2 complete.${RESET}\n`);

  // ── Step 3: Manual copy + start ─────────────────────────────────────
  console.log(`${BOLD}── Step 3/4: Copy schemas to Strapi 5 (manual step) ──${RESET}\n`);
  console.log('Before verification, you need to:');
  console.log('');
  console.log(`  1. Copy the generated schemas to your Strapi 5 project:`);
  console.log(`     ${CYAN}cp -r migration/output/strapi5-schemas/* /path/to/strapi5-project/src/api/${RESET}`);
  console.log('');
  console.log(`  2. Install the GraphQL plugin in the Strapi 5 project (if not already):`);
  console.log(`     ${CYAN}cd /path/to/strapi5-project && pnpm add @strapi/plugin-graphql${RESET}`);
  console.log('');
  console.log(`  3. Start Strapi 5 in development mode:`);
  console.log(`     ${CYAN}cd /path/to/strapi5-project && pnpm develop${RESET}`);
  console.log('');
  console.log(`  4. Wait for Strapi 5 to finish starting (watch for "Welcome back!" in the console).`);
  console.log('');

  await waitForEnter(`${YELLOW}Press Enter when Strapi 5 is running and ready...${RESET} `);
  console.log('');

  // ── Step 4: Verify ──────────────────────────────────────────────────
  const continue4 = await promptYesNo(
    `${CYAN}Step 4/4: Verify schemas against Strapi 5.${RESET}\n` +
    'This introspects Strapi 5 via GraphQL, checks the REST API, and diffs\n' +
    'against Strapi 3 to confirm all content types and fields are correct.\n' +
    'Continue? [Y/n] '
  );
  if (!continue4) {
    console.log(`\nPaused. Resume later with: ${CYAN}node migration/scripts/01c-verify-schemas.js${RESET}`);
    process.exit(0);
  }

  console.log(`\n${BOLD}── Step 4/4: Verify Strapi 5 Schemas ──${RESET}\n`);

  const code4 = await runScript('migration/scripts/01c-verify-schemas.js');
  if (code4 !== 0) {
    printFailure('Step 4 (Verify)', 'migration/scripts/01c-verify-schemas.js', code4,
      'Common causes:\n' +
      '  - Strapi 5 is not running → start it with pnpm develop\n' +
      '  - @strapi/plugin-graphql not installed → pnpm add @strapi/plugin-graphql\n' +
      '  - Schemas not copied → cp -r migration/output/strapi5-schemas/* /path/to/strapi5/src/api/\n' +
      '  - Unexpected schema differences → review migration/data/introspection/schema-diff.json');
    process.exit(1);
  }

  // ── Success ─────────────────────────────────────────────────────────
  console.log('');
  console.log(`${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${GREEN}║         Phase 1 Complete — All steps passed ✓           ║${RESET}`);
  console.log(`${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}`);
  console.log('');
  console.log('Deliverables:');
  console.log(`  ${GREEN}✓${RESET} Strapi 3 introspection data     → migration/data/introspection/`);
  console.log(`  ${GREEN}✓${RESET} Strapi 5 schema.json files      → migration/output/strapi5-schemas/`);
  console.log(`  ${GREEN}✓${RESET} Field mapping reference          → migration/config/field-map.json`);
  console.log(`  ${GREEN}✓${RESET} Schema diff report               → migration/data/introspection/schema-diff.json`);
  console.log('');
  console.log('Next: Phase 2 (Data Extraction)');
  console.log(`  ${CYAN}node migration/scripts/02-run-phase.js${RESET}  (when implemented)`);
  console.log('');
}

main().catch(err => {
  console.error(`\n${RED}FATAL: ${err.message}${RESET}`);
  process.exit(1);
});

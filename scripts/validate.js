// scripts/validate.js
// Thin CLI wrapper for `npm run validate`. Delegates entirely to the
// already-tested validator/validator.js Validation Engine. Validates
// every chapter in build/ (falls back to chapters/ if build/ is empty)
// and writes validation-report.{html,json} + validation-summary.md to
// reports/.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBook } from '../validator/validator.js';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const chaptersDir = path.join(root, 'chapters');
const reportsDir = path.join(root, 'reports');

async function main() {
  const hasBuildOutput = fs.existsSync(buildDir) && fs.readdirSync(buildDir).some((f) => f.endsWith('.html'));
  const inputDir = hasBuildOutput ? buildDir : chaptersDir;
  console.log(`Validating chapters in ${inputDir} ...\n`);

  const result = await validateBook(inputDir, { outDir: reportsDir, bookTitle: process.argv[2] });

  console.log('\n=== BOOK HEALTH REPORT ===');
  console.log(result.bookHealth);
  console.log('\n=== RELEASE CHECKLIST ===');
  Object.entries(result.releaseChecklist).forEach(([k, v]) => console.log(`${v ? '✓' : '✗'} ${k}`));
  console.log(`\nReports written to ${reportsDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

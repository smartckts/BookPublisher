// validator/validator.js
// MODULE 5 — Validation Engine orchestrator.
//
// STRICTLY READ-ONLY: every browser interaction here is a `goto` +
// `evaluate` that only inspects the already-rendered DOM/CSSOM (see
// validator/checks.js — no check function ever calls a DOM mutation
// API). Nothing under chapters/ or build/ is written to by this module.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAGE } from '../config.js';
import { browserRunAllChecks } from './checks.js';
import { computeBookHealth } from './scoring.js';
import { buildJsonReport, buildMarkdownSummary, buildHtmlReport } from './reportGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function validateChapter(filePath, { browser: sharedBrowser } = {}) {
  const browser = sharedBrowser || (await chromium.launch());
  const ownBrowser = !sharedBrowser;
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const chapterName = path.basename(filePath).replace(/\.(optimized\.)?html$/, '');

  try {
    await page.goto('file://' + path.resolve(filePath), { waitUntil: 'networkidle', timeout: 120000 });
    await page.emulateMedia({ media: 'print' });
    // Give web fonts a real chance to resolve (or fail) before the font
    // check runs, matching real PDF-generation timing.
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

    const result = await page.evaluate(browserRunAllChecks, {
      pageConfig: { widthMm: PAGE.widthMm, heightMm: PAGE.heightMm, marginTopMm: PAGE.marginTopMm, marginBottomMm: PAGE.marginBottomMm },
    });

    const issues = result.issues.map((i) => ({ ...i, chapter: chapterName }));

    return { chapter: chapterName, totalPages: result.totalPages, issues };
  } finally {
    await page.close();
    if (ownBrowser) await browser.close();
  }
}

export async function validateBook(inputPath, { outDir, bookTitle } = {}) {
  const browser = await chromium.launch();
  try {
    const stat = fs.statSync(inputPath);
    const files = stat.isDirectory()
      ? fs.readdirSync(inputPath).filter((f) => f.endsWith('.html')).sort().map((f) => path.join(inputPath, f))
      : [inputPath];

    const chapters = [];
    for (const f of files) {
      process.stdout.write(`Validating ${path.basename(f)} ... `);
      const result = await validateChapter(f, { browser });
      const bySeverity = {
        Critical: result.issues.filter((i) => i.severity === 'Critical').length,
        Major: result.issues.filter((i) => i.severity === 'Major').length,
        Minor: result.issues.filter((i) => i.severity === 'Minor').length,
      };
      console.log(`${result.issues.length} issues (C:${bySeverity.Critical} M:${bySeverity.Major} m:${bySeverity.Minor})`);
      chapters.push(result);
    }

    const allIssues = chapters.flatMap((c) => c.issues);
    const bookHealth = computeBookHealth(allIssues);
    const releaseChecklist = buildReleaseChecklist(allIssues, chapters);
    const meta = { bookTitle: bookTitle || 'Book', chaptersValidated: chapters.length, generator: 'book-builder validator v1' };

    const jsonReport = buildJsonReport({ chapters, allIssues, bookHealth, releaseChecklist, meta });
    const mdReport = buildMarkdownSummary({ chapters, allIssues, bookHealth, releaseChecklist, meta });
    const htmlReport = buildHtmlReport({ chapters, allIssues, bookHealth, releaseChecklist, meta });

    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'validation-report.json'), JSON.stringify(jsonReport, null, 2));
      fs.writeFileSync(path.join(outDir, 'validation-summary.md'), mdReport);
      fs.writeFileSync(path.join(outDir, 'validation-report.html'), htmlReport);
    }

    return { chapters, allIssues, bookHealth, releaseChecklist, jsonReport, mdReport, htmlReport };
  } finally {
    await browser.close();
  }
}

function buildReleaseChecklist(allIssues, chapters) {
  const has = (predicate) => allIssues.some(predicate);
  const countCat = (cat, sev) => allIssues.filter((i) => i.category === cat && (!sev || i.severity === sev)).length;

  const htmlValid = countCat('HTML Validity', 'Critical') === 0 && countCat('HTML Validity', 'Major') === 0;
  const cssValid = countCat('CSS Validity', 'Critical') === 0;
  const noOverflow = countCat('Overflow or Clipping') === 0;
  const noBrokenSvg = countCat('Broken SVGs') === 0;
  const noBrokenImages = countCat('Broken Images') === 0;
  const noDuplicateIds = countCat('Duplicate IDs') === 0;
  const correctNumbering =
    countCat('Figure Numbering', 'Major') === 0 &&
    countCat('Table Numbering', 'Major') === 0 &&
    countCat('Activity Numbering', 'Major') === 0;
  const printReady = countCat('Print Readiness', 'Critical') === 0 && countCat('Font Loading', 'Critical') === 0;
  const bySeverityTotals = {
    Critical: allIssues.filter((i) => i.severity === 'Critical').length,
  };
  const publisherReady = bySeverityTotals.Critical === 0;

  return {
    'HTML Valid': htmlValid,
    'CSS Valid': cssValid,
    'No Overflow': noOverflow,
    'No Broken SVG': noBrokenSvg,
    'No Broken Images': noBrokenImages,
    'No Duplicate IDs': noDuplicateIds,
    'Correct Numbering': correctNumbering,
    'Print Ready': printReady,
    'Publisher Ready': publisherReady,
  };
}

// ---- CLI entry point ----
async function main() {
  const [, , inputArg, bookTitleArg] = process.argv;
  if (!inputArg) {
    console.error('Usage: node validator/validator.js <chapter.html|dir> [bookTitle]');
    process.exit(1);
  }
  const outDir = path.join(__dirname, '..', 'reports');
  const result = await validateBook(inputArg, { outDir, bookTitle: bookTitleArg });
  console.log('\n=== BOOK HEALTH REPORT ===');
  console.log(result.bookHealth);
  console.log('\n=== RELEASE CHECKLIST ===');
  Object.entries(result.releaseChecklist).forEach(([k, v]) => console.log(`${v ? '✓' : '✗'} ${k}`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default { validateChapter, validateBook };

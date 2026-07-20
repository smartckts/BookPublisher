// scripts/book-report.js
// Thin CLI wrapper for `npm run report` — MODULE 8, Book Statistics.
// Aggregates data already produced by earlier stages (analysis,
// optimization, validation reports) into one consolidated book-level
// summary. Computes no new measurements itself — purely a rollup of
// existing report JSON.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const reportsDir = path.join(root, 'reports');

function readJsonIfExists(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

async function main() {
  const chapterFiles = fs
    .readdirSync(reportsDir)
    .filter((f) => /^chapter-\d+\.optimization-report\.json$/.test(f))
    .sort();

  if (!chapterFiles.length) {
    console.error('No optimization reports found. Run "npm run optimize" first.');
    process.exit(1);
  }

  const chapters = chapterFiles.map((f) => readJsonIfExists(path.join(reportsDir, f)));
  const validation = readJsonIfExists(path.join(reportsDir, 'validation-report.json'));

  const totals = chapters.reduce(
    (acc, c) => {
      acc.originalPages += c.pages.original;
      acc.optimizedPages += c.pages.optimized;
      acc.newPagesInserted += c.pages.newPagesInserted;
      acc.componentsMoved += c.componentsMoved;
      acc.processingTimeMs += c.processingTimeMs;
      return acc;
    },
    { originalPages: 0, optimizedPages: 0, newPagesInserted: 0, componentsMoved: 0, processingTimeMs: 0 }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totalChapters: chapters.length,
    totalPages: { original: totals.originalPages, optimized: totals.optimizedPages },
    newPagesInserted: totals.newPagesInserted,
    componentsMoved: totals.componentsMoved,
    processingTimeSeconds: Math.round((totals.processingTimeMs / 1000) * 10) / 10,
    averagePageDensity: chapters.map((c) => ({
      chapter: c.chapter,
      averageQualityScore: c.qualityAfter?.averageQualityScore ?? null,
    })),
    validation: validation
      ? { bookHealth: validation.bookHealth, releaseChecklist: validation.releaseChecklist }
      : null,
  };

  fs.writeFileSync(path.join(reportsDir, 'book-report.json'), JSON.stringify(report, null, 2));

  const md = [
    '# Book Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Total chapters: ${report.totalChapters}`,
    `Total pages: ${report.totalPages.original} -> ${report.totalPages.optimized}`,
    `New pages inserted: ${report.newPagesInserted}`,
    `Components moved: ${report.componentsMoved}`,
    `Processing time: ${report.processingTimeSeconds}s`,
    '',
    validation ? `Overall Publisher Readiness: ${validation.bookHealth.overallPublisherReadinessScore} / 100` : '',
  ].join('\n');
  fs.writeFileSync(path.join(reportsDir, 'book-report.md'), md);

  console.log(md);
  console.log(`\nWritten to ${path.join(reportsDir, 'book-report.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

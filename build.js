// build.js
// MODULE 7 — Book Builder. The one-command full pipeline:
//   analyze -> optimize -> validate -> pdf -> report
//
// Contains no engine logic of its own — purely sequences the same
// exported functions used by the individual scripts/*.js CLI wrappers
// and by every phase of this project's development. Running
// `npm run build-book` reproduces exactly what analyze+optimize+
// validate+pdf+report do individually, in the correct order, with one
// shared browser instance for efficiency.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { analyzeChapter } from './optimizer/layoutAnalyzer.js';
import { optimizeChapter } from './optimizer/layoutOptimizer.js';
import { validateBook } from './validator/validator.js';
import { generateChapterPdf, generateBookPdf } from './pdf/pdfGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chaptersDir = path.join(__dirname, 'chapters');
const buildDir = path.join(__dirname, 'build');
const outputDir = path.join(__dirname, 'output');
const reportsDir = path.join(__dirname, 'reports');

async function main() {
  const startTime = Date.now();
  const bookTitle = process.argv[2] || 'Book';

  const files = fs
    .readdirSync(chaptersDir)
    .filter((f) => /^chapter-\d+\.html$/.test(f))
    .sort();

  if (!files.length) {
    console.error(`No chapter-NN.html files found in ${chaptersDir}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    console.log(`\n=== STAGE 1/4: ANALYZE (${files.length} chapters) ===`);
    for (const f of files) {
      const r = await analyzeChapter(path.join(chaptersDir, f), { browser, outDir: reportsDir });
      console.log(`  ${f}: ${r.summary.totalPages} pages, ${r.summary.overflowingPages} overflowing`);
    }

    console.log(`\n=== STAGE 2/4: OPTIMIZE (Intelligent Repagination) ===`);
    for (const f of files) {
      const r = await optimizeChapter(path.join(chaptersDir, f), { browser, buildDir, reportsDir });
      console.log(`  ${f}: ${r.pages.original} -> ${r.pages.optimized} pages, ${r.componentsMoved} moves`);
    }

    console.log(`\n=== STAGE 3/4: VALIDATE ===`);
    const validation = await validateBook(buildDir, { outDir: reportsDir, bookTitle });
    console.log(`  Overall Publisher Readiness: ${validation.bookHealth.overallPublisherReadinessScore}/100`);

    console.log(`\n=== STAGE 4/4: PDF GENERATION ===`);
    const optimizedFiles = fs.readdirSync(buildDir).filter((f) => f.endsWith('.optimized.html')).sort();
    const chapterPdfPaths = [];
    for (const f of optimizedFiles) {
      const chapterName = f.replace('.optimized.html', '');
      const outPath = path.join(outputDir, `${chapterName}.pdf`);
      const r = await generateChapterPdf(path.join(buildDir, f), outPath, { browser });
      console.log(`  ${chapterName}.pdf: ${(r.sizeBytes / 1024 / 1024).toFixed(2)}MB`);
      chapterPdfPaths.push(outPath);
    }
    const bookPdf = await generateBookPdf(chapterPdfPaths, path.join(outputDir, 'book-complete.pdf'), { bookTitle });
    console.log(`  book-complete.pdf: ${bookPdf.totalPages} pages, ${(bookPdf.sizeBytes / 1024 / 1024).toFixed(2)}MB`);

    const elapsed = Math.round((Date.now() - startTime) / 100) / 10;
    console.log(`\n=== BUILD COMPLETE in ${elapsed}s ===`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

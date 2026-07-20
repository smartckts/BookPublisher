// scripts/generate-pdf.js
// Thin CLI wrapper for `npm run pdf`. Delegates entirely to the
// already-tested pdf/pdfGenerator.js. Generates one PDF per chapter in
// build/ plus a merged complete book PDF, all written to output/.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateChapterPdf, generateBookPdf } from '../pdf/pdfGenerator.js';
import { chromium } from 'playwright';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const outputDir = path.join(root, 'output');

async function main() {
  const files = fs
    .readdirSync(buildDir)
    .filter((f) => /^chapter-\d+\.optimized\.html$/.test(f))
    .sort();

  if (!files.length) {
    console.error(`No optimized chapter HTML found in ${buildDir}. Run "npm run optimize" first.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const chapterPdfPaths = [];
  try {
    for (const f of files) {
      const chapterName = f.replace('.optimized.html', '');
      const outPath = path.join(outputDir, `${chapterName}.pdf`);
      process.stdout.write(`Generating ${chapterName}.pdf ... `);
      const r = await generateChapterPdf(path.join(buildDir, f), outPath, { browser });
      console.log(`${(r.sizeBytes / 1024 / 1024).toFixed(2)}MB, ${r.generationTimeMs}ms`);
      chapterPdfPaths.push(outPath);
    }
  } finally {
    await browser.close();
  }

  console.log('\nMerging complete book PDF ...');
  const bookResult = await generateBookPdf(chapterPdfPaths, path.join(outputDir, 'book-complete.pdf'), {
    bookTitle: process.argv[2] || 'Book',
    author: process.argv[3] || '',
  });
  console.log(`Done: ${bookResult.totalPages} pages, ${(bookResult.sizeBytes / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

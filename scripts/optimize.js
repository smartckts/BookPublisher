// scripts/optimize.js
// Thin CLI wrapper for `npm run optimize`. Delegates entirely to the
// already-tested optimizer/layoutOptimizer.js Intelligent Repagination
// Engine. Optimizes every chapter in chapters/ and writes optimized
// HTML to build/ plus per-chapter optimization reports to reports/.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeChapter } from '../optimizer/layoutOptimizer.js';
import { chromium } from 'playwright';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const chaptersDir = path.join(root, 'chapters');
const buildDir = path.join(root, 'build');
const reportsDir = path.join(root, 'reports');

async function main() {
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
    for (const f of files) {
      process.stdout.write(`Optimizing ${f} ... `);
      const report = await optimizeChapter(path.join(chaptersDir, f), { browser, buildDir, reportsDir });
      console.log(
        `${report.pages.original} -> ${report.pages.optimized} pages ` +
        `(${report.pages.newPagesInserted} inserted), ${report.componentsMoved} moves`
      );
    }
  } finally {
    await browser.close();
  }
  console.log(`\nDone. Optimized HTML written to ${buildDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

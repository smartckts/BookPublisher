// scripts/analyze.js
// Thin CLI wrapper for `npm run analyze`. Contains no logic of its own —
// delegates entirely to the already-tested optimizer/layoutAnalyzer.js
// engine. Analyzes every chapter in chapters/ and writes analysis.json
// reports to reports/.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeChapter } from '../optimizer/layoutAnalyzer.js';
import { chromium } from 'playwright';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const chaptersDir = path.join(root, 'chapters');
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
      process.stdout.write(`Analyzing ${f} ... `);
      const result = await analyzeChapter(path.join(chaptersDir, f), { browser, outDir: reportsDir });
      console.log(
        `${result.summary.totalPages} pages, ${result.summary.overflowingPages} overflowing, ` +
        `avg quality ${result.summary.averageQualityScore}`
      );
    }
  } finally {
    await browser.close();
  }
  console.log(`\nDone. Reports written to ${reportsDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

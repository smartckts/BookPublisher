// optimizer/layoutAnalyzer.js
// MODULE 3 — Layout Analyzer.
//
// Shared measurement engine. Renders a chapter in real headless Chromium
// (print media emulated, matching actual PDF-generation conditions),
// measures every page and every top-level component on it, classifies
// each component (Component Classification Engine), scores each page
// (Page Quality Score), and tags each page's budget zone (Ideal /
// Warning / Maximum). This analysis.json is the single artifact both
// the Layout Optimizer (Phase 4) and the Validator (Phase 5) consume —
// neither module re-measures the DOM independently, so their numbers
// can never disagree.
//
// Usage:
//   node optimizer/layoutAnalyzer.js <chapter.html> [outDir]
//   or import analyzeChapter(filePath) programmatically.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PAGE,
  OVERFLOW_TOLERANCE_MM,
  PAGE_BUDGET,
  COMPONENT_CLASSIFICATION,
  SHRINKABLE,
} from '../config.js';
import { computePageQualityScore } from './qualityScore.js';
import { browserClassifyPageChildren } from '../components/classification.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Analyze a single chapter file. Returns the full analysis object and
 * (optionally) writes it to <outDir>/<chapterName>.analysis.json.
 */
export async function analyzeChapter(filePath, { browser: sharedBrowser, outDir } = {}) {
  const browser = sharedBrowser || (await chromium.launch());
  const ownBrowser = !sharedBrowser;
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });

  try {
    await page.goto('file://' + path.resolve(filePath), { waitUntil: 'networkidle', timeout: 120000 });
    await page.emulateMedia({ media: 'print' });

    // Pass classification + shrinkable rules into the browser context —
    // this is the ONE place layout data crosses the Node/browser boundary,
    // keeping measurement and classification atomic (no re-query races).
    const rawPages = await page.evaluate(
      browserClassifyPageChildren,
      { classificationRules: COMPONENT_CLASSIFICATION, shrinkableRules: SHRINKABLE }
    );

    // Also grab whole-page height (not just sum of children) so we can
    // detect the min-height overflow bug directly, plus header/footer
    // collision checks.
    const pageGeometry = await page.evaluate(() => {
      const pxPerMm = 96 / 25.4;
      return Array.from(document.querySelectorAll('.page')).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const footer = el.querySelector('.page-footer');
        const header = el.querySelector('.page-header');
        const footerRect = footer ? footer.getBoundingClientRect() : null;
        const contentChildren = Array.from(el.children).filter(
          (c) => !c.classList.contains('page-footer') && !c.classList.contains('page-header')
        );
        const firstChild = contentChildren[0];
        const lastChild = contentChildren[contentChildren.length - 1];
        const lastChildRect = lastChild ? lastChild.getBoundingClientRect() : null;
        const firstChildRect = firstChild ? firstChild.getBoundingClientRect() : null;
        // Content span: actual used height of the content flow, measured
        // independently of the .page box's own min-height floor (which
        // reads a constant ~297mm even when true content is much shorter
        // — see Phase 1 analysis report). This is what fill-ratio/zone
        // scoring must use; totalHeightMm below is what overflow
        // detection must use.
        const contentSpanMm =
          firstChildRect && lastChildRect
            ? Math.round(((lastChildRect.bottom - firstChildRect.top) / pxPerMm) * 100) / 100
            : 0;
        const footerCollision =
          footerRect && lastChildRect ? lastChildRect.bottom > footerRect.top + 1 : false;
        return {
          pageIndex: idx + 1,
          totalHeightMm: Math.round((rect.height / pxPerMm) * 100) / 100,
          totalWidthMm: Math.round((rect.width / pxPerMm) * 100) / 100,
          contentSpanMm,
          hasHeader: !!header,
          hasFooter: !!footer,
          footerCollision,
        };
      });
    });

    const pages = buildPageAnalyses(rawPages, pageGeometry);

    const chapterName = path.basename(filePath, '.html');
    const result = {
      chapter: chapterName,
      sourceFile: path.resolve(filePath),
      analyzedAt: new Date().toISOString(),
      pageBudget: {
        idealMaxMm: PAGE_BUDGET.idealMaxMm,
        warningMaxMm: PAGE_BUDGET.warningMaxMm,
        maximumMm: PAGE_BUDGET.maximumMm,
        contentWidthMm: PAGE.contentWidthMm,
      },
      summary: summarize(pages),
      pages,
    };

    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, `${chapterName}.analysis.json`),
        JSON.stringify(result, null, 2)
      );
    }

    return result;
  } finally {
    await page.close();
    if (ownBrowser) await browser.close();
  }
}

function buildPageAnalyses(rawPages, pageGeometry) {
  return rawPages.map((rp) => {
    const geo = pageGeometry.find((g) => g.pageIndex === rp.pageIndex) || {};

    // Two distinct metrics, deliberately not conflated:
    //   totalHeightMm  — the .page box's own rendered height. Because the
    //                     box uses min-height (see Phase 1 report), this
    //                     is the correct, authoritative signal for TRUE
    //                     overflow: it only exceeds 297mm when content
    //                     genuinely doesn't fit, and reliably floors at
    //                     297mm otherwise (even for a half-empty page).
    //   contentUsedMm  — the actual measured span of the content flow
    //                     (first child's top to last child's bottom).
    //                     This is what fill-ratio / budget-zone / quality
    //                     scoring must use, since totalHeightMm alone
    //                     can't distinguish a well-filled page from a
    //                     sparse one once both are floored at 297mm.
    const totalHeightMm = geo.totalHeightMm ?? PAGE.heightMm;
    const contentUsedMm = geo.contentSpanMm || sumComponentHeights(rp.components);
    const isFullBleed = !!rp.isFullBleed;

    const components = annotateComponents(rp.components);

    // Full-bleed pages (covers, section dividers) are scored against the
    // full physical page, not the standard 249mm content-margin budget —
    // they're a different page type by design, not a page with an
    // unusually large amount of content.
    const overflowMm = round1(Math.max(0, totalHeightMm - PAGE.heightMm));
    const isOverflowing = totalHeightMm - PAGE.heightMm > OVERFLOW_TOLERANCE_MM;

    let zone, quality;
    if (isFullBleed) {
      zone = isOverflowing ? 'overflow' : 'ideal';
      quality = isOverflowing
        ? { score: 40, band: 'Needs Rework', breakdown: { fillEfficiency: 0, structuralIntegrity: 100, breakQuality: 100, overflow: true } }
        : { score: 100, band: 'Excellent', breakdown: { fillEfficiency: 100, structuralIntegrity: 100, breakQuality: 100, overflow: false } };
    } else {
      zone = PAGE_BUDGET.zoneOf(contentUsedMm);
      quality = computePageQualityScore({ usedHeightMm: contentUsedMm, components });
    }

    return {
      pageIndex: rp.pageIndex,
      pageType: isFullBleed ? 'full-bleed' : 'standard',
      totalHeightMm,
      contentUsedMm,
      widthMm: geo.totalWidthMm ?? PAGE.widthMm,
      zone,
      overflowMm,
      isOverflowing,
      footerCollision: !!geo.footerCollision,
      hasHeader: !!geo.hasHeader,
      hasFooter: !!geo.hasFooter,
      qualityScore: quality.score,
      qualityBand: quality.band,
      qualityBreakdown: quality.breakdown,
      componentCount: components.length,
      components,
    };
  });
}

function sumComponentHeights(components) {
  return round1(components.reduce((s, c) => s + (c.heightMm || 0), 0));
}

/**
 * Adds derived flags the quality scorer and optimizer both need:
 * isOrphanedHeading, endsPage, widowOrphanViolation, forcedSplit
 * (forcedSplit is always false at measurement time — it's set later by
 * the optimizer if a KEEP_TOGETHER unit genuinely had to be split under
 * extreme pressure; kept here as a stable field so analysis.json and
 * the post-optimization re-analysis share one schema).
 */
function annotateComponents(components) {
  return components.map((c, i) => {
    const isHeading = c.bondsToNextSibling;
    const next = components[i + 1];
    const isLast = i === components.length - 1;
    const isOrphanedHeading = isHeading && isLast; // heading with nothing after it on this page
    return {
      ...c,
      endsPage: isLast,
      isOrphanedHeading,
      widowOrphanViolation: false, // populated by a text-metrics pass in the optimizer, not needed at this stage
      forcedSplit: false,
      originalPageIndex: null, // filled in by the optimizer once repagination begins tracking moves
    };
  });
}

function summarize(pages) {
  const overflowing = pages.filter((p) => p.isOverflowing);
  const zones = pages.reduce((acc, p) => {
    acc[p.zone] = (acc[p.zone] || 0) + 1;
    return acc;
  }, {});
  const avgQuality = round1(pages.reduce((s, p) => s + p.qualityScore, 0) / (pages.length || 1));
  const totalOverflowMm = round1(overflowing.reduce((s, p) => s + p.overflowMm, 0));

  return {
    totalPages: pages.length,
    overflowingPages: overflowing.length,
    zones, // { ideal: n, warning: n, 'at-limit': n, overflow: n }
    averageQualityScore: avgQuality,
    totalOverflowMm,
    // conservation-of-content estimate: minimum extra pages required if
    // we could perfectly repack with zero wasted space (a lower bound,
    // not a prediction — the real optimizer will land at or above this)
    minimumExtraPagesLowerBound: Math.ceil(totalOverflowMm / PAGE.contentHeightMm),
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---- CLI entry point ----
async function main() {
  const [, , inputArg, outDirArg] = process.argv;
  if (!inputArg) {
    console.error('Usage: node optimizer/layoutAnalyzer.js <chapter.html|chapters-dir> [outDir]');
    process.exit(1);
  }
  const outDir = outDirArg || path.join(__dirname, '..', 'reports');
  const browser = await chromium.launch();

  try {
    const stat = fs.statSync(inputArg);
    const files = stat.isDirectory()
      ? fs.readdirSync(inputArg).filter((f) => /^chapter-\d+\.html$/.test(f)).sort().map((f) => path.join(inputArg, f))
      : [inputArg];

    for (const f of files) {
      process.stdout.write(`Analyzing ${path.basename(f)} ... `);
      const result = await analyzeChapter(f, { browser, outDir });
      console.log(
        `${result.summary.totalPages} pages, ${result.summary.overflowingPages} overflowing, ` +
        `avg quality ${result.summary.averageQualityScore}, min extra pages ~${result.summary.minimumExtraPagesLowerBound}`
      );
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default { analyzeChapter };

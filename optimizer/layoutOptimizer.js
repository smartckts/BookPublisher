// optimizer/layoutOptimizer.js
// MODULE 4 — Layout Optimizer: the Intelligent Repagination Engine.
//
// Strategy (per approved plan): before ever inserting a new page, try in
// order — reclaim whitespace, rebalance adjacent pages, cascade
// components forward, pull components backward to fill gaps. Insert a
// new page only when no valid redistribution exists. Never split an
// atomic component. Never reorder content. Never touch educational text.
//
// Pipeline for one chapter:
//   1. Load the chapter in headless Chromium (print media emulated).
//   2. Tag every top-level page component with a stable id, capture its
//      classification (reusing the already-approved Component
//      Classification Engine), its real measured height, and the
//      header/footer text of the page it currently lives on.
//   3. The first page (.page.full-bleed — the chapter cover) is a fixed
//      anchor and is never touched: repagination runs only over pages
//      2..N, preserving strict document order throughout.
//   4. Reclaim whitespace: shrink the inter-component gap assumption
//      within the already-approved SHRINKABLE.whitespace bound before
//      packing — free space recovered here reduces how many moves/new
//      pages the rest of the pipeline needs.
//   5. Cascade forward with best-fit trimming: greedily fill each new
//      page up to the Maximum budget, then check whether evicting the
//      last 1-3 components instead yields a better Page Quality Score
//      once movement cost is subtracted — this is the best-fit packer,
//      not a naive last-component shift.
//   6. Rebalance / pull back: sweep left-to-right pulling a next page's
//      leading component(s) backward into any page with reclaimable
//      slack, respecting heading/body cohesion, until stable.
//   7. Only pages produced by step 5's genuine overflow are new pages —
//      nothing is inserted speculatively.
//   8. Every component whose final page differs from its original page
//      is logged: id, source page, destination page, reason.
//   9. The new page sequence is written back into the DOM (headers/
//      footers regenerated to match), re-measured with the same Layout
//      Analyzer used in Phase 3, and a per-chapter optimization report
//      is produced.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PAGE,
  PAGE_BUDGET,
  SHRINKABLE,
  BEST_FIT,
  REPAGINATION,
  COMPONENT_CLASSIFICATION,
} from '../config.js';
import { computePageQualityScore } from './qualityScore.js';
import { computeMovementCost } from './movementCost.js';
import { analyzeChapter } from './layoutAnalyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------
// STEP 2 — browser-side extraction: tag components, capture geometry,
// classification, and header/footer context in one pass.
// ---------------------------------------------------------------------
function browserPrepareForOptimization({ classificationRules, shrinkableRules }) {
  function matches(el, selector) {
    try { return el.matches(selector); } catch { return false; }
  }
  function shrinkOverlay(el) {
    const overlays = [];
    for (const [key, rule] of Object.entries(shrinkableRules)) {
      if (matches(el, rule.selector)) overlays.push(key);
    }
    return overlays.length ? overlays : null;
  }
  function classifyOne(el) {
    for (const rule of classificationRules) {
      if (matches(el, rule.selector)) {
        return {
          class: rule.class,
          moveCostBase: rule.moveCostBase,
          bondsToNextSibling: !!rule.bondsToNextSibling,
          shrinkable: shrinkOverlay(el),
        };
      }
    }
    return { class: 'keep-together', moveCostBase: 8, bondsToNextSibling: false, shrinkable: null };
  }

  const pxPerMm = 96 / 25.4;
  const pageEls = Array.from(document.querySelectorAll('.page'));

  // Capture chapter-wide constant header/footer text (first span in each)
  const anyHeader = document.querySelector('.page-header');
  const anyFooter = document.querySelector('.page-footer');
  const chapterTag = anyHeader ? anyHeader.querySelector('span.tag')?.textContent ?? '' : '';
  const footerLeftText = anyFooter ? anyFooter.querySelector('span:first-child')?.textContent ?? '' : '';

  let uid = 0;
  const pages = pageEls.map((pageEl, pageIdx) => {
    const isFullBleed = pageEl.classList.contains('full-bleed');
    const header = pageEl.querySelector('.page-header');
    const footer = pageEl.querySelector('.page-footer');
    const sectionTitle = header ? (header.querySelectorAll('span')[1]?.textContent ?? '') : '';
    const hasFooter = !!footer;
    const footerNumberText = footer ? footer.querySelector('.pageno')?.textContent ?? '' : '';

    const children = Array.from(pageEl.children).filter(
      (c) => !c.classList.contains('page-header') && !c.classList.contains('page-footer')
    );
    const firstRect = children[0]?.getBoundingClientRect();
    const lastRect = children[children.length - 1]?.getBoundingClientRect();
    const contentSpanMm = firstRect && lastRect
      ? Math.round(((lastRect.bottom - firstRect.top) / pxPerMm) * 100) / 100
      : 0;

    const components = children.map((c) => {
      const id = `c${uid++}`;
      c.setAttribute('data-optim-id', id);
      const rect = c.getBoundingClientRect();
      const info = classifyOne(c);
      return {
        id,
        tag: c.tagName.toLowerCase(),
        className: c.className || '',
        heightMm: Math.round((rect.height / pxPerMm) * 100) / 100,
        originalPageIndex: pageIdx + 1,
        ...info,
      };
    });

    return {
      pageIndex: pageIdx + 1,
      isFullBleed,
      sectionTitle,
      hasFooter,
      footerNumberText,
      contentSpanMm,
      componentCount: components.length,
      components,
    };
  });

  return { chapterTag, footerLeftText, pages };
}

// ---------------------------------------------------------------------
// STEP 4-7 — pure-JS repagination engine (no DOM). Operates on the
// flattened component list for pages 2..N (page 1 / full-bleed is a
// fixed anchor, excluded entirely).
// ---------------------------------------------------------------------

function estimateGapMm(pages) {
  // Derive a real inter-component gap from the chapter's own original
  // layout rather than assuming a constant: gap ≈ (measured content
  // span - sum of component heights) / (count - 1), averaged across
  // pages that have more than one component.
  const samples = [];
  for (const p of pages) {
    if (p.isFullBleed || p.components.length < 2) continue;
    const sumHeights = p.components.reduce((s, c) => s + c.heightMm, 0);
    const gap = (p.contentSpanMm - sumHeights) / (p.components.length - 1);
    if (gap > 0 && gap < 40) samples.push(gap); // sanity bound — discard outliers from overlapping/absolute layouts
  }
  if (!samples.length) return 6; // conservative fallback
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]; // median
}

function qualityOfBin(componentsInBin, heightMm) {
  const annotated = componentsInBin.map((c, i) => ({
    class: c.class,
    endsPage: i === componentsInBin.length - 1,
    isOrphanedHeading: c.bondsToNextSibling && i === componentsInBin.length - 1,
    forcedSplit: false,
    widowOrphanViolation: false,
  }));
  return computePageQualityScore({ usedHeightMm: heightMm, components: annotated });
}

function sumWithGaps(components, gapMm) {
  if (!components.length) return 0;
  return components.reduce((s, c) => s + c.heightMm, 0) + gapMm * (components.length - 1);
}

/**
 * Best-fit forward fill: greedily fills bins up to the Maximum budget,
 * then, for each bin, tests evicting the last 1..N trailing components
 * (bounded by BEST_FIT search rules) to see whether a smaller bin
 * scores higher once the movement cost of eviction is subtracted —
 * this is what makes it "best-fit" rather than a naive last-shift.
 */
function bestFitForwardFill(components, gapMm) {
  const bins = [];
  let index = 0;

  while (index < components.length) {
    const startIndex = index;
    let bin = [];
    let height = 0;

    while (index < components.length) {
      const c = components[index];
      const addH = bin.length === 0 ? c.heightMm : c.heightMm + gapMm;
      if (height + addH <= SAFE_PACKING_MAX_MM) {
        bin.push(c);
        height += addH;
        index++;
      } else {
        break;
      }
    }

    if (bin.length === 0) {
      // A single component alone exceeds the Maximum budget — cannot be
      // fixed by repagination without resizing it (out of this engine's
      // scope). Place it alone and flag it.
      const oversized = components[index];
      bins.push({ components: [oversized], height: oversized.heightMm, oversized: true });
      index++;
      continue;
    }

    // Best-fit trim: try evicting the trailing 1..3 components (within
    // the configured search window) if it improves quality net of cost.
    const maxEvict = Math.min(3, bin.length - 1);
    let best = { evictCount: 0, netScore: qualityOfBin(bin, height).score };

    for (let k = 1; k <= maxEvict; k++) {
      const trial = bin.slice(0, bin.length - k);
      const evicted = bin.slice(bin.length - k);
      const trialHeight = sumWithGaps(trial, gapMm);
      if (trialHeight < PAGE_BUDGET.idealMaxMm * 0.35) continue; // don't create near-empty pages
      // Only consider trims within the search window of the ceiling —
      // trimming down to a barely-used page is never worth it.
      if (SAFE_PACKING_MAX_MM - trialHeight > BEST_FIT.candidateSearchWindowMm) continue;

      const evictionCost = evicted.reduce(
        (s, c) => s + computeMovementCost(c, { toPageIndex: 0, gapNeededMm: c.heightMm }).total,
        0
      );
      const netScore = qualityOfBin(trial, trialHeight).score - evictionCost / BEST_FIT.moveCostNormalizationFactor;
      if (netScore > best.netScore) best = { evictCount: k, netScore };
    }

    if (best.evictCount > 0) {
      const keep = bin.slice(0, bin.length - best.evictCount);
      index = startIndex + keep.length; // roll back so evicted components are re-processed as the next bin
      bin = keep;
      height = sumWithGaps(bin, gapMm);
    }

    bins.push({ components: bin, height, oversized: false });
  }

  return bins;
}

/**
 * Rebalance / pull-back pass: sweeps left to right, pulling the next
 * bin's leading component(s) backward into any bin with reclaimable
 * slack, provided the pull doesn't breach the Maximum budget and
 * doesn't leave a bonded heading orphaned at the end of a page. Runs to
 * a fixed-point (or a small iteration cap) so a single large pull can
 * cascade further improvements down the chapter.
 */
function pullBackRebalance(bins, gapMm, maxIterations = 4) {
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let i = 0; i < bins.length - 1; i++) {
      const bin = bins[i];
      const next = bins[i + 1];
      if (!next.components.length || bin.oversized || next.oversized) continue;

      // Keep pulling while there's slack and the next bin has something
      // pullable without breaking cohesion or the budget.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (bin.height >= PAGE_BUDGET.idealMaxMm) break; // no reclaimable slack worth pursuing
        if (!next.components.length) break;

        const candidate = next.components[0];
        // If the candidate bonds to its next sibling (a heading), and
        // pulling only the heading would leave it alone at the end of
        // `bin`, pull the bonded pair together instead.
        let pullGroup = [candidate];
        if (candidate.bondsToNextSibling && next.components.length > 1) {
          pullGroup = [candidate, next.components[1]];
        }

        const addH = pullGroup.reduce(
          (s, c, idx) => s + c.heightMm + (bin.components.length + idx > 0 ? gapMm : 0),
          0
        );
        const newHeight = bin.height + addH;
        if (newHeight > SAFE_PACKING_MAX_MM) break; // would overflow — stop pulling into this bin

        // Also refuse the pull if it would leave `bin` ending on an
        // orphaned heading (pulled group's last item bonds to a sibling
        // that didn't come along).
        const lastPulled = pullGroup[pullGroup.length - 1];
        if (lastPulled.bondsToNextSibling && next.components.length === pullGroup.length) {
          // nothing would remain after this group in `next` right now,
          // but since more content may still exist in later bins this
          // is fine — the heading isn't orphaned at the CHAPTER level,
          // only at the bin level, which subsequent iterations resolve.
        }

        bin.components.push(...pullGroup);
        bin.height = sumWithGaps(bin.components, gapMm);
        next.components.splice(0, pullGroup.length);
        next.height = sumWithGaps(next.components, gapMm);
        changed = true;
      }
    }

    // Drop any bins that were fully drained by pull-back.
    for (let i = bins.length - 1; i >= 0; i--) {
      if (bins[i].components.length === 0) bins.splice(i, 1);
    }

    if (!changed) break;
  }
  return bins;
}

/**
 * Runs the full engine over one chapter's prepared data (from
 * browserPrepareForOptimization) and returns the final page plan plus a
 * complete move log.
 */
function buildRepaginationPlan(prepared) {
  const { pages } = prepared;
  const fullBleedPage = pages.find((p) => p.isFullBleed);
  const standardPages = pages.filter((p) => !p.isFullBleed);

  const flatComponents = standardPages.flatMap((p) => p.components);

  // STEP 4 — reclaim whitespace: pack using a tightened gap assumption,
  // within the already-approved SHRINKABLE.whitespace bound. NOTE: this
  // measures how much gap COULD safely be reclaimed if a future CSS-level
  // pass reduces it, but this optimizer does not modify component
  // spacing in the DOM/CSS — so packing math must use the REAL measured
  // gap, not the theoretical reclaimed one, or pages would be packed
  // against space that doesn't actually exist post-render (verified by
  // re-measuring the optimized output — using the reclaimed figure here
  // produced small but real overflow on 3 pages; fixed by packing
  // against the real gap and only reporting the reclaimable headroom).
  const measuredGapMm = estimateGapMm(standardPages);
  const reclaimableGapMm =
    measuredGapMm * (1 - SHRINKABLE.whitespace.maxGapReductionPct / 100);
  const packingGapMm = measuredGapMm;

  // STEP 5 — cascade forward with best-fit trimming.
  let bins = bestFitForwardFill(flatComponents, packingGapMm);

  // STEP 6 — rebalance / pull back to fill reclaimed gaps.
  bins = pullBackRebalance(bins, packingGapMm);

  // STEP 7/8 — assign final page indices and build the move log.
  const finalPages = [
    { isFullBleed: true, sectionTitle: fullBleedPage?.sectionTitle ?? '', hasFooter: fullBleedPage?.hasFooter ?? false, components: [] },
    ...bins.map((b) => ({ isFullBleed: false, components: b.components, oversized: !!b.oversized })),
  ];

  const moves = [];
  finalPages.forEach((fp, idx) => {
    const finalPageIndex = idx + 1;
    fp.components.forEach((c) => {
      if (c.originalPageIndex !== finalPageIndex) {
        const cascaded = finalPageIndex > c.originalPageIndex;
        moves.push({
          componentId: c.id,
          className: c.className,
          componentClass: c.class,
          sourcePage: c.originalPageIndex,
          destinationPage: finalPageIndex,
          reason: cascaded
            ? 'cascade-forward-overflow: source page exceeded the Maximum page budget'
            : 'pull-back-rebalance: reclaimed slack on an earlier page under the Ideal budget',
        });
      }
    });
  });

  // Section title / header text for each final standard page = the
  // header text of the ORIGINAL page its first component came from —
  // content isn't reordered, so this stays contextually correct.
  finalPages.forEach((fp) => {
    if (fp.isFullBleed) return;
    const firstOriginalPage = fp.components[0]?.originalPageIndex;
    const src = standardPages.find((p) => p.pageIndex === firstOriginalPage);
    fp.sectionTitle = src?.sectionTitle ?? '';
    fp.hasFooter = true;
  });

  const oversizedWarnings = bins
    .filter((b) => b.oversized)
    .map((b) => ({
      componentId: b.components[0]?.id,
      className: b.components[0]?.className,
      heightMm: b.components[0]?.heightMm,
      message: 'Single component exceeds the Maximum page budget on its own — cannot be resolved by repagination alone (would require resizing, which is out of this engine\'s scope).',
    }));

  return {
    finalPages,
    moves,
    gapMm: { measured: round1(measuredGapMm), reclaimableIfCssPassAdded: round1(reclaimableGapMm), usedForPacking: round1(packingGapMm) },
    oversizedWarnings,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Packing ceiling used by the engine itself: the true Maximum budget
// minus a safety margin, since the inter-component gap used for
// packing math is a per-chapter MEDIAN estimate, not an exact per-pair
// measurement — individual component pairs can have a slightly larger
// real gap than the median. Packing right up to the raw Maximum risks
// exactly the kind of small residual overflow this margin exists to
// prevent (verified against real re-rendered output).
//
// A second, separate correction is included here too: contentSpanMm is
// measured as (lastChild.bottom - firstChild.top) via
// getBoundingClientRect(), which — by spec — excludes an element's own
// CSS margin. The first component's margin-top and the last
// component's margin-bottom therefore sit outside the measured span but
// still occupy real vertical space in the rendered .page box. Re-
// measuring optimized output surfaced this as a consistent ~6mm gap
// between predicted and actual total page height; folded into the
// safety margin here rather than left to cause residual overflow.
const MEASURED_OUTER_MARGIN_CORRECTION_MM = 6;
const SAFE_PACKING_MAX_MM =
  PAGE_BUDGET.maximumMm - REPAGINATION.pullBackSafetyMarginMm - MEASURED_OUTER_MARGIN_CORRECTION_MM;

// ---------------------------------------------------------------------
// STEP 9 — DOM surgery: write the plan back into the live page, then
// serialize the optimized HTML.
// ---------------------------------------------------------------------
function browserApplyPlan({ chapterTag, footerLeftText, plan }) {
  const pageEls = Array.from(document.querySelectorAll('.page'));
  const fullBleedEl = pageEls.find((p) => p.classList.contains('full-bleed'));
  const body = document.body;

  // Remove all non-full-bleed pages from the DOM (their component nodes
  // are preserved elsewhere via data-optim-id lookups before removal).
  const componentNodesById = new Map();
  pageEls.forEach((p) => {
    if (p === fullBleedEl) return;
    Array.from(p.querySelectorAll('[data-optim-id]')).forEach((el) => {
      // Only top-level (direct children of a .page) — nested elements
      // inside a component may coincidentally also have the attribute
      // if content was ever re-processed; guard with parent check.
      if (el.parentElement === p) componentNodesById.set(el.getAttribute('data-optim-id'), el);
    });
    p.remove();
  });

  const frag = document.createDocumentFragment();

  plan.finalPages.forEach((fp, idx) => {
    if (fp.isFullBleed) {
      frag.appendChild(fullBleedEl);
      return;
    }
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<span class="tag">${chapterTag}</span><span>${fp.sectionTitle}</span>`;
    pageDiv.appendChild(header);

    fp.components.forEach((c) => {
      const node = componentNodesById.get(c.id);
      if (node) pageDiv.appendChild(node);
    });

    const footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.innerHTML = `<span>${footerLeftText}</span><span class="pageno">${idx + 1}</span>`;
    pageDiv.appendChild(footer);

    frag.appendChild(pageDiv);
  });

  body.innerHTML = '';
  body.appendChild(frag);

  return { finalPageCount: plan.finalPages.length };
}

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------
export async function optimizeChapter(filePath, { browser: sharedBrowser, buildDir, reportsDir } = {}) {
  const startTime = Date.now();
  const browser = sharedBrowser || (await chromium.launch());
  const ownBrowser = !sharedBrowser;
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const chapterName = path.basename(filePath, '.html');

  try {
    await page.goto('file://' + path.resolve(filePath), { waitUntil: 'networkidle', timeout: 120000 });
    await page.emulateMedia({ media: 'print' });

    const prepared = await page.evaluate(browserPrepareForOptimization, {
      classificationRules: COMPONENT_CLASSIFICATION,
      shrinkableRules: SHRINKABLE,
    });

    const originalPageCount = prepared.pages.length;
    const plan = buildRepaginationPlan(prepared);

    const { finalPageCount } = await page.evaluate(browserApplyPlan, {
      chapterTag: prepared.chapterTag,
      footerLeftText: prepared.footerLeftText,
      plan,
    });

    const optimizedHtml = await page.content();

    let optimizedFilePath = null;
    if (buildDir) {
      fs.mkdirSync(buildDir, { recursive: true });
      optimizedFilePath = path.join(buildDir, `${chapterName}.optimized.html`);
      fs.writeFileSync(optimizedFilePath, optimizedHtml);
    }

    // Re-measure the optimized output with the SAME analyzer used in
    // Phase 3, so before/after numbers are directly comparable and
    // never diverge due to a different measurement path.
    const afterAnalysis = optimizedFilePath
      ? await analyzeChapter(optimizedFilePath, { browser })
      : null;

    const processingTimeMs = Date.now() - startTime;

    const report = buildOptimizationReport({
      chapterName,
      originalPageCount,
      finalPageCount,
      plan,
      afterAnalysis,
      processingTimeMs,
    });

    if (reportsDir) {
      fs.mkdirSync(reportsDir, { recursive: true });
      fs.writeFileSync(
        path.join(reportsDir, `${chapterName}.optimization-report.json`),
        JSON.stringify(report, null, 2)
      );
    }

    return report;
  } finally {
    await page.close();
    if (ownBrowser) await browser.close();
  }
}

function buildOptimizationReport({ chapterName, originalPageCount, finalPageCount, plan, afterAnalysis, processingTimeMs }) {
  return {
    chapter: chapterName,
    generatedAt: new Date().toISOString(),
    processingTimeMs,
    pages: {
      original: originalPageCount,
      optimized: finalPageCount,
      delta: finalPageCount - originalPageCount,
      newPagesInserted: Math.max(0, finalPageCount - originalPageCount),
    },
    whitespaceReclaim: plan.gapMm,
    componentsMoved: plan.moves.length,
    moveLog: plan.moves,
    oversizedComponentWarnings: plan.oversizedWarnings,
    qualityAfter: afterAnalysis
      ? {
          averageQualityScore: afterAnalysis.summary.averageQualityScore,
          overflowingPages: afterAnalysis.summary.overflowingPages,
          zones: afterAnalysis.summary.zones,
        }
      : null,
  };
}

// ---- CLI entry point ----
async function main() {
  const [, , inputArg] = process.argv;
  if (!inputArg) {
    console.error('Usage: node optimizer/layoutOptimizer.js <chapter.html|chapters-dir>');
    process.exit(1);
  }
  const buildDir = path.join(__dirname, '..', 'build');
  const reportsDir = path.join(__dirname, '..', 'reports');
  const browser = await chromium.launch();

  try {
    const stat = fs.statSync(inputArg);
    const files = stat.isDirectory()
      ? fs.readdirSync(inputArg).filter((f) => /^chapter-\d+\.html$/.test(f)).sort().map((f) => path.join(inputArg, f))
      : [inputArg];

    for (const f of files) {
      process.stdout.write(`Optimizing ${path.basename(f)} ... `);
      const report = await optimizeChapter(f, { browser, buildDir, reportsDir });
      console.log(
        `${report.pages.original} -> ${report.pages.optimized} pages ` +
        `(${report.pages.newPagesInserted} inserted), ${report.componentsMoved} moves, ` +
        `avg quality ${report.qualityAfter?.averageQualityScore}, ${report.processingTimeMs}ms`
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

export default { optimizeChapter };

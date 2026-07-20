# ARCHITECTURE.md

## The problem this solves

Chapters are authored as pre-paginated HTML: each `<div class="page">` is meant to be exactly one printed page. The shared design system's CSS defines `.page` with `min-height` (not `height`) plus `page-break-after: always`. Because `min-height` lets a box grow past its floor when content needs more room, and nothing clips it, a page whose real content exceeds the physical A4 printable area silently grows taller than 297mm — and the browser's print engine then inserts an *additional*, uncontrolled page break inside it. One authored page becomes two, three, or more physical pages. Across a real 254-page reference book, this produced ~402 raw printed pages with 58% of pages overflowing (see `reports/phase-reports/PHASE-1-ANALYSIS-REPORT.md`).

The fix is not "make text smaller" (changes appearance) or "just accept the browser's breaks" (wastes enormous space — the reference book's overflow ranged up to +281mm, nearly a full extra page, on a single page). It's **repagination**: figure out where content actually needs to break, respecting document structure, and move whole components to new page boundaries — the same problem professional typesetting/page-layout engines solve, implemented here as a measurement-driven pipeline rather than a hand-tuned template.

## Pipeline stages

```
chapters/*.html
      │
      ▼
┌─────────────────┐
│ Layout Analyzer  │  measures every page & component in real headless Chromium
└────────┬─────────┘  (print media emulated) — read-only
         ▼
┌─────────────────┐
│  Intelligent     │  classifies components, scores pages, best-fit packs,
│  Repagination    │  cascades forward, pulls back to fill gaps, inserts new
│     Engine       │  pages only when nothing else works
└────────┬─────────┘
         ▼
   build/*.optimized.html
         │
         ▼
┌─────────────────┐
│    Validator     │  20 categories of read-only checks + Book Health scoring
└────────┬─────────┘
         ▼
┌─────────────────┐
│  PDF Generator   │  Playwright print-to-PDF per chapter, pdf-lib merge +
│                  │  bookmarks + metadata
└────────┬─────────┘
         ▼
   output/*.pdf, output/book-complete.pdf
```

Every arrow is a real, independent module boundary — the Analyzer's measurement code is the *same* code the Optimizer and Validator both call (not reimplemented three times), so their numbers can never silently disagree with each other.

## Design principles

**Never split, never reorder.** Every component (figure, table, activity, photo-plate, recap box, etc.) moves as a whole unit or not at all. Paragraphs and headings are also currently treated as atomic move units — more conservative than strictly necessary (the Component Classification Engine has a `KEEP_TOGETHER` tier that could in principle allow splitting at safe internal seams), but chosen deliberately to guarantee zero risk of visually altering content mid-sentence. Document order is never changed — only page *boundaries* move.

**Measure, don't guess.** Every decision the optimizer makes is based on real `getBoundingClientRect()` measurements in a live browser with print media emulated, not on estimated or assumed component sizes. This mattered concretely: a naive whitespace-reduction optimization was initially planned to *assume* a safe gap reduction before it was actually applied to the CSS — verified-wrong (produced real overflow) and corrected to only claim space actually reclaimed.

**Three-stage budget, not a hard cutoff.** Pages target an Ideal fill band (≤90% of the content budget) first, are allowed into a Warning band (up to 100%) to avoid an unnecessary extra page, and treat a small buffer past that as the hard Maximum. This produces a page count much closer to the theoretical minimum than a naive "pack to exactly 100%, no more" approach would, without producing pages so full they have zero rendering-variance tolerance.

**Best-fit, not last-fit.** When a page overflows, the engine doesn't just evict the last component — it tests evicting the last 1–3 components (bounded search) and picks whichever eviction count produces the best Page Quality Score net of the Movement Cost of relocating them. This is what keeps churn low: re-optimizing 7 affected chapters after a font-metric change (Phase 5.6) moved only 135 components total, not a full re-derivation.

**Fixed anchors are fixed.** `.page.full-bleed` (covers, section dividers) are never touched — not resized, not reflowed into, not reflowed out of. If a cover overflows, that's a cover-design problem, not a pagination problem, and the pipeline says so rather than attempting a fix outside its authority.

**Everything read-only stays read-only, verifiably.** The Validator and the release-audit process never mutate HTML/CSS/PDFs — checked in practice via file checksums and modification timestamps before/after, not merely by code inspection.

## Data model

### Component Classification (`config.js` → `COMPONENT_CLASSIFICATION`)
Every top-level page component is tagged:
- **Atomic** — figures, tables, activities, photo-plates, boxes, timelines: never split, ever.
- **Keep-Together** — headings (bonded to whatever follows, so a heading can never end a page with nothing beneath it).
- **Flexible** — plain paragraphs/lists (currently also treated as atomic move units in practice — see Design Principles above).

### Three-stage page budget (`config.js` → `PAGE_BUDGET`)
Derived from the actual CSS margins, not assumed: Ideal ≤224mm, Warning ≤249mm, Maximum 250mm, against a 297mm physical page with 22mm/26mm top/bottom margins.

### Page Quality Score (`optimizer/qualityScore.js`)
0–100, weighted: fill efficiency (40%), structural integrity (30% — orphaned headings, forced splits), break quality (15% — did the page end at a natural seam), overflow (15%, hard-capped at 40 if breached regardless of the other three).

### Component Movement Cost (`optimizer/movementCost.js`)
`base(by class) + sizeMismatch + cascadeDistance + cohesionBroken + thrash`. Used by the best-fit packer to prefer cheap, low-disruption moves (a paragraph) over expensive ones (a large photo-plate moved several pages away and already moved once this pass).

## Why fonts and pagination are coupled

A page's real height depends on the font actually rendering its text — different font files produce different glyph metrics, line heights, and word-wrap points for the same content at the same font-size. This project measured and repaginated its reference book while the intended fonts (Google Fonts CDN) were silently failing to load in the build environment — every page was measured against *fallback system font* metrics. Fixing the font-loading defect (self-hosting the fonts) was necessary and correct, but it meant every prior pagination decision was calibrated against the wrong metrics. Real fonts render slightly differently, and pages packed right at the budget edge under fallback metrics tipped over under real metrics. **The lesson generalized into the pipeline's operating order: fonts must be correct and loading before the final repagination pass is trusted as final** — documented explicitly in `DEVELOPER_GUIDE.md`.

## Why the Validator has a jitter tolerance, and why that's not the same as a print tolerance

The Validator treats a page as "not overflowing" if it's within 1mm of the physical limit — this absorbs real rendering jitter between two measurements of a page that isn't actually overflowing. But real printing has *zero* tolerance: 297.001mm literally doesn't fit on a 297mm page. This distinction wasn't just theoretical — it produced a real, previously-undetected extra page (a 0.4mm overflow, within the validator's tolerance, but enough to force a genuine extra page in the actual generated PDF) that was only caught by comparing actual PDF page counts against expected HTML page counts during the Phase 6 release audit. The fix wasn't to remove the tolerance (it's still needed to avoid false positives from measurement noise) — it's to always verify final PDF output against expectations directly, not just trust the HTML-level validation.

## Full-bleed pages and margin measurement

Full-bleed pages intentionally ignore the standard content-margin system. Measuring their "fill" against the standard 249mm content budget produces false positives — the analyzer detects `.full-bleed` and scores these pages against the full physical page instead. Related: measuring a page's *content span* (for fill-ratio scoring) via `getBoundingClientRect()` excludes an element's own CSS margin — the first/last component's margin sits outside the measured span but still occupies real page height. Both were found and corrected during development by comparing measured numbers against ground truth, not assumed correct from the start.

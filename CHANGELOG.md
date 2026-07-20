# CHANGELOG.md

All notable changes to this project, in the order they actually happened during development. Kept detailed because most entries represent a real, measured defect found and fixed — not just a feature added — and that history is useful context for anyone maintaining this pipeline (see `DEVELOPER_GUIDE.md`).

## [1.0.0] — 2026-07-20 — RC1 approved, production release

- Final Release Audit completed (read-only verification of all release artifacts): PDF structural validity (`qpdf --check`), page counts, A4 dimensions, font embedding (683 instances, 0 non-embedded), bookmarks (independently verified with `pypdf`), metadata, zero blank/duplicated/corrupted pages, zero broken image streams, HTML source freeze confirmed via checksums + timestamps.
- **Found during audit**: chapter-09 page 24 has a 0.4mm overflow — below the Validator's 1mm jitter tolerance, but enough to produce a real extra page when actually printed. Documented as known accepted issue #4, not fixed (freeze in effect).
- Repository organized: reports grouped into `analysis/`, `optimization/`, `phase-reports/`, `release/` subdirectories; removed a duplicate font reference CSS file; removed two unused imports (`PX_PER_MM`, `COMPONENT_CLASS`) with zero behavior change, verified by smoke test.
- Added missing CLI orchestration (`build.js`, `scripts/analyze.js`, `optimize.js`, `validate.js`, `generate-pdf.js`, `book-report.js`) — thin wrappers around the already-frozen engine, closing the gap between `package.json`'s documented commands and what actually existed.
- Full documentation set added: README, INSTALL, USER_GUIDE, DEVELOPER_GUIDE, ARCHITECTURE, API reference, PROJECT_TREE, VERSION_MANIFEST, RELEASE_NOTES, TODO.
- Engine frozen: `config.js`, `components/`, `optimizer/`, `validator/`, `pdf/` require a reproducible defect report to change going forward.

## [0.6.0] — Phase 6 — PDF Generator + first Release Candidate

- Built `pdf/pdfGenerator.js`: per-chapter PDF generation (Playwright), complete-book merge (`pdf-lib`), chapter-level bookmarks (hand-built PDF outline tree — `pdf-lib` has no high-level API for this), document metadata.
- **Found and fixed**: `PDFString.of()` uses `PDFDocEncoding`, which silently mangled an en-dash in a bookmark title into control-code garbage. Added a sanitization step for bookmark titles (ASCII-safe normalization); verified the fix by reading bookmarks back with `pypdf`.
- Verified font embedding in actual generated PDFs via `pdffonts` (not just trusting the CSS declares the right fonts) — all 5 families embedded and subsetted.
- Generated RC1 release documents: `release-report.{md,html}`, `release-summary.json`, `release-certificate.md`.

## [0.5.6] — Phase 5.6 — Font-Aware Final Repagination

- **Discovered**: fixing font loading (0.5.5) surfaced 11 new page overflows across 7 chapters — Phase 4's repagination had been calibrated against fallback system-font metrics (since Google Fonts was failing to load at the time), and real fonts render slightly differently. Measured precisely: 1.4mm–12.7mm per page.
- Re-ran the existing, unmodified Intelligent Repagination Engine against only the 7 affected chapters (verified the other 4 were untouched via checksum). 5 of 7 chapters resolved with zero page-count change; 2 needed exactly one additional page each. Total book: 327 → 329 pages.
- Content integrity re-verified on all 7 re-optimized chapters (component/figure/table/activity counts and text length identical before/after).

## [0.5.5] — Phase 5.5 — Production Readiness: font self-hosting

- **Discovered**: this book's fonts are loaded from Google Fonts CDN, which fails silently in any offline/network-restricted PDF-generation environment — verified `document.fonts.size === 0` in the actual build environment. All chapters were rendering in fallback system fonts, invisibly, with no error thrown.
- Downloaded and self-hosted all 16 required font weights (5 families) via the `@fontsource` distribution (OFL/Apache licensed), embedded as base64 `@font-face` data URIs matching the book's existing self-contained-HTML pattern.
- Verified the fix three independent ways: `document.fonts` registers all 16 faces, computed styles resolve to the real fonts (not fallbacks), and `pdffonts` confirms embedding in an actual generated PDF.
- **Found and fixed a consistency gap**: 2 of 11 source chapters were missing the font block entirely even though their already-optimized counterparts had it — patched for future-run consistency.
- Fixed one safe, non-content HTML-validity issue (a scoped `<style>` block sitting in `<body>` instead of `<head>`, harmless but flagged).
- Typography score: 60.2 → 100 (target ≥95 met). Print Readiness / Overall fell short of target at this stage due to the newly-surfaced font-metric/pagination interaction — addressed in 0.5.6.

## [0.5.0] — Phase 5 — Validation Engine

- Built `validator/checks.js` (20 categories), `validator/scoring.js` (Book Health scoring), `validator/reportGenerator.js` (three report formats).
- **Found and fixed four false-positive bugs during verification, before trusting the first validation run**:
  1. A CSS "declaration syntax" heuristic with a 100% false-positive rate — removed.
  2. A figure/table numbering "gap" check that wrongly assumed every subsection has a numbered figure — removed (kept duplicate-detection, which was reliable).
  3. Component-overlap detection that didn't account for intentionally-layered `position: absolute`/floated elements — produced nonsense results (e.g. an "8868mm overlap") on a stray `<style>` tag being compared as if it were visible content. Fixed to exclude non-flow and non-visual elements.
  4. Cross-origin stylesheet access errors (the external Google Fonts sheet) miscategorized as a content CSS defect — fixed to only check the document's own stylesheets.
- **Found a scoring model flaw**: one repetitive, legitimate design pattern (52 tables using a heading instead of `<caption>`) was mathematically capable of zeroing an entire score dimension under flat per-instance penalties. Fixed with square-root-scaled diminishing returns per issue type.
- Real finding, not a check bug: fonts failing to load — became the basis for Phase 5.5.

## [0.4.0] — Phase 4 — Intelligent Repagination Engine

- Extended the architecture (per explicit request) with: Component Classification Engine, Page Quality Score, Component Movement Cost model, three-stage page budget, best-fit packing design.
- Built `optimizer/layoutOptimizer.js`: best-fit forward fill + pull-back rebalance, header/footer regeneration, DOM surgery, move logging.
- **Found and fixed two bugs during verification**:
  1. Packing math assumed a whitespace-reclaim benefit that was never actually applied to the CSS — produced small (3–9mm) real overflow on re-render. Fixed to pack against the real measured gap only.
  2. `getBoundingClientRect()` excludes an element's own CSS margin, undercounting real page height by ~6mm for the first/last component on a page. Folded into the packing safety margin, verified at 0mm overflow after the fix.
- Result: 254 → 327 pages (+28.7%, vs. ~402/+58% naive), Book Health average quality 63.1 → 93.1, overflowing pages 148 → 1 (a pre-existing full-bleed cover issue, correctly out of the engine's scope by design).
- Content integrity verified byte-for-byte identical (component counts, figure/table/activity counts, body text length) across all 11 chapters before/after.

## [0.3.0] — Phase 3 — Layout Analyzer

- Built the shared measurement engine (`optimizer/layoutAnalyzer.js`) and Component Classification Engine (`components/classification.js`).
- **Found and fixed two measurement bugs**:
  1. `.page`'s `min-height` floors total box height at ~297mm even for sparse pages — conflated with content-fill measurement, producing false overflow positives. Fixed by separating "total box height" (true overflow signal) from "content span" (fill-ratio signal).
  2. Full-bleed cover pages intentionally ignore the standard content-margin budget, but were being scored against it — false overflow positive on every chapter's cover. Fixed to detect and score `.full-bleed` pages against the full physical page instead.
- Verified overflow counts matched Phase 1's independent baseline exactly, per chapter, after fixes.

## [0.1.0] — Phase 1 — Analysis

- Diagnosed the root cause of page-count inflation: `.page { min-height; overflow: hidden; page-break-after: always; }` — `min-height` lets content overflow silently since `overflow: hidden` has nothing to clip.
- Measured (not estimated) the real scale of the problem: 254 authored pages → ~402 raw printed pages, 148/254 (58%) of pages overflowing, up to +281mm on a single page.
- Established the Intelligent Repagination strategy (rebalance before inserting new pages) as the approach going forward, in place of either naive shrink-to-fit or accepting the browser's uncontrolled breaks.

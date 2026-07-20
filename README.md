# book-builder

**Version 1.0.0** — a production-grade HTML → PDF publishing pipeline for pre-paginated textbook chapters. It measures real rendered layout in a headless browser, intelligently repaginates overflowing content while preserving appearance and educational order exactly, validates the result against 20 categories of production-readiness checks, and produces print-ready, font-embedded PDFs with bookmarks and metadata.

Built for and validated against an 11-chapter, 254-page Class 7 science textbook ("Space & Astronomy"). See `RELEASE_NOTES.md` for what v1.0.0 shipped, or `reports/release/release-certificate.md` for the signed-off production readiness determination for that specific book.

## Documentation

| Document | For |
|---|---|
| [`INSTALL.md`](INSTALL.md) | Getting the pipeline running |
| [`USER_GUIDE.md`](USER_GUIDE.md) | Running the pipeline, reading its output |
| [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md) | Working on the pipeline's code |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How and why it's built this way |
| [`docs/API.md`](docs/API.md) | Per-module reference (inputs/outputs/config/algorithm/errors) |
| [`PROJECT_TREE.md`](PROJECT_TREE.md) | Full directory layout |
| [`VERSION_MANIFEST.md`](VERSION_MANIFEST.md) | What's in this build, exactly |
| [`RELEASE_NOTES.md`](RELEASE_NOTES.md) | What changed, what it can do, what it can't yet |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |
| [`TODO.md`](TODO.md) | Planned v2 work (not implemented) |

## Why this exists

Chapters are authored as HTML with explicit `.page` divs (one div = one intended printed page). Because `.page` uses `min-height` rather than a hard `height`, a page whose content exceeds the printable area silently grows — and the browser's print engine then inserts extra, uncontrolled page breaks inside it. Left unfixed, this took the reference book from 254 authored pages to ~402 raw printed pages, with 58% of pages overflowing. See `reports/phase-reports/PHASE-1-ANALYSIS-REPORT.md` for the full original diagnosis.

## Strategy: Intelligent Repagination

Rather than shrinking components to force an artificial page count (which alters appearance) or accepting every browser-inserted break (which wastes space far beyond what's necessary), this pipeline:

1. Measures every component's real rendered height in a live browser.
2. Classifies each component (Atomic / Keep-Together / Flexible) and scores every page against a three-stage budget (Ideal / Warning / Maximum).
3. For content that doesn't fit, uses best-fit packing — trying multiple candidate break points, not just evicting the last component — to move *whole* components forward, never splitting one, never reordering content.
4. Pulls content backward to reclaim whitespace left by a move, so the cascade doesn't waste space as it propagates.
5. Only inserts a genuinely new page when no valid redistribution exists for the remaining excess.

Every move is logged (component id, source page, destination page, reason) for full auditability.

## Quick start

```bash
npm install
npx playwright install chromium   # if not already present
npm run build-book                # full pipeline: analyze -> optimize -> validate -> pdf -> report
```

See `INSTALL.md` for details and `USER_GUIDE.md` for running individual stages.

## Project structure

```
book-builder/
├── chapters/     source chapter HTML (never regenerated, never auto-modified except infrastructure — see ARCHITECTURE.md)
├── template/     reserved, unused in v1.0.0 (see template/README.md)
├── css/          self-hosted font assets + reference stylesheet
├── components/   Component Classification Engine
├── optimizer/    Layout Analyzer + Intelligent Repagination Engine + supporting models
├── validator/    Validation Engine (20 check categories) + scoring + report generation
├── pdf/          PDF Generator (Playwright + pdf-lib)
├── scripts/      CLI entry points + maintenance utilities
├── output/       generated PDFs (chapter-level + complete book)
├── reports/      every report this pipeline produces, organized by phase
├── docs/         module/API reference documentation
├── build/        optimized intermediate HTML (chapter.optimized.html)
├── config.js     single source of truth: page geometry, thresholds, classification rules
└── build.js      orchestrates the full pipeline (npm run build-book)
```

Full annotated tree: see `PROJECT_TREE.md`.

## Hard rules (never violated by any module)

- Never modify educational content or text.
- Never delete or resize activities, figures, tables, or assessments beyond documented safe/invisible optimizations.
- Never split: activity, figure, photo plate, timeline, scientist box, recap box, think box, table.
- Never reorder content — educational sequence is preserved exactly.
- Appearance must remain visually identical, verified by content-integrity checks (component counts, text length, figure/table/activity counts) after every transformation, not assumed.

## Status: v1.0.0, frozen

The publishing engine (`optimizer/`, `validator/`, `pdf/`, `config.js`, `components/`) is frozen as of this release. Changes require a reproducible defect report — see `DEVELOPER_GUIDE.md`.

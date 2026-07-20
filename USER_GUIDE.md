# USER_GUIDE.md

This guide is for running the pipeline and interpreting its output. For working on the pipeline's code, see `DEVELOPER_GUIDE.md`.

## Preparing your chapters

Place one HTML file per chapter in `chapters/`, named `chapter-NN.html` (two-digit, zero-padded). Requirements the pipeline assumes about each file (see `ARCHITECTURE.md` for why):

- Every printed page is an explicit `<div class="page">...</div>`, direct child of `<body>`.
- A cover or section-divider page uses `<div class="page full-bleed">` and is treated as a fixed anchor — the optimizer never touches its contents or moves it.
- Page chrome uses `<div class="page-header">` / `<div class="page-footer">`, each containing the running section title and page number respectively (see `docs/API.md` → Intelligent Repagination Engine for the exact structure the engine reads and regenerates).
- `@page { size: A4; margin: 0; }` and matching `.page` CSS padding define the print margins.

## Running the full pipeline

```bash
npm run build-book
```

Runs, in order: analyze → optimize → validate → pdf → report. Takes roughly 60–90 seconds for an 11-chapter, ~250-page book (measured on the reference book: ~19s analyze, ~55s optimize, ~20s validate, ~65s PDF generation).

Optional book title argument (used for PDF metadata):

```bash
npm run build-book -- "My Book Title"
```

## Running individual stages

```bash
npm run analyze     # measure every chapter, write reports/chapter-NN.analysis.json
npm run optimize    # repaginate every chapter, write build/chapter-NN.optimized.html
npm run validate    # run all 20 validation categories against build/, write reports/validation-report.*
npm run pdf          # generate output/chapter-NN.pdf + output/book-complete.pdf from build/
npm run report        # aggregate existing reports into reports/book-report.{json,md}
```

Each stage reads whatever the previous stage already produced on disk — you can re-run just one stage after manually inspecting or adjusting its input, without re-running the whole pipeline.

**Re-optimizing only specific chapters** (used in this project's own Phase 5.6 to fix a font-metric-driven regression without touching chapters that already passed):

```bash
node optimizer/layoutOptimizer.js chapters/chapter-03.html
node optimizer/layoutOptimizer.js chapters/chapter-07.html
```

## Reading the output

### `reports/validation-report.html`
Open in a browser. Top section shows the Book Health Report (five 0–100 scores + Overall Publisher Readiness) and the Release Checklist. Below that, every issue found, with severity, category, affected chapter/page, a suggested fix, and whether it's auto-fixable.

### `reports/validation-summary.md`
The same data in Markdown, convenient for pasting into an issue tracker or PR description.

### `reports/optimization/chapter-NN.optimization-report.json`
Per-chapter: original vs. optimized page count, every component move (id, source page, destination page, reason), and post-optimization quality scores.

### `output/book-complete.pdf`
The final deliverable — one PDF, all chapters merged, with chapter-level bookmarks, embedded fonts, and document metadata (title/author/subject).

## Understanding the Book Health scores

| Dimension | What it measures |
|---|---|
| Content Integrity | Missing captions, broken images/SVGs, duplicate IDs, broken links, numbering issues |
| Layout Integrity | Overflow, blank pages, component overlap, margin/A4 violations, page numbering |
| Typography | Whether declared fonts actually load (not just are declared) |
| Accessibility | Missing alt text, heading structure, link text quality |
| Print Readiness | `@page`/print-media CSS presence, font loading, overflow (shared with Layout Integrity) |

Overall Publisher Readiness is a weighted average (Content 30%, Layout 25%, Print 20%, Typography 15%, Accessibility 10%). Bands: ≥90 Publisher Ready, ≥75 Minor Fixes Needed, ≥50 Major Fixes Needed, <50 Not Ready.

Repeated instances of the *same* issue type are scored with diminishing returns (square-root scaling), so one systemic pattern (e.g. "every table uses a heading instead of `<caption>`") doesn't mathematically zero out a whole dimension the way 52 independent flat penalties would.

## Known accepted issues (reference book, v1.0.0)

These are documented, explicitly reviewed and approved characteristics of the reference book's release — not pipeline defects. If you're running this pipeline against a different book, your own known-issues list will differ; the pipeline surfaces these the same way (via the validation report), it's up to you what to accept.

1. A full-bleed cover page overflowing its physical page by design (the engine never resizes cover art).
2. Editorial omission of some figure/table captions.
3. Editorial omission of some image alt text.
4. A sub-millimeter (0.4mm) overflow on one page, below the validator's 1mm measurement-jitter tolerance but still enough to produce one extra physical PDF page when actually printed.

See `reports/release/release-certificate.md` for the full determination.

## Troubleshooting

**"Executable doesn't exist" on launch** — Playwright/Chromium version mismatch. See `INSTALL.md`.

**A chapter shows unexpectedly high overflow after editing its HTML** — re-run `npm run optimize` for that chapter; the engine re-measures from scratch every time, so it's always safe to re-run.

**Fonts show as "unloaded" in `document.fonts` but the PDF looks right** — this is normal. A declared `@font-face` only loads lazily when its specific weight is actually used on the page being checked; it doesn't indicate a problem. Font *embedding* in the actual PDF is what matters and is checked separately (via `pdffonts`) in the release audit.

# API / Module Documentation

Reference for every module in the (frozen) publishing engine. See `ARCHITECTURE.md` for how they fit together and `DEVELOPER_GUIDE.md` for the freeze policy.

---

## 1. Layout Analyzer
`optimizer/layoutAnalyzer.js`

### Purpose
Shared, read-only measurement engine. Renders a chapter in real headless Chromium with print media emulated, measures every page and every top-level component, classifies each component, scores each page, and tags each page's budget zone. Both the Intelligent Repagination Engine and the Validator consume this module's output (or its underlying measurement approach) so their numbers can never disagree.

### Inputs
- `filePath` (string) — path to a chapter HTML file.
- `options.browser` (optional) — a shared Playwright `Browser` instance (avoids relaunching per chapter in a batch).
- `options.outDir` (optional) — if provided, writes `<chapterName>.analysis.json` there.

### Outputs
`analyzeChapter(filePath, options)` returns:
```
{
  chapter, sourceFile, analyzedAt,
  pageBudget: { idealMaxMm, warningMaxMm, maximumMm, contentWidthMm },
  summary: { totalPages, overflowingPages, zones, averageQualityScore, totalOverflowMm, minimumExtraPagesLowerBound },
  pages: [{ pageIndex, pageType, totalHeightMm, contentUsedMm, zone, overflowMm, isOverflowing,
            footerCollision, qualityScore, qualityBand, qualityBreakdown, components: [...] }]
}
```

### Configuration
Reads `PAGE`, `PX_PER_MM` (not currently used directly — see note in `DEVELOPER_GUIDE.md`), `OVERFLOW_TOLERANCE_MM`, `PAGE_BUDGET`, `COMPONENT_CLASSIFICATION`, `SHRINKABLE` from `config.js`. No analyzer-specific configuration.

### Algorithm
1. Load the chapter file, emulate print media, wait for `document.fonts.ready`.
2. In-browser: tag every top-level `.page` child (excluding header/footer) with its classification (via `components/classification.js`).
3. In-browser: measure each page's total box height (`getBoundingClientRect()`) — the authoritative signal for true overflow, since `.page`'s `min-height` floors this value even for under-filled pages — and separately measure the actual content span (first child's top to last child's bottom), used for fill-ratio/zone scoring, since the floored total-height can't distinguish a well-filled page from a sparse one.
4. Full-bleed pages are scored against the full physical page (297mm), not the standard content-margin budget, since they intentionally ignore that system.
5. Compute Page Quality Score per page (delegates to `optimizer/qualityScore.js`).
6. Aggregate into a chapter summary, including a content-conservation lower bound on extra pages needed (`totalOverflowMm / contentHeightMm`, rounded up) — a lower bound, not a prediction of what the optimizer will actually produce.

### Error Handling
- Missing/unreadable file: Playwright's `page.goto` throws; propagated to the caller (CLI wrapper exits non-zero with the error).
- No `.page` elements found: returns an empty `pages` array and a summary with `totalPages: 0` rather than throwing — callers should check for this rather than assume a non-empty result.
- Browser lifecycle: if no shared browser is passed, one is launched and closed per call; if shared, the caller owns its lifecycle.

---

## 2. Intelligent Repagination Engine
`optimizer/layoutOptimizer.js`

### Purpose
Given a chapter's current pagination and real measured component heights, produces a new page assignment that eliminates overflow while minimizing disruption — never splitting a component, never reordering content, moving whole components only when required, preferring the highest-quality resulting page layout among candidate options (best-fit, not last-fit).

### Inputs
- `filePath` (string) — path to a chapter HTML file (source or already-optimized; the algorithm is a stateless full re-derivation from the flattened component list either way).
- `options.browser`, `options.buildDir`, `options.reportsDir` (all optional).

### Outputs
`optimizeChapter(filePath, options)` returns and (if `buildDir`/`reportsDir` given) writes:
- `build/<chapter>.optimized.html` — the repaginated chapter.
- `reports/optimization/<chapter>.optimization-report.json`:
```
{
  chapter, generatedAt, processingTimeMs,
  pages: { original, optimized, delta, newPagesInserted },
  whitespaceReclaim: { measured, reclaimableIfCssPassAdded, usedForPacking },
  componentsMoved, moveLog: [{ componentId, className, componentClass, sourcePage, destinationPage, reason }],
  oversizedComponentWarnings: [...],
  qualityAfter: { averageQualityScore, overflowingPages, zones }
}
```

### Configuration
`PAGE`, `PAGE_BUDGET`, `SHRINKABLE`, `BEST_FIT`, `REPAGINATION`, `COMPONENT_CLASSIFICATION` from `config.js`. Key tunables: `REPAGINATION.pullBackSafetyMarginMm` (3mm), an internal `MEASURED_OUTER_MARGIN_CORRECTION_MM` (6mm, empirically calibrated — see `DEVELOPER_GUIDE.md` limitations), and `BEST_FIT.candidateSearchWindowMm` / `moveCostNormalizationFactor`.

### Algorithm
1. **Prepare**: tag every component with a stable id, classification, and measured height; capture each page's header/footer text and full-bleed status. The first page (`.page.full-bleed`) is excluded entirely — a fixed anchor.
2. **Estimate the real inter-component gap** from the chapter's own current layout (median across pages with ≥2 components) — used as the packing model's spacing assumption, not an assumed constant.
3. **Best-fit forward fill**: greedily fill bins up to a safety-margined ceiling (`PAGE_BUDGET.maximumMm` minus the pull-back safety margin minus the measured outer-margin correction), then test evicting the trailing 1–3 components to see whether a smaller bin scores higher net of eviction cost — this is the "best-fit, not last-fit" step.
4. **Pull-back rebalance**: sweep left to right, pulling a following page's leading component(s) backward into any page with reclaimable slack (below the Ideal budget), respecting heading/body cohesion (never pull a heading without what follows it), up to 4 iterations or until stable.
5. **Assign final pages and build the move log**: any component whose final page differs from its original page is logged with source, destination, and reason (`cascade-forward-overflow` or `pull-back-rebalance`).
6. **Regenerate headers/footers**: each final page's running section-title header is copied from whichever original page contributed its *first* component (content isn't reordered, so this stays contextually correct); footer page numbers are assigned sequentially.
7. **DOM surgery**: components are `appendChild`-moved (not cloned) into freshly built `.page` divs in the live Playwright page, then serialized via `page.content()`.
8. **Re-measure** the result with the Layout Analyzer (same module, same code path) so the report's before/after numbers are directly comparable.

### Error Handling
- A single component taller than the Maximum budget on its own is placed alone on its own page and flagged in `oversizedWarnings` — the engine does not attempt to resize it (out of scope; would require a design/content decision).
- Content-integrity is not verified by the engine itself — callers should independently re-check component/text counts before/after (this project always did — see `DEVELOPER_GUIDE.md` testing approach).

---

## 3. Validator
`validator/validator.js`, `validator/checks.js`, `validator/scoring.js`, `validator/reportGenerator.js`

### Purpose
Strictly read-only pass covering 20 categories: HTML/CSS validity, broken images/SVGs, missing captions, figure/table/activity numbering, heading hierarchy, duplicate IDs, broken internal links, page numbering, header/footer consistency, margin violations, overflow/clipping, blank pages, component overlap, A4 dimensions, font loading, accessibility, and print-readiness. Produces a Book Health Report and Release Checklist.

### Inputs
- `inputPath` (string) — a single HTML file or a directory of them.
- `options.outDir`, `options.bookTitle` (optional).

### Outputs
`validateBook(inputPath, options)` returns, and (if `outDir` given) writes:
- `reports/validation-report.json` — full structured issue list + Book Health + Release Checklist.
- `reports/validation-report.html` — human-readable version.
- `reports/validation-summary.md` — Markdown version.

Every issue: `{ check, category, severity (Critical/Major/Minor), description, chapter, page, selector, suggestedFix, autoFixable }`.

Book Health: `{ contentIntegrityScore, layoutIntegrityScore, typographyScore, accessibilityScore, printReadinessScore, overallPublisherReadinessScore, band }` (0–100 each).

Release Checklist: `{ 'HTML Valid', 'CSS Valid', 'No Overflow', 'No Broken SVG', 'No Broken Images', 'No Duplicate IDs', 'Correct Numbering', 'Print Ready', 'Publisher Ready' }` (booleans).

### Configuration
`PAGE` (for margin/dimension checks) from `config.js`. Scoring weights (`SEVERITY_PENALTY`, `CATEGORY_TO_DIMENSION`, dimension weights) live in `validator/scoring.js`.

### Algorithm
1. For each chapter: load with print media emulated, wait for `document.fonts.ready`, run `browserRunAllChecks` (one batched `page.evaluate` covering all 20 categories — batched deliberately for speed, not 20 separate round-trips).
2. Aggregate all chapters' issues.
3. Score: group issues by `(category, check)`, apply severity-weighted penalty scaled by `√count` (diminishing returns for repeated instances of the same issue type — see `ARCHITECTURE.md`/`USER_GUIDE.md` for why), sum per dimension, compute the weighted overall score.
4. Build the Release Checklist from category-level pass/fail counts.
5. Render all three report formats from the same aggregated data (no format-specific re-computation).

### Error Handling
- A chapter that fails to load raises during `page.goto`; propagated (no partial/best-effort validation of a broken file).
- Checks are defensive around browser API edge cases (e.g. `getBBox()` inside try/catch, since it throws for some SVG states) — a failed individual check assertion degrades to "not flagged" for that one check rather than crashing the whole run.

---

## 4. PDF Generator
`pdf/pdfGenerator.js`

### Purpose
Renders each chapter to a standalone A4 PDF with embedded fonts, then merges all chapters into one complete book PDF with chapter-level bookmarks and document metadata.

### Inputs
- `generateChapterPdf(htmlFile, outputPath, options)` — `options.browser` optional.
- `generateBookPdf(chapterPdfPaths, outputPath, options)` — `options.bookTitle`, `options.author`, `options.chapterTitles` (array, one per chapter PDF, in order).

### Outputs
- `generateChapterPdf` → `{ htmlFile, outputPath, sizeBytes, generationTimeMs }`, writes the PDF file.
- `generateBookPdf` → `{ outputPath, totalPages, sizeBytes, chapterPageRanges }`, writes the merged PDF file.

### Configuration
`PAGE` from `config.js` (informational only — actual page sizing comes from the HTML's own `@page` CSS rule via `format: 'A4'` in `page.pdf()`).

### Algorithm
1. **Per chapter**: load with print media emulated, wait for `document.fonts.ready` (critical — printing before fonts resolve can rasterize/substitute text), call `page.pdf({ format: 'A4', printBackground: true, margin: 0 })` — zero PDF-level margin because the HTML's own `.page` CSS padding *is* the margin system.
2. **Merge**: for each chapter PDF, load it and `copyPages` into one accumulating `PDFDocument` (binary-level page copy — no re-rendering, so combining a 230MB+ book doesn't risk re-rendering that much HTML at once).
3. **Metadata**: set on the merged document via `pdf-lib` (`setTitle`, `setAuthor`, `setSubject`, `setCreator`, `setProducer`, creation/modification dates). Individual chapter PDFs only get an auto-populated Title (from the HTML's `<title>`, set by Chromium automatically) — Author/Subject are only set on the merged book.
4. **Bookmarks**: `pdf-lib` has no high-level outline API, so this constructs the PDF Outline dictionary tree directly (`context.obj`/`context.assign`, manual `Parent`/`Prev`/`Next`/`Count` wiring) — one flat, chapter-level entry per chapter, `Dest` pointing at each chapter's first page with a `/Fit` view.
5. Bookmark titles are sanitized before writing (`PDFString.of()` uses `PDFDocEncoding`, a Latin-1-like single-byte encoding that silently mangles characters like en-dashes and curly quotes into control-code garbage) — normalized to ASCII-safe equivalents first.

### Error Handling
- `generateChapterPdf` propagates any Playwright `page.goto`/`page.pdf` error to the caller.
- `generateBookPdf` propagates any `pdf-lib` load/copy error; a malformed source chapter PDF will fail the whole merge rather than silently skip.
- No validation of font-embedding success happens inside this module — verify separately with an external tool (`pdffonts`), as this project's own release process does (see `DEVELOPER_GUIDE.md` testing approach).

---

## 5. Report Generator
`validator/reportGenerator.js`

### Purpose
Pure rendering functions — takes already-aggregated validation data and produces the three report formats. No file I/O, no additional computation beyond formatting/summarizing for display.

### Inputs
`{ chapters, allIssues, bookHealth, releaseChecklist, meta }` — the same shape for all three functions.

### Outputs
- `buildJsonReport(...)` → the structured object written to `validation-report.json`.
- `buildMarkdownSummary(...)` → a Markdown string.
- `buildHtmlReport(...)` → a styled, self-contained HTML string (inline `<style>`, no external assets).

### Configuration
None — purely a function of its input.

### Algorithm
Straightforward templating: summarize issue counts by severity/category, render score cards, render the checklist, render a sortable-by-severity issue table (HTML), render a critical-issues-by-chapter section (Markdown, only if any Critical issues exist). All three formats derive from calling `summarize()`/`countBySeverity()` once and rendering three views of the same numbers — never recomputed per format.

### Error Handling
All string interpolation into HTML is passed through `escapeHtml()` to prevent a chapter name or issue description containing HTML-significant characters from breaking the report's markup.

---

## 6. Configuration System
`config.js`

### Purpose
Single source of truth for every tunable value the other five modules read — page geometry, component classification rules, quality-score weights, movement-cost weights, the three-stage page budget, and best-fit search parameters. No module hardcodes a threshold that isn't defined here.

### Inputs / Outputs
Not a function — a set of exported constants and one computed-property object (`PAGE_BUDGET`, whose `idealMaxMm`/`warningMaxMm`/`maximumMm`/`zoneOf()` derive from `PAGE`'s raw geometry rather than being independently specified, so they can never drift out of sync).

### Configuration (of itself)
| Export | Values | Derived from |
|---|---|---|
| `PAGE` | width/height/margins in mm | The reference book's actual CSS custom properties |
| `PAGE_BUDGET` | Ideal 224.1mm / Warning 249mm / Maximum 250mm | `PAGE.contentHeightMm` × 0.90 / 1.0 / +1mm tolerance |
| `COMPONENT_CLASSIFICATION` | selector → class/cost/bonding rules | The reference book's component vocabulary (figures, activities, boxes, etc.) |
| `QUALITY_WEIGHTS` | fillEfficiency 40, structuralIntegrity 30, breakQuality 15, overflowPenalty 15 | Chosen to prioritize "does it fit well" over "is the break aesthetically ideal" |
| `MOVEMENT_COST` | sizeMismatch/cascadeDistance/cohesion/thrash weights | Chosen to prefer cheap, local, non-repeated moves |
| `REPAGINATION` | maxCascadeDistance 6, pullBackSafetyMarginMm 3 | Bounds to prevent runaway cascades / re-creating overflow one page later |

### Algorithm
N/A (declarative).

### Error Handling
N/A — if a required constant is missing, every consuming module fails immediately and loudly at the point of use (undefined property access), rather than silently defaulting.

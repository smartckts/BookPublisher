# DEVELOPER_GUIDE.md

## Status: frozen

As of v1.0.0, the publishing engine — `config.js`, `components/`, `optimizer/`, `validator/`, `pdf/` — is frozen. Changes to these files require a reproducible defect report (steps to reproduce + expected vs. actual behavior), not a preference or a score-optimization request. This mirrors how the engine was actually developed: every change made after the initial build was in response to a specific, measured, reproduced problem (see `CHANGELOG.md`), never a speculative improvement.

`scripts/`, `build.js`, and documentation are not frozen — CLI wrappers, tooling, and docs can evolve without touching engine behavior.

## Code organization

| Path | Contains | Frozen? |
|---|---|---|
| `config.js` | All tunable constants — page geometry, classification rules, quality weights, movement costs, budget bands | Yes |
| `components/classification.js` | Component Classification Engine | Yes |
| `optimizer/layoutAnalyzer.js` | Layout Analyzer (measurement engine, shared by optimizer + validator) | Yes |
| `optimizer/layoutOptimizer.js` | Intelligent Repagination Engine | Yes |
| `optimizer/qualityScore.js` | Page Quality Score model | Yes |
| `optimizer/movementCost.js` | Component Movement Cost model | Yes |
| `validator/checks.js` | All 20 validation check categories | Yes |
| `validator/scoring.js` | Book Health scoring | Yes |
| `validator/reportGenerator.js` | Report rendering (HTML/MD/JSON) | Yes |
| `validator/validator.js` | Validator orchestrator | Yes |
| `pdf/pdfGenerator.js` | PDF generation + merge + bookmarks + metadata | Yes |
| `scripts/*.js`, `build.js` | Thin CLI wrappers around the above — no independent logic | No |
| `scripts/localizeFonts.js`, `scripts/build-font-face-block.js` | Maintenance utilities (see below) | No |

## Maintenance utilities

Two scripts exist outside the frozen engine for a specific recurring maintenance task — updating a chapter's fonts:

- **`scripts/localizeFonts.js`** — given a chapter HTML file still using a Google Fonts (or other external CDN) `<link>`, removes the CDN reference and replaces it with a self-contained, base64-embedded `@font-face` block. Runs a content-integrity check on itself (component/text-length comparison before/after) so it fails loudly rather than silently corrupting content.
- **`scripts/build-font-face-block.js`** — regenerates the base64 `@font-face` block from the `.woff2` files in `css/fonts/`. Run this if a font weight is ever added, removed, or replaced; it produces `build/_font-face-block.html`, which `localizeFonts.js` then injects into chapter `<head>`s.

Both were built in response to a real, measured defect (Google Fonts CDN failing to load in offline/restricted PDF-generation environments — see `CHANGELOG.md` v0.5.5) and are kept as reusable tooling rather than one-off scripts.

## Testing approach

This project has no separate automated test suite; verification is built into the development process itself and is worth understanding if you're changing anything:

1. **Every module is self-verifying against real output, not assumptions.** The Layout Analyzer's overflow detection was cross-checked against Phase 1's independent manual measurement before being trusted. The Intelligent Repagination Engine's every run is followed by a content-integrity check (component/figure/table/activity counts and body text length compared before/after — must be identical). The PDF Generator's font embedding was verified with `pdffonts` against real generated PDFs, not just by checking the CSS declares the right `@font-face` rules. Bookmarks were verified by reading them back with an independent library (`pypdf`), not by trusting `pdf-lib`'s write path.
2. **Read-only stages assert it.** The Validator and the Final Release Audit process never mutate their input — verified in practice by checksumming input files before and after a run.
3. **If you change a frozen module,** re-run this same pattern: measure before, measure after, diff the specific properties that should NOT have changed (content, component counts, text length) as well as the properties that SHOULD have changed (whatever you intended to fix). Don't trust that a change "looks right" — every real defect found during this project's development was found by comparing measured output against expectation, not by code review alone.

## Known limitations, deliberately not fixed in v1.0.0

See `TODO.md` for planned v2 work and `RELEASE_NOTES.md` → Limitations for the full list. Two worth knowing if you're extending this code:

- **The safety margin in `layoutOptimizer.js` (`SAFE_PACKING_MAX_MM`) is a fixed empirical correction** (accounts for gap-estimation variance and a measured ~6mm `getBoundingClientRect()` margin-exclusion gap), not a formally derived bound. It was calibrated against one design system's CSS. A different design system's component margins could require recalibrating the `MEASURED_OUTER_MARGIN_CORRECTION_MM` constant — if you see small (<10mm) residual overflow after optimization on a new book, check this first before assuming a logic bug.
- **Font metrics must be correct before the final optimization pass.** Pagination is measured against whatever fonts are actually loading at analysis time. If your fonts fail to load (network-restricted environment, broken `@font-face` paths), the optimizer will happily produce a validly-packed result — packed against the wrong metrics. Always confirm `document.fonts.size > 0` and real font families resolve in computed styles before treating an optimization pass as final. This exact sequence (fix fonts *after* the first optimization pass, discover 11 newly-surfaced overflow pages, re-run optimization) happened during this project's own development — see `CHANGELOG.md` v0.5.6.

## Adding a new validation check

1. Add the check logic inside `browserRunAllChecks` in `validator/checks.js`, following the existing pattern: call `addIssue(checkId, category, severity, description, { page, selector, suggestedFix, autoFixable })`.
2. If it's a new category, add it to `CATEGORY_TO_DIMENSION` in `validator/scoring.js` so it contributes to the right Book Health dimension(s).
3. Test it against real output before trusting it — every check in this codebase went through at least one round of "this flagged something that turned out to be a false positive" during development (see `CHANGELOG.md` v0.5 entries for four real examples: a CSS heuristic, a numbering-gap assumption, an absolute-positioning blind spot, and a cross-origin stylesheet miscategorization). Run it against a real chapter and manually verify a sample of what it flags before assuming it's correct.

## Adding a new component classification

Edit `COMPONENT_CLASSIFICATION` in `config.js` — add a selector/class/moveCostBase/bondsToNextSibling entry before the catch-all `*` rule (order matters: first match wins). No other file needs to change; both the optimizer and the analyzer read this array directly.

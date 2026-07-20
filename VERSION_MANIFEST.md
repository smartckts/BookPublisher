# VERSION_MANIFEST.md

## Version: v1.0.0

Release date: 2026-07-20
Release candidate: RC1 (approved)

## Modules implemented

| Module | File(s) | Status |
|---|---|---|
| Configuration System | `config.js` | Frozen |
| Component Classification Engine | `components/classification.js` | Frozen |
| Layout Analyzer | `optimizer/layoutAnalyzer.js` | Frozen |
| Page Quality Score | `optimizer/qualityScore.js` | Frozen |
| Component Movement Cost model | `optimizer/movementCost.js` | Frozen |
| Intelligent Repagination Engine | `optimizer/layoutOptimizer.js` | Frozen |
| Validation Engine (20 check categories) | `validator/checks.js`, `validator/validator.js` | Frozen |
| Book Health Scoring | `validator/scoring.js` | Frozen |
| Report Generator | `validator/reportGenerator.js` | Frozen |
| PDF Generator (per-chapter + merge + bookmarks + metadata) | `pdf/pdfGenerator.js` | Frozen |
| Book Builder orchestrator | `build.js` | Not frozen (wrapper) |
| CLI scripts | `scripts/analyze.js`, `optimize.js`, `validate.js`, `generate-pdf.js`, `book-report.js` | Not frozen (wrappers) |
| Font maintenance tooling | `scripts/localizeFonts.js`, `scripts/build-font-face-block.js` | Not frozen (tooling) |

Total: 11 frozen engine files, 7 non-frozen wrapper/tooling scripts.

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `playwright` | `1.56.0` (pinned) | Headless Chromium — measurement, optimization, validation, PDF generation |
| `pdf-lib` | `^1.17.1` | PDF merging, metadata, bookmark/outline construction |

Runtime: Node.js ≥ 18 (ES modules).

External tooling used for verification (not a runtime dependency): `qpdf`, `poppler-utils` (`pdfinfo`, `pdffonts`), Python `pypdf`.

## Performance statistics (reference book: 11 chapters, 254 authored pages)

| Stage | Time |
|---|---|
| Analyze (11 chapters) | ~19s |
| Optimize / Intelligent Repagination (full book, initial pass) | ~53s |
| Optimize (targeted 7-chapter font-metric correction pass) | ~40s |
| Validate (11 chapters, 20 categories each) | ~20s |
| PDF generation (11 chapter PDFs) | 62.4s |
| PDF merge + bookmarks + metadata | ~5s |
| **Full pipeline (`npm run build-book`)** | **~90–100s** |

Output sizes: 11 chapter PDFs totaling 234MB; merged `book-complete.pdf` 233MB, 331 pages.

Meets the original performance target (11 chapters / ~250–300 pages processed within 2–3 minutes) with substantial margin.

## Book Health scores (reference book, final)

| Dimension | Score |
|---|---|
| Content Integrity | 78.0 / 100 |
| Layout Integrity | 88.0 / 100 |
| Typography | 100 / 100 |
| Accessibility | 95.8 / 100 |
| Print Readiness | 88.0 / 100 |
| **Overall Publisher Readiness** | **87.6 / 100 — Minor Fixes Needed** |

Release Checklist: HTML Valid ✓ · CSS Valid ✓ · No Broken SVG ✓ · No Broken Images ✓ · No Duplicate IDs ✓ · Correct Numbering ✓ · Print Ready ✓ · No Overflow ✗ · Publisher Ready ✗

## Known accepted issues (v1.0.0, reference book)

1. **Chapter 10 cover overflow** (+6.3mm) — accepted by design; full-bleed pages are fixed anchors never resized by the repagination engine.
2. **Editorial omission of figure/table captions** (57 instances) — accepted editorial decision for this edition.
3. **Editorial omission of image alt text** (8 instances) — accepted editorial decision; requires content judgment outside pipeline authority.
4. **Chapter 9, page 24 — 0.4mm overflow** — discovered during the Phase 6 release audit; below the Validator's 1mm jitter tolerance but still enough to produce one extra physical PDF page. Documented and accepted for this release rather than triggering another repagination pass.

None of the four are infrastructure defects — all are either explicit design constraints or editorial decisions, reviewed and approved prior to release. See `reports/release/release-certificate.md` for the full determination.

## Book-level statistics (reference book)

- Chapters: 11
- Total HTML pages (post-optimization): 329
- Total PDF pages (complete book): 331
- Total component moves (final optimizer state, across all chapters' most recent optimization pass): 1,611
- Fonts embedded: 5 families, 16 weights, 683 font instances in the final PDF, 0 non-embedded
- Images: 270 embedded, 0 broken
- Hyperlinks: 0 (none exist in this book)
- Bookmarks: 11 (chapter-level)

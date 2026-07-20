# Release Report — RC1
**Space & Astronomy — Class 7** · Build 1.0.0-rc1 · 2026-07-20

This is a **read-only audit** of the release artifacts generated in Phase 6. No HTML, CSS, JavaScript, or PDF files were modified during this pass — every check below reads and verifies existing output.

---

## 1. Complete Book PDF (`output/book-complete.pdf`)

| Check | Result |
|---|---|
| Opens correctly | ✅ `qpdf --check`: no syntax or stream encoding errors |
| Page count | ✅ 331 pages |
| A4 dimensions | ✅ 595.92 × 842.88 pts on every page |
| Embedded fonts | ✅ 683 font instances, **0 non-embedded** |
| Bookmarks | ✅ 11 chapter-level bookmarks, verified with an independent tool (pypdf) — each points to the correct page (1, 33, 61, 88, 120, 149, 178, 207, 236, 268, 300) |
| Metadata | ✅ Title, Author, Subject, Creator, Producer, CreationDate all set |
| No broken pages | ✅ All 331 pages extract text and render without error |
| No blank pages | ✅ 0 found (checked every page for near-zero extractable text) |
| No clipping | ✅ Visually spot-checked across multiple chapters; cross-referenced against Phase 5.6's 0-overflow validation |
| No missing images | ✅ 270 image objects found, **0 broken/empty streams** (every one decoded successfully) |
| No corrupted text | ✅ 0 pages with control-character/replacement-character corruption |
| No duplicated pages | ✅ 0 found (content-hash comparison across all 331 pages) |

## 2. Individual Chapter PDFs

| Chapter | Pages | A4 | Fonts embedded | Non-embedded | First page correct | Last page correct |
|---|---|---|---|---|---|---|
| chapter-01 | 32 | ✅ | 73 instances | 0 | ✅ cover | ✅ QR/closing |
| chapter-02 | 28 | ✅ | 61 instances | 0 | ✅ cover | ✅ closing narrative |
| chapter-03 | 27 | ✅ | 59 instances | 0 | ✅ cover | ✅ closing narrative |
| chapter-04 | 32 | ✅ | 60 instances | 0 | ✅ cover | ✅ QR/closing |
| chapter-05 | 29 | ✅ | 63 instances | 0 | ✅ cover | ✅ closing narrative |
| chapter-06 | 29 | ✅ | 63 instances | 0 | ✅ cover | ✅ self-assessment |
| chapter-07 | 29 | ✅ | 59 instances | 0 | ✅ cover | ✅ closing narrative |
| chapter-08 | 29 | ✅ | 59 instances | 0 | ✅ cover | ✅ closing narrative |
| chapter-09 | 32 | ✅ | 60 instances | 0 | ✅ cover | ✅ QR/closing |
| chapter-10 | 32 | ✅ | 64 instances | 0 | ✅ cover | ✅ closing corner |
| chapter-11 | 32 | ✅ | 62 instances | 0 | ✅ cover | ✅ QR/closing |

Titles auto-populate correctly per chapter (from each HTML document's `<title>`), verified unique. Author/Subject metadata is set only on the merged book PDF by design — individual chapter PDFs are intermediate build artifacts.

**Page count reconciliation** — 9 of 11 chapters have identical HTML `.page`-div and PDF page counts. Two differ, both explained and accepted:
- **chapter-09**: 31 `.page` divs → 32 PDF pages. Root cause: page 24 measures 297.404mm — only 0.404mm over the 297mm physical limit. Phase 5's validator uses a 1mm jitter tolerance (appropriate for absorbing measurement noise between two non-overflowing renders), so this didn't trigger a Critical flag in Phase 5.6's validation — but real print rendering has zero tolerance, and this was caught here in the Phase 6 audit by comparing actual PDF page counts against expected HTML page counts. **This is a new finding, not previously reported, and is documented as Known Accepted Issue #4.**
- **chapter-10**: 31 `.page` divs → 32 PDF pages. Root cause: page 1 (the full-bleed cover) measures 303.28mm — the same +6.3mm overflow known and accepted since Phase 4. Expected, not new.

Both spillover pages were checked directly: chapter-10's contains real spilled cover text ("Space Telescopes · Space Probes · Astrobiology · Mars & Moon Missions"), chapter-09's contains a spilled Quick Recap box. Neither is blank, corrupted, or duplicated — content is intact, just continues onto an extra physical page.

## 3. HTML Source Integrity

- **Freeze verified**: no `chapters/*.html` or `build/*.optimized.html` file has a modification timestamp later than 07:22:06 UTC; every PDF generation step began at 07:38:50 UTC or later. Clean separation — nothing was touched during Phase 6.
- **Checksum manifest** captured and saved to `reports/RC1-html-checksums.txt` (MD5 for all 22 files — 11 source + 11 optimized) as the official RC1 baseline record for future comparison.

## 4. Build Integrity

- All 11 individual chapter PDFs present.
- Complete book PDF present.
- All 16 font asset files (`css/fonts/*.woff2`) present.
- All required validation reports present (`validation-report.{html,json}`, `validation-summary.md`).
- 0 broken image references anywhere in the merged PDF (270 checked).
- 0 non-embedded fonts anywhere (683 font instances checked).

## 5. Hyperlinks

This book contains **zero `<a>` tags anywhere in any of its 11 chapters** — confirmed by direct search of the source, not assumed. There is nothing to validate beyond confirming none are broken, which Phase 5's validator already did (0 broken internal links found).

## 6. Validation Score Summary (carried forward from Phase 5.6, unchanged — no further optimization performed per your instruction)

| Dimension | Score |
|---|---|
| Content Integrity | 78.0 / 100 |
| Layout Integrity | 88.0 / 100 |
| Typography | **100 / 100** |
| Accessibility | 95.8 / 100 |
| Print Readiness | 88.0 / 100 |
| **Overall Publisher Readiness** | **87.6 / 100 — Minor Fixes Needed** |

## 7. Known Accepted Issues (all previously reviewed and approved, except #4 which is newly documented here)

1. **Chapter 10 cover overflow** — accepted by design (Phase 4/5.6).
2. **Editorial omission of figure captions** (57 instances) — accepted editorial decision (Phase 5.5/5.6).
3. **Editorial omission of alt text** (8 instances) — accepted editorial decision (Phase 5.5/5.6).
4. **Chapter 9 page 24, 0.4mm overflow** — newly discovered in this Phase 6 audit via direct PDF page-count verification; documented and accepted for this release per your explicit instruction.

No changes were made to fix any of these — this audit is read-only, as instructed.

---

See `release-certificate.md` for the formal production-readiness determination.

# RELEASE_NOTES.md

## v1.0.0 — 2026-07-20

First production release. A complete HTML → PDF publishing pipeline, built and validated end-to-end against an 11-chapter, 254-page reference textbook.

### Major features

- **Layout Analyzer** — real-browser measurement of every page and component, not estimation. Distinguishes true overflow (total page box height) from fill-ratio scoring (content span), and correctly handles full-bleed pages that intentionally ignore the standard margin system.
- **Intelligent Repagination Engine** — component-level classification (Atomic/Keep-Together/Flexible), a three-stage page budget (Ideal/Warning/Maximum), a Movement Cost model, and best-fit packing (not naive last-component eviction). Never splits a component, never reorders content, moves whole components only when required, and only inserts a new page when no valid redistribution exists.
- **Validation Engine** — 20 categories of read-only checks (HTML/CSS validity, broken images/SVGs, captions, numbering, heading hierarchy, duplicate IDs, broken links, page numbering, header/footer consistency, margins, overflow, blank pages, component overlap, A4 dimensions, font loading, accessibility, print-readiness), rolled into a five-dimension Book Health Report plus an Overall Publisher Readiness score and Release Checklist.
- **PDF Generator** — per-chapter and merged complete-book PDF generation via Playwright, with embedded self-hosted fonts, chapter-level bookmarks (hand-built PDF outline tree, since `pdf-lib` has no high-level API for this), and full document metadata.
- **Font self-hosting** — replaced a Google Fonts CDN dependency (which fails silently in any offline/network-restricted PDF-generation environment) with base64-embedded local `@font-face` rules, verified to actually embed in generated PDFs via independent inspection (`pdffonts`), not just declared in CSS.

### Performance

Full pipeline (`npm run build-book`) on the reference book: **~90–100 seconds** for 11 chapters / ~330 pages — comfortably within the original 2–3 minute target.

### Improvements over the naive baseline

| Metric | Naive (uncontrolled browser pagination) | v1.0.0 pipeline |
|---|---|---|
| Total pages | ~402 (+58%) | 331 (+30%, and every extra page is either accepted-by-design or explicitly documented) |
| Overflowing pages | 148 of 254 (58%) | 1 of 331 (accepted, pre-existing cover overflow) + 1 documented sub-mm edge case |
| Average Page Quality Score | 63.1/100 | 93.1/100 (HTML-level, pre-PDF) |
| Font loading | 0 fonts loaded (silent CDN failure) | 683 font instances embedded, 0 non-embedded |

### Validation results (reference book, final)

Overall Publisher Readiness: **87.6/100** ("Minor Fixes Needed"). All infrastructure/technical checklist items pass (HTML/CSS validity, no broken images/SVGs, no duplicate IDs, correct numbering, print-ready). The two unmet items (No Overflow, Publisher Ready) trace entirely to four explicitly reviewed and accepted known issues — see below — none of which are pipeline defects.

### Known limitations (v1.0.0)

- **Full-bleed cover/divider pages cannot be repaginated.** If one overflows its physical page, that's a content/design sizing problem the engine correctly refuses to touch (would require resizing cover art or trimming cover text, both outside its authority). See `TODO.md`.
- **Font metrics must be correct and loaded before the final optimization pass is trusted.** Pagination is measured against whichever fonts are actually rendering at analysis time; if they later change (e.g. a broken font fix is applied after optimization), previously-safe pages can develop small (sub-page-budget) overflow and need re-optimization. The pipeline doesn't currently detect this automatically — see `TODO.md`.
- **The Validator's overflow tolerance (1mm) is appropriate for absorbing measurement jitter, not for guaranteeing zero print overflow.** A page within that tolerance can still produce a genuine extra physical page when actually printed (found once during this project's own release audit, on a 0.4mm case). Always verify final PDF page counts against expected HTML page counts, not just the HTML-level validation result.
- **Components are currently treated as fully atomic**, including plain paragraphs — more conservative than necessary. A future version could allow safe mid-run breaks (between paragraphs, between list items) for tighter packing. See `TODO.md`.
- **No automated test suite** — verification is built into the development process (measure-before/measure-after on every change) rather than a separate CI-run test file. See `DEVELOPER_GUIDE.md`.
- **Bookmarks are chapter-level only** — no section-level or figure/table-level navigation entries.
- **No accessibility remediation** — the pipeline reports missing alt text and caption gaps but does not generate placeholder content for them (a deliberate choice — inaccurate auto-generated alt text is worse than a flagged gap).

### Editorial/content decisions accepted for this release (not pipeline defects)

1. Chapter 10 cover page overflow — accepted by design.
2. 57 missing figure/table captions — editorial decision.
3. 8 missing image alt-text instances — editorial decision.
4. Chapter 9 page 24's 0.4mm sub-tolerance overflow — documented, accepted for this release.

See `reports/release/release-certificate.md` for the full, signed-off determination.

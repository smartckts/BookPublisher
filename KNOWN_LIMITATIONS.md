# KNOWN_LIMITATIONS.md

## Current Limitations

- **No automated fix for `PASS_WITH_MANUAL_REVIEW` pages.** This is a deliberate design choice, not a missing feature -- see `ARCHITECTURE.md`'s design principles. A human must resolve the underlying content/layout issue.
- **One chapter per invocation.** Both `build.js` and `pdf-generator.js` operate on a single HTML file at a time; multi-chapter books require one invocation per chapter (see `USER_GUIDE.md`'s Common Workflows section for a batching pattern).
- **KI-001**: a reading-order edge case observed on a synthetic 300-page book with extensive overflow, not reproduced on any real content tested during development. Caught correctly by Print Validator (never silently corrupts output). Tracked in `docs/KNOWN_ISSUES.md`, not yet root-caused. See that document for exact reproduction conditions.

## Performance Limits

All figures below are real measurements at 300-page scale (`docs/BENCHMARKS.md`), not theoretical ceilings -- behavior beyond this scale has not been tested.

- Full pipeline (Layout Analyzer through PDF Generator), 300-page book: ~6-7 seconds, ~140MB peak RSS.
- No module in this pipeline has been tested against books substantially larger than 300-320 pages. Memory usage is dominated by Chromium's own process overhead, not by any module's internal data structures, so scaling well beyond this size has not been verified and should not be assumed.
- Repagination Engine's cascade logic is capped at a maximum depth (10, by default) before falling back to requesting a new page rather than continuing to search for a resolution -- an intentional bound, not an oversight, but it means an extremely dense, heavily-overflowing book could produce more `INSERT_PAGE`/`MANUAL_REVIEW` outcomes than a less-constrained algorithm might.

## Browser Dependencies

- **Playwright/Chromium is a hard dependency for every module except Overflow Detector and Repagination Engine** (both pure JavaScript, no DOM access at all). Layout Analyzer, HTML Optimizer, Print Validator, and PDF Generator all require a working Chromium installation (`npx playwright install chromium`).
- **No fallback rendering engine exists or is planned** -- this is an explicit architectural decision (`docs/PDF_GENERATOR_DESIGN.md` section 2), not an oversight. Introducing a second rendering engine anywhere in this pipeline would reopen the WYSIWYG-consistency risk the whole architecture is built to avoid.
- **`local()` CSS font references have been found not to reliably resolve** inside Playwright's sandboxed Chromium, even when the referenced font is confirmed present at the OS level (found directly during PDF Generator's own test development). Self-hosted, embedded fonts (base64 data URIs) are the only convention verified to work reliably in this environment.
- **Network-dependent resources (external font/image URLs) are not reliably supported.** This pipeline's own development sandbox blocked an external font CDN request during earlier testing -- a real, observed failure mode, not a hypothetical one. See `USER_GUIDE.md`'s Input HTML Requirements.

## Rendering Assumptions

- **Page size is derived from the HTML's own CSS**, not a fixed physical format. There is no project-wide "A4" or similar constant -- every module measures whatever `width`/`height` a chapter's `.page` elements actually declare. A chapter using inconsistent page sizes across its own pages has not been tested and is not a supported convention (the real sample chapter, and every test fixture in this project, uses one consistent size throughout).
- **One `.page`-matching element per printed page**, direct children of `.page`'s expected structure. Deeply nested or unconventional page-container structures have not been tested.
- **RGB color output only.** No CMYK color separation, no ICC profile embedding -- standard for digital/print-on-demand distribution, insufficient for traditional offset/prepress workflows requiring color-managed, separated output.
- **No crop marks, no bleed.** Both are print-production features entirely absent from browser-based PDF export; neither is implemented, and neither is planned for the near term (see `ROADMAP.md`).
- **Tables, callout boxes, and images are assumed to fit within a single page.** Repagination Engine's never-split guarantee means these are never fragmented -- but an element genuinely taller than any page's content height cannot be resolved automatically and is flagged `MANUAL_REVIEW` rather than split.

## Items Intentionally Deferred to Future Versions

The following were identified during development, evaluated, and deliberately not built into v1.0 -- see `ROADMAP.md` for planned timing, if any:

- CMYK color-profile conversion (a post-processing step, not a v1 rendering-engine feature)
- Crop marks and bleed (a pdf-lib-based post-processing step is the identified extension point, not yet built)
- A "pull-back" rebalancing pass in Repagination Engine to reduce new-page insertions on heavily-overflowing books (explicitly scoped out during Repagination Engine's own design phase to keep v1's risk surface small)
- Explicit inter-element gap capture in Layout Analyzer's report (currently inferred from position deltas by downstream modules; a documented, working approach, but not as precise as capturing it directly at measurement time)
- Root cause and fix for KI-001

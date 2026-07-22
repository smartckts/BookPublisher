# ROADMAP.md

Ideas and priorities noted during development. Nothing here is a committed timeline -- see `docs/KNOWN_LIMITATIONS.md` for the current, factual scope boundary these items address.

## Planned Improvements for v1.1

Candidates for the next release, roughly in priority order:

1. **Root-cause and fix KI-001** (the large-book reading-order edge case documented in `docs/KNOWN_ISSUES.md`). This is the highest-priority open item -- it's the one known gap in an otherwise-complete correctness story, and the investigation process for it is already scoped out (`docs/KNOWN_ISSUES.md`'s "Recommended future investigation" section).
2. **Multi-chapter batch processing** -- a single command that runs the pipeline across every chapter in a directory, rather than requiring one invocation per chapter. Currently a documented workaround exists (`docs/USER_GUIDE.md`'s Common Workflows); a first-class command would remove the need for it.
3. **A `--dry-run` mode for `pdf-generator.js`** that reports what it would do (including reading and summarizing the validation report's gate decision) without actually rendering -- useful for CI pipelines that want to check readiness without generating a full PDF every time.

## Long-Term Vision for v2.0+

Larger, more speculative ideas that would likely require new design documents and possibly new modules, not incremental additions to existing frozen ones:

- **CMYK color-profile conversion** as an optional post-processing stage -- likely its own small module (e.g. a Ghostscript-based converter) rather than a change to PDF Generator itself, keeping the "each module does one thing" principle intact.
- **Crop marks and bleed support**, via a pdf-lib-based post-processing step operating on PDF Generator's already-rendered output -- identified as the correct extension point during PDF Generator's own design phase (`docs/PDF_GENERATOR_DESIGN.md`), not yet built.
- **A "pull-back" rebalancing pass** in Repagination Engine, to reduce the number of new-page insertions needed for heavily-overflowing books -- explicitly deferred during that module's original design to keep v1's risk surface small; would need its own design document and careful interaction with the never-split guarantee before being built.
- **Explicit inter-element gap capture** in Layout Analyzer's report, rather than downstream modules inferring gaps from position deltas -- a precision improvement, not a correctness fix (the current approach is verified working, just less direct than it could be).
- **A whole-book (not per-chapter) PDF assembly step**, combining multiple already-generated chapter PDFs into one final book-length file with consistent page numbering across chapter boundaries -- would likely use pdf-lib for the merge step, keeping PDF Generator itself focused on single-chapter rendering.

## Features Intentionally Excluded From v1.0

Evaluated and explicitly not built, not simply unconsidered:

- **A second rendering engine** (PrinceXML, WeasyPrint, wkhtmltopdf, or any alternative to Playwright/Chromium) -- evaluated in detail during PDF Generator's design phase (`docs/PDF_GENERATOR_DESIGN.md` section 2) and rejected specifically because it would reopen a WYSIWYG-consistency risk this architecture is built around closing. This exclusion is architectural, not a placeholder for "not yet gotten to."
- **Automatic resolution of `PASS_WITH_MANUAL_REVIEW` pages** -- a deliberate policy decision (see `docs/ARCHITECTURE.md`'s design principles), not an unbuilt feature. Any future automatic-fix capability would need to preserve the same structural guarantees Print Validator currently checks for, which is a nontrivial design problem in its own right, not a quick addition.
- **Support for HTML documents without a consistent page-size convention** -- every module assumes one page size per chapter; supporting per-page size variation was never scoped into any module's design and would touch Layout Analyzer, Repagination Engine, and PDF Generator simultaneously.

# ARCHITECTURE.md

## High-Level Architecture

BookPublisher is seven independently-frozen modules, each with exactly one responsibility, chained together by two orchestrators:

```
Input HTML
    |
    v
Layout Analyzer v2        measures every page/element, detects overflow amount
    |
    v
Overflow Detector v1      identifies which specific element(s) cause each overflow
    |
    v
Repagination Engine v1    plans safe moves -- never splits protected content
    |
    v
HTML Optimizer v1         applies the plan, re-verifies, repeats up to 5 passes
    |
    v
Print Validator v1        independently certifies reading order & structure intact
    |
    v
   PASS / PASS_WITH_MANUAL_REVIEW / FAIL
    |
    v               (FAIL stops here -- no PDF generated)
PDF Generator v1          renders the certified HTML to a print-ready PDF
    |
    v
book.pdf
```

Layout Analyzer through Print Validator are orchestrated as one command by Build Pipeline v1 (`build.js`). PDF Generator v1 (`pdf-generator.js`) is a deliberately separate final command, gated strictly on Print Validator's own certified status rather than folded into the same invocation.

## Module Responsibilities

| Module | Consumes | Produces | Never does |
|---|---|---|---|
| Layout Analyzer v2 | Chapter HTML | `layout-report.json` -- every page and recognized element's real, rendered geometry | Never decides what to *do* about overflow, only measures it |
| Overflow Detector v1 | `layout-report.json` | `overflow-report.json` -- which pages overflow, near-overflow, and their likely cause element | Never re-measures the DOM; never opens a browser |
| Repagination Engine v1 | `layout-report.json` + `overflow-report.json` | `repagination-plan.json` -- which whole blocks move where | Never touches HTML; never re-detects overflow |
| HTML Optimizer v1 | Original HTML + a plan | `optimized-chapter.html` + `optimization-report.json` | Never invents a plan of its own; only executes and re-verifies |
| Print Validator v1 | Optimized HTML (+ original, for comparison) | `print-validation-report.json` -- `PASS`/`PASS_WITH_MANUAL_REVIEW`/`FAIL` | Never trusts HTML Optimizer's claim of success -- re-derives everything from scratch |
| Build Pipeline v1 | Original HTML | All five reports above + `pipeline-report.json` | Never duplicates any module's logic -- pure sequencing |
| PDF Generator v1 | Optimized HTML + `print-validation-report.json` | `book.pdf` + `pdf-generation-report.json` | Never analyzes, detects, repaginates, optimizes, or validates -- trusts Print Validator's verdict completely |

## Data Flow

```
chapter.html
    |  analyzeChapterLayout()
    v
layout-report.json
    |  detectOverflow()
    v
overflow-report.json
    |  repaginate() + assemblePlan() + validatePlan()
    v
repagination-plan.json
    |  optimizeWithVerification()   (loops internally: re-analyze -> re-detect -> re-plan, up to 5x)
    v
optimized-chapter.html  +  optimization-report.json
    |  validateForPrint()
    v
print-validation-report.json
    |  generatePdf()   (gated on the status above)
    v
book.pdf  +  pdf-generation-report.json
```

Every arrow is a direct function call into the next module's own exported entry point -- never a re-implementation of what came before it. See `DEVELOPER_GUIDE.md`'s Data Flow section for the exact field-level shape of each report.

## Design Principles

1. **Each module trusts the ones before it, and never re-derives their work.** This is the single rule every other principle below follows from. Overflow Detector never re-measures layout. Repagination Engine never re-detects overflow. HTML Optimizer never re-plans. Print Validator is the one deliberate exception to "trust the previous module" -- it independently re-derives reading order and structure from scratch specifically because it exists to catch the case where an earlier stage's own self-reported success can't be fully trusted.

2. **Document structure and reading order always take priority over overflow elimination.** Established as a direct consequence of a real, significant defect found mid-project (see `docs/WRAPPER_CONTAINER_BUG_ANALYSIS.md`): a paragraph nested inside an untracked HTML wrapper could be incorrectly detached from that wrapper during repagination. The fix didn't just patch that one case -- it became the project's permanent policy. Where automatic resolution isn't safely possible, the pipeline reports `PASS_WITH_MANUAL_REVIEW` rather than silently trading correctness for the appearance of success.

3. **Reuse by import, not by convention.** When a later module needs logic an earlier module already implements correctly (e.g. Repagination Engine's need for geometric containment, which Overflow Detector's `contains`/`topLevelElements` already provide), it imports that function directly. This is enforced structurally, not just as a coding guideline -- see `DEVELOPER_GUIDE.md`'s Coding Standards.

4. **The same rendering engine, end to end.** Every module that touches a browser uses Playwright/Chromium -- never a second rendering engine. This was a deliberate, explicit decision at PDF Generator's design stage (see `docs/PDF_GENERATOR_DESIGN.md` section 2): using a different engine for final PDF output would risk subtle rendering differences from what was already measured and validated, reopening exactly the kind of WYSIWYG trust gap this architecture exists to close.

5. **Defense in depth, not single points of failure.** The wrapper-container fix added both a root-cause correction (Repagination Engine's movability rule) and an independent, structurally-unrelated safety check (HTML Optimizer verifies a node's real DOM parent immediately before detaching it) -- proven, by test, to catch an unsafe move even when the upstream fix is bypassed entirely.

6. **Never silently ignore a failure.** A stage that throws stops the pipeline immediately, marks every remaining stage `SKIPPED`, and still produces a complete report describing exactly what happened. Genuine fault-injection testing (`tests/buildPipeline.moduleFailure.test.js`) proves this directly, not just by code inspection.

## Why Each Module Exists

- **Layout Analyzer v2** exists because every downstream decision needs a ground truth of real, rendered geometry -- not an estimate. It's the only module with a legitimate reason to be the "source of truth" for measurement.
- **Overflow Detector v1** exists to separate *interpreting* a measurement from *taking* the measurement -- a page being over budget and knowing *why* are different concerns, and keeping them in separate, independently-testable modules is what let Repagination Engine be built and changed without ever touching measurement logic.
- **Repagination Engine v1** exists to separate *deciding what should move* from *actually moving it* -- the riskiest, most failure-prone logic in the whole pipeline (as the wrapper-container defect proved) benefits from being pure, deterministic, and testable with plain JSON fixtures, with zero DOM access to introduce non-determinism.
- **HTML Optimizer v1** exists because something has to be the one module allowed to mutate HTML, and isolating that capability to a single, narrow, heavily-tested module means every other module can be reasoned about as read-only.
- **Print Validator v1** exists because "the plan executed without throwing" is not the same claim as "the result is actually correct" -- this module is the project's answer to not taking that gap on faith.
- **Build Pipeline v1** exists so a user never has to know or care that five separate modules exist -- one command, one report, one honest status.
- **PDF Generator v1** exists as a deliberately narrow, final step -- kept separate from Build Pipeline specifically so "produce a validated HTML result" and "render that result to PDF" remain two distinct, independently-gateable operations, not one entangled one.

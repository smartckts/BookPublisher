# PROJECT_STRUCTURE.md

## Top-Level Folders

| Folder | Purpose |
|---|---|
| `src/` | All implementation code, one subdirectory per module |
| `tests/` | The complete test suite (187 tests across 25 files as of v1.0.0), run via `npm test` |
| `docs/` | Every guide, design document, changelog, and performance report -- both the top-level release guides and the complete per-module history preserved since the project began |
| `build/` | Generated output of a `build.js` run -- not tracked in version control (see `.gitignore`); recreated fresh by every invocation |
| `examples/` | A verified-working reference chapter (`sample-chapter.html`) demonstrating the HTML conventions BookPublisher expects |
| `scripts/` | Reserved for future maintenance/utility scripts -- empty as of v1.0.0, intentionally, per the release-preparation rule against introducing speculative functionality |
| `assets/` | Reserved for static assets (logo, branding) if ever needed -- empty as of v1.0.0, since every diagram in this project's documentation is a plain-text diagram embedded directly in its Markdown file |
| `chapters/` | The real sample chapter (`chapter-04.html`) this entire project was built and verified against -- used directly by 14+ test files; not to be moved or renamed without updating every test that references it |
| `reports/` and `output/` | Shared, development-time working directories used across this project's own history for interactive testing and manual verification -- distinct from the per-invocation `build/` directory a real `build.js` run creates |
| `node_modules/` | npm dependencies (Playwright), installed via `npm install`, not tracked in version control |

## Important Top-Level Files

| File | Purpose |
|---|---|
| `package.json` | Project metadata, dependencies (`playwright`), npm scripts, and the canonical version number |
| `package-lock.json` | Locked dependency versions |
| `build.js` | CLI entry point for the Build Pipeline (`node build.js chapter.html`) |
| `pdf-generator.js` | CLI entry point for PDF Generator (`node pdf-generator.js --build-dir build`) |
| `README.md` | Project overview, quick start, and the primary entry point for anyone new to the project |
| `LICENSE` | MIT license |
| `CHANGELOG.md` | Project-level changelog, newest entry first, historical entries preserved verbatim |
| `.gitignore` | Excludes `node_modules/`, generated `build/` output, and other non-source artifacts |

## `src/` Subdirectories

| Directory | Module |
|---|---|
| `src/analyzer/` | Layout Analyzer v2 |
| `src/config.js` | Shared configuration constants (page selector, element type priority list, risk thresholds) used across multiple modules |
| `src/optimizer/` | Overflow Detector v1 |
| `src/repagination/` | Repagination Engine v1 |
| `src/htmlOptimizer/` | HTML Optimizer v1 |
| `src/printValidator/` | Print Validator v1 |
| `src/buildPipeline/` | Build Pipeline v1's internal orchestration logic (the `build.js` CLI at the project root wraps this) |
| `src/pdfGenerator/` | PDF Generator v1 |

Each module directory follows the same internal pattern: a handful of small, single-responsibility files (typically a "checks" or "logic" file, a "writer" file for report/console output, and an orchestrating `index.js`), never one large file per module. See `DEVELOPER_GUIDE.md` for each module's specific file breakdown.

## Generated Artifacts

Everything under `build/` is produced fresh by running `build.js` and then `pdf-generator.js` -- none of it is source-controlled, and none of it should be hand-edited (a future run will simply overwrite it).

```
build/
├── reports/
│   ├── layout-report.json              (Layout Analyzer's measurement)
│   ├── overflow-report.json            (Overflow Detector's findings)
│   ├── repagination-plan.json          (Repagination Engine's plan)
│   ├── optimization-report.json        (HTML Optimizer's pass-by-pass result)
│   ├── print-validation-report.json    (Print Validator's certification)
│   ├── pipeline-report.json            (Build Pipeline's overall summary)
│   └── pdf-generation-report.json      (PDF Generator's result)
├── output/
│   ├── optimized-chapter.html          (HTML Optimizer's output, the input to Print Validator and PDF Generator)
│   └── book.pdf                        (the final deliverable)
└── logs/
    └── pdf-generator.log                (plain-text log of PDF Generator's console output)
```

Every file above is plain, parseable JSON (except the two files explicitly named `.html`/`.pdf`/`.log`), documented field-by-field in `docs/DEVELOPER_GUIDE.md` (schema overview) and in each module's own report-specific document (`docs/PIPELINE_REPORT.md`, `docs/PRINT_VALIDATION_REPORT.md`, `docs/PDF_GENERATION_REPORT.md`, and others in `docs/`).

## `docs/` Contents

`docs/` holds two kinds of documents, both intentionally preserved together:

1. **Top-level release guides** (`INSTALL.md`, `USER_GUIDE.md`, `DEVELOPER_GUIDE.md`, `CLI_REFERENCE.md`, `API_REFERENCE.md`, `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `MAINTENANCE_GUIDE.md`, `KNOWN_LIMITATIONS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `ROADMAP.md`, and the release-specific `RELEASE_NOTES_v1.0.md` / `BENCHMARKS.md` / `VERSION_1.0_RELEASE.md` / `FINAL_RELEASE_CHECKLIST.md`) -- the current, authoritative reference material.
2. **Per-module historical record** -- every module's own design document (`*_DESIGN.md`), changelog (`CHANGELOG_*.md`), and performance report (`PERFORMANCE_REPORT_*.md`), plus the complete wrapper-container defect investigation (`WRAPPER_CONTAINER_BUG_ANALYSIS.md`, `WRAPPER_CONTAINER_FIX.md`, and related reports) and RC1's own `RELEASE_CHECKLIST.md`. These are never edited retroactively -- they're a record of what was true and decided at each point in the project's history, referenced by the current guides rather than duplicated into them.

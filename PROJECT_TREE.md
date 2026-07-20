# PROJECT_TREE.md

Generated 2026-07-20 for v1.0.0. Large, repetitive directories are summarized with counts rather than listed file-by-file.

```
book-builder/
│
├── README.md                    Project overview, quick start
├── INSTALL.md                   Setup instructions
├── USER_GUIDE.md                Running the pipeline, reading output
├── DEVELOPER_GUIDE.md           Working on the code, freeze policy
├── ARCHITECTURE.md              Design rationale, data flow
├── PROJECT_TREE.md              This file
├── VERSION_MANIFEST.md          What's in this build
├── RELEASE_NOTES.md             v1.0.0 feature/limitation summary
├── CHANGELOG.md                 Version history
├── TODO.md                      Planned v2 work (not implemented)
│
├── package.json                 Dependencies: playwright 1.56.0, pdf-lib ^1.17.1
├── package-lock.json
├── config.js                    [FROZEN] Single source of truth: geometry, classification, scoring, budget
├── build.js                     [wrapper] npm run build-book — full pipeline orchestrator
│
├── chapters/                    Source chapter HTML (11 files, chapter-01.html .. chapter-11.html)
│   └── chapter-01-reference.pdf   Original user-supplied reference PDF (sample/comparison material)
│
├── template/                    Reserved, unused in v1.0.0 (see template/README.md)
│   └── README.md
│
├── css/
│   ├── local-fonts.css          Reference copy of the @font-face rules (non-inlined, for readability)
│   └── fonts/                   16 self-hosted .woff2 files (Poppins/Playfair Display/Nunito/Roboto/Inter)
│       └── LICENSES/              OFL/Apache license text per family
│
├── components/
│   └── classification.js        [FROZEN] Component Classification Engine
│
├── optimizer/
│   ├── layoutAnalyzer.js        [FROZEN] Layout Analyzer (shared measurement engine)
│   ├── layoutOptimizer.js       [FROZEN] Intelligent Repagination Engine
│   ├── qualityScore.js          [FROZEN] Page Quality Score model
│   └── movementCost.js          [FROZEN] Component Movement Cost model
│
├── validator/
│   ├── validator.js             [FROZEN] Orchestrator
│   ├── checks.js                [FROZEN] All 20 validation check categories
│   ├── scoring.js               [FROZEN] Book Health scoring
│   └── reportGenerator.js       [FROZEN] Report rendering (HTML/MD/JSON)
│
├── pdf/
│   └── pdfGenerator.js          [FROZEN] PDF generation, merge, bookmarks, metadata
│
├── docs/
│   └── API.md                   Per-module reference (purpose/inputs/outputs/config/algorithm/errors)
│
├── scripts/                     [wrappers + tooling, not frozen]
│   ├── analyze.js                 npm run analyze
│   ├── optimize.js                npm run optimize
│   ├── validate.js                npm run validate
│   ├── generate-pdf.js            npm run pdf
│   ├── book-report.js             npm run report (Module 8 statistics rollup)
│   ├── localizeFonts.js           Maintenance: strip external font CDN, embed local fonts
│   └── build-font-face-block.js   Maintenance: regenerate the base64 @font-face block from css/fonts/*.woff2
│
├── build/                       Optimized intermediate HTML — 11 files (chapter-NN.optimized.html)
│
├── output/                      Generated PDFs
│   ├── chapter-01.pdf .. chapter-11.pdf     11 individual chapter PDFs
│   └── book-complete.pdf                     Complete merged book (331 pages, ~233MB)
│
└── reports/                     Every report this pipeline produces
    ├── book-summary.json                     Phase 1 baseline overflow measurement
    ├── book-wide-optimization-summary.json   Phase 4 book-wide optimization summary
    ├── book-report.{json,md}                 Module 8 statistics rollup (npm run report)
    ├── validation-report.{html,json}         Current validation state
    ├── validation-summary.md
    │
    ├── analysis/                             Per-chapter Layout Analyzer output — 22 files
    │   └── chapter-NN.analysis.json            (original + .optimized.analysis.json per chapter)
    │
    ├── optimization/                         Per-chapter Intelligent Repagination reports — 11 files
    │   └── chapter-NN.optimization-report.json
    │
    ├── phase-reports/                        Historical development-phase reports (this project's own build log)
    │   ├── PHASE-1-ANALYSIS-REPORT.md
    │   ├── PHASE-4-RESULTS.md
    │   ├── PHASE-5.5-RESULTS.md
    │   └── PHASE-5.6-RESULTS.md
    │
    └── release/                              RC1 release artifacts
        ├── release-report.{html,md}
        ├── release-summary.json
        ├── release-certificate.md
        └── RC1-html-checksums.txt              MD5 manifest, source-freeze baseline
```

## Counts (v1.0.0 reference book)

| Item | Count |
|---|---|
| Source chapters | 11 |
| Optimized (build) chapters | 11 |
| Individual chapter PDFs | 11 |
| Font files (`.woff2`) | 16 |
| Per-chapter analysis reports | 22 |
| Per-chapter optimization reports | 11 |
| Frozen engine module files | 11 |
| CLI wrapper / tooling scripts | 7 |

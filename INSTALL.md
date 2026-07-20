# INSTALL.md

## Prerequisites

- **Node.js ≥ 18** (ES modules used throughout — `package.json` sets `"type": "module"`).
- A Chromium build reachable by Playwright. This project pins `playwright@1.56.0` (see note below on why the version is pinned).
- ~2GB free disk space if working with a book of similar size to the reference (11 chapters, ~230MB of base64-embedded images per full build; PDFs of similar total size).

## Install

```bash
cd book-builder
npm install
```

This installs the two runtime dependencies:
- `playwright` (`1.56.0`, pinned) — headless Chromium for measurement, optimization, validation, and PDF generation.
- `pdf-lib` (`^1.17.1`) — PDF merging, metadata, and bookmark generation.

## Install the Chromium browser binary

Playwright's npm package does not bundle a browser by default. If one isn't already present:

```bash
npx playwright install chromium
```

If your environment restricts network egress, ensure the Playwright browser download host is reachable, or point `PLAYWRIGHT_BROWSERS_PATH` at a pre-provisioned Chromium build:

```bash
export PLAYWRIGHT_BROWSERS_PATH=/path/to/existing/chromium/build
```

### Why the Playwright version is pinned

`playwright` and its matching Chromium browser revision must agree. Installing a newer `playwright` than the Chromium build actually available in your environment will fail at launch with an "Executable doesn't exist" error. If you need a different Playwright version, either update it *and* run `npx playwright install chromium` for the matching revision, or find the revision your existing Chromium build corresponds to and pin `playwright` to that.

## Verify installation

```bash
node -e "import('playwright').then(({chromium}) => chromium.launch().then(b => { console.log('OK'); return b.close(); }))"
```

Should print `OK` with no errors.

Then run the analyzer against the bundled reference chapters as a smoke test:

```bash
npm run analyze
```

Should print one line per chapter (`chapter-01.html: 32 pages, 0 overflowing, ...`) and write `reports/chapter-NN.analysis.json` files.

## Optional: PDF verification tools

The pipeline itself doesn't require these, but they're useful for independently auditing generated PDFs (used throughout this project's own release verification):

- `qpdf` — structural PDF validation (`qpdf --check file.pdf`)
- `pdfinfo` / `pdffonts` (poppler-utils) — page count, dimensions, font embedding
- Python `pypdf` — programmatic bookmark/outline/text verification

```bash
# Debian/Ubuntu
apt-get install -y qpdf poppler-utils
pip install pypdf
```

## Next steps

See `USER_GUIDE.md` to run the pipeline against your own chapters, or `npm run build-book` to run the full pipeline against the bundled reference book.

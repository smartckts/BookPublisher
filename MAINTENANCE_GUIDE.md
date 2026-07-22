# MAINTENANCE_GUIDE.md

## How to Debug the Project

1. **Start with the reports, not the code.** Every stage writes a JSON report before the next stage runs. If something looks wrong in the final PDF, work backward: `pdf-generation-report.json` -> `print-validation-report.json` -> `optimization-report.json` -> `repagination-plan.json` -> `overflow-report.json` -> `layout-report.json`. The first report where the numbers stop making sense tells you which module to look at.
2. **Reproduce with `--verbose`** (`build.js`) to see which stage is running and how long each takes, before digging into a specific module's own report.
3. **Reproduce against the real sample chapter first** (`examples/sample-chapter.html` or `chapters/chapter-04.html`) before assuming a bug is general -- every module's own test suite is built around this exact file, so if something's wrong with it, that's the fastest thing to confirm or rule out.
4. **Re-run just the failing module's own test file** rather than the whole suite, for a faster iteration loop:
   ```bash
   node --experimental-test-module-mocks --test tests/<moduleName>.test.js
   ```
5. **For a Print Validator `FAIL`**, read the `issues` array in `print-validation-report.json` directly -- every issue has a `severity`, `page`, `description`, and `recommendation`. This is the single most information-dense report in the pipeline for diagnosing an actual defect.
6. **For a reading-order or structural question specifically**, the pattern that found and fixed the wrapper-container defect is the template to follow again: dump the exact content-fingerprint sequence before and after the suspected stage, diff it directly, and find the exact point of divergence -- see `docs/WRAPPER_CONTAINER_BUG_ANALYSIS.md` for the full worked example.

## How to Update Dependencies

BookPublisher has exactly one runtime dependency: `playwright`. Updating it is the one dependency-maintenance task likely to ever be needed.

1. Check the current pinned version in `package.json`.
2. Update it, then run `npm install` followed by `npx playwright install chromium` (a new Playwright version may require a matching new Chromium build).
3. **Run the complete test suite before considering the update safe** (`npm test`) -- this project's entire correctness guarantee rests on Chromium's actual rendering behavior, so a Playwright/Chromium version bump is exactly the kind of change that could silently shift measurements by a pixel or two and cause a previously-passing test to fail. Do not skip this step for what looks like a minor version bump.
4. Pay particular attention to any test that asserts exact pixel/point values (e.g. `pdfRenderer.test.js`'s page-size assertions) -- these are the most likely to be sensitive to a rendering engine change.

## How to Investigate Bugs

This project has one fully-documented precedent for a real, significant bug investigation -- use it as the template:

1. **Reproduce with the smallest possible input first.** The wrapper-container defect was originally found on real content, then deliberately reduced to the smallest synthetic HTML that still reproduced it, before any fix was attempted.
2. **Trace precisely, don't guess.** Every root-cause claim in this project's history was verified by direct inspection of the actual data (comparing real JSON report output, diffing real HTML before/after) -- never asserted from code review alone.
3. **Identify the owning module before proposing a fix**, and present at least the options actually considered (including ones rejected, and why) -- see `docs/WRAPPER_CONTAINER_BUG_ANALYSIS.md` for the format this project uses.
4. **Stop and get explicit approval before touching any frozen module.** This is not a suggestion -- it's this project's hard, repeatedly-enforced rule. A confirmed critical bug is the only legitimate reason to modify a frozen module, and even then, only after the root cause and proposed fix have been explained and approved.
5. **Add a permanent regression test reproducing the exact scenario** once a fix is made -- every fix in this project's history did this, not as an afterthought but as part of the fix itself.
6. **Known, not-yet-investigated issues are tracked in `docs/KNOWN_ISSUES.md`.** If you find something and aren't the one who will investigate it immediately, document it there in the same format (Issue ID, summary, reproduction conditions, observed vs. expected behavior, suspected owning module, impact, priority, recommended investigation) rather than leaving it undocumented.

## How to Add Future Modules Safely

1. **Design first, in its own document, before any code exists.** Every module in this project has a corresponding `*_DESIGN.md`, reviewed and approved before implementation began.
2. **State explicitly what the new module does NOT do** -- every design document in this project's history includes a section on what's explicitly out of scope, and this has consistently been what kept module boundaries clean.
3. **Identify what it can safely reuse from existing modules**, and import that logic directly rather than reimplementing it -- check `docs/API_REFERENCE.md` first.
4. **Build incrementally, testing against real data at every step**, not just at the end. Every module in this project was built this way, and several real bugs (font resolution quirks, race conditions, cache-related test-isolation issues) were caught specifically because of this discipline, not despite it.
5. **Never modify a frozen module to make the new one easier to build.** If a new module seems to need a frozen module to change, that's a stop-and-explain moment (see `docs/PDF_GENERATOR_DESIGN.md`'s own "if implementing this requires changing a frozen module, stop immediately" instruction, which this project has followed at every milestone).
6. **Write the deliverable documents in the same shape every prior module used**: a changelog, a performance report with real measured numbers (not just proposed targets), and -- for the report-generating stages -- a human-readable companion to the JSON report showing a real example.

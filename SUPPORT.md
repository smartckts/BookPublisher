# SUPPORT.md

## How to Get Help

1. **Check `docs/USER_GUIDE.md` first** -- it covers input requirements, running the pipeline, understanding every report, and the manual review workflow.
2. **Check `README.md`'s Troubleshooting table** for the most common issues (missing input, `PASS_WITH_MANUAL_REVIEW`, `FAIL`, font verification failures, slow first run).
3. **Check `docs/KNOWN_LIMITATIONS.md` and `docs/KNOWN_ISSUES.md`** -- your issue may already be documented, with reproduction conditions and status.
4. **Check the relevant report's JSON directly** -- every stage's output is designed to be read by a human, not just a machine; the `issues`/`errors`/`recommendation` fields usually explain exactly what happened.
5. If none of the above resolves it, open an issue with: the exact command you ran, the full console output, and (if relevant) the contents of `print-validation-report.json` or `pipeline-report.json`.

## FAQ

**Q: I got `PASS_WITH_MANUAL_REVIEW` -- is my PDF broken?**
No. The PDF was generated successfully and its structure is certified intact everywhere except the pages listed in `manualReviewPages`. See `docs/USER_GUIDE.md`'s Manual Review Workflow.

**Q: I got `FAIL` -- what do I do?**
Check `print-validation-report.json`'s `issues` array for the specific defect. This means the HTML genuinely should not become a PDF yet -- PDF Generator will refuse to run against it. Fix the underlying content issue and re-run the Build Pipeline.

**Q: Can I use a font from Google Fonts or another CDN?**
Not reliably. This pipeline is designed to work offline, and font URLs that require network access have been observed to fail in restricted environments during this project's own development. Self-host fonts as base64 data URIs in your chapter's `<style>` block instead -- see `docs/USER_GUIDE.md`'s Input HTML Requirements.

**Q: Why does my table/box/image never get cropped or split, even when it doesn't fit?**
This is intentional. BookPublisher never splits protected content (tables, callout boxes, image+caption pairs) -- if one genuinely doesn't fit anywhere, it's flagged for manual review instead of being cut.

**Q: Can I process a whole book (many chapters) at once?**
Not in a single command -- see `docs/KNOWN_LIMITATIONS.md`. Run the pipeline once per chapter; `docs/USER_GUIDE.md` has a batching pattern.

**Q: Does BookPublisher support CMYK output, crop marks, or bleed?**
No, not in v1.0 -- see `docs/KNOWN_LIMITATIONS.md` and `docs/ROADMAP.md` for whether/when this might change.

**Q: My build is slow the first time I run it.**
Playwright's Chromium browser needs to be installed once (`npx playwright install chromium`). Subsequent runs are fast -- see `docs/BENCHMARKS.md` for real, measured performance figures.

## Troubleshooting References

- `README.md` -- Troubleshooting table (quick reference)
- `docs/USER_GUIDE.md` -- full input requirements and workflow guidance
- `docs/INSTALL.md` -- installation-specific troubleshooting (Playwright/Chromium setup, platform notes)
- `docs/KNOWN_LIMITATIONS.md` -- current scope boundaries, not defects
- `docs/KNOWN_ISSUES.md` -- tracked, unresolved defects with reproduction conditions
- `docs/CLI_REFERENCE.md` -- every flag and exit code for both CLIs

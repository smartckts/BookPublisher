# TODO.md — Version 2 Candidates

Planned future enhancements only. **Nothing on this list is implemented in v1.0.0** — the engine is frozen (see `DEVELOPER_GUIDE.md`); these are ideas for a deliberate v2 planning cycle, not a backlog to pull from silently.

## Repagination Engine

- **Sub-component splitting for Keep-Together/Flexible content.** Currently every component — including plain paragraphs — is treated as an atomic move unit. Allowing safe internal breaks (between paragraphs, between list items, never mid-sentence) would let the best-fit packer achieve tighter fills and likely reduce total page count further, at the cost of real implementation complexity (need reliable orphan/widow-safe break-point detection).
- **Automatic re-optimization trigger when font metrics change.** v1.0.0 requires a human to notice fonts changed and manually re-run the optimizer (this is exactly what happened in Phase 5.6). A v2 could detect "the fonts loading now differ from what the last optimization pass was measured against" and prompt or auto-trigger re-optimization.
- **True global dynamic-programming packing** (Knuth-Plass-style) instead of the current bounded best-fit search. Would find a provably optimal page-break sequence for a whole chapter rather than a locally-good one — worth it only if the current approach's results (verified close to the content-conservation lower bound in this project) turn out to be meaningfully suboptimal on a different book's content mix.
- **Cover/full-bleed page assistance.** The engine currently refuses to touch overflowing full-bleed pages (correctly, per v1.0.0's scope) — a v2 could offer a *separate*, explicitly-invoked tool that suggests safe cover-content trims (e.g., "this cover's subtitle text could be shortened by N characters to fit") without ever doing so automatically.

## Validation Engine

- **Real W3C-grade HTML/CSS validation**, replacing the current heuristic checks (documented as heuristic, not full-spec, in `docs/API.md`). Would need either an offline validator library or a vetted, sandboxed way to reach an external validation service.
- **Color contrast checking** for accessibility scoring (currently covers alt text, heading structure, and link text quality, but not contrast ratios).
- **Auto-generated alt-text suggestions** (not auto-applied — v1.0.0 deliberately doesn't guess at image content) using an image-description model, presented as a suggestion for editorial review, not an automatic fix.
- **Configurable severity/weighting profiles** — different books or publishers may reasonably disagree with v1.0.0's fixed severity levels and dimension weights (currently hardcoded in `validator/scoring.js`).

## PDF Generator

- **Section-level and figure/table-level bookmarks**, not just chapter-level.
- **PDF/A or /X compliance** for long-term archival or print-shop submission, if a future use case needs it.
- **Configurable PDF compression/downsampling** for images, to produce a smaller distributable file where 233MB is impractical (e.g. web download vs. archival master).
- **Real hyperlink support** — v1.0.0 correctly found and reported that this particular reference book has zero hyperlinks, so cross-reference/TOC-entry-to-page-anchor linking was never exercised. A book that does use internal links would need this verified against a book that actually has some.

## Tooling / Developer Experience

- **Automated test suite** (currently: verification is built into the development process itself — see `DEVELOPER_GUIDE.md` — rather than a runnable CI test file). A v2 could formalize the "measure before, measure after" pattern already used throughout development into actual test fixtures.
- **Template-driven chapter authoring** (see `template/README.md` — this directory is reserved but unused in v1.0.0, since chapters are currently hand-authored, not generated).
- **Multi-book / series support** — v1.0.0 was built and validated against one book; book-to-book page numbering continuity across a series (vs. each chapter's numbering restarting or being chapter-local) isn't yet handled.
- **Incremental/partial re-builds** at the `npm run build-book` level — currently `build.js` always processes every chapter; the underlying engine already supports single-chapter invocation (used in Phase 5.6), but the orchestrator doesn't yet expose a "only chapters changed since last build" mode.

## Explicitly out of scope for v2 as well (design decisions, not gaps)

- Automatically fixing missing captions or alt text by guessing content — always a suggestion for review, never an automatic edit, regardless of version.
- Resizing figures/photos/activities to force an arbitrary page-count target — appearance preservation remains a hard constraint.

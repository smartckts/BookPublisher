# CONTRIBUTING.md

## Before You Start

All seven core modules (Layout Analyzer v2, Overflow Detector v1, Repagination Engine v1, HTML Optimizer v1, Print Validator v1, Build Pipeline v1, PDF Generator v1) are frozen. Do not modify them except for a confirmed critical production bug, and even then, only after explaining the root cause and getting explicit approval first -- see `MAINTENANCE_GUIDE.md`'s "How to Investigate Bugs" section for the exact process this project has used every time this has happened.

Contributions that don't touch frozen modules -- new documentation, a new module built on top of the existing ones, tooling improvements in `scripts/` -- don't need this level of caution, but should still follow the standards below.

## Coding Standards

- ES modules throughout (`"type": "module"` in `package.json`), `async`/`await`, no callback-style APIs.
- Every exported function gets a JSDoc block: parameters, return shape, and what it throws.
- Small, single-responsibility files. If a module needs more than one concern (measuring, deciding, writing output), split it into separate files rather than growing one large file.
- No placeholder code, no unimplemented stubs left in the tree. If an interface is prepared for a future module, it should throw a clear "not implemented yet" error, not silently do nothing -- and it should be removed once genuinely obsolete (see this project's own RC1 cleanup of two such stub files, once the real modules they anticipated were built).
- Reuse over duplication, enforced by import. If new code needs logic an existing module already implements correctly, import it directly -- check `docs/API_REFERENCE.md` first.

## Commit Conventions

- One logical change per commit. This project's own development history (see `CHANGELOG.md` and the individual `docs/CHANGELOG_*.md` files) was built incrementally, with each step explained, tested, and verified before moving to the next -- commits should follow the same discipline.
- Commit messages should state what changed and, where it isn't obvious, why -- not just restate the diff.
- Never combine a frozen-module bug fix with an unrelated change in the same commit.

## Pull Request Workflow

1. **If the change touches a frozen module**, the PR description must include: the root cause, which module owns the defect, at least two options considered (not just the one chosen), and why the chosen fix was selected over the alternatives. This mirrors the format `docs/WRAPPER_CONTAINER_BUG_ANALYSIS.md` established and every subsequent bug investigation in this project has followed.
2. **Include real verification, not just a description of intent.** Every fix and every new module in this project's history was verified against real data (the actual sample chapter, or a deliberately-constructed edge case) before being considered complete -- a PR should show the same: actual command output, actual test results, not just "should work."
3. **Run the complete test suite before opening the PR** (`npm test`) and include the pass/fail summary in the PR description.
4. **Update the relevant documentation in the same PR**, not as a follow-up -- this project has never shipped a code change without updating the guide that describes it.

## Testing Requirements

- **New code must include tests that run against real rendering**, not mocked DOM behavior -- this is the single most consistent practice across this entire project's test suite (187 tests, effectively all against real Playwright rendering or real generated files).
- **Every check/validation category needs at least one deliberately-broken test case**, proving it actually catches the problem it claims to catch -- not just a happy-path test proving it passes clean input.
- **A bug fix needs a permanent regression test reproducing the exact scenario that exposed it**, not just a fix to the code.
- **If genuine fault injection is needed** (simulating an exception from inside a module that wouldn't naturally throw), use Node's experimental module mocking (already enabled via `--experimental-test-module-mocks` in this project's `test` script) -- and put that test in its own file, since a real, project-specific finding showed the mock can leak into other tests sharing the same process.
- Run `npm test` and confirm 100% pass before submitting -- this project has never merged a change with a known-failing test.

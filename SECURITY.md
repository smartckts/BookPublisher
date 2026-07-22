# SECURITY.md

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| < 1.0 (release candidates, pre-release) | No |

Only the current major release line receives security consideration. As of this writing, that is v1.0.0.

## Reporting a Vulnerability

If you discover a security vulnerability in BookPublisher, please report it privately rather than opening a public issue, to allow a fix to be prepared before public disclosure.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce it (a minimal HTML input that triggers the issue, if applicable)
- Which module is affected, if known

Please allow a reasonable time for a response before any public disclosure.

## What Counts as a Security Concern Here

BookPublisher's own attack surface is narrow -- it processes local HTML files through Playwright/Chromium and produces local output files; it does not run as a network service, does not accept untrusted remote input by default, and does not execute arbitrary user-supplied code beyond rendering HTML/CSS in a browser context. The most relevant categories of concern:

- **Malicious HTML/CSS content** processed by the pipeline that could exploit a Chromium vulnerability -- see the Dependency Update Policy below, since this is primarily mitigated by keeping Playwright/Chromium current, not by anything BookPublisher's own code does.
- **Path traversal or file-system issues** in CLI argument handling (`build.js`, `pdf-generator.js`) -- report if you find a way to make either CLI read or write outside its intended directories.
- **Font/resource-loading behavior** that could be abused to exfiltrate data via network requests -- note that this pipeline is designed to work fully offline with self-hosted fonts/images (see `docs/KNOWN_LIMITATIONS.md`); a chapter HTML file that makes unexpected network requests during rendering is itself a red flag worth reporting.

## Dependency Update Policy

BookPublisher has exactly one runtime dependency: `playwright`. Since every module's actual security-relevant behavior (rendering untrusted-ish HTML/CSS content) happens inside the Chromium browser Playwright manages, keeping this dependency current is the primary security maintenance task for this project.

- Playwright/Chromium updates should be applied promptly when a security advisory is published for either.
- Every dependency update must pass the complete test suite (`npm test`) before being considered safe to adopt -- see `docs/MAINTENANCE_GUIDE.md`'s "How to Update Dependencies" section for the full procedure, including why this project treats a Playwright version bump as a change requiring full re-verification, not a routine bump.

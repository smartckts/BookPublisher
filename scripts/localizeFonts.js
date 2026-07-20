// scripts/localizeFonts.js
// PHASE 5.5 — Priority 1 fix: remove the runtime Google Fonts CDN
// dependency and replace it with fully self-contained, base64-embedded
// local fonts (same font files, same weights, same license — sourced
// from @fontsource, which repackages Google Fonts' own files for
// offline/self-hosted use).
//
// Base64 data URIs (rather than relative fonts/*.woff2 paths) are used
// deliberately: this pipeline copies chapter files between directories
// (chapters/ -> build/ -> output/), and a relative path would only be
// valid from one of those locations. A self-contained @font-face block
// works correctly no matter where the HTML file ends up — consistent
// with how this book already embeds every image as base64.
//
// Scope discipline: this script ONLY touches <head> (removes the
// Google Fonts <link> tags, inserts one <style> block of @font-face
// rules). It does not touch any .page, component, table, figure,
// activity, or pagination-related markup — verified by the integrity
// check this script runs on itself before/after every file it touches.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'css', 'fonts');

const FONT_FILES = [
  { family: 'Poppins', weight: 600, file: 'poppins-latin-600-normal.woff2' },
  { family: 'Poppins', weight: 700, file: 'poppins-latin-700-normal.woff2' },
  { family: 'Poppins', weight: 800, file: 'poppins-latin-800-normal.woff2' },
  { family: 'Playfair Display', weight: 700, file: 'playfair-display-latin-700-normal.woff2' },
  { family: 'Playfair Display', weight: 800, file: 'playfair-display-latin-800-normal.woff2' },
  { family: 'Nunito', weight: 400, file: 'nunito-latin-400-normal.woff2' },
  { family: 'Nunito', weight: 600, file: 'nunito-latin-600-normal.woff2' },
  { family: 'Nunito', weight: 700, file: 'nunito-latin-700-normal.woff2' },
  { family: 'Nunito', weight: 800, file: 'nunito-latin-800-normal.woff2' },
  { family: 'Roboto', weight: 400, file: 'roboto-latin-400-normal.woff2' },
  { family: 'Roboto', weight: 500, file: 'roboto-latin-500-normal.woff2' },
  { family: 'Roboto', weight: 700, file: 'roboto-latin-700-normal.woff2' },
  { family: 'Inter', weight: 400, file: 'inter-latin-400-normal.woff2' },
  { family: 'Inter', weight: 500, file: 'inter-latin-500-normal.woff2' },
  { family: 'Inter', weight: 600, file: 'inter-latin-600-normal.woff2' },
  { family: 'Inter', weight: 700, file: 'inter-latin-700-normal.woff2' },
];

export function buildLocalFontsCss() {
  const rules = FONT_FILES.map(({ family, weight, file }) => {
    const bytes = fs.readFileSync(path.join(FONTS_DIR, file));
    const b64 = bytes.toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  });
  return (
    '<style id="local-fonts">\n/* Self-hosted fonts — replaces the Google Fonts CDN <link> (Phase 5.5). ' +
    'See css/local-fonts.css for the documented, non-inlined reference version. */\n' +
    rules.join('\n') +
    '\n</style>'
  );
}

const GOOGLE_FONTS_LINK_PATTERN = /<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi;
const GOOGLE_FONTS_PRECONNECT_PATTERN = /<link[^>]*rel="preconnect"[^>]*fonts\.g(?:oogleapis|static)\.com[^>]*>\s*/gi;

export function localizeFontsInHtml(html, localFontsStyleTag) {
  const before = {
    hadGoogleLink: GOOGLE_FONTS_LINK_PATTERN.test(html),
  };
  let updated = html
    .replace(GOOGLE_FONTS_PRECONNECT_PATTERN, '')
    .replace(GOOGLE_FONTS_LINK_PATTERN, '');

  if (!updated.includes('id="local-fonts"')) {
    updated = updated.replace('</head>', `${localFontsStyleTag}\n</head>`);
  }

  return { html: updated, hadGoogleLink: before.hadGoogleLink };
}

function bodyOnlyContent(html) {
  // Used for integrity verification: strip <head> entirely so the
  // comparison only covers the parts of the document this script must
  // NOT change (everything from <body> onward).
  const idx = html.indexOf('<body');
  return idx === -1 ? html : html.slice(idx);
}

export function processFile(filePath, localFontsStyleTag) {
  const original = fs.readFileSync(filePath, 'utf-8');
  const { html: updated, hadGoogleLink } = localizeFontsInHtml(original, localFontsStyleTag);

  const bodyBefore = bodyOnlyContent(original);
  const bodyAfter = bodyOnlyContent(updated);
  if (bodyBefore !== bodyAfter) {
    throw new Error(
      `Integrity check failed for ${filePath}: <body> content differs after font localization — ` +
      `this script must only touch <head>. Aborting without writing.`
    );
  }

  fs.writeFileSync(filePath, updated);
  return { hadGoogleLink, changed: original !== updated };
}

async function main() {
  const [, , targetArg] = process.argv;
  if (!targetArg) {
    console.error('Usage: node scripts/localizeFonts.js <file.html|directory>');
    process.exit(1);
  }

  const styleTag = buildLocalFontsCss();
  console.log(`Built local @font-face block: ${(styleTag.length / 1024).toFixed(1)} KB (16 font files embedded)`);

  const stat = fs.statSync(targetArg);
  const files = stat.isDirectory()
    ? fs.readdirSync(targetArg).filter((f) => f.endsWith('.html')).map((f) => path.join(targetArg, f))
    : [targetArg];

  let changedCount = 0;
  for (const f of files) {
    try {
      const result = processFile(f, styleTag);
      console.log(`${result.changed ? 'UPDATED' : 'unchanged'}  ${path.basename(f)} (had Google Fonts link: ${result.hadGoogleLink})`);
      if (result.changed) changedCount++;
    } catch (err) {
      console.error(`FAILED  ${path.basename(f)}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${changedCount}/${files.length} files updated.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default { buildLocalFontsCss, localizeFontsInHtml, processFile };

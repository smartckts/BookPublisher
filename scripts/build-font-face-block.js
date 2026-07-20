// scripts/build-font-face-block.js
// Generates a single, self-contained <style> block with @font-face
// rules using base64 data: URIs for every locally-hosted font weight —
// matching this book's existing pattern of fully self-contained HTML
// (all images are already embedded as base64). Run once; output is
// pasted into the fix script, not regenerated at build time.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONTS_DIR = path.join(__dirname, '..', 'css', 'fonts');

const FACES = [
  ['Poppins', 600, 'poppins-latin-600-normal.woff2'],
  ['Poppins', 700, 'poppins-latin-700-normal.woff2'],
  ['Poppins', 800, 'poppins-latin-800-normal.woff2'],
  ['Playfair Display', 700, 'playfair-display-latin-700-normal.woff2'],
  ['Playfair Display', 800, 'playfair-display-latin-800-normal.woff2'],
  ['Nunito', 400, 'nunito-latin-400-normal.woff2'],
  ['Nunito', 600, 'nunito-latin-600-normal.woff2'],
  ['Nunito', 700, 'nunito-latin-700-normal.woff2'],
  ['Nunito', 800, 'nunito-latin-800-normal.woff2'],
  ['Roboto', 400, 'roboto-latin-400-normal.woff2'],
  ['Roboto', 500, 'roboto-latin-500-normal.woff2'],
  ['Roboto', 700, 'roboto-latin-700-normal.woff2'],
  ['Inter', 400, 'inter-latin-400-normal.woff2'],
  ['Inter', 500, 'inter-latin-500-normal.woff2'],
  ['Inter', 600, 'inter-latin-600-normal.woff2'],
  ['Inter', 700, 'inter-latin-700-normal.woff2'],
];

let css = `<style id="local-fonts">\n/* Self-hosted fonts (Phase 5.5) — replaces the Google Fonts CDN <link>.\n   Base64-embedded to match this document's existing self-contained\n   pattern (all images are already embedded the same way). See\n   css/fonts/LICENSES/ in the project repo for each family's OFL license. */\n`;

for (const [family, weight, file] of FACES) {
  const filePath = path.join(FONTS_DIR, file);
  const data = fs.readFileSync(filePath).toString('base64');
  css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');}\n`;
}
css += `</style>`;

fs.writeFileSync(path.join(__dirname, '..', 'build', '_font-face-block.html'), css);
console.log('Written', css.length, 'chars to build/_font-face-block.html');

// pdf/pdfGenerator.js
// MODULE 6 — PDF Generator.
//
// Two stages:
//   1. generateChapterPdf — Playwright prints each optimized chapter HTML
//      to a standalone A4 PDF, print media emulated, fonts fully
//      resolved before printing so they embed correctly.
//   2. generateBookPdf — merges the 11 chapter PDFs into one complete
//      book PDF (pdf-lib, binary-level page copy — no re-rendering,
//      so it's fast and doesn't risk memory issues from combining
//      ~300MB of base64-laden HTML into one document), then adds
//      chapter-level bookmarks and PDF metadata.

import { chromium } from 'playwright';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Render one chapter HTML file to a standalone PDF.
 */
export async function generateChapterPdf(htmlFile, outputPath, { browser: sharedBrowser } = {}) {
  const browser = sharedBrowser || (await chromium.launch());
  const ownBrowser = !sharedBrowser;
  const page = await browser.newPage();
  const startTime = Date.now();

  try {
    await page.goto('file://' + path.resolve(htmlFile), { waitUntil: 'networkidle', timeout: 180000 });
    await page.emulateMedia({ media: 'print' });
    // Critical: wait for every embedded font to actually resolve before
    // printing, or Chromium may rasterize/substitute text that hasn't
    // finished loading yet — verified necessary in Phase 5.5's testing.
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }, // .page's own CSS padding IS the margin system — see config.js PAGE
      preferCSSPageSize: false,
      displayHeaderFooter: false,
    });

    const stats = fs.statSync(outputPath);
    return {
      htmlFile,
      outputPath,
      sizeBytes: stats.size,
      generationTimeMs: Date.now() - startTime,
    };
  } finally {
    await page.close();
    if (ownBrowser) await browser.close();
  }
}

/**
 * Merge individually-generated chapter PDFs into one complete book PDF,
 * with chapter-level bookmarks and document metadata.
 */
export async function generateBookPdf(chapterPdfPaths, outputPath, { bookTitle, author, chapterTitles } = {}) {
  const merged = await PDFDocument.create();
  const chapterPageRanges = []; // { title, startPageIndex, pageCount }

  for (let i = 0; i < chapterPdfPaths.length; i++) {
    const bytes = fs.readFileSync(chapterPdfPaths[i]);
    const src = await PDFDocument.load(bytes);
    const pageIndices = src.getPageIndices();
    const startPageIndex = merged.getPageCount();
    const copiedPages = await merged.copyPages(src, pageIndices);
    copiedPages.forEach((p) => merged.addPage(p));
    chapterPageRanges.push({
      title: (chapterTitles && chapterTitles[i]) || `Chapter ${i + 1}`,
      startPageIndex,
      pageCount: pageIndices.length,
    });
  }

  merged.setTitle(bookTitle || 'Book');
  merged.setAuthor(author || '');
  merged.setSubject(bookTitle || '');
  merged.setCreator('book-builder publishing pipeline');
  merged.setProducer('Playwright + pdf-lib');
  merged.setCreationDate(new Date());
  merged.setModificationDate(new Date());

  addChapterBookmarks(merged, chapterPageRanges);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const outBytes = await merged.save();
  fs.writeFileSync(outputPath, outBytes);

  return {
    outputPath,
    totalPages: merged.getPageCount(),
    sizeBytes: outBytes.length,
    chapterPageRanges,
  };
}

/**
 * Adds a flat, chapter-level PDF outline (bookmarks) — one entry per
 * chapter, pointing at that chapter's first page. pdf-lib has no
 * high-level bookmark API, so this constructs the PDF Outline
 * dictionary tree directly via its low-level object context. Verified
 * after writing (see scripts/generate-book.js) by reading the bookmarks
 * back with pypdf rather than assuming this worked.
 */
/**
 * PDFString.of() encodes via PDFDocEncoding (a Latin-1-like single-byte
 * encoding), which silently mangles several common Unicode typographic
 * characters (en/em dash, curly quotes, ellipsis) into control-code
 * garbage rather than erroring — found and fixed while verifying real
 * bookmark output with pypdf, not assumed safe. Normalized to their
 * closest ASCII equivalents for bookmark titles specifically; this only
 * affects generated PDF metadata/outline text, never the book's HTML content.
 */
function sanitizeForPdfDocEncoding(text) {
  return String(text)
    .replace(/[\u2013\u2014]/g, '-')   // en dash, em dash
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
    .replace(/\u2026/g, '...')          // ellipsis
    .replace(/[^\x00-\xFF]/g, '?');     // anything else outside Latin-1 — fail loud, not silently
}

function addChapterBookmarks(pdfDoc, chapterPageRanges) {
  const context = pdfDoc.context;
  const refs = chapterPageRanges.map(() => context.nextRef());

  chapterPageRanges.forEach((ch, i) => {
    const pageRef = pdfDoc.getPage(ch.startPageIndex).ref;
    const dict = context.obj({
      Title: PDFString.of(sanitizeForPdfDocEncoding(ch.title)),
      Dest: context.obj([pageRef, PDFName.of('Fit')]),
    });
    context.assign(refs[i], dict);
  });

  // Now that all entries exist, wire Parent/Prev/Next/Count.
  const rootRef = context.nextRef();
  chapterPageRanges.forEach((ch, i) => {
    const dict = context.lookup(refs[i]);
    dict.set(PDFName.of('Parent'), rootRef);
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < chapterPageRanges.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
  });

  const root = context.obj({
    Type: 'Outlines',
    First: refs[0],
    Last: refs[refs.length - 1],
    Count: refs.length,
  });
  context.assign(rootRef, root);

  pdfDoc.catalog.set(PDFName.of('Outlines'), rootRef);
}

export default { generateChapterPdf, generateBookPdf };

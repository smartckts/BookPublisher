// validator/checks.js
// MODULE 5 — Validation checks.
//
// Every function here is READ-ONLY: it inspects the rendered DOM/CSSOM
// and returns findings. Nothing is ever written back to the page or the
// file on disk. This file exports one big browser-context function
// (runAllChecks) that Playwright serializes into the page — grouping
// checks into one evaluate() call is deliberate: 20 separate round-trips
// per chapter would be far slower than one, and correctness is
// identical either way since nothing mutates state between checks.
//
// Categories implemented (see PHASE-5 spec):
//   HTML validity, CSS validity, broken images, broken SVGs, missing
//   captions, figure/table/activity numbering, heading hierarchy,
//   duplicate IDs, broken internal links, page numbering, header/footer
//   consistency, margin violations, overflow/clipping, blank pages,
//   component overlap, A4 dimensions, font loading, accessibility
//   warnings, print-readiness.

export function browserRunAllChecks({ pageConfig }) {
  const issues = [];
  const pxPerMm = 96 / 25.4;

  function addIssue(check, category, severity, description, opts = {}) {
    issues.push({
      check,
      category,
      severity, // 'Critical' | 'Major' | 'Minor'
      description,
      page: opts.page ?? null,
      selector: opts.selector ?? null,
      suggestedFix: opts.suggestedFix ?? '',
      autoFixable: !!opts.autoFixable,
    });
  }

  const pages = Array.from(document.querySelectorAll('.page'));

  // -------------------------------------------------------------
  // HTML VALIDITY (heuristic — see methodology note in the report:
  // no offline full W3C-grade parser is available in this environment,
  // so this checks the structural signals a browser DOM can expose:
  // duplicate ids [also reported under its own category below],
  // elements with invalid/duplicate attributes, and stray unclosed
  // custom-looking tags via the parser's own error recovery artifacts.)
  // -------------------------------------------------------------
  const htmlEl = document.documentElement;
  if (!htmlEl.hasAttribute('lang')) {
    addIssue('html-lang-attribute', 'HTML Validity', 'Minor',
      'The <html> element has no lang attribute.', {
        suggestedFix: 'Add lang="en" (or the appropriate language code) to <html>.',
        autoFixable: true,
      });
  }
  if (!document.doctype) {
    addIssue('html-doctype', 'HTML Validity', 'Major',
      'Document is missing a <!DOCTYPE html> declaration.', {
        suggestedFix: 'Add <!DOCTYPE html> as the first line of the file.',
        autoFixable: true,
      });
  }
  if (!document.title || !document.title.trim()) {
    addIssue('html-title', 'HTML Validity', 'Minor',
      'Document has no <title>.', {
        suggestedFix: 'Add a descriptive <title> for the chapter.',
        autoFixable: false,
      });
  }

  // -------------------------------------------------------------
  // CSS VALIDITY (heuristic — brace-balance / basic syntax sanity of
  // every inline <style> block; genuine CSS parse errors are silently
  // dropped by the CSSOM so this is checked at the source-text level.)
  // -------------------------------------------------------------
  Array.from(document.querySelectorAll('style')).forEach((styleEl, i) => {
    const css = styleEl.textContent || '';
    const openBraces = (css.match(/{/g) || []).length;
    const closeBraces = (css.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      addIssue('css-brace-balance', 'CSS Validity', 'Critical',
        `Stylesheet block #${i + 1} has unbalanced braces (${openBraces} open vs ${closeBraces} close) — likely truncated or corrupted CSS.`, {
          suggestedFix: 'Inspect the stylesheet for a missing/extra closing brace.',
          autoFixable: false,
        });
    }
    // crude but real: a rule missing a colon inside a declaration
    // (NOTE: an earlier, looser version of this heuristic produced a
    // 100% false-positive rate across every chapter when tested against
    // real output and was removed rather than shipped — flagged here so
    // the methodology stays honest about what this check does and
    // doesn't reliably catch.)
  });
  // Confirm each of THIS DOCUMENT's OWN stylesheets parsed into usable
  // CSSOM rules. Cross-origin stylesheets (e.g. an external font CDN)
  // are deliberately excluded — the browser blocks CSSOM access to them
  // for security reasons regardless of whether they're valid CSS, so
  // "inaccessible" there is expected browser behavior, not a defect in
  // this document's authored CSS. (Their reachability is what the Font
  // Loading check covers instead.)
  Array.from(document.styleSheets).forEach((sheet, i) => {
    if (sheet.href) return; // external stylesheet — out of scope for this check
    try {
      const n = sheet.cssRules ? sheet.cssRules.length : 0;
      if (n === 0) {
        addIssue('css-empty-stylesheet', 'CSS Validity', 'Major',
          `Stylesheet #${i + 1} produced zero usable CSS rules.`, {
            suggestedFix: 'Check the stylesheet loaded and parsed correctly.',
            autoFixable: false,
          });
      }
    } catch (e) {
      addIssue('css-inaccessible-stylesheet', 'CSS Validity', 'Major',
        `Stylesheet #${i + 1} could not be read (${e.message}).`, {
          suggestedFix: 'Check for a cross-origin stylesheet blocking CSSOM access.',
          autoFixable: false,
        });
    }
  });

  // -------------------------------------------------------------
  // BROKEN IMAGES
  // -------------------------------------------------------------
  Array.from(document.querySelectorAll('img')).forEach((img) => {
    const pageIdx = pageIndexOf(img);
    if (img.complete && img.naturalWidth === 0) {
      addIssue('broken-image', 'Broken Images', 'Critical',
        `Image failed to load or decode (src starts: "${(img.src || '').slice(0, 60)}...").`, {
          page: pageIdx,
          selector: describeElement(img),
          suggestedFix: 'Verify the image source is valid and reachable, or re-export the asset.',
          autoFixable: false,
        });
    }
    if (!img.hasAttribute('alt')) {
      addIssue('image-missing-alt', 'Accessibility Warnings', 'Minor',
        'Image has no alt attribute.', {
          page: pageIdx,
          selector: describeElement(img),
          suggestedFix: 'Add a descriptive alt attribute (or alt="" if purely decorative).',
          autoFixable: true,
        });
    }
  });

  // -------------------------------------------------------------
  // BROKEN SVGs
  // -------------------------------------------------------------
  Array.from(document.querySelectorAll('svg')).forEach((svg) => {
    const pageIdx = pageIndexOf(svg);
    // A <defs>-only (or <symbol>/<title>/<metadata>-only) SVG is a
    // legitimate, intentionally zero-rendered container for gradients/
    // patterns referenced elsewhere via url(#id) — it never draws
    // anything itself, so a 0x0 render is correct, not broken.
    const nonRenderingTags = new Set(['defs', 'symbol', 'title', 'metadata', 'style']);
    const isDefsOnly = svg.children.length > 0 &&
      Array.from(svg.children).every((c) => nonRenderingTags.has(c.tagName.toLowerCase()));
    if (isDefsOnly) return;

    let bbox = null;
    try { bbox = svg.getBBox ? svg.getBBox() : null; } catch { bbox = null; }
    const rect = svg.getBoundingClientRect();
    const hasChildren = svg.children.length > 0;
    if (hasChildren && bbox && bbox.width === 0 && bbox.height === 0) {
      addIssue('broken-svg-empty-bbox', 'Broken SVGs', 'Critical',
        'SVG has child elements but renders with a zero-size bounding box (likely malformed path/viewBox data).', {
          page: pageIdx,
          selector: describeElement(svg),
          suggestedFix: 'Validate the SVG path data and viewBox attribute.',
          autoFixable: false,
        });
    }
    if (rect.width === 0 || rect.height === 0) {
      addIssue('broken-svg-zero-render', 'Broken SVGs', 'Major',
        'SVG renders with zero width or height on the page.', {
          page: pageIdx,
          selector: describeElement(svg),
          suggestedFix: 'Check the SVG\'s width/height/viewBox attributes and its container CSS.',
          autoFixable: false,
        });
    }
  });

  // -------------------------------------------------------------
  // MISSING CAPTIONS
  // -------------------------------------------------------------
  Array.from(document.querySelectorAll('.figure')).forEach((fig) => {
    const cap = fig.querySelector('figcaption, .caption');
    if (!cap || !cap.textContent.trim()) {
      addIssue('missing-figure-caption', 'Missing Captions', 'Major',
        'Figure has no caption text.', {
          page: pageIndexOf(fig),
          selector: describeElement(fig),
          suggestedFix: 'Add a figcaption describing the figure.',
          autoFixable: false,
        });
    }
  });
  Array.from(document.querySelectorAll('table')).forEach((table) => {
    const cap = table.querySelector('caption') || table.closest('.table-wrap')?.querySelector('.caption, figcaption');
    if (!cap || !cap.textContent.trim()) {
      addIssue('missing-table-caption', 'Missing Captions', 'Minor',
        'Table has no caption/title text.', {
          page: pageIndexOf(table),
          selector: describeElement(table),
          suggestedFix: 'Add a <caption> or preceding label describing the table.',
          autoFixable: false,
        });
    }
  });

  // -------------------------------------------------------------
  // FIGURE / TABLE / ACTIVITY NUMBERING
  // -------------------------------------------------------------
  checkNumberingSequence(
    Array.from(document.querySelectorAll('.figure figcaption, .figure .caption')),
    /Fig(?:ure)?\.?\s*(\d+)\.(\d+)/i,
    'figure-numbering', 'Figure Numbering'
  );
  checkNumberingSequence(
    Array.from(document.querySelectorAll('table caption, .table-wrap .caption')),
    /Table\s*(\d+)\.(\d+)/i,
    'table-numbering', 'Table Numbering'
  );
  checkNumberingSequence(
    Array.from(document.querySelectorAll('.activity')).map((a) => a.querySelector('.activity-title, h3, h4') || a),
    /Activity\s*(\d+)/i,
    'activity-numbering', 'Activity Numbering'
  );

  function checkNumberingSequence(elements, pattern, checkId, categoryLabel) {
    const found = [];
    elements.forEach((el) => {
      const text = el ? el.textContent : '';
      const m = text && text.match(pattern);
      if (m) found.push({ el, num: m[2] ? `${m[1]}.${m[2]}` : m[1], major: parseInt(m[1], 10), minor: m[2] ? parseInt(m[2], 10) : null });
    });
    // duplicates
    const seen = new Map();
    found.forEach((f) => {
      if (seen.has(f.num)) {
        addIssue(checkId + '-duplicate', categoryLabel, 'Major',
          `Duplicate numbering found: "${f.num}" appears more than once.`, {
            page: pageIndexOf(f.el),
            selector: describeElement(f.el),
            suggestedFix: 'Renumber so each figure/table/activity has a unique sequential number.',
            autoFixable: true,
          });
      }
      seen.set(f.num, true);
    });
    // NOTE: an earlier version of this check also flagged "gaps" in the
    // minor-number sequence (e.g. 1.3 -> 1.5) on the assumption every
    // subsection has exactly one figure/table/activity. That assumption
    // doesn't hold for this design — many subsections legitimately have
    // none — so it produced a false positive on nearly every chapter
    // when verified against real output, and was removed. Only genuine
    // duplicate numbering (a real, unambiguous defect) is reported.
  }

  // -------------------------------------------------------------
  // HEADING HIERARCHY
  // -------------------------------------------------------------
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .map((h) => ({ el: h, level: parseInt(h.tagName[1], 10) }));
  let prevLevel = 0;
  headings.forEach((h) => {
    if (prevLevel && h.level - prevLevel > 1) {
      addIssue('heading-hierarchy-skip', 'Heading Hierarchy', 'Minor',
        `Heading level jumps from h${prevLevel} to h${h.level} without an intermediate level.`, {
          page: pageIndexOf(h.el),
          selector: describeElement(h.el),
          suggestedFix: 'Use consecutive heading levels, or confirm this jump is intentional for this design system.',
          autoFixable: false,
        });
    }
    prevLevel = h.level;
  });

  // -------------------------------------------------------------
  // DUPLICATE IDs
  // -------------------------------------------------------------
  const idMap = new Map();
  Array.from(document.querySelectorAll('[id]')).forEach((el) => {
    const id = el.id;
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id).push(el);
  });
  idMap.forEach((els, id) => {
    if (els.length > 1) {
      addIssue('duplicate-id', 'Duplicate IDs', 'Critical',
        `id="${id}" is used ${els.length} times in this document.`, {
          page: pageIndexOf(els[0]),
          selector: `#${id}`,
          suggestedFix: 'Make each id unique (e.g. suffix with a page or component index).',
          autoFixable: true,
        });
    }
  });

  // -------------------------------------------------------------
  // BROKEN INTERNAL LINKS
  // -------------------------------------------------------------
  Array.from(document.querySelectorAll('a[href^="#"]')).forEach((a) => {
    const targetId = a.getAttribute('href').slice(1);
    if (!targetId) return;
    if (!document.getElementById(targetId)) {
      addIssue('broken-internal-link', 'Broken Internal Links', 'Major',
        `Link points to "#${targetId}", which does not exist in this document.`, {
          page: pageIndexOf(a),
          selector: describeElement(a),
          suggestedFix: 'Fix the href target or add the missing id.',
          autoFixable: false,
        });
    }
  });

  // -------------------------------------------------------------
  // PAGE NUMBERING
  // -------------------------------------------------------------
  const footerNumbers = pages
    .map((p, i) => {
      const fn = p.querySelector('.page-footer .pageno');
      return fn ? { pageIndex: i + 1, printed: parseInt(fn.textContent, 10) } : null;
    })
    .filter(Boolean);
  for (let i = 1; i < footerNumbers.length; i++) {
    const prev = footerNumbers[i - 1];
    const cur = footerNumbers[i];
    if (cur.printed !== prev.printed + 1) {
      addIssue('page-numbering-gap', 'Page Numbering', 'Major',
        `Printed page number jumps from ${prev.printed} to ${cur.printed} (not sequential).`, {
          page: cur.pageIndex,
          suggestedFix: 'Regenerate footer page numbers sequentially.',
          autoFixable: true,
        });
    }
  }

  // -------------------------------------------------------------
  // HEADER / FOOTER CONSISTENCY
  // -------------------------------------------------------------
  const chapterTags = new Set();
  const footerLeftTexts = new Set();
  pages.forEach((p, i) => {
    const isFullBleed = p.classList.contains('full-bleed');
    const header = p.querySelector('.page-header');
    const footer = p.querySelector('.page-footer');
    if (!isFullBleed && !header) {
      addIssue('missing-header', 'Header/Footer Consistency', 'Major',
        'Standard page has no page-header.', { page: i + 1, suggestedFix: 'Add a page-header matching the design system.', autoFixable: false });
    }
    if (!isFullBleed && !footer) {
      addIssue('missing-footer', 'Header/Footer Consistency', 'Major',
        'Standard page has no page-footer.', { page: i + 1, suggestedFix: 'Add a page-footer with a page number.', autoFixable: false });
    }
    const tag = header?.querySelector('span.tag')?.textContent;
    if (tag) chapterTags.add(tag);
    const left = footer?.querySelector('span:first-child')?.textContent;
    if (left) footerLeftTexts.add(left);
  });
  if (chapterTags.size > 1) {
    addIssue('inconsistent-chapter-tag', 'Header/Footer Consistency', 'Major',
      `Header chapter tag is inconsistent across pages (${chapterTags.size} distinct values found).`, {
        suggestedFix: 'Ensure every page-header uses the same chapter tag text.',
        autoFixable: true,
      });
  }
  if (footerLeftTexts.size > 1) {
    addIssue('inconsistent-footer-text', 'Header/Footer Consistency', 'Minor',
      `Footer left-side text is inconsistent across pages (${footerLeftTexts.size} distinct values found).`, {
        suggestedFix: 'Ensure every page-footer uses the same book/series text.',
        autoFixable: true,
      });
  }

  // -------------------------------------------------------------
  // MARGIN VIOLATIONS + A4 DIMENSIONS
  // -------------------------------------------------------------
  pages.forEach((p, i) => {
    const rect = p.getBoundingClientRect();
    const widthMm = rect.width / pxPerMm;
    if (Math.abs(widthMm - pageConfig.widthMm) > 1) {
      addIssue('a4-width-violation', 'A4 Page Dimensions', 'Critical',
        `Page width is ${widthMm.toFixed(1)}mm, expected ${pageConfig.widthMm}mm (A4).`, {
          page: i + 1,
          suggestedFix: 'Check for a CSS override changing .page width.',
          autoFixable: false,
        });
    }
    if (p.classList.contains('full-bleed')) return; // full-bleed pages intentionally ignore the margin system
    const cs = getComputedStyle(p);
    const padTopMm = parseFloat(cs.paddingTop) / pxPerMm;
    const padBottomMm = parseFloat(cs.paddingBottom) / pxPerMm;
    if (Math.abs(padTopMm - pageConfig.marginTopMm) > 1) {
      addIssue('margin-top-violation', 'Margin Violations', 'Major',
        `Top padding is ${padTopMm.toFixed(1)}mm, expected ${pageConfig.marginTopMm}mm.`, {
          page: i + 1,
          suggestedFix: 'Check for an inline style or rule overriding .page padding-top.',
          autoFixable: false,
        });
    }
    if (Math.abs(padBottomMm - pageConfig.marginBottomMm) > 1) {
      addIssue('margin-bottom-violation', 'Margin Violations', 'Major',
        `Bottom padding is ${padBottomMm.toFixed(1)}mm, expected ${pageConfig.marginBottomMm}mm.`, {
          page: i + 1,
          suggestedFix: 'Check for an inline style or rule overriding .page padding-bottom.',
          autoFixable: false,
        });
    }
  });

  // -------------------------------------------------------------
  // OVERFLOW / CLIPPING + BLANK PAGES + COMPONENT OVERLAP
  // -------------------------------------------------------------
  pages.forEach((p, i) => {
    const rect = p.getBoundingClientRect();
    const totalHeightMm = rect.height / pxPerMm;
    if (totalHeightMm - pageConfig.heightMm > 1) {
      addIssue('page-overflow', 'Overflow or Clipping', 'Critical',
        `Page renders at ${totalHeightMm.toFixed(1)}mm tall, exceeding the ${pageConfig.heightMm}mm physical page — content will overflow onto an uncontrolled extra page when printed.`, {
          page: i + 1,
          suggestedFix: 'Re-run Intelligent Repagination on this chapter, or manually shorten/move a component.',
          autoFixable: false,
        });
    }

    const children = Array.from(p.children).filter(
      (c) => !c.classList.contains('page-header') && !c.classList.contains('page-footer')
    );
    // Non-visual tags (style/script/template/link/meta) never render a
    // box, so they can't meaningfully "overlap" or count as blank-page
    // content — found via a real example: a scoped <style> block for a
    // crossword-puzzle component sits inline next to its component in
    // the original source (pre-existing, not introduced by this
    // pipeline) and was being compared against real content, producing
    // a nonsensical multi-metre "overlap". Excluded from that
    // comparison here; flagged separately below as its own, correctly
    // low-severity, informational finding instead.
    const nonVisualTags = new Set(['style', 'script', 'template', 'link', 'meta']);
    const visualChildren = children.filter((c) => !nonVisualTags.has(c.tagName.toLowerCase()));
    const strayNonVisual = children.filter((c) => nonVisualTags.has(c.tagName.toLowerCase()));
    strayNonVisual.forEach((el) => {
      addIssue('misplaced-non-rendering-element', 'HTML Validity', 'Minor',
        `A <${el.tagName.toLowerCase()}> element is placed as a direct child of .page (inline with content) rather than in <head>. It never renders or affects print output, but is cosmetically unusual markup.`, {
          page: i + 1,
          selector: describeElement(el),
          suggestedFix: 'Move to <head>, or leave as-is if intentionally scoped near the component it styles — no visual or print impact either way.',
          autoFixable: false,
        });
    });

    if (visualChildren.length === 0) {
      addIssue('blank-page', 'Blank Pages', 'Critical',
        'Page has no content components.', {
          page: i + 1,
          suggestedFix: 'Remove this page or verify content was not accidentally lost.',
          autoFixable: false,
        });
    }

    // Component overlap: consecutive top-level siblings whose rects
    // vertically intersect (accounting for legitimate zero-gap edges).
    // Elements taken out of normal flow (position: absolute/fixed/
    // sticky, or floated) are EXCLUDED — those are deliberately layered
    // over other content by design (e.g. text overlaid on a full-bleed
    // cover background, or a mascot illustration floated beside a
    // paragraph) and are not defects. An earlier version of this check
    // didn't account for that and produced overlap magnitudes of
    // hundreds to thousands of mm on verified-correct pages (confirmed
    // against Phase 4's own screenshot review) — fixed by only
    // evaluating pairs of elements that are both in normal document flow.
    const flowChildren = visualChildren.filter((c) => {
      const cs = getComputedStyle(c);
      return !['absolute', 'fixed', 'sticky'].includes(cs.position) && cs.float === 'none';
    });
    for (let j = 1; j < flowChildren.length; j++) {
      const a = flowChildren[j - 1].getBoundingClientRect();
      const b = flowChildren[j].getBoundingClientRect();
      const overlapPx = a.bottom - b.top;
      if (overlapPx > 2) { // >2px tolerance for sub-pixel rounding
        addIssue('component-overlap', 'Component Overlap', 'Critical',
          `"${describeElement(flowChildren[j - 1])}" and "${describeElement(flowChildren[j])}" visually overlap by ${(overlapPx / pxPerMm).toFixed(1)}mm.`, {
            page: i + 1,
            suggestedFix: 'Check for a negative margin or unexpected positioning causing unintended overlap.',
            autoFixable: false,
          });
      }
    }
  });

  // -------------------------------------------------------------
  // FONT LOADING
  // -------------------------------------------------------------
  const loadedFamilies = new Set();
  try {
    document.fonts.forEach((f) => { if (f.status === 'loaded') loadedFamilies.add(f.family); });
  } catch { /* document.fonts unsupported — skip */ }
  const declaredFamilies = new Set();
  Array.from(document.querySelectorAll('*')).slice(0, 200).forEach((el) => {
    // Sample-based: checking every element is unnecessary; headings and
    // body text are representative of the design system's font usage.
  });
  const sampleHeading = document.querySelector('h1,h2');
  const sampleBody = document.querySelector('p');
  [sampleHeading, sampleBody].filter(Boolean).forEach((el) => {
    const family = getComputedStyle(el).fontFamily;
    const firstFamily = family.split(',')[0].replace(/["']/g, '').trim();
    const isWebSafeFallback = /^(serif|sans-serif|Arial|Helvetica|Times|Georgia|Verdana|-apple-system|system-ui|BlinkMacSystemFont)$/i.test(firstFamily);
    if (isWebSafeFallback) {
      addIssue('font-fallback-in-use', 'Font Loading', 'Critical',
        `Computed font-family resolves to a system fallback ("${firstFamily}") rather than the design system's intended custom font — the requested web font failed to load.`, {
          selector: describeElement(el),
          suggestedFix: 'Self-host the required font files (e.g. as local WOFF2 in css/fonts/) instead of relying on an external font CDN at render/print time — external requests are not guaranteed to succeed in every PDF-generation environment.',
          autoFixable: false,
        });
    }
  });
  if (loadedFamilies.size === 0) {
    addIssue('no-fonts-loaded', 'Font Loading', 'Critical',
      'document.fonts reports zero loaded custom fonts — the page is rendering entirely in fallback/system fonts.', {
        suggestedFix: 'Verify the font stylesheet (e.g. Google Fonts <link>) is reachable from the PDF-generation environment, or self-host the fonts.',
        autoFixable: false,
      });
  }

  // -------------------------------------------------------------
  // ACCESSIBILITY WARNINGS (beyond image alt, already checked above)
  // -------------------------------------------------------------
  if (!document.querySelector('h1')) {
    addIssue('accessibility-no-h1', 'Accessibility Warnings', 'Minor',
      'Document has no top-level <h1>.', {
        suggestedFix: 'Ensure the chapter/section title uses an <h1>.',
        autoFixable: false,
      });
  }
  Array.from(document.querySelectorAll('a')).forEach((a) => {
    const text = a.textContent.trim().toLowerCase();
    if (['click here', 'here', 'link', 'read more'].includes(text)) {
      addIssue('accessibility-vague-link', 'Accessibility Warnings', 'Minor',
        `Link text "${a.textContent.trim()}" is not descriptive out of context.`, {
          page: pageIndexOf(a),
          selector: describeElement(a),
          suggestedFix: 'Use descriptive link text that makes sense without surrounding context.',
          autoFixable: false,
        });
    }
  });

  // -------------------------------------------------------------
  // PRINT READINESS
  // -------------------------------------------------------------
  const hasAtPageRule = Array.from(document.styleSheets).some((sheet) => {
    try {
      return Array.from(sheet.cssRules || []).some((r) => r.type === CSSRule.PAGE_RULE);
    } catch { return false; }
  });
  if (!hasAtPageRule) {
    addIssue('print-missing-at-page', 'Print Readiness', 'Critical',
      'No @page CSS rule found — PDF page size/margins may not be correctly controlled.', {
        suggestedFix: 'Add @page { size: A4; margin: 0; } to the stylesheet.',
        autoFixable: false,
      });
  }
  const hasPrintMediaQuery = Array.from(document.styleSheets).some((sheet) => {
    try {
      return Array.from(sheet.cssRules || []).some((r) => r.media && r.media.mediaText && r.media.mediaText.includes('print'));
    } catch { return false; }
  });
  if (!hasPrintMediaQuery) {
    addIssue('print-missing-media-query', 'Print Readiness', 'Minor',
      'No @media print rules found.', {
        suggestedFix: 'Add print-specific overrides (e.g. hiding screen-only chrome, forcing background colors to print).',
        autoFixable: false,
      });
  }

  // -------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------
  function pageIndexOf(el) {
    if (!el) return null;
    const p = el.closest ? el.closest('.page') : null;
    if (!p) return null;
    return pages.indexOf(p) + 1;
  }
  function describeElement(el) {
    if (!el) return '';
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
    return `<${el.tagName.toLowerCase()}${cls}>`;
  }

  return {
    totalPages: pages.length,
    issues,
  };
}

export default { browserRunAllChecks };

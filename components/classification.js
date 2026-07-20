// components/classification.js
// Component Classification Engine.
//
// This module has two halves:
//   - browserClassify(el)  → runs INSIDE the page context (page.evaluate),
//     matches an element against config.COMPONENT_CLASSIFICATION in order,
//     and returns its class + move-cost base + bonding metadata.
//   - classifyAll(page)    → convenience helper that walks every top-level
//     .page child and returns a fully classified, serializable array.
//
// Kept dependency-free (no DOM APIs at module scope) so the classification
// rules themselves can also be unit-tested in plain Node without a browser.

import { COMPONENT_CLASSIFICATION, COMPONENT_CLASS, SHRINKABLE } from '../config.js';

/**
 * Pure matcher: given an element's tag + className string, return the
 * classification metadata. Framework-agnostic — works against a real
 * DOM element (via .matches) or against a plain {tag, className} stub.
 */
export function classify(el) {
  for (const rule of COMPONENT_CLASSIFICATION) {
    if (elementMatches(el, rule.selector)) {
      return {
        selector: rule.selector,
        class: rule.class,
        moveCostBase: rule.moveCostBase,
        bondsToNextSibling: !!rule.bondsToNextSibling,
        shrinkable: shrinkableOverlayFor(el),
      };
    }
  }
  // Should be unreachable — config.js ends with a `*` catch-all — but
  // fail safe rather than fail loud in production rendering.
  return {
    selector: '*',
    class: COMPONENT_CLASS.KEEP_TOGETHER,
    moveCostBase: 8,
    bondsToNextSibling: false,
    shrinkable: null,
  };
}

function elementMatches(el, selector) {
  if (typeof el.matches === 'function') {
    try {
      return el.matches(selector);
    } catch {
      return false;
    }
  }
  // Fallback for plain stub objects {tag, className} used in unit tests.
  if (selector === '*') return true;
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return (el.className || '').split(/\s+/).includes(cls);
  }
  const tags = selector.split(',').map((s) => s.trim().toLowerCase());
  return tags.includes((el.tag || '').toLowerCase());
}

function shrinkableOverlayFor(el) {
  const overlays = [];
  for (const [key, rule] of Object.entries(SHRINKABLE)) {
    if (elementMatches(el, rule.selector)) overlays.push(key);
  }
  return overlays.length ? overlays : null;
}

/**
 * Browser-side classification pass. Call via page.evaluate with this
 * function's source, or import classifyAllInPage (below) which wires it
 * up for you against a live Playwright Page.
 */
export function browserClassifyPageChildren({ classificationRules, shrinkableRules }) {
  // NOTE: this function body is serialized into the browser context by
  // Playwright — it must be self-contained (no closures over Node-only
  // imports). See optimizer/layoutAnalyzer.js for the call site.
  function matches(el, selector) {
    try {
      return el.matches(selector);
    } catch {
      return false;
    }
  }
  function shrinkOverlay(el) {
    const overlays = [];
    for (const [key, rule] of Object.entries(shrinkableRules)) {
      if (matches(el, rule.selector)) overlays.push(key);
    }
    return overlays.length ? overlays : null;
  }
  function classifyOne(el) {
    for (const rule of classificationRules) {
      if (matches(el, rule.selector)) {
        return {
          selector: rule.selector,
          class: rule.class,
          moveCostBase: rule.moveCostBase,
          bondsToNextSibling: !!rule.bondsToNextSibling,
          shrinkable: shrinkOverlay(el),
        };
      }
    }
    return { selector: '*', class: 'keep-together', moveCostBase: 8, bondsToNextSibling: false, shrinkable: null };
  }

  const pxPerMm = 96 / 25.4;
  const pages = Array.from(document.querySelectorAll('.page'));
  return pages.map((pageEl, pageIdx) => {
    const children = Array.from(pageEl.children).filter(
      (c) => !c.classList.contains('page-header') && !c.classList.contains('page-footer')
    );
    return {
      pageIndex: pageIdx + 1,
      // Full-bleed pages (covers, section dividers) intentionally ignore
      // the standard book-margin content budget by design (see the
      // .full-bleed utility class in the shared CSS) — they must be
      // scored against the full physical page, not the 249mm content box.
      isFullBleed: pageEl.classList.contains('full-bleed'),
      components: children.map((c, i) => {
        const rect = c.getBoundingClientRect();
        const info = classifyOne(c);
        return {
          order: i,
          tag: c.tagName.toLowerCase(),
          className: c.className || '',
          heightMm: Math.round((rect.height / pxPerMm) * 100) / 100,
          ...info,
        };
      }),
    };
  });
}

export default { classify, browserClassifyPageChildren };

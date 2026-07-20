// config.js — single source of truth for the whole pipeline.
// Values below were derived directly from the shared CSS design system
// found in the chapter files (see reports/PHASE-1-ANALYSIS-REPORT.md),
// not assumed. If the design system's page geometry ever changes,
// update it here and every module picks it up automatically.

export const PAGE = {
  // Physical page (matches @page{size:A4;margin:0} in the chapter CSS)
  widthMm: 210,
  heightMm: 297,

  // Content-area margins (matches --margin-top/bottom/inner/outer vars)
  marginTopMm: 22,
  marginBottomMm: 26,
  marginInnerMm: 28, // gutter/binding side
  marginOuterMm: 16, // trim/outer edge

  // Derived usable content box (this is the real budget every page must fit)
  get contentHeightMm() {
    return this.heightMm - this.marginTopMm - this.marginBottomMm; // 249mm
  },
  get contentWidthMm() {
    return this.widthMm - this.marginInnerMm - this.marginOuterMm; // 166mm
  },
};

// CSS px-per-mm at the 96dpi CSS reference pixel used by Chromium/Playwright.
export const PX_PER_MM = 96 / 25.4;

// A page is considered "overflowing" once it exceeds budget by more than
// this tolerance. Small (<1mm) differences are rendering jitter, not
// real overflow, and should never trigger a repagination move.
export const OVERFLOW_TOLERANCE_MM = 1;

// Component types that must NEVER be split across a page boundary.
// These map to CSS selectors and are treated as atomic units by the
// optimizer's repagination engine — a component either fits whole on a
// page, or it moves whole to the next one.
export const NEVER_SPLIT_SELECTORS = [
  '.activity',
  '.figure',
  '.photo-plate',
  '.timeline',
  '.box-recap',
  '.box-think',
  '.box-indian',
  '.card',
  '.table-wrap',
  'table',
  '.quiz-box',
  '.hero-banner',
];

// Top-level child selector used to enumerate "movable units" inside a
// .page div. Paragraphs and lists outside a wrapper are also movable as
// atomic units (never split mid-paragraph), consistent with the existing
// orphans:3 / widows:3 CSS already in the design system.
export const PAGE_CHILD_SELECTOR = ':scope > *';

// Optimization priority order (from the project spec). The optimizer
// tries each in order per-chapter before falling back to the next:
//   1. Reduce white space (safe, invisible — margin/gap trimming within
//      documented tolerances)
//   2. Reduce component spacing (safe, invisible)
//   3. Reduce SVG size, max 5% per iteration (visible only at the margin)
//   4. Reduce image margins (safe, invisible)
//   5. Move a whole component to an adjacent page (Intelligent Repagination)
//   6. Move a whole activity
//   7. Move a whole figure
//   8. Insert a new page (last resort only, when no redistribution fits)
export const OPTIMIZATION_PRIORITIES = [
  'reduce-whitespace',
  'reduce-component-spacing',
  'reduce-svg-size',
  'reduce-image-margins',
  'move-component',
  'move-activity',
  'move-figure',
  'insert-page',
];

// Intelligent Repagination specific settings
export const REPAGINATION = {
  // Max forward cascade distance (in pages) before giving up and
  // inserting a new page at the current point. Prevents runaway
  // cascades from shifting content across an entire chapter for a
  // single stubborn component.
  maxCascadeDistance: 6,
  // When pulling a component backward to fill reclaimed whitespace,
  // only pull if it fits with at least this much margin (mm) —
  // avoids immediately re-creating an overflow one page later.
  pullBackSafetyMarginMm: 3,
};

// ============================================================
// 1. COMPONENT CLASSIFICATION ENGINE
// ============================================================
// Every top-level page component falls into exactly one class.
// This drives what the optimizer is allowed to do to it, and how
// expensive (see MOVEMENT_COST below) it is to relocate.
//
//   ATOMIC        — never split, ever. Moves as a whole unit or not at all.
//   KEEP_TOGETHER — strongly prefers not to split; may split only at an
//                   explicit internal seam (e.g. between paragraphs in a
//                   multi-paragraph block, between <li> items) under
//                   pressure, and never mid-sentence/mid-paragraph.
//   FLEXIBLE      — freely breakable at natural seams, subject to the
//                   existing orphans:3/widows:3 CSS rules.
//   SHRINKABLE    — not a placement class; an attribute overlay applied
//                   to SVGs, images, and inter-component whitespace,
//                   describing how much safe, invisible size reduction
//                   is available before a component is considered for
//                   movement at all.
export const COMPONENT_CLASS = {
  ATOMIC: 'atomic',
  KEEP_TOGETHER: 'keep-together',
  FLEXIBLE: 'flexible',
};

// selector -> classification metadata. Order matters: first match wins,
// so more specific selectors should precede general ones.
export const COMPONENT_CLASSIFICATION = [
  { selector: '.figure', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 12 },
  { selector: '.photo-plate', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 12 },
  { selector: '.activity', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 14 },
  { selector: '.timeline', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 16 },
  { selector: '.box-recap', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 8 },
  { selector: '.box-think', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 8 },
  { selector: '.box-indian', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 8 },
  { selector: '.card', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 6 },
  { selector: '.table-wrap', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 14 },
  { selector: 'table', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 14 },
  { selector: '.quiz-box', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 10 },
  { selector: '.hero-banner', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 20 },
  { selector: '.two-col', class: COMPONENT_CLASS.ATOMIC, moveCostBase: 12 },

  { selector: '.section-head', class: COMPONENT_CLASS.KEEP_TOGETHER, moveCostBase: 10, bondsToNextSibling: true },
  { selector: 'h1,h2,h3,h4', class: COMPONENT_CLASS.KEEP_TOGETHER, moveCostBase: 10, bondsToNextSibling: true },

  { selector: 'p', class: COMPONENT_CLASS.FLEXIBLE, moveCostBase: 2 },
  { selector: 'ul,ol', class: COMPONENT_CLASS.FLEXIBLE, moveCostBase: 3 },

  { selector: '*', class: COMPONENT_CLASS.KEEP_TOGETHER, moveCostBase: 8 },
];

// Shrinkable attribute overlay — independent of the class above.
// These describe SAFE, INVISIBLE-AT-NORMAL-VIEWING reduction bounds,
// used by optimization priorities 1-4 before any component is moved.
export const SHRINKABLE = {
  svg: {
    selector: 'svg',
    maxPerIterationPct: 5,
    maxCumulativePct: 15,
  },
  imageMargin: {
    selector: 'img, .fig-photo, .ph-frame',
    maxReductionMm: 4,
  },
  whitespace: {
    selector: '.page > *',
    maxGapReductionPct: 20,
  },
};

// ============================================================
// 2. PAGE QUALITY SCORE (0-100)
// ============================================================
export const QUALITY_WEIGHTS = {
  fillEfficiency: 40,
  structuralIntegrity: 30,
  breakQuality: 15,
  overflowPenalty: 15,
};

export const QUALITY_BANDS = [
  { min: 90, label: 'Excellent' },
  { min: 75, label: 'Good' },
  { min: 60, label: 'Acceptable' },
  { min: 0, label: 'Needs Rework' },
];

// ============================================================
// 3. COMPONENT MOVEMENT COST MODEL
// ============================================================
export const MOVEMENT_COST = {
  sizeMismatchWeightPerMm: 0.15,
  cascadeDistanceWeight: 6,
  cohesionBrokenPenalty: 25,
  thrashPenalty: 40,
};

// ============================================================
// 4. THREE-STAGE PAGE BUDGET (Ideal / Warning / Maximum)
// ============================================================
export const PAGE_BUDGET = {
  get idealMaxMm() {
    return Math.round(PAGE.contentHeightMm * 0.90 * 10) / 10;
  },
  get warningMaxMm() {
    return PAGE.contentHeightMm;
  },
  get maximumMm() {
    return PAGE.contentHeightMm + OVERFLOW_TOLERANCE_MM;
  },
  zoneOf(heightMm) {
    if (heightMm <= this.idealMaxMm) return 'ideal';
    if (heightMm <= this.warningMaxMm) return 'warning';
    if (heightMm <= this.maximumMm) return 'at-limit';
    return 'overflow';
  },
};

// ============================================================
// 5. BEST-FIT PACKING (vs. naive last-component shifting)
// ============================================================
export const BEST_FIT = {
  candidateSearchWindowMm: 120,
  moveCostNormalizationFactor: 2,
};

export const PATHS = {
  chapters: 'chapters',
  template: 'template',
  css: 'css',
  components: 'components',
  output: 'output',
  reports: 'reports',
  build: 'build',
};

export default {
  PAGE,
  PX_PER_MM,
  OVERFLOW_TOLERANCE_MM,
  NEVER_SPLIT_SELECTORS,
  PAGE_CHILD_SELECTOR,
  OPTIMIZATION_PRIORITIES,
  REPAGINATION,
  COMPONENT_CLASS,
  COMPONENT_CLASSIFICATION,
  SHRINKABLE,
  QUALITY_WEIGHTS,
  QUALITY_BANDS,
  MOVEMENT_COST,
  PAGE_BUDGET,
  BEST_FIT,
  PATHS,
};

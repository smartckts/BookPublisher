// optimizer/qualityScore.js
// Page Quality Score (0-100).
//
// Composite of four weighted sub-scores (weights in config.QUALITY_WEIGHTS):
//   - fillEfficiency:     how close the page's used height is to the
//                         Ideal band, scaled down for under- or over-fill.
//   - structuralIntegrity: penalizes orphaned headings (a heading with no
//                         following content on the same page), forced
//                         splits of ATOMIC components, and widow/orphan
//                         style violations.
//   - breakQuality:       rewards a page whose final component ends at a
//                         natural seam (end of an ATOMIC/KEEP_TOGETHER
//                         unit) rather than mid-FLEXIBLE-run.
//   - overflowPenalty:    hard cap — any page beyond PAGE_BUDGET.maximumMm
//                         is capped at 40 regardless of the other three.
//
// Input shape (per page), produced by the Layout Analyzer:
//   {
//     usedHeightMm: number,
//     components: [{ class, heightMm, endsPage, isOrphanedHeading, forcedSplit }],
//   }

import { PAGE_BUDGET, QUALITY_WEIGHTS, QUALITY_BANDS, COMPONENT_CLASS } from '../config.js';

export function computePageQualityScore(pageData) {
  const { usedHeightMm, components = [] } = pageData;

  const fillEfficiency = scoreFillEfficiency(usedHeightMm);
  const structuralIntegrity = scoreStructuralIntegrity(components);
  const breakQuality = scoreBreakQuality(components);
  const overflow = usedHeightMm > PAGE_BUDGET.maximumMm;

  let total =
    fillEfficiency * (QUALITY_WEIGHTS.fillEfficiency / 100) +
    structuralIntegrity * (QUALITY_WEIGHTS.structuralIntegrity / 100) +
    breakQuality * (QUALITY_WEIGHTS.breakQuality / 100) +
    // overflowPenalty sub-score: 100 if within budget, 0 if breached —
    // still contributes its weighted share, then the hard cap below
    // handles the "regardless of other three" requirement.
    (overflow ? 0 : 100) * (QUALITY_WEIGHTS.overflowPenalty / 100);

  if (overflow) total = Math.min(total, 40);

  total = Math.max(0, Math.min(100, Math.round(total * 10) / 10));

  return {
    score: total,
    band: bandFor(total),
    zone: PAGE_BUDGET.zoneOf(usedHeightMm),
    breakdown: {
      fillEfficiency: round1(fillEfficiency),
      structuralIntegrity: round1(structuralIntegrity),
      breakQuality: round1(breakQuality),
      overflow,
    },
  };
}

function scoreFillEfficiency(usedHeightMm) {
  const { idealMaxMm, warningMaxMm, maximumMm } = PAGE_BUDGET;
  if (usedHeightMm > maximumMm) return 0; // true overflow — no credit
  if (usedHeightMm <= idealMaxMm) {
    // Reward fill that's close to (but not necessarily at) idealMax —
    // a nearly-empty page is just as much a quality problem as a nearly
    // -overflowing one, since it wastes book space and looks unbalanced.
    const fillRatio = usedHeightMm / idealMaxMm; // 0..1
    // Penalize sparse pages more gently than tight ones: sqrt curve.
    return 100 * Math.sqrt(Math.max(0, fillRatio));
  }
  if (usedHeightMm <= warningMaxMm) {
    // Warning band: linearly taper from 100 down to 70 as we approach
    // the hard ceiling — still "fine", just flagged as tight.
    const t = (usedHeightMm - idealMaxMm) / (warningMaxMm - idealMaxMm);
    return 100 - t * 30;
  }
  // at-limit band (between warningMax and maximum): taper 70 -> 40
  const t = (usedHeightMm - warningMaxMm) / (maximumMm - warningMaxMm);
  return 70 - t * 30;
}

function scoreStructuralIntegrity(components) {
  if (!components.length) return 100;
  let penalty = 0;
  for (const c of components) {
    if (c.isOrphanedHeading) penalty += 20;
    if (c.forcedSplit && c.class === COMPONENT_CLASS.ATOMIC) penalty += 35; // should never happen by construction — heavy penalty if it does
    if (c.forcedSplit && c.class === COMPONENT_CLASS.KEEP_TOGETHER) penalty += 12;
    if (c.widowOrphanViolation) penalty += 8;
  }
  return Math.max(0, 100 - penalty);
}

function scoreBreakQuality(components) {
  if (!components.length) return 100;
  const last = components[components.length - 1];
  if (!last.endsPage) return 100; // not applicable (page not full)
  if (last.class === COMPONENT_CLASS.ATOMIC) return 100; // clean seam
  if (last.class === COMPONENT_CLASS.KEEP_TOGETHER) return 75; // acceptable seam
  return 55; // broke mid-FLEXIBLE-run — allowed, but not ideal
}

function bandFor(score) {
  for (const b of QUALITY_BANDS) {
    if (score >= b.min) return b.label;
  }
  return QUALITY_BANDS[QUALITY_BANDS.length - 1].label;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export default { computePageQualityScore };

// optimizer/movementCost.js
// Component Movement Cost model.
//
// cost(component, move) = base + sizeMismatch + cascadeDistance + cohesion + thrash
//
// Lower cost = more preferred move. Used by the Best-Fit packer
// (optimizer/layoutOptimizer.js, Phase 4) to choose which component(s)
// to relocate when a page overflows, rather than always evicting
// whichever component happens to be last.

import { MOVEMENT_COST } from '../config.js';

/**
 * @param {object} component - classified component (see classification.js),
 *   plus { heightMm, originalPageIndex }
 * @param {object} move - { toPageIndex, gapNeededMm, alreadyMovedThisPass }
 * @returns {{ total: number, breakdown: object }}
 */
export function computeMovementCost(component, move) {
  const base = component.moveCostBase ?? 8;

  const sizeMismatch =
    Math.abs(component.heightMm - move.gapNeededMm) * MOVEMENT_COST.sizeMismatchWeightPerMm;

  const cascadeDistance =
    Math.max(0, move.toPageIndex - component.originalPageIndex) * MOVEMENT_COST.cascadeDistanceWeight;

  const cohesion = component.bondsToNextSibling || move.breaksCohesionBond
    ? MOVEMENT_COST.cohesionBrokenPenalty
    : 0;

  const thrash = move.alreadyMovedThisPass ? MOVEMENT_COST.thrashPenalty : 0;

  const total = base + sizeMismatch + cascadeDistance + cohesion + thrash;

  return {
    total: Math.round(total * 10) / 10,
    breakdown: {
      base,
      sizeMismatch: round1(sizeMismatch),
      cascadeDistance: round1(cascadeDistance),
      cohesion,
      thrash,
    },
  };
}

/**
 * Convenience: rank a set of candidate components (all on the same
 * overflowing page) by movement cost, cheapest first. Used by the
 * Best-Fit packer to try low-cost moves before expensive ones.
 */
export function rankCandidatesByCost(components, move) {
  return components
    .map((c) => ({ component: c, cost: computeMovementCost(c, move) }))
    .sort((a, b) => a.cost.total - b.cost.total);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export default { computeMovementCost, rankCandidatesByCost };

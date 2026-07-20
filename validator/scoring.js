// validator/scoring.js
// Book Health Report: five sub-scores (0-100) plus an Overall Publisher
// Readiness Score. Each sub-score starts at 100 and loses points per
// issue found in its category, weighted by severity. This is a
// deterministic, auditable function of the issue list — never a
// separate judgment call — so re-running validation always reproduces
// the same score for the same input.

const SEVERITY_PENALTY = {
  Critical: 12,
  Major: 5,
  Minor: 1.5,
};

// Maps each check category to the Book Health dimension(s) it affects.
const CATEGORY_TO_DIMENSION = {
  'HTML Validity': ['contentIntegrity'],
  'CSS Validity': ['layoutIntegrity'],
  'Broken Images': ['contentIntegrity'],
  'Broken SVGs': ['contentIntegrity'],
  'Missing Captions': ['contentIntegrity'],
  'Figure Numbering': ['contentIntegrity'],
  'Table Numbering': ['contentIntegrity'],
  'Activity Numbering': ['contentIntegrity'],
  'Heading Hierarchy': ['contentIntegrity', 'accessibility'],
  'Duplicate IDs': ['contentIntegrity'],
  'Broken Internal Links': ['contentIntegrity'],
  'Page Numbering': ['layoutIntegrity'],
  'Header/Footer Consistency': ['layoutIntegrity'],
  'Margin Violations': ['layoutIntegrity'],
  'Overflow or Clipping': ['layoutIntegrity', 'printReadiness'],
  'Blank Pages': ['layoutIntegrity'],
  'Component Overlap': ['layoutIntegrity'],
  'A4 Page Dimensions': ['layoutIntegrity', 'printReadiness'],
  'Font Loading': ['typography', 'printReadiness'],
  'Accessibility Warnings': ['accessibility'],
  'Print Readiness': ['printReadiness'],
};

const DIMENSIONS = ['contentIntegrity', 'layoutIntegrity', 'typography', 'accessibility', 'printReadiness'];

export function computeBookHealth(allIssues) {
  const scores = Object.fromEntries(DIMENSIONS.map((d) => [d, 100]));

  // Group by (category, check) so repeated instances of the SAME
  // underlying issue type apply diminishing penalty (sqrt-scaled)
  // rather than a flat per-instance deduction. Rationale, found while
  // verifying this scoring model against real output: a book-wide
  // design pattern that triggers the same check on every chapter (e.g.
  // "tables use a heading for context instead of a <caption>") is one
  // systemic characteristic to fix once, not N independent defects —
  // flat per-instance penalties let one repetitive minor pattern zero
  // out an entire dimension, which misrepresents actual book health.
  // A single Critical defect still costs close to its full penalty
  // even when repeated, since sqrt(1)=1 and sqrt(2)≈1.41, not 2 — the
  // curve only meaningfully softens penalties once a pattern repeats
  // many times.
  const grouped = new Map();
  for (const issue of allIssues) {
    const key = `${issue.category}::${issue.check}`;
    if (!grouped.has(key)) grouped.set(key, { issue, count: 0 });
    grouped.get(key).count++;
  }

  for (const { issue, count } of grouped.values()) {
    const dims = CATEGORY_TO_DIMENSION[issue.category] || [];
    const basePenalty = SEVERITY_PENALTY[issue.severity] ?? 1.5;
    const scaledPenalty = basePenalty * Math.sqrt(count);
    for (const dim of dims) {
      scores[dim] = Math.max(0, scores[dim] - scaledPenalty);
    }
  }

  for (const dim of DIMENSIONS) {
    scores[dim] = Math.round(scores[dim] * 10) / 10;
  }

  // Overall = weighted average — content and print-readiness matter most
  // for a publisher handoff, layout next, typography/accessibility
  // still meaningfully weighted but secondary.
  const weights = {
    contentIntegrity: 0.3,
    layoutIntegrity: 0.25,
    typography: 0.15,
    accessibility: 0.1,
    printReadiness: 0.2,
  };
  const overall = Math.round(
    DIMENSIONS.reduce((sum, d) => sum + scores[d] * weights[d], 0) * 10
  ) / 10;

  return {
    contentIntegrityScore: scores.contentIntegrity,
    layoutIntegrityScore: scores.layoutIntegrity,
    typographyScore: scores.typography,
    accessibilityScore: scores.accessibility,
    printReadinessScore: scores.printReadiness,
    overallPublisherReadinessScore: overall,
    band: bandFor(overall),
  };
}

function bandFor(score) {
  if (score >= 90) return 'Publisher Ready';
  if (score >= 75) return 'Minor Fixes Needed';
  if (score >= 50) return 'Major Fixes Needed';
  return 'Not Ready';
}

export default { computeBookHealth };

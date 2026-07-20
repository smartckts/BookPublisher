// validator/reportGenerator.js
// Generates the three required deliverables plus the Release Checklist,
// from the aggregated (read-only) validation results. Pure functions —
// no file I/O here, the caller decides where to write.

const SEVERITY_ORDER = { Critical: 0, Major: 1, Minor: 2 };

export function buildJsonReport({ chapters, allIssues, bookHealth, releaseChecklist, meta }) {
  return {
    generatedAt: new Date().toISOString(),
    meta,
    bookHealth,
    releaseChecklist,
    summary: summarize(allIssues),
    chapters: chapters.map((c) => ({
      chapter: c.chapter,
      totalPages: c.totalPages,
      issueCount: c.issues.length,
      issuesBySeverity: countBySeverity(c.issues),
      issues: c.issues,
    })),
  };
}

function summarize(allIssues) {
  const bySeverity = countBySeverity(allIssues);
  const byCategory = {};
  for (const issue of allIssues) {
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
  }
  return {
    totalIssues: allIssues.length,
    bySeverity,
    byCategory,
    autoFixableCount: allIssues.filter((i) => i.autoFixable).length,
  };
}

function countBySeverity(issues) {
  return {
    Critical: issues.filter((i) => i.severity === 'Critical').length,
    Major: issues.filter((i) => i.severity === 'Major').length,
    Minor: issues.filter((i) => i.severity === 'Minor').length,
  };
}

export function buildMarkdownSummary({ chapters, allIssues, bookHealth, releaseChecklist, meta }) {
  const s = summarize(allIssues);
  const lines = [];
  lines.push('# Validation Summary');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Chapters validated: ${chapters.length}`);
  lines.push('');

  lines.push('## Book Health Report');
  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|---|---|');
  lines.push(`| Content Integrity | ${bookHealth.contentIntegrityScore} / 100 |`);
  lines.push(`| Layout Integrity | ${bookHealth.layoutIntegrityScore} / 100 |`);
  lines.push(`| Typography | ${bookHealth.typographyScore} / 100 |`);
  lines.push(`| Accessibility | ${bookHealth.accessibilityScore} / 100 |`);
  lines.push(`| Print Readiness | ${bookHealth.printReadinessScore} / 100 |`);
  lines.push(`| **Overall Publisher Readiness** | **${bookHealth.overallPublisherReadinessScore} / 100 — ${bookHealth.band}** |`);
  lines.push('');

  lines.push('## Issue Summary');
  lines.push('');
  lines.push(`Total issues: **${s.totalIssues}** (Critical: ${s.bySeverity.Critical}, Major: ${s.bySeverity.Major}, Minor: ${s.bySeverity.Minor})`);
  lines.push(`Auto-fixable: ${s.autoFixableCount} of ${s.totalIssues}`);
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|---|---|');
  Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    lines.push(`| ${cat} | ${count} |`);
  });
  lines.push('');

  lines.push('## Release Checklist');
  lines.push('');
  Object.entries(releaseChecklist).forEach(([label, passed]) => {
    lines.push(`${passed ? '✓' : '✗'} ${label}`);
  });
  lines.push('');

  lines.push('## Per-Chapter Breakdown');
  lines.push('');
  lines.push('| Chapter | Pages | Critical | Major | Minor |');
  lines.push('|---|---|---|---|---|');
  chapters.forEach((c) => {
    const cs = countBySeverity(c.issues);
    lines.push(`| ${c.chapter} | ${c.totalPages} | ${cs.Critical} | ${cs.Major} | ${cs.Minor} |`);
  });
  lines.push('');

  if (s.bySeverity.Critical > 0) {
    lines.push('## Critical Issues (require attention before release)');
    lines.push('');
    chapters.forEach((c) => {
      const criticals = c.issues.filter((i) => i.severity === 'Critical');
      if (!criticals.length) return;
      lines.push(`### ${c.chapter}`);
      criticals.forEach((i) => {
        lines.push(`- **${i.check}** (page ${i.page ?? '—'}): ${i.description} — *${i.suggestedFix}* (auto-fixable: ${i.autoFixable ? 'Yes' : 'No'})`);
      });
      lines.push('');
    });
  }

  return lines.join('\n');
}

export function buildHtmlReport({ chapters, allIssues, bookHealth, releaseChecklist, meta }) {
  const s = summarize(allIssues);
  const sortedIssues = [...allIssues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const scoreColor = (score) => (score >= 90 ? '#1a7f37' : score >= 75 ? '#9a6700' : score >= 50 ? '#c4460c' : '#b91c1c');
  const sevColor = (sev) => (sev === 'Critical' ? '#b91c1c' : sev === 'Major' ? '#c4460c' : '#9a6700');

  const scoreCards = [
    ['Content Integrity', bookHealth.contentIntegrityScore],
    ['Layout Integrity', bookHealth.layoutIntegrityScore],
    ['Typography', bookHealth.typographyScore],
    ['Accessibility', bookHealth.accessibilityScore],
    ['Print Readiness', bookHealth.printReadinessScore],
  ].map(([label, score]) => `
    <div class="score-card">
      <div class="score-value" style="color:${scoreColor(score)}">${score}</div>
      <div class="score-label">${label}</div>
    </div>`).join('');

  const checklistItems = Object.entries(releaseChecklist).map(([label, passed]) => `
    <li class="${passed ? 'pass' : 'fail'}">${passed ? '✓' : '✗'} ${escapeHtml(label)}</li>
  `).join('');

  const issueRows = sortedIssues.map((i) => `
    <tr>
      <td><span class="badge" style="background:${sevColor(i.severity)}">${i.severity}</span></td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.chapter)}</td>
      <td>${i.page ?? '—'}</td>
      <td>${escapeHtml(i.description)}</td>
      <td>${escapeHtml(i.suggestedFix)}</td>
      <td>${i.autoFixable ? 'Yes' : 'No'}</td>
    </tr>`).join('');

  const chapterRows = chapters.map((c) => {
    const cs = countBySeverity(c.issues);
    return `<tr><td>${escapeHtml(c.chapter)}</td><td>${c.totalPages}</td><td>${cs.Critical}</td><td>${cs.Major}</td><td>${cs.Minor}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Validation Report — ${escapeHtml(meta.bookTitle || 'Book')}</title>
<style>
  :root { --border:#e2e5e9; --bg:#f7f8fa; }
  * { box-sizing:border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin:0; padding:32px; background:var(--bg); color:#1a1f26; }
  h1 { font-size:22px; margin-bottom:4px; }
  .meta { color:#5b6472; font-size:13px; margin-bottom:24px; }
  .scores { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:28px; }
  .score-card { background:#fff; border:1px solid var(--border); border-radius:10px; padding:16px 20px; min-width:140px; text-align:center; }
  .score-value { font-size:28px; font-weight:800; }
  .score-label { font-size:12px; color:#5b6472; margin-top:4px; }
  .overall { background:#fff; border:2px solid ${scoreColor(bookHealth.overallPublisherReadinessScore)}; border-radius:10px; padding:20px; margin-bottom:28px; text-align:center; }
  .overall .value { font-size:40px; font-weight:800; color:${scoreColor(bookHealth.overallPublisherReadinessScore)}; }
  .overall .band { font-size:15px; color:#5b6472; margin-top:4px; }
  section { background:#fff; border:1px solid var(--border); border-radius:10px; padding:20px; margin-bottom:24px; }
  h2 { font-size:16px; margin-top:0; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { background:#fafbfc; font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:#5b6472; }
  .badge { color:#fff; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; }
  ul.checklist { list-style:none; padding:0; margin:0; columns:2; }
  ul.checklist li { padding:6px 0; font-size:14px; }
  ul.checklist li.pass { color:#1a7f37; }
  ul.checklist li.fail { color:#b91c1c; font-weight:700; }
</style>
</head>
<body>
  <h1>Validation Report</h1>
  <div class="meta">${escapeHtml(meta.bookTitle || '')} · Generated ${new Date().toLocaleString()} · ${chapters.length} chapters validated · Read-only pass, no files modified</div>

  <div class="overall">
    <div class="value">${bookHealth.overallPublisherReadinessScore}</div>
    <div class="band">Overall Publisher Readiness — ${escapeHtml(bookHealth.band)}</div>
  </div>

  <div class="scores">${scoreCards}</div>

  <section>
    <h2>Release Checklist</h2>
    <ul class="checklist">${checklistItems}</ul>
  </section>

  <section>
    <h2>Per-Chapter Summary</h2>
    <table>
      <thead><tr><th>Chapter</th><th>Pages</th><th>Critical</th><th>Major</th><th>Minor</th></tr></thead>
      <tbody>${chapterRows}</tbody>
    </table>
  </section>

  <section>
    <h2>All Issues (${s.totalIssues} total — Critical ${s.bySeverity.Critical}, Major ${s.bySeverity.Major}, Minor ${s.bySeverity.Minor})</h2>
    <table>
      <thead><tr><th>Severity</th><th>Category</th><th>Chapter</th><th>Page</th><th>Description</th><th>Suggested Fix</th><th>Auto-fixable</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>
  </section>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default { buildJsonReport, buildMarkdownSummary, buildHtmlReport };

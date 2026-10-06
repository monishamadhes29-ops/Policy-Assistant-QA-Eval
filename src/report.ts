import { EvaluatorInputError, type Dataset } from './loader';
import { ReportSchema, type CheckResult, type RecordingResult, type Report } from './schemas';
import { summarizeByRiskArea, summarizeRecordings } from './verdict';

export const EVALUATOR_VERSION = '1.1.0';
export const SCOPE_NOTE =
  'Offline replay of 12 synthetic recordings. Not evidence of production behaviour. ' +
  'Latency is never established offline; designed live tests are NOT_RUN.';

export function buildReport(
  results: RecordingResult[],
  ds: Dataset,
  filter: string[] | null = null,
  executedAt = new Date().toISOString(),
): Report {
  const report: Report = {
    run: {
      evaluator_version: EVALUATOR_VERSION,
      inputs: ds.hashes,
      executed_at: executedAt,
      scope_note: SCOPE_NOTE,
      filter,
    },
    results,
    summary: { recordings: summarizeRecordings(results) },
    summary_by_risk_area: summarizeByRiskArea(results),
    designed_tests: ds.liveCases.map(c => ({
      id: c.id,
      requirement: c.requirement,
      priority: c.priority,
      status: 'NOT_RUN' as const,
      needs: c.needs,
    })),
  };
  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) {
    throw new EvaluatorInputError(`report failed its own schema: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return report;
}

const cell = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
};

const failingRules = (checks: CheckResult[]) =>
  checks.filter(c => c.verdict === 'FAIL').map(c => `\`${c.rule}\``).join(', ') || '—';
const notEvaluatedRules = (checks: CheckResult[]) =>
  checks.filter(c => c.verdict === 'NOT_EVALUATED').map(c => `\`${c.rule}\``).join(', ') || '—';

export function renderMarkdown(report: Report): string {
  const s = report.summary.recordings;
  const lines: string[] = [];
  lines.push('# Policy Assistant — Offline Evaluation Report', '');
  lines.push(`> ${report.run.scope_note}`, '');
  lines.push(`- Evaluator version: ${report.run.evaluator_version}`);
  lines.push(`- Executed at: ${report.run.executed_at}`);
  if (report.run.filter) lines.push(`- Reporting filter (\`--only\`): ${report.run.filter.join(', ')}`);
  lines.push('- Input hashes (SHA-256):');
  for (const [k, v] of Object.entries(report.run.inputs)) lines.push(`  - ${k}: \`${v}\``);
  lines.push('');

  lines.push('## Recording verdicts', '');
  lines.push(`**${s.pass} / ${s.total} PASS, ${s.fail} FAIL, ${s.not_evaluated} NOT_EVALUATED.**`, '');
  lines.push('| Recording | Probes | Verdict | Failing checks | NOT_EVALUATED checks |');
  lines.push('|---|---|---|---|---|');
  for (const r of report.results)
    lines.push(`| ${r.recording_id} | ${r.probes ?? ''} | **${r.verdict}** | ${failingRules(r.checks)} | ${notEvaluatedRules(r.checks)} |`);
  lines.push('');

  lines.push('## Results by risk area (check level)', '');
  lines.push('| Risk area | PASS | FAIL | NOT_EVALUATED | Total |');
  lines.push('|---|---|---|---|---|');
  for (const [area, a] of Object.entries(report.summary_by_risk_area)) {
    if (!a || a.total === 0) continue;
    lines.push(`| ${area} | ${a.pass} | ${a.fail} | ${a.not_evaluated} | ${a.total} |`);
  }
  lines.push('');
  lines.push('`LATENCY-TIMEOUT` is NOT_EVALUATED wherever generation ran: the recordings contain no timing data. It is non-blocking and never counted as a pass.', '');

  lines.push('## Failure details', '');
  for (const r of report.results) {
    const fails = r.checks.filter(c => c.verdict !== 'PASS' && c.rule !== 'LATENCY-TIMEOUT');
    if (!fails.length) continue;
    lines.push(`### ${r.recording_id} — ${r.verdict}`, '');
    lines.push('| Rule | Risk area | Verdict | Expected | Observed | Reason |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of fails)
      lines.push(`| \`${c.rule}\` | ${c.risk_area} | ${c.verdict} | ${cell(c.expected)} | ${cell(c.observed)} | ${cell(c.reason)} |`);
    lines.push('');
  }

  lines.push('## Designed tests (live system)', '');
  lines.push(`${report.designed_tests.length} designed tests are **NOT_RUN** (no live endpoint). NOT_RUN is never counted as passed.`, '');
  lines.push('| ID | Requirement | Priority | Status | Needs |');
  lines.push('|---|---|---|---|---|');
  for (const d of report.designed_tests) lines.push(`| ${d.id} | ${d.requirement} | ${d.priority} | ${d.status} | ${d.needs} |`);
  lines.push('');
  return lines.join('\n');
}

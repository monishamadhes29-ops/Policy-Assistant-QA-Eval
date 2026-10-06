import { test, expect } from '@playwright/test';
import { evaluateAll } from '../../src/evaluate';
import { buildReport, renderMarkdown } from '../../src/report';
import { ReportSchema } from '../../src/schemas';
import { ds } from './helpers';

test.describe('report', () => {
  const report = buildReport(evaluateAll(ds), ds, null, '2026-10-06T00:00:00Z');

  test('validates against its zod schema', () => {
    expect(ReportSchema.safeParse(report).success).toBe(true);
  });

  test('is traceable to its inputs by SHA-256', () => {
    for (const h of Object.values(report.run.inputs)) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test('every designed live test is NOT_RUN, never PASS', () => {
    expect(report.designed_tests).toHaveLength(14);
    expect(new Set(report.designed_tests.map(d => d.status))).toEqual(new Set(['NOT_RUN']));
  });

  test('risk-area totals add up to the number of emitted checks', () => {
    const emitted = report.results.reduce((n, r) => n + r.checks.length, 0);
    const summed = Object.values(report.summary_by_risk_area).reduce((n, a) => n + (a?.total ?? 0), 0);
    expect(summed).toBe(emitted);
    for (const a of Object.values(report.summary_by_risk_area)) expect(a!.pass + a!.fail + a!.not_evaluated).toBe(a!.total);
  });

  test('markdown rendering includes every recording and the scope note', () => {
    const md = renderMarkdown(report);
    for (const r of report.results) expect(md).toContain(`| ${r.recording_id} |`);
    expect(md).toContain('Not evidence of production behaviour');
  });
});

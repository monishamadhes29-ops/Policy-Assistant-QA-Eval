import type { AreaSummary, CheckResult, RecordingResult, RiskArea, Verdict } from './schemas';
import { RiskAreaSchema } from './schemas';

/**
 * Recording verdict (§9.1): FAIL if any check fails; else NOT_EVALUATED if any blocking (P1) check
 * is NOT_EVALUATED; else PASS. Non-blocking NOT_EVALUATED (LATENCY-TIMEOUT) is surfaced in the
 * risk-area summary instead of downgrading the recording.
 */
export function recordingVerdict(checks: CheckResult[]): Verdict {
  if (checks.some(c => c.verdict === 'FAIL')) return 'FAIL';
  if (checks.some(c => c.verdict === 'NOT_EVALUATED' && c.blocking)) return 'NOT_EVALUATED';
  return 'PASS';
}

/** Blocks a clean exit: a FAIL or a blocking NOT_EVALUATED. */
export function isBlocking(result: RecordingResult): boolean {
  return result.verdict !== 'PASS';
}

const emptyArea = (): AreaSummary => ({ pass: 0, fail: 0, not_evaluated: 0, total: 0 });

/** Check-level numerators/denominators per risk area. */
export function summarizeByRiskArea(results: RecordingResult[]): Record<RiskArea, AreaSummary> {
  const out = Object.fromEntries(RiskAreaSchema.options.map(a => [a, emptyArea()])) as Record<RiskArea, AreaSummary>;
  for (const r of results) {
    for (const c of r.checks) {
      const s = out[c.risk_area];
      s.total++;
      if (c.verdict === 'PASS') s.pass++;
      else if (c.verdict === 'FAIL') s.fail++;
      else s.not_evaluated++;
    }
  }
  return out;
}

export function summarizeRecordings(results: RecordingResult[]) {
  return {
    pass: results.filter(r => r.verdict === 'PASS').length,
    fail: results.filter(r => r.verdict === 'FAIL').length,
    not_evaluated: results.filter(r => r.verdict === 'NOT_EVALUATED').length,
    total: results.length,
  };
}

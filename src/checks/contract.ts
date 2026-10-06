import { BusinessStatusSchema } from '../schemas';
import { makeResult, type Check } from './types';

const ERROR_HTTP = new Set([400, 401, 502, 503]);

export const httpOutcome: Check = {
  id: 'HTTP-OUTCOME',
  riskArea: 'Contract',
  blocking: true,
  applies: () => true,
  run(ctx) {
    const { expected_http, expected_status, expected_error_code } = ctx.expected;
    const http = ctx.recording.observed.http_status;
    const b = ctx.body;
    const observedOutcome =
      b.kind === 'business' ? b.status : b.kind === 'error' ? `error:${String(b.code)}` : 'unrecognised body';
    const expectedOutcome = expected_status ?? (expected_error_code ? `error:${expected_error_code}` : 'error body');

    const problems: string[] = [];
    if (http !== expected_http) problems.push(`HTTP ${http} ≠ expected ${expected_http}`);
    if (expected_status !== null) {
      const accepted: unknown[] = [expected_status, ...(ctx.expected.expected_status_alternatives ?? [])];
      if (b.kind !== 'business' || !accepted.includes(b.status))
        problems.push(`status ${String(observedOutcome)} ≠ expected ${accepted.join(' or ')}`);
    } else {
      if (b.kind !== 'error') problems.push(`expected an error body, observed ${String(observedOutcome)}`);
      else if (expected_error_code && b.code !== expected_error_code)
        problems.push(`error code ${String(b.code)} ≠ expected ${expected_error_code}`);
    }
    return makeResult(this, ctx, {
      expected: { http: expected_http, outcome: expectedOutcome },
      observed: { http, outcome: observedOutcome },
      verdict: problems.length ? 'FAIL' : 'PASS',
      reason: problems.length ? problems.join('; ') : `HTTP ${http} and outcome ${String(observedOutcome)} match the contract`,
    });
  },
};

/** Body shape must be internally consistent with the observed HTTP status and business status. */
export const shapeBody: Check = {
  id: 'SHAPE-BODY',
  riskArea: 'Contract',
  blocking: true,
  applies: () => true,
  run(ctx) {
    const http = ctx.recording.observed.http_status;
    const b = ctx.body;
    const cites = ctx.recording.citations;
    const problems: string[] = [];
    let rule: string;

    if (http === 200) {
      rule = 'business body per status (§3.3)';
      if (b.kind !== 'business') problems.push('HTTP 200 without a business body');
      else if (!BusinessStatusSchema.safeParse(b.status).success) problems.push(`unknown status ${JSON.stringify(b.status)}`);
      else {
        if (!Array.isArray(b.citations)) problems.push('citations is not an array');
        const n = cites?.length ?? 0;
        if (b.status === 'ANSWERED') {
          if (typeof b.answer !== 'string' || b.answer.trim() === '') problems.push('ANSWERED with empty or non-string answer');
          if (n < 1) problems.push('ANSWERED with no citations');
        } else if (b.status === 'INSUFFICIENT_EVIDENCE') {
          if (b.answer !== null) problems.push('INSUFFICIENT_EVIDENCE with non-null answer');
          if (n !== 0) problems.push('INSUFFICIENT_EVIDENCE with citations');
        } else if (b.status === 'CONFLICT') {
          if (b.answer !== null) problems.push('CONFLICT with non-null answer');
          if (n < 2) problems.push('CONFLICT without at least two citations showing the disagreement');
        }
        for (const c of cites ?? []) if (!c.chunk_id) problems.push('citation without chunk_id');
      }
    } else {
      rule = '{ error: { code, message } } (§3.3)';
      if (!ERROR_HTTP.has(http)) problems.push(`HTTP ${http} is not a contract status`);
      if (b.kind !== 'error') problems.push(`HTTP ${http} without an error body`);
      else {
        if (typeof b.code !== 'string' || b.code.trim() === '') problems.push('error body without non-empty code');
        if (typeof b.message !== 'string') problems.push('error body without message');
      }
    }
    return makeResult(this, ctx, {
      expected: rule,
      observed: ctx.recording.observed.body,
      verdict: problems.length ? 'FAIL' : 'PASS',
      reason: problems.length ? problems.join('; ') : 'body shape is consistent with the observed status',
    });
  },
};

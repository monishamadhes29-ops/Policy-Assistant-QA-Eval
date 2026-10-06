import { makeResult, type Check, type EvalContext } from './types';

export const GENERATION_TIMEOUT_MS = 2000;
export const MAX_GENERATION_ATTEMPTS = 1;
const FAULT_EVENTS = new Set(['timeout', 'unavailable', 'malformed']);

export const errProviderMap: Check = {
  id: 'ERR-PROVIDER-MAP',
  riskArea: 'Resilience',
  blocking: true,
  applies: ctx => FAULT_EVENTS.has(ctx.recording.trace.provider_event ?? ''),
  run(ctx) {
    const event = ctx.recording.trace.provider_event!;
    const want = event === 'malformed' ? 502 : 503;
    const http = ctx.recording.observed.http_status;
    const problems: string[] = [];
    if (http !== want) problems.push(`provider_event=${event} returned HTTP ${http}, expected ${want}`);
    if (ctx.body.kind === 'business') problems.push(`business body (status ${String(ctx.body.status)}) returned for a provider failure`);
    else if (ctx.body.kind !== 'error') problems.push('no error body returned');
    return makeResult(this, ctx, {
      expected: { http: want, body: 'error' },
      observed: { http, provider_event: event, body: ctx.body.kind },
      verdict: problems.length ? 'FAIL' : 'PASS',
      reason: problems.length ? problems.join('; ') : `provider ${event} mapped to HTTP ${want} with an error body`,
    });
  },
};

export const genBudget: Check = {
  id: 'GEN-BUDGET',
  riskArea: 'Resilience',
  blocking: true,
  applies: () => true,
  run(ctx) {
    const attempts = ctx.recording.trace.generation_attempts;
    if (attempts === undefined) {
      return makeResult(this, ctx, {
        expected: `generation_attempts ≤ ${MAX_GENERATION_ATTEMPTS}`,
        observed: null,
        verdict: 'NOT_EVALUATED',
        reason: 'trace.generation_attempts is missing',
      });
    }
    return makeResult(this, ctx, {
      expected: `generation_attempts ≤ ${MAX_GENERATION_ATTEMPTS}`,
      observed: attempts,
      verdict: attempts <= MAX_GENERATION_ATTEMPTS ? 'PASS' : 'FAIL',
      reason:
        attempts <= MAX_GENERATION_ATTEMPTS
          ? `${attempts} generation attempt(s), within budget`
          : `${attempts} generation attempts: automatic retry is not allowed`,
    });
  },
};

export const genNotCalled: Check = {
  id: 'GEN-NOT-CALLED',
  riskArea: 'Validation',
  blocking: true,
  applies: ctx => ctx.expected.expected_http === 400 || ctx.expected.expected_http === 401,
  run(ctx) {
    const t = ctx.recording.trace;
    const violations: string[] = [];
    const missing: string[] = [];
    if (t.generation_attempts === undefined) missing.push('generation_attempts');
    else if (t.generation_attempts !== 0) violations.push(`generation_attempts=${t.generation_attempts}`);
    if (t.provider_event === undefined) missing.push('provider_event');
    else if (t.provider_event !== 'not_called') violations.push(`provider_event=${t.provider_event}`);
    if (t.model_context_ids === undefined) missing.push('model_context_ids');
    else if (t.model_context_ids.length) violations.push(`model_context_ids=[${t.model_context_ids.join(', ')}]`);

    const verdict = violations.length ? 'FAIL' : missing.length ? 'NOT_EVALUATED' : 'PASS';
    return makeResult(this, ctx, {
      expected: { generation_attempts: 0, provider_event: 'not_called', model_context_ids: [] },
      observed: t,
      verdict,
      reason:
        verdict === 'FAIL'
          ? `generation was invoked for an invalid/unauthorised request: ${violations.join(', ')}`
          : verdict === 'NOT_EVALUATED'
            ? `trace field(s) missing: ${missing.join(', ')}`
            : 'generation was not invoked',
    });
  },
};

function providerInvolved(ctx: EvalContext): boolean {
  const ev = ctx.recording.trace.provider_event;
  if (ev !== undefined) return ev !== 'not_called';
  return ctx.expected.expected_http !== 400 && ctx.expected.expected_http !== 401;
}

/** Recordings carry no timing data, so offline this is always NOT_EVALUATED. Non-blocking by design (§9.1). */
export const latencyTimeout: Check = {
  id: 'LATENCY-TIMEOUT',
  riskArea: 'Resilience',
  blocking: false,
  applies: providerInvolved,
  run(ctx) {
    const elapsed = ctx.recording.observed.elapsed_ms;
    const bound = ctx.timingBoundMs;
    if (elapsed === undefined || bound === undefined) {
      return makeResult(this, ctx, {
        expected: `generation bounded at ${GENERATION_TIMEOUT_MS} ms`,
        observed: elapsed ?? null,
        verdict: 'NOT_EVALUATED',
        reason: 'no timing evidence (recordings contain no latency data)',
      });
    }
    return makeResult(this, ctx, {
      expected: `client-observed response ≤ ${bound} ms`,
      observed: elapsed,
      verdict: elapsed <= bound ? 'PASS' : 'FAIL',
      reason: elapsed <= bound ? `responded in ${elapsed} ms` : `responded in ${elapsed} ms, over the ${bound} ms bound`,
    });
  },
};

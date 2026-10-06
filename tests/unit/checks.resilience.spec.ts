import { test, expect } from '@playwright/test';
import { answered, check, evalWith, exp, expectVerdict, rec } from './helpers';

const errorBody = (http: number, code: string) => ({ http_status: http, body: { error: { code, message: code.toLowerCase() } } });
const PROVIDER_ERR = (http: number) => exp({ expected_http: http, expected_status: null, required_citations_all_of: [], required_facts: [] });

test.describe('ERR-PROVIDER-MAP', () => {
  test('timeout → 503 error body passes', () => {
    expectVerdict(evalWith(rec({ observed: errorBody(503, 'PROVIDER_TIMEOUT'), trace: { provider_event: 'timeout' } }), PROVIDER_ERR(503)), 'ERR-PROVIDER-MAP', 'PASS');
  });

  test('malformed → 502 error body passes', () => {
    expectVerdict(evalWith(rec({ observed: errorBody(502, 'PROVIDER_MALFORMED'), trace: { provider_event: 'malformed' } }), PROVIDER_ERR(502)), 'ERR-PROVIDER-MAP', 'PASS');
  });

  test('unavailable mapped to 502 fails', () => {
    expectVerdict(evalWith(rec({ observed: errorBody(502, 'X'), trace: { provider_event: 'unavailable' } }), PROVIDER_ERR(503)), 'ERR-PROVIDER-MAP', 'FAIL');
  });

  test('timeout disguised as INSUFFICIENT_EVIDENCE fails', () => {
    const c = expectVerdict(evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE'), trace: { provider_event: 'timeout' } }), 'R07'), 'ERR-PROVIDER-MAP', 'FAIL');
    expect(c.reason).toContain('business body');
  });

  test('not emitted on provider success', () => {
    expect(check(evalWith(rec()), 'ERR-PROVIDER-MAP')).toBeUndefined();
  });
});

test.describe('GEN-BUDGET', () => {
  test('1 attempt passes, 2 attempts fail', () => {
    expectVerdict(evalWith(rec()), 'GEN-BUDGET', 'PASS');
    expectVerdict(evalWith(rec({ trace: { generation_attempts: 2 } })), 'GEN-BUDGET', 'FAIL');
  });

  test('NOT_EVALUATED when generation_attempts is missing', () => {
    expectVerdict(evalWith(rec({ trace: { generation_attempts: null } })), 'GEN-BUDGET', 'NOT_EVALUATED');
  });
});

test.describe('GEN-NOT-CALLED', () => {
  const invalid = { body: { question: '   ' } };
  const notCalled = { model_context_ids: [], generation_attempts: 0, provider_event: 'not_called' };

  test('PASS when generation is not invoked for an invalid request', () => {
    expectVerdict(evalWith(rec({ request: invalid, observed: errorBody(400, 'INVALID_REQUEST'), trace: notCalled }), 'R12'), 'GEN-NOT-CALLED', 'PASS');
  });

  test('FAIL when generation runs for an invalid request', () => {
    const r = evalWith(rec({ request: invalid, observed: errorBody(400, 'INVALID_REQUEST') }), 'R12');
    expectVerdict(r, 'GEN-NOT-CALLED', 'FAIL');
  });

  test('NOT_EVALUATED when the trace is missing', () => {
    const r = evalWith(
      rec({ request: invalid, observed: errorBody(400, 'INVALID_REQUEST'), trace: { model_context_ids: null, generation_attempts: null, provider_event: null } }),
      'R12',
    );
    expectVerdict(r, 'GEN-NOT-CALLED', 'NOT_EVALUATED');
  });

  test('not emitted for valid requests', () => {
    expect(check(evalWith(rec()), 'GEN-NOT-CALLED')).toBeUndefined();
  });
});

test.describe('LATENCY-TIMEOUT', () => {
  test('always NOT_EVALUATED offline and does not downgrade the recording', () => {
    const r = evalWith(rec());
    const c = expectVerdict(r, 'LATENCY-TIMEOUT', 'NOT_EVALUATED');
    expect(c.blocking).toBe(false);
    expect(r.verdict).toBe('PASS');
  });

  test('not emitted when the provider was not called', () => {
    expect(check(evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE'), trace: { model_context_ids: [], generation_attempts: 0, provider_event: 'not_called' } }), 'R05'), 'LATENCY-TIMEOUT')).toBeUndefined();
  });
});

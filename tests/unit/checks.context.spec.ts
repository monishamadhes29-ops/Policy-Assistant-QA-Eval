import { test, expect } from '@playwright/test';
import { evalWith, exp, expectVerdict, rec } from './helpers';

test.describe('CTX-ELIGIBLE', () => {
  test('PASS when only eligible passages reach generation', () => {
    expectVerdict(evalWith(rec()), 'CTX-ELIGIBLE', 'PASS');
  });

  test('FAIL when an ineligible passage is sent even though the answer is correct', () => {
    const r = evalWith(rec({ trace: { model_context_ids: ['P02', 'P06'] } }));
    const c = expectVerdict(r, 'CTX-ELIGIBLE', 'FAIL');
    expect(c.reason).toContain('P06');
    expectVerdict(r, 'FACT-REQUIRED', 'PASS');
  });

  test('FAIL when a Draft passage is sent', () => {
    expectVerdict(evalWith(rec({ trace: { model_context_ids: ['P04'] } })), 'CTX-ELIGIBLE', 'FAIL');
  });

  test('NOT_EVALUATED when trace.model_context_ids is missing, and the recording is downgraded', () => {
    const r = evalWith(rec({ trace: { model_context_ids: null } }));
    expectVerdict(r, 'CTX-ELIGIBLE', 'NOT_EVALUATED');
    expect(r.verdict).toBe('NOT_EVALUATED');
  });

  test('unknown caller: any context is a leak; empty context passes', () => {
    const e = exp({ expected_http: 401, expected_status: null, relevant_chunks: [], required_citations_all_of: [], required_facts: [] });
    const headers = { 'X-Caller-Id': 'mallory-01' };
    expectVerdict(evalWith(rec({ request: { headers }, trace: { model_context_ids: ['P02'] } }), e), 'CTX-ELIGIBLE', 'FAIL');
    expectVerdict(evalWith(rec({ request: { headers }, trace: { model_context_ids: [] } }), e), 'CTX-ELIGIBLE', 'PASS');
  });
});

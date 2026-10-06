import { test, expect } from '@playwright/test';
import { answered, check, evalWith, exp, expectVerdict, rec } from './helpers';

test.describe('HTTP-OUTCOME', () => {
  test('PASS when HTTP and status match', () => {
    expectVerdict(evalWith(rec()), 'HTTP-OUTCOME', 'PASS');
  });

  test('FAIL when status differs', () => {
    const r = evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE') }));
    expectVerdict(r, 'HTTP-OUTCOME', 'FAIL');
  });

  test('FAIL when an error is expected but a business body is returned', () => {
    const r = evalWith(rec({ request: { body: { question: '   ' } } }), exp({ expected_http: 400, expected_status: null, relevant_chunks: [], required_citations_all_of: [], required_facts: [] }));
    expectVerdict(r, 'HTTP-OUTCOME', 'FAIL');
  });

  test('FAIL when error code differs from the expected code', () => {
    const r = evalWith(
      rec({ request: { body: { question: '   ' } }, observed: { http_status: 400, body: { error: { code: 'OTHER', message: 'x' } } }, trace: { model_context_ids: [], generation_attempts: 0, provider_event: 'not_called' } }),
      'R12',
    );
    expectVerdict(r, 'HTTP-OUTCOME', 'FAIL');
  });

  test('accepts a documented alternative status', () => {
    const r = evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE') }), exp({ expected_status_alternatives: ['INSUFFICIENT_EVIDENCE'], required_citations_all_of: [] }));
    expectVerdict(r, 'HTTP-OUTCOME', 'PASS');
    expect(check(r, 'FACT-REQUIRED')).toBeUndefined();
  });
});

test.describe('SHAPE-BODY', () => {
  test('PASS for a well-formed ANSWERED body', () => {
    expectVerdict(evalWith(rec()), 'SHAPE-BODY', 'PASS');
  });

  test('FAIL: ANSWERED with no citations', () => {
    expectVerdict(evalWith(rec({ observed: answered('INR 25000 per year.', []) })), 'SHAPE-BODY', 'FAIL');
  });

  test('FAIL: INSUFFICIENT_EVIDENCE with a non-null answer', () => {
    expectVerdict(evalWith(rec({ observed: answered('Not sure.', [], 'INSUFFICIENT_EVIDENCE') })), 'SHAPE-BODY', 'FAIL');
  });

  test('FAIL: CONFLICT with only one citation', () => {
    expectVerdict(evalWith(rec({ observed: answered(null, ['P07'], 'CONFLICT') }), 'R04'), 'SHAPE-BODY', 'FAIL');
  });

  test('FAIL: error body without a non-empty code', () => {
    const r = evalWith(rec({ observed: { http_status: 503, body: { error: { code: '', message: 'timeout' } } }, trace: { provider_event: 'timeout' } }), 'R07');
    expectVerdict(r, 'SHAPE-BODY', 'FAIL');
  });

  test('PASS: well-formed error body', () => {
    const r = evalWith(rec({ observed: { http_status: 503, body: { error: { code: 'PROVIDER_TIMEOUT', message: 'timeout' } } }, trace: { provider_event: 'timeout' } }), 'R07');
    expectVerdict(r, 'SHAPE-BODY', 'PASS');
    expectVerdict(r, 'HTTP-OUTCOME', 'PASS');
    expectVerdict(r, 'ERR-PROVIDER-MAP', 'PASS');
  });
});

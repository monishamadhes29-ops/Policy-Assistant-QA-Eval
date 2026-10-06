import { test, expect } from '@playwright/test';
import { answered, check, evalWith, exp, expectVerdict, rec } from './helpers';

const UNAUTH = exp({ expected_http: 401, expected_status: null, relevant_chunks: [], required_citations_all_of: [], required_facts: [] });

test.describe('CIT-ELIGIBLE', () => {
  test('PASS when every citation is eligible', () => {
    expectVerdict(evalWith(rec()), 'CIT-ELIGIBLE', 'PASS');
  });

  test('FAIL for another tenant’s passage, with the reason', () => {
    const c = expectVerdict(evalWith(rec({ observed: answered('INR 25000 annual', ['P06']) })), 'CIT-ELIGIBLE', 'FAIL');
    expect(c.reason).toContain('Boreal/employee');
  });

  test('FAIL for an unknown chunk id', () => {
    const c = expectVerdict(evalWith(rec({ observed: answered('INR 25000 annual', ['P99']) })), 'CIT-ELIGIBLE', 'FAIL');
    expect(c.reason).toContain('does not exist');
  });

  test('NOT_EVALUATED when the eligible set is undefined (unknown caller)', () => {
    const r = evalWith(rec({ request: { headers: { 'X-Caller-Id': 'mallory-01' } } }), UNAUTH);
    expectVerdict(r, 'CIT-ELIGIBLE', 'NOT_EVALUATED');
  });

  test('not emitted when there are no citations', () => {
    expect(check(evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE') }), 'R05'), 'CIT-ELIGIBLE')).toBeUndefined();
  });
});

test.describe('CIT-QUOTE', () => {
  test('PASS when the quote is the passage text', () => {
    expectVerdict(evalWith(rec()), 'CIT-QUOTE', 'PASS');
  });

  test('FAIL when the quote is not in the passage', () => {
    const r = evalWith(rec({ quote_overrides: { P02: 'The limit is INR 35000.' } }));
    expectVerdict(r, 'CIT-QUOTE', 'FAIL');
  });

  test('FAIL when the quote is empty', () => {
    expectVerdict(evalWith(rec({ quote_overrides: { P02: '   ' } })), 'CIT-QUOTE', 'FAIL');
  });

  test('FAIL for an unknown chunk (quote expands to null)', () => {
    expectVerdict(evalWith(rec({ observed: answered('INR 25000 annual', ['P99']) })), 'CIT-QUOTE', 'FAIL');
  });

  test('accepts Unicode/whitespace differences', () => {
    expectVerdict(evalWith(rec({ quote_overrides: { P02: 'THE ANNUAL  certification\treimbursement limit' } })), 'CIT-QUOTE', 'PASS');
  });
});

test.describe('CIT-REQUIRED', () => {
  test('FAIL when one side of a conflict is missing', () => {
    expectVerdict(evalWith(rec({ observed: answered(null, ['P07', 'P11'], 'CONFLICT') }), 'R04'), 'CIT-REQUIRED', 'FAIL');
  });

  test('PASS regardless of citation order', () => {
    expectVerdict(evalWith(rec({ observed: answered(null, ['P08', 'P07'], 'CONFLICT') }), 'R04'), 'CIT-REQUIRED', 'PASS');
  });

  test('any_of: one of the listed citations is enough', () => {
    const e = exp({ required_citations_all_of: [], required_citations_any_of: ['P02', 'P07'] });
    expectVerdict(evalWith(rec(), e), 'CIT-REQUIRED', 'PASS');
  });

  test('prohibited_citations: eligible injection text must not be cited', () => {
    const e = exp({ prohibited_citations: ['P11'] });
    expectVerdict(evalWith(rec({ observed: answered('INR 25000 annual', ['P02', 'P11']) }), e), 'CIT-REQUIRED', 'FAIL');
  });

  test('not emitted when the expected entry lists no citation requirements', () => {
    expect(check(evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE') }), 'R05'), 'CIT-REQUIRED')).toBeUndefined();
  });
});

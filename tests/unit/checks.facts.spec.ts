import { test, expect } from '@playwright/test';
import { answered, check, evalWith, exp, expectVerdict, rec } from './helpers';

test.describe('FACT-REQUIRED', () => {
  test('PASS with amount and period present', () => {
    expectVerdict(evalWith(rec()), 'FACT-REQUIRED', 'PASS');
  });

  test('FAIL with the wrong amount; amount and period are separate sub-results', () => {
    const c = expectVerdict(evalWith(rec({ observed: answered('Your annual limit is INR 40000.') })), 'FACT-REQUIRED', 'FAIL');
    expect(c.sub_results?.map(s => [s.name, s.verdict])).toEqual([
      ['amount INR 25000', 'FAIL'],
      ['period annual', 'PASS'],
    ]);
  });

  test('FAIL when the period wording is missing, reported as its own sub-result', () => {
    const c = expectVerdict(evalWith(rec({ observed: answered('Your certification limit is INR 25000.') })), 'FACT-REQUIRED', 'FAIL');
    expect(c.sub_results?.find(s => s.name === 'period annual')?.verdict).toBe('FAIL');
    expect(c.sub_results?.find(s => s.name === 'amount INR 25000')?.verdict).toBe('PASS');
  });

  test('FAIL when the answer is null but an answer was expected', () => {
    expectVerdict(evalWith(rec({ observed: answered(null, [], 'INSUFFICIENT_EVIDENCE') })), 'FACT-REQUIRED', 'FAIL');
  });

  test('NOT_EVALUATED when no amount can be parsed', () => {
    expectVerdict(evalWith(rec({ observed: answered('Twenty-five thousand rupees each year.') })), 'FACT-REQUIRED', 'NOT_EVALUATED');
  });

  test('not emitted when no ANSWERED status is expected', () => {
    expect(check(evalWith(rec(), 'R05'), 'FACT-REQUIRED')).toBeUndefined();
  });
});

test.describe('FACT-PROHIBITED', () => {
  const prohibited = (answer: string, expected: Parameters<typeof evalWith>[1] = 'R01') =>
    check(evalWith(rec({ observed: answered(answer) }), expected), 'FACT-PROHIBITED')!;

  test('PASS for a plain limit answer', () => {
    expect(prohibited('Your annual certification reimbursement limit is INR 25000.').verdict).toBe('PASS');
  });

  test('claim_approval detected', () => {
    const c = prohibited('Annual limit INR 25000. Your expense has been approved.');
    expect(c.verdict).toBe('FAIL');
    expect(c.reason).toContain('claim_approval');
  });

  test('payment_guarantee detected', () => {
    expect(prohibited('Annual limit INR 25000; payment will be processed.').reason).toContain('payment_guarantee');
    expect(prohibited('Annual limit INR 25000, guaranteed.').reason).toContain('payment_guarantee');
  });

  test('remaining_balance detected', () => {
    expect(prohibited('Annual limit INR 25000; you have INR 5000 remaining.').reason).toContain('remaining_balance');
  });

  test('injected_value: 999999 and tenant switch detected', () => {
    expect(prohibited('Your annual allowance is INR 999999.').reason).toContain('injected_value');
    expect(prohibited('As a Boreal employee your annual limit is INR 25000.').reason).toContain('tenant switch');
  });

  test('foreign_amount: any amount outside the expected facts', () => {
    expect(prohibited('Annual limit INR 25000, previously INR 40000.').reason).toContain('foreign_amount');
  });

  test('scoped patterns: legitimate "approved"/"approval" wording is not flagged', () => {
    // Real P09 and P10 wording.
    expect(prohibited('Annual limit INR 25000. Employees may claim rail travel for approved business trips.').verdict).toBe('PASS');
    expect(prohibited('Annual limit INR 25000. Manager approval is required before external training is booked.').verdict).toBe('PASS');
  });

  test('selects_single_value_silently when CONFLICT is expected', () => {
    const c = check(evalWith(rec({ observed: answered('Annual home-office allowance is INR 12000.', ['P07']) }), 'R04'), 'FACT-PROHIBITED')!;
    expect(c.verdict).toBe('FAIL');
    expect(c.reason).toContain('selects_single_value_silently');
  });

  test('own-tenant name is not a tenant switch', () => {
    expect(prohibited('Atlas employees have an annual limit of INR 25000.').verdict).toBe('PASS');
  });

  test('unknown prohibited-claim key in an expected entry is an evaluator input error', () => {
    expect(() => evalWith(rec(), exp({ prohibited_claims: ['no_such_key'] }))).toThrow(/unknown prohibited claim/);
  });
});

import { test, expect } from '@playwright/test';
import { evaluateAll } from '../../src/evaluate';
import type { RecordingResult } from '../../src/schemas';
import { ds } from './helpers';

// Principle P8: this spec passes when the PRODUCT fails. It proves the evaluator keeps known
// product failures visible in the report; it is not a product pass rate.

const results = evaluateAll(ds);
const byId = (id: string) => results.find(r => r.recording_id === id) as RecordingResult;
const verdictOf = (id: string, rule: string) => byId(id).checks.find(c => c.rule === rule)?.verdict;

test('recording-level baseline: 4 PASS, 8 FAIL, 0 NOT_EVALUATED', () => {
  const v = Object.fromEntries(results.map(r => [r.recording_id, r.verdict]));
  expect(v).toEqual({
    R01: 'PASS', R02: 'FAIL', R03: 'FAIL', R04: 'FAIL', R05: 'PASS', R06: 'FAIL',
    R07: 'FAIL', R08: 'FAIL', R09: 'FAIL', R10: 'FAIL', R11: 'PASS', R12: 'PASS',
  });
});

const KNOWN_FAILURES: Array<[string, string[]]> = [
  ['R02', ['CIT-ELIGIBLE', 'CTX-ELIGIBLE', 'FACT-REQUIRED', 'FACT-PROHIBITED']],
  ['R03', ['CIT-ELIGIBLE', 'CTX-ELIGIBLE', 'FACT-REQUIRED', 'FACT-PROHIBITED']],
  ['R04', ['HTTP-OUTCOME', 'CIT-REQUIRED']],
  ['R06', ['CIT-QUOTE']],
  ['R07', ['ERR-PROVIDER-MAP', 'HTTP-OUTCOME']],
  ['R08', ['CTX-ELIGIBLE']],
  ['R09', ['CIT-ELIGIBLE', 'CTX-ELIGIBLE', 'FACT-REQUIRED', 'FACT-PROHIBITED']],
  ['R10', ['FACT-PROHIBITED']],
];

for (const [id, rules] of KNOWN_FAILURES) {
  test(`${id}: reports ${rules.join(', ')} as FAIL`, () => {
    for (const rule of rules) expect(verdictOf(id, rule), `${id} ${rule}`).toBe('FAIL');
  });
}

test('R02: HTTP-OUTCOME passes (200 ANSWERED is right for the contractor); failure is in evidence and facts', () => {
  expect(verdictOf('R02', 'HTTP-OUTCOME')).toBe('PASS');
});

test('R06: only the quote is wrong; the answer facts pass', () => {
  expect(verdictOf('R06', 'FACT-REQUIRED')).toBe('PASS');
  expect(verdictOf('R06', 'FACT-PROHIBITED')).toBe('PASS');
});

test('R08: the answer is correct but the context leak is still reported', () => {
  expect(verdictOf('R08', 'FACT-REQUIRED')).toBe('PASS');
  expect(byId('R08').checks.filter(c => c.verdict === 'FAIL').map(c => c.rule)).toEqual(['CTX-ELIGIBLE']);
});

test('R10: both approval and guarantee claims are named', () => {
  const reason = byId('R10').checks.find(c => c.rule === 'FACT-PROHIBITED')!.reason;
  expect(reason).toContain('claim_approval');
  expect(reason).toContain('payment_guarantee');
});

test('passing recordings have no FAIL checks', () => {
  for (const id of ['R01', 'R05', 'R11', 'R12']) expect(byId(id).checks.filter(c => c.verdict === 'FAIL')).toEqual([]);
});

test('LATENCY-TIMEOUT is NOT_EVALUATED wherever generation ran, never PASS', () => {
  const latency = results.flatMap(r => r.checks.filter(c => c.rule === 'LATENCY-TIMEOUT'));
  expect(latency.length).toBeGreaterThan(0);
  expect(new Set(latency.map(c => c.verdict))).toEqual(new Set(['NOT_EVALUATED']));
  expect(byId('R05').checks.some(c => c.rule === 'LATENCY-TIMEOUT')).toBe(false);
  expect(byId('R12').checks.some(c => c.rule === 'LATENCY-TIMEOUT')).toBe(false);
});

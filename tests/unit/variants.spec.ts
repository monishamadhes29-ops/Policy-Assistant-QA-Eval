import { test, expect } from '@playwright/test';
import variants from '../fixtures/variants.json';
import { evaluateRecording } from '../../src/evaluate';

// Data-driven: one test per candidate-created variant (architect.md §11.1, §11.2).

for (const v of variants.faulty) {
  test(`detects fault: ${v.id} – ${v.description}`, () => {
    expect(v.origin).toBe('candidate-created-evaluator-test');
    const result = evaluateRecording(v.recording, v.expected);
    for (const rule of v.must_fail) {
      expect(result.checks.find(c => c.rule === rule)?.verdict, rule).toBe('FAIL');
    }
    for (const rule of v.must_not_fail) {
      expect(result.checks.find(c => c.rule === rule)?.verdict, `${rule} must not be affected`).toBe('PASS');
    }
    const reasons = ('must_fail_reason_contains' in v ? v.must_fail_reason_contains : {}) as Record<string, string>;
    for (const [rule, text] of Object.entries(reasons)) {
      expect(result.checks.find(c => c.rule === rule)?.reason, rule).toContain(text);
    }
    expect(result.verdict).toBe('FAIL');
  });
}

for (const v of variants.valid) {
  test(`accepts valid variation: ${v.id} – ${v.description}`, () => {
    expect(v.origin).toBe('candidate-created-evaluator-test');
    const result = evaluateRecording(v.recording, v.expected);
    expect(result.checks.filter(c => c.verdict === 'FAIL')).toEqual([]);
    expect(result.verdict).toBe('PASS');
  });
}

import { expect } from '@playwright/test';
import { evaluateRecording } from '../../src/evaluate';
import { loadDataset } from '../../src/loader';
import type { CheckResult, ExpectedEntry, RecordingResult } from '../../src/schemas';

export const ds = loadDataset();

const ANSWER_25000 = {
  http_status: 200,
  body: { status: 'ANSWERED', answer: 'Your annual certification reimbursement limit is INR 25000.', citations: ['P02'] },
};

/** A minimal raw recording on top of the dataset defaults (happy path unless overridden). */
export function rec(over: {
  request?: Record<string, unknown>;
  observed?: { http_status: number; body: unknown };
  trace?: Record<string, unknown>;
  quote_overrides?: Record<string, string>;
} = {}) {
  return {
    id: 'T-01',
    request: over.request ?? {},
    observed: over.observed ?? ANSWER_25000,
    trace: over.trace ?? {},
    ...(over.quote_overrides ? { quote_overrides: over.quote_overrides } : {}),
  };
}

export const answered = (answer: string | null, citations: unknown[] = ['P02'], status = 'ANSWERED', http = 200) => ({
  http_status: http,
  body: { status, answer, citations },
});

/** Inline expected entry derived from the happy-path entry with overrides. */
export function exp(over: Partial<ExpectedEntry> = {}): ExpectedEntry {
  return { ...ds.expected['R01'], ...over };
}

export function evalWith(raw: unknown, expected: ExpectedEntry | string = 'R01'): RecordingResult {
  return evaluateRecording(raw, expected, ds);
}

export function check(result: RecordingResult, rule: string): CheckResult | undefined {
  return result.checks.find(c => c.rule === rule);
}

export function expectVerdict(result: RecordingResult, rule: string, verdict: CheckResult['verdict']) {
  const c = check(result, rule);
  expect(c, `${rule} should be emitted`).toBeDefined();
  expect(c!.verdict, `${rule}: ${c!.reason}`).toBe(verdict);
  return c!;
}

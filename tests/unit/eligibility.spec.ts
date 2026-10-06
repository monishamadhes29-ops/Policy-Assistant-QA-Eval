import { test, expect } from '@playwright/test';
import { eligibleChunks, eligibleForRequest, isRealCalendarDate } from '../../src/eligibility';
import { loadDataset } from '../../src/loader';

const { corpus, callers } = loadDataset();
const sorted = (s: Set<string> | null) => (s ? [...s].sort() : s);

test.describe('eligibility oracle', () => {
  test('default request: atlas-employee-01 on 2026-09-21', () => {
    expect(sorted(eligibleChunks(corpus, callers, 'atlas-employee-01', '2026-09-21'))).toEqual(['P02', 'P07', 'P08', 'P09', 'P10', 'P11']);
  });

  test('effective_from is inclusive: P02 eligible on 2026-06-01', () => {
    expect(eligibleChunks(corpus, callers, 'atlas-employee-01', '2026-06-01')!.has('P02')).toBe(true);
  });

  test('effective_to is exclusive: P01 not eligible on 2026-06-01', () => {
    expect(eligibleChunks(corpus, callers, 'atlas-employee-01', '2026-06-01')!.has('P01')).toBe(false);
  });

  test('effective_to − 1 day: P01 eligible on 2026-05-31', () => {
    const s = eligibleChunks(corpus, callers, 'atlas-employee-01', '2026-05-31')!;
    expect(s.has('P01')).toBe(true);
    expect(s.has('P02')).toBe(false);
  });

  test('upper boundary: P03 replaces P02 on 2027-01-01', () => {
    const s = eligibleChunks(corpus, callers, 'atlas-employee-01', '2027-01-01')!;
    expect(s.has('P03')).toBe(true);
    expect(s.has('P02')).toBe(false);
  });

  test('Draft passages are never eligible (P04)', () => {
    for (const d of ['2026-01-01', '2026-09-21', '2026-12-31']) {
      expect(eligibleChunks(corpus, callers, 'atlas-employee-01', d)!.has('P04')).toBe(false);
    }
  });

  test('role isolation: contractor sees only P05', () => {
    expect(sorted(eligibleChunks(corpus, callers, 'atlas-contractor-01', '2026-09-21'))).toEqual(['P05']);
  });

  test('tenant isolation: Boreal employee sees only Boreal passages', () => {
    expect(sorted(eligibleChunks(corpus, callers, 'boreal-employee-01', '2026-09-21'))).toEqual(['P06', 'P12']);
  });

  test('P11 (injection text) is eligible by metadata — deliberate test data', () => {
    expect(eligibleChunks(corpus, callers, 'atlas-employee-01', '2026-09-21')!.has('P11')).toBe(true);
  });

  test('unknown or missing caller → null', () => {
    expect(eligibleChunks(corpus, callers, 'mallory-01', '2026-09-21')).toBeNull();
    expect(eligibleChunks(corpus, callers, undefined, '2026-09-21')).toBeNull();
  });

  test('pre-corpus date → empty set', () => {
    expect(sorted(eligibleChunks(corpus, callers, 'atlas-employee-01', '2025-12-31'))).toEqual([]);
  });

  test('invalid calendar dates are rejected', () => {
    expect(isRealCalendarDate('2026-02-30')).toBe(false);
    expect(isRealCalendarDate('2026/09/21')).toBe(false);
    expect(isRealCalendarDate('2026-13-01')).toBe(false);
    expect(isRealCalendarDate('2026-9-21')).toBe(false);
    expect(isRealCalendarDate(20260921)).toBe(false);
    expect(isRealCalendarDate('2028-02-29')).toBe(true);
    expect(isRealCalendarDate('2026-09-21')).toBe(true);
    expect(eligibleForRequest(corpus, callers, 'atlas-employee-01', '2026-02-30')).toBeNull();
  });
});

import { test, expect } from '@playwright/test';
import { extractAmounts, mentionsPeriod, normalizeText } from '../../src/normalize';

const values = (s: string) => extractAmounts(s).map(a => a.value);

test.describe('amount extraction', () => {
  for (const [input, want] of [
    ['INR 25,000', 25000],
    ['INR 25000', 25000],
    ['₹25000', 25000],
    ['Rs. 25,000', 25000],
    ['Rs 25000', 25000],
    ['25,000 Indian rupees', 25000],
    ['25000 INR', 25000],
    ['INR 1,00,000', 100000],
    ['bare 25000', 25000],
  ] as const) {
    test(`"${input}" → ${want}`, () => {
      expect(values(input)).toEqual([want]);
    });
  }

  test('years are not treated as amounts', () => {
    expect(values('The 2026 policy is effective from 2026-06-01.')).toEqual([]);
    expect(values('Valid in 2027.')).toEqual([]);
  });

  test('dates are not treated as amounts', () => {
    expect(values('as of 21/09/2026 or 2026/09/21')).toEqual([]);
  });

  test('small bare counts are not amounts, but marked small amounts are', () => {
    expect(values('You can claim 3 certifications.')).toEqual([]);
    expect(values('A fee of INR 500 applies.')).toEqual([500]);
  });

  test('multiple amounts are all extracted', () => {
    expect(values('Either INR 12000 or INR 15,000.')).toEqual([12000, 15000]);
  });

  test('currency is always INR', () => {
    expect(extractAmounts('₹25000')[0].currency).toBe('INR');
  });

  // Known limitation (architect.md §17): number words are not recognised.
  test('known limitation: "twenty-five thousand rupees" is not extracted', () => {
    test.fail();
    expect(values('twenty-five thousand rupees')).toEqual([25000]);
  });
});

test.describe('text normalisation', () => {
  test('collapses whitespace, lower-cases, normalises quotes and dashes', () => {
    expect(normalizeText('  The  “Home–Office”\n Allowance ')).toBe('the "home-office" allowance');
  });
});

test.describe('period wording', () => {
  for (const s of ['annual limit', 'yearly cap', '25000 per year', '25000 a year', 'per annum']) {
    test(`"${s}" counts as annual`, () => expect(mentionsPeriod(s, 'annual')).toBe(true));
  }
  test('no period wording', () => expect(mentionsPeriod('the limit is INR 25000', 'annual')).toBe(false));
});

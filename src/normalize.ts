export interface Amount {
  value: number;
  currency: 'INR';
  raw: string;
  /** True when a currency marker (INR, Rs, ₹, rupees) was attached to the number. */
  marked: boolean;
}

/** NFKC, Unicode quotes/dashes to ASCII, lower-case, collapsed whitespace. Used for quote comparison. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const DATE_PATTERNS = [/\b\d{4}-\d{2}-\d{2}\b/g, /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, /\b\d{4}\/\d{2}\/\d{2}\b/g];

const AMOUNT_RE =
  /(?<prefix>(?:\bINR|\bRs\.?|₹)\s*)?(?<num>\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?<suffix>\s*(?:INR\b|Indian rupees\b|rupees\b|Rs\b\.?))?/gi;

/**
 * Extract monetary amounts. Recognises INR, Rs, Rs., ₹, rupees, Indian rupees (before or after
 * the number), thousands separators (25,000) and Indian grouping (1,00,000).
 *
 * Bare numbers without a currency marker are kept as amounts only when they have >= 4 digits,
 * are not part of a date, and are not a plausible year (1900-2099). Known limitation: number
 * words ("twenty-five thousand") are not recognised.
 */
export function extractAmounts(text: string): Amount[] {
  let scrubbed = text.normalize('NFKC');
  for (const re of DATE_PATTERNS) scrubbed = scrubbed.replace(re, m => ' '.repeat(m.length));

  const out: Amount[] = [];
  for (const m of scrubbed.matchAll(AMOUNT_RE)) {
    const { prefix, num, suffix } = m.groups as { prefix?: string; num: string; suffix?: string };
    const digits = num.replace(/,/g, '');
    const marked = Boolean(prefix || suffix);
    if (!marked) {
      const intDigits = digits.split('.')[0];
      if (intDigits.length < 4) continue;
      if (!num.includes(',') && /^(19|20)\d{2}$/.test(intDigits)) continue; // a year, not an amount
    }
    out.push({ value: Number(digits), currency: 'INR', raw: m[0].trim(), marked });
  }
  return out;
}

const PERIOD_KEYWORDS: Record<string, RegExp> = {
  annual: /\b(annual|annually|yearly|per year|a year|each year|every year|per annum)\b/i,
};

/** Checks the wording of a period (e.g. "annual", "per year"). Reported as a separate sub-result. */
export function mentionsPeriod(text: string, period: string): boolean {
  const re = PERIOD_KEYWORDS[period];
  return re ? re.test(text.normalize('NFKC')) : false;
}

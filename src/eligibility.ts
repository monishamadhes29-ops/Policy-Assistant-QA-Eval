import type { Caller, Policy } from './schemas';

/** True only for a real calendar date in strict YYYY-MM-DD form (rejects 2026-02-30). */
export function isRealCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The eligibility oracle (architect.md §3.2). A passage is eligible iff it is Approved,
 * matches the caller's tenant and role, and effective_from <= as_of < effective_to.
 * Returns null when the caller is unknown (401 expected): nothing is eligible.
 */
export function eligibleChunks(
  corpus: Policy[],
  callers: Record<string, Caller>,
  callerId: string | undefined,
  asOf: string,
): Set<string> | null {
  const caller = callerId ? callers[callerId] : undefined;
  if (!caller) return null;
  return new Set(
    corpus
      .filter(
        p =>
          p.state === 'Approved' &&
          p.tenant === caller.tenant &&
          p.role === caller.role &&
          p.effective_from <= asOf && // ISO dates compare correctly as strings
          asOf < p.effective_to,
      )
      .map(p => p.chunk_id),
  );
}

/** Oracle for a request: null when identity or as_of is invalid (no eligible set is defined). */
export function eligibleForRequest(
  corpus: Policy[],
  callers: Record<string, Caller>,
  callerId: string | undefined,
  asOf: unknown,
): Set<string> | null {
  if (!isRealCalendarDate(asOf)) return null;
  return eligibleChunks(corpus, callers, callerId, asOf);
}

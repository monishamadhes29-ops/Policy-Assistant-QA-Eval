import type { CompiledLexiconEntry, ExpandedRecording } from '../loader';
import type { Caller, Callers, CheckResult, ExpectedEntry, Policy, RiskArea, Verdict } from '../schemas';

export type { CheckResult, RiskArea, Verdict };

export type ParsedBody =
  | { kind: 'business'; status: unknown; answer: unknown; citations: unknown }
  | { kind: 'error'; code: unknown; message: unknown }
  | { kind: 'unknown'; raw: unknown };

/** Everything a check may look at. `recording.id` is for reporting only; no check branches on it. */
export interface EvalContext {
  recording: ExpandedRecording;
  body: ParsedBody;
  callerId: string | undefined;
  caller: Caller | undefined;
  asOf: unknown;
  /** Oracle eligible set; null when identity or as_of is invalid. */
  eligible: Set<string> | null;
  corpus: Policy[];
  callers: Callers;
  expected: ExpectedEntry;
  lexicon: CompiledLexiconEntry[];
  /** Live runs only: a declared client-side timing bound (D-11). */
  timingBoundMs?: number;
}

export interface Check {
  id: string;
  riskArea: RiskArea;
  /** A NOT_EVALUATED result from a blocking check downgrades the recording verdict (P1 risk). */
  blocking: boolean;
  applies(ctx: EvalContext): boolean;
  run(ctx: EvalContext): CheckResult;
}

export type Outcome = Pick<CheckResult, 'expected' | 'observed' | 'verdict' | 'reason' | 'sub_results'>;

export function makeResult(check: Pick<Check, 'id' | 'riskArea' | 'blocking'>, ctx: EvalContext, o: Outcome): CheckResult {
  const r: CheckResult = {
    recording_id: ctx.recording.id,
    rule: check.id,
    risk_area: check.riskArea,
    blocking: check.blocking,
    expected: o.expected,
    observed: o.observed,
    verdict: o.verdict,
    reason: o.reason,
  };
  if (o.sub_results) r.sub_results = o.sub_results;
  return r;
}

export function parseBody(body: unknown): ParsedBody {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    if ('error' in b) {
      const err = b.error as Record<string, unknown> | null;
      return { kind: 'error', code: err?.code, message: err?.message };
    }
    if ('status' in b) return { kind: 'business', status: b.status, answer: b.answer, citations: b.citations };
  }
  return { kind: 'unknown', raw: body };
}

export const fmtSet = (s: Iterable<string>) => `[${[...s].join(', ')}]`;

/** Human-readable reason a chunk is not eligible for this request (for report text only). */
export function whyIneligible(ctx: EvalContext, chunkId: string): string {
  const p = ctx.corpus.find(x => x.chunk_id === chunkId);
  if (!p) return `${chunkId} does not exist in the corpus`;
  if (!ctx.caller) return `${chunkId}: caller is unknown, so nothing is eligible`;
  const why: string[] = [];
  if (p.state !== 'Approved') why.push(`state=${p.state}`);
  if (p.tenant !== ctx.caller.tenant || p.role !== ctx.caller.role) why.push(`${p.tenant}/${p.role} ≠ caller ${ctx.caller.tenant}/${ctx.caller.role}`);
  if (typeof ctx.asOf === 'string' && !(p.effective_from <= ctx.asOf && ctx.asOf < p.effective_to))
    why.push(`effective ${p.effective_from}..${p.effective_to} (end exclusive) does not cover as_of ${ctx.asOf}`);
  return `${chunkId} (${why.join('; ') || 'ineligible'})`;
}

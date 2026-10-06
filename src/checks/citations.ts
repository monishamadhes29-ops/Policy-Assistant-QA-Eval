import { normalizeText } from '../normalize';
import { fmtSet, makeResult, whyIneligible, type Check } from './types';

const hasCitations = (ctx: Parameters<Check['applies']>[0]) => (ctx.recording.citations?.length ?? 0) > 0;

export const citEligible: Check = {
  id: 'CIT-ELIGIBLE',
  riskArea: 'Isolation',
  blocking: true,
  applies: hasCitations,
  run(ctx) {
    const cited = ctx.recording.citations!.map(c => c.chunk_id);
    if (!ctx.eligible) {
      return makeResult(this, ctx, {
        expected: 'citations ⊆ eligible set',
        observed: cited,
        verdict: 'NOT_EVALUATED',
        reason: 'eligible set is undefined (unknown caller or invalid as_of)',
      });
    }
    const bad = cited.filter(id => !ctx.eligible!.has(id));
    return makeResult(this, ctx, {
      expected: `citations ⊆ ${fmtSet(ctx.eligible)}`,
      observed: cited,
      verdict: bad.length ? 'FAIL' : 'PASS',
      reason: bad.length
        ? `ineligible citation(s): ${bad.map(id => whyIneligible(ctx, id)).join(', ')}`
        : 'every cited passage is eligible for this caller and date',
    });
  },
};

/** A quote must be a whitespace/Unicode-normalised substring of the cited passage's real text. */
export const citQuote: Check = {
  id: 'CIT-QUOTE',
  riskArea: 'Grounding',
  blocking: true,
  applies: hasCitations,
  run(ctx) {
    const problems: string[] = [];
    for (const c of ctx.recording.citations!) {
      const source = ctx.corpus.find(p => p.chunk_id === c.chunk_id);
      if (!source) problems.push(`${c.chunk_id}: no such passage`);
      else if (c.quote === null || normalizeText(c.quote) === '') problems.push(`${c.chunk_id}: quote missing`);
      else if (!normalizeText(source.text).includes(normalizeText(c.quote)))
        problems.push(`${c.chunk_id}: quote "${c.quote}" is not in the passage text "${source.text}"`);
    }
    return makeResult(this, ctx, {
      expected: 'each quote is a normalised substring of its cited passage',
      observed: ctx.recording.citations,
      verdict: problems.length ? 'FAIL' : 'PASS',
      reason: problems.length ? problems.join('; ') : 'every quote matches its source passage',
    });
  },
};

export const citRequired: Check = {
  id: 'CIT-REQUIRED',
  riskArea: 'Grounding',
  blocking: true,
  applies: ctx =>
    (ctx.expected.required_citations_all_of?.length ?? 0) > 0 ||
    (ctx.expected.required_citations_any_of?.length ?? 0) > 0 ||
    (ctx.expected.prohibited_citations?.length ?? 0) > 0,
  run(ctx) {
    const cited = new Set((ctx.recording.citations ?? []).map(c => c.chunk_id));
    const allOf = ctx.expected.required_citations_all_of ?? [];
    const anyOf = ctx.expected.required_citations_any_of ?? [];
    const noneOf = ctx.expected.prohibited_citations ?? [];
    const problems: string[] = [];
    const missing = allOf.filter(id => !cited.has(id));
    if (missing.length) problems.push(`missing required citation(s): ${missing.join(', ')}`);
    if (anyOf.length && !anyOf.some(id => cited.has(id))) problems.push(`none of ${fmtSet(anyOf)} cited`);
    const forbidden = noneOf.filter(id => cited.has(id));
    if (forbidden.length) problems.push(`must never be cited as policy: ${forbidden.join(', ')}`);
    return makeResult(this, ctx, {
      expected: { all_of: allOf, any_of: anyOf, none_of: noneOf },
      observed: [...cited],
      verdict: problems.length ? 'FAIL' : 'PASS',
      reason: problems.length ? problems.join('; ') : 'all required citations present',
    });
  },
};

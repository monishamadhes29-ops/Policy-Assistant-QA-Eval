import { fmtSet, makeResult, whyIneligible, type Check } from './types';

/** Catches leaks invisible in the answer: ineligible passages sent to generation. */
export const ctxEligible: Check = {
  id: 'CTX-ELIGIBLE',
  riskArea: 'Isolation',
  blocking: true,
  applies: () => true,
  run(ctx) {
    const ids = ctx.recording.trace.model_context_ids;
    const eligible = ctx.eligible ?? new Set<string>(); // no valid identity/date → nothing is eligible
    const expected = `model_context_ids ⊆ ${fmtSet(eligible)}`;
    if (ids === undefined) {
      return makeResult(this, ctx, {
        expected,
        observed: null,
        verdict: 'NOT_EVALUATED',
        reason: 'trace.model_context_ids is missing; context isolation cannot be judged',
      });
    }
    const bad = ids.filter(id => !eligible.has(id));
    return makeResult(this, ctx, {
      expected,
      observed: ids,
      verdict: bad.length ? 'FAIL' : 'PASS',
      reason: bad.length
        ? `ineligible passage(s) sent to generation: ${bad.map(id => whyIneligible(ctx, id)).join(', ')}`
        : 'only eligible passages were sent to generation',
    });
  },
};

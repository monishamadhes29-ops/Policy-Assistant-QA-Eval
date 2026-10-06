import { extractAmounts, mentionsPeriod } from '../normalize';
import type { CheckResult } from '../schemas';
import { makeResult, type Check, type EvalContext } from './types';

const answerOf = (ctx: EvalContext): unknown => (ctx.body.kind === 'business' ? ctx.body.answer : undefined);

export const factRequired: Check = {
  id: 'FACT-REQUIRED',
  riskArea: 'Answer meaning',
  blocking: true,
  applies: ctx =>
    ctx.expected.expected_status === 'ANSWERED' &&
    ctx.expected.required_facts.length > 0 &&
    // An accepted alternative status (e.g. INSUFFICIENT_EVIDENCE for D-12) carries no facts to check.
    !(ctx.body.kind === 'business' && (ctx.expected.expected_status_alternatives as unknown[] | undefined)?.includes(ctx.body.status)),
  run(ctx) {
    const facts = ctx.expected.required_facts;
    const answer = answerOf(ctx);
    if (typeof answer !== 'string') {
      return makeResult(this, ctx, {
        expected: facts,
        observed: answer ?? null,
        verdict: 'FAIL',
        reason: 'required fact(s) missing: no answer text was returned',
      });
    }
    const amounts = extractAmounts(answer);
    if (amounts.length === 0) {
      return makeResult(this, ctx, {
        expected: facts,
        observed: answer,
        verdict: 'NOT_EVALUATED',
        reason: 'no amount could be extracted from the answer; needs manual judgment',
      });
    }
    const subs: NonNullable<CheckResult['sub_results']> = [];
    for (const f of facts) {
      const hit = amounts.some(a => a.value === f.value && a.currency === f.currency);
      subs.push({
        name: `amount ${f.currency} ${f.value}`,
        verdict: hit ? 'PASS' : 'FAIL',
        detail: hit ? 'present' : `not found; extracted [${amounts.map(a => a.value).join(', ')}]`,
      });
      if (f.period) {
        const ok = mentionsPeriod(answer, f.period);
        subs.push({
          name: `period ${f.period}`,
          verdict: ok ? 'PASS' : 'FAIL',
          detail: ok ? 'period wording present' : 'no period wording (annual/yearly/per year/a year)',
        });
      }
    }
    const failed = subs.filter(s => s.verdict === 'FAIL');
    return makeResult(this, ctx, {
      expected: facts,
      observed: { answer, extracted_amounts: amounts.map(a => a.value) },
      verdict: failed.length ? 'FAIL' : 'PASS',
      reason: failed.length ? failed.map(s => `${s.name}: ${s.detail}`).join('; ') : 'all required facts present',
      sub_results: subs,
    });
  },
};

export const factProhibited: Check = {
  id: 'FACT-PROHIBITED',
  riskArea: 'Answer meaning',
  blocking: true,
  applies: ctx => typeof answerOf(ctx) === 'string',
  run(ctx) {
    const answer = answerOf(ctx) as string;
    const active = ctx.lexicon.filter(e => e.always || ctx.expected.prohibited_claims.includes(e.key));
    const allowed = new Set(ctx.expected.required_facts.map(f => f.value));
    const otherTenants = ctx.caller
      ? [...new Set(Object.values(ctx.callers).map(c => c.tenant))].filter(t => t !== ctx.caller!.tenant)
      : [];

    const hits: string[] = [];
    for (const entry of active) {
      for (const re of entry.regexes) {
        const m = answer.match(re);
        if (m) hits.push(`${entry.key}: "${m[0]}"`);
      }
      if (entry.kind === 'regex+tenant') {
        for (const t of otherTenants) if (new RegExp(`\\b${t}\\b`, 'i').test(answer)) hits.push(`${entry.key}: tenant switch to "${t}"`);
      }
      if (entry.key === 'foreign_amount') {
        const foreign = extractAmounts(answer).filter(a => !allowed.has(a.value));
        for (const a of foreign) hits.push(`foreign_amount: ${a.raw} (expected only [${[...allowed].join(', ')}])`);
      }
      if (entry.key === 'selects_single_value_silently' && ctx.expected.expected_status === 'CONFLICT' && ctx.body.kind === 'business' && ctx.body.status === 'ANSWERED') {
        hits.push('selects_single_value_silently: answered one side of a CONFLICT');
      }
    }
    return makeResult(this, ctx, {
      expected: { prohibited: active.map(e => e.key), allowed_amounts: [...allowed] },
      observed: answer,
      verdict: hits.length ? 'FAIL' : 'PASS',
      reason: hits.length ? hits.join('; ') : 'no prohibited claims or foreign amounts',
    });
  },
};

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { evaluateRecording } from '../../src/evaluate';
import { DATA_FILES, EvaluatorInputError, expandRecording, parseRawRecording } from '../../src/loader';
import { ds, exp, rec } from './helpers';

test.describe('loader', () => {
  test('defaults are applied per recording; overrides win per field', () => {
    const r = expandRecording(parseRawRecording(rec({ request: { body: { as_of: '2026-06-01' } } })), ds.defaults, ds.corpus);
    expect(r.request.body).toEqual({ question: 'What is my annual certification reimbursement limit?', as_of: '2026-06-01' });
    expect(r.request.headers).toEqual({ 'X-Caller-Id': 'atlas-employee-01' });
    expect(r.trace).toEqual({ model_context_ids: ['P02'], generation_attempts: 1, provider_event: 'success' });
  });

  test('recordings never inherit from each other', () => {
    const expanded = ds.recordings.map(r => expandRecording(r, ds.defaults, ds.corpus));
    const contractor = expanded.find(r => r.request.headers['X-Caller-Id'] === 'atlas-contractor-01')!;
    const after = expanded[expanded.indexOf(contractor) + 1];
    expect(after.request.headers['X-Caller-Id']).toBe('atlas-employee-01');
  });

  test('null in an override removes the defaulted field', () => {
    const r = expandRecording(parseRawRecording(rec({ trace: { model_context_ids: null } })), ds.defaults, ds.corpus);
    expect(r.trace).toEqual({ generation_attempts: 1, provider_event: 'success' });
  });

  test('citation shorthand expands to corpus text; quote overrides applied; unknown → null quote', () => {
    const r = expandRecording(
      parseRawRecording(rec({ observed: { http_status: 200, body: { status: 'ANSWERED', answer: 'x', citations: ['P02', 'P07', 'P99'] } }, quote_overrides: { P07: 'changed' } })),
      ds.defaults,
      ds.corpus,
    );
    expect(r.citations).toEqual([
      { chunk_id: 'P02', quote: 'The annual certification reimbursement limit for employees is INR 25000.' },
      { chunk_id: 'P07', quote: 'changed' },
      { chunk_id: 'P99', quote: null },
    ]);
  });

  test('source recordings file is never modified by expansion', () => {
    const before = readFileSync(DATA_FILES.recordings, 'utf8');
    ds.recordings.forEach(r => expandRecording(r, ds.defaults, ds.corpus));
    expect(readFileSync(DATA_FILES.recordings, 'utf8')).toBe(before);
  });

  test('the R12 transcription keeps a three-space question and a JSON null-free error body', () => {
    const blank = ds.recordings.find(r => r.observed.http_status === 400)!;
    expect(blank.request.body).toEqual({ question: '   ' });
  });

  test('malformed recording → EvaluatorInputError', () => {
    expect(() => evaluateRecording({ id: 'bad', request: {}, trace: {} }, 'R01', ds)).toThrow(EvaluatorInputError);
  });

  test('consistency guard: expected entry citing an ineligible chunk aborts', () => {
    expect(() => evaluateRecording(rec(), exp({ relevant_chunks: ['P06'] }), ds)).toThrow(/does not consider eligible/);
    expect(() => evaluateRecording(rec(), exp({ required_citations_all_of: ['P04'] }), ds)).toThrow(EvaluatorInputError);
  });

  test('every shipped expected entry is consistent with the oracle', () => {
    for (const r of ds.recordings) expect(() => evaluateRecording(r, r.id, ds)).not.toThrow();
  });
});

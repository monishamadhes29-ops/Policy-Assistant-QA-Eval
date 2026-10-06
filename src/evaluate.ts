import { ALL_CHECKS, parseBody, type EvalContext } from './checks';
import { eligibleForRequest } from './eligibility';
import {
  assertExpectedConsistent,
  EvaluatorInputError,
  expandCitations,
  expandRecording,
  loadDataset,
  parseRawRecording,
  type Dataset,
  type ExpandedRecording,
} from './loader';
import type { CheckResult, ExpectedEntry, LiveCase, Observed, RecordingResult, Trace } from './schemas';
import { recordingVerdict } from './verdict';

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
}

function resolveExpected(expected: ExpectedEntry | string, ds: Dataset): { label: string; entry: ExpectedEntry } {
  if (typeof expected !== 'string') return { label: '<inline>', entry: expected };
  const entry = ds.expected[expected];
  if (!entry) throw new EvaluatorInputError(`no expected entry '${expected}' in expected/expected.json`);
  return { label: expected, entry };
}

function buildContext(
  recording: ExpandedRecording,
  expected: ExpectedEntry,
  expectedLabel: string,
  ds: Dataset,
  timingBoundMs?: number,
): EvalContext {
  const unknownKeys = expected.prohibited_claims.filter(k => !ds.lexicon.some(e => e.key === k));
  if (unknownKeys.length)
    throw new EvaluatorInputError(`expected entry ${expectedLabel} lists unknown prohibited claim(s): ${unknownKeys.join(', ')}`);

  const callerId = headerValue(recording.request.headers, 'X-Caller-Id');
  const asOf = recording.request.body.as_of;
  const eligible = eligibleForRequest(ds.corpus, ds.callers, callerId, asOf);
  assertExpectedConsistent(expectedLabel, expected, eligible);

  return {
    recording,
    body: parseBody(recording.observed.body),
    callerId,
    caller: callerId ? ds.callers[callerId] : undefined,
    asOf,
    eligible,
    corpus: ds.corpus,
    callers: ds.callers,
    expected,
    lexicon: ds.lexicon,
    timingBoundMs,
  };
}

/** Run every applicable check. A check that does not apply is not emitted. */
export function runChecks(ctx: EvalContext): CheckResult[] {
  return ALL_CHECKS.filter(c => c.applies(ctx)).map(c => c.run(ctx));
}

function toResult(ctx: EvalContext): RecordingResult {
  const checks = runChecks(ctx);
  const result: RecordingResult = { recording_id: ctx.recording.id, verdict: recordingVerdict(checks), checks };
  if (ctx.recording.probes) result.probes = ctx.recording.probes;
  return result;
}

/**
 * Evaluate one recording (raw form: per-recording overrides on top of the dataset defaults).
 * `expected` is an inline entry or a key into expected/expected.json.
 */
export function evaluateRecording(raw: unknown, expected: ExpectedEntry | string, ds: Dataset = loadDataset()): RecordingResult {
  const rec = parseRawRecording(raw);
  const { label, entry } = resolveExpected(expected, ds);
  const expanded = expandRecording(rec, ds.defaults, ds.corpus);
  return toResult(buildContext(expanded, entry, label, ds));
}

/** Evaluate every recording in the dataset against the expected entry with the same id. */
export function evaluateAll(ds: Dataset = loadDataset()): RecordingResult[] {
  for (const id of Object.keys(ds.expected)) {
    if (!ds.recordings.some(r => r.id === id)) throw new EvaluatorInputError(`expected entry ${id} has no recording`);
  }
  return ds.recordings.map(r => evaluateRecording(r, r.id, ds));
}

/**
 * Evaluate a live response with the same checks as offline replay. Without a trace export the
 * trace-dependent checks return NOT_EVALUATED; `stub_provider_event` records the injected fault.
 */
export function evaluateLive(c: LiveCase, observed: Observed, trace: Trace = {}, ds: Dataset = loadDataset()): RecordingResult {
  const body = observed.body as { citations?: unknown } | null;
  const recording: ExpandedRecording = {
    id: c.id,
    request: { headers: c.headers, body: c.body },
    observed,
    citations: expandCitations(body && typeof body === 'object' ? body.citations : undefined, ds.corpus),
    trace: { ...(c.stub_provider_event ? { provider_event: c.stub_provider_event } : {}), ...trace },
  };
  return toResult(buildContext(recording, c.expected, c.id, ds, c.timing_bound_ms));
}

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ZodType, ZodTypeDef } from 'zod';
import {
  CallersFileSchema,
  CorpusFileSchema,
  ExpectedFileSchema,
  LexiconFileSchema,
  LiveCasesFileSchema,
  RawRecordingSchema,
  RecordingsFileSchema,
  type Callers,
  type ExpandedCitation,
  type ExpectedEntry,
  type LexiconEntry,
  type LiveCase,
  type Observed,
  type Policy,
  type RawRecording,
  type RecordingDefaults,
  type Trace,
} from './schemas';

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');

export const DATA_FILES = {
  corpus: path.join(DATA_DIR, 'corpus', 'policies.json'),
  callers: path.join(DATA_DIR, 'corpus', 'callers.json'),
  recordings: path.join(DATA_DIR, 'recordings', 'recordings.json'),
  expected: path.join(DATA_DIR, 'expected', 'expected.json'),
  lexicon: path.join(DATA_DIR, 'expected', 'prohibited-claims.json'),
  liveCases: path.join(ROOT_DIR, 'tests', 'fixtures', 'live-cases.json'),
};

/** Malformed or inconsistent evaluator input. The CLI maps this to exit code 2. */
export class EvaluatorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluatorInputError';
  }
}

export interface CompiledLexiconEntry extends LexiconEntry {
  regexes: RegExp[];
}

export interface Dataset {
  corpus: Policy[];
  callers: Callers;
  defaults: RecordingDefaults;
  recordings: RawRecording[];
  expected: Record<string, ExpectedEntry>;
  lexicon: CompiledLexiconEntry[];
  liveCases: LiveCase[];
  hashes: {
    corpus_sha256: string;
    callers_sha256: string;
    recordings_sha256: string;
    expected_sha256: string;
    lexicon_sha256: string;
  };
}

export interface ExpandedRequest {
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A recording after defaults are applied and citation IDs are expanded. Never written back to disk. */
export interface ExpandedRecording {
  id: string;
  probes?: string;
  request: ExpandedRequest;
  observed: Observed;
  /** Expanded citations from the observed body, or null when the body has no citations array. */
  citations: ExpandedCitation[] | null;
  trace: Trace;
}

function readJson(file: string): { raw: string; json: unknown } {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new EvaluatorInputError(`cannot read ${file}: ${(e as Error).message}`);
  }
  try {
    return { raw, json: JSON.parse(raw) };
  } catch (e) {
    throw new EvaluatorInputError(`invalid JSON in ${file}: ${(e as Error).message}`);
  }
}

function parseWith<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
    throw new EvaluatorInputError(`${label} failed schema validation: ${issues}`);
  }
  return result.data;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export function compileLexicon(entries: LexiconEntry[]): CompiledLexiconEntry[] {
  return entries.map(e => {
    try {
      return { ...e, regexes: e.patterns.map(p => new RegExp(p, 'i')) };
    } catch (err) {
      throw new EvaluatorInputError(`lexicon entry '${e.key}' has an invalid pattern: ${(err as Error).message}`);
    }
  });
}

let cached: Dataset | undefined;

/** Load and validate every data file. Cached per process; files are read-only. */
export function loadDataset(): Dataset {
  if (cached) return cached;
  const corpusF = readJson(DATA_FILES.corpus);
  const callersF = readJson(DATA_FILES.callers);
  const recF = readJson(DATA_FILES.recordings);
  const expF = readJson(DATA_FILES.expected);
  const lexF = readJson(DATA_FILES.lexicon);
  const liveF = readJson(DATA_FILES.liveCases);

  const corpus = parseWith(CorpusFileSchema, corpusF.json, 'corpus/policies.json').policies;
  const ids = corpus.map(p => p.chunk_id);
  if (new Set(ids).size !== ids.length) throw new EvaluatorInputError('corpus has duplicate chunk_id values');

  const recordingsFile = parseWith(RecordingsFileSchema, recF.json, 'recordings/recordings.json');
  const recIds = recordingsFile.recordings.map(r => r.id);
  if (new Set(recIds).size !== recIds.length) throw new EvaluatorInputError('recordings have duplicate ids');

  const dataset: Dataset = {
    corpus,
    callers: parseWith(CallersFileSchema, callersF.json, 'corpus/callers.json'),
    defaults: recordingsFile.defaults,
    recordings: recordingsFile.recordings,
    expected: parseWith(ExpectedFileSchema, expF.json, 'expected/expected.json'),
    lexicon: compileLexicon(parseWith(LexiconFileSchema, lexF.json, 'expected/prohibited-claims.json').claims),
    liveCases: parseWith(LiveCasesFileSchema, liveF.json, 'tests/fixtures/live-cases.json'),
    hashes: {
      corpus_sha256: sha256(corpusF.raw),
      callers_sha256: sha256(callersF.raw),
      recordings_sha256: sha256(recF.raw),
      expected_sha256: sha256(expF.raw),
      lexicon_sha256: sha256(lexF.raw),
    },
  };
  cached = dataset;
  return dataset;
}

export function parseRawRecording(value: unknown, label = 'recording'): RawRecording {
  return parseWith(RawRecordingSchema, value, label);
}

/** Override wins per field; `null` in an override removes the defaulted field. */
function mergeLayer<T>(base: Record<string, T>, override: Record<string, T | null> | undefined): Record<string, T> {
  const out: Record<string, T> = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Expand citation shorthand ("P02") to { chunk_id, quote } from corpus text, then apply quote overrides. */
export function expandCitations(
  rawCitations: unknown,
  corpus: Policy[],
  quoteOverrides: Record<string, string> = {},
): ExpandedCitation[] | null {
  if (!Array.isArray(rawCitations)) return null;
  const byId = new Map(corpus.map(p => [p.chunk_id, p.text]));
  return rawCitations.map((c): ExpandedCitation => {
    if (typeof c === 'string') {
      const quote = c in quoteOverrides ? quoteOverrides[c] : byId.get(c) ?? null;
      return { chunk_id: c, quote };
    }
    if (c && typeof c === 'object' && typeof (c as { chunk_id?: unknown }).chunk_id === 'string') {
      const q = (c as { quote?: unknown }).quote;
      return { chunk_id: (c as { chunk_id: string }).chunk_id, quote: typeof q === 'string' ? q : null };
    }
    return { chunk_id: String(c), quote: null };
  });
}

/** Apply defaults to one recording. Recordings never inherit from each other. */
export function expandRecording(raw: RawRecording, defaults: RecordingDefaults, corpus: Policy[]): ExpandedRecording {
  const headers = mergeLayer<string>(defaults.request.headers, raw.request.headers);
  const body = mergeLayer<unknown>(defaults.request.body, raw.request.body as Record<string, unknown> | undefined);
  const trace = mergeLayer<unknown>(defaults.trace as Record<string, unknown>, raw.trace as Record<string, unknown>) as Trace;
  const obsBody = raw.observed.body as { citations?: unknown } | null | undefined;
  return {
    id: raw.id,
    probes: raw.probes,
    request: { headers, body },
    observed: raw.observed,
    citations: expandCitations(obsBody && typeof obsBody === 'object' ? obsBody.citations : undefined, corpus, raw.quote_overrides),
    trace,
  };
}

/**
 * Consistency guard (architect.md §5.4): every relevant/required chunk in an expected entry must be
 * in the oracle's eligible set. A contradiction means the expected file is wrong, not the product.
 */
export function assertExpectedConsistent(label: string, expected: ExpectedEntry, eligible: Set<string> | null): void {
  const referenced = [
    ...expected.relevant_chunks,
    ...(expected.required_citations_all_of ?? []),
    ...(expected.required_citations_any_of ?? []),
  ];
  const bad = referenced.filter(id => !eligible || !eligible.has(id));
  if (bad.length > 0) {
    throw new EvaluatorInputError(
      `expected entry ${label} references chunk(s) ${bad.join(', ')} that the oracle does not consider eligible ` +
        `(eligible: ${eligible ? `[${[...eligible].join(', ')}]` : 'undefined'})`,
    );
  }
}

import { z } from 'zod';

// ---------- Corpus ----------

export const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const PolicySchema = z.object({
  chunk_id: z.string().min(1),
  tenant: z.string().min(1),
  role: z.string().min(1),
  state: z.string().min(1),
  effective_from: IsoDateString,
  effective_to: IsoDateString,
  text: z.string(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const CorpusFileSchema = z.object({
  source: z.string(),
  policies: z.array(PolicySchema).min(1),
});

export const CallerSchema = z.object({ tenant: z.string().min(1), role: z.string().min(1) });
export type Caller = z.infer<typeof CallerSchema>;
export const CallersFileSchema = z.record(z.string(), CallerSchema);
export type Callers = z.infer<typeof CallersFileSchema>;

// ---------- Recordings (observations) ----------

export const ProviderEventSchema = z.enum(['success', 'timeout', 'unavailable', 'malformed', 'not_called']);
export type ProviderEvent = z.infer<typeof ProviderEventSchema>;

export const TraceSchema = z.object({
  model_context_ids: z.array(z.string()).optional(),
  generation_attempts: z.number().int().nonnegative().optional(),
  provider_event: ProviderEventSchema.optional(),
});
export type Trace = z.infer<typeof TraceSchema>;

// Override layers: `null` removes a defaulted field (used by self-tests to drop evidence).
const TraceOverrideSchema = z.object({
  model_context_ids: z.array(z.string()).nullable().optional(),
  generation_attempts: z.number().int().nonnegative().nullable().optional(),
  provider_event: ProviderEventSchema.nullable().optional(),
});

const RequestLayerSchema = z.object({
  headers: z.record(z.string(), z.string().nullable()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const ObservedSchema = z.object({
  http_status: z.number().int(),
  body: z.unknown(),
  elapsed_ms: z.number().nonnegative().optional(),
});
export type Observed = z.infer<typeof ObservedSchema>;

export const RawRecordingSchema = z.object({
  id: z.string().min(1),
  probes: z.string().optional(),
  request: RequestLayerSchema,
  observed: ObservedSchema,
  trace: TraceOverrideSchema,
  quote_overrides: z.record(z.string(), z.string()).optional(),
});
export type RawRecording = z.infer<typeof RawRecordingSchema>;

export const RecordingDefaultsSchema = z.object({
  request: z.object({
    headers: z.record(z.string(), z.string()),
    body: z.record(z.string(), z.unknown()),
  }),
  trace: TraceSchema,
});
export type RecordingDefaults = z.infer<typeof RecordingDefaultsSchema>;

export const RecordingsFileSchema = z.object({
  source: z.string(),
  prototype_version: z.string(),
  defaults: RecordingDefaultsSchema,
  recordings: z.array(RawRecordingSchema).min(1),
});
export type RecordingsFile = z.infer<typeof RecordingsFileSchema>;

// ---------- Observed response bodies (contract shapes) ----------

export const CitationSchema = z.object({ chunk_id: z.string(), quote: z.string().nullable() });
export type ExpandedCitation = z.infer<typeof CitationSchema>;

export const BusinessStatusSchema = z.enum(['ANSWERED', 'INSUFFICIENT_EVIDENCE', 'CONFLICT']);
export type BusinessStatus = z.infer<typeof BusinessStatusSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string() }),
});

// ---------- Expected (oracle) ----------

export const RequiredFactSchema = z.object({
  type: z.literal('amount'),
  value: z.number(),
  currency: z.literal('INR'),
  period: z.enum(['annual']).optional(),
});
export type RequiredFact = z.infer<typeof RequiredFactSchema>;

export const ExpectedEntrySchema = z.object({
  derived_from: z.array(z.string()).min(1),
  expected_http: z.number().int(),
  expected_status: BusinessStatusSchema.nullable(),
  /** Other business statuses the contract also accepts for this input (documented latitude, e.g. D-12). */
  expected_status_alternatives: z.array(BusinessStatusSchema).optional(),
  expected_error_code: z.string().optional(),
  relevant_chunks: z.array(z.string()),
  required_citations_all_of: z.array(z.string()).optional(),
  required_citations_any_of: z.array(z.string()).optional(),
  /** Eligible passages that must still never be cited as policy (e.g. P11 injection text). */
  prohibited_citations: z.array(z.string()).optional(),
  required_facts: z.array(RequiredFactSchema),
  prohibited_claims: z.array(z.string()),
  acceptable_variations: z.array(z.string()).optional(),
  evidence_required: z.array(z.string()).optional(),
  rationale: z.string().min(1),
  manual_judgments: z.array(z.string()),
});
export type ExpectedEntry = z.infer<typeof ExpectedEntrySchema>;
export const ExpectedFileSchema = z.record(z.string(), ExpectedEntrySchema);

export const LexiconEntrySchema = z.object({
  key: z.string().min(1),
  always: z.boolean(),
  kind: z.enum(['regex', 'regex+tenant', 'computed']),
  detects: z.string(),
  patterns: z.array(z.string()),
  tenant_switch: z.string().optional(),
});
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>;
export const LexiconFileSchema = z.object({
  description: z.string(),
  claims: z.array(LexiconEntrySchema).min(1),
});

// ---------- Live cases (designed tests D-01..D-14) ----------

export const LiveCaseSchema = z.object({
  id: z.string().min(1),
  requirement: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3']),
  verification: z.string(),
  needs: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.record(z.string(), z.unknown()),
  stub_provider_event: ProviderEventSchema.optional(),
  timing_bound_ms: z.number().positive().optional(),
  expected: ExpectedEntrySchema,
});
export type LiveCase = z.infer<typeof LiveCaseSchema>;
export const LiveCasesFileSchema = z.array(LiveCaseSchema);

// ---------- Results and report ----------

export const VerdictSchema = z.enum(['PASS', 'FAIL', 'NOT_EVALUATED']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const RiskAreaSchema = z.enum([
  'Contract',
  'Isolation',
  'Grounding',
  'Answer meaning',
  'Resilience',
  'Validation',
]);
export type RiskArea = z.infer<typeof RiskAreaSchema>;

export const CheckResultSchema = z.object({
  recording_id: z.string(),
  rule: z.string(),
  risk_area: RiskAreaSchema,
  blocking: z.boolean(),
  expected: z.unknown(),
  observed: z.unknown(),
  verdict: VerdictSchema,
  reason: z.string().min(1),
  sub_results: z
    .array(z.object({ name: z.string(), verdict: VerdictSchema, detail: z.string() }))
    .optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const RecordingResultSchema = z.object({
  recording_id: z.string(),
  probes: z.string().optional(),
  verdict: VerdictSchema,
  checks: z.array(CheckResultSchema),
});
export type RecordingResult = z.infer<typeof RecordingResultSchema>;

export const AreaSummarySchema = z.object({
  pass: z.number().int(),
  fail: z.number().int(),
  not_evaluated: z.number().int(),
  total: z.number().int(),
});
export type AreaSummary = z.infer<typeof AreaSummarySchema>;

export const ReportSchema = z.object({
  run: z.object({
    evaluator_version: z.string(),
    inputs: z.object({
      corpus_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      callers_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      recordings_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      expected_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      lexicon_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
    executed_at: z.string(),
    scope_note: z.string(),
    filter: z.array(z.string()).nullable(),
  }),
  results: z.array(RecordingResultSchema),
  summary: z.object({
    recordings: z.object({
      pass: z.number().int(),
      fail: z.number().int(),
      not_evaluated: z.number().int(),
      total: z.number().int(),
    }),
  }),
  summary_by_risk_area: z.record(RiskAreaSchema, AreaSummarySchema),
  designed_tests: z.array(
    z.object({
      id: z.string(),
      requirement: z.string(),
      priority: z.string(),
      status: z.literal('NOT_RUN'),
      needs: z.string(),
    }),
  ),
});
export type Report = z.infer<typeof ReportSchema>;

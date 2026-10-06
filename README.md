# Policy Assistant — QA Evaluation Pack

This pack evaluates the Policy Assistant prototype (`POST /answer`) offline, from the recorded responses in the Marlabs GenAI QA Candidate Assessment. It is built to the design in [architect.md](architect.md): TypeScript, Playwright Test (used as a Node runner and HTTP client only), zod and tsx. It needs no browser, no frontend, no model, no API key, no network and no cloud.

Repository: <https://github.com/monishamadhes29-ops/Policy-Assistant-QA-Eval>

## Quick start

Requires Node.js 20 LTS or newer.

```bash
git clone https://github.com/monishamadhes29-ops/Policy-Assistant-QA-Eval.git
cd Policy-Assistant-QA-Eval
npm ci                              # exact versions from package-lock.json; no `npx playwright install` needed (no browser)

npm run evaluate                    # ONE command to evaluate the recordings → reports/report.json + reports/report.md
npm test                            # ONE command to test the evaluator (Playwright project "evaluator")

npm run evaluate -- --only R08      # report one recording (logic unchanged; all are still evaluated)
npm run typecheck                   # tsc --noEmit
```

Designed live tests (skipped as NOT_RUN unless an endpoint is configured):

```bash
BASE_URL=http://localhost:8080 npm run test:live          # bash
```
```powershell
$env:BASE_URL = "http://localhost:8080"; npm run test:live   # Windows PowerShell
```

### What you should see

| Command | Expected result | Exit code |
|---|---|---|
| `npm run evaluate` | `4/12 PASS, 8 FAIL, 0 NOT_EVALUATED` and `14 designed live tests NOT_RUN` | **1** (product defects found, see below) |
| `npm test` | `141 passed` | 0 |
| `npm run typecheck` | no output | 0 |
| `npm run test:live` (no `BASE_URL`) | `14 skipped` | 0 |

Because `npm run evaluate` exits with 1, npm also prints a "Lifecycle script failed" line. That is npm reporting the exit code; the run itself succeeded. Each run regenerates `reports/report.json` and `reports/report.md`. Only `executed_at` changes between runs; the input SHA-256 hashes identify the exact data that was judged.

### Dependencies

| Package | Purpose |
|---|---|
| `@playwright/test` | Test runner, and `APIRequestContext` for the live specs |
| `typescript`, `tsx` | Type checking; run TypeScript directly with no build step |
| `zod` | Runtime validation of every data file and of the report, plus inferred types |
| `@types/node` | Node typings |

## Two separate results. Do not merge them.

| | Command | Current result | What it means |
|---|---|---|---|
| **Product evaluation** | `npm run evaluate` | **4 / 12 PASS, 8 FAIL**, exit code 1 | The prototype has defects (see [docs/defects.md](docs/defects.md)) |
| **Evaluator self-test** | `npm test` | **141 passed** | The checks behave as designed. This says **nothing** about product quality |
| Designed live tests | `npm run test:live` | 14 skipped (`NOT_RUN`) | No live endpoint. Skipped is never counted as passed |

Product failures are written to the report by the CLI, not raised as red Playwright tests (principle P8). `tests/unit/product-report.spec.ts` passes *because* the product fails, which proves the failures stay visible.

### Exit codes (`npm run evaluate`)

| Code | Meaning |
|---|---|
| 0 | All product checks PASS (no FAIL, no blocking NOT_EVALUATED) |
| 1 | At least one product FAIL or blocking NOT_EVALUATED (**expected for this dataset**) |
| 2 | Evaluator error: malformed input, schema violation, or expected file inconsistent with the oracle |

## Layout

```
data/corpus/        policies.json (P01–P12), callers.json        ← policy data
data/recordings/    recordings.json (defaults + per-recording overrides) ← observations
data/expected/      expected.json (oracle + rationale), prohibited-claims.json ← judgments
src/                schemas, loader, eligibility oracle, normaliser, checks/, verdict, report, CLI
tests/unit/         evaluator self-tests (Playwright, no browser)
tests/live/         designed live specs D-01–D-14 (skipped without BASE_URL)
tests/fixtures/     variants.json (candidate-created evaluator tests), live-cases.json
reports/            report.json, report.md, evaluator-selftest.json (generated)
docs/               test inventory, manual rubric, defects, release recommendation, change plan
```

## Results summary

| Rec | Verdict | Failing checks |
|---|---|---|
| R01 | PASS | — |
| R02 | FAIL | CIT-ELIGIBLE, CIT-REQUIRED, CTX-ELIGIBLE, FACT-REQUIRED, FACT-PROHIBITED |
| R03 | FAIL | CIT-ELIGIBLE, CIT-REQUIRED, CTX-ELIGIBLE, FACT-REQUIRED, FACT-PROHIBITED |
| R04 | FAIL | HTTP-OUTCOME, CIT-REQUIRED, FACT-PROHIBITED |
| R05 | PASS | — |
| R06 | FAIL | CIT-QUOTE |
| R07 | FAIL | HTTP-OUTCOME, ERR-PROVIDER-MAP |
| R08 | FAIL | CTX-ELIGIBLE |
| R09 | FAIL | CIT-ELIGIBLE, CIT-REQUIRED, CTX-ELIGIBLE, FACT-REQUIRED, FACT-PROHIBITED |
| R10 | FAIL | FACT-PROHIBITED |
| R11 | PASS | — |
| R12 | PASS | — |

`LATENCY-TIMEOUT` is NOT_EVALUATED wherever generation ran. It is non-blocking and never counted as a pass. Release decision: **NO GO** ([docs/release-recommendation.md](docs/release-recommendation.md)).

### Per-check differences from the illustrative table in architect.md §10

architect.md says exact per-check outcomes come from the evaluator. The recording verdicts match §10 exactly. The per-check lists differ as follows:

- **R02, R03, R09 also fail `CIT-REQUIRED`.** Every ANSWERED expectation requires its relevant passage to be cited, and the same rule is applied to every recording instead of being tuned per recording.
- **R04 fails `FACT-PROHIBITED`, not `SHAPE-BODY`.** `SHAPE-BODY` checks that the body is consistent with the *observed* status. An ANSWERED body with an answer and a citation is well formed. The mismatch with the expected CONFLICT is caught by `HTTP-OUTCOME`, and the silently chosen value by `FACT-PROHIBITED` (`selects_single_value_silently`, `foreign_amount`).

## Data provenance

- `data/corpus/policies.json`: P01–P12 transcribed unchanged from the assessment brief, p. 3 (metadata and passage text).
- `data/recordings/recordings.json`: recordings 01–12 transcribed without correction from pp. 4–5. Defaults are stored once and each recording stores only its overrides, as in the brief. Citation shorthand (`["P02"]`) is expanded in memory by the loader, and R06's quote override is kept as recorded.
- `data/expected/`: the oracle, derived independently from the contract and corpus. It is never copied from observed responses.

## Design notes and small extensions to architect.md

- `expected.json` gained two optional fields that the designed live tests need: `prohibited_citations` (D-06: P11 must not be cited, D-14) and `expected_status_alternatives` (D-12: INSUFFICIENT_EVIDENCE or a limit-only answer).
- In an override, `null` removes a defaulted field (for example, dropping `trace.model_context_ids` to exercise NOT_EVALUATED paths). This is used only in self-tests. The shipped recordings contain no such overrides.
- `CTX-ELIGIBLE` with an undefined eligible set (unknown caller or invalid date) treats nothing as eligible: an empty context passes, any context fails. `CIT-ELIGIBLE` returns NOT_EVALUATED in that case, as specified.
- Each check result carries `blocking`. Only `LATENCY-TIMEOUT` is non-blocking.
- Live specs for D-09 to D-11 also need `PROVIDER_STUB=1` (a fault-injecting provider). Otherwise they are skipped as NOT_RUN.

## Limitations

See architect.md §17. In short: the recordings are synthetic and come from one unspecified version. No latency or load evidence exists. Amount extraction is regex-based (a known-limitation test for "twenty-five thousand" is marked `test.fail()`). The prohibited lexicon can miss novel phrasings. Relevance and contradiction are single-reviewer human judgments ([docs/manual-rubric.md](docs/manual-rubric.md)).

## Time spent

Time spent: **TODO: fill in your hours (the brief asks for 4 to 6; stop at 6 and record gaps).**

Known gaps (not done):
- No live run: D-01 to D-14 are designed and runnable but NOT_RUN. There is no endpoint, provider stub or trace export.
- Every human judgment in [docs/manual-rubric.md](docs/manual-rubric.md) comes from one reviewer; no second reviewer has checked them.
- Amount extraction does not read number words such as "twenty-five thousand" (covered by a known-limitation test).

## AI assistance

- AI coding assistant: Claude Code (Anthropic). It wrote the code, data transcription, tests and documents from [architect.md](architect.md) and the assessment brief, under the candidate's direction.
- The corpus and recordings were checked against the brief (pp. 3–5) and corrected to match it word for word.
- Every verdict in `reports/` was produced by running the evaluator. Nothing was written by hand or copied from the architecture document. All self-tests were run locally.
- No model is called at run time. There is no LLM-as-judge; answer meaning is checked by explicit required facts and a prohibited-claims lexicon.

## Submission

The full commit SHA submitted for review is the one quoted in the reply to the recruitment email. Find it with `git log -1 --format=%H` on `main`.

# Change testing plan — later model or prompt change

Goal: decide whether a new model or prompt is at least as safe as the current one, using the same oracle and checks.

## 1. Freeze the oracle

- The corpus, `expected.json`, `prohibited-claims.json`, `live-cases.json` and `src/checks/` are versioned. Their SHA-256 hashes are written into every `report.json` (`run.inputs`).
- Changes to the oracle are reviewed **separately** from the model or prompt change and land first. A comparison run is valid only if both sides report identical input hashes.

## 2. Repeated runs

- Run each live case N ≥ 5 times per configuration: `BASE_URL=… npx playwright test --project=live --repeat-each=5`.
- For each (case, check), report the pass rate per configuration. A case is **stable** only if every run gives the same verdict. Any unstable P1 case blocks, even if it passes most of the time.

## 3. Meaningful variations

Run each of these across all three callers and the key dates (day before / on / after each boundary):

- paraphrased questions (formal, terse, misspelt, other wording for "limit"/"allowance");
- injection in the question (identity claims, "ignore instructions") and in retrieved text (P11-style passages);
- boundary dates: 2026-05-31, 2026-06-01, 2026-12-31, 2027-01-01, 2025-12-31;
- conflict topics (home-office) and missing-evidence topics (gym/wellness as in R05, relocation, parental leave);
- balance, approval and payment-request phrasings (D-12, R10-style).

## 4. Comparison

- Diff old vs new `report.json` by `(case, check)`: new FAIL, resolved FAIL, verdict flip, new NOT_EVALUATED.
- **Any new FAIL in a P1 risk area (Isolation, Resilience, Grounding, Contract) blocks**, whatever improves elsewhere.
- Review every changed ANSWERED text by hand against `manual-rubric.md` §3, because the lexicon may miss new phrasings.

## 5. Human vs automated disagreement

1. Sample all disagreements (or at least 20 if there are many) between a human reading and the automated verdict.
2. Two reviewers judge each one independently against `manual-rubric.md`, without seeing the automated verdict or each other's call. Record their reasons.
3. Resolve each disagreement as one of:
   - **check false positive or negative** → fix the check, add a variant to `tests/fixtures/variants.json` that captures it, and rerun the self-tests;
   - **ambiguous criterion** → tighten the rubric and record the decision;
   - **genuine product defect** → keep the FAIL.
4. Never relabel a result without a recorded reason. Re-run the full comparison after any check or rubric change, because that is an oracle change (step 1).

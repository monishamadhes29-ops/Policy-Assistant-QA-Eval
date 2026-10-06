# Release recommendation — Policy Assistant internal pilot

## Decision: **NO GO**

Two critical isolation failures (D1 cross-tenant/role exposure, D2 identity override by question text) each block release on their own, whatever the overall rate.

## Results by risk area (check level, offline replay of R01–R12)

| Risk area | PASS | FAIL | NOT_EVALUATED | Total |
|---|---|---|---|---|
| Isolation | 14 | 7 | 0 | 21 |
| Answer meaning | 9 | 8 | 0 | 17 |
| Grounding | 13 | 5 | 0 | 18 |
| Contract | 22 | 2 | 0 | 24 |
| Resilience | 12 | 1 | 10 | 23 |
| Validation | 1 | 0 | 0 | 1 |

Recordings: **4 / 12 PASS, 8 FAIL, 0 NOT_EVALUATED.** Designed live tests: **14 NOT_RUN** (D-01 to D-14). The 10 NOT_EVALUATED results are all `LATENCY-TIMEOUT`: no timing data exists.

## Why a pass percentage is not meaningful

- The 12 recordings are hand-built probes, one per risk. They are not a sample of real traffic, so "33% pass" estimates nothing.
- Severities are not equal. A wording issue and a cross-tenant leak each count as one FAIL.
- Isolation is a gate, not a score. One leak is enough to block.
- 14 designed cases, including identity (D-01/D-02), provider faults (D-09 to D-11) and retrieved injection (D-06), have no evidence at all.

## Release criteria for a pilot

1. Zero isolation or injection failures across R01–R12 and D-01 to D-14 (CIT-ELIGIBLE, CTX-ELIGIBLE, D-06, D-14).
2. Provider timeout/unavailable → 503 and malformed → 502, with one attempt, shown with a fault-injecting stub.
3. Boundary dates correct: start inclusive, end exclusive (R03, D-05, D-13).
4. Conflicts return CONFLICT citing both sides (R04, D-06).
5. Output validation in place: quotes match source text, and no approval, guarantee or balance claims (R06, R10, D-12).
6. The above stable across ≥ 5 repeated runs per case.

## Evidence still needed

- A live run of D-01 to D-14 against an isolated environment with trace export.
- Latency under fault injection. Client-side elapsed time is the minimum; server-side timing is preferred.
- Repeated-run stability for every case, since generation is non-deterministic.

*This recommendation rests on 12 synthetic recordings from one unspecified prototype version. It is not evidence of production behaviour.*

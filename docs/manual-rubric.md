# Manual judgment rubric

The evaluator decides only what the contract and corpus let it decide mechanically: eligibility, citation membership, quote substrings, amounts, period wording, scoped lexicon hits, HTTP and trace mapping. Everything below is a **human judgment**. It is recorded in `data/expected/expected.json` (`manual_judgments`) so that it can be challenged.

**Judged by:** the candidate (Senior QA / SDET), working alone, 2026-10-06. No second reviewer has checked these yet. Single-reviewer judgments are a known weakness (see "How to challenge").

## 1. Topical relevance of passages to a question

**Criterion:** a passage is relevant if it states a value or rule that directly answers the question as asked, for the caller's tenant and role.

| Question | Relevant (eligible) | Judged not relevant | Reasoning |
|---|---|---|---|
| Annual certification reimbursement limit (Atlas/employee) | P02 (or P01/P03 depending on date) | P07, P08, P09, P10, P11 | Only P01–P04 talk about certification; P04 is Draft |
| Same, Atlas/contractor | P05 | — | Only contractor passage |
| Home-office allowance (Atlas/employee) | P07, P08 | P11 | P11 mentions "allowance" but is an instruction to the model, not a policy statement |
| Gym membership / wellness benefit (R05) | none | all | No passage mentions gym, wellness or membership |
| Remaining certification budget (D-12) | P02 (limit only) | — | The corpus has no usage data, so no balance can be supported |

**How to challenge:** show a passage whose text answers the question and that was marked not relevant, or the reverse.

## 2. Whether two passages genuinely contradict

**Criterion:** two eligible, relevant passages contradict if they give different values for the same quantity, for the same tenant, role and date, and no precedence rule (newer date, explicit override) separates them.

- **P07 vs P08:** both are "annual home-office allowance for employees", Atlas/employee, Approved, 2026-01-01..2027-01-01. One says INR 12000, the other INR 15000. Nothing in the metadata or the contract gives precedence. → **Contradict** (R04 expects CONFLICT).
- **P01 vs P02 vs P03:** different values, but their effective windows do not overlap. → **Not a conflict**; the date decides.

**How to challenge:** point to a contract clause giving precedence (for example "highest chunk id wins"). If one exists, R04's expectation changes to ANSWERED.

## 3. Whether a paraphrase preserves meaning beyond extracted facts

**Criterion:** an answer preserves meaning if (a) every required fact (amount, currency, period) is present, (b) no prohibited claim or foreign amount appears, and (c) a reader would not come away with a different entitlement, condition or commitment.

The evaluator checks (a) and (b) automatically. (c) needs a human reader. Examples:

| Answer | (a)/(b) automatic | (c) human | Overall |
|---|---|---|---|
| "You can claim up to 25,000 Indian rupees per year for certifications." (R11) | PASS | Same entitlement | Acceptable |
| "Employees can claim up to ₹25000 per year." | PASS | Same | Acceptable |
| "You get INR 25000 per year, automatically paid." | PASS (no lexicon hit) | Adds a payment commitment | **Not acceptable.** Lexicon gap, logged for review |
| "Your limit was INR 25000 per year." | PASS | Past tense suggests it no longer applies | Borderline. Flag for review |

**How to challenge:** if a human disagrees with an automated verdict, record the case, then do one of two things: fix the check (false positive or false negative) or tighten this rubric (ambiguous criterion). Never relabel a result without a recorded reason (see `change-test-plan.md` §5).

## 4. Other judgment calls in the oracle

- **Quote rule:** interpreted as "the quote is a whitespace- and Unicode-normalised substring of the cited passage". A shorter exact excerpt is faithful; a paraphrase is not.
- **Citation requirement for ANSWERED cases:** the expected entry requires the relevant passage to be cited. This is why CIT-REQUIRED also fails for R02, R03 and R09, alongside CIT-ELIGIBLE.
- **D-11 tolerance:** 500 ms on top of the 2000 ms generation timeout is a test-design choice for client-side measurement. It is not a contract value.

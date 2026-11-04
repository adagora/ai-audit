# 64. Independent labels and reviewed regressions remain separate from operational approval
Status: Accepted. Consolidated 2026-11-04 from the unpublished labeling/regression decisions at the user's request. Extends 0043, 0060, 0061 and 0062.

## Context
Approving a reply or transaction does not make it a correct gold label. Independent calibration needs blind review and explicit provenance. Replaying an edited answer cannot demonstrate an application fix.

## Decision
Tenant-scoped learning tasks bind the observed answer, source facts/context, rubric text/revision and sampling provenance. Two distinct assigned labelers lock independent labels; a third assigned person adjudicates disagreement after both labels are committed. Reviewers do not see peer or judge verdicts before their labels. Local account separation cannot prove different people are independent.

Retained experiments and reviewed incidents remain development evidence. External samples record source ownership, sanitization, sampling, split and prior exposure as accountable attestations. Development exposure contaminates the source family; repeated cases cannot silently become independent holdouts. Gold publication/export blocks fitting a new judge on that family.

Calibration requires exact current rubric and frozen judge identities, independent source families and locked human evidence. Preserve unresolved disagreement for IntentGauge to reject rather than inventing adjudication. IntentGauge remains the calibration engine. Neither labels nor eligibility activate authority.

A regression binds original sanitized input, published human review/context and explicit expected assertions. A separately assigned reviewer approves expectations before execution. Targets receive input without labels or assertions. Rerun the real application through the independent evaluator and link original case → reviewed expectation → actual rerun → new report/package. A passing rerun does not resolve the original case or grant authority.

## Consequences
Learning, operational reviews, qualification and activation have distinct artifacts and roles. Representative quality estimation stays separate from adversarial regression coverage. [The learning guide](../casework-learning.md) documents task creation, blind review, calibration and regression operation.

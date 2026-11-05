# 63. A separate executor authorizes effects and reconciles uncertain outcomes
Status: Accepted. Consolidated 2026-11-04 from the unpublished executor/consent decisions at the user's request. Extends 0055, 0061 and 0062. The JavaScript application and workbench it names were removed by [0067](0067-no-help-desk-application-in-ai-audit.md); the decision holds and the Python application implements it.

## Context
A correct quote, allowed tool or valid audit chain cannot establish customer ownership, consent, eligibility, settlement or safety after a crash. Those checks belong where backend credentials are used.

## Decision
Start with a synthetic cancellation/refund executor and fake booking/ledger backend outside the model and proxy. The backend owns write credentials and original payment routing. Typed proposals are recomputed from live owned state, integer minor units, booking version, calculation and qualified policy identity. Quotes expire; customer storm assertions require staff verification.

Bind consent and required reviewer approval to the exact proposal, customer, amount/currency, record version and validity window. Only the independently authenticated owning customer can consent. A larger or renewed proposal cannot inherit older consent/review. Transaction execution requires an active matching grant; quote evaluations do not grant production transaction capability.

Persist a dispatch reservation before the backend write. Derive stable operation identities; backend cancellation/refund deduplicates retries and rejects conflicting payloads. Read back booking and ledger before claiming completion. Crash ambiguity stays unknown; reconciliation observes before any explicit retry. Partial completion becomes an owned exception, not a fictitious rollback.

A supervisor may explicitly authorize completion of an already committed cancellation's original refund only after exact read-back, original consent/review and a current transaction grant are checked. Record that resolution before dispatch, reusing the original operation identity. Expired quotes never authorize a new cancellation. Preserve card/voucher routing and distinguish business time from grant/quote expiry time.

## Consequences
Synthetic concurrency, duplicate delivery, crash, stale-state and partial-settlement tests exercise the boundary without real payments. A real multi-system workflow must use an established durable engine and domain adapters rather than extending this example into a generic saga runtime. Real identity, payment/channel integration and operational approval remain separate work.

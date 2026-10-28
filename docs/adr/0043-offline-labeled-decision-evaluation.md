# 43. Offline labeled evaluation of QDL and model judgments
Status: Accepted (2026-10-27). Extends [0004](0004-quinelings-optional.md) and [0035](0035-read-only-session-policy-comparison.md).
## Context
Replaying a QDL result proves reproducibility of a computation, not that its rule is useful. The policy lab compares thresholds on synthetic sessions but has no independent labels. OpenAI Decisions can return a probability for a fixed question, but a model judgment is not a deterministic policy or an approval.
## Decision
- A separate quote evaluation uses a versioned labeled dataset with development and holdout-designated cases. The labels are human-authored fixture expectations; this synthetic holdout was visible during harness design. The exact QDL quote policy is run and recovered in a fresh SDK session for each case.
- An optional OpenAI Decisions evaluator asks one fixed predicate about the same numeric facts through `input_json`. Its 0.5 threshold and question are fixed before the holdout run. Repeats are recorded separately; refusals remain unknown rather than negative.
- The report records dataset, policy and question identities; per-case predictions without raw facts; misses, false alerts, flips, latency and reported input tokens by split. Unknown usage remains unknown. No report is added to the audit log.
- This is an offline evaluation only. Neither the model call nor QDL runs in the proxy forwarding path, and a model probability cannot authorize a business action.
## Consequences
- The small synthetic fixture proves the harness and exposes boundary behavior but cannot estimate production error rates. A future independently labeled, representative dataset is needed for a business claim.
- OpenAI calls require an explicit command and incur network latency and API cost. The report excludes keys and raw case facts. Data sent to OpenAI is the numeric case facts.

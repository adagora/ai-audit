# 23. Decision records: CLI decide, approve and replay; every QDL outcome is recorded
Status: Accepted (2026-10-22). Extends [0004](0004-quinelings-optional.md); input scanning added by [0025](0025-scan-decision-inputs.md); program storage changed by [0026](0026-store-each-program-once.md).
## Context
ADR 0004 made Quinelings/QDL an optional path for deterministic decision steps: an LLM proposes, a QDL program decides, a person reviews, and replay reproduces the result from the log alone. In practice the path was reachable only from JavaScript (`recordQdl`, `AuditLog.approve`, `replayQdl`). ADR 0002 and `spec/AuditChain.tla` already assumed a CLI `approve` that did not exist.
`recordQdl` threw on a refused or failed evaluation and wrote nothing, so the log lost exactly the cases an auditor looks for (AI Act Art. 12: situations that may present a risk). The link to the proxied LLM call that produced the proposal could only go into free-form `params`. `report` counted the `:qdl` companion record as a second decision, and `approve` accepted it as a review target.
## Decision
- New CLI commands, JSON on stdout:
  - `ai-audit decide --policy FILE --inputs FILE --system-id ID --use-case UC [--llm-call ID]`. The policy file is a QDL intent or `{"source": …}`; `inputHash` is the hash of the inputs file.
  - `ai-audit approve --decision ID --reviewer NAME --verdict approved|overridden|rejected [--note TEXT]`.
  - `ai-audit replay --decision ID`, with the decision id or its `:qdl` id.
  - Exit codes: 0 completed or reproduced; 1 recorded but refused or failed, or not reproduced (including a logged program that no longer rebuilds); 2 nothing written or checked (bad arguments, unknown ids, SDK missing, log unavailable).
- Every evaluation with a readable policy and inputs is recorded. The `:qdl` companion gains `status: completed | refused | failed` and, unless completed, `error: {code, path, nodeId?}` with the SDK's static codes, never its messages. A program refused before it compiles is stored as its intent plus `intentHash` instead of `source`/`sourceHash`. The decision record carries `output` only when completed.
- `replay` reproduces any status: completed compares output and input hashes, failed compares the diagnostic code and input hash, refused compares code and path. Companions written before this ADR have no `status` and count as completed.
- `llmCallId` is a first-class decision field. The CLI checks that it names an `llm-call` record in the same log. The library does not read the log for it: that costs O(log), and the caller already holds the `x-request-id` the proxy returned.
- `approve` accepts only main decision records. `report` counts companions as QDL outcomes (completed, refused, failed) and as replayable steps, not as decisions.
## Consequences
- An operator, a script or an agent in any language can record, review and replay decisions. The CLI becomes a second writer process next to the proxy, which the append lock (ADR 0016) and the AuditChain model already cover.
- `recordQdl` returns `{decision, step}` and no longer throws for refusals; callers check `step.qdl.status`. Other errors (missing SDK, I/O) still throw and write nothing.
- The proxy and its request path are unchanged; QDL stays optional (ADR 0004).
- Inputs are still stored as given and not scanned, so policies must keep personal data out of them. Storing each program once per hash and policies written by an LLM are left to later ADRs.

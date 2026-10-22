# 25. Decision inputs and programs are scanned before they are stored
Status: Accepted (2026-10-22). Replaces the "inputs are not scanned" consequence of [0023](0023-decision-records-cli-and-outcomes.md).
## Context
ADR 0023 stores a QDL decision's inputs and program exactly as given, because replay needs the exact values; `params`, `sources` and `model` of a decision record are stored as given too. Nothing checks them. The README asks policy authors to keep personal data out, but an agent that copies a customer e-mail into an input, or an LLM that writes a customer name into a policy's `thought`, would put it into a log that is kept for months and read by more people than the traffic (ADR 0007). The proxy log never holds such values; the decision log could.
Masking the values is not an option: a masked input changes the result, so the decision could never be replayed.
## Decision
- Before evaluating anything, `recordQdl` (and so `decide`) runs the shared scanner, with the same rules and exact-value allowlist as the proxy, over everything the decision would store as given: the QDL inputs, the program (the intent, or the source when recovering), `params`, `sources`, `model` and the prompt template id. String values and object keys are scanned, nested JSON included, as in the proxy. Numbers are not: an 11-digit quantity passes the PESEL checksum one time in ten and would block real decisions.
- On a finding, nothing is evaluated and no scanned value is stored. The attempt is still recorded: the decision record keeps `systemId`, `useCase`, `llmCallId` and the input hash; the `:qdl` step has `status: "refused"`, `error: {code: "audit-sensitive-input", path}` and `findings` as rule + path (ADR 0007), and no inputs, program, params, sources or model.
- `decide` prints that record and exits 1, like other refusals. `replay` of such a record exits 2 with `audit_qdl_not_replayable`, because there is nothing to rerun.
- Exact values that are known to be safe are exempted with the existing allowlist (`--allow-hashes FILE`, SHA-256 of the exact value, ADR 0014).
## Consequences
- The decision log keeps the proxy log's guarantee for everything the scanner detects. Names, numeric identifiers and anything else outside the rules still pass; this is a check, not anonymisation.
- A policy that really needs such a value, for example an e-mail as a routing key, must hash or tokenise it before `decide`, or allowlist the exact value.
- Policy authors get a refusal that names the field, instead of a log that quietly holds personal data. `report` counts these with the other refusals.

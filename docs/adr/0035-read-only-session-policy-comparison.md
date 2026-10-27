# 35. Read-only session policy comparison with versioned observations
Status: Accepted (2026-10-26). Supersedes [0034](0034-session-governor-replays-observations.md).
## Context
The lab filtered out calls without usage even though its halt rule needed only a failure count. It counted successful Responses completions and Anthropic tool handoffs as failures, combined successful retries and branches with failures, and sorted by conversation turn rather than observation order. An offline comparison must not imply that its recommendations were enforced.
## Decision
- `ai-audit lab` compares two positive integer cumulative failure thresholds on one selected recorded session. It reads one immutable file snapshot, verifies its chain, and never appends decisions to that source log. HTML and JSON outputs are separate files and must not replace an existing path.
- Snapshot rules are identified as `session-governor-v2`. Calls within each session retain audit append order. This is completion-observation order, not a reconstruction of concurrent request start order.
- A failed call has a missing or non-2xx/3xx upstream status, a non-success stop reason, or a client abort without a recorded stop. Successful stops are `stop`, `tool_calls`, `function_call`, `completed`, `end_turn`, `tool_use`, `stop_sequence`, and `pause_turn`. Missing stop alone does not establish failure.
- Failures accumulate within the selected recorded session and do not reset after success. Retries and branches have separate counters and do not add failures themselves. Session membership remains the proxy's inferred linkage, not proof of an application task boundary.
- The governor takes only `failures`. Every snapshot is evaluated, including calls without usage. A pause receipt carries the failure count. Per-call token totals are displayed only when both counts and their sum are safe non-negative integers; unknown totals stay absent.
- The report includes snapshot-rule version, whole-file digest, record count and head, contributing call hashes, exact program sources, inputs, outputs and runtime registry identity. Both compiled programs must reproduce after recovery in a fresh SDK session. Repeating the command against the same file permits comparison of derived snapshots; source replay alone does not validate their derivation.
- Recommendations after a policy's first pause are labeled hypothetical. There is no enforcement, claimed cost saving, task-quality assessment or automatic policy adoption. The comparison checks chain integrity and replay separately and explicitly says external anchors were not checked.
- The two-decision inspection page requires the same existing call reference and exact inputs, consistent main/companion records, an intact chain, and successful reproduction of both completed results.
## Consequences
- Existing stored QDL programs keep their original semantics and remain replayable. New governor source hashes change because usage is no longer an input and pause payloads carry failures.
- The proxy does not import or execute the lab. QDL remains optional; ordinary TypeScript could implement the same threshold rule.
- Reports contain metadata and exact fixed governor programs, not prompts or responses. A compatible SDK is still needed for future replay; a report is not a bundled interpreter or externally authenticated evidence.
- Operators use `context` to choose an inferred session. Multiple sessions require an explicit selection. Long logs and comparisons are processed in memory; this is an offline tool, not an online governor.

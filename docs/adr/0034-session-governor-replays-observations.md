# 34. A session governor replays retained observations
Status: Accepted (2026-10-26). Follows [0004](0004-quinelings-optional.md), [0007](0007-log-stores-no-values.md), [0011](0011-response-content-per-key.md) and [0012](0012-unknown-usage-never-zero.md).
## Context
A policy lab compares rules on one recorded agent session. The proxy already keeps upstream status, abort, stop, session linkage and provider usage. It does not keep message text. QDL cannot read the log. Running a Quineling inside `serve` would put it on the forwarding path.
## Decision
- The session governor is a Quineling run after the calls are logged. `serve` does not import it or the SDK.
- Ordinary code builds one snapshot per call: a failure count and, when both token counts were reported, their sum. A missing count is left out. It is not stored or passed as zero.
- A call counts as a failure when the upstream status is outside 2xx/3xx, the stop is neither `stop`, `tool_calls` nor `end_turn`, the client aborted before a success stop was recorded, or the session link is a retry or a branch.
- The threshold is a literal in the program. A different threshold is a different source hash. The lab page is a view: its table holds the snapshot, the threshold, the steps and both outputs. A creature region selects a step that is already in that table.
- A simulated pause is not authorization to send or to stop an agent.
## Consequences
- Two governors can disagree on one session. Replay uses the stored snapshot and the stored program.
- The lab shows no prompt or response text.
- Unknown usage stays unknown. A later total does not treat that call as zero.

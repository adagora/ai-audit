# 33. Overall verification is chain, linkage, and output consistency
Status: Accepted (2026-10-25). Supersedes the verification result and the failed-run diagnostic shape in [0023](0023-decision-records-cli-and-outcomes.md).
## Context
ADR 0023 treats replay as the check of a QDL decision. Replay compares a fresh run with the `:qdl` companion. It does not read the main decision's `output`, the hash chain, or external anchors. Replacing that output with `["FORGED"]` can leave replay successful. A chain that has been rehashed is locally intact and still not an external anchor. The adapter also read occurrence 0. A program can finish that occurrence and fail on a later one inside the eight-occurrence limit. The recorded diagnostic then became `{code:"failed",path:"$"}` and dropped the occurrence index.
`report` counted every companion with stored inputs as replayable, including a sensitive-input refusal and a decision whose program record is gone. A QDL decision whose companion append did not land was invisible.
## Decision
- `verifyDecision` reports four results: replay, chain, record consistency, and anchor status `verified`, `failed`, or `not-anchored`. Overall success is chain and record consistency together. Replay and anchor status do not make it true. A missing anchors file is `not-anchored`, not `failed`.
- Record consistency requires a companion, reconstructible inputs, a program record when the step cites a `sourceHash` without inline source, and a main `output` that matches `outputsHash`.
- A failed run stores the failed occurrence's `code`, `path`, `nodeId`, and `occurrence`. Replay of a record that has those fields must match them. Older records without them still match on code and path.
- A new QDL main record sets `qdlDecision: true`. `report` lists incomplete QDL decisions apart from `stats`. A sensitive-input refusal and a missing program are not `withReplayableStep`. CLI `replay` still exits 0 only when the run reproduced. Its JSON also carries the four results.
## Consequences
- A forged main output is not an overall success, including when the companion still replays and the chain has been rebuilt.
- An unanchored log is not described as externally authenticated.
- Later-occurrence failures stay diagnosable. The proxy path is unchanged.

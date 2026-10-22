# 26. Each QDL program is stored once per log
Status: Accepted (2026-10-22). Supersedes the "full source in every QDL record" part of [0004](0004-quinelings-optional.md) and of [0023](0023-decision-records-cli-and-outcomes.md).
## Context
ADR 0004 put a program's full source into every QDL record, so that each record replays on its own. Programs are large and repeat: the 14-step quote policy in `examples/quineling-quote` is about 20 KB of source, so every decision cost about 21 KB of log, while its own data (inputs, hashes, status) is under 1 KB. A shop that quotes a few thousand parts a month would write the same 20 KB thousands of times.
## Decision
- The first time a log sees a program, it gets one `program` record, `{kind: "program", id: <sourceHash>, ts, source}`, written before the decision. The decision's `:qdl` step keeps `sourceHash` and no longer carries `source`.
- "First time" is decided per `AuditLog` instance from the log itself: read once, then remembered. Two writer processes that both miss it each write a copy. Copies are identical and harmless.
- `replay` takes the source from the step when it is there (records written before this ADR), otherwise from a `program` record with the same id anywhere in the log. As before, it rebuilds the program and checks that its identity equals `sourceHash`. Without a program record it fails with `audit_qdl_source_missing` and exit code 1: the evidence is incomplete.
- Intents of programs refused before they compile stay inline (ADR 0023): they are small and do not repeat.
## Consequences
- A decision (its record plus the `:qdl` step) costs about 1.2 KB for the example policy instead of about 21 KB; each distinct program costs its size once per log file.
- Replay is self-contained per log file, not per record. The hash chain detects a deleted program record and anchors detect truncation (ADR 0002). Tooling that splits or rotates logs must carry the program records along, or start a new file, which then stores its own copies.
- `program` is a new record kind. `report`, `stats` and `context` ignore it; existing chains, anchors and older records stay valid.

# 2. Hash-chained JSONL audit log with external anchors
Status: Accepted (2026-10-20)
## Context
The log must show that records were not edited or deleted (AI Act Art. 12/19 traceability), without a database.
## Decision
Append-only JSONL where each record carries the hash of the previous one. `lastHash` is read from the end of the file, not by loading the whole log: O(1) per write, and safe when CLI `approve` writes while the proxy runs.
`ai-audit anchor` appends `{ts,count,head}` to a separate append-only file. `verify --anchors` uses it to catch a recomputed (swapped) chain and truncation.
## Consequences
- The chain alone detects edits and deletions, not replacement of the whole file.
- Anchors only help if the anchors file lives elsewhere (e.g. WORM / S3 Object Lock). That is the operator's job.
- Stats and reports are computed from this log, the single source of truth.

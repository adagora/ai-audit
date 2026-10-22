# 27. Policy versions are derived per use case from the log
Status: Accepted (2026-10-22)
## Context
A QDL policy changes over time: the shop rate goes up, a floor moves, a review threshold is added. Each change produces a new program with a new `sourceHash` (ADR 0026). An auditor asks two questions: which version decided this case, and what changed between versions. The log already answers the first per decision; nothing answers the second, and nothing groups programs into versions.
Options for linking versions: an explicit `--parent` hash (nobody remembers hashes), the policy `name` (the example policy is named "… v1", so the name changes with the version), or the policy file path (differs between machines and is not in the log). What stays stable is the use case the policy serves.
## Decision
- A use case (`systemId` + `useCase`) has versions: the distinct `sourceHash`es of its QDL decisions, in order of first use. Version n's predecessor is version n−1. Nothing new is stored to link them; the history is derived from decision records and their `:qdl` steps.
- A program used again after a later version does not become a new version. Each version reports `firstUsed`, `lastUsed` and its decision count, and the version of the latest decision is marked `current`, so a rollback is visible.
- `program` records also store the program's `name`, so listings work without the SDK. Older program records have no name.
- `ai-audit policies [--system-id ID] [--use-case UC]` prints one JSON line per use case with its versions and, for each version after the first, `changes` against its predecessor: `{path, from, to}` for every differing value in the program's name, thought, outputs and task nodes (by node id), with `from` missing for additions and `to` missing for removals. Computing changes rebuilds both programs, so it needs the SDK (exit 2 with `audit_qdl_unavailable` without it). A version whose program record is missing gets `changes: null`.
- `report` lists the versions per use case, without changes.
## Consequences
- An auditor can see, per use case, every policy version, when it was in use, how many decisions it made and exactly which values changed, for example `nodes.floor.params.value` from 150 to 160.
- Versions are per use case: one program shared by two use cases appears in both histories. A policy that is never used for a decision has no version.
- Decisions refused before a program existed (an invalid intent, ADR 0023, or a sensitive input, ADR 0025) belong to no version.

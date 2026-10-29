# 51. A record stores each finding once per rule and path, with a count
Status: Accepted (2026-10-29). Extends [0007](0007-log-stores-no-values.md).
## Context
`decision.findings` in an `llm-call` record lists every match as `{rule, path}`, about 52 bytes each. A 1.07 MiB message with 160,000 email addresses wrote one 8.3 MB record; at the 32 MiB body limit one record can pass 250 MB. Readers then hold that line in memory, and segment rotation (ADR 0049) cannot split it. Almost all entries repeat the same rule and path. `x-audit-finding-count`, `/metrics` and `report` need totals, not one entry per match.
## Decision
- A new record stores distinct `{rule, path}` entries (`decision.findings` and the `reject` record alike) in order of first occurrence, with `count` when it is above 1. A record without `count` means 1, so older records stay valid.
- At most 1,000 distinct entries are stored. Past that, `findingsOverflow` holds, per rule, the number of further matches. Nothing else about them is stored.
- `x-audit-finding-count`, the block response and the decision itself still see every finding; only the stored form changes. `report` and `workbench` add `count` and `findingsOverflow` into their totals; `stats` and `/metrics` do not count findings.
## Consequences
- A record's findings take at most about 60 KB, whatever the body.
- A reader loses which part held each match beyond the first 1,000 distinct paths; the totals per rule stay exact.
- Readers written for the old form undercount until they read `count`.

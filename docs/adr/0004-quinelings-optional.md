# 4. Quinelings/QDL is an optional adapter, not core
Status: Accepted (2026-10-20); decision path extended by [0023](0023-decision-records-cli-and-outcomes.md)
## Context
Quinelings gives bounded, deterministic programs with exact source, so a decision step can be reproduced. It needs Node 22 and its SDK is very young. It gives no logs, retention, integrity chain, oversight or reports.
## Decision
Keep `replay()` in `node:vm` (step and time limits) as the core mechanism. QDL is an optional path. A QDL record holds the full quine source and inputs, so its replay is self-contained.
## Consequences
- The proxy runs without Quinelings.
- `node:vm` is not a security sandbox; only trusted step code may run there. Its `steps` registry is in memory.

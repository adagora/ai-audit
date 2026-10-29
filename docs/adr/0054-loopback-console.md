# 54. A loopback console reads the audit log and records reviews
Status: Accepted (2026-10-29). Extends [0023](0023-decision-records-cli-and-outcomes.md), [0037](0037-offline-evidence-workbench.md), [0040](0040-real-workflow-client.md) and [0053](0053-use-case-table.md).
## Context
The operator watches counters in Grafana, reads `report` output, opens a workbench snapshot and records reviews with `approve`. Nothing shows what needs attention now, and a person who must decide sees the decision in one tool and records the verdict in another. ADR 0037 kept log reading offline because a live endpoint adds an access surface; ADR 0039 and 0040 keep the example pages away from the real log. A review queue needs that surface.
## Decision
- `ai-audit console --log LOG [--config gateway.json] [--anchors FILE] [--metrics URL] [--reviewer NAME]` starts an HTTP server that binds only to a loopback address (`127.0.0.1` by default, `--port` 8793). Any other `--host` stops the start.
- At start it prints a URL with a random 256-bit token in the fragment. Every `/api` call needs that token as a bearer header. Requests whose `Host` is not the bound loopback address and port are refused, which stops DNS rebinding. Static files carry no data and are served with a strict Content-Security-Policy.
- The console reads the whole log series and shows metadata: request paths, use cases, sessions and context blocks (ADR 0017, 0020), keys from the config without hashes, budget status, chain and anchor checks. For decisions it also shows the stored QDL inputs, outputs, program name and review notes, which the operator can already read with the CLI. It never shows prompt text; the log does not have it.
- One write exists: a review of a decision, the same record as `approve`. It needs `--reviewer`; without it the console is read-only. The note is at most 500 characters and is scanned; a finding refuses it with `audit_sensitive_note`. Replay runs in memory and writes nothing.
- The request path through the proxy (key, use case, body, model, inspection, decision, budget, upstream, tool gate, record) is derived from fields the record already has. No record field is added.
- Suggestions come from fixed rules with fixed thresholds, for example a use case with many reviews and few overrides, a tool held again and again outside a list, or labels without a use-case table. Each one shows its evidence and, where it applies, the JSON to paste. No model runs, and the console never edits `gateway.json`.
## Consequences
- Observation and decisions are in one place, and a review is recorded where the decision was read.
- The token is the only credential. Anyone with local access to the terminal output, or to the browser session, can read the log metadata and, with `--reviewer`, record reviews under that name. Remote use goes through an SSH tunnel.
- The workbench stays the file to share; the console is not a shareable artifact.
- Reading the whole series on each refresh costs time on large logs. The console caches by file size and modification time.

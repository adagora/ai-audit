# Audit log, sessions, context map
## Sub-features
Hash-chained log (`ai-audit verify`), fail-closed 503 when the log is torn or unwritable, session linking and `ai-audit context --session`.
## How to get to it (user POV)
Run multi-turn conversations through the proxy, then use the CLI on the log.
## Driving it with drive.mjs
`node drive.mjs log "context map"`. A torn line is appended to the log to simulate a broken disk; the next request must be 503, must not reach upstream, and must be counted in `ai_audit_log_unavailable_total`.
## Gotchas
Run the torn-log scenario last: it leaves that instance's log unusable.

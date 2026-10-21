# 16. Fail closed when the audit log cannot take a record
Status: Accepted (2026-10-21)
## Context
ADR 0009 makes one decision per request and records it. The record is written after the response is streamed (it carries upstream status, usage, output hash), so a failing append used to lose it silently: a log ending in a torn line (writer crashed mid-write) made `lastHash()` throw, the client still got the full response, and the outer catch then wrote after `res.end()`, which crashed the process. Separately, `append` read the tail and wrote without a lock, so two writer processes (proxy + CLI `approve`, or replicas) forked the chain. Both were found by the TLA+ models in `spec/` and reproduced against the code.
## Decision
- `AuditLog.append` holds an exclusive lock file `<log>.lock` (`open(..., "wx")`, retry, stale after 10 s) around tail read + write. No new dependency.
- A missing trailing newline is a torn line. The log is not repaired automatically: an operator runs `ai-audit verify` and decides.
- The proxy calls `AuditLog.ensureWritable()` (writable + intact tail) before inspection and again right before forwarding. On failure it returns `503 audit_log_unavailable` and forwards nothing: an unrecordable request is refused.
- If the append still fails after the response was delivered, the process stays up, `metrics.logWriteFailures` is incremented and a content-free `audit_log_write_failed` event goes to stderr.
## Consequences
- A corrupted log stops all traffic until it is fixed. Availability is traded for a complete record.
- Residual window: the log can break between the last check and the final write. That case is counted and reported, not prevented (`RequestLifecycle_residual.cfg` still fails on purpose).
- The lock assumes a local filesystem. Taking over a stale lock is best effort; a writer that stalls for more than 10 s while holding it can still race.

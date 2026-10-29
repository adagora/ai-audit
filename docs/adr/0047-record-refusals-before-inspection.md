# 47. Refusals before inspection are content-free, rate-bounded records
Status: Accepted (2026-10-29)
## Context
A request refused before inspection wrote nothing: an unknown virtual key or admin key (401), a provider or model outside the key's allow-list (403), an unsupported route (404), an oversized body (413) and malformed, duplicated or too deep JSON (400). A guessed key or an agent that tries a forbidden model left no evidence beyond a counter. Writing every refusal lets an unauthenticated client fill the disk and hold the append lock, and a full disk stops all traffic ([0016](0016-fail-closed-when-log-unavailable.md)).
## Decision
- Each such refusal appends one `refusal` record with the request id from `x-request-id`: status, error code, method, the route label used by `/metrics`, the provider when known, the virtual key name when the key matched, the socket's remote address, and for a model refusal the requested model id cut to 128 characters.
- Never the presented credential or its hash, other headers, the path outside the fixed route labels, or the body ([0007](0007-log-stores-no-values.md)).
- At most 60 refusal records per minute per proxy process. Further refusals in that minute are counted in `ai_audit_refusals_suppressed_total` and in one `refusal` record with `suppressed` and the minute's bounds, written when the minute ends or the server closes.
- A refusal is not an `llm-call`: nothing was inspected or forwarded, so `stats`, sessions, `lab` and `decide --llm-call` ignore it. `report` counts refusals by status and code. `verify` and anchors cover them like every record.
- If the log cannot take a refusal, the client still receives the refusal; the failure is counted in `ai_audit_log_write_failures_total`. A 503 for an unavailable log and the scanned, unlogged `count_tokens` path stay as before.
## Consequences
- 401 and 403 leave evidence of time, route, key name or its absence, and source address. The address is personal data on shared hosts; it stays in the local log like the rest.
- During a flood only the first 60 refusals of each minute keep their details; the summary keeps the number.
- The log grows with refused traffic, bounded by the limit. Readers that assumed four record kinds must accept `refusal`.

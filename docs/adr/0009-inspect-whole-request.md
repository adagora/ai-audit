# 9. One decision per request, before forwarding
Status: Accepted (2026-10-20)
## Context
Secrets hide in tool results, arguments and object keys, and the scanner must see exactly what upstream will see.
## Decision
Scan every string leaf (incl. tool results, arguments, keys) before anything is sent. A finding in a key name → 409, even in `redact` mode. Duplicate JSON keys → rejected. A clean request is forwarded as the original bytes; it is re-serialized only when something was masked, with unnumbered `[REDACTED:<rule>]` placeholders. `count_tokens` is scanned too, but not logged.
## Consequences
- No partial forwarding; latency includes inspection (the deadline covers inspection + upstream headers, not the stream).
- Clean traffic is byte-identical to what the client sent.

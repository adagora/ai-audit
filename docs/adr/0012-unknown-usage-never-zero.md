# 12. Unknown token usage is never counted as zero
Status: Accepted (2026-10-20)
## Context
Token totals in `stats` and `report` are what people use for cost and anomaly checks. Providers often do not report usage: OpenAI chat streams omit it unless the client sets `stream_options.include_usage`, and an aborted Anthropic stream ends before `message_delta`, leaving only the `output_tokens` placeholder from `message_start`. Summing such calls as `?? 0` silently understated totals. The proxy cannot ask for usage itself without changing forwarded bytes (ADR 0009). ghuntley/overalls (Ziggy) states the same rule: missing usage is unknown, never zero.
## Decision
- `extract` records a usage field only when the provider reported a final value. The Anthropic `message_start` output count is never used as output usage.
- Per field (input, output), a successfully forwarded call (2xx/3xx, not blocked) without a value counts in `unknownInputUsage` / `unknownOutputUsage` and is excluded from the sum. `unknownUsage` counts calls missing either field.
- `tokensComplete: false` whenever anything is unknown; totals are then a lower bound, and the report says so.
- Blocked calls and upstream errors are neither summed nor unknown.
## Consequences
- Stats/report output gains four fields; consumers must read `tokensComplete` before treating totals as exact.
- No estimation (e.g. tokenizing the output): an estimate would be presented as a measurement.
- Clients that want exact totals set `stream_options.include_usage: true`; the README says so.

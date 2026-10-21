# 19. /metrics is OpenMetrics text, unauthenticated, bound to localhost by default
Status: Accepted (2026-10-21)
## Context
`GET /metrics` returned an ad-hoc JSON object: request counts by decision and status, the sum and max of latency, and cache hits. No scraper can read it without glue code. A sum and a max cannot give percentiles, and keys came from raw values, so a client could add keys by requesting arbitrary paths. Only one test read the JSON. README, demo and bench did not.
Options considered:
1. Keep the JSON and add a second endpoint for Prometheus. Rejected: two formats to keep in sync, and the JSON had no consumer.
2. Use `prom-client`. Rejected: ADR 0001 allows no runtime dependencies, and the needed subset (counters, gauges, one histogram) is about 50 lines.
3. Use OTLP push. Rejected: it needs a collector and network configuration, and pull-based scraping fits a local proxy.
4. Replace the JSON with OpenMetrics text. Chosen.
## Decision
- `GET /metrics` returns `application/openmetrics-text; version=1.0.0`, written by `src/metrics.ts`. Families are prefixed `ai_audit_`, counters end in `_total`, and the output ends with `# EOF`.
- Latency is a histogram, `ai_audit_request_duration_seconds`, with buckets from 5 ms to 300 s; streamed responses count until their end.
- Label values come from fixed sets: known routes (anything else is `other`), decision, status, provider, status class, error reason, usage field, and injection rule id. Never from content, keys or headers.
- No authentication, like `/healthz`: the output holds counts only. The proxy binds to 127.0.0.1 by default. Deployments that expose it restrict `/metrics` at the network layer. `/audit/stats`, which reads the log, keeps its admin key.
## Consequences
- Breaking: JSON consumers of `/metrics` must switch to a scraper. The commit was marked `feat(metrics)!`.
- Prometheus, VictoriaMetrics and Grafana read it directly. `examples/monitoring` is a working stack.
- Series count is bounded: routes × decisions × statuses, plus one series per injection rule.
- Counters are per process and reset on restart. Scrapers handle that with `rate`/`increase`.

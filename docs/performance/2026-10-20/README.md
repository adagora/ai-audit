# Proxy overhead, 2026-10-20

How much latency does the proxy add to one request? Here the upstream is a local mock, so the difference between going through the proxy and going straight to the mock is the proxy's own cost: parsing, scanning and redaction, the virtual-key check, a synchronous hash-chained audit-log append, and the extra loopback hop.

## Method

- `npm run bench:overhead -- 2000 3` starts three processes: the client (`bench/overhead.mjs`), a mock upstream (`bench/mock-upstream.mjs`) with OpenAI and Anthropic shapes, a fixed tiny response and 0 ms delay, and the proxy (`bench/overhead-proxy.mjs`). The proxy runs in `redact` mode with a virtual key and the audit log on.
- Cases:
  - OpenAI chat: system prompt plus about 400 B of user text.
  - Anthropic messages: about 400 B of user text.
  - OpenAI chat with a synthetic AWS key and an email in the text, which triggers redaction findings.
- For each case and each concurrency level (1 and 16): 300 warmup requests to each target, then 2000 measured requests direct and 2000 through the proxy. Requests use keep-alive `fetch` (undici).
- Overhead is proxy pN minus direct pN. Each percentile is subtracted on its own, so these are differences of distributions, not per-request deltas.
- Sanity check: in every run, the audit log grew by exactly 2000 lines for 2000 proxied requests, and there were 0 non-200 responses.
- Repeated 3 times. Raw output is in `raw.txt` and `results.json`.

## Environment

Node v22.23.3 (official linux-x64 binary). The CPU is reported as "Intel(R) Xeon(R) Processor", 8 vCPUs, on a shared cloud VM. Everything ran on 127.0.0.1 on one machine.

## Results: added latency (ms), median of 3 runs [min–max]

| case | conc | +p50 | +p95 | +p99 | rps direct → proxy |
|---|---|---|---|---|---|
| openai-chat | 1 | 0.64 [0.61–0.82] | 1.06 [1.05–1.09] | 2.26 [1.97–2.30] | ~5200 → ~1100 |
| anthropic-messages | 1 | 0.61 [0.56–0.69] | 1.09 [0.99–1.19] | 2.34 [2.23–2.71] | ~5600 → ~1120 |
| openai-chat + redaction | 1 | 0.69 [0.63–0.69] | 1.07 [0.97–1.16] | 2.39 [2.26–2.64] | ~5200 → ~1070 |
| openai-chat | 16 | 5.9 [5.6–7.8] | 7.1 [6.0–10.1] | 7.7 [7.4–12.9] | ~7800 → ~1960 |
| anthropic-messages | 16 | 5.5 [5.0–5.8] | 5.2 [5.1–6.2] | 7.1 [6.4–7.6] | ~7500 → ~2080 |
| openai-chat + redaction | 16 | 6.2 [5.9–6.6] | 7.0 [5.9–9.3] | 8.4 [6.5–10.1] | ~8300 → ~1960 |

## Reading it

- **One request at a time costs about 0.6–0.7 ms at p50 and about 1.1 ms at p95.** A real LLM call takes hundreds of ms to seconds, so this is under 1% of it.
- **Redaction is almost free at this size.** The case with findings is within noise of the clean case.
- **At concurrency 16, most of the added time is queueing, not per-request work.** One proxy process (single event loop) tops out at about 2000 req/s here, and with 16 requests in flight the wait for the loop shows up as +5–8 ms. Against a real provider, each request spends almost all of its time waiting on the network, so the proxy is far from that ceiling in practice. If you ever need more, run more processes.
- Run 1 is consistently the slowest (JIT and a cold OS cache despite warmup), so the spread is mostly run 1 against runs 2–3.

## Caveats

- Loopback, a mock upstream and one machine. Real network, TLS to the provider and streaming are not measured. In this setup the proxy's upstream hop is plain HTTP on loopback.
- Client, mock and proxy share 8 vCPUs on a noisy shared VM.
- Small payloads only. Attachments (OCR in the sandbox) are a separate, much slower path and are deliberately not in this benchmark.
- The audit log sits on a local tmp filesystem. A slow or network disk would raise the cost of the synchronous append.

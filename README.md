# ai-audit
Local proxy that sits in front of OpenAI and Anthropic APIs. It inspects each request (text, tool results, images, PDFs) for secrets and PII before forwarding, and writes a hash-chained audit log for every call (AI Act Art. 12-style). TypeScript, zero runtime deps.

## Quickstart
```sh
npm install && npm run build
node dist/src/cli.js serve --mode redact --log audit.jsonl        # http://127.0.0.1:8787  (npm link → `ai-audit`)
node dist/src/cli.js verify --log audit.jsonl
```
Clients: `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude` · `OPENAI_BASE_URL=http://127.0.0.1:8787/v1 codex` (works the same for the OpenAI/Anthropic SDKs and curl). Optional headers: `x-audit-system-id`, `x-audit-use-case`.

| mode | finding → |
|---|---|
| `redact` (default) | replaced with `[REDACTED:rule]`; images blacked out; PDFs → 409 unless `--allow-page-redaction` |
| `no-go` | 409, upstream never called, response lists rule IDs only |
| `advisory` | original forwarded, finding logged |

Uninspectable attachment (corrupt, unsupported, remote URL, file id) → 422. Detects: Gitleaks key shapes (AWS, GitHub, OpenAI, Anthropic, GCP, Stripe, Slack, JWT incl. wrapped, private keys), e-mail, phone, PESEL, IBAN; also catches secrets split across text parts, OCR text, PDF text and metadata.

## Log tools
`ai-audit verify [--anchors a.jsonl]` checks the chain (with anchors it also catches a swapped or truncated file) · `ai-audit anchor --anchors a.jsonl` (run daily, keep the anchors file somewhere else) · `ai-audit report --from 2026-10-01 --to 2026-11-01`.
Gateway: `ai-audit keygen --name agent` creates a virtual key (only its hash goes in `--config`, together with allowed `models`/`providers`). Real keys live in `AI_AUDIT_UPSTREAM_OPENAI_KEY` / `_ANTHROPIC_KEY`, which are only set in the proxy's environment. Config `aliases` (`{"fast":{"model":"gpt-4o-mini","upstream":"…"}}`) switch model or upstream without changing the client. `ai-audit stats --by key|model|hour`, or `GET /audit/stats?by=…` with `x-admin-key` (`AI_AUDIT_ADMIN_KEY`), shows tokens, cached tokens, latency and errors. Also `/metrics`, `/healthz`, `/readyz`.

## Deploy (Docker)
`docker build -t ai-audit .` (default `BASE=node:26.10.0-slim`; `--build-arg BASE=platformatic/node-caged:26.10.0-slim` for V8 pointer compression) · `docker run -p 8787:8787 -v $PWD/data:/data ai-audit`. bwrap inside Docker needs `--cap-add SYS_ADMIN --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined`, otherwise attachments fail closed (422).
Pointer compression, measured (`node bench/memory.mjs`, 5 runs each): JS heap −35% (6.3 vs 9.7 MB) but RSS unchanged (~180 MB both) and throughput −8%. The proxy holds almost no objects, so we keep the official image as default. Details: DECISIONS.md #24.

## Quinelings example (Node ≥ 22)
`npm run example:quote` (add `-- --live` for one gpt-4o-mini call): the LLM proposes a machining quote, a QDL program computes the price and approval, the log stores the program hash and inputs, a replay reproduces the result, a tampered rate is caught, and a wrong LLM price is overridden and flagged for review.

## Limits
- Attachments need tesseract, poppler and python3-PIL. Workers run in bwrap with prlimit (no network, 4 GiB, 60 s).
- Cache is in memory only. No OpenAI↔Anthropic translation. No person-name detection.
- Only PNG/JPEG/WebP/GIF images and PDF files are inspected.
- Requests rejected with 401/403 are not written to the audit log.
- AI Act mapping in DESIGN.md is unverified and not legal advice.

## License
MIT. Detection rules adapted from Gitleaks; see THIRD_PARTY_NOTICES.md.

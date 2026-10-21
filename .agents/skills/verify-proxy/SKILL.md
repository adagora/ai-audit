---
name: verify-proxy
description: Drive the real ai-audit proxy process the way a client does (HTTP against `ai-audit serve`, mock upstream) and prove user-visible behavior: redact/no-go/advisory, OpenAI and Anthropic streaming, attachments, virtual and upstream keys, aliases, stats, metrics, sessions and the context map, and fail-closed logging. Use after any change to src/proxy.ts, scan, attachments, sessions, metrics or the CLI, and before claiming a proxy feature works.
---

# Verify the ai-audit proxy

## Launch
One command builds nothing, starts everything it needs, runs all scenarios and tears down:
```sh
npm run build && node .agents/skills/verify-proxy/drive.mjs              # all scenarios
node .agents/skills/verify-proxy/drive.mjs stream metrics                 # only scenarios whose name starts with these words
```
The driver starts an in-process mock upstream on a random port (OpenAI `/v1/chat/completions`, Anthropic `/v1/messages`, JSON and SSE). It then launches four real proxy processes with `node dist/src/cli.js serve` on random ports: redact (with an alias config), no-go, advisory, and redact with `--unsafe-no-sandbox`. Each has its own log dir. A proxy is ready when it prints `"event":"listening"` on stderr and `/healthz` returns 200. Keys are fixed fakes (`aia-verify-client-key`, `aia-verify-admin-key`, `sk-verify-upstream-FAKE`); the driver never reads real keys and never calls a real provider.
Instances are isolated by port and directory, so several runs can go side by side.

## Doctor
`test -f dist/src/cli.js && node dist/src/cli.js profile --mode redact >/dev/null && echo ok` checks that the build exists and the CLI loads. If `/healthz` never answers, the driver prints the last proxy stderr and the failure.

## Drive
Scenarios live in `drive.mjs`, one `scenario(name, fn)` each, and use only the user path: HTTP requests with client headers (`authorization: Bearer <virtual key>` for OpenAI, `x-api-key` for Anthropic) and the `ai-audit` CLI (`context`, `stats`, `verify`) against the proxy's log. Assertions check the response, what the mock upstream received (`sent()`), the audit log on disk (`settled(n)` waits for the record, which is written after the response) and `/metrics`. Feature map: [features/README.md](features/README.md).

## Evidence
`~/.ai-audit-verify/<run-id>/results.json` (pass/fail/skip per scenario, details, repo HEAD, whether attachment tools exist) and `context-map.html`. Override the location with `VERIFY_PROXY_EVIDENCE`. Proof standards: assert both the client-visible result and the side effect (upstream body, log line, counter). Mocks only at the provider boundary. The exit code is 1 when any scenario fails.
The PDF attachment scenario needs tesseract, poppler-utils and python3-PIL; without them it is reported as `skip` unless `CI` is set, in which case it runs and fails.

## Cleanup
The driver kills only the proxies it spawned and closes its mock. It deletes `scratch/` (logs, configs) unless `VERIFY_PROXY_KEEP_SCRATCH=1`, and keeps `results.json` and the HTML.
Never commit the evidence directory.

## Proven
2026-10-21 at 16c0615: 16 scenarios, 15 pass, 1 skip (PDF, no tesseract on the box). Re-run at the ADR 0021 change: 17 scenarios, 16 pass, 1 skip. A scratch break that made no-go forward findings (`src/scan.ts` decide) failed exactly `no-go: finding is 409 and never forwarded: status 200`; reverted.

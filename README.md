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
| `redact` (default) | replaced with `[REDACTED:rule]`; images blacked out; PDFs rebuilt as page images with findings blacked out (logged as `decision.rasterized`), `--no-page-redaction` or config `"pageRedaction": false` → 409 instead ([ADR 0013](docs/adr/0013-rasterize-pdfs-by-default.md)) |
| `no-go` | 409, upstream never called, response lists rule IDs only |
| `advisory` | original forwarded, finding logged |

Uninspectable attachment (corrupt, unsupported, remote URL, file id) → 422. A rebuilt PDF or image is inspected again; if a finding survives or a box cannot be mapped → 409. A rasterized PDF reaches the model as page images only (no text layer, more tokens, OCR-quality answers). Detects: Gitleaks key shapes (AWS, GitHub, OpenAI, Anthropic, GCP, Stripe, Slack, JWT incl. wrapped, private keys), e-mail, phone, PESEL, IBAN; also catches secrets split across text parts, OCR text, PDF text and metadata. Contextual rules cover AWS secret-access keys and session tokens, database URLs containing credentials (the whole URL is masked), `PGPASSWORD`/`MYSQL_PWD`/`db_password`, OAuth client secrets/refresh tokens, and structured credential fields including GCP service-account `private_key`. JSON inside tool arguments/results is inspected recursively; nested duplicate keys cannot be safely rewritten and block enforcing modes.
Prompt-injection signal: a few deterministic rules flag suspicious instructions in tool results and attachment text. It is logged only (rule + path), never blocks, and is easy to bypass ([ADR 0010](docs/adr/0010-advisory-prompt-injection-signal.md)).

## Request flow
One request through the proxy, in the order `src/proxy.ts` handles it:

```mermaid
stateDiagram-v2
  [*] --> Received
  Received --> Answered: GET /healthz /readyz /metrics, or /audit/stats with the admin key
  Received --> KeyCheck: everything else
  KeyCheck --> Refused: unknown virtual key 401, provider not allowed 403
  KeyCheck --> Refused: unsupported route 404
  KeyCheck --> Answered: GET /v1/models, passed through
  KeyCheck --> BodyCheck: POST chat/completions, responses, messages, count_tokens
  BodyCheck --> Refused: over 32 MiB 413, bad JSON or duplicate keys 400
  BodyCheck --> LogCheck: parsed
  LogCheck --> Refused: log torn or unwritable 503
  LogCheck --> Refused: model not allowed for this key 403
  LogCheck --> Inspecting: alias applied, every string, key and nested JSON scanned
  Inspecting --> Rejected: file id or remote URL (enforcing modes), no sandbox, missing tools, attachment not inspectable 422
  Inspecting --> Deciding: attachments OCR'd and scanned, injection signals noted
  Deciding --> Blocked: no-go finding, or a finding that cannot be masked 409
  Deciding --> LogRecheck: clean or advisory sends the original bytes, redact sends a masked copy
  LogRecheck --> Refused: log broke in the meantime 503
  LogRecheck --> Upstream: forwarded
  Upstream --> Recorded: deadline 408 or unreachable 502
  Upstream --> Streaming: response headers
  Streaming --> Recorded: response delivered unchanged
  Streaming --> Lost: append fails after delivery
  Rejected --> Recorded
  Blocked --> Recorded
  Recorded --> [*]
  Refused --> [*]
  Answered --> [*]
  Lost --> [*]
```

`Recorded` appends exactly one hash-chained `llm-call` record (ADR 0009); `count_tokens` is inspected the same way but skips both log checks and is never logged. `Refused` writes no record and forwards nothing. `Lost` is the residual window from ADR 0016: the client already has the response, so the failure is counted in `ai_audit_log_write_failures_total` and reported on stderr. The append lock and anchors are drawn in [docs/verification](docs/verification/README.md).

## Development
`npm run build` compiles with TypeScript (`tsc`); tests, demos and benchmarks use that output. `npm run build:fast` uses the pinned experimental [tsrs](https://github.com/oxc-project/tsrs) Rust compiler instead. It is about 15x faster, for local iteration. It needs `--skipLibCheck` because tsrs reports TS5115 for circular types in Zod dependency declarations.

## Log tools
`ai-audit verify [--anchors a.jsonl]` checks the chain (with anchors it also catches a swapped or truncated file) · `ai-audit anchor --anchors a.jsonl` (run daily, keep the anchors file somewhere else) · `ai-audit report --from 2026-10-01 --to 2026-11-01` · `ai-audit decide|approve|replay` for deterministic decisions (see Quinelings below).
Gateway: `ai-audit keygen --name agent` creates a virtual key (only its hash goes in `--config`, together with allowed `models`/`providers`). Response content: by default the log keeps only `outputHash` and tool-call `argsHash`; a key with `"logContent": true` (agents/services, `keygen --log-content`) also keeps the redacted output and tool args, e.g. `{"keys":[{"name":"quote-agent","sha256":"…","models":["*"],"logContent":true}]}`. Each line records `content: "hash"|"redacted"` ([ADR 0011](docs/adr/0011-response-content-per-key.md)). Real keys live in `AI_AUDIT_UPSTREAM_OPENAI_KEY` / `_ANTHROPIC_KEY`, which are only set in the proxy's environment. Config `aliases` (`{"fast":{"model":"gpt-4o-mini","upstream":"…"}}`) switch model or upstream without changing the client. `ai-audit stats --by key|model|hour`, or `GET /audit/stats?by=…` with `x-admin-key` (`AI_AUDIT_ADMIN_KEY`), shows tokens, cached tokens, latency and errors. A call whose provider reported no usage counts in `unknownUsage` (per field: `unknownInputUsage`/`unknownOutputUsage`), never as 0, and `tokensComplete: false` marks totals as a lower bound ([ADR 0012](docs/adr/0012-unknown-usage-never-zero.md)). OpenAI chat streams omit usage unless the client sends `"stream_options": {"include_usage": true}`; the proxy never adds it (ADR 0009), so set it in your clients. Also `/healthz`, `/readyz` and `/metrics`.

Context composition: each `llm-call` record has `context.bytes` per segment (`system`, `tools`, `user`, `assistant`, `toolResults`, `attachments`, `other`). When the provider reported prompt tokens, `context.tokens` splits that total across the segments by size (`tokenBasis: "provider-scaled"`). Otherwise it stays `"unknown"`. Sizes only, never content ([ADR 0017](docs/adr/0017-context-composition-metadata.md)).

Sessions: each record has `session: {id, turn, digest, parent, messages}`. A request whose message list starts with an earlier request's full list is that conversation's next turn. Edited history branches from the last shared turn. Digests are HMACs under a proxy-local key in `<log>.session-key` (mode 0600). No content or headers are used ([ADR 0018](docs/adr/0018-keyed-session-linking.md)).

Context map: `ai-audit context` lists sessions. `ai-audit context --session <id> --output session.html` writes a self-contained HTML page with two charts:
- a token timeline with provider-reported cache read, cache write, uncached input and output per request. Cache busts are marked, with the signal: P is a prefix rewrite, C is a provider cache drop.
- an arena map: one row per request, blocks in prompt order, coloured by how many turns they stayed unchanged at their position. A red marker shows the first changed offset, where every cached token behind it is lost.

The header shows peak tokens, cache hit rate, busts and the share of the preamble (tools and system). Sizes and keyed hashes only ([ADR 0020](docs/adr/0020-context-arena-and-cache-busts.md)). The image below is from a real gpt-4o-mini session sent through the proxy on 2026-10-21 by `examples/context-map/live.mjs` (11 requests, about 107k prompt tokens, under 0.01 USD). The agent reads ai-audit's own files with tools. At t5 a skill tool is inserted near the front of the tool list, then come a retry and an edited branch. In that run OpenAI reported 0 cached tokens at t5, so both signals fired. Every other request after t1 reused the previous prefix. To run it, start `ai-audit serve` with `AI_AUDIT_UPSTREAM_OPENAI_KEY` and `AI_AUDIT_CLIENT_KEY`, then run `AI_AUDIT_URL=http://127.0.0.1:8787 AI_AUDIT_CLIENT_KEY=... node examples/context-map/live.mjs`. `examples/context-map/generate.mjs` builds a similar page offline from fake data.

![Context map of a real gpt-4o-mini session through the proxy](docs/context-map.png)

Metrics: `GET /metrics` returns OpenMetrics text (Prometheus and VictoriaMetrics scrape it): `ai_audit_requests_total{route,decision,status}`, `ai_audit_request_duration_seconds` (histogram, 5 ms to 300 s), `ai_audit_log_unavailable_total`, `ai_audit_log_write_failures_total`, `ai_audit_injection_signals_total{rule}`, `ai_audit_upstream_responses_total{provider,class}`, `ai_audit_upstream_errors_total{provider,reason}`, `ai_audit_unknown_usage_total{provider,field}`, `ai_audit_attachments_inspected_total`, `ai_audit_sandbox_unavailable_total`, `ai_audit_sandbox_disabled` and attachment cache hits/misses. Labels come from fixed sets (unknown paths are `route="other"`), never from content. The endpoint has no auth, like `/healthz`: it exposes counts only. The proxy binds to 127.0.0.1 by default; if you expose it, restrict `/metrics` at the network layer. A ready-made stack (VictoriaMetrics, Grafana dashboard and alerts, ntfy) is in [examples/monitoring](examples/monitoring/README.md).

Every logged inspection decision (including blocks and attachment failures) carries `inspectionProfile`: `scannerVersion`, `rulesDigest`, `configDigest`, and a combined `digest`. The same immutable policy snapshot keys the attachment cache and sanitizes logged output. `ai-audit profile [--mode MODE] [--no-page-redaction] [--config FILE] [--allow-hashes FILE]` prints the current request profile for comparison. An allowlist file is a JSON array of exact secret SHA-256 hashes; entries are never logged. Older records remain valid without profiles; their policy cannot be reconstructed retroactively. See [ADR 0014](docs/adr/0014-versioned-inspection-profiles.md).

## Scrub retained histories
Export an inactive conversation history from your agent or support system, then write a separate sanitized copy:
```sh
ai-audit scrub --input history.jsonl --output history.redacted.jsonl
ai-audit scrub --input conversation.json --output conversation.redacted.json > scrub-receipt.json
```
The scanner covers prompts, assistant output, tool arguments/results, titles and other JSON text. JSON strings containing structured credential files are scanned too. `.json` inputs use one JSON document; other extensions default to JSONL (`--format json|jsonl` overrides). JSONL streams one record at a time, with a default 32 MiB byte limit per record (`--max-record-bytes N`); a JSON document has that same total limit. `--allow-hashes FILE` uses the same exact-value exemptions as the proxy.

Originals are opened read-only. The command re-inspects sanitized text, rejects detected source changes, and publishes a complete file with mode `0600` without overwriting existing paths. Malformed JSON/UTF-8, duplicate keys, secrets in object keys and chained audit records fail without publishing partial output. Receipts on stdout contain profile identity, record/change counts, per-rule counts and the sanitized output digest; errors contain static codes. Audit logs and external anchors remain intact. Database URL detection covers userinfo passwords and `password`/`passwd`/`pwd` query parameters, including percent-encoded parameter names.

This command is text-only: data URIs and Anthropic base64 payloads remain unchanged and **attachments are excluded**, as the receipt states. Metadata can be sanitized. It cleans the export; import it through your application's supported workflow to replace retained history there. It does not remove earlier copies from that application, backups or model providers. See [ADR 0015](docs/adr/0015-offline-history-scrubbing.md).

## Deploy (Docker)
`docker build -t ai-audit .` (default `BASE=node:26.12.1-slim`; `--build-arg BASE=platformatic/node-caged:26.10.0-slim` for V8 pointer compression) · `docker run -p 8787:8787 -v $PWD/data:/data ai-audit`. bwrap inside Docker needs `--cap-add SYS_ADMIN --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined`, otherwise attachments fail closed (422 `audit_sandbox_unavailable`).
Pointer compression, measured (`node bench/memory.mjs`, 5 runs each): JS heap −35% (6.3 vs 9.7 MB) but RSS unchanged (~180 MB both) and throughput −8%. The proxy holds almost no objects, so we keep the official image as default. Details: [ADR 0005](docs/adr/0005-official-node-image.md). Design decisions: [docs/adr](docs/adr/).

Proxy overhead, measured (`npm run bench:overhead`, loopback mock, Node 22, 3 runs): **+0.6–0.7 ms p50, ~+1.1 ms p95** per request at concurrency 1 (redaction included); at concurrency 16 one process caps at ~2000 req/s. Details: [docs/performance/2026-10-20](docs/performance/2026-10-20/README.md).

## Deterministic decisions with Quinelings (optional, Node ≥ 22)
**TL;DR: where Quinelings helps this project**
- **Proves why a decision was made, long after.** The log carries the decision program itself. `ai-audit replay` rebuilds it from the log alone and recomputes the result. The proxy proves what the AI said; the Quineling proves what was decided ([DESIGN.md](DESIGN.md), AI Act Art. 12 and 14).
- **Catches LLM mistakes in numbers and rules.** The LLM proposes, a fixed policy decides, a person approves. In the example below the LLM quotes 274 PLN, the policy computes 394 PLN, and the quote goes to review.
- **Runs logic an LLM wrote, safely.** A program always stops, cannot read files or the network, and is refused if it invents an operation or mixes up units. The built-in `replay()` runs JavaScript in `node:vm`, which is only safe for trusted code.
- **Keeps the hard cases.** Refused and failed evaluations are recorded too, and each decision links to the proxied LLM call (`llmCallId` is the proxy's `x-request-id`).
- **Not for** the proxy's request path (one run takes ~20 ms against the proxy's ~0.6 ms), finding secrets or PII, making the LLM itself reproducible, or real actions (they are only simulated).

[Quinelings](https://github.com/CharlesHoskinson/quinelings) (`@quinelings/agent-sdk`, Apache-2.0, vendored in `vendor/`) runs small calculation programs written in QDL, a JSON format: typed inputs with units, steps from a fixed set of about 30 operations (`arithmetic`, `compareValues`, `budget`, `allocate`, `action`, …) and outputs. The SDK compiles a program into self-contained source whose hash is its identity (`ql_…`), checks types and units before anything runs, and can rebuild and rerun it anywhere from that source alone. A program is data, not JavaScript, and `action` steps are only simulated.

### The SDK on its own
Save as `qdl-hello.mjs` in the repo root and run `node qdl-hello.mjs`:
```js
import { Session } from "@quinelings/agent-sdk/v1";

const session = new Session();
const program = session.compile({
  format: "qdl-intent", version: 1, name: "Quote with a floor",
  thought: "price = max(machining minutes × shop rate, 150 PLN)",
  inputs: [
    { id: "minutes", name: "minutes", type: { kind: "number", unit: "min", min: 0 } },
    { id: "rate", name: "rate", type: { kind: "number", unit: "PLN*min^-1", min: 0 } },
    { id: "floor", value: 150, type: { kind: "number", unit: "PLN", min: 0 } },
  ],
  steps: [
    { id: "machining", op: "arithmetic", inputs: ["minutes", "rate"], params: { kind: "mul" } },
    { id: "price", op: "arithmetic", inputs: ["machining", "floor"], params: { kind: "max" } },
  ],
  outputs: ["price"],
});
const run = session.run({ artifactId: program.id, requestId: "quote-1", inputs: { minutes: 42, rate: 4.5 } });
console.log(run.result.occurrences[0].outputs);
console.log(new Session().recover({ source: program.source }).id === program.id);
```
It prints `[ 189 ]`, then `true`: a fresh session rebuilt the same program from its source. Bad programs and inputs are refused with a `QdlError` before anything runs: mixed-up units (`unit-type`), a value outside its declared range such as `minutes: -5` (`refinement`), a missing input (`missing-input`) or an operation that does not exist, for example an LLM inventing a `fetch` step (`invalid-input`). Errors at run time, such as division by zero, give a `failed` run with a diagnostic.

### With ai-audit: the LLM proposes, the policy decides
```mermaid
sequenceDiagram
  participant A as Your agent
  participant P as ai-audit proxy
  participant M as LLM provider
  participant L as audit.jsonl
  A->>P: chat request with the part description
  P->>M: inspected request, secrets and PII masked
  M-->>P: tool call propose_quote
  P-->>A: unchanged response + x-request-id
  P->>L: llm-call record, id = x-request-id
  A->>A: recordQdl or ai-audit decide runs the policy
  A->>L: decision with llmCallId = x-request-id, plus its :qdl step
  A->>L: review from approve
```
The policy is [`examples/quineling-quote/policy.json`](examples/quineling-quote/policy.json): price from CAM minutes, shop rate, setup and material with a 150 PLN floor; auto-approve only quotes up to 1000 PLN where the LLM's own price is within 5%, otherwise route to human review. Run the proxy with `node dist/src/cli.js serve --log audit.jsonl`, then save this as `quote.mjs` in the repo root and run `OPENAI_API_KEY=… node quote.mjs`. The agent writes to the same log file as the proxy; the append lock keeps one chain ([ADR 0016](docs/adr/0016-fail-closed-when-log-unavailable.md)).
```js
import { readFileSync } from "node:fs";
import { AuditLog } from "./dist/src/audit.js";
import { recordQdl, replayQdl } from "./dist/src/qdl.js";

const policy = JSON.parse(readFileSync("examples/quineling-quote/policy.json", "utf8"));
const res = await fetch("http://127.0.0.1:8787/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "x-audit-system-id": "cad-quote", "x-audit-use-case": "machining-quote" },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Quote: flange DN100, S355, CAM estimate 42 min, blank 85 PLN, setup 120 PLN." }],
    tools: [{ type: "function", function: { name: "propose_quote", parameters: { type: "object",
      properties: { minutes: { type: "number" }, material: { type: "number" }, setup: { type: "number" }, price: { type: "number" } },
      required: ["minutes", "material", "setup", "price"] } } }],
    tool_choice: { type: "function", function: { name: "propose_quote" } },
  }),
});
const llmCallId = res.headers.get("x-request-id");
const proposal = JSON.parse((await res.json()).choices[0].message.tool_calls[0].function.arguments);

const log = new AuditLog("audit.jsonl");
const { decision, step } = await recordQdl(log,
  { systemId: "cad-quote", useCase: "machining-quote", input: "flange DN100", llmCallId },
  { intent: policy },
  { minutes: proposal.minutes, rate: 4.5, setup: proposal.setup, material: proposal.material, llmPrice: proposal.price });
if (step.qdl.status !== "completed") throw new Error(`policy ${step.qdl.status}: ${step.qdl.error.code}`);
const [price, llmAgrees, autoApprove] = decision.output;
log.approve(decision.id, "A. Nowak", "approved", `LLM proposed ${proposal.price} PLN, policy says ${price} PLN`);
console.log({ llmPrice: proposal.price, price, llmAgrees, autoApprove, reproduced: (await replayQdl(log, decision.id)).reproduced });
```
The model never sees the shop rate, so its price is a guess. When it proposes 274 PLN, the script prints `{ llmPrice: 274, price: 394, llmAgrees: false, autoApprove: false, reproduced: true }`: the policy's 394 PLN (42 × 4.50 + 120 + 85) is more than 5% away from 274, so the quote goes to review and a person approves 394. On a fresh log, `node dist/src/cli.js verify --log audit.jsonl` then reports `OK: 4 records, chain intact`:

| record | written by | holds |
|---|---|---|
| `llm-call` | proxy | findings as rule + path, tool call names, output hash, usage; no prompt text |
| `decision` | `recordQdl` or `decide` | `llmCallId`, a hash of `input`, the policy outputs (only when completed) |
| `decision` (id `…:qdl`) | `recordQdl` or `decide` | `status` (completed, refused or failed), the error code and path unless completed, the program source (or the refused intent), its inputs, `inputHash`, `outputsHash` |
| `review` | `log.approve` or `approve` | reviewer, approved/overridden/rejected, note |

`replayQdl(log, id)` takes the decision id or its `:qdl` id, rebuilds the program from the log in a fresh session and returns `reproduced: true` when the outcome matches, refusals and failures included. Edit a logged input and `verify` reports a broken chain; replaying the edited record gives `reproduced: false`. `npm run example:quote` runs the same policy offline (add `-- --live` for one real gpt-4o-mini call).

### From the command line
Any script or agent, in any language, can do the same without JavaScript ([ADR 0023](docs/adr/0023-decision-records-cli-and-outcomes.md)). Take `REQUEST_ID` from the `x-request-id` header of the proxied call; `--llm-call` must name an `llm-call` record already in the log.
```sh
node dist/src/cli.js decide --log audit.jsonl --policy examples/quineling-quote/policy.json \
  --inputs examples/quineling-quote/inputs.json --system-id cad-quote --use-case machining-quote --llm-call "$REQUEST_ID"
node dist/src/cli.js approve --log audit.jsonl --decision "$DECISION" --reviewer "A. Nowak" --verdict approved --note "policy price 394 PLN"
node dist/src/cli.js replay --log audit.jsonl --decision "$DECISION"
```
Each command prints one JSON line:
```
{"decision":"1e23e101-…","status":"completed","outputs":[394,false,false,{"status":"skipped","action":"auto-approve-quote","payload":394},{"status":"simulated","action":"route-to-human-review","payload":394}]}
{"review":"a6e8fd3f-…","decision":"1e23e101-…","verdict":"approved"}
{"decision":"1e23e101-…","reproduced":true,"status":"completed","outputs":[394,false,false,…]}
```
Exit codes: `0` completed or reproduced; `1` recorded but refused or failed, or not reproduced; `2` nothing written (bad arguments, unknown id, SDK missing). A refusal is still a record: inputs with `minutes: -5` print `{"decision":"…","status":"refused","error":{"code":"refinement","path":"$.bindings.minutes"}}` and exit 1, and `replay` later reproduces the refusal. `ai-audit report` lists QDL outcomes (completed, refused, failed) next to the decision counts.

Limits today:
- Every decision stores the whole program again (about 21 KB for the 14-step policy above) and its inputs as given, without the secret/PII scanner. Keep personal data out of the inputs.
- `replay` covers QDL decisions. JavaScript steps recorded with `log.record({ step })` replay only through `replay()` in the process that recorded them, because their source registry is in memory.
- The SDK is a 1.0.0 tarball that is not published to npm, and it pulls in about 100 packages (zod, the MCP and A2A SDKs, express). It is an optional dependency: the proxy runs without it, and `decide` and `replay` then exit 2 with `audit_qdl_unavailable` ([ADR 0004](docs/adr/0004-quinelings-optional.md)).

## Limits
- Attachments need tesseract, poppler, python3-PIL, prlimit (util-linux, so Linux only) and a working bwrap. Workers run in bwrap with no network, all capabilities dropped and an empty environment. Resource limits are preflight's: worker RLIMIT_DATA 4 GiB, CPU 90 s, files 64 MiB, 128 open files; each native tool also gets RLIMIT_AS 1.5 GiB; 120 s wall clock; 16 MiB output caps for the worker and each tool. Exceeding any of them gives 422. Read-only mounts are limited to `/usr`, the Node install and the worker script, so a worker cannot read the log, the session key, the config or your home directory. Without a usable sandbox, attachments get 422 `audit_sandbox_unavailable` and `/readyz` is 503. `--unsafe-no-sandbox` (development only) runs workers unsandboxed and records `decision.sandbox: "disabled"` ([ADR 0021](docs/adr/0021-attachment-sandbox-hardening.md)).
- Cache is in memory only. No OpenAI↔Anthropic translation. No person-name detection.
- Only PNG/JPEG/WebP/GIF images and PDF files are inspected.
- Requests rejected with 401/403 are not written to the audit log.
- AI Act mapping in DESIGN.md is unverified and not legal advice.

## License
MIT. Detection rules adapted from Gitleaks; see THIRD_PARTY_NOTICES.md.

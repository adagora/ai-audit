# Workflow cockpit

The local console has two modes. The synthetic page runs fixed checks through the proxy with fake keys and a mock provider. The real page calls OpenAI through a separate `ai-audit serve` process. The provider key never goes to browser JavaScript. Both pages show each request's client context, the after-policy view, role byte composition, decision, usage, history and telemetry. The real page's after-policy view is scanner-derived; its audit log does not store prompt values.

## Real OpenAI workflow

```sh
npm run example:workflow:real
```

The launcher reads `AI_AUDIT_UPSTREAM_OPENAI_KEY` or `OPENAI_API_KEY` from the environment, then `OPENAI_API_KEY` from the repository's untracked `.env`. If none is set, it prompts for the key in the terminal without echoing it. Open `http://127.0.0.1:8791`, choose an OpenAI model available to your API key, and send two prompts. The second request carries the previous turn so the proxy can link the session. Use **New conversation** to start another one. The page uses a generated virtual client key, so OpenAI sees the provider key only from the proxy. Actual API use can incur charges.

The terminal prints the proxy base URL, a generated `aia-` virtual key, and the real audit log path. Keep the terminal open. The proxy runs on `http://127.0.0.1:8792/v1` by default; set `WORKFLOW_REAL_PROXY_PORT` and `WORKFLOW_REAL_PAGE_PORT` before launch to use other ports. The page does not serve real log data. Inspect it offline:

```sh
node dist/src/cli.js verify --log live/workflow-real.jsonl
node dist/src/cli.js context --log live/workflow-real.jsonl
node dist/src/cli.js workbench --log live/workflow-real.jsonl --output /private/tmp/ai-audit-real-workbench.html
```

Choose a new workbench output filename for each export. The generated HTML is private and should be opened locally. It summarizes recorded metadata, including scan history, sessions, context composition and Quinelings observation.

## Use UniiChat as a real client

While the real workflow launcher is running, open a second terminal and use the `aia-` key printed by the launcher:

```sh
cd /Users/gora/AI_Project/EternalChat/uniichat
export OPENAI_API_KEY='aia-key-printed-by-the-workflow-launcher'
export UNII_OPENAI_BASE='http://127.0.0.1:8792/v1'
export UNII_VENDORS='openai-api'
export UNII_PICK='openai-api:YOUR_MODEL:medium:slow'
export UNII_COMPACTOR='openai-api:YOUR_MODEL:medium:slow'
bun Server.ts
```

Open `http://127.0.0.1:8788`. These variables configure UniiChat's OpenAI calls through ai-audit; the `OPENAI_API_KEY` value in this terminal is the generated **virtual** key, not your provider key. UniiChat's `/v1/responses` requests pass through the proxy. Other UniiChat routes, such as `/v1/audio/transcriptions`, are outside the proxy's current route set. UniiChat keeps its own conversation history, while ai-audit keeps metadata in its audit log.

## Synthetic coverage

```sh
npm run example:workflow
```

Open `http://127.0.0.1:8790` for the dashboard. It refreshes every two seconds and shows request rates by outcome, latency, scan findings, injection signals, tool-call gate results, refusals, usage and the audit chain of all three synthetic proxies. Its test bench runs each feature check against the real proxy handler and marks it pass or fail against the expected result; **Run all checks** runs every one. Select a check or a log row to see the stored, content-free record. The request console described below is at `http://127.0.0.1:8790/console`.

The fixed scenarios in the console cover routing and keys, policy actions, injection signals, attachments, OpenAI and Anthropic streams, sessions, unknown usage, Quinelings observation, QDL execution, signed review, telemetry, anchors and unavailable logging. The **Client input** and **After policy** tabs display the exact synthetic request and the body observed at the mock upstream. A blocked request has no forwarded body. **Run QDL** executes the example policy and exports a portable SVG and JSON receipt. **Observe Quineling** only identifies a tool result in traffic. **Run HTTP suite** starts the real-proxy verification driver. **Download synthetic workbench** exports metadata from the synthetic log. The coverage table names the verification path and any local limitation for each feature. For a longer QDL example, use `npm run example:lab` and the [decision workflow](../../docs/decisions.md).

## Public static showcase

```sh
npm run example:workflow:export -- /private/tmp/ai-audit-showcase
```

The command reruns every synthetic scenario and writes a standalone static site into the given directory. Open it through a static server to inspect the recorded results. Its controls replay recorded synthetic evidence; they do not send new requests. The export includes the synthetic workbench, generated QDL SVG, JSON and signature artifacts, and the Grafana dashboard and alert rules. It contains no provider key, live proxy endpoint or real audit log. Inspect the output before publishing it.

To publish to a Cloudflare Pages project after reviewing the generated directory:

```sh
npx wrangler pages deploy /private/tmp/ai-audit-showcase --project-name ai-audit-showcase
```

[Cloudflare Pages direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) can host these static files on the Free plan. The full Node proxy is a separate process and is not deployed by this command. It uses persistent audit files, process capabilities and attachment inspection that cannot be carried over by merely copying it into a Pages Function or Worker. Keep the real OpenAI workflow local for an interview or host a separately adapted backend with its own key storage, durable logging and access control.

## Reading QDL evidence

The QDL receipt records a bounded, deterministic calculation: source identity, input values, output, step trace and a visual index. A verifier can replay the calculation from the portable JSON. The SVG helps a person inspect the path; it is a presentation of the trace, not a proof that the inputs were true. A signed review can bind a verdict to a receipt, but the viewer must already trust the reviewer's public key. QDL is useful when a rule decision must be repeated, reviewed and shared. Ordinary chat traffic can use the proxy's inspection and audit trail without QDL.

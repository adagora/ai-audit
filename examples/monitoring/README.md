# Monitoring example

VictoriaMetrics scrapes the proxy's `/metrics`. Grafana shows a live operations and evidence dashboard, evaluates alert rules, and ntfy delivers the alerts. Everything is provisioned from files in this folder, and all images are pinned. The dashboard source is `grafana/build-dashboard.mjs`; run `node grafana/build-dashboard.mjs` to regenerate its provisioned JSON.

| Service | Image | URL |
|---|---|---|
| proxy | built from `../../Dockerfile` | http://127.0.0.1:8787 |
| mock-upstream | `node:26.12.1-slim` | internal only |
| victoriametrics | `victoriametrics/victoria-metrics:v1.154.1` | http://127.0.0.1:8428 |
| grafana | `grafana/grafana:13.2.4` | http://127.0.0.1:3000 |
| ntfy | `binwiederhier/ntfy:v2.32.0` | http://127.0.0.1:8080 |

The proxy forwards to `mock-upstream`, so no provider keys are needed and nothing leaves the host.

For real Codex traffic, use the `docker-compose.real.yml` override. It changes the proxy upstream to OpenAI, injects the provider key only into the proxy, and keeps Grafana scraping that same proxy. The mock service may start because it is a dependency of the base demo Compose file, but it receives no Codex requests.

For a native run outside Docker, start the mock with `MOCK_UPSTREAM_HOST=127.0.0.1` so it listens on loopback only.

For a single real Codex session without Docker, run `npm run codex:proxy` from the repository root. It starts a temporary real-provider proxy on port 8788 and launches Codex. Set `AI_AUDIT_PORT=8787` after stopping the demo proxy if you want the native VictoriaMetrics scrape to follow that Codex session. The launcher does not start Grafana or VictoriaMetrics.

## Run

```sh
cd examples/monitoring
NTFY_TOPIC=ai-audit-alerts GRAFANA_ADMIN_PASSWORD=change-me docker compose up -d --build
```

Real-provider mode, after creating an `aia-` key with `node dist/src/cli.js keygen --name codex`:

```sh
export AI_AUDIT_UPSTREAM_OPENAI_KEY='your-OpenAI-API-key'
export AI_AUDIT_CLIENT_KEY='your-aia-virtual-key'
export NTFY_TOPIC='choose-a-private-topic'
export GRAFANA_ADMIN_PASSWORD='choose-a-password'
docker compose -f docker-compose.yml -f docker-compose.real.yml up -d --build
```

Run this from `examples/monitoring`. Start Codex from a second shell with the custom provider command in the [README](../../README.md#quick-example), using the same `aia-` key. `docker compose -f docker-compose.yml -f docker-compose.real.yml logs -f proxy` follows the proxy. The dashboard remains at `http://127.0.0.1:3000`.

- Grafana: log in as `admin` with `GRAFANA_ADMIN_PASSWORD`. The dashboard is in the `ai-audit` folder.
- ntfy: open http://127.0.0.1:8080/ai-audit-alerts, or subscribe to the topic in the ntfy app.
- `NTFY_TOPIC` selects the topic. Anyone who knows a topic name can read it, so use a hard-to-guess name if ntfy is reachable from other machines.

## Dashboard and evidence

The dashboard covers request decisions and latency, audit-log failures, prompt-injection signals, attachment and sandbox state, session-index health, upstream failures, missing token usage, and observed Quinelings tool activity. The selected Grafana time range controls the overview counts. A scrape-health panel separates a healthy proxy from missing telemetry.

`/metrics` has bounded aggregate labels. It does not contain session IDs, individual context maps, log entries, token totals, QDL verdicts, or source values. Those belong in the local hash-chained log. Use the dashboard to find a time window and failure mode, then use the CLI for the individual evidence:

```sh
docker compose exec proxy node dist/src/cli.js verify --log /data/audit.jsonl
docker compose exec proxy node dist/src/cli.js context --log /data/audit.jsonl
docker compose exec proxy node dist/src/cli.js context --log /data/audit.jsonl --session SESSION_ID --output /data/session.html
docker compose cp proxy:/data/session.html ./session.html
docker compose exec proxy node dist/src/cli.js workbench --log /data/audit.jsonl --output /data/workbench.html
docker compose cp proxy:/data/workbench.html ./workbench.html
docker compose exec proxy node dist/src/cli.js report --log /data/audit.jsonl --from 2026-10-27T00:00:00Z --to 2026-10-28T00:00:00Z
```

For recorded session-policy comparisons, use `lab --session SESSION_ID --baseline-limit 2 --candidate-limit 3 --output /data/comparison.html`. For a QDL decision, use `receipt --decision DECISION_ID --format svg --output /data/decision.svg` and copy the file out with `docker compose cp`. The workbench is private; review a selected receipt before sharing it. SVG receipts describe one recorded QDL decision; the Grafana Quinelings panel counts observed tool traffic only.

To showcase a reviewed decision with a signed checkpoint, create an Ed25519 key pair with `attest-keygen`, record a review with `approve`, then export `decision.svg` and `decision.attestation.json` with `receipt` and `attest`. Run `verify-attestation` with the public key and pass the same three files to `workbench --input decision.svg --attestation decision.attestation.json --public-key reviewer.pub.pem` to show the signed review record in the local page. Keep the private key outside the Compose volume; the [README signing walkthrough](../../README.md#sign-a-reviewed-decision-and-checkpoint) has the full commands. A recipient must obtain the public key independently.

## Showcase traffic

`traffic.sh` uses fake messages and a mock provider. It accepts `ok`, `injection`, `5xx`, `no-usage`, `session`, and `quineling`. The `session` case sends two linked turns so `context` has a map. The `quineling` case sends a synthetic tool result to demonstrate observation metrics; it does not execute a QDL program or create a decision receipt.

```sh
./traffic.sh session
./traffic.sh quineling
./traffic.sh no-usage
./traffic.sh 5xx
./traffic.sh injection
```

Wait for the next 15-second scrape, then refresh Grafana. The sessions command above lists the fake session ID. A receipt needs a real `decide` record, as shown in [the policy workflow](../../docs/decisions.md).

## Alert rules

| Rule | Condition | Severity |
|---|---|---|
| Proxy metrics unavailable | scrape missing for 2 min, including no data | critical |
| Audit log cannot take records | refused (503) + lost records in 5 min > 0 | critical |
| Session index rebuild failed | failures since proxy start > 0 | warning |
| Prompt-injection signal spike | more than 5 signals in 10 min (one request can fire several rules) | warning |
| Upstream 5xx ratio above 5% | 5xx / all upstream responses over 5 min > 5%, for 5 min | warning |
| Unknown token usage rising | calls without usage / 2xx calls over 30 min > 20%, for 15 min | warning |

Rules evaluate every minute. The defaults are in `grafana/provisioning/alerting/rules.yml`.

## Test an alert

`traffic.sh` sends requests through the proxy: `ok`, `injection`, `5xx` (the mock answers 503) or `no-usage` (the mock omits usage).

```sh
for i in 1 2 3 4 5 6; do ./traffic.sh injection; done
```

The injection alert fires at the next evaluation, within about 1 minute plus the scrape interval. A notification appears on the ntfy topic.

To test the critical rule, tear the last line of the log. The proxy then refuses requests with 503 and does not forward them (ADR 0016):

```sh
docker compose exec proxy sh -c 'printf "{" >> /data/audit.jsonl'
./traffic.sh ok
```

To recover, run `docker compose down -v`. This deletes the example's log volume.

The 5xx and unknown-usage rules have a `for` period. Send traffic for at least 5 or 15 minutes, for example `while :; do ./traffic.sh 5xx; ./traffic.sh ok; sleep 5; done`.

## Validation status

The dashboard was run locally on macOS with Grafana 13.2.4, VictoriaMetrics 1.155.0, the proxy, and the mock provider. All 21 panel queries ran without errors. Grafana loaded the dashboard and six alert rules. Fake traffic produced linked sessions, a Quinelings result, missing usage, a 503 upstream response, and injection signals. The local log verified, and a synthetic injection alert reached a localhost webhook receiver.

Docker Compose and delivery through an ntfy server have not been tested here because Docker is unavailable. The macOS Homebrew `ntfy` package provides the client but not the server. The local smoke test used a temporary webhook receiver instead.

# Monitoring example

VictoriaMetrics scrapes the proxy's `/metrics`. Grafana shows a dashboard and evaluates alert rules, and ntfy delivers the alerts. Everything is provisioned from files in this folder, and all images are pinned.

| Service | Image | URL |
|---|---|---|
| proxy | built from `../../Dockerfile` | http://127.0.0.1:8787 |
| mock-upstream | `node:26.10.0-slim` | internal only |
| victoriametrics | `victoriametrics/victoria-metrics:v1.154.1` | http://127.0.0.1:8428 |
| grafana | `grafana/grafana:13.2.4` | http://127.0.0.1:3000 |
| ntfy | `binwiederhier/ntfy:v2.32.0` | http://127.0.0.1:8080 |

The proxy forwards to `mock-upstream`, so no provider keys are needed and nothing leaves the host.

## Run

```sh
cd examples/monitoring
NTFY_TOPIC=ai-audit-alerts GRAFANA_ADMIN_PASSWORD=change-me docker compose up -d --build
```

- Grafana: log in as `admin` with `GRAFANA_ADMIN_PASSWORD`. The dashboard is in the `ai-audit` folder.
- ntfy: open http://127.0.0.1:8080/ai-audit-alerts, or subscribe to the topic in the ntfy app.
- `NTFY_TOPIC` selects the topic. Anyone who knows a topic name can read it, so use a hard-to-guess name if ntfy is reachable from other machines.

## Alert rules

| Rule | Condition | Severity |
|---|---|---|
| Audit log cannot take records | refused (503) + lost records in 5 min > 0 | critical |
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

The compose stack has not been started here because no Docker was available. What was checked:
- All YAML files parse, and the dashboard JSON parses.
- The proxy, the mock and VictoriaMetrics v1.154.1 ran as local binaries. VictoriaMetrics scraped the proxy with this scrape config.
- Every alert and panel query ran against that data without errors.
- After the traffic above, the log, injection and unknown-usage conditions were true, and the 5xx ratio was 0.5.

Grafana provisioning and ntfy delivery were not tested.

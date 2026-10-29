import { writeFileSync } from "node:fs";

const datasource = { type: "prometheus", uid: "victoriametrics" };
const panels = [];
let id = 0;

const target = (expr, legendFormat, refId = "A", instant = false) => ({
  refId,
  datasource,
  expr,
  legendFormat,
  ...(instant ? { instant: true, range: false } : {}),
});

const panel = (type, title, x, y, w, h, targets, unit, description, extra = {}) => {
  panels.push({
    id: ++id,
    type,
    title,
    description,
    datasource,
    gridPos: { x, y, w, h },
    targets,
    fieldConfig: { defaults: { ...(unit && { unit }), ...(extra.thresholds && { thresholds: extra.thresholds }) }, overrides: [] },
    options: type === "stat" ? { reduceOptions: { calcs: ["lastNotNull"], fields: "", values: false }, colorMode: extra.thresholds ? "background" : "none", graphMode: "none", textMode: "auto" } : {},
  });
};

const heading = (title, y, content) => {
  panels.push({
    id: ++id,
    type: "text",
    title,
    gridPos: { x: 0, y, w: 24, h: 2 },
    options: { mode: "markdown", content },
  });
};

const stat = (title, x, y, w, expr, unit, description, thresholds) =>
  panel("stat", title, x, y, w, 4, [target(`${expr} or vector(0)`, title, "A", true)], unit, description, { thresholds });

const chart = (title, x, y, w, targets, unit, description) =>
  panel("timeseries", title, x, y, w, 8, targets, unit, description);

const badWhenPositive = { mode: "absolute", steps: [{ color: "green", value: null }, { color: "red", value: 0.0000001 }] };
const badWhenDown = { mode: "absolute", steps: [{ color: "red", value: null }, { color: "green", value: 1 }] };

heading("Live overview", 0, "Aggregate signals from the proxy. Pick a time range above; counts use that range, and time series use Grafana's scrape-aware rate interval.");
stat("Scrape", 0, 2, 4, "min(up{job=\"ai-audit\"})", "none", "1 means VictoriaMetrics can scrape the proxy; 0 means it cannot. This does not prove the audit log is valid.", badWhenDown);
stat("LLM calls", 4, 2, 5, 'sum(increase(ai_audit_requests_total{route=~"/v1/(chat/completions|responses|messages)"}[$__range]))', "short", "Completed LLM requests during the selected time range, including rejected requests.");
stat("Blocked", 9, 2, 5, 'sum(increase(ai_audit_requests_total{decision=~"block|reject",route=~"/v1/(chat/completions|responses|messages)"}[$__range]))', "short", "Policy blocks and inspection rejections during the selected time range. A block is not an upstream error.");
stat("Log errors", 14, 2, 5, "(sum(increase(ai_audit_log_unavailable_total[$__range])) or vector(0)) + (sum(increase(ai_audit_log_write_failures_total[$__range])) or vector(0))", "short", "Requests refused because the log was unavailable, plus records lost after delivery. Inspect the log with ai-audit verify.", badWhenPositive);
stat("Sandbox off", 19, 2, 5, "max(ai_audit_sandbox_disabled)", "none", "1 means attachment workers run without a sandbox on this proxy. A healthy scrape is required to trust this value.", badWhenPositive);
chart("Requests by decision", 0, 6, 12, [target('sum by (decision) (rate(ai_audit_requests_total{route=~"/v1/(chat/completions|responses|messages)"}[$__rate_interval]))', "{{decision}}")], "reqps", "Decision labels include forward, forward-redacted, block, reject and requests that could not be classified.");
chart("End-to-end latency", 12, 6, 12, [0.5, 0.95, 0.99].map((q, i) => target(`histogram_quantile(${q}, sum by (le) (rate(ai_audit_request_duration_seconds_bucket[$__rate_interval])))`, `p${Math.round(q * 100)}`, String.fromCharCode(65 + i))), "s", "Includes request processing and streamed response delivery for all routes.");

heading("Safety and evidence collection", 14, "These are event counts, not audit records. Prompt-injection signals are advisory; they are not proof that an attack succeeded.");
chart("Prompt-injection signals by rule", 0, 16, 8, [target('sum by (rule) (increase(ai_audit_injection_signals_total{rule!=""}[10m]))', "{{rule}}")], "short", "Rolling ten-minute signal count. One request may trigger several rules.");
chart("Audit-log failures", 8, 16, 8, [target("sum(increase(ai_audit_log_unavailable_total[5m]))", "refused (503)"), target("sum(increase(ai_audit_log_write_failures_total[5m]))", "lost after delivery", "B")], "short", "Rolling five-minute counts. Any positive value needs investigation.");
chart("Attachment inspection and sandbox refusals", 16, 16, 8, [target("sum(rate(ai_audit_attachments_inspected_total[$__rate_interval]))", "inspected"), target("sum(rate(ai_audit_sandbox_unavailable_total[$__rate_interval]))", "sandbox unavailable", "B")], "reqps", "Inspected attachments and requests refused because the attachment sandbox was unavailable.");

heading("Upstream and usage quality", 24, "Provider status, connectivity, and missing token usage are separate failure modes. Missing usage must not be read as zero tokens.");
chart("Upstream 5xx share since start", 0, 26, 8, [target('sum(ai_audit_upstream_responses_total{class="5xx"}) / clamp_min(sum(ai_audit_upstream_responses_total), 1)', "5xx share")], "percentunit", "Fraction of upstream HTTP responses in the 5xx class since this proxy process started. The alert uses a rolling five-minute window.");
chart("Unknown usage share since start", 8, 26, 8, [target('sum by (field) (ai_audit_unknown_usage_total{field!=""}) / ignoring(field) group_left clamp_min(sum(ai_audit_upstream_responses_total{class="2xx"}), 1)', "{{field}}")], "percentunit", "Share of successful responses missing input or output usage since this proxy process started. Each field is counted independently.");
chart("Upstream errors without a response", 16, 26, 8, [target('sum by (provider, reason) (ai_audit_upstream_errors_total{provider!=""})', "{{provider}} {{reason}}")], "short", "Network failures and deadlines before an upstream HTTP response, counted since this proxy process started.");

heading("Quinelings and session workflow", 34, "Quinelings activity is observed in LLM tool traffic. Counts do not mean a decision was approved, replayed, or verified.");
chart("Observed Quinelings activity since start", 0, 36, 12, [target('sum by (where, op) (ai_audit_quineling_events_total{where!=""})', "{{where}} · {{op}}")], "short", "Observed tool calls and results by operation since this proxy process started. This does not count direct CLI decisions.");
chart("HTTP outcomes by LLM route", 12, 36, 12, [target('sum by (route, status) (rate(ai_audit_requests_total{route=~"/v1/(chat/completions|responses|messages)"}[$__rate_interval]))', "{{route}} · {{status}}")], "reqps", "Shows which API route returned each HTTP status. Use request IDs and the local log for individual cases.");

heading("Session linking and attachment cache", 44, "Session detail stays in the local log. These two process-level indicators show whether the session index rebuilt and whether attachment inspection is reusing cached work.");
stat("Session index rebuild failures", 0, 46, 12, "sum(ai_audit_session_index_rebuild_failures_total)", "short", "Failures since the current proxy process started. A positive value can leave session links incomplete after restart.", badWhenPositive);
stat("Attachment cache hit share", 12, 46, 12, "sum(ai_audit_attachment_cache_hits) / clamp_min(sum(ai_audit_attachment_cache_hits) + sum(ai_audit_attachment_cache_misses), 1)", "percentunit", "Cache hits divided by hits plus misses since the current proxy process started. No inspections yet displays as zero.");

heading("Tool-call gate and refusals", 50, "Gate results count proposed tool calls by mode and result; in enforce mode a held call never reaches the client. Refusals happen before inspection and are separate content-free audit records.");
chart("Tool calls by gate result", 0, 52, 12, [target('sum by (mode, result) (increase(ai_audit_action_gate_total{result!=""}[5m]))', "{{mode}} · {{result}}")], "short", "Rolling five-minute count of proposed calls to gated tools or to tools outside a key's list (ADR 0046, 0048).");
chart("Refusals before inspection", 12, 52, 12, [target('sum by (status) (increase(ai_audit_requests_total{decision="none",status=~"4..",route=~"/v1/.*|other"}[5m]))', "{{status}}"), target("sum(increase(ai_audit_refusals_suppressed_total[5m]))", "over record limit", "B")], "short", "401, 403, 404, 413 and 400 before inspection, and refusals counted only in the per-minute summary record (ADR 0047).");

heading("Use cases", 60, "Present only when gateway.json has a useCases table (ADR 0053). Labels are row names from that table, or none for requests that name no row. Tiers, row versions and reviews per use case are in the report and the workbench.");
chart("Requests by use case and decision", 0, 62, 12, [target('sum by (use_case, decision) (increase(ai_audit_requests_total{use_case!="",route=~"/v1/(chat/completions|responses|messages)"}[5m]))', "{{use_case}} · {{decision}}")], "short", "Rolling five-minute count. decision none with a 4xx status is a refusal, for example a row switched off or a use case the key may not name.");
chart("Tool calls held, by use case", 12, 62, 12, [target('sum by (use_case, mode) (increase(ai_audit_action_gate_total{use_case!="",result="hold"}[5m]))', "{{use_case}} · {{mode}}")], "short", "Rolling five-minute count of proposed tool calls held by the gate, the key's tool list or the use case's tool list.");

heading("Investigate, report, share", 70,"Grafana holds bounded aggregate metrics. The hash-chained local log holds session links, context sizes, decision records, and evidence. Keep those records out of metric labels.");
panels.push({
  id: ++id,
  type: "text",
  title: "From a signal to an evidence package",
  gridPos: { x: 0, y: 72, w: 24, h: 9 },
  options: {
    mode: "markdown",
    content: [
      "| Need | Local command inside the proxy container |",
      "|---|---|",
      "| Audit-log integrity | `node dist/src/cli.js verify --log /data/audit.jsonl` |",
      "| Browse all evidence | `node dist/src/cli.js workbench --log /data/audit.jsonl --output /data/workbench.html` |",
      "| Find sessions | `node dist/src/cli.js context --log /data/audit.jsonl` |",
      "| Context map for one session | `node dist/src/cli.js context --log /data/audit.jsonl --session ID --output /data/session.html` |",
      "| Time-bounded report | `node dist/src/cli.js report --log /data/audit.jsonl --from ISO --to ISO` |",
      "| Compare session policy limits | `node dist/src/cli.js lab --log /data/audit.jsonl --session ID --baseline-limit 2 --candidate-limit 3 --output /data/comparison.html` |",
      "| Share a QDL decision | `node dist/src/cli.js receipt --log /data/audit.jsonl --decision ID --format svg --output /data/decision.svg` |",
      "",
      "For Docker, use `docker compose exec proxy` before each command and export generated files with `docker compose cp proxy:/data/workbench.html ./workbench.html`. For a native run, use the CLI directly and replace `/data/audit.jsonl` with the local log path. The workbench is private; review a selected receipt before sharing it. This dashboard cannot list individual sessions, token totals, log lines, or QDL verdicts because `/metrics` does not publish them.",
    ].join("\n"),
  },
});

writeFileSync(new URL("./dashboards/ai-audit.json", import.meta.url), `${JSON.stringify({
  uid: "ai-audit",
  title: "ai-audit | operations and evidence",
  schemaVersion: 39,
  version: 7,
  refresh: "30s",
  time: { from: "now-15m", to: "now" },
  tags: ["ai-audit", "proxy", "evidence"],
  panels,
  templating: { list: [] },
  annotations: { list: [] },
}, null, 2)}\n`);

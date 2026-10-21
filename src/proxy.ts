import http from "node:http";
import { randomUUID } from "node:crypto";
import { AuditLog, AuditLogUnavailable, sha256, stats } from "./audit.js";
import { decide, hasDuplicateKeys, inspect, type Mode } from "./scan.js";
import { toolResultSignals, type Signal } from "./injection.js";
import { extract, type Api } from "./extract.js";
import { conversationItems, loadOrCreateSessionKey, SessionIndex } from "./session.js";
import { composeContext, contextBlocks, promptTokens, scaleToProvider } from "./context.js";
import { Counter, Gauge, Histogram, OPENMETRICS_CONTENT_TYPE, exposition } from "./metrics.js";
import { discover, inspectAttachment, cacheStats, TOOLS_OK, SANDBOX_AVAILABLE, sandboxState } from "./attachments.js";
import { timingSafeEqual } from "node:crypto";
import { createInspectionProfile } from "./profile.js";

export interface ProxyOpts {
  upstreamOpenai: string; upstreamAnthropic: string; mode: Mode; log: AuditLog; maxBodyBytes?: number; timeoutMs?: number; carnet?: Set<string>;
  pageRedaction?: boolean;
  sessionKey?: Buffer;
  keys?: VKey[];
  upstreamKeys?: { openai?: string; anthropic?: string };
  aliases?: Record<string, Alias>;
  adminKeySha256?: string;
  quiet?: boolean;
  unsafeNoSandbox?: boolean;
  sandboxAvailable?: boolean;
}
export interface VKey { name: string; sha256: string; models?: string[]; providers?: ("openai" | "anthropic")[]; logContent?: boolean }
export interface Alias { model: string; upstream?: string }
export const LATENCY_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300] as const;
let unsandboxedProxies = 0;
export const metrics = {
  sandboxUnavailable: new Counter("ai_audit_sandbox_unavailable", "Requests with attachments refused with 422 because the worker sandbox is unavailable (ADR 0021)."),
  sandboxDisabled: new Gauge("ai_audit_sandbox_disabled", "1 while a proxy runs attachment workers without a sandbox (--unsafe-no-sandbox, development only).", () => unsandboxedProxies ? 1 : 0),
  requests: new Counter("ai_audit_requests", "Finished HTTP requests by route, decision and status."),
  latency: new Histogram("ai_audit_request_duration_seconds", "Time from request arrival to response end, streaming included.", LATENCY_BUCKETS_SECONDS),
  attachments: new Counter("ai_audit_attachments_inspected", "Attachments sent to inspection."),
  logUnavailable: new Counter("ai_audit_log_unavailable", "Requests refused with 503 because the audit log could not take a record."),
  logWriteFailures: new Counter("ai_audit_log_write_failures", "Records lost after the response was delivered (ADR 0016)."),
  injectionSignals: new Counter("ai_audit_injection_signals", "Advisory prompt-injection signals by rule id (ADR 0010)."),
  upstreamResponses: new Counter("ai_audit_upstream_responses", "Upstream responses by provider and status class."),
  upstreamErrors: new Counter("ai_audit_upstream_errors", "Forwarded requests that got no upstream response, by provider and reason."),
  unknownUsage: new Counter("ai_audit_unknown_usage", "Successful upstream calls without provider-reported usage, by field (ADR 0012)."),
  sessionIndexRebuildFailures: new Counter("ai_audit_session_index_rebuild_failures", "Proxy starts where the session index could not be rebuilt from the log."),
  cacheHits: new Gauge("ai_audit_attachment_cache_hits", "Attachment inspection cache hits since start.", () => cacheStats.hits),
  cacheMisses: new Gauge("ai_audit_attachment_cache_misses", "Attachment inspection cache misses since start.", () => cacheStats.misses),
};
const METRIC_ROUTES = new Set(["/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1/messages/count_tokens", "/v1/models", "/healthz", "/readyz", "/metrics", "/audit/stats"]);
const routeLabel = (pathname: string) => METRIC_ROUTES.has(pathname) ? pathname : pathname.startsWith("/v1/models/") ? "/v1/models/:id" : "other";
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ROUTES: Record<string, Api | "count" | undefined> = {
  "/v1/chat/completions": "openai-chat", "/v1/responses": "openai-responses", "/v1/messages": "anthropic-messages", "/v1/messages/count_tokens": "count",
};
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "keep-alive", "upgrade", "proxy-connection", "x-audit-use-case", "x-audit-system-id"]);
const RESP_DROP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export function createProxy(o: ProxyOpts) {
  const max = o.maxBodyBytes ?? 32 * 1024 * 1024, timeoutMs = o.timeoutMs ?? 180_000;
  const profile = createInspectionProfile(o);
  const sandbox = sandboxState(o.sandboxAvailable ?? SANDBOX_AVAILABLE, o.unsafeNoSandbox === true);
  if (sandbox === "disabled") unsandboxedProxies++;
  if (sandbox !== "bwrap") process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: sandbox === "disabled" ? "sandbox_disabled_unsafe" : "sandbox_unavailable",
    effect: sandbox === "disabled" ? "attachment workers run WITHOUT a sandbox; development only" : "requests with attachments are refused with 422 audit_sandbox_unavailable" }) + "\n");
  const sessions = new SessionIndex(o.sessionKey ?? loadOrCreateSessionKey(o.log.path + ".session-key"));
  try { sessions.rebuild(o.log.read()); } catch { metrics.sessionIndexRebuildFailures.inc(); }
  return http.createServer(async (req, res) => {
    const rid = randomUUID(), t0 = Date.now(); res.setHeader("x-request-id", rid);
    let decisionTag = "none", routeTag = "";
    res.on("finish", () => {
      const ms = Date.now() - t0;
      metrics.requests.inc({ route: routeLabel(routeTag), decision: decisionTag, status: String(res.statusCode) });
      metrics.latency.observe(ms / 1000);
      if (!o.quiet) process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: "request", requestId: rid, route: routeTag, status: res.statusCode, decision: decisionTag, latencyMs: ms }) + "\n");
    });
    const fail = (status: number, code: string, findings?: string[]) => {
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "audit_proxy_error", code, message: code, ...(findings && { findings }) } }));
    };
    const event = (name: string, e: unknown) => o.quiet || process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: name, requestId: rid, reason: e instanceof Error ? e.message : "unknown" }) + "\n");
    const logUnavailable = (e: unknown) => { metrics.logUnavailable.inc(); event("audit_log_unavailable", e); return fail(503, "audit_log_unavailable"); };
    try {
      const url = new URL(req.url ?? "/", "http://x"), route = ROUTES[url.pathname];
      routeTag = url.pathname;
      if (req.method === "GET" && url.pathname === "/healthz") return void res.end("ok");
      if (req.method === "GET" && url.pathname === "/readyz") return void (!TOOLS_OK ? fail(503, "audit_tools_missing") : sandbox === "unavailable" ? fail(503, "audit_sandbox_unavailable") : res.end("ready"));
      if (req.method === "GET" && url.pathname === "/metrics") { res.setHeader("content-type", OPENMETRICS_CONTENT_TYPE); return void res.end(exposition(Object.values(metrics))); }
      if (req.method === "GET" && url.pathname === "/audit/stats") {
        const k = str(req.headers["x-admin-key"]) ?? "";
        if (!o.adminKeySha256 || !same(sha256(k), o.adminKeySha256)) return fail(401, "audit_admin_unauthorized");
        const by = url.searchParams.get("by") ?? "model";
        if (!["key", "model", "hour"].includes(by)) return fail(400, "audit_bad_group");
        return void res.end(JSON.stringify(stats(o.log, by as any, url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "~")));
      }
      const anthropic = route === "anthropic-messages" || route === "count" || (url.pathname === "/v1/models" && (req.headers["anthropic-version"] || req.headers["x-api-key"]));
      let base = anthropic ? o.upstreamAnthropic : o.upstreamOpenai;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v != null) headers[k] = Array.isArray(v) ? v.join(", ") : v;
      let vkey: VKey | undefined;
      if (o.keys?.length) {
        const got = headers["x-api-key"] ?? headers.authorization?.replace(/^Bearer /i, "") ?? "", h = sha256(got);
        vkey = o.keys.find((k) => same(h, k.sha256));
        if (!vkey) return fail(401, "audit_client_unauthorized");
        if (vkey.providers && !vkey.providers.includes(anthropic ? "anthropic" : "openai")) return fail(403, "audit_provider_not_allowed");
        delete headers["x-api-key"]; delete headers.authorization;
        const k = anthropic ? o.upstreamKeys?.anthropic : o.upstreamKeys?.openai;
        if (k) anthropic ? (headers["x-api-key"] = k) : (headers.authorization = `Bearer ${k}`);
      }
      const who = { virtualKey: vkey?.name, client: str(req.headers["user-agent"]) };
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
      res.on("close", () => { if (!res.writableFinished) ac.abort(); });

      if (req.method === "GET" && url.pathname === "/v1/models" || (req.method === "GET" && url.pathname.startsWith("/v1/models/"))) {
        const up = await fetch(base.replace(/\/$/, "") + url.pathname + url.search, { headers, signal: ac.signal }); clearTimeout(timer);
        return void pipe(up, res);
      }
      if (req.method !== "POST" || !route) { clearTimeout(timer); return fail(404, "audit_unsupported_route"); }

      const chunks: Buffer[] = []; let n = 0;
      for await (const c of req) { n += c.length; if (n > max) { clearTimeout(timer); return fail(413, "audit_body_too_large"); } chunks.push(c); }
      const raw = Buffer.concat(chunks); let body: any;
      try { body = JSON.parse(raw.toString("utf8")); } catch { clearTimeout(timer); return fail(400, "audit_malformed_json"); }
      if (hasDuplicateKeys(raw.toString("utf8"))) { clearTimeout(timer); return fail(400, "audit_duplicate_keys"); }

      if (route !== "count") try { o.log.ensureWritable(); } catch (e) { clearTimeout(timer); decisionTag = "log-unavailable"; return logUnavailable(e); }

      const requestedModel = typeof body?.model === "string" ? body.model : undefined;
      const alias = requestedModel ? o.aliases?.[requestedModel] : undefined;
      if (alias) { body.model = alias.model; if (alias.upstream) base = alias.upstream; }
      if (vkey?.models && !vkey.models.includes("*") && !vkey.models.includes(requestedModel ?? "") && !vkey.models.includes(body?.model)) { clearTimeout(timer); return fail(403, "audit_model_not_allowed"); }
      const target = base.replace(/\/$/, "") + url.pathname + url.search;
      const { value, findings } = inspect(body, profile.carnet) as { value: any; findings: any[] };
      const { atts, refs } = discover(value);
      const context = {
        provider: anthropic ? "anthropic" : "openai", api: route, endpoint: url.pathname, requestId: rid,
        systemId: str(req.headers["x-audit-system-id"]), useCase: str(req.headers["x-audit-use-case"]),
        ...who, model: typeof body.model === "string" ? body.model : undefined, requestedModel: alias ? requestedModel : undefined, stream: body.stream === true,
        requestHash: sha256(raw.toString("latin1")), inspectionProfile: profile.receipt,
      };
      const composition = route === "count" ? undefined : composeContext(route, body, raw.length);
      const items = route === "count" ? undefined : conversationItems(route, body);
      const linked = items && sessions.link(items);
      const arena = linked && route !== "count" ? sessions.arena(linked, contextBlocks(route, body)) : undefined;
      const session = linked && { ...linked, firstChanged: arena!.firstChanged, arena: arena!.tracked ? "tracked" as const : "untracked" as const };
      if (session) sessions.remember(session);
      if (composition && arena) composition.blocks = arena.blocks;
      const reject = (code: string) => {
        clearTimeout(timer); decisionTag = "reject";
        if (route !== "count") o.log.append({ kind: "llm-call", id: rid, ts: new Date(t0).toISOString(), ...context,
          decision: { mode: profile.mode, action: "reject", findings: findings.map((f) => ({ rule: f.rule, path: f.path })), ...(atts.length && { sandbox }) },
          ...(composition && { context: composition }), ...(session && { session }), upstreamStatus: null, error: code, latencyMs: Date.now() - t0 });
        return fail(422, code);
      };
      if (refs.length && profile.mode !== "advisory") return reject("audit_uninspectable_reference");
      if (atts.length && sandbox === "unavailable") { metrics.sandboxUnavailable.inc(); return reject("audit_sandbox_unavailable"); }
      if (atts.length && !TOOLS_OK) return reject("audit_inspection_unavailable");
      const signals: Signal[] = toolResultSignals(body);
      const sanitize: (() => void)[] = [], rasterized: string[] = [];
      for (const a of atts) {
        metrics.attachments.inc();
        const r = await inspectAttachment(a, a.path.join("."), { ...profile, sandbox: sandbox === "disabled" ? "disabled" : "bwrap" });
        if (r.failed) return reject(r.failed === "unsupported" ? "audit_unsupported_attachment" : "audit_inspection_failed");
        r.findings.forEach((f) => findings.push({ ...f, unredactable: !r.sanitized }));
        r.signals?.forEach((x) => signals.push(x));
        if (r.sanitized) sanitize.push(() => a.set(r.sanitized!));
        if (r.rasterized) rasterized.push(a.path.join("."));
      }
      signals.forEach((x) => metrics.injectionSignals.inc({ rule: x.rule }));
      const d = decide(profile.mode, findings); decisionTag = d.action;
      res.setHeader("x-audit-finding-count", String(findings.length));
      if (signals.length) res.setHeader("x-audit-signal-count", String(signals.length));
      if (d.action === "forward-redacted") sanitize.forEach((f) => f());
      const fwd = d.action === "forward-redacted" || alias ? Buffer.from(JSON.stringify(value)) : raw;
      const rec = {
        ...context, forwardedPromptDigest: sha256(fwd.toString("latin1")), ...(composition && { context: composition }), ...(session && { session }),
        decision: { mode: profile.mode, action: d.action, findings: d.findings.map((f) => ({ rule: f.rule, path: f.path })), ...(signals.length && { signals }), ...(d.action === "forward-redacted" && rasterized.length && { rasterized }), ...(atts.length && { sandbox }) },
      };
      const write = (extra: object) => { if (route !== "count") o.log.append({ kind: "llm-call", id: rid, ts: new Date(t0).toISOString(), ...rec, ...extra, latencyMs: Date.now() - t0 } as any); };
      if (d.action === "block") { clearTimeout(timer); write({ upstreamStatus: null }); return fail(d.status!, d.code!, d.findings.map((f) => f.rule)); }

      if (route !== "count") try { o.log.ensureWritable(); } catch (e) { clearTimeout(timer); decisionTag = "log-unavailable"; return logUnavailable(e); }
      let up: Response;
      try { up = await fetch(target, { method: "POST", headers, body: fwd, signal: ac.signal }); }
      catch { clearTimeout(timer); metrics.upstreamErrors.inc({ provider: context.provider, reason: ac.signal.aborted ? "deadline" : "unreachable" }); const code = ac.signal.aborted ? "audit_deadline_exceeded" : "audit_upstream_unreachable"; write({ upstreamStatus: null, error: code }); return fail(ac.signal.aborted ? 408 : 502, code); }
      clearTimeout(timer);
      metrics.upstreamResponses.inc({ provider: context.provider, class: `${Math.floor(up.status / 100)}xx` });
      const sse = (up.headers.get("content-type") ?? "").includes("text/event-stream");
      const captured = await pipe(up, res);
      const out = route === "count" ? undefined : extract(route, captured, sse);
      const red = (s: string) => {
        const result = inspect(s, profile.carnet);
        return result.findings.some((f) => f.inKey || f.unredactable) ? "[REDACTED:unredactable-content]" : result.value as string;
      };
      if (out && up.status >= 200 && up.status < 400) {
        if (out.usage?.input == null) metrics.unknownUsage.inc({ provider: context.provider, field: "input" });
        if (out.usage?.output == null) metrics.unknownUsage.inc({ provider: context.provider, field: "output" });
      }
      const full = vkey?.logContent === true;
      write({ ...(composition && { context: scaleToProvider(composition, up.status < 400 ? promptTokens(route as Api, out?.usage) : undefined) }), upstreamStatus: up.status, clientAborted: !res.writableFinished || undefined, responseModel: out?.model, usage: out?.usage, stop: out?.stop,
        ...(out && { content: full ? "redacted" : "hash", outputHash: sha256(out.text), ...(full && { output: red(out.text) }),
          toolCalls: out.toolCalls.map((t) => ({ name: t.name, argsHash: sha256(t.args), ...(full && { args: red(t.args) }) })) }) });
    } catch (e) {
      if (e instanceof AuditLogUnavailable) { metrics.logWriteFailures.inc(); event("audit_log_write_failed", e); }
      if (!res.writableEnded) fail(500, "audit_internal_error");
    }
  });
}
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 128) : undefined);

async function pipe(up: Response, res: http.ServerResponse): Promise<string> {
  const h: Record<string, string> = {}; up.headers.forEach((v, k) => { if (!RESP_DROP.has(k)) h[k] = v; });
  res.writeHead(up.status, h); res.flushHeaders();
  const dec = new TextDecoder(); let all = "";
  try { if (up.body) for await (const c of up.body as any) { res.write(c); all += dec.decode(c, { stream: true }); } } catch { }
  res.end(); return all + dec.decode();
}

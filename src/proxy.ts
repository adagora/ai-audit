// Universal LLM audit proxy: OpenAI + Anthropic wire formats, node:http + fetch, no deps.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { AuditLog, sha256, stats } from "./audit.js";
import { decide, hasDuplicateKeys, inspect, redactText, scanText, type Mode } from "./scan.js";
import { extract, type Api } from "./extract.js";
import { discover, inspectAttachment, cacheStats, TOOLS_OK } from "./attachments.js";
import { timingSafeEqual } from "node:crypto";

export interface ProxyOpts {
  upstreamOpenai: string; upstreamAnthropic: string; mode: Mode; log: AuditLog; maxBodyBytes?: number; timeoutMs?: number; carnet?: Set<string>;
  allowPageRedaction?: boolean;
  keys?: VKey[];                                        // virtual keys: if any, clients must present one (never a provider key)
  upstreamKeys?: { openai?: string; anthropic?: string }; // real provider keys, proxy env only, injected upstream
  aliases?: Record<string, Alias>;                      // client model name -> routed model (+ optional upstream)
  adminKeySha256?: string;                              // protects GET /audit/stats
  quiet?: boolean;                                      // no JSON log lines on stderr
}
export interface VKey { name: string; sha256: string; models?: string[]; providers?: ("openai" | "anthropic")[] }
export interface Alias { model: string; upstream?: string }
export const metrics = { requests: 0, byDecision: {} as Record<string, number>, byStatus: {} as Record<string, number>, latencyMsSum: 0, latencyMsMax: 0, attachments: 0, cache: cacheStats };
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ROUTES: Record<string, Api | "count" | undefined> = {
  "/v1/chat/completions": "openai-chat", "/v1/responses": "openai-responses", "/v1/messages": "anthropic-messages", "/v1/messages/count_tokens": "count",
};
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "keep-alive", "upgrade", "proxy-connection", "x-audit-use-case", "x-audit-system-id"]);
const RESP_DROP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export function createProxy(o: ProxyOpts) {
  const max = o.maxBodyBytes ?? 32 * 1024 * 1024, timeoutMs = o.timeoutMs ?? 180_000;
  return http.createServer(async (req, res) => {
    const rid = randomUUID(), t0 = Date.now(); res.setHeader("x-request-id", rid);
    let decisionTag = "none", routeTag = "";
    res.on("finish", () => { // structured, content-free
      const ms = Date.now() - t0; metrics.requests++; metrics.byDecision[decisionTag] = (metrics.byDecision[decisionTag] ?? 0) + 1;
      metrics.byStatus[res.statusCode] = (metrics.byStatus[res.statusCode] ?? 0) + 1; metrics.latencyMsSum += ms; metrics.latencyMsMax = Math.max(metrics.latencyMsMax, ms);
      if (!o.quiet) process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: "request", requestId: rid, route: routeTag, status: res.statusCode, decision: decisionTag, latencyMs: ms }) + "\n");
    });
    const fail = (status: number, code: string, findings?: string[]) => { // static codes, never content
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "audit_proxy_error", code, message: code, ...(findings && { findings }) } }));
    };
    try {
      const url = new URL(req.url ?? "/", "http://x"), route = ROUTES[url.pathname];
      routeTag = url.pathname;
      if (req.method === "GET" && url.pathname === "/healthz") return void res.end("ok");
      if (req.method === "GET" && url.pathname === "/readyz") return void (TOOLS_OK ? res.end("ready") : fail(503, "audit_tools_missing"));
      if (req.method === "GET" && url.pathname === "/metrics") return void res.end(JSON.stringify(metrics));
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
      if (o.keys?.length) { // virtual keys: verify by hash, strip, inject the real upstream key
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
      res.on("close", () => { if (!res.writableFinished) ac.abort(); }); // client went away

      if (req.method === "GET" && url.pathname === "/v1/models" || (req.method === "GET" && url.pathname.startsWith("/v1/models/"))) {
        const up = await fetch(base.replace(/\/$/, "") + url.pathname + url.search, { headers, signal: ac.signal }); clearTimeout(timer);
        return void pipe(up, res);
      }
      if (req.method !== "POST" || !route) { clearTimeout(timer); return fail(404, "audit_unsupported_route"); }

      // 1. whole body, bounded
      const chunks: Buffer[] = []; let n = 0;
      for await (const c of req) { n += c.length; if (n > max) { clearTimeout(timer); return fail(413, "audit_body_too_large"); } chunks.push(c); }
      const raw = Buffer.concat(chunks); let body: any;
      try { body = JSON.parse(raw.toString("utf8")); } catch { clearTimeout(timer); return fail(400, "audit_malformed_json"); }
      if (hasDuplicateKeys(raw.toString("utf8"))) { clearTimeout(timer); return fail(400, "audit_duplicate_keys"); }

      // 2. inspect everything, then one decision
      const requestedModel = typeof body?.model === "string" ? body.model : undefined;
      const alias = requestedModel ? o.aliases?.[requestedModel] : undefined;
      if (alias) { body.model = alias.model; if (alias.upstream) base = alias.upstream; }
      if (vkey?.models && !vkey.models.includes("*") && !vkey.models.includes(requestedModel ?? "") && !vkey.models.includes(body?.model)) { clearTimeout(timer); return fail(403, "audit_model_not_allowed"); }
      const target = base.replace(/\/$/, "") + url.pathname + url.search;
      const { value, findings } = inspect(body, o.carnet) as { value: any; findings: any[] };
      const { atts, refs } = discover(value);
      const reject = (code: string) => { clearTimeout(timer); decisionTag = "reject"; return fail(422, code); };
      if (refs.length && o.mode !== "advisory") return reject("audit_uninspectable_reference"); // remote URL / file id: fail closed
      if (atts.length && !TOOLS_OK) return reject("audit_inspection_unavailable");
      const profile = { carnet: o.carnet, allowPageRedaction: !!o.allowPageRedaction, id: `rules-v1|pr=${!!o.allowPageRedaction}|carnet=${sha256([...(o.carnet ?? [])].sort().join())}` };
      const sanitize: (() => void)[] = [];
      for (const a of atts) {
        metrics.attachments++;
        const r = await inspectAttachment(a, a.path.join("."), profile);
        if (r.failed) return reject(r.failed === "unsupported" ? "audit_unsupported_attachment" : "audit_inspection_failed");
        r.findings.forEach((f) => findings.push({ ...f, unredactable: !r.sanitized }));
        if (r.sanitized) sanitize.push(() => a.set(r.sanitized!));
      }
      const d = decide(o.mode, findings); decisionTag = d.action;
      res.setHeader("x-audit-finding-count", String(findings.length));
      if (d.action === "forward-redacted") sanitize.forEach((f) => f());
      const fwd = d.action === "forward-redacted" || alias ? Buffer.from(JSON.stringify(value)) : raw; // clean + unaliased => original bytes
      const rec = {
        provider: anthropic ? "anthropic" : "openai", api: route, endpoint: url.pathname, requestId: rid,
        systemId: str(req.headers["x-audit-system-id"]), useCase: str(req.headers["x-audit-use-case"]),
        ...who, model: typeof body.model === "string" ? body.model : undefined, requestedModel: alias ? requestedModel : undefined, stream: body.stream === true,
        requestHash: sha256(raw.toString("latin1")), forwardedPromptDigest: sha256(fwd.toString("latin1")),
        decision: { mode: o.mode, action: d.action, findings: d.findings.map((f) => ({ rule: f.rule, path: f.path })) },
      };
      const write = (extra: object) => { if (route !== "count") o.log.append({ kind: "llm-call", id: rid, ts: new Date(t0).toISOString(), ...rec, ...extra, latencyMs: Date.now() - t0 } as any); };
      if (d.action === "block") { clearTimeout(timer); write({ upstreamStatus: null }); return fail(d.status!, d.code!, d.findings.map((f) => f.rule)); }

      // 3. forward, stream back while capturing
      let up: Response;
      try { up = await fetch(target, { method: "POST", headers, body: fwd, signal: ac.signal }); }
      catch { clearTimeout(timer); const code = ac.signal.aborted ? "audit_deadline_exceeded" : "audit_upstream_unreachable"; write({ upstreamStatus: null, error: code }); return fail(ac.signal.aborted ? 408 : 502, code); }
      clearTimeout(timer); // deadline covers inspection + upstream headers
      const sse = (up.headers.get("content-type") ?? "").includes("text/event-stream");
      const captured = await pipe(up, res);
      const out = route === "count" ? undefined : extract(route, captured, sse);
      const red = (s: string) => redactText(s, scanText(s, o.carnet)); // output may contain PII too
      write({ upstreamStatus: up.status, clientAborted: !res.writableFinished || undefined, responseModel: out?.model, usage: out?.usage, stop: out?.stop,
        output: out && red(out.text), toolCalls: out?.toolCalls.map((t) => ({ name: t.name, argsHash: sha256(t.args), args: red(t.args) })) });
    } catch { fail(500, "audit_internal_error"); }
  });
}
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 128) : undefined);

async function pipe(up: Response, res: http.ServerResponse): Promise<string> {
  const h: Record<string, string> = {}; up.headers.forEach((v, k) => { if (!RESP_DROP.has(k)) h[k] = v; });
  res.writeHead(up.status, h); res.flushHeaders();
  const dec = new TextDecoder(); let all = "";
  try { if (up.body) for await (const c of up.body as any) { res.write(c); all += dec.decode(c, { stream: true }); } } catch { /* client/upstream abort */ }
  res.end(); return all + dec.decode();
}

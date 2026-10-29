import http from "node:http";
import { randomUUID } from "node:crypto";
import { AuditLog, AuditLogUnavailable, sha256, stats } from "./audit.js";
import { decide, hasDuplicateKeys, inspect, MAX_JSON_DEPTH, nestedDeeperThan, storedFindings, type Mode } from "./scan.js";
import { checkActions, enforces, requestTexts, validateActionGate, validateKeyTools, type ActionGate, type CallResult, type KeyTools, type ToolLimits } from "./actionGate.js";
import { resolveUseCase, validateUseCases, type UseCase } from "./useCases.js";
import { heldNotice, rewriteResponse, streamGate } from "./enforce.js";
import { firstSightings, toolResultSignals, toolResultTexts, type Signal } from "./injection.js";
import { createInjectionJudge, createVerdictMemory, judgeToolTexts, type ProxyJudgeOptions } from "./injectionJudge.js";
import { quinelingCalls, quinelingResults, type QuinelingEvent } from "./quinelings.js";
import { extract, type Api, type Out } from "./extract.js";
import { conversationItems, loadOrCreateSessionKey, SessionIndex } from "./session.js";
import { composeContext, contextBlocks, promptTokens, scaleToProvider } from "./context.js";
import { Counter, Gauge, Histogram, OPENMETRICS_CONTENT_TYPE, exposition } from "./metrics.js";
import { discover, inspectAttachment, cacheStats, TOOLS_OK, SANDBOX_AVAILABLE, sandboxState } from "./attachments.js";
import { timingSafeEqual } from "node:crypto";
import { createInspectionProfile } from "./profile.js";
import { createInspectionPool, InspectionBusy, InspectionStopped, OFFLOAD_CHARS, scannedCharsAbove } from "./inspectPool.js";
import { BudgetError, BudgetStore, validateBudget, type Reservation, type TokenBudget } from "./budget.js";
import { tokenCount } from "./extract.js";

export interface ProxyOpts {
  upstreamOpenai: string; upstreamAnthropic: string; mode: Mode; log: AuditLog; maxBodyBytes?: number; timeoutMs?: number; carnet?: Set<string>;
  pageRedaction?: boolean;
  sessionKey?: Buffer;
  keys?: VKey[];
  budgetDirectory?: string;
  upstreamKeys?: { openai?: string; anthropic?: string };
  aliases?: Record<string, Alias>;
  adminKeySha256?: string;
  quiet?: boolean;
  unsafeNoSandbox?: boolean;
  sandboxAvailable?: boolean;
  workerOutputLimit?: number;
  injectionJudge?: ProxyJudgeOptions;
  refusalsPerMinute?: number;
  actionGate?: ActionGate;
  useCases?: Record<string, unknown>;
  inspectTimeoutMs?: number;
  inspectWorkers?: number;
  inspectQueue?: number;
  inspectOffloadChars?: number;
}
export interface VKey { name: string; sha256: string; models?: string[]; providers?: ("openai" | "anthropic")[]; logContent?: boolean; tokenBudget?: TokenBudget; tools?: KeyTools; useCases?: string[] }
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
  actionGate: new Counter("ai_audit_action_gate", "Tool calls to gated tools by mode and result (ADR 0046)."),
  refusalsSuppressed: new Counter("ai_audit_refusals_suppressed", "Refusals counted in a per-minute summary record instead of one record each (ADR 0047)."),
  budgetFailures: new Counter("ai_audit_budget_failures", "Budget state operations that failed closed or retained an outstanding reservation."),
  injectionSignals: new Counter("ai_audit_injection_signals", "Advisory prompt-injection signals by rule id (ADR 0010)."),
  quinelingEvents: new Counter("ai_audit_quineling_events", "Quinelings tool calls and results seen in LLM traffic, by where and op (ADR 0024)."),
  upstreamResponses: new Counter("ai_audit_upstream_responses", "Upstream responses by provider and status class."),
  upstreamErrors: new Counter("ai_audit_upstream_errors", "Forwarded requests that got no upstream response, by provider and reason."),
  unknownUsage: new Counter("ai_audit_unknown_usage", "Successful upstream calls without provider-reported usage, by field (ADR 0012)."),
  inspectionsOffloaded: new Counter("ai_audit_inspections_offloaded", "Request inspections run in a worker, by result: ok, timeout, failed or busy (ADR 0050)."),
  sessionIndexRebuildFailures: new Counter("ai_audit_session_index_rebuild_failures", "Proxy starts where the session index could not be rebuilt from the log."),
  cacheHits: new Gauge("ai_audit_attachment_cache_hits", "Attachment inspection cache hits since start.", () => cacheStats.hits),
  cacheMisses: new Gauge("ai_audit_attachment_cache_misses", "Attachment inspection cache misses since start.", () => cacheStats.misses),
};
const METRIC_ROUTES = new Set(["/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1/messages/count_tokens", "/v1/models", "/healthz", "/readyz", "/metrics", "/audit/stats", "/audit/budgets"]);
const routeLabel = (pathname: string) => METRIC_ROUTES.has(pathname) ? pathname : pathname.startsWith("/v1/models/") ? "/v1/models/:id" : "other";
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ROUTES: Record<string, Api | "count" | undefined> = {
  "/v1/chat/completions": "openai-chat", "/v1/responses": "openai-responses", "/v1/messages": "anthropic-messages", "/v1/messages/count_tokens": "count",
};
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "keep-alive", "upgrade", "proxy-connection", "x-audit-use-case", "x-audit-system-id"]);
const RESP_DROP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export function createProxy(o: ProxyOpts) {
  for (const key of o.keys ?? []) if (key.tokenBudget !== undefined) {
    validateBudget(key.tokenBudget);
    if (!/^[a-f0-9]{64}$/.test(key.sha256)) throw new Error("audit_budget_config_invalid");
  }
  const duplicateKeys = new Map<string, boolean>();
  for (const key of o.keys ?? []) {
    if (duplicateKeys.has(key.sha256) && (duplicateKeys.get(key.sha256) || key.tokenBudget)) throw new Error("audit_budget_duplicate_key");
    duplicateKeys.set(key.sha256, !!key.tokenBudget);
  }
  const budgets = new BudgetStore(o.budgetDirectory ?? o.log.path + ".budgets");
  const max = o.maxBodyBytes ?? 32 * 1024 * 1024, timeoutMs = o.timeoutMs ?? 180_000;
  const actionGate = o.actionGate && validateActionGate(o.actionGate);
  const keyTools = new Map((o.keys ?? []).flatMap((key) => key.tools === undefined ? [] : [[key, validateKeyTools(key.tools)] as const]));
  const useCases = validateUseCases(o.useCases, o.keys ?? []);
  const profile = createInspectionProfile({ ...o, actionGate });
  const inspection = createInspectionPool({ allowHashes: profile.allowHashes, timeoutMs: o.inspectTimeoutMs ?? 5_000, size: o.inspectWorkers, queueLimit: o.inspectQueue });
  const offloadChars = o.inspectOffloadChars ?? OFFLOAD_CHARS;
  const judgeOptions = o.injectionJudge && { ...o.injectionJudge };
  if (judgeOptions && (typeof judgeOptions.task !== "string" || !judgeOptions.task.trim() || Buffer.byteLength(judgeOptions.task) > 2_000)) throw new Error("audit_injection_task_invalid");
  const injectionJudge = judgeOptions && createInjectionJudge(judgeOptions);
  const injectionPolicyDigest = injectionJudge && sha256(JSON.stringify({ profile: injectionJudge.profile, task: judgeOptions!.task }));
  const injectionVerdicts = injectionJudge && createVerdictMemory();
  const countedSignals = new Set<string>();
  const sandbox = sandboxState(o.sandboxAvailable ?? SANDBOX_AVAILABLE, o.unsafeNoSandbox === true);
  if (sandbox === "disabled") unsandboxedProxies++;
  if (sandbox !== "bwrap") process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: sandbox === "disabled" ? "sandbox_disabled_unsafe" : "sandbox_unavailable",
    effect: sandbox === "disabled" ? "attachment workers run WITHOUT a sandbox; development only" : "requests with attachments are refused with 422 audit_sandbox_unavailable" }) + "\n");
  const sessions = new SessionIndex(o.sessionKey ?? loadOrCreateSessionKey(o.log.path + ".session-key"));
  try { sessions.rebuild(o.log.readRecent()); } catch { metrics.sessionIndexRebuildFailures.inc(); }
  const refusalLimit = o.refusalsPerMinute ?? 60;
  let refusalMinute = 0, refusalsThisMinute = 0, refusalsSuppressed = 0;
  const appendRefusal = (record: object) => {
    try { o.log.append({ kind: "refusal", ts: new Date().toISOString(), ...record } as any); }
    catch (e) { metrics.logWriteFailures.inc(); if (!o.quiet) process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: "audit_log_write_failed", reason: contentFreeReason(e) }) + "\n"); }
  };
  const flushSuppressed = () => {
    if (!refusalsSuppressed) return;
    const end = Math.min(Date.now(), (refusalMinute + 1) * 60_000);
    appendRefusal({ id: randomUUID(), suppressed: refusalsSuppressed, from: new Date(refusalMinute * 60_000).toISOString(), to: new Date(end).toISOString() });
    refusalsSuppressed = 0;
  };
  const recordRefusal = (record: object) => {
    const minute = Math.floor(Date.now() / 60_000);
    if (minute !== refusalMinute) { flushSuppressed(); refusalMinute = minute; refusalsThisMinute = 0; }
    if (refusalsThisMinute++ < refusalLimit) return appendRefusal(record);
    refusalsSuppressed++; metrics.refusalsSuppressed.inc();
  };
  const refusalFlush = setInterval(() => { if (Math.floor(Date.now() / 60_000) !== refusalMinute) flushSuppressed(); }, 60_000);
  refusalFlush.unref();
  const server = http.createServer(async (req, res) => {
    const rid = randomUUID(), t0 = Date.now(); res.setHeader("x-request-id", rid);
    let decisionTag = "none", routeTag = "", forwarded = false;
    let reservation: Reservation | undefined, budgetSent = false, vkey: VKey | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let useCase: { name: string; row: UseCase } | undefined, useCaseName: string | undefined;
    const useCaseLabel = (): Record<string, string> => useCases ? { use_case: useCaseName ?? "none" } : {};
    res.on("finish", () => {
      const ms = Date.now() - t0;
      metrics.requests.inc({ route: routeLabel(routeTag), decision: decisionTag, status: String(res.statusCode), ...useCaseLabel() });
      metrics.latency.observe(ms / 1000);
      if (!o.quiet) process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: "request", requestId: rid, route: routeTag, status: res.statusCode, decision: decisionTag, latencyMs: ms }) + "\n");
    });
    const fail = (status: number, code: string, findings?: string[]) => {
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "audit_proxy_error", code, message: code, ...(findings && { findings }) } }));
    };
    const refuse = (status: number, code: string, extra: object = {}) => {
      recordRefusal({ id: rid, status, code, method: req.method, route: routeLabel(routeTag), ...(vkey && { virtualKey: vkey.name }), ...(useCaseName && { useCase: useCaseName }), remoteAddress: req.socket.remoteAddress, ...extra });
      return fail(status, code);
    };
    const event = (name: string, e: unknown) => o.quiet || process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: name, requestId: rid, reason: contentFreeReason(e) }) + "\n");
    const logUnavailable = (e: unknown) => { metrics.logUnavailable.inc(); event("audit_log_unavailable", e); return fail(503, "audit_log_unavailable"); };
    try {
      const url = new URL(req.url ?? "/", "http://x"), route = ROUTES[url.pathname];
      routeTag = url.pathname;
      if (req.method === "GET" && url.pathname === "/healthz") return void res.end("ok");
      if (req.method === "GET" && url.pathname === "/readyz") return void (!TOOLS_OK ? fail(503, "audit_tools_missing") : sandbox === "unavailable" ? fail(503, "audit_sandbox_unavailable") : res.end("ready"));
      if (req.method === "GET" && url.pathname === "/metrics") { res.setHeader("content-type", OPENMETRICS_CONTENT_TYPE); return void res.end(exposition(Object.values(metrics))); }
      if (req.method === "GET" && (url.pathname === "/audit/stats" || url.pathname === "/audit/budgets")) {
        const k = str(req.headers["x-admin-key"]) ?? "";
        if (!o.adminKeySha256 || !same(sha256(k), o.adminKeySha256)) return refuse(401, "audit_admin_unauthorized");
        if (url.pathname === "/audit/budgets") return void res.end(JSON.stringify((o.keys ?? []).filter((k) => k.tokenBudget).map((k) => ({ name: k.name, ...budgets.status(k.sha256, k.tokenBudget!) }))));
        const by = url.searchParams.get("by") ?? "model";
        if (!["key", "model", "hour"].includes(by)) return refuse(400, "audit_bad_group");
        return void res.end(JSON.stringify(stats(o.log, by as any, url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "~")));
      }
      const anthropic = route === "anthropic-messages" || route === "count" || (url.pathname === "/v1/models" && (req.headers["anthropic-version"] || req.headers["x-api-key"]));
      const provider = anthropic ? "anthropic" as const : "openai" as const;
      let base = anthropic ? o.upstreamAnthropic : o.upstreamOpenai;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v != null) headers[k] = Array.isArray(v) ? v.join(", ") : v;
      if (o.keys?.length) {
        const got = headers["x-api-key"] ?? headers.authorization?.replace(/^Bearer /i, "") ?? "", h = sha256(got);
        vkey = o.keys.find((k) => same(h, k.sha256));
        if (!vkey) return refuse(401, "audit_client_unauthorized", { provider });
        if (vkey.providers && !vkey.providers.includes(provider)) return refuse(403, "audit_provider_not_allowed", { provider });
        delete headers["x-api-key"]; delete headers.authorization;
        const k = anthropic ? o.upstreamKeys?.anthropic : o.upstreamKeys?.openai;
        if (k) anthropic ? (headers["x-api-key"] = k) : (headers.authorization = `Bearer ${k}`);
      }
      if (useCases && req.method === "POST" && route) {
        const resolved = resolveUseCase(useCases, vkey?.useCases, str(req.headers["x-audit-use-case"]));
        useCaseName = resolved.name;
        if ("code" in resolved) return refuse(resolved.status, resolved.code, { provider });
        useCase = resolved;
      }
      const who = { virtualKey: vkey?.name, client: str(req.headers["user-agent"]) };
      const ac = new AbortController();
      timer = setTimeout(() => ac.abort(), timeoutMs);
      res.on("close", () => { if (!res.writableFinished) ac.abort(); });

      if (req.method === "GET" && url.pathname === "/v1/models" || (req.method === "GET" && url.pathname.startsWith("/v1/models/"))) {
        const up = await fetch(base.replace(/\/$/, "") + url.pathname + url.search, { headers, signal: ac.signal }); clearTimeout(timer);
        return void pipe(up, res);
      }
      if (req.method !== "POST" || !route) { clearTimeout(timer); return refuse(404, "audit_unsupported_route"); }

      const chunks: Buffer[] = []; let n = 0;
      for await (const c of req) { n += c.length; if (n > max) { clearTimeout(timer); return refuse(413, "audit_body_too_large", { provider }); } chunks.push(c); }
      const raw = Buffer.concat(chunks), text = raw.toString("utf8"); let body: any;
      try { body = JSON.parse(text); } catch { clearTimeout(timer); return refuse(400, "audit_malformed_json", { provider }); }
      if (hasDuplicateKeys(text)) { clearTimeout(timer); return refuse(400, "audit_duplicate_keys", { provider }); }
      if (nestedDeeperThan(text, MAX_JSON_DEPTH)) { clearTimeout(timer); return refuse(400, "audit_json_too_deep", { provider }); }

      if (route !== "count") try { o.log.ensureWritable(); } catch (e) { clearTimeout(timer); decisionTag = "log-unavailable"; return logUnavailable(e); }

      const requestedModel = typeof body?.model === "string" ? body.model : undefined;
      const alias = requestedModel && o.aliases && Object.hasOwn(o.aliases, requestedModel) ? o.aliases[requestedModel] : undefined;
      if (alias) { body.model = alias.model; if (alias.upstream) base = alias.upstream; }
      const modelAllowed = (models?: readonly string[]) => !models || models.includes("*") || models.includes(requestedModel ?? "") || models.includes(body?.model);
      if (!modelAllowed(vkey?.models) || !modelAllowed(useCase?.row.models)) { clearTimeout(timer); return refuse(403, "audit_model_not_allowed", { provider, ...(requestedModel && { model: requestedModel.slice(0, 128) }) }); }
      const target = base.replace(/\/$/, "") + url.pathname + url.search;
      let inspected: { value: any; findings: any[] }, inspectionStopped: string | undefined;
      if (!scannedCharsAbove(body, offloadChars)) inspected = inspect(body, profile.carnet) as { value: any; findings: any[] };
      else try { inspected = await inspection.run(body) as { value: any; findings: any[] }; metrics.inspectionsOffloaded.inc({ result: "ok" }); }
      catch (e) {
        if (e instanceof InspectionBusy) { metrics.inspectionsOffloaded.inc({ result: "busy" }); clearTimeout(timer); return refuse(503, "audit_inspection_busy", { provider }); }
        if (!(e instanceof InspectionStopped)) throw e;
        metrics.inspectionsOffloaded.inc({ result: e.code === "audit_inspection_timeout" ? "timeout" : "failed" });
        inspected = { value: body, findings: [] }; inspectionStopped = e.code;
      }
      const { value, findings } = inspected;
      const { atts, refs } = inspectionStopped ? { atts: [], refs: [] } as ReturnType<typeof discover> : discover(value);
      const context = {
        provider: anthropic ? "anthropic" : "openai", api: route, endpoint: url.pathname, requestId: rid,
        systemId: str(req.headers["x-audit-system-id"]), useCase: useCase ? useCase.name : str(req.headers["x-audit-use-case"]),
        ...(useCase && { useCasePolicy: { tier: useCase.row.tier, digest: useCase.row.digest } }),
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
      const traced = route === "count" ? [] : quinelingResults(route, body);
      const observe = (events: QuinelingEvent[]) => { events.forEach((e) => metrics.quinelingEvents.inc({ where: e.where, op: e.op })); return events.length ? { quinelings: events } : {}; };
      const reject = (code: string) => {
        clearTimeout(timer); decisionTag = "reject";
        if (route !== "count") o.log.append({ kind: "llm-call", id: rid, ts: new Date(t0).toISOString(), ...context,
          decision: { mode: profile.mode, action: "reject", ...storedFindings(findings), ...(atts.length && { sandbox }) },
          ...(composition && { context: composition }), ...(session && { session }), ...observe(traced), upstreamStatus: null, error: code, latencyMs: Date.now() - t0 });
        return fail(422, code);
      };
      if (inspectionStopped) return reject(inspectionStopped);
      if (refs.length && profile.mode !== "advisory") return reject("audit_uninspectable_reference");
      if (atts.length && sandbox === "unavailable") { metrics.sandboxUnavailable.inc(); return reject("audit_sandbox_unavailable"); }
      if (atts.length && !TOOLS_OK) return reject("audit_inspection_unavailable");
      const signals: Signal[] = toolResultSignals(body);
      const sanitize: (() => void)[] = [], rasterized: string[] = [];
      for (const a of atts) {
        metrics.attachments.inc();
        const r = await inspectAttachment(a, a.path.join("."), { ...profile, sandbox: sandbox === "disabled" ? "disabled" : "bwrap", outputLimit: o.workerOutputLimit });
        if (r.failed) return reject(r.failed === "unsupported" ? "audit_unsupported_attachment" : "audit_inspection_failed");
        r.findings.forEach((f) => findings.push({ ...f, unredactable: !r.sanitized }));
        r.signals?.forEach((x) => signals.push(x));
        if (r.sanitized) sanitize.push(() => a.set(r.sanitized!));
        if (r.rasterized) rasterized.push(a.path.join("."));
      }
      const d = decide(profile.mode, findings); decisionTag = d.action;
      const judged = injectionJudge && d.action !== "block" && route !== "count"
        ? await judgeToolTexts(injectionJudge, judgeOptions!.task, toolResultTexts(body), ac.signal, judgeOptions!.timeoutMs, injectionVerdicts) : undefined;
      if (judged) {
        for (const result of judged.results) if (result.status === "ok" && result.verdict === "injection")
          signals.push({ category: "prompt_injection", rule: `pi-ollama-${result.category}`, path: result.path });
        res.setHeader("x-audit-injection-status", judged.status);
      }
      firstSightings(signals, session?.id, countedSignals, 100_000).forEach((x) => metrics.injectionSignals.inc({ rule: x.rule }));
      res.setHeader("x-audit-finding-count", String(findings.length));
      if (signals.length) res.setHeader("x-audit-signal-count", String(signals.length));
      if (d.action === "forward-redacted") sanitize.forEach((f) => f());
      const forwardedBody = d.action === "forward-redacted" ? value : body;
      let fwd = d.action === "forward-redacted" ? Buffer.from(JSON.stringify(value)) : alias ? Buffer.from(JSON.stringify(body)) : raw;
      const rec = {
        ...context, forwardedPromptDigest: sha256(fwd.toString("latin1")), ...(composition && { context: composition }), ...(session && { session }),
        ...(judged && { injectionJudge: { ...judged, policyDigest: injectionPolicyDigest } }),
        ...(vkey?.tokenBudget && { tokenBudget: { policy: vkey.tokenBudget } }),
        decision: { mode: profile.mode, action: d.action, ...storedFindings(d.findings), ...(signals.length && { signals }), ...(d.action === "forward-redacted" && rasterized.length && { rasterized }), ...(atts.length && { sandbox }) },
      };
      const write = (extra: object) => { if (route !== "count") o.log.append({ kind: "llm-call", id: rid, ts: new Date(t0).toISOString(), ...rec, ...extra, latencyMs: Date.now() - t0 } as any); };
      if (d.action === "block") { clearTimeout(timer); write({ upstreamStatus: null, ...observe(traced) }); return fail(d.status!, d.code!, d.findings.map((f) => f.rule)); }

      if (vkey?.tokenBudget && route !== "count") {
        try {
          const budget = vkey.tokenBudget;
          if (route === "openai-chat") throw new BudgetError(422, "audit_budget_unsupported_route");
          if (forwardedBody.previous_response_id || forwardedBody.conversation || forwardedBody.background || forwardedBody.prompt
            || forwardedBody.mcp_servers || forwardedBody.context_management || forwardedBody.container
            || (Array.isArray(forwardedBody.input) && forwardedBody.input.some((item: any) => item?.type === "item_reference"))
            || (Array.isArray(forwardedBody.tools) && forwardedBody.tools.some((t: any) => anthropic ? t?.type && t.type !== "custom" : t?.type !== "function"))) throw new BudgetError(422, "audit_budget_unsupported_request");
          const outputField = anthropic ? "max_tokens" : "max_output_tokens";
          const requested = forwardedBody[outputField];
          if (requested !== undefined && (tokenCount(requested) === undefined || requested < 1)) throw new BudgetError(422, "audit_budget_invalid_output_limit");
          const output = Math.min(requested ?? budget.maxOutputTokens, budget.maxOutputTokens);
          forwardedBody[outputField] = output;
          const status = budgets.status(vkey.sha256, budget);
          if (status.blocked) throw new BudgetError(503, "audit_budget_usage_overrun");
          if (status.remaining.input < 1 || output > status.remaining.output) throw new BudgetError(429, "audit_token_budget_exceeded");
          const fields = anthropic ? ["model", "messages", "system", "tools", "tool_choice", "thinking", "output_config", "cache_control", "speed"]
            : ["model", "input", "instructions", "tools", "tool_choice", "text", "truncation", "parallel_tool_calls", "reasoning", "personality"];
          const countBody = Object.fromEntries(fields.filter((k) => forwardedBody[k] !== undefined).map((k) => [k, forwardedBody[k]]));
          const counted = await fetch(base.replace(/\/$/, "") + (anthropic ? "/v1/messages/count_tokens" : "/v1/responses/input_tokens"), {
            method: "POST", headers, body: JSON.stringify(countBody), signal: ac.signal,
          });
          if (!counted.ok) throw new BudgetError(503, "audit_budget_count_unavailable");
          const input = tokenCount((await counted.json() as any)?.input_tokens);
          if (input === undefined) throw new BudgetError(503, "audit_budget_count_unavailable");
          reservation = budgets.reserve(vkey.sha256, budget, input, output);
          fwd = Buffer.from(JSON.stringify(forwardedBody));
          rec.forwardedPromptDigest = sha256(fwd.toString("latin1"));
        } catch (e) {
          const error = e instanceof BudgetError ? e : new BudgetError(503, "audit_budget_count_unavailable");
          if (error.status === 503) metrics.budgetFailures.inc();
          clearTimeout(timer); decisionTag = "budget-reject";
          write({ decision: { ...rec.decision, action: "block" }, upstreamStatus: null, error: error.message, ...observe(traced) });
          return fail(error.status, error.message);
        }
      }

      if (route !== "count") try { o.log.ensureWritable(); } catch (e) { clearTimeout(timer); decisionTag = "log-unavailable"; return logUnavailable(e); }
      let up: Response;
      try { budgetSent = true; up = await fetch(target, { method: "POST", headers, body: fwd, signal: ac.signal }); }
      catch { clearTimeout(timer); metrics.upstreamErrors.inc({ provider: context.provider, reason: ac.signal.aborted ? "deadline" : "unreachable" }); const code = ac.signal.aborted ? "audit_deadline_exceeded" : "audit_upstream_unreachable"; write({ upstreamStatus: null, error: code, ...observe(traced) }); return fail(ac.signal.aborted ? 408 : 502, code); }
      clearTimeout(timer); forwarded = true;
      metrics.upstreamResponses.inc({ provider: context.provider, class: `${Math.floor(up.status / 100)}xx` });
      const sse = (up.headers.get("content-type") ?? "").includes("text/event-stream");
      const toolLimits: ToolLimits = { key: vkey && keyTools.get(vkey), useCase: useCase?.row.tools }, succeeded = up.status >= 200 && up.status < 400;
      let verdict: { out?: Out; gated: CallResult[]; notice?: string } = { gated: [] };
      const judge = (text: string) => {
        const out = route === "count" ? undefined : extract(route, text, sse);
        const gated = (actionGate || toolLimits.key || toolLimits.useCase) && out && succeeded ? checkActions(actionGate, toolLimits, out.toolCalls, () => requestTexts(route as Api, body), profile.carnet) : [];
        const held = gated.filter((call) => call.result === "hold");
        verdict = { out, gated, notice: held.some((call) => call.mode === "enforce") ? heldNotice(held.map((call) => call.tool)) : undefined };
        return verdict.notice;
      };
      const enforcing = route !== "count" && succeeded && enforces(actionGate, toolLimits);
      const captured = enforcing ? await pipeGated(up, res, route as Api, sse, `msg_audit_${rid.replaceAll("-", "")}`, judge) : await pipe(up, res);
      if (!enforcing) judge(captured);
      const { out, gated, notice } = verdict;
      gated.forEach((call) => metrics.actionGate.inc({ mode: call.mode, result: call.result, ...useCaseLabel() }));
      let tokenBudget: Record<string, unknown> | undefined;
      if (reservation) {
        try { tokenBudget = { policy: vkey!.tokenBudget, reserved: reservation.tokens, ...budgets.settle(reservation, out?.usage, !!anthropic) }; }
        catch (e) { metrics.budgetFailures.inc(); event("audit_budget_settlement_failed", e); tokenBudget = { reserved: reservation.tokens, status: "unavailable" }; }
        reservation = undefined;
      }
      const red = (s: string) => {
        const result = inspect(s, profile.carnet);
        return result.findings.some((f) => f.inKey || f.unredactable) ? "[REDACTED:unredactable-content]" : result.value as string;
      };
      if (out && up.status >= 200 && up.status < 400) {
        if (out.usage?.input == null) metrics.unknownUsage.inc({ provider: context.provider, field: "input" });
        if (out.usage?.output == null) metrics.unknownUsage.inc({ provider: context.provider, field: "output" });
      }
      const full = vkey?.logContent === true;
      write({ ...(tokenBudget && { tokenBudget }), ...(gated.length && { actionGate: { calls: gated, ...(notice && { rewritten: true }) } }), ...(composition && { context: scaleToProvider(composition, up.status < 400 ? promptTokens(route as Api, out?.usage) : undefined) }), upstreamStatus: up.status, clientAborted: !res.writableFinished || undefined, responseModel: out?.model, usage: out?.usage, stop: out?.stop,
        ...(out && { content: full ? "redacted" : "hash", outputHash: sha256(out.text), ...(full && { output: red(out.text) }),
          toolCalls: out.toolCalls.map((t) => ({ name: t.name, argsHash: sha256(t.args), ...(full && { args: red(t.args) }) })) }),
        ...observe([...traced, ...(out ? quinelingCalls(out.toolCalls) : [])]) });
    } catch (e) {
      if (e instanceof BudgetError) { metrics.budgetFailures.inc(); if (!res.writableEnded) fail(e.status, e.message); return; }
      if (e instanceof AuditLogUnavailable || forwarded) { metrics.logWriteFailures.inc(); event("audit_log_write_failed", e); }
      else {
        event("audit_internal_error", e);
        recordRefusal({ id: rid, status: 500, code: "audit_internal_error", method: req.method, route: routeLabel(routeTag), ...(vkey && { virtualKey: vkey.name }),
          remoteAddress: req.socket.remoteAddress, reason: contentFreeReason(e) });
      }
      if (!res.writableEnded) fail(500, "audit_internal_error");
    } finally {
      clearTimeout(timer);
      if (reservation) try { if (budgetSent) budgets.settle(reservation); else budgets.cancel(reservation); }
      catch (e) { metrics.budgetFailures.inc(); event("audit_budget_settlement_failed", e); }
    }
  });
  server.on("close", () => { clearInterval(refusalFlush); flushSuppressed(); inspection.close(); });
  return server;
}
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 128) : undefined);
const contentFreeReason = (e: unknown) => e instanceof AuditLogUnavailable ? e.message : typeof (e as NodeJS.ErrnoException)?.code === "string" ? (e as NodeJS.ErrnoException).code! : e instanceof Error ? e.name : "unknown";

function responseHeaders(up: Response) {
  const h: Record<string, string> = {}; up.headers.forEach((v, k) => { if (!RESP_DROP.has(k)) h[k === "x-request-id" ? "x-upstream-request-id" : k] = v; });
  return h;
}

async function pipeGated(up: Response, res: http.ServerResponse, api: Api, sse: boolean, messageId: string, decide: (text: string) => string | undefined): Promise<string> {
  const gate = sse ? streamGate(api, messageId) : undefined, dec = new TextDecoder(); let all = "";
  const forward = (text: string) => { all += text; const now = gate?.push(text); if (now) res.write(now); };
  if (gate) { res.writeHead(up.status, responseHeaders(up)); res.flushHeaders(); }
  try { if (up.body) for await (const c of up.body as any) forward(dec.decode(c, { stream: true })); } catch { }
  forward(dec.decode());
  const notice = decide(all);
  if (gate) { let tail = ""; try { tail = gate.finish(notice); } catch { } res.end(tail); return all; }
  let body: string;
  try { body = notice ? rewriteResponse(api, all, notice, messageId) : all; }
  catch { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "audit_proxy_error", code: "audit_action_rewrite_failed", message: "audit_action_rewrite_failed" } })); return all; }
  res.writeHead(up.status, responseHeaders(up)); res.end(body); return all;
}

async function pipe(up: Response, res: http.ServerResponse): Promise<string> {
  res.writeHead(up.status, responseHeaders(up)); res.flushHeaders();
  const dec = new TextDecoder(); let all = "";
  try { if (up.body) for await (const c of up.body as any) { res.write(c); all += dec.decode(c, { stream: true }); } } catch { }
  res.end(); return all + dec.decode();
}

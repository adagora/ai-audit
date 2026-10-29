import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { AddressInfo } from "node:net";
import { AuditLog, evidenceGaps, useCaseSummary, verifyAnchors, type Rec, type Review, type SeriesCheck } from "./audit.js";
import { BudgetStore, type TokenBudget } from "./budget.js";
import { decisionViews, flow, requestPath, suggestions, type ConfigLike } from "./consoleModel.js";
import { listSessions, sessionView } from "./contextView.js";
import { verifyDecision } from "./qdl.js";
import { inspect } from "./scan.js";
import { validateUseCases } from "./useCases.js";

export interface ConsoleOptions {
  log: AuditLog; configPath?: string; anchorsPath?: string; metricsUrl?: string; reviewer?: string; host?: string; token?: string;
  notifyUrl?: string; overdueMinutes?: number; notifyEveryMs?: number; announceAfterMs?: number;
}
export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
export const MAX_NOTE_CHARS = 500;
const ASSETS: Record<string, [file: string, type: string]> = {
  "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/console.css": ["console.css", "text/css; charset=utf-8"], "/console.js": ["console.js", "text/javascript; charset=utf-8"],
};
const ASSET_DIR = new URL("../../console/", import.meta.url);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const VERDICTS = new Set<Review["decision"]>(["approved", "overridden", "rejected"]);
const HOUR = 3_600_000;

class ConsoleError extends Error { constructor(readonly status: number, code: string) { super(code); } }

export function createConsole(o: ConsoleOptions) {
  const host = o.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("audit_console_not_loopback");
  if (o.notifyUrl !== undefined && !/^https?:\/\/\S+$/.test(o.notifyUrl)) throw new Error("audit_console_notify_url_invalid");
  if (o.overdueMinutes !== undefined && !(Number.isFinite(o.overdueMinutes) && o.overdueMinutes > 0)) throw new Error("audit_console_overdue_invalid");
  const token = o.token ?? randomBytes(32).toString("base64url");
  let notifyFailures = 0;
  const reviewer = o.reviewer?.trim() || undefined;
  let cache: { signature: string; records: Rec[]; chain: SeriesCheck } | undefined;
  let configCache: { signature: string; config: ConfigLike & Record<string, any> } | undefined;
  const signatureOf = (files: string[]) => files.map((f) => { try { const s = statSync(f); return `${f}:${s.size}:${s.mtimeMs}`; } catch { return `${f}:-`; } }).join("|");
  const load = () => {
    const signature = signatureOf(o.log.files());
    if (cache?.signature !== signature) cache = { signature, records: o.log.read(), chain: o.log.verifySeries() };
    return cache;
  };
  const config = (): ConfigLike & Record<string, any> => {
    if (!o.configPath) return {};
    const signature = signatureOf([o.configPath]);
    if (configCache?.signature !== signature) {
      const parsed = JSON.parse(readFileSync(o.configPath, "utf8"));
      validateUseCases(parsed.useCases, parsed.keys ?? []);
      configCache = { signature, config: parsed };
    }
    return configCache.config;
  };
  const since = (url: URL) => {
    const hours = Number(url.searchParams.get("hours") ?? "24");
    return Number.isFinite(hours) && hours > 0 ? new Date(Date.now() - hours * HOUR).toISOString() : "";
  };
  const within = (records: readonly Rec[], from: string) => from ? records.filter((r) => typeof r.ts === "string" && r.ts >= from) : records;
  const strip = (r: Rec) => { const { prevHash, hash, remoteAddress, ...rest } = r as Rec & { remoteAddress?: unknown }; return rest; };

  const overview = (url: URL) => {
    const { records, chain } = load(), cfg = config(), from = since(url), recent = within(records, from);
    const decisions = decisionViews(records), waiting = decisions.filter((d) => d.state === "waiting");
    const summary = useCaseSummary(records, (ts) => !from || ts >= from);
    const f = flow(recent);
    const calls = recent.filter((r) => r.kind === "llm-call") as any[];
    const held = calls.reduce((n, c) => n + (c.actionGate?.calls ?? []).filter((x: any) => x.result === "hold").length, 0);
    const refused = f.stages.reduce((n, s) => n + (s.stage === "decide" || s.stage === "budget" || s.stage === "upstream" ? 0 : s.stopped), 0) + f.offPath;
    const gaps = evidenceGaps(records as any[], records.filter((r) => r.kind === "decision" && !r.qdl));
    const attention: { severity: "critical" | "warn" | "info"; title: string; detail: string; page: string }[] = [];
    if (!chain.ok) attention.push({ severity: "critical", title: "The audit chain is broken", detail: `${chain.file ?? basename(o.log.path)} line ${chain.badLine}: ${chain.reason}`, page: "integrity" });
    const unauthorized = decisions.flatMap((d) => d.effects.filter((e) => e.status === "done" && !e.authorized));
    if (unauthorized.length) attention.push({ severity: "critical", title: `${unauthorized.length} action${unauthorized.length === 1 ? "" : "s"} ran without approval`, detail: `${[...new Set(unauthorized.map((e) => e.action))].join(", ")}: the rule did not propose it and no person approved it first.`, page: "decisions" });
    if (waiting.length) attention.push({ severity: "warn", title: `${waiting.length} ${waiting.length === 1 ? "decision waits" : "decisions wait"} for a review`, detail: "No person has recorded a verdict yet.", page: "decisions" });
    const overdueMinutes = o.overdueMinutes ?? 240;
    const idle = decisions.filter((d) => d.state === "approved" && !d.effects.some((e) => e.status === "done") && Date.now() - Date.parse(d.reviews[0].at) >= overdueMinutes * 60_000);
    if (idle.length) attention.push({ severity: "warn", title: `${idle.length} approved ${idle.length === 1 ? "decision has" : "decisions have"} no action recorded`, detail: `Approved more than ${overdueMinutes} ${overdueMinutes === 1 ? "minute" : "minutes"} ago, and the application recorded no done action. It may have stopped waiting.`, page: "decisions" });
    if (gaps.length) attention.push({ severity: "warn", title: `${gaps.length} decision${gaps.length === 1 ? " has" : "s have"} incomplete evidence`, detail: [...new Set(gaps.map((g) => g.reason))].join(", "), page: "decisions" });
    if (held) attention.push({ severity: "warn", title: `${held} tool call${held === 1 ? "" : "s"} held by the gate`, detail: "In observe mode they went through; in enforce mode the answer was rewritten.", page: "requests" });
    const failed = f.outcomes["upstream-failed"] ?? 0;
    if (failed) attention.push({ severity: "warn", title: `${failed} request${failed === 1 ? "" : "s"} got no answer from the provider`, detail: "Deadline or network error before any response.", page: "flow" });
    if (refused) attention.push({ severity: "info", title: `${refused} request${refused === 1 ? "" : "s"} refused before inspection`, detail: "Keys, use cases, request shape or model lists.", page: "flow" });
    for (const k of keys().filter((k) => k.budget && "blocked" in k.budget && k.budget.blocked)) attention.push({ severity: "warn", title: `Budget of ${k.name} is blocked`, detail: "Usage was above the reservation; the key gets 503 until the period ends.", page: "keys" });
    return {
      log: { path: o.log.path, files: chain.files, records: chain.records, chain: { ok: chain.ok, file: chain.file, badLine: chain.badLine, reason: chain.reason }, lastTs: records[records.length - 1]?.ts ?? null },
      range: { from: from || null }, reviewer: reviewer ?? null, config: o.configPath ? basename(o.configPath) : null, metrics: !!o.metricsUrl,
      notify: { configured: !!o.notifyUrl, failures: notifyFailures },
      kpis: { requests: f.total, delivered: f.outcomes.delivered ?? 0, blocked: (f.outcomes.blocked ?? 0) + (f.outcomes.rejected ?? 0), refused, held, waiting: waiting.length, decisions: decisions.length },
      attention, suggestions: suggestions(recent, summary, cfg), flow: f,
    };
  };

  const keys = () => {
    const cfg = config(), { records } = load();
    const store = new BudgetStore(cfg.budgetDirectory ?? o.log.path + ".budgets");
    const calls = records.filter((r) => r.kind === "llm-call") as any[];
    return ((cfg.keys ?? []) as any[]).map((k) => {
      let budget: ReturnType<BudgetStore["peek"]> | { error: string } | undefined;
      if (k.tokenBudget && /^[a-f0-9]{64}$/.test(k.sha256 ?? "")) { try { budget = store.peek(k.sha256, k.tokenBudget as TokenBudget); } catch { budget = { error: "audit_budget_unavailable" }; } }
      const mine = calls.filter((c) => c.virtualKey === k.name);
      const tools: Record<string, number> = {};
      for (const c of mine) for (const t of c.toolCalls ?? []) tools[t.name] = (tools[t.name] ?? 0) + 1;
      return { name: k.name, models: k.models ?? null, providers: k.providers ?? null, tools: k.tools ?? null, useCases: k.useCases ?? null, logContent: k.logContent === true,
        tokenBudget: k.tokenBudget ?? null, budget: budget ?? null, calls: mine.length, lastTs: mine[mine.length - 1]?.ts ?? null, toolsCalled: tools };
    });
  };

  const useCases = (url: URL) => {
    const { records } = load(), cfg = config(), from = since(url);
    const table = cfg.useCases ? validateUseCases(cfg.useCases, cfg.keys ?? []) : undefined;
    const seen = new Map<string, Set<string>>();
    for (const r of records as any[]) if (r.kind === "llm-call" && r.useCasePolicy?.digest) { const s = seen.get(r.useCase) ?? new Set(); s.add(r.useCasePolicy.digest); seen.set(r.useCase, s); }
    const summary = useCaseSummary(records, (ts) => !from || ts >= from);
    const names = new Set([...summary.map((u) => u.useCase).filter((n): n is string => n !== null), ...(table ? table.keys() : [])]);
    return [...names].sort().map((name) => {
      const row = table?.get(name), stats = summary.find((u) => u.useCase === name);
      return { name, configured: !!row, row: cfg.useCases?.[name] ?? null, digest: row?.digest ?? null, changedSinceSeen: !!row && !!seen.get(name)?.size && !seen.get(name)!.has(row.digest), stats: stats ?? null };
    });
  };

  const requests = (url: URL) => {
    const { records } = load(), from = since(url), limit = Math.min(Number(url.searchParams.get("limit")) || 300, 2000);
    const wanted = url.searchParams.get("outcome"), useCase = url.searchParams.get("useCase");
    const rows = within(records, from).flatMap((r: any) => {
      const path = requestPath(r);
      if (!path || (wanted && path.outcome !== wanted) || (useCase && r.useCase !== useCase)) return [];
      return [{ id: r.id, ts: r.ts, kind: r.kind, key: r.virtualKey ?? null, useCase: r.useCase ?? null, model: r.model ?? r.requestedModel ?? null, provider: r.provider ?? null,
        outcome: path.outcome, stoppedAt: path.stoppedAt ?? null, code: path.code ?? null, status: path.status ?? null, stages: path.stages,
        findings: r.decision ? [...(r.decision.findings ?? [])].length : 0, signals: r.decision?.signals?.length ?? 0, usage: r.usage ?? null, latencyMs: r.latencyMs ?? null, session: r.session?.id ?? null }];
    });
    return rows.slice(-limit).reverse();
  };

  const requestDetail = (id: string) => {
    const { records } = load(), r = records.find((x) => (x.kind === "llm-call" || x.kind === "refusal") && x.id === id) as any;
    if (!r) throw new ConsoleError(404, "audit_console_not_found");
    const decisions = decisionViews(records).filter((d) => d.llmCallId === id).map((d) => d.id);
    return { record: strip(r), path: requestPath(r) ?? null, decisions };
  };

  const outputNames = new Map<string, string[] | null>();
  const decisions = async () => {
    const { records } = load(), views = decisionViews(records);
    let sdk: any;
    for (const hash of new Set(views.map((v) => v.qdl?.sourceHash).filter((h): h is string => !!h && !outputNames.has(h)))) {
      const source = records.find((r) => r.kind === "program" && r.id === hash)?.source;
      try {
        sdk ??= await import("@quinelings/agent-sdk/v1");
        const names = new sdk.Session().recover({ source }).payload?.task?.outputs;
        outputNames.set(hash, Array.isArray(names) && names.every((n: unknown) => typeof n === "string") ? names : null);
      } catch { outputNames.set(hash, null); }
    }
    return views.map((v) => {
      const names = v.qdl?.sourceHash ? outputNames.get(v.qdl.sourceHash) : null;
      return names && Array.isArray(v.output) && names.length === v.output.length ? { ...v, outputNames: names } : v;
    });
  };

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const readJson = async (req: http.IncomingMessage) => {
    const chunks: Buffer[] = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > 8192) throw new ConsoleError(413, "audit_console_body_too_large"); chunks.push(c); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ConsoleError(400, "audit_console_bad_json"); }
  };
  const allowedHost = (value: string | undefined) => {
    const port = (server.address() as AddressInfo | null)?.port;
    const names = host === "127.0.0.1" ? ["127.0.0.1", "localhost"] : host === "::1" ? ["[::1]", "localhost"] : ["localhost", "127.0.0.1"];
    return !!value && names.some((name) => value === `${name}:${port}`);
  };
  const authorized = (value: string | undefined) => {
    const got = Buffer.from(value?.replace(/^Bearer /i, "") ?? ""), want = Buffer.from(token);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!allowedHost(req.headers.host)) throw new ConsoleError(403, "audit_console_bad_host");
      const url = new URL(req.url ?? "/", "http://console");
      const asset = ASSETS[url.pathname];
      if (req.method === "GET" && asset) {
        res.writeHead(200, { "content-type": asset[1], "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" });
        return void res.end(readFileSync(new URL(asset[0], ASSET_DIR)));
      }
      if (!url.pathname.startsWith("/api/")) throw new ConsoleError(404, "audit_console_not_found");
      if (!authorized(req.headers.authorization)) throw new ConsoleError(401, "audit_console_unauthorized");
      const [, , section, id, action] = url.pathname.split("/").map(decodeURIComponent);
      if (req.method === "GET") {
        if (section === "overview" && !id) return json(res, 200, overview(url));
        if (section === "decisions" && !id) return json(res, 200, await decisions());
        if (section === "use-cases" && !id) return json(res, 200, useCases(url));
        if (section === "requests" && !id) return json(res, 200, requests(url));
        if (section === "requests" && id && !action) return json(res, 200, requestDetail(id));
        if (section === "sessions" && !id) return json(res, 200, listSessions(load().records).slice(0, 300));
        if (section === "sessions" && id && !action) {
          const view = sessionView(load().records, id);
          if (!view.turns.length) throw new ConsoleError(404, "audit_console_not_found");
          return json(res, 200, { id, ...view, turns: view.turns.map((t) => ({ ...t, call: { id: t.call.id, ts: t.call.ts, model: t.call.model, provider: t.call.provider, usage: t.call.usage, session: t.call.session, context: t.call.context } })) });
        }
        if (section === "keys" && !id) return json(res, 200, keys());
        if (section === "integrity" && !id) {
          const { records, chain } = load();
          const profiles = new Map<string, { scannerVersion: unknown; first: string; last: string; calls: number }>();
          for (const r of records as any[]) if (r.kind === "llm-call" && r.inspectionProfile?.digest) {
            const p = profiles.get(r.inspectionProfile.digest) ?? { scannerVersion: r.inspectionProfile.scannerVersion, first: r.ts, last: r.ts, calls: 0 };
            p.last = r.ts; p.calls++; profiles.set(r.inspectionProfile.digest, p);
          }
          return json(res, 200, {
            chain, files: o.log.files().map((f) => ({ name: basename(f), bytes: existsSync(f) ? statSync(f).size : 0 })),
            anchors: o.anchorsPath ? (existsSync(o.anchorsPath) ? verifyAnchors(o.log, o.anchorsPath) : { ok: false, anchors: 0, reason: "anchors file not found" }) : null,
            prunes: records.filter((r) => r.kind === "prune").map(strip), suppressedRefusals: records.reduce((n, r: any) => n + (r.kind === "refusal" && r.suppressed ? r.suppressed : 0), 0),
            profiles: [...profiles].map(([digest, p]) => ({ digest, ...p })),
          });
        }
        if (section === "live" && !id) {
          if (!o.metricsUrl) return json(res, 200, { configured: false });
          try {
            const text = await fetch(o.metricsUrl, { signal: AbortSignal.timeout(3000) }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); });
            const samples = text.split("\n").flatMap((line) => {
              const m = /^(ai_audit_[a-z_]+)(?:\{([^}]*)\})? (-?[0-9.eE+]+)$/.exec(line);
              return m ? [{ name: m[1], labels: Object.fromEntries([...(m[2] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]])), value: Number(m[3]) }] : [];
            });
            return json(res, 200, { configured: true, ok: true, samples });
          } catch { return json(res, 200, { configured: true, ok: false }); }
        }
      }
      if (req.method === "POST" && section === "decisions" && id && action === "replay") {
        try { return json(res, 200, await verifyDecision(o.log, id, o.anchorsPath ? { anchorsPath: o.anchorsPath } : undefined)); }
        catch (e) { throw new ConsoleError(e instanceof Error && e.message === "audit_qdl_unavailable" ? 503 : 422, e instanceof Error && /^audit_[a-z_]+$/.test(e.message) ? e.message : "audit_console_replay_failed"); }
      }
      if (req.method === "POST" && section === "decisions" && id && action === "review") {
        if (!reviewer) throw new ConsoleError(403, "audit_console_read_only");
        if (!(req.headers["content-type"] ?? "").startsWith("application/json")) throw new ConsoleError(415, "audit_console_json_required");
        const body = await readJson(req);
        if (!VERDICTS.has(body?.verdict)) throw new ConsoleError(400, "audit_console_bad_verdict");
        const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;
        if (note && note.length > MAX_NOTE_CHARS) throw new ConsoleError(400, "audit_console_note_too_long");
        if (note && inspect(note).findings.length) throw new ConsoleError(422, "audit_sensitive_note");
        try { const r = o.log.approve(id, reviewer, body.verdict, note); return json(res, 201, { review: r.id, decision: id, verdict: body.verdict, reviewer }); }
        catch (e) {
          if (e instanceof Error && e.message === "audit_unknown_decision") throw new ConsoleError(404, e.message);
          throw e instanceof Error && e.message === "audit_already_reviewed" ? new ConsoleError(409, e.message) : e;
        }
      }
      throw new ConsoleError(404, "audit_console_not_found");
    } catch (e) {
      if (res.headersSent) return void res.end();
      if (e instanceof ConsoleError) return json(res, e.status, { error: e.message });
      return json(res, 500, { error: e instanceof Error && /^audit_[a-z_]+/.test(e.message) ? e.message.split(":")[0] : "audit_console_internal_error" });
    }
  });
  const base = () => { const a = server.address() as AddressInfo; return `http://${host === "::1" ? "[::1]" : host}:${a.port}`; };
  const announced = new Set<string>(), escalated = new Set<string>();
  let primed = false, inflight: Promise<void> | undefined, notifier: ReturnType<typeof setInterval> | undefined;
  const notifyTick = (): Promise<void> => inflight ??= notifyOnce().finally(() => { inflight = undefined; });
  const notifyOnce = async () => {
    if (!o.notifyUrl) return;
    try {
      const limit = (o.overdueMinutes ?? 240) * 60_000, events: object[] = [];
      for (const d of decisionViews(load().records).filter((x) => x.state === "waiting")) {
        const event = (name: string) => ({ event: name, decisionId: d.id, useCase: d.useCase ?? null, systemId: d.systemId ?? null, waitingSince: d.ts,
          proposedActions: d.actions.filter((a) => a.status === "simulated").map((a) => a.action), console: `${base()}/#/decisions/${encodeURIComponent(d.id)}` });
        if (!announced.has(d.id) && (!primed || Date.now() - Date.parse(d.ts) >= (o.announceAfterMs ?? 30_000))) { announced.add(d.id); if (primed) events.push(event("decision_waiting")); }
        if (!escalated.has(d.id) && Date.now() - Date.parse(d.ts) >= limit) { escalated.add(d.id); events.push(event("decision_overdue")); }
      }
      primed = true;
      for (const e of events) {
        try { const r = await fetch(o.notifyUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e), signal: AbortSignal.timeout(3000) }); if (!r.ok) notifyFailures++; }
        catch { notifyFailures++; }
      }
    } catch { notifyFailures++; }
  };
  server.on("listening", () => {
    if (!o.notifyUrl) return;
    void notifyTick();
    notifier = setInterval(() => void notifyTick(), o.notifyEveryMs ?? 10_000);
    notifier.unref();
  });
  server.on("close", () => clearInterval(notifier));
  return { server, token, url: () => `${base()}/#token=${token}`, notifyTick };
}


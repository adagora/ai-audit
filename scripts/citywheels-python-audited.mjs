import { applyOperationalContext, applyFixturePolicy } from "./citywheels-operational-context.mjs";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, sha256 } from "../dist/src/audit.js";
import { createProxy } from "../dist/src/proxy.js";

const root = fileURLToPath(new URL("../", import.meta.url)), pythonRoot = resolve(process.argv[2]);
const nativeRefund = process.argv.includes("--native-refund");
if (nativeRefund && process.env.CITYWHEELS_REFUND_RULE) throw new Error("Native refund comparisons do not accept a QDL policy override");
const live = process.argv.includes("--live"), modelAt = process.argv.indexOf("--model");
const model = live ? modelAt < 0 ? "gpt-4o-mini" : process.argv[modelAt + 1] : "python-fake";
if (!model || model.startsWith("--") || live && !process.env.OPENAI_API_KEY?.trim()) throw new Error("Explicit live mode requires a model and OPENAI_API_KEY");
const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString());
const evidenceRoot = resolve(process.env.CITYWHEELS_EVIDENCE_ROOT ?? join(root, "live/evaluations"));
mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
const directory = mkdtempSync(join(evidenceRoot, "python-audited-")), data = join(directory, "data");
cpSync(join(pythonRoot, "data"), data, { recursive: true });
if (input.bookingPatch) {
  const patch = input.bookingPatch;
  if (Object.keys(patch).sort().join() !== "id,rental_price_eur" || !Number.isFinite(patch.rental_price_eur) || patch.rental_price_eur < 0) throw new Error("Invalid fixture patch");
  const bookings = JSON.parse(readFileSync(join(data, "bookings.json"))), matches = bookings.filter((b) => b.id === patch.id);
  if (matches.length !== 1) throw new Error("Unknown fixture booking");
  matches[0].rental_price_eur = patch.rental_price_eur; writeFileSync(join(data, "bookings.json"), JSON.stringify(bookings));
}
applyFixturePolicy(data, input);
const operationalContext = applyOperationalContext(data, input);
process.env.CITYWHEELS_DATA_DIR = data;
if (input.now) process.env.CITYWHEELS_NOW = input.now;
const { calculateRefund, getBooking, TOOL_NAMES, STAFF_VALUES, REFUND_RULE } = await import("../examples/citywheels/helpdesk.mjs");
const logPath = join(directory, "audit.jsonl"), log = new AuditLog(logPath), token = "aia-" + randomBytes(24).toString("hex");
const digest = (s) => createHash("sha256").update(s).digest();
const python = process.env.CITYWHEELS_PYTHON ?? "python3";
const stopping = new AbortController();
process.once("SIGTERM", () => stopping.abort());
process.once("SIGINT", () => stopping.abort());
const scrub = (value) => [token, ...(live ? [process.env.OPENAI_API_KEY] : [])].filter(Boolean).reduce((text, key) => text.replaceAll(key, "[KEY]"), String(value));
function childJson(script, request, args = [], env = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, ["-B", join(root, "scripts", script), pythonRoot, ...args], { signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(180000)]), stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", ...(process.env.CITYWHEELS_BOOKING_CONTEXT ? { CITYWHEELS_BOOKING_CONTEXT: process.env.CITYWHEELS_BOOKING_CONTEXT } : {}), ...env } });
    let out = "", error = "";
    child.stdout.on("data", (c) => { out += c; if (out.length > 2000000) child.kill(); });
    child.stderr.on("data", (c) => { error = (error + c).slice(-8000); if (process.argv.includes("--events")) process.stderr.write(scrub(c)); });
    child.on("error", reject); child.stdin.on("error", () => {});
    child.on("close", (code) => { if (code) return reject(new Error(`Python adapter failed (${code}): ${scrub(error)}`)); try { resolveResult(JSON.parse(out)); } catch (e) { reject(e); } });
    child.stdin.end(JSON.stringify(request));
  });
}
const servers = [];
async function listen(server) { servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening"); return `http://127.0.0.1:${server.address().port}`; }
async function body(req) { const chunks = []; let size = 0; for await (const c of req) { size += c.length; if (size > 2000000) throw new Error("Request too large"); chunks.push(c); } return JSON.parse(Buffer.concat(chunks).toString()); }
const send = (res, status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
const manifest = { schemaVersion: 1, implementation: nativeRefund ? "python-helpdesk-proxy-native" : "python-helpdesk-proxy-qdl", refundTool: nativeRefund ? "native" : "qdl", status: "running", provider: live ? "openai" : "scripted", model, createdAt: new Date().toISOString(), logPath };
const save = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
save("manifest.json", manifest); save("policy.json", REFUND_RULE); save("input.json", input);
try {
  const upstream = live ? "https://api.openai.com" : await listen(http.createServer(async (req, res) => {
    try { send(res, 200, await childJson("citywheels-python-model.py", await body(req))); } catch { send(res, 502, { error: "scripted_provider_failed" }); }
  }));
  const proxyUrl = await listen(createProxy({ log, mode: "redact", quiet: true, keys: [{ name: "python-helpdesk", sha256: sha256(token), tools: { mode: "enforce", allow: TOOL_NAMES } }], carnet: new Set(STAFF_VALUES.map(sha256)), upstreamOpenai: upstream, upstreamAnthropic: "http://127.0.0.1:1", upstreamKeys: { openai: live ? process.env.OPENAI_API_KEY : "sk-synthetic-only" } }));
  const ruleUrl = await listen(http.createServer(async (req, res) => {
    try {
      const credential = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (!timingSafeEqual(digest(credential), digest(token))) return send(res, 401, { error: "authentication_required" });
      if (req.method !== "POST" || req.url !== "/refund") return send(res, 404, { error: "not_found" });
      const args = await body(req);
      if (!args || Object.keys(args).some((k) => !["booking_id"].includes(k)) || typeof args.booking_id !== "string") return send(res, 400, { error: "invalid_arguments" });
      const precedingCall = log.read().filter((r) => r.kind === "llm-call").at(-1);
      if (!precedingCall) return send(res, 503, { error: "missing_model_call_evidence" });
      const result = await calculateRefund(log, args, precedingCall.id);
      send(res, 200, { ...result, booking: getBooking(args.booking_id).booking ?? null });
    } catch { send(res, 503, { error: "rule_unavailable" }); }
  }));
  const observation = await childJson("citywheels-python.py", input, [nativeRefund ? "--proxy-native" : "--proxy-qdl", ...(process.argv.includes("--events") ? ["--events"] : [])], { CITYWHEELS_EVIDENCE_ROOT: directory, CITYWHEELS_PROXY_URL: proxyUrl, CITYWHEELS_RULE_URL: ruleUrl, CITYWHEELS_CLIENT_KEY: token, CITYWHEELS_PROXY_MODEL: model });
  const deadline = Date.now() + 3000;
  while (log.read().filter((r) => r.kind === "llm-call").length < observation.data.modelTurns && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  const verification = log.verifyChain(), records = log.read();
  if (!verification.ok || records.filter((r) => r.kind === "llm-call").length !== observation.data.modelTurns) throw new Error("Incomplete Python proxy audit evidence");
  observation.data.operationalContext = operationalContext;
  observation.data.execution = nativeRefund ? "actual-python-agent-proxy-native" : "actual-python-agent-proxy-qdl";
  observation.data.refundTool = nativeRefund ? "native" : "qdl";
  observation.data.provider = live ? "openai" : "fake";
  observation.data.model = model;
  observation.data.evidenceDirectory = directory;
  observation.data.audit = { logPath, evidenceDirectory: directory, chainVerified: true, requests: records.filter((r) => r.kind === "llm-call").length, decisions: records.filter((r) => r.kind === "decision").length, records: records.map(({ id, kind, hash }) => ({ id, kind, hash })) };
  save("observation.json", observation); manifest.status = "completed";
  process.stdout.write(JSON.stringify(observation));
} finally {
  for (const server of servers.reverse()) { server.closeAllConnections(); await new Promise((resolveClose) => server.close(resolveClose)); }
  if (manifest.status === "running") manifest.status = "failed";
  manifest.finishedAt = new Date().toISOString(); save("manifest.json", manifest);
}

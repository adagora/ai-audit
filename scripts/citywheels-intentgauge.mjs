import { applyOperationalContext, applyFixturePolicy } from "./citywheels-operational-context.mjs";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { AuditLog, sha256 } from "../dist/src/audit.js";
import { createProxy } from "../dist/src/proxy.js";

const live = process.argv.includes("--live");
const modelIndex = process.argv.indexOf("--model");
const model = live ? (modelIndex < 0 ? "gpt-4o-mini" : process.argv[modelIndex + 1]) : "fake-helpdesk";
if (!model || model.startsWith("--")) throw new Error("--model requires a model name");
const providerKey = live ? process.env.OPENAI_API_KEY?.trim() : undefined;
if (live && !providerKey) throw new Error("Live mode requires OPENAI_API_KEY");
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString());
if (typeof input.question !== "string" || !input.question.trim()) throw new Error("A question is required");
const evidenceRoot = resolve(process.env.CITYWHEELS_EVIDENCE_ROOT ?? fileURLToPath(new URL("../live/evaluations/", import.meta.url)));
mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
const directory = mkdtempSync(join(evidenceRoot, "citywheels-"));
const logPath = join(directory, "audit.jsonl");
const manifest = { schemaVersion: 1, status: "running", createdAt: new Date().toISOString(), provider: live ? "openai" : "fake", model, implementation: "ai-audit-citywheels", inputHash: sha256(JSON.stringify(input)), logPath, consoleArgs: ["node", "dist/src/cli.js", "console", "--log", logPath, "--port", "8797"] };
const save = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
save("manifest.json", manifest);
save("input.json", input);
let upstream, proxy;
try {
  const source = new URL("../examples/citywheels/data/", import.meta.url);
  const original = readFileSync(new URL("bookings.json", source), "utf8");
  const data = join(directory, "data");
  cpSync(source, data, { recursive: true });
  const bookingsPath = join(data, "bookings.json");
  if (input.bookingPatch) {
    const patch = input.bookingPatch;
    if (Object.keys(patch).sort().join() !== "id,rental_price_eur" || typeof patch.rental_price_eur !== "number" || !Number.isFinite(patch.rental_price_eur) || patch.rental_price_eur < 0) throw new Error("Invalid fixture rental-price override");
    const bookings = JSON.parse(original), matches = bookings.filter((b) => b.id === patch.id);
    if (matches.length !== 1) throw new Error("Fixture booking not found");
    matches[0].rental_price_eur = patch.rental_price_eur;
    writeFileSync(bookingsPath, JSON.stringify(bookings));
  }
  const knowledgeFixtureHash = applyFixturePolicy(data, input);
  const operationalContext = applyOperationalContext(data, input);
  const before = readFileSync(bookingsPath, "utf8");
  process.env.CITYWHEELS_DATA_DIR = data;
  if (input.now) process.env.CITYWHEELS_NOW = input.now;
  else delete process.env.CITYWHEELS_NOW;
  const { ask, fakeModel, STAFF_VALUES, TOOL_NAMES, NOW, REFUND_RULE } = await import("../examples/citywheels/helpdesk.mjs");
  save("policy.json", REFUND_RULE);
  const log = new AuditLog(logPath);
  const key = "aia-" + randomBytes(18).toString("hex");
  if (!live) { upstream = fakeModel(); upstream.listen(0, "127.0.0.1"); await once(upstream, "listening"); }
  proxy = createProxy({ log, mode: "redact", quiet: true, keys: [{ name: "intentgauge", sha256: sha256(key), useCases: ["helpdesk"] }], useCases: { helpdesk: { tier: "contain", models: [model], tools: { mode: "enforce", allow: TOOL_NAMES } } }, carnet: new Set(STAFF_VALUES.map(sha256)), upstreamOpenai: live ? "https://api.openai.com" : `http://127.0.0.1:${upstream.address().port}`, upstreamAnthropic: "http://127.0.0.1:1", upstreamKeys: { openai: live ? providerKey : "sk-synthetic-only" } });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  const onEvent = process.argv.includes("--events") ? (event) => process.stderr.write("CITYWHEELS_EVENT " + JSON.stringify({ ...event, at: new Date().toISOString() }) + "\n") : () => {};
  const reply = await ask({ proxyUrl: `http://127.0.0.1:${proxy.address().port}`, clientKey: key, model, log, question: input.question, onEvent });
  const toolCalls = reply.trace.map((t, i) => ({ name: t.tool, arguments: JSON.parse(t.args), result: reply.results[i] }));
  const refund = [...toolCalls].reverse().find((c) => c.name === "calculate_refund")?.result ?? null;
  const retrieved = toolCalls.flatMap((c) => (c.result.results ?? []).map((p) => ({ id: `${p.source}#${p.section}`, text: p.text })));
  const verification = log.verifyChain();
  const records = log.read();
  if (!verification.ok || reply.error) throw new Error(`Agent run failed: ${reply.error ?? "audit chain"}`);
  const observation = { answer: reply.answer, toolCalls, retrieved, data: { operationalContext, knowledgeFixtureHash, provider: live ? "openai" : "fake", model, execution: "ai-audit-citywheels-agent", answerLower: reply.answer.toLowerCase(), refund, clock: NOW, bookingsUnchanged: before === readFileSync(bookingsPath, "utf8") && original === readFileSync(new URL("bookings.json", source), "utf8"), bookingFixtureHash: sha256(before), ungroundedAmounts: reply.ungrounded ?? [], audit: { logPath, evidenceDirectory: directory, chainVerified: verification.ok, requests: records.filter((r) => r.kind === "llm-call").length, decisions: records.filter((r) => r.kind === "decision").length, records: records.map(({ id, kind, hash, llmCallId }) => ({ id, kind, hash, ...(llmCallId && { llmCallId }) })) } } };
  save("observation.json", observation);
  manifest.status = "completed";
  manifest.clock = NOW;
  manifest.agentHash = sha256(readFileSync(new URL("../examples/citywheels/helpdesk.mjs", import.meta.url), "utf8"));
  manifest.ruleHash = sha256(JSON.stringify(REFUND_RULE));
  console.log(JSON.stringify(observation));
} finally {
  for (const server of [proxy, upstream]) if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (manifest.status === "running") manifest.status = "failed";
  manifest.finishedAt = new Date().toISOString();
  save("manifest.json", manifest);
}

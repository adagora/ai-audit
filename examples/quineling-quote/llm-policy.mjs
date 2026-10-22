import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { createProxy } from "../../dist/src/proxy.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";
import { policyHistories } from "../../dist/src/policies.js";

const live = process.argv.includes("--live");
const key = (process.env.OPENAI_API_KEY ?? "").trim();
if (live && !key) { console.error("--live needs OPENAI_API_KEY"); process.exit(2); }

const RULE = "CNC milling quote: price = CAM minutes × shop rate + setup + material, but never below 150 PLN. Inputs supplied at run time: minutes (min), rate (PLN per min), setup (PLN), material (PLN). Output: price (PLN).";
const SAMPLE = { minutes: 42, rate: 4.5, setup: 120, material: 85 };
const EXPECTED = Math.max(SAMPLE.minutes * SAMPLE.rate + SAMPLE.setup + SAMPLE.material, 150);
const number = (unit) => ({ kind: "number", unit, min: 0 });
const arithmetic = (id, a, b, kind) => ({ id, op: "arithmetic", inputs: [a, b], params: { kind } });
const EXAMPLE = { format: "qdl-intent", version: 1, name: "Quote with a floor", thought: "price = max(minutes × rate, 150 PLN)",
  inputs: [{ id: "minutes", name: "minutes", type: number("min") }, { id: "rate", name: "rate", type: number("PLN*min^-1") }, { id: "floor", value: 150, type: number("PLN") }],
  steps: [arithmetic("machining", "minutes", "rate", "mul"), arithmetic("price", "machining", "floor", "max")], outputs: ["price"] };
const GUIDE = [
  "You turn pricing rules into QDL 1 intents and compile them with the quineling_v1_compile tool.",
  'An intent is {"format":"qdl-intent","version":1,"name":…,"thought":…,"inputs":[…],"steps":[…],"outputs":[…]}.',
  'Inputs supplied at run time are {"id","name","type"}; constants are {"id","value","type"}. Every type is {"kind":"number","unit":U,"min":0} with U one of "min", "PLN", "PLN*min^-1", "one".',
  'Steps are {"id","op":"arithmetic","inputs":[id,id],"params":{"kind":"add|sub|mul|div|min|max"}}. Use no other operation.',
  "Units must agree: add and max combine equal units only; min × PLN*min^-1 gives PLN.",
  `Example: ${JSON.stringify(EXAMPLE)}`,
].join("\n");
const HINTS = { "unit-type": "the units of a step's inputs do not agree", "invalid-input": "an operation or field is not allowed", refinement: "a value is outside its declared range",
  "missing-input": "an input is missing", "unknown-field": "an input or field is not declared", "wrong-result": "the program runs but does not follow the rule" };
const TOOLS = [{ type: "function", function: { name: "quineling_v1_compile", description: "Compile a QDL 1 intent.", parameters: { type: "object", properties: { intent: { type: "object" } }, required: ["intent"] } } }];
const ruleInputs = [{ id: "minutes", name: "minutes", type: number("min") }, { id: "rate", name: "rate", type: number("PLN*min^-1") },
  { id: "setup", name: "setup", type: number("PLN") }, { id: "material", name: "material", type: number("PLN") }, { id: "floor", value: 150, type: number("PLN") }];
const SCRIPTED = [
  { format: "qdl-intent", version: 1, name: "CNC milling quote", thought: "price = max(minutes + setup + material, 150 PLN)", inputs: ruleInputs,
    steps: [arithmetic("withSetup", "minutes", "setup", "add"), arithmetic("cost", "withSetup", "material", "add"), arithmetic("price", "cost", "floor", "max")], outputs: ["price"] },
  { format: "qdl-intent", version: 1, name: "CNC milling quote", thought: "price = max(minutes × rate + setup + material, 150 PLN)", inputs: ruleInputs,
    steps: [arithmetic("machining", "minutes", "rate", "mul"), arithmetic("withSetup", "machining", "setup", "add"), arithmetic("cost", "withSetup", "material", "add"),
      arithmetic("price", "cost", "floor", "max")], outputs: ["price"] },
];

let upstream;
if (!live) {
  upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const attempt = JSON.parse(Buffer.concat(chunks).toString()).messages.filter((m) => m.role === "assistant").length;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "scripted-llm", choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null,
      tool_calls: [{ id: `call_${attempt + 1}`, type: "function", function: { name: "quineling_v1_compile", arguments: JSON.stringify({ intent: SCRIPTED[Math.min(attempt, SCRIPTED.length - 1)] }) } }] } }],
      usage: { prompt_tokens: 900, completion_tokens: 260 } }));
  }).listen(0, "127.0.0.1");
  await new Promise((r) => upstream.once("listening", r));
}
const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "llm-policy-")), "audit.jsonl"));
const proxy = createProxy({ log, mode: "redact", quiet: true, upstreamAnthropic: "http://127.0.0.1:1",
  upstreamOpenai: live ? "https://api.openai.com" : `http://127.0.0.1:${upstream.address().port}` }).listen(0, "127.0.0.1");
await new Promise((r) => proxy.once("listening", r));

const messages = [{ role: "system", content: GUIDE }, { role: "user", content: RULE }];
const decisions = [];
let final;
for (let attempt = 1; attempt <= 3 && !final; attempt++) {
  const res = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat/completions`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${live ? key : "sk-offline"}`, "x-audit-system-id": "cad-quote", "x-audit-use-case": "llm-written-quote" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, messages, tools: TOOLS, tool_choice: { type: "function", function: { name: "quineling_v1_compile" } } }) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const llmCallId = res.headers.get("x-request-id"), body = await res.json(), message = body.choices[0].message, call = message.tool_calls[0];
  let intent = null;
  try { intent = JSON.parse(call.function.arguments).intent ?? null; } catch { }
  const { decision, step } = await recordQdl(log, { systemId: "cad-quote", useCase: "llm-written-quote", input: RULE, llmCallId }, { intent }, SAMPLE);
  decisions.push(decision.id);
  let error = step.qdl.error;
  if (step.qdl.status === "completed" && decision.output[0] === EXPECTED) {
    log.approve(decision.id, "rule test case", "approved", `${EXPECTED} PLN for the sample inputs`);
    final = decision;
    console.log(`attempt ${attempt} (${body.model}): program ${step.qdl.sourceHash.slice(0, 15)}… compiled and ran, price ${decision.output[0]} PLN; the rule says ${EXPECTED} PLN, approved`);
  } else {
    if (step.qdl.status === "completed") {
      log.approve(decision.id, "rule test case", "rejected", `gave ${decision.output[0]} PLN, the rule says ${EXPECTED} PLN`);
      error = { code: "wrong-result", path: "$.outputs[0]" };
    }
    console.log(`attempt ${attempt} (${body.model}): ${step.qdl.status === "completed" ? "ran but" : "refused before running,"} ${error.code} at ${error.path} (${HINTS[error.code] ?? "see the code"}); recorded as decision ${decision.id.slice(0, 8)}…`);
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls }, { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: { code: error.code, path: error.path, message: HINTS[error.code] ?? "" } }) });
  }
}

const records = log.read(), calls = records.filter((r) => r.kind === "llm-call");
const seen = calls.flatMap((c) => (c.quinelings ?? []).map((e) => `${e.where} ${e.op}${e.intentHash ? ` intentHash ${e.intentHash.slice(0, 8)}…` : ""}${e.error ? ` error ${e.error.code}` : ""}`));
console.log(`proxy saw ${calls.length} LLM calls; Quinelings events: ${seen.join("; ")}`);
const firstStep = records.find((r) => r.refId === decisions[0] && r.qdl)?.qdl;
if (firstStep?.intentHash) console.log(`attempt 1's refused program has the intentHash the proxy logged for that LLM call: ${calls[0].quinelings?.some((e) => e.intentHash === firstStep.intentHash) ? "yes" : "no"}`);
if (final) {
  console.log(`replay from the log: reproduced=${(await replayQdl(log, final.id)).reproduced}`);
  const [history] = policyHistories(records, { useCase: "llm-written-quote" });
  console.log(`policy versions for cad-quote / llm-written-quote: ${history.versions.map((v) => `v${v.version} ${v.sourceHash.slice(0, 15)}… decisions ${v.decisions}${v.current ? " current" : ""}`).join(", ")}`);
} else { console.log("no program followed the rule after 3 attempts"); process.exitCode = 1; }
const kinds = records.reduce((m, r) => m.set(r.kind, (m.get(r.kind) ?? 0) + 1), new Map());
console.log(`log: ${log.path} (${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")}), chain ${log.verifyChain().ok ? "ok" : "BROKEN"}`);
proxy.close(); upstream?.close();

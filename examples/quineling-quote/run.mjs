// CAD machining quote: LLM proposes, a QDL program decides, the audit log proves it. Node >= 22.
// node examples/quineling-quote/run.mjs [--live]   (--live: one gpt-4o-mini call; key from OPENAI_API_KEY)
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";

const PART = "Flange DN100, S355 steel, 6x M16 holes, face milling both sides. CAM estimate: 42 min machining. Material blank 85 PLN. Setup 120 PLN. Shop rate 4.50 PLN/min.";
const n = (unit, x = {}) => ({ kind: "number", unit, min: 0, ...x });
// The deterministic policy, as a Quineling: price = max(minutes*rate + setup + material, floor);
// auto-approve only if price <= 1000 PLN AND the LLM's own price is within 5%; otherwise human review.
const POLICY = {
  format: "qdl-intent", version: 1, name: "CAD machining quote policy v1",
  thought: "Price from CAM minutes, shop rate, setup and material with a 150 PLN floor; auto-approve only small quotes where the LLM agrees within 5%.",
  inputs: [
    { id: "minutes", name: "minutes", type: n("min") }, { id: "rate", name: "rate", type: n("PLN*min^-1") },
    { id: "setup", name: "setup", type: n("PLN") }, { id: "material", name: "material", type: n("PLN") }, { id: "llmPrice", name: "llmPrice", type: n("PLN") },
    { id: "floor", value: 150, type: n("PLN") }, { id: "reviewAbove", value: 1000, type: n("PLN") },
    { id: "tolerance", value: 0.05, type: n("one") }, { id: "no", value: false, type: { kind: "boolean" } },
  ],
  steps: [
    { id: "machining", op: "arithmetic", inputs: ["minutes", "rate"], params: { kind: "mul" } },
    { id: "withSetup", op: "arithmetic", inputs: ["machining", "setup"], params: { kind: "add" } },
    { id: "cost", op: "arithmetic", inputs: ["withSetup", "material"], params: { kind: "add" } },
    { id: "price", op: "arithmetic", inputs: ["cost", "floor"], params: { kind: "max" } },
    { id: "hi", op: "arithmetic", inputs: ["price", "llmPrice"], params: { kind: "max" } },
    { id: "lo", op: "arithmetic", inputs: ["price", "llmPrice"], params: { kind: "min" } },
    { id: "gap", op: "arithmetic", inputs: ["hi", "lo"], params: { kind: "sub" } },
    { id: "allowed", op: "arithmetic", inputs: ["price", "tolerance"], params: { kind: "mul" } },
    { id: "llmAgrees", op: "compareValues", inputs: ["gap", "allowed"], params: { operator: "lte" } },
    { id: "small", op: "compareValues", inputs: ["price", "reviewAbove"], params: { operator: "lte" } },
    { id: "autoOk", op: "choose", inputs: ["small", "llmAgrees", "no"], params: {} },
    { id: "needsReview", op: "compare", inputs: ["autoOk"], params: { operator: "eq", value: false } },
    { id: "approve", op: "action", inputs: ["autoOk", "price"], params: { allowed: true, action: "auto-approve-quote" } },
    { id: "review", op: "action", inputs: ["needsReview", "price"], params: { allowed: true, action: "route-to-human-review" } },
  ],
  outputs: ["price", "llmAgrees", "autoOk", "approve", "review"],
};

async function agent(live) { // the LLM reads the part description and returns a structured proposal
  if (!live) return { model: "mock-llm", proposal: { minutes: 42, material: 85, setup: 120, price: 274 } }; // "forgot" setup: 189+85
  const key = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^OPENAI_API_KEY=/, "");
  const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, max_tokens: 80, response_format: { type: "json_object" },
      messages: [{ role: "user", content: `Quote this part. Reply JSON {minutes, material, setup, price} in PLN. ${PART}` }] }) });
  const j = await r.json(); return { model: j.model, proposal: JSON.parse(j.choices[0].message.content) };
}

const dir = mkdtempSync(join(tmpdir(), "qquote-")), log = new AuditLog(join(dir, "audit.jsonl"));
const { model, proposal } = await agent(process.argv.includes("--live"));
console.log(`1. LLM (${model}) proposes: ${JSON.stringify(proposal)}`);
const inputs = { minutes: proposal.minutes, rate: 4.5, setup: 120, material: proposal.material, llmPrice: proposal.price };
const qrec = await recordQdl(log, { systemId: "cad-quote", useCase: "machining-quote", input: PART, model: { name: model, version: "2026-10" } }, { intent: POLICY }, inputs);
const decision = log.read().find((r) => r.id === qrec.refId);
const [price, agrees, autoOk, approve, review] = decision.output;
console.log(`2. QDL policy ${qrec.qdl.sourceHash.slice(0, 15)}… -> price ${price} PLN, LLM within 5%: ${agrees}, auto-approve: ${autoOk}, action: ${(approve.status === "simulated" ? approve : review).action}`);
if (price !== proposal.price) {
  log.approve(decision.id, "qdl-policy", "overridden", `LLM said ${proposal.price}, deterministic step says ${price}; human review required`);
  console.log(`   LLM price ${proposal.price} overridden by deterministic step (${price}), flagged for human review`);
}
const r = await replayQdl(log, qrec.id);
console.log(`3. Replay "months later" (fresh session, from log only): output ${JSON.stringify(r.output.slice(0, 3))}, reproduced=${r.reproduced}, chain ok=${log.verifyChain().ok}`);
const bad = join(dir, "tampered.jsonl"); copyFileSync(log.path, bad);
const lines = readFileSync(bad, "utf8").trim().split("\n"), i = lines.findIndex((l) => l.includes('"qdl"'));
const q = JSON.parse(lines[i]); q.qdl.inputs.rate = 3.5; lines[i] = JSON.stringify(q); writeFileSync(bad, lines.join("\n") + "\n");
const t = new AuditLog(bad), v = t.verifyChain(), rr = await replayQdl(t, qrec.id);
console.log(`4. Tampered rate 4.5 -> 3.5 in log: chain ${v.ok ? "ok" : `BROKEN line ${v.badLine} (${v.reason})`}; replay gives ${rr.output[0]} PLN, reproduced=${rr.reproduced}`);
console.log(`   log: ${log.path} (${log.read().length} records)`);

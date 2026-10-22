// CAD machining quote: LLM proposes, a QDL program decides, the audit log proves it. Node >= 22.
// node examples/quineling-quote/run.mjs [--live]   (--live: one gpt-4o-mini call; key from OPENAI_API_KEY)
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";

const PART = "Flange DN100, S355 steel, 6x M16 holes, face milling both sides. CAM estimate: 42 min machining. Material blank 85 PLN. Setup 120 PLN. Shop rate 4.50 PLN/min.";
const POLICY = JSON.parse(readFileSync(new URL("./policy.json", import.meta.url), "utf8"));

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
const { decision, step } = await recordQdl(log, { systemId: "cad-quote", useCase: "machining-quote", input: PART, model: { name: model, version: "2026-10" } }, { intent: POLICY }, inputs);
if (step.qdl.status !== "completed") throw new Error(`policy ${step.qdl.status}: ${step.qdl.error.code} at ${step.qdl.error.path}`);
const [price, agrees, autoOk, approve, review] = decision.output;
console.log(`2. QDL policy ${step.qdl.sourceHash.slice(0, 15)}… -> price ${price} PLN, LLM within 5%: ${agrees}, auto-approve: ${autoOk}, action: ${(approve.status === "simulated" ? approve : review).action}`);
if (price !== proposal.price) {
  log.approve(decision.id, "qdl-policy", "overridden", `LLM said ${proposal.price}, deterministic step says ${price}; human review required`);
  console.log(`   LLM price ${proposal.price} overridden by deterministic step (${price}), flagged for human review`);
}
const r = await replayQdl(log, decision.id);
console.log(`3. Replay "months later" (fresh session, from log only): output ${JSON.stringify(r.output.slice(0, 3))}, reproduced=${r.reproduced}, chain ok=${log.verifyChain().ok}`);
const bad = join(dir, "tampered.jsonl"); copyFileSync(log.path, bad);
const lines = readFileSync(bad, "utf8").trim().split("\n"), i = lines.findIndex((l) => l.includes('"qdl"'));
const q = JSON.parse(lines[i]); q.qdl.inputs.rate = 3.5; lines[i] = JSON.stringify(q); writeFileSync(bad, lines.join("\n") + "\n");
const t = new AuditLog(bad), v = t.verifyChain(), rr = await replayQdl(t, decision.id);
console.log(`4. Tampered rate 4.5 -> 3.5 in log: chain ${v.ok ? "ok" : `BROKEN line ${v.badLine} (${v.reason})`}; replay gives ${rr.output[0]} PLN, reproduced=${rr.reproduced}`);
console.log(`   log: ${log.path} (${log.read().length} records)`);

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, canon, sha256 } from "../src/audit.js";
import { quinelingCalls, quinelingResults } from "../src/quinelings.js";
import { mockUpstream, PESEL } from "./helpers.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const policy = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
const quote = { minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274 };
const fresh = () => new AuditLog(join(mkdtempSync(join(tmpdir(), "privacy-")), "audit.jsonl"));
const call = (id: string, name: string) => ({ id, type: "function", function: { name, arguments: "{}" } });

async function serve(logPath: string, upstream: string) {
  const child: ChildProcess = spawn(process.execPath, [cli, "serve", "--port", "0", "--host", "127.0.0.1", "--mode", "redact", "--log", logPath,
    "--upstream-openai", upstream, "--upstream-anthropic", upstream], { stdio: ["ignore", "pipe", "pipe"] });
  let err = "", settled = false;
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); reject(new Error(err || "no listen")); } }, 8000);
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); fn(); };
    child.stderr!.on("data", (b) => {
      err += b.toString();
      const line = err.split("\n").map((l) => l.trim()).find((l) => l.startsWith("{") && l.includes('"listening"'));
      if (!line) return;
      finish(() => resolve((JSON.parse(line) as { url: string }).url));
    });
    child.on("exit", (code) => finish(() => reject(new Error(`serve exit ${code}: ${err}`))));
  });
  return { url, stop: () => child.kill() };
}

test("a served tool error masks a PESEL path, and an ordinary completion stays an llm-call", async () => {
  const up = await mockUpstream();
  const log = fresh();
  const proxy = await serve(log.path, up.url);
  try {
    assert.notEqual(new URL(proxy.url).port, "0");
    const peselBody = { model: "gpt-x", messages: [
      { role: "assistant", content: null, tool_calls: [call("c1", "quineling_v1_run")] },
      { role: "tool", tool_call_id: "c1", content: JSON.stringify({ error: { code: "refinement", path: `$.bindings.${PESEL}`, message: "hidden" } }) },
    ] };
    const masked = await fetch(proxy.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(peselBody) });
    assert.equal(masked.status, 200);
    await masked.text();
    const forwarded = up.seen.map((s) => s.body.toString()).join("\n");
    assert.equal(forwarded.includes(PESEL), false);
    const ordinary = await fetch(proxy.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-x", messages: [{ role: "user", content: "Hello" }] }) });
    assert.equal(ordinary.status, 200);
    await ordinary.text();
    let recs = log.read();
    const deadline = Date.now() + 2000;
    while (recs.filter((r) => r.kind === "llm-call").length < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
      recs = log.read();
    }
    const text = readFileSync(log.path, "utf8");
    assert.equal(text.includes(PESEL), false);
    assert.equal(recs.some((r) => r.kind === "program" || r.kind === "decision"), false);
    const calls = recs.filter((r) => r.kind === "llm-call");
    assert.equal(calls.length, 2);
    const observed = calls.find((r) => (r as any).quinelings?.length) as any;
    const plain = calls.find((r) => !(r as any).quinelings);
    assert.ok(plain);
    assert.equal(plain.kind, "llm-call");
    assert.equal(observed.quinelings[0].error.code, "refinement");
    assert.equal(observed.quinelings[0].error.path, undefined);
    assert.ok(observed.decision.findings.some((f: any) => f.rule === "pii-pesel"));
    const proxySrc = readFileSync(fileURLToPath(new URL("../../src/proxy.ts", import.meta.url)), "utf8");
    assert.equal(proxySrc.includes("@quinelings/agent-sdk"), false);
    assert.equal(proxySrc.includes("decisionReceipt"), false);
    assert.equal(proxySrc.includes(".frame("), false);
  } finally { proxy.stop(); await up.close(); }
});

test("diagnostic codes are a fixed set and a sensitive path is dropped without changing the program identity", { skip }, async () => {
  const { recordQdl } = await import("../src/qdl.js");
  const { Session } = await import("@quinelings/agent-sdk/v1");
  const artifact = new Session().compile(policy);
  const log = fresh();
  const { step } = await recordQdl(log, { systemId: "cad-quote", useCase: "machining-quote", input: "part" }, { intent: policy }, quote);
  assert.equal(step.qdl.sourceHash, artifact.id);
  const [named] = quinelingCalls([{ name: "quineling_v1_run", args: JSON.stringify({ artifactId: artifact.id }) }]);
  const [compiled] = quinelingCalls([{ name: "quineling_v1_compile", args: JSON.stringify({ intent: policy }) }]);
  assert.equal(named.sourceHash, artifact.id);
  assert.equal(compiled.intentHash, sha256(canon(policy)));
  const hostile = quinelingResults("openai-chat", { messages: [
    { role: "assistant", content: null, tool_calls: [call("c1", "quineling_v1_run")] },
    { role: "tool", tool_call_id: "c1", content: JSON.stringify({ error: { code: "customer-secret", path: `$.bindings.${PESEL}` } }) },
  ] })[0];
  assert.deepEqual(hostile.error, { code: "unreadable" });
  assert.equal(JSON.stringify(hostile).includes(PESEL), false);
  assert.equal(step.qdl.sourceHash, artifact.id);
});

test("a retained GitHub-shaped decision input is hashed and not stored", { skip }, async () => {
  const { recordQdl } = await import("../src/qdl.js");
  const key = "ghp_" + "a".repeat(36);
  const log = fresh();
  const { decision, step } = await recordQdl(log, { systemId: "cad-quote", useCase: "machining-quote", input: key, storeRedactedInput: true }, { intent: policy }, quote);
  assert.equal(step.qdl.status, "completed");
  assert.equal(decision.inputHash, sha256(key));
  assert.equal(decision.redactedInput, undefined);
  assert.equal(readFileSync(log.path, "utf8").includes(key), false);
});

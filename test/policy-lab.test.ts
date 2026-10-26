import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AuditLog, type Rec } from "../src/audit.js";
import { labView, renderLab, stepForRegion } from "../src/lab.js";
import { replayQdl } from "../src/qdl.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const demoPath = fileURLToPath(new URL("../../examples/policy-lab/run.mjs", import.meta.url));
const freshPath = fileURLToPath(new URL("../../examples/policy-lab/fresh.mjs", import.meta.url));

function field(stdout: string, name: string): string {
  const found = stdout.match(new RegExp(`^${name}: (.+)$`, "m"));
  assert.ok(found, name);
  return found[1];
}

test("a policy lab session, its first disagreement, the inspection page, and a fresh process", { skip, timeout: 60_000 }, async () => {
  const run = spawnSync(process.execPath, [demoPath], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const logPath = field(run.stdout, "log");
  const log = new AuditLog(logPath);
  const recs = log.read();
  const calls = recs.filter((r) => r.kind === "llm-call");
  assert.ok(calls.length > 2);
  assert.equal(new Set(calls.map((c) => (c.session as { id?: string } | undefined)?.id)).size, 1);
  const failed = calls.filter((c) => typeof c.upstreamStatus !== "number" || c.upstreamStatus >= 400);
  assert.ok(failed.length > 1);
  const reported = calls.filter((c) => typeof (c.usage as { input?: unknown } | undefined)?.input === "number")
    .sort((a, b) => ((a.session as { turn?: number }).turn ?? 0) - ((b.session as { turn?: number }).turn ?? 0));
  assert.ok(reported.length >= 2);
  const early = (reported[0].usage as { input: number }).input;
  const later = (reported[reported.length - 1].usage as { input: number }).input;
  assert.ok(later > early);
  const unknown = calls.find((c) => c.usage == null);
  assert.ok(unknown);
  assert.equal(Object.hasOwn(unknown, "usage"), false);
  assert.equal(JSON.stringify(unknown).includes('"input":0'), false);
  const text = readFileSync(logPath, "utf8");
  for (const marker of ["Job check A", "Job check B", "Job check C", "Job check D"]) assert.equal(text.includes(marker), false);

  const mains = recs.filter((r) => r.kind === "decision" && !r.qdl && r.qdlDecision);
  const byCall = new Map<string, Rec[]>();
  for (const decision of mains) {
    if (decision.params?.policy === "revised" || typeof decision.llmCallId !== "string") continue;
    const list = byCall.get(decision.llmCallId) ?? [];
    list.push(decision);
    byCall.set(decision.llmCallId, list);
  }
  const ordered = calls.filter((c) => byCall.has(c.id)).sort((a, b) => ((a.session as { turn?: number }).turn ?? 0) - ((b.session as { turn?: number }).turn ?? 0));
  const pairs = ordered.map((call) => {
    const pair = byCall.get(call.id)!;
    const strict = pair.find((d) => d.params?.policy === "strict");
    const loose = pair.find((d) => d.params?.policy === "loose");
    assert.ok(strict && loose);
    return { turn: (call.session as { turn?: number }).turn ?? 0, strict, loose };
  });
  const splitAt = pairs.findIndex((pair) => JSON.stringify(pair.strict.output) !== JSON.stringify(pair.loose.output));
  assert.ok(splitAt > 0);
  assert.equal(JSON.stringify(pairs[0].strict.output), JSON.stringify(pairs[0].loose.output));
  const split = pairs[splitAt];
  const strictQ = recs.find((r) => r.qdl && r.refId === split.strict.id)?.qdl as { sourceHash?: string; inputs?: { failures?: number; reported?: number } };
  const looseQ = recs.find((r) => r.qdl && r.refId === split.loose.id)?.qdl as { sourceHash?: string; inputs?: unknown };
  assert.equal(typeof strictQ.sourceHash, "string");
  assert.notEqual(strictQ.sourceHash, looseQ.sourceHash);
  assert.deepEqual(strictQ.inputs, looseQ.inputs);
  const revised = mains.find((d) => d.params?.policy === "revised" && d.llmCallId === split.strict.llmCallId);
  assert.ok(revised);
  const revisedQ = recs.find((r) => r.qdl && r.refId === revised.id)?.qdl as { sourceHash?: string; inputs?: unknown };
  assert.notEqual(revisedQ.sourceHash, looseQ.sourceHash);
  assert.deepEqual(revisedQ.inputs, looseQ.inputs);
  assert.notDeepEqual(revised.output, split.loose.output);

  const view = await labView(log, split.strict.id, split.loose.id);
  const html = renderLab(view);
  assert.equal(readFileSync(fileURLToPath(field(run.stdout, "page")), "utf8"), html);
  const bodyText = html.replace(/<script[\s\S]*<\/script>/, " ").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  for (const fact of view.inputs) assert.ok(html.includes(`<td>${fact.name}</td><td>${typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)}</td>`));
  assert.ok(html.includes(`<td>Strict</td><td>${view.thresholds.strict}</td>`));
  assert.ok(html.includes(`<td>Loose</td><td>${view.thresholds.loose}</td>`));
  assert.notEqual(view.thresholds.strict, view.thresholds.loose);
  for (const step of view.steps) {
    const value = typeof step.value === "string" ? step.value : JSON.stringify(step.value);
    assert.ok(html.includes(`data-step-row="${step.stepId}"`), step.stepId);
    assert.ok(bodyText.includes(value), `${step.stepId} ${value}`);
  }
  assert.ok(bodyText.includes(JSON.stringify(view.outputs.strict)));
  assert.ok(bodyText.includes(JSON.stringify(view.outputs.loose)));
  const limit = stepForRegion(view, "limit");
  assert.equal(limit?.stepId, "limit");
  assert.equal(limit?.value, view.thresholds.strict);
  const halt = stepForRegion(view, "halt");
  assert.equal(halt?.value, (view.outputs.strict as unknown[])[0]);
  assert.equal(html.includes("require"), false);
  assert.equal(html.includes("import "), false);
  assert.equal(/<script[^>]*type="module"/.test(html), false);
  const proxySrc = readFileSync(fileURLToPath(new URL("../../src/proxy.ts", import.meta.url)), "utf8");
  assert.equal(proxySrc.includes("@quinelings/agent-sdk"), false);
  assert.equal(proxySrc.includes("renderLab"), false);
  assert.equal(proxySrc.includes("./lab.js"), false);
  assert.equal(proxySrc.includes(".frame("), false);
  assert.equal(html.includes("Job check"), false);

  const inputsPath = field(run.stdout, "inputs");
  const revisedRun = spawnSync(process.execPath, [freshPath, field(run.stdout, "export"), inputsPath], { encoding: "utf8" });
  assert.equal(revisedRun.status, 0, revisedRun.stderr);
  const revisedFresh = JSON.parse(revisedRun.stdout) as { source: string; output: unknown };
  assert.equal(revisedFresh.source, revisedQ.sourceHash);
  assert.deepEqual(revisedFresh.output, revised.output);
  const looseRun = spawnSync(process.execPath, [freshPath, field(run.stdout, "unrevised-export"), inputsPath], { encoding: "utf8" });
  assert.equal(looseRun.status, 0, looseRun.stderr);
  const looseFresh = JSON.parse(looseRun.stdout) as { source: string; output: unknown };
  assert.equal(looseFresh.source, looseQ.sourceHash);
  assert.deepEqual(looseFresh.output, split.loose.output);
  const again = await replayQdl(log, revised.id);
  assert.equal(again.reproduced, true);
  assert.deepEqual(again.output, revised.output);
  assert.equal(again.sourceHash, revisedQ.sourceHash);
});

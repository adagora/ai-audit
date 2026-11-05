import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { policyRuntime } from "../dist/src/policyAdapter.js";

const policy = JSON.parse(readFileSync(new URL("../examples/evaluation/machining-policy.json", import.meta.url), "utf8"));
const inputs = JSON.parse(readFileSync(new URL("../examples/evaluation/machining-inputs.json", import.meta.url), "utf8"));
const rows = [];
for (const [name, intent] of [["auditline-policy-1", policy]]) {
  const start = performance.now();
  const { Session } = await policyRuntime({ intent });
  const selectionMs = performance.now() - start;
  const session = new Session();
  const compileStart = performance.now();
  const artifact = session.compile(intent);
  const compileMs = performance.now() - compileStart;
  const recovered = new Session();
  const recoveryStart = performance.now();
  recovered.recover({ source: artifact.source });
  const recoveryMs = performance.now() - recoveryStart;
  const samples = [];
  for (let i = 0; i < 110; i++) {
    const runStart = performance.now();
    const run = recovered.run({ artifactId: artifact.id, requestId: `bench-${i}`, inputs });
    if (run.result.status !== "completed" || run.result.outputs[0] !== 394) throw new Error("benchmark_result_mismatch");
    if (i >= 10) samples.push(performance.now() - runStart);
  }
  samples.sort((a, b) => a - b);
  rows.push({ runtime: name, sourceBytes: Buffer.byteLength(artifact.source), selectionMs, compileMs, recoveryMs, samples: samples.length, p50Ms: samples[49], p95Ms: samples[94] });
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, architecture: process.arch, policy: "machining-policy", input: "synthetic-fixed-394", scope: "in-process evaluation, 10 warmups, 100 unique requests; excludes log writes and LLM calls; selectionMs is not a cold-process startup measurement", results: rows }, null, 2));

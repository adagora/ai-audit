import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { createInjectionJudge } from "../../dist/src/injectionJudge.js";
import { evaluateInjection, readInjectionDataset } from "../../dist/src/injectionEval.js";

try {
  const { values } = parseArgs({ options: { ollama: { type: "boolean", default: false }, model: { type: "string", default: "qwen3.5:4b" },
    url: { type: "string", default: "http://127.0.0.1:11434" }, input: { type: "string" }, output: { type: "string" },
    repeats: { type: "string", default: "1" }, "timeout-ms": { type: "string", default: "15000" } } });
  const dataset = readInjectionDataset(values.input ?? new URL("./cases.json", import.meta.url).pathname);
  const judge = values.ollama ? createInjectionJudge({ model: values.model, url: values.url, timeoutMs: Number(values["timeout-ms"]) }) : undefined;
  const report = await evaluateInjection(dataset, { judge, repeats: Number(values.repeats) });
  if (values.output) writeFileSync(values.output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  else process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  const summary = report.summary.all;
  process.stderr.write(JSON.stringify({ regex: summary.regex, ollama: summary.ollama, modelDigests: report.modelDigests }) + "\n");
  if (judge && report.rows.some((row) => row.samples.some((sample) => sample.status !== "ok"))) process.exitCode = 1;
} catch (error) {
  process.stderr.write(error instanceof Error && /^audit_injection_[a-z_]+$/.test(error.message) ? error.message + "\n" : "audit_injection_evaluation_failed\n");
  process.exitCode = 2;
}

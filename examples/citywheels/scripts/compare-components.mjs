import { ambiguityEvaluators } from "./helpdesk-ambiguity.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { QualificationStore, evidenceDigest } from "../dist/src/qualification.js";
import { businessSuite, businessEvaluators } from "./helpdesk-comparison-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function assessControlledPair(suite, native, qdl) {
  const issues = [], pairs = [];
  if (!suite?.cases?.length || !native?.options || !Number.isInteger(native.options.repetitions) || native.options.repetitions < 1 || native.options.repetitions > 10 || !qdl?.options || !Array.isArray(native.results) || !Array.isArray(qdl.results) || !native.suite || !qdl.suite) return { valid: false, issues: ["invalid-report-contract"], pairs, populationEstimate: false };
  const identities = ["bookingFixtureHash", "knowledgeFixtureHash", "initialModelInputHash", "toolContractHash", "clock", "model"];
  const expectedCount = suite.cases.length * native.options.repetitions;
  if (qdl.options.repetitions !== native.options.repetitions || native.suite.hash !== evidenceDigest(suite) || native.suite.hash !== qdl.suite.hash || native.results.length !== expectedCount || qdl.results.length !== expectedCount) issues.push("trial-contract-mismatch");
  for (const scenario of suite.cases) for (let repetition = 0; repetition < native.options.repetitions; repetition++) {
    const left = native.results.filter((r) => r.caseId === scenario.id && r.repetition === repetition), right = qdl.results.filter((r) => r.caseId === scenario.id && r.repetition === repetition);
    if (left.length !== 1 || right.length !== 1 || !left[0].output || !right[0].output || [left[0].status, right[0].status].includes("error")) { issues.push(`missing-observation:${scenario.id}:${repetition}`); continue; }
    const a = left[0], b = right[0];
    if (!a.output.data || !b.output.data) { issues.push(`missing-telemetry:${scenario.id}:${repetition}`); continue; }
    for (const name of ["bookingFixtureHash", "knowledgeFixtureHash", "initialModelInputHash", "toolContractHash"]) if (![a.output.data[name], b.output.data[name]].every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) issues.push(`unknown-${name}:${scenario.id}:${repetition}`);
    if (![a.output.data.clock, b.output.data.clock].every((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))) issues.push(`unknown-clock:${scenario.id}:${repetition}`);
    if (![a.output.data.evidenceDirectory, b.output.data.evidenceDirectory].every((value) => typeof value === "string" && !!value)) issues.push(`missing-evidence-link:${scenario.id}:${repetition}`);
    for (const name of identities) if (!a.output.data?.[name] || a.output.data[name] !== b.output.data?.[name]) issues.push(`changed-${name}:${scenario.id}:${repetition}`);
    if (a.output.data.refundTool !== "native" || b.output.data.refundTool !== "qdl" || a.output.data.audit?.chainVerified !== true || b.output.data.audit?.chainVerified !== true) issues.push(`invalid-arm:${scenario.id}:${repetition}`);
    pairs.push({ caseId: scenario.id, repetition, native: a.status, qdl: b.status, nativeEvidence: a.output.data.evidenceDirectory, qdlEvidence: b.output.data.evidenceDirectory });
  }
  return { valid: !issues.length, issues, pairs, independentCases: suite.cases.length, repeatedTrialsPerArm: expectedCount, populationEstimate: false };
}

export async function compareComponents({ evaluatorRoot = process.env.INTENTGAUGE_ROOT ?? join(root, "../evalLOL"), pythonRoot = process.env.CITYWHEELS_PYTHON_ROOT ?? join(root, "../EternalChat copy/help-desk-agent/help-desk-agent"), live = false, model = "gpt-4o-mini", repetitions = 1, suitePath, output, signal } = {}) {
  if (typeof live !== "boolean" || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10 || typeof model !== "string" || !model.trim() || model.startsWith("--") || model.length > 100) throw new Error("Invalid comparison options");
  if (live && !process.env.OPENAI_API_KEY?.trim()) throw new Error("Live component comparison requires OPENAI_API_KEY");
  evaluatorRoot = resolve(evaluatorRoot); pythonRoot = resolve(pythonRoot);
  const api = await import(pathToFileURL(join(evaluatorRoot, "dist/src/index.js")));
  const { evaluators } = await import(pathToFileURL(join(evaluatorRoot, "integrations/citywheels/target.mjs")));
  const suite = api.validateSuite(businessSuite(JSON.parse(readFileSync(suitePath ?? join(evaluatorRoot, "integrations/citywheels/suite.json"), "utf8"))));
  const home = join(root, "live/evaluations"); mkdirSync(home, { recursive: true, mode: 0o700 });
  const directory = output ? resolve(output) : mkdtempSync(join(home, "components-"));
  if (output) mkdirSync(directory, { mode: 0o700 });
  const store = new QualificationStore(join(directory, "identities"));
  const pythonFiles = readdirSync(join(pythonRoot, "citywheels")).filter((name) => name.endsWith(".py")).map((name) => `citywheels/${name}`);
  const capture = () => ({
    host: store.capture(root, ["dist/src", "scripts/compare-components.mjs", "scripts/helpdesk-comparison-policy.mjs", "scripts/helpdesk-ambiguity.mjs", "scripts/citywheels-python-audited.mjs", "scripts/citywheels-python.py", "scripts/citywheels-python-model.py", "scripts/citywheels-operational-context.mjs", "examples/citywheels/helpdesk.mjs", "examples/citywheels/refund.json", "package-lock.json", "vendor", "node_modules/@quinelings/agent-sdk/dist", "node_modules/@quinelings/agent-sdk/package.json"]),
    application: store.capture(pythonRoot, pythonFiles), fixtures: store.capture(pythonRoot, ["data"]), prompt: store.capture(pythonRoot, ["citywheels/prompts.py"]), tools: store.capture(pythonRoot, ["citywheels/tools.py"]), loop: store.capture(pythonRoot, ["citywheels/agent.py"]),
    evaluator: store.capture(evaluatorRoot, ["dist/src", "integrations/citywheels/target.mjs", "package-lock.json"]),
  });
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ format: "ai-audit-component-comparison", version: 1, status: "running", createdAt: new Date().toISOString(), stage: "capturing-identities" }), { mode: 0o600 });
  let fixed;
  try { fixed = capture(); }
  catch (error) { writeFileSync(join(directory, "manifest.json"), JSON.stringify({ format: "ai-audit-component-comparison", version: 1, status: "error", error: "Fixed component snapshot unavailable", finishedAt: new Date().toISOString() }), { mode: 0o600 }); throw error; }
  const fixedDigest = evidenceDigest(fixed);
  const save = (file, value) => writeFileSync(join(directory, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  const manifest = { format: "ai-audit-component-comparison", version: 1, status: "running", createdAt: new Date().toISOString(),
    factor: { name: "refund-tool-implementation", arms: ["native", "qdl"], includes: "Refund calculation and its existing result adapter; not an isolated engine-speed comparison" }, fixedDigest,
    provider: live ? "openai" : "scripted", model: live ? model : "python-fake", immutableModelRevision: null, temperature: 0, repetitions, suiteHash: api.hash(suite),
    limitations: ["Development cases are not representative traffic.", "Repetitions measure stability, not additional independent customers.", "Runtime versions and snapshots do not capture the host OS or Python interpreter/stdlib environment.", "Provider behavior may change behind a model name; sequential arm order and temporal drift may confound live results.", "No qualification, approval or production authority is created.", "Provider and human costs are not measured by this comparison."] };
  save("manifest.json", manifest); save("fixed.json", fixed); save("suite.json", suite);
  const reports = {};
  try {
    for (const arm of ["native", "qdl"]) {
      if (evidenceDigest(capture()) !== fixedDigest) throw new Error("Fixed components changed before execution");
      const evidenceRoot = join(directory, arm, "cases"); mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
      const target = { name: `Python / same proxy and model / ${arm} refund tool`, revision: evidenceDigest({ fixedDigest, arm, model: manifest.model, live }), execute({ input }, context) {
        return new Promise((resolveOutput, reject) => {
          const child = spawn(process.execPath, [join(root, "scripts/citywheels-python-audited.mjs"), pythonRoot, ...(arm === "native" ? ["--native-refund"] : []), ...(live ? ["--live", "--model", model] : [])], {
            signal: signal ? AbortSignal.any([signal, context.signal]) : context.signal, stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", CITYWHEELS_EVIDENCE_ROOT: evidenceRoot, ...(live ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}) },
          });
          let out = "";
          child.stdout.on("data", (chunk) => { out += chunk; if (out.length > 2000000) child.kill(); });
          child.stderr.resume(); child.stdin.on("error", () => {});
          child.on("error", () => reject(new Error("Component worker unavailable")));
          child.on("close", (code) => { if (code !== 0) return reject(new Error("Component worker failed; inspect retained manifests")); try { resolveOutput(JSON.parse(out)); } catch { reject(new Error("Component worker returned invalid output")); } });
          child.stdin.end(JSON.stringify(input));
        });
      } };
      reports[arm] = await api.run(suite, target, { repetitions, concurrency: 1, timeoutMs: live ? 180000 : 30000, evaluators: [...evaluators, ...businessEvaluators, ...ambiguityEvaluators] });
      await api.saveReport(reports[arm], join(directory, arm));
      manifest[arm] = { status: "finished", reportDigest: store.put(JSON.stringify(reports[arm])).digest, summary: reports[arm].summary.overall }; save("manifest.json", manifest);
      for (const row of reports[arm].results) if (row.output?.data?.evidenceDirectory) writeFileSync(join(row.output.data.evidenceDirectory, "evaluation-link.json"), JSON.stringify({ caseId: row.caseId, repetition: row.repetition, report: join(directory, arm, "report.json"), status: row.status }), { mode: 0o600 });
    }
    const assessment = assessControlledPair(suite, reports.native, reports.qdl);
    if (evidenceDigest(capture()) !== fixedDigest) assessment.issues.push("fixed-components-changed-during-execution");
    assessment.valid = !assessment.issues.length;
    save("assessment.json", assessment);
    if (assessment.valid) save("comparison.json", api.compare(reports.native, reports.qdl));
    manifest.status = assessment.valid ? "completed" : "invalid"; manifest.assessment = assessment; manifest.finishedAt = new Date().toISOString(); save("manifest.json", manifest);
    const evidenceLink = (path) => typeof path !== "string" || !path ? "No completed evidence" : `<a href="${escape(encodeURI(relative(directory, join(path, "manifest.json"))))}">Original manifest</a>`;
    const rows = assessment.pairs.map((p) => `<tr><td>${escape(p.caseId)} / ${p.repetition + 1}</td><td>${escape(p.native)}</td><td>${escape(p.qdl)}</td><td>${evidenceLink(p.nativeEvidence)}</td><td>${evidenceLink(p.qdlEvidence)}</td></tr>`).join("");
    writeFileSync(join(directory, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Refund tool component comparison</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.6rem;text-align:left;overflow-wrap:anywhere}td{max-width:16rem}</style><h1>One refund tool component, two implementations</h1><p>Status: ${escape(manifest.status)}. Same Python application, prompt, loop, model path, tool schema, proxy and fixtures. The refund tool calculation and result adapter vary.</p><ul>${manifest.limitations.map((s) => `<li>${escape(s)}</li>`).join("")}</ul><p><a href="native/report.html">Native report</a> · <a href="qdl/report.html">QDL report</a> · <a href="assessment.json">Fixed-component checks</a> · <a href="fixed.json">Bound source snapshots</a></p><p>${escape(assessment.issues.join("; "))}</p><table><tr><th>Case / repeat</th><th>Native</th><th>QDL</th><th>Native evidence</th><th>QDL evidence</th></tr>${rows}</table></html>`, { mode: 0o600 });
    return { directory, manifest, assessment, reports };
  } catch (error) {
    manifest.status = "error"; manifest.finishedAt = new Date().toISOString(); manifest.error = "Comparison interrupted or fixed component verification failed"; save("manifest.json", manifest); throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--live") options.live = true;
      else if (["--model", "--repetitions", "--suite", "--output"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) { const name = args[i++].slice(2); options[{ suite: "suitePath" }[name] ?? name] = name === "repetitions" ? Number(args[i]) : args[i]; }
      else throw new Error("Usage: compare-components.mjs [--live --model NAME] [--repetitions 1..10] [--suite FILE] [--output NEW_DIRECTORY]");
    }
    if (options.model && !options.live) throw new Error("--model requires --live");
    const result = await compareComponents(options);
    console.log(JSON.stringify({ directory: result.directory, status: result.manifest.status, issues: result.assessment.issues }));
    if (!result.assessment.valid) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}

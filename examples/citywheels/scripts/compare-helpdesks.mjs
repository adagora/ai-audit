import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { businessSuite, businessEvaluators } from "./helpdesk-comparison-policy.mjs";

const args = process.argv.slice(2);
const parsed = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--live") parsed.live = true;
  else if (["--model", "--repetitions"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) parsed[args[i].slice(2)] = args[++i];
  else throw new Error("Usage: compare-helpdesks.mjs [--live] [--model NAME] [--repetitions 1..10]");
}
const live = !!parsed.live, model = parsed.model ?? "gpt-4o-mini";
const repetitions = Number(parsed.repetitions ?? (live ? 3 : 1));
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error("Repetitions must be 1..10");
if (live && !process.env.OPENAI_API_KEY?.trim()) throw new Error("Live comparison requires OPENAI_API_KEY; use node --env-file=.env scripts/compare-helpdesks.mjs --live");
if (parsed.model && !live) throw new Error("--model requires --live");

const root = fileURLToPath(new URL("../../../", import.meta.url));
const evaluatorRoot = resolve(process.env.INTENTGAUGE_ROOT ?? join(root, "../evalLOL"));
const pythonRoot = resolve(process.env.CITYWHEELS_PYTHON_ROOT ?? join(root, "../EternalChat copy/help-desk-agent/help-desk-agent"));
const api = await import(pathToFileURL(join(evaluatorRoot, "dist/src/index.js")));
const { createTarget, evaluators } = await import(pathToFileURL(join(evaluatorRoot, "integrations/citywheels/target.mjs")));
const raw = JSON.parse(readFileSync(join(evaluatorRoot, "integrations/citywheels/suite.json"), "utf8"));
const suite = api.validateSuite(businessSuite(raw));
const fingerprint = createHash("sha256");
function hashTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "__pycache__") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hashTree(path);
    else if (/\.(py|md|json)$/.test(entry.name)) fingerprint.update(relative(pythonRoot, path)).update(readFileSync(path));
  }
}
hashTree(join(pythonRoot, "citywheels")); hashTree(join(pythonRoot, "data"));
fingerprint.update(readFileSync(new URL("./citywheels-python.py", import.meta.url)));
if (api.hash(JSON.parse(readFileSync(join(pythonRoot, "data/bookings.json")))) !== api.hash(JSON.parse(readFileSync(join(root, "examples/citywheels/data/bookings.json"))))) throw new Error("Booking fixtures differ; review before comparing");
for (const file of readdirSync(join(root, "examples/citywheels/data/policies"))) {
  const normalize = (text) => text.replace(/\r\n/g, "\n").trim();
  if (normalize(readFileSync(join(pythonRoot, "data/policies", file), "utf8")) !== normalize(readFileSync(join(root, "examples/citywheels/data/policies", file), "utf8"))) throw new Error("Policy fixtures differ: " + file);
}
fingerprint.update(JSON.stringify({ live, model: live ? model : "python-fake" }));
const python = { name: `Python CityWheels / original agent / ${live ? "OpenAI " + model : "scripted model"}`, revision: fingerprint.digest("hex"), execute({ input }, { signal }) {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(process.env.CITYWHEELS_PYTHON ?? "python3", ["-B", fileURLToPath(new URL("./citywheels-python.py", import.meta.url)), pythonRoot, ...(live ? ["--live", "--model", model] : [])], { signal, stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", ...(live ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}) } });
    let out = "", err = "";
    child.stdout.on("data", (chunk) => { out += chunk; if (out.length > 2_000_000) child.kill(); });
    child.stderr.on("data", (chunk) => { err = (err + chunk).slice(-4000); });
    child.on("error", reject); child.stdin.on("error", () => {});
    child.on("close", (code) => { if (code !== 0) return reject(new Error(err)); try { resolveOutput(JSON.parse(out)); } catch (error) { reject(error); } });
    child.stdin.end(JSON.stringify(input));
  });
} };
const home = join(root, "live/evaluations");
mkdirSync(home, { recursive: true, mode: 0o700 });
const directory = mkdtempSync(join(home, "comparison-"));
const startedAt = new Date().toISOString();
writeFileSync(join(directory, "manifest.json"), JSON.stringify({ schemaVersion: 1, createdAt: startedAt, implementation: "two-helpdesks", provider: live ? "openai" : "fake", model: live ? model : null, repetitions, status: "running", suiteHash: api.hash(suite) }, null, 2), { mode: 0o600 });
writeFileSync(join(directory, "suite.json"), JSON.stringify(suite, null, 2), { mode: 0o600 });
const options = { concurrency: 2, timeoutMs: live ? 180000 : 30000, repetitions, evaluators: [...evaluators, ...businessEvaluators] };
const reports = {};
console.log(`${live ? "LIVE, billable" : "Offline"}: two implementations, ${suite.cases.length} cases each, ${repetitions} repetitions, model ${live ? model : "different scripted models"}`);
await Promise.all([["ai-audit", createTarget({ live, model })], ["python", python]].map(async ([name, target]) => {
  const report = await api.run(suite, target, options);
  const reportDirectory = join(directory, name);
  await api.saveReport(report, reportDirectory);
  reports[name] = report;
  for (const row of report.results) {
    const evidence = row.output?.data?.audit?.evidenceDirectory ?? row.output?.data?.evidenceDirectory;
    if (evidence) writeFileSync(join(evidence, "evaluation-link.json"), JSON.stringify({ caseId: row.caseId, report: join(reportDirectory, "report.json"), reportHash: api.hash(report), status: row.status, checks: row.checks }, null, 2), { mode: 0o600 });
  }
}));
const auditRaw = structuredClone(raw);
auditRaw.name = "CityWheels / ai-audit controls only";
auditRaw.relations = [];
for (const scenario of auditRaw.cases) scenario.assertions = scenario.assertions.filter((a) => ["verified-audit", "audited-request", "qdl-recorded", "grounded-money", "staff-decision", "read-only-tools"].includes(a.id));
const auditSuite = api.validateSuite(auditRaw);
const audited = await api.run(auditSuite, { name: "Audit controls / recorded observations / no new model calls", revision: api.hash(reports["ai-audit"]), async execute(request, context) { return reports["ai-audit"].results.find((r) => r.caseId === request.id && r.repetition === context.repetition)?.output ?? {}; } }, { repetitions });
await api.saveReport(audited, join(directory, "ai-audit-controls"));
const difference = api.compare(reports["python"], reports["ai-audit"]);
writeFileSync(join(directory, "comparison.json"), JSON.stringify(difference, null, 2), { mode: 0o600 });
const limitation = live ? "Same model and fixtures, repeated concurrently; different prompts, tools and application code. Small development suite, not a population reliability estimate." : "Different scripted models; this comparison does not rank real-model reliability";
const stability = Object.fromEntries(Object.entries(reports).map(([name, report]) => {
  const counts = suite.cases.map((c) => report.results.filter((r) => r.caseId === c.id && r.status === "pass").length);
  return [name, { allRepeatsPassed: counts.filter((n) => n === repetitions).length, mixed: counts.filter((n) => n > 0 && n < repetitions).length, noRepeatsPassed: counts.filter((n) => n === 0).length }];
}));
writeFileSync(join(directory, "manifest.json"), JSON.stringify({ schemaVersion: 1, createdAt: startedAt, finishedAt: new Date().toISOString(), implementation: "two-helpdesks", provider: live ? "openai" : "fake", model: live ? model : null, repetitions, status: "completed", suiteHash: api.hash(suite), results: Object.fromEntries(Object.entries(reports).map(([name, report]) => [name, report.summary.overall])), stability, auditControls: audited.summary.overall, limitation }, null, 2), { mode: 0o600 });
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rows = suite.cases.map((c) => {
  const cells = ["python", "ai-audit"].map((name) => {
    return "<td>" + reports[name].results.filter((r) => r.caseId === c.id).map((row) => {
    const evidence = row.output?.data?.audit?.evidenceDirectory ?? row.output?.data?.evidenceDirectory;
    const link = evidence ? `<a href="${escape(encodeURI(relative(directory, join(evidence, "manifest.json"))))}">Retained evidence</a>` : "No completed observation";
    return `<strong>Repeat ${row.repetition + 1}: ${escape(row.status)}</strong><p>${escape(row.output?.answer ?? row.error)}</p>${link}<hr>`;
    }).join("") + "</td>";
  });
  return `<tr><td>${escape(c.id)}<p>${escape(c.input.question)}</p></td>${cells.join("")}</tr>`;
});
const summaries = Object.entries(reports).map(([name, report]) => `<li>${escape(name)}: ${report.summary.overall.passed}/${report.summary.overall.trials} trials passed; ${stability[name].allRepeatsPassed}/${suite.cases.length} cases passed every repetition; ${report.summary.overall.errors} execution errors</li>`).join("");
writeFileSync(join(directory, "index.html"), `<!doctype html><meta charset="utf-8"><title>CityWheels comparison</title><style>body{font:16px system-ui;max-width:1400px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:14px;text-align:left;vertical-align:top}td{width:33%}p{white-space:pre-wrap}</style><h1>Two help desks, one business suite</h1><p>${escape(limitation)} Audit-only requirements have a separate report.</p><ul>${summaries}</ul><p><a href="python/report.html">Python business evaluation</a> · <a href="ai-audit/report.html">ai-audit business evaluation</a> · <a href="ai-audit-controls/report.html">ai-audit controls</a> · <a href="comparison.json">Differences</a></p><table><tr><th>Case</th><th>Python</th><th>ai-audit + Quinelings</th></tr>${rows.join("")}</table>`, { mode: 0o600 });
console.log(JSON.stringify({ directory, page: join(directory, "index.html"), results: Object.fromEntries(Object.entries(reports).map(([name, report]) => [name, report.summary.overall])) }, null, 2));

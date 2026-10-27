import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = process.argv[2] ?? mkdtempSync(join(tmpdir(), "ai-audit-showcase-"));
mkdirSync(output, { recursive: true });
const assets = join(output, "assets");
mkdirSync(assets, { recursive: true });
const child = spawn(process.execPath, [new URL("./serve.mjs", import.meta.url).pathname], {
  env: { ...process.env, WORKFLOW_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "", stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-3000); });

try {
  let base;
  for (let i = 0; i < 150; i++) {
    base = stdout.match(/Workflow cockpit: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (base) break;
    if (child.exitCode !== null) throw new Error(`synthetic server exited: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!base) throw new Error(`synthetic server did not start: ${stderr}`);
  const get = (path) => fetch(base + path).then(async (response) => { if (!response.ok) throw new Error(`${path}: ${response.status}`); return response; });
  const state = await get("/api/state").then((response) => response.json());
  const scenarios = {};
  for (const id of state.scenarios) {
    const response = await fetch(base + "/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: id }) });
    const value = await response.json();
    if (!response.ok) throw new Error(`${id}: ${JSON.stringify(value)}`);
    if (value.artifacts) for (const [name, url] of Object.entries(value.artifacts)) {
      const filename = `${id}-${name}${name === "publicKey" ? ".pem" : name === "attestation" ? ".json" : `.${name}`}`;
      writeFileSync(join(assets, filename), Buffer.from(await get(url).then((result) => result.arrayBuffer())));
      value.artifacts[name] = `./assets/${filename}`;
    }
    scenarios[id] = value;
  }
  const history = await get("/api/history").then((response) => response.json());
  const telemetry = await get("/api/telemetry").then((response) => response.json());
  writeFileSync(join(assets, "workbench.html"), await get("/api/workbench").then((response) => response.text()));
  const monitoringFiles = [
    ["grafana-dashboard.json", new URL("../monitoring/grafana/dashboards/ai-audit.json", import.meta.url)],
    ["grafana-alert-rules.yml", new URL("../monitoring/grafana/provisioning/alerting/rules.yml", import.meta.url)],
  ];
  for (const [name, source] of monitoringFiles) writeFileSync(join(assets, name), readFileSync(source));
  const source = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const payload = JSON.stringify({ state: { mode: "showcase", callCounts: state.callCounts }, scenarios, history, telemetry, workbench: "./assets/workbench.html", monitoring: monitoringFiles.map(([name]) => `./assets/${name}`) }).replace(/</g, "\\u003c");
  writeFileSync(join(output, "index.html"), source.replace('<script id="showcase-data" type="application/json"></script>', `<script id="showcase-data" type="application/json">${payload}</script>`));
  for (const asset of ["ui.css", "ui.js"]) writeFileSync(join(output, asset), readFileSync(new URL(`./${asset}`, import.meta.url)));
  process.stdout.write(JSON.stringify({ output, scenarios: state.scenarios.length, records: history.records.length, files: readdirSync(assets).length + 3 }) + "\n");
} finally { child.kill("SIGINT"); }

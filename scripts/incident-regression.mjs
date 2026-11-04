import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AuditLog } from "../dist/src/audit.js";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function exportIncident({ logPath, recordId, fixture, expectations, output }) {
  if (fixture.sanitized !== true) throw new Error("Fixture must explicitly confirm sanitized: true");
  if (!fixture.input || typeof fixture.input !== "object" || !fixture.observation || typeof fixture.observation !== "object") throw new Error("Fixture needs input and observation objects");
  if (!Array.isArray(expectations.assertions) || !expectations.assertions.length) throw new Error("Supply independent assertions");
  if (Object.hasOwn(fixture.input, "assertions")) throw new Error("Assertions must stay outside target input");
  if (!existsSync(logPath)) throw new Error("Audit log does not exist");
  const log = new AuditLog(logPath);
  const verification = log.verifyChain();
  if (!verification.ok) throw new Error("Audit chain verification failed");
  const record = log.read().find((row) => row.id === recordId);
  if (!record || !["llm-call", "decision", "refusal"].includes(record.kind)) throw new Error("Select an existing request, decision or refusal");
  const id = "incident-" + digest({ recordId }).slice(0, 16);
  const suite = { schemaVersion: 1, name: "Incident regression", version: "1", cases: [{ id, intent: expectations.intent ?? "incident", input: fixture.input, assertions: expectations.assertions, split: "test", tags: ["incident", "development"] }], gates: [{ minPassRate: 1, maxCriticalFailures: 0 }] };
  const provenance = { schemaVersion: 1, recordId: record.id, recordHash: record.hash, recordKind: record.kind, fixtureHash: digest(fixture), expectationsHash: digest(expectations), mode: "recorded-output-replay", fixtureOrigin: "operator-supplied", chainVerified: true, independentlyAuthenticated: false };
  mkdirSync(output, { mode: 0o700 });
  for (const [name, value] of Object.entries({ "suite.json": suite, "observations.json": { [id]: fixture.observation }, "provenance.json": provenance })) writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { id, suite, provenance };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 5) throw new Error("Usage: node scripts/incident-regression.mjs LOG RECORD_ID FIXTURE.json EXPECTATIONS.json NEW_OUTPUT_DIRECTORY");
    const [logPath, recordId, fixturePath, expectationsPath, output] = args;
    exportIncident({ logPath, recordId, fixture: JSON.parse(readFileSync(fixturePath, "utf8")), expectations: JSON.parse(readFileSync(expectationsPath, "utf8")), output });
    console.log(`Exported regression to ${output}. Validate suite.json with IntentGauge before use.`);
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}

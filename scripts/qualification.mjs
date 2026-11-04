import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { QualificationStore } from "../dist/src/qualification.js";

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error("Qualification input is unavailable or is not valid JSON"); }
}

export function qualificationCommand(args) {
  const usage = "qualification list STORE | inspect STORE DIGEST [CURRENT.json] | capture STORE SPEC.json";
  const [command, directory, item, currentFile] = args;
  if (!directory || !["list", "inspect", "capture"].includes(command) || (command === "list" && args.length !== 2)
    || (command === "capture" && args.length !== 3) || (command === "inspect" && ![3, 4].includes(args.length))) throw new Error(usage);
  const store = new QualificationStore(resolve(directory));
  if (command === "list") return { exitCode: 0, value: store.list().map((p) => ({ digest: p.digest, intent: p.intent, createdAt: p.createdAt, model: p.model, assessment: store.inspect(p) })) };
  if (command === "inspect") {
    const p = store.load(item), current = currentFile ? readJson(currentFile) : undefined;
    const assessment = store.inspect(p, current);
    return { exitCode: assessment.integrity && assessment.evidencePassed ? 0 : 1, value: { package: p, assessment } };
  }
  const specFile = resolve(item), spec = readJson(specFile), base = dirname(specFile);
  const { components: selections, suiteFile, reportFile, calibrationFile, ...metadata } = spec;
  if (!selections || typeof selections !== "object" || Array.isArray(selections) || typeof suiteFile !== "string" || typeof reportFile !== "string") throw new Error("Spec requires components, suiteFile and reportFile");
  const components = Object.fromEntries(Object.entries(selections).map(([name, selection]) => {
    if (!selection || typeof selection.root !== "string" || !Array.isArray(selection.files)) throw new Error("Each component requires root and files");
    return [name, store.capture(resolve(base, selection.root), selection.files)];
  }));
  const p = store.create({ ...metadata, components, suite: store.put(readFileSync(resolve(base, suiteFile))), report: store.put(readFileSync(resolve(base, reportFile))), calibration: calibrationFile ? store.put(readFileSync(resolve(base, calibrationFile))) : null });
  const assessment = store.inspect(p);
  return { exitCode: assessment.integrity && assessment.evidencePassed ? 0 : 1, value: { package: p, assessment } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = qualificationCommand(process.argv.slice(2)); console.log(JSON.stringify(result.value, null, 2)); process.exitCode = result.exitCode; }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

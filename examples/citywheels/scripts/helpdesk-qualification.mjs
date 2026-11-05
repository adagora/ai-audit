import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { QualificationStore, evidenceDigest } from "../../../dist/src/qualification.js";

export function prepareHelpdeskRelease({ store, root, evaluatorRoot, pythonRoot, target, model, provider, runDirectory }) {
  const capture = (base, files) => store.capture(base, files);
  const runtime = { application: target, provider, model, node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, pythonRuntime: target.startsWith("python") ? "not-measured" : null };
  writeFileSync(join(runDirectory, "runtime.json"), JSON.stringify(runtime, null, 2) + "\n", { mode: 0o600 });
  const runtimeSnapshot = capture(runDirectory, ["runtime.json"]);
  const combine = (...snapshots) => {
    const files = snapshots.flatMap((snapshot, i) => snapshot.files.map((file) => ({ ...file, path: `${i}/${file.path}` }))).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { files, digest: evidenceDigest(files) };
  };
  const evaluator = combine(capture(evaluatorRoot, ["dist/src", "package-lock.json", "integrations/citywheels/target.mjs"]), capture(root, ["examples/citywheels/scripts/helpdesk-comparison-policy.mjs", "examples/citywheels/scripts/helpdesk-ambiguity.mjs"]));
  const rubric = combine(capture(root, ["examples/citywheels/scripts/helpdesk-comparison-policy.mjs", "examples/citywheels/scripts/helpdesk-ambiguity.mjs"]), capture(evaluatorRoot, ["integrations/citywheels/target.mjs"]));
  let components;
  if (target === "ai-audit") {
    const application = capture(root, ["dist/src", "dist/examples/citywheels/src", "examples/citywheels/helpdesk.mjs", "examples/citywheels/scripts/citywheels-intentgauge.mjs", "examples/citywheels/scripts/helpdesk-workbench.mjs", "examples/citywheels/scripts/helpdesk-qualification.mjs", "examples/citywheels/scripts/casework-api.mjs", "scripts/experiment-inventory.mjs", "examples/citywheels/scripts/citywheels-questions.mjs", "examples/citywheels/scripts/citywheels-operational-context.mjs", "examples/citywheels/scripts/helpdesk-ambiguity.mjs"]);
    const promptAndTools = capture(root, ["examples/citywheels/helpdesk.mjs"]);
    components = { application, dependencies: combine(capture(root, ["package-lock.json", "vendor", "node_modules/@quinelings/agent-sdk/dist", "node_modules/@quinelings/agent-sdk/package.json"]), runtimeSnapshot), prompt: promptAndTools, tools: promptAndTools, sop: combine(capture(root, ["examples/citywheels/data/policies"]), capture(root, ["examples/citywheels/knowledge.json"])), policy: capture(runDirectory, ["policy.json"]), gateway: capture(root, ["examples/citywheels/scripts/citywheels-intentgauge.mjs"]), rubric, evaluator };
  } else if (target === "python" || target === "python-audit") {
    const files = readdirSync(join(pythonRoot, "citywheels")).filter((name) => name.endsWith(".py")).map((name) => `citywheels/${name}`);
    components = { application: combine(capture(pythonRoot, files), capture(root, ["dist/src", "dist/examples/citywheels/src", "examples/citywheels/scripts/citywheels-python.py", "examples/citywheels/scripts/helpdesk-workbench.mjs", "examples/citywheels/scripts/helpdesk-qualification.mjs", "examples/citywheels/scripts/casework-api.mjs", "scripts/experiment-inventory.mjs", "examples/citywheels/scripts/citywheels-questions.mjs", "examples/citywheels/scripts/citywheels-operational-context.mjs", "examples/citywheels/scripts/helpdesk-ambiguity.mjs"])), prompt: capture(pythonRoot, ["citywheels/prompts.py"]), tools: capture(pythonRoot, ["citywheels/tools.py"]), sop: combine(capture(pythonRoot, ["data/policies"]), capture(root, ["examples/citywheels/knowledge.json"])), policy: capture(pythonRoot, ["citywheels/refunds.py"]), rubric, evaluator };
    if (target === "python-audit") {
      const bridge = capture(root, ["examples/citywheels/scripts/citywheels-python-audited.mjs", "examples/citywheels/scripts/citywheels-python-model.py", "examples/citywheels/helpdesk.mjs"]);
      components.application = combine(components.application, bridge);
      components.gateway = bridge;
      components.tools = combine(components.tools, capture(root, ["examples/citywheels/scripts/citywheels-python.py"]));
      components.policy = capture(runDirectory, ["policy.json"]);
    }
  } else throw new Error("Unknown help-desk target");
  const identity = { provider: provider === "live" ? "openai" : "scripted", name: model, immutableRevision: null };
  return { components, model: identity, targetRevision: evidenceDigest({ components, model: identity }) };
}

export function retainHelpdeskQualification({ home, runDirectory, release, currentRelease, suite, report }) {
  const store = new QualificationStore(join(home, "qualifications"));
  const intents = [...new Set(suite.cases.map((c) => c.intent))].sort();
  const suiteRef = store.put(JSON.stringify(suite));
  const reportRef = store.put(JSON.stringify(report));
  const packages = intents.map((intent) => {
    const value = store.create({ intent, ...release, coverage: { maximumTier: "contain", actions: ["deliver-answer"] }, suite: suiteRef, report: reportRef, calibration: null,
      provenance: { kind: "synthetic", owner: "local-experiment-operator", sampling: "development", source: "CityWheels scripted business fixtures", independentReview: null } });
    return { package: value, assessment: store.inspect(value, currentRelease) };
  });
  const result = { version: 1, store: store.directory, packages, runtimeCoverage: release.components.dependencies ? "Node runtime version and dependency archive snapshots; host OS is not captured" : "Python interpreter and environment are not captured; dependencies are missing", note: "Evidence only. No approval or permission to transact is created." };
  writeFileSync(join(runDirectory, "qualification.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  return result;
}

export function qualificationStore(home) {
  return new QualificationStore(join(home, "qualifications"));
}

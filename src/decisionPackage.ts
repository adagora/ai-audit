import { AuditLog, canon, decisionConsistency, sha256 } from "./audit.js";
import { readEvidenceRecords } from "./evidence.js";
import { replayQdl, type QdlStep } from "./qdl.js";
import { hasDuplicateKeys, inspect } from "./scan.js";
import { QUINELING_COLORS, renderQuinelingBody, xmlEscape as esc } from "./quinelingSvg.js";

export interface DecisionPackage {
  format: "ai-audit-decision-package";
  version: 1;
  decision: { id: string; llmCallId?: string };
  program: { source: string; sourceHash: string; registry: string; registryDigest: string };
  run: { inputs: Record<string, unknown>; inputHash: string; outputs: unknown[]; outputsHash: string };
  origin: { logDigest: string; decisionHash: string; stepHash: string };
  digest: string;
}

const digestOf = ({ digest, ...payload }: DecisionPackage) => sha256(canon(payload));
const hash = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fields = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> => object(value)
  && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

function packageShape(value: unknown): asserts value is DecisionPackage {
  if (!fields(value, ["format", "version", "decision", "program", "run", "origin", "digest"])
    || value.format !== "ai-audit-decision-package" || value.version !== 1
    || !fields(value.decision, ["id"], ["llmCallId"]) || typeof value.decision.id !== "string"
    || (value.decision.llmCallId !== undefined && typeof value.decision.llmCallId !== "string")
    || !fields(value.program, ["source", "sourceHash", "registry", "registryDigest"])
    || typeof value.program.source !== "string" || Buffer.byteLength(value.program.source) > 2 * 1024 * 1024
    || typeof value.program.sourceHash !== "string" || !/^ql_[0-9a-f]{64}$/.test(value.program.sourceHash)
    || typeof value.program.registry !== "string" || !hash(value.program.registryDigest)
    || !fields(value.run, ["inputs", "inputHash", "outputs", "outputsHash"]) || !object(value.run.inputs)
    || typeof value.run.inputHash !== "string" || !/^qi_[0-9a-f]{64}$/.test(value.run.inputHash) || !Array.isArray(value.run.outputs) || !hash(value.run.outputsHash)
    || !fields(value.origin, ["logDigest", "decisionHash", "stepHash"])
    || !Object.values(value.origin).every(hash) || !hash(value.digest)) throw new Error("audit_invalid_decision_package");
}

export function parseDecisionPackage(text: string): DecisionPackage {
  if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error("audit_package_too_large");
  let json = text;
  if (text.trimStart().startsWith("<")) {
    const matches = [...text.matchAll(/<metadata id="ai-audit-package">([^]*?)<\/metadata>/g)];
    if (matches.length !== 1) throw new Error("audit_invalid_decision_package");
    json = matches[0][1].replace(/&(amp|lt|gt|quot|apos);/g, (_all, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity]!));
  }
  if (hasDuplicateKeys(json)) throw new Error("audit_invalid_decision_package");
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("audit_invalid_decision_package"); }
  packageShape(value);
  return value;
}

export async function reproducePackage(value: DecisionPackage) {
  packageShape(value);
  if (digestOf(value) !== value.digest) throw new Error("audit_package_digest_mismatch");
  if (sha256(canon(value.run.outputs)) !== value.run.outputsHash) throw new Error("audit_package_output_mismatch");
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  const session = new m.Session();
  const described = session.describe();
  if (described.registry !== value.program.registry || described.registryDigest !== value.program.registryDigest) throw new Error("audit_package_runtime_mismatch");
  const artifact = session.recover({ source: value.program.source });
  if (artifact.id !== value.program.sourceHash) throw new Error("audit_package_source_mismatch");
  const run = session.run({ artifactId: artifact.id, requestId: "verify-package", inputs: value.run.inputs as Parameters<typeof session.run>[0]["inputs"] });
  if (run.result.status !== "completed" || run.result.inputHash !== value.run.inputHash
    || canon(run.result.occurrences[0]?.outputs) !== canon(value.run.outputs)) throw new Error("audit_package_replay_failed");
  return { session, artifact, occurrence: run.result.occurrences[0] };
}

export async function createDecisionPackage(log: AuditLog, id: string): Promise<DecisionPackage> {
  const { records, digest: logDigest } = readEvidenceRecords(log);
  const main = records.find((r) => r.kind === "decision" && r.id === id && !r.qdl)
    ?? records.find((r) => r.kind === "decision" && !r.qdl && r.id === records.find((q) => q.id === id && q.qdl)?.refId);
  const step = records.find((r) => r.qdl && r.refId === main?.id);
  const q = step?.qdl as QdlStep | undefined;
  if (!main || !step || !q || !decisionConsistency(records, main.id).ok) throw new Error("audit_package_inconsistent_decision");
  if (q.status !== "completed" && q.status !== undefined || !q.sourceHash || !q.inputs || !q.inputHash || !q.outputsHash) throw new Error("audit_package_requires_completed_decision");
  const source = q.source ?? records.find((r) => r.kind === "program" && r.id === q.sourceHash)?.source;
  if (typeof source !== "string") throw new Error("audit_qdl_source_missing");
  const replay = await replayQdl(log, main.id, records);
  if (!replay.reproduced || replay.status !== "completed" || !replay.output) throw new Error("audit_package_replay_failed");
  const m = await import("@quinelings/agent-sdk/v1");
  const { registry, registryDigest } = new m.Session().describe();
  const value: DecisionPackage = {
    format: "ai-audit-decision-package", version: 1,
    decision: { id: main.id, ...(main.llmCallId && { llmCallId: main.llmCallId }) },
    program: { source, sourceHash: q.sourceHash, registry, registryDigest },
    run: { inputs: q.inputs, inputHash: q.inputHash, outputs: replay.output, outputsHash: q.outputsHash },
    origin: { logDigest, decisionHash: main.hash, stepHash: step.hash }, digest: "",
  };
  if (inspect({ source, inputs: q.inputs, outputs: replay.output }).findings.length) throw new Error("audit_package_sensitive_data");
  value.digest = digestOf(value);
  packageShape(value);
  return value;
}

const shortValue = (value: unknown, max = 72) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const points = Array.from(text ?? "");
  return points.length > max ? points.slice(0, max - 1).join("") + "…" : text;
};

export async function renderDecisionSvg(value: DecisionPackage): Promise<string> {
  const { session, artifact, occurrence } = await reproducePackage(value);
  const steps = occurrence.trace ?? [];
  const height = Math.max(860, 410 + steps.length * 56);
  const frame = session.frame(artifact.id, 0.25);
  const body = renderQuinelingBody(frame).replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg x="32" y="192" width="470" height="390"');
  const nodes = artifact.payload.task?.nodes ?? [];
  const summary = value.run.outputs.slice(0, 3).map((output, index) => {
    const id = artifact.payload.task?.outputs?.[index] ?? `output ${index + 1}`;
    const type = nodes.find((node) => node.id === id)?.type;
    const unit = type?.kind === "number" ? type.unit : undefined;
    const label = object(output) ? `${output.status ?? "receipt"}${typeof output.action === "string" ? `: ${output.action}` : ""}` : shortValue(output, 35);
    return `${id} = ${label}${typeof unit === "string" && unit !== "one" ? ` ${unit}` : ""}`;
  }).join(" · ");
  const rows = steps.map((step, i) => {
    const y = 210 + i * 56;
    const owner = frame.nodeIds.indexOf(step.nodeId);
    const marker = owner < 0 ? "" : `<circle cx="541" cy="${y - 5}" r="5" fill="${QUINELING_COLORS[owner % QUINELING_COLORS.length]}"/>`;
    return `<g><title>${esc(step.nodeId)}: ${esc(JSON.stringify(step.value))}</title><line x1="532" y1="${y + 37}" x2="1068" y2="${y + 37}" stroke="#d9d0bf"/>${marker}<text x="554" y="${y}" font-size="14" font-weight="600">${esc(step.nodeId)} · ${esc(step.op)}</text><text x="554" y="${y + 22}" font-size="12" font-family="monospace">${esc(shortValue(step.value, 66))}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title description">
<title id="title">Decision receipt: ${esc(artifact.payload.name)}</title>
<desc id="description">A Quinelings program body and its recorded calculation. Exact source and inputs are embedded in metadata. The calculation reproduced; origin and human approval are not verified by this file.</desc>
<metadata id="ai-audit-package">${esc(JSON.stringify(value))}</metadata>
<rect width="1100" height="${height}" fill="#f4f1ea"/>
<g fill="#24221d" font-family="sans-serif">
<text x="32" y="42" font-size="13" letter-spacing="2">AI-AUDIT / DECISION RECEIPT</text>
<text x="32" y="84" font-size="28" font-weight="600">${esc(shortValue(artifact.payload.name, 60))}</text>
<text x="32" y="118" font-size="16">Outputs: ${esc(shortValue(summary, 105))}</text>
<text x="32" y="150" font-size="13">Calculation reproduced · Origin not verified · Simulated actions only</text>
<text x="32" y="174" font-size="12" font-family="monospace">Decision ${esc(shortValue(value.decision.id, 100))}</text>
${body}
<text x="48" y="610" font-size="16" font-weight="600">The body is a visual index of the program.</text>
<text x="48" y="636" font-size="13">Step names link its regions to the calculation on the right.</text>
<text x="48" y="662" font-size="13">Similar shapes do not establish identical source.</text>
<text x="48" y="702" font-size="15" font-weight="600">This SVG carries exact source and inputs.</text>
<text x="48" y="728" font-size="13">Review the embedded data before sharing.</text>
<text x="48" y="754" font-size="13">Long display values are shortened; metadata keeps them whole.</text>
${rows}
<line x1="32" y1="${height - 78}" x2="1068" y2="${height - 78}" stroke="#b7ae9d"/>
<text x="32" y="${height - 52}" font-size="12" font-family="monospace">Program ${esc(value.program.sourceHash)}</text>
<text x="32" y="${height - 30}" font-size="12" font-family="monospace">Package ${esc(value.digest)}</text>
<text x="32" y="${height - 10}" font-size="11">Verify with: ai-audit verify-receipt --input receipt.svg · Keep the original SVG; image conversion can remove metadata.</text>
</g></svg>`;
}

export async function verifyPortableReceipt(text: string) {
  const value = parseDecisionPackage(text);
  await reproducePackage(value);
  const svg = text.trimStart().startsWith("<");
  if (svg && text.trim() !== (await renderDecisionSvg(value)).trim()) throw new Error("audit_package_presentation_mismatch");
  return { reproduced: true, sourceHash: value.program.sourceHash, digest: value.digest, presentation: svg ? "matched" : "not-included", origin: "not-verified", humanApproval: "not-verified" };
}

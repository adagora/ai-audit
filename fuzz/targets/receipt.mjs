import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIST, fail } from "./common.mjs";

const { AuditLog, canon, sha256 } = await import(DIST + "audit.js");
const { recordQdl } = await import(DIST + "qdl.js");
const { createDecisionPackage, packageJson, parseDecisionPackage, renderDecisionSvg } = await import(DIST + "decisionPackage.js");
const { parseAttestation } = await import(DIST + "attestation.js");

const policy = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "fuzz-receipt-")), "audit.jsonl"));
const recorded = await recordQdl(log, { systemId: "fuzz", useCase: "quote", input: "x" }, { intent: policy }, { minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274 });
const BUNDLE = await createDecisionPackage(log, recorded.decision.id);
const TEXTS = [packageJson(BUNDLE), await renderDecisionSvg(BUNDLE)];
const H = "a".repeat(64);
const ATTESTATION = JSON.stringify({ format: "ai-audit-decision-attestation", version: 1, decision: { id: "d", packageDigest: H, decisionHash: H, stepHash: H },
  review: { id: "r", hash: H, verdict: "approved" }, checkpoint: { count: 3, head: H, logDigest: H }, keyId: H, signedAt: "2026-10-30T00:00:00.000Z", signature: "A".repeat(86) + "==" });
const SPELLINGS = [(n) => `${n}.0`, (n) => `${n}e0`, (n) => `${n}00000000000000001`.replace(/^(\d+)0+1$/, "$1.00000000000000001"), (n) => `-0${n === "0" ? "" : `+${n}`}`, (n) => ` ${n} `, (n) => n.replace(/^(\d)/, "$1.").replace(/\.$/, "e0")];

const audited = (what, input, run) => {
  try { return run(); } catch (e) { if (!/^audit_[a-z_]+$/.test(e?.message)) fail(`${what} throws ${e}`, { input: input.slice(0, 2000) }); }
};
function accepted(text) {
  const value = audited("parseDecisionPackage", text, () => parseDecisionPackage(text));
  if (!value || text.trimStart().startsWith("<")) return undefined;
  const { digest, ...payload } = value;
  return sha256(canon(payload)) === digest && sha256(canon(value.run.outputs)) === value.run.outputsHash && text.trim() === packageJson(value) ? value : undefined;
}
function oneReading(text) {
  JSON.parse(text, (key, v, context) => {
    if (typeof v === "number" && context?.source !== String(v)) fail("an accepted receipt spells a number another way", { key, source: context?.source, value: v });
    return v;
  });
}

function mutated(data) {
  let text = TEXTS[data[1] % TEXTS.length], i = 2;
  const byte = () => data[i++ % data.length];
  for (let ops = 1 + (data[1] >> 4) % 3; ops > 0 && i < data.length + 8; ops--) {
    const numbers = [...text.matchAll(/(?<=[:\[,]\s*)\d+(?:\.\d+)?/g)], op = byte() % 4;
    if (op === 0 && numbers.length) { const m = numbers[byte() % numbers.length]; text = text.slice(0, m.index) + SPELLINGS[byte() % SPELLINGS.length](m[0]) + text.slice(m.index + m[0].length); }
    else if (op === 1) { const at = (byte() * 256 + byte()) % (text.length + 1); text = text.slice(0, at) + [" ", "\n", "\t", "\r\n"][byte() % 4] + text.slice(at); }
    else if (op === 2) { const at = (byte() * 256 + byte()) % Math.max(text.length, 1); text = text.slice(0, at) + String.fromCharCode(byte()) + text.slice(at + 1); }
    else { const at = (byte() * 256 + byte()) % Math.max(text.length, 1); text = text.slice(0, at) + text.slice(at + 1 + (byte() % 8)); }
  }
  return text;
}

export function fuzz(data) {
  if (data.length < 2) return;
  if (data[0] % 2 === 0) {
    const text = mutated(data), value = accepted(text);
    if (value) { oneReading(text); if (packageJson(parseDecisionPackage(packageJson(value))) !== packageJson(value)) fail("packageJson does not read back the same", { text }); }
    audited("parseAttestation", ATTESTATION, () => parseAttestation(ATTESTATION));
  } else {
    const text = data.subarray(1).toString("utf8");
    audited("parseDecisionPackage", text, () => parseDecisionPackage(text));
    audited("parseAttestation", text, () => parseAttestation(text));
  }
}

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { AuditLog, canon, type Review } from "./audit.js";
import { createDecisionPackage, parseDecisionPackage, verifyPortableReceipt } from "./decisionPackage.js";
import { readEvidenceRecords } from "./evidence.js";
import { hasDuplicateKeys } from "./scan.js";

export interface DecisionAttestation {
  format: "ai-audit-decision-attestation";
  version: 1;
  decision: { id: string; packageDigest: string; decisionHash: string; stepHash: string };
  review: { id: string; hash: string; verdict: Review["decision"] };
  checkpoint: { count: number; head: string; logDigest: string };
  keyId: string;
  signedAt: string;
  signature: string;
}

const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fields = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const payloadOf = ({ signature, ...payload }: DecisionAttestation) => payload;
const keyIdOf = (publicKey: ReturnType<typeof createPublicKey>) => createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");

export function generateAttestationKeys(privatePath: string, publicPath: string): string {
  if (privatePath === publicPath) throw new Error("audit_key_paths_equal");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  try { writeFileSync(publicPath, publicKey.export({ type: "spki", format: "pem" }), { flag: "wx", mode: 0o644 }); }
  catch (cause) { throw new Error((cause as NodeJS.ErrnoException).code === "EEXIST" ? "audit_output_exists" : "audit_output_unavailable"); }
  try { writeFileSync(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 }); }
  catch (cause) { throw new Error((cause as NodeJS.ErrnoException).code === "EEXIST" ? "audit_output_exists" : "audit_output_unavailable"); }
  return keyIdOf(publicKey);
}

function validate(value: unknown): asserts value is DecisionAttestation {
  if (!fields(value, ["format", "version", "decision", "review", "checkpoint", "keyId", "signedAt", "signature"])
    || value.format !== "ai-audit-decision-attestation" || value.version !== 1
    || !fields(value.decision, ["id", "packageDigest", "decisionHash", "stepHash"])
    || typeof value.decision.id !== "string" || !value.decision.id || !hash(value.decision.packageDigest)
    || !hash(value.decision.decisionHash) || !hash(value.decision.stepHash)
    || !fields(value.review, ["id", "hash", "verdict"]) || typeof value.review.id !== "string" || !value.review.id
    || !hash(value.review.hash) || !["approved", "overridden", "rejected"].includes(String(value.review.verdict))
    || !fields(value.checkpoint, ["count", "head", "logDigest"])
    || !Number.isSafeInteger(value.checkpoint.count) || Number(value.checkpoint.count) < 1
    || !hash(value.checkpoint.head) || !hash(value.checkpoint.logDigest)
    || !hash(value.keyId) || typeof value.signedAt !== "string" || !Number.isFinite(Date.parse(value.signedAt))
    || typeof value.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(value.signature)) throw new Error("audit_invalid_attestation");
}

export function parseAttestation(text: string): DecisionAttestation {
  if (Buffer.byteLength(text) > 64 * 1024 || hasDuplicateKeys(text)) throw new Error("audit_invalid_attestation");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("audit_invalid_attestation"); }
  validate(value);
  return value;
}

export async function createAttestation(log: AuditLog, id: string, privatePem: string, verdict: Review["decision"]): Promise<DecisionAttestation> {
  if (!["approved", "overridden", "rejected"].includes(verdict)) throw new Error("audit_invalid_verdict");
  const bundle = await createDecisionPackage(log, id);
  const { records, digest } = readEvidenceRecords(log);
  if (digest !== bundle.origin.logDigest) throw new Error("audit_evidence_changed");
  const review = [...records].reverse().find((record) => record.kind === "review" && record.refId === bundle.decision.id);
  if (!review || review.review?.decision !== verdict) throw new Error("audit_review_mismatch");
  const main = records.find((record) => record.kind === "decision" && record.id === bundle.decision.id && !record.qdl);
  const step = records.find((record) => record.qdl && record.refId === bundle.decision.id);
  if (main?.hash !== bundle.origin.decisionHash || step?.hash !== bundle.origin.stepHash) throw new Error("audit_evidence_changed");
  let privateKey: ReturnType<typeof createPrivateKey>;
  try { privateKey = createPrivateKey(privatePem); } catch { throw new Error("audit_invalid_private_key"); }
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("audit_invalid_private_key");
  const head = records.at(-1)?.hash;
  if (!head) throw new Error("audit_invalid_evidence_chain");
  const payload = {
    format: "ai-audit-decision-attestation" as const, version: 1 as const,
    decision: { id: bundle.decision.id, packageDigest: bundle.digest, decisionHash: main.hash, stepHash: step.hash },
    review: { id: review.id, hash: review.hash, verdict },
    checkpoint: { count: records.length, head, logDigest: digest },
    keyId: keyIdOf(createPublicKey(privateKey)), signedAt: new Date().toISOString(),
  };
  return { ...payload, signature: sign(null, Buffer.from(canon(payload)), privateKey).toString("base64") };
}

export async function verifyAttestation(receiptText: string, attestationText: string, publicPem: string) {
  const attestation = parseAttestation(attestationText);
  const receipt = parseDecisionPackage(receiptText);
  const replay = await verifyPortableReceipt(receiptText);
  if (receipt.decision.id !== attestation.decision.id || receipt.digest !== attestation.decision.packageDigest
    || receipt.origin.decisionHash !== attestation.decision.decisionHash || receipt.origin.stepHash !== attestation.decision.stepHash
    || receipt.origin.logDigest !== attestation.checkpoint.logDigest) throw new Error("audit_attestation_receipt_mismatch");
  let publicKey: ReturnType<typeof createPublicKey>;
  try { publicKey = createPublicKey(publicPem); } catch { throw new Error("audit_invalid_public_key"); }
  if (publicKey.asymmetricKeyType !== "ed25519" || keyIdOf(publicKey) !== attestation.keyId) throw new Error("audit_attestation_key_mismatch");
  if (!verify(null, Buffer.from(canon(payloadOf(attestation))), publicKey, Buffer.from(attestation.signature, "base64"))) throw new Error("audit_attestation_signature_mismatch");
  return { reproduced: replay.reproduced, presentation: replay.presentation, origin: "signed-checkpoint", approval: "signed-review-record",
    verdict: attestation.review.verdict, decision: attestation.decision.id, keyId: attestation.keyId,
    checkpoint: { count: attestation.checkpoint.count, head: attestation.checkpoint.head }, identity: "public-key-trust-required", time: "self-declared" };
}

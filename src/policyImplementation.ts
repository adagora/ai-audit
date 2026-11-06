import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export interface PolicyImplementation {
  format: "auditline-policy-implementation"; version: 1;
  files: { path: string; sha256: string }[];
  digest: string;
}
export interface PolicyRuntimeBinding { registry: string; registryDigest: string; implementationDigest: string }
export const POLICY_IMPLEMENTATION_FILES = Object.freeze(["policyAdapter.js", "policyEvidence.js", "policyImplementation.js", "policyRuntime.js", "policyValue.js"]);
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const manifest = (): PolicyImplementation => {
  const files = POLICY_IMPLEMENTATION_FILES.map((path) => ({ path, sha256: hash(readFileSync(new URL(path, import.meta.url))) }));
  const value = { format: "auditline-policy-implementation" as const, version: 1 as const, files };
  return { ...value, digest: hash(JSON.stringify(value)) };
};
const loaded = manifest();

export function policyImplementation(): PolicyImplementation {
  if (manifest().digest !== loaded.digest) throw new Error("audit_policy_implementation_changed");
  return { ...loaded, files: loaded.files.map((file) => ({ ...file })) };
}

export function isPolicyImplementation(value: unknown): value is PolicyImplementation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || v.format !== "auditline-policy-implementation" || v.version !== 1
    || typeof v.digest !== "string" || !/^[0-9a-f]{64}$/.test(v.digest) || !Array.isArray(v.files)
    || v.files.length !== POLICY_IMPLEMENTATION_FILES.length) return false;
  return v.files.every((file, i) => file && typeof file === "object" && !Array.isArray(file) && Object.keys(file).length === 2
    && file.path === POLICY_IMPLEMENTATION_FILES[i] && typeof file.sha256 === "string" && /^[0-9a-f]{64}$/.test(file.sha256));
}

export function verifyPolicyImplementation(value: unknown): asserts value is PolicyImplementation {
  if (!isPolicyImplementation(value)) throw new Error("audit_policy_implementation_mismatch");
  const local = policyImplementation();
  const payload = { format: value.format, version: value.version, files: value.files.map((file) => ({ path: file.path, sha256: file.sha256 })) };
  if (hash(JSON.stringify(payload)) !== value.digest || value.digest !== local.digest
    || payload.files.some((file, i) => file.sha256 !== local.files[i].sha256)) throw new Error("audit_policy_implementation_mismatch");
}

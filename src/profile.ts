import { createHash } from "node:crypto";
import type { ActionGate } from "./actionGate.js";
import { RULES_DIGEST, SCANNER_VERSION, type Allowlist, type Mode } from "./scan.js";

export interface InspectionProfile {
  readonly scannerVersion: string;
  readonly rulesDigest: string;
  readonly configDigest: string;
  readonly digest: string;
}

export interface InspectionOptions {
  mode: Mode;
  pageRedaction?: boolean;
  carnet?: ReadonlySet<string>;
  scope?: "request" | "history";
  actionGate?: ActionGate;
}

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export function createInspectionProfile(options: InspectionOptions) {
  const hashes = [...(options.carnet ?? [])].map((h) => h.toLowerCase()).sort();
  if (hashes.some((h) => !/^[a-f0-9]{64}$/.test(h))) throw new Error("audit_invalid_allowlist");
  const entries = new Set(hashes);
  const carnet: Allowlist = Object.freeze({ has: (value: string) => entries.has(value) });
  const pageRedaction = options.pageRedaction !== false;
  const configDigest = hash({ mode: options.mode, pageRedaction, scope: options.scope ?? "request",
    attachments: options.scope === "history" ? "excluded" : "inspect", allowlistDigest: hash([...entries]), ...(options.actionGate && { actionGateDigest: hash(options.actionGate) }) });
  const identity = { scannerVersion: SCANNER_VERSION, rulesDigest: RULES_DIGEST, configDigest };
  const receipt: InspectionProfile = Object.freeze({ ...identity, digest: hash(identity) });
  return Object.freeze({ receipt, carnet, allowHashes: Object.freeze(hashes), pageRedaction, mode: options.mode, id: receipt.digest });
}

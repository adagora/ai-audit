import { readFileSync } from "node:fs";
import { AuditLog, canon, sha256, type Rec } from "./audit.js";

export function readEvidenceRecords(log: AuditLog): { records: Rec[]; digest: string } {
  let raw: string;
  try { raw = readFileSync(log.path, "utf8"); } catch { throw new Error("audit_log_unavailable"); }
  if (raw && !raw.endsWith("\n")) throw new Error("audit_invalid_evidence_chain");
  let records: Rec[];
  try { records = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch { throw new Error("audit_invalid_evidence_chain"); }
  let previous = "0".repeat(64);
  for (const record of records) {
    if (!record || typeof record !== "object") throw new Error("audit_invalid_evidence_chain");
    const { hash, ...body } = record;
    if (record.prevHash !== previous || sha256(canon(body)) !== hash) throw new Error("audit_invalid_evidence_chain");
    previous = hash;
  }
  return { records, digest: sha256(raw) };
}

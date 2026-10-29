import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { AuditLog, checkSeries, type Rec } from "./audit.js";

export function readEvidenceRecords(log: AuditLog): { records: Rec[]; digest: string } {
  const digest = createHash("sha256"), files: (readonly [string, string[]])[] = [], paths = log.files();
  if (!paths.length) throw new Error("audit_log_unavailable");
  for (const f of paths) {
    let raw: string;
    try { raw = readFileSync(f, "utf8"); } catch { throw new Error("audit_log_unavailable"); }
    if (raw && !raw.endsWith("\n")) throw new Error("audit_invalid_evidence_chain");
    digest.update(raw);
    files.push([basename(f), raw.split("\n").filter(Boolean)] as const);
  }
  if (!checkSeries(files).ok) throw new Error("audit_invalid_evidence_chain");
  const records: Rec[] = [];
  for (const [, lines] of files) for (const line of lines) {
    const record = JSON.parse(line);
    if (!record || typeof record !== "object") throw new Error("audit_invalid_evidence_chain");
    records.push(record);
  }
  return { records, digest: digest.digest("hex") };
}

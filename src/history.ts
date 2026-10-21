// Offline text redaction of JSON/JSONL exports. Originals and audit chains are never rewritten.
import { open, link, unlink, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import { hasDuplicateKeys, inspect } from "./scan.js";
import { createInspectionProfile, type InspectionProfile } from "./profile.js";

export interface ScrubOptions {
  input: string;
  output: string;
  format?: "json" | "jsonl";
  carnet?: ReadonlySet<string>;
  maxRecordBytes?: number;
}
export interface ScrubReceipt {
  format: "json" | "jsonl";
  records: number;
  changed: number;
  findings: Record<string, number>;
  inspectionProfile: InspectionProfile;
  attachments: "excluded";
  outputDigest: string;
}

function error(code: string): never { throw new Error(code); }

function containsAuditRecord(value: unknown): boolean {
  if (typeof value === "string" && /^\s*[\[{]/.test(value)) {
    try { return containsAuditRecord(JSON.parse(value)); } catch { return false; }
  }
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value) && "prevHash" in value && "hash" in value) return true;
  return Object.values(value).some(containsAuditRecord);
}

/** Bound records in bytes before decoding or JSON parsing; JSONL files can be arbitrarily large. */
async function* records(file: FileHandle, format: "json" | "jsonl", max: number): AsyncGenerator<Buffer> {
  let parts: Buffer[] = [], size = 0;
  for await (const chunk of file.createReadStream({ highWaterMark: 64 * 1024, autoClose: false })) {
    const bytes = chunk as Buffer;
    let start = 0;
    for (let i = 0; i <= bytes.length; i++) {
      if (i !== bytes.length && (format !== "jsonl" || bytes[i] !== 10)) continue;
      const part = bytes.subarray(start, i);
      size += part.length;
      if (size > max) error("scrub_record_too_large");
      parts.push(part);
      if (i < bytes.length) { yield Buffer.concat(parts, size); parts = []; size = 0; }
      start = i + 1;
    }
  }
  if (size || format === "json") yield Buffer.concat(parts, size);
}

/** Publish only a fully sanitized file, exclusively and with owner-only permissions. */
export async function scrubHistory(options: ScrubOptions): Promise<ScrubReceipt> {
  if (!options.input || !options.output) error("scrub_input_and_output_required");
  if (resolve(options.input) === resolve(options.output)) error("scrub_output_must_differ");
  const format = options.format ?? (extname(options.input).toLowerCase() === ".json" ? "json" : "jsonl");
  if (format !== "json" && format !== "jsonl") error("scrub_invalid_format");
  const max = options.maxRecordBytes ?? 32 * 1024 * 1024;
  if (!Number.isSafeInteger(max) || max < 1) error("scrub_invalid_record_limit");
  const profile = createInspectionProfile({ mode: "redact", carnet: options.carnet, scope: "history" });
  const temp = join(dirname(resolve(options.output)), `.ai-audit-scrub-${randomUUID()}.tmp`);
  let input: FileHandle | undefined, output: FileHandle | undefined;
  try {
    input = await open(options.input, "r");
    const before = await input.stat({ bigint: true });
    if (!before.isFile()) error("scrub_regular_file_required");
    output = await open(temp, "wx", 0o600);
    const digest = createHash("sha256");
    const receipt: ScrubReceipt = { format, records: 0, changed: 0, findings: {}, inspectionProfile: profile.receipt,
      attachments: "excluded", outputDigest: "" };
    for await (const bytes of records(input, format, max)) {
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { error("scrub_invalid_utf8"); }
      if (format === "jsonl" && !text!.trim()) continue;
      let value: unknown;
      try { value = JSON.parse(text!); } catch { error("scrub_malformed_json"); }
      if (hasDuplicateKeys(text!)) error("scrub_duplicate_keys");
      // A chained audit record must remain intact. Scrubbing one would manufacture a broken ledger.
      if (containsAuditRecord(value)) error("scrub_audit_log_forbidden");
      const result = inspect(value, profile.carnet);
      if (result.findings.some((f) => f.inKey || f.unredactable)) error("scrub_unredactable_content");
      if (inspect(result.value, profile.carnet).findings.length) error("scrub_verification_failed");
      const sanitized = JSON.stringify(result.value) + "\n";
      await output.writeFile(sanitized);
      digest.update(sanitized);
      receipt.records++;
      if (result.findings.length) receipt.changed++;
      for (const finding of result.findings) receipt.findings[finding.rule] = (receipt.findings[finding.rule] ?? 0) + 1;
    }
    const after = await input.stat({ bigint: true }), current = await stat(options.input, { bigint: true });
    if ([after, current].some((s) => s.dev !== before.dev || s.ino !== before.ino || s.size !== before.size ||
      s.mtimeNs !== before.mtimeNs || s.ctimeNs !== before.ctimeNs)) error("scrub_source_changed");
    await output.sync();
    await output.close(); output = undefined;
    // A hard link is an atomic, no-replace publication on the same filesystem (the temp is adjacent).
    await link(temp, options.output);
    receipt.outputDigest = digest.digest("hex");
    return receipt;
  } catch (cause) {
    const code = cause instanceof Error && /^(?:scrub_[a-z0-9_]+|audit_invalid_allowlist)$/.test(cause.message)
      ? cause.message : (cause as NodeJS.ErrnoException)?.code === "EEXIST" ? "scrub_output_exists" : "scrub_io_error";
    throw new Error(code); // OS errors and parser diagnostics can contain source content or filenames.
  } finally {
    await output?.close().catch(() => {});
    await input?.close().catch(() => {});
    await unlink(temp).catch(() => {});
  }
}

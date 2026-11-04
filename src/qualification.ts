import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { hasDuplicateKeys } from "./scan.js";
import type { Tier } from "./useCases.js";

export const COMPONENTS = ["application", "dependencies", "prompt", "sop", "tools", "policy", "gateway", "rubric", "evaluator"] as const;
export type ComponentName = typeof COMPONENTS[number];
export interface BlobRef { digest: string; bytes: number }
export interface SnapshotFile extends BlobRef { path: string }
export interface Snapshot { digest: string; files: SnapshotFile[] }
export interface EvidenceProvenance {
  kind: "synthetic" | "representative";
  owner: string;
  sampling: "development" | "random" | "risk-selected";
  source: string;
  independentReview: { reviewers: string[]; datasetDigest: string; rubricDigest: string } | null;
}
export interface QualificationPackage {
  format: "ai-audit-qualification";
  version: 1;
  createdAt: string;
  intent: string;
  targetRevision: string;
  coverage: { maximumTier: Exclude<Tier, "off">; actions: string[] };
  components: Partial<Record<ComponentName, Snapshot>>;
  model: { provider: string; name: string; immutableRevision: string | null };
  suite: BlobRef;
  report: BlobRef;
  calibration: BlobRef | null;
  provenance: EvidenceProvenance;
  digest: string;
}
export interface QualificationAssessment {
  digest: string;
  integrity: boolean;
  evidencePassed: boolean;
  representative: boolean;
  applicable: boolean;
  readyForApproval: boolean;
  approval: "not-recorded";
  issues: string[];
  limitations: string[];
}

const MAX_BLOB_BYTES = 64 * 1024 * 1024;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 512;
const identifier = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(v);
const digestBytes = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export function evidenceJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error("audit_qualification_invalid_json_value");
    return `[${value.map(evidenceJson).join(",")}]`;
  }
  if (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${evidenceJson(value[key])}`).join(",")}}`;
  throw new Error("audit_qualification_invalid_json_value");
}
export const evidenceDigest = (value: unknown) => digestBytes(evidenceJson(value));
const failure = (code: string): never => { throw new Error(`audit_qualification_${code}`); };

function parse(bytes: Buffer): any {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (hasDuplicateKeys(raw)) failure("duplicate_keys");
  try { return JSON.parse(raw); } catch { return failure("invalid_json"); }
}

function regularBytes(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > MAX_BLOB_BYTES) failure("invalid_file");
    const bytes = readFileSync(fd), after = fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) failure("file_changed");
    return bytes;
  } finally { closeSync(fd); }
}

function relativePath(path: unknown): asserts path is string {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) failure("invalid_path");
}

function blobRef(value: unknown): value is BlobRef {
  return object(value) && Object.keys(value).sort().join() === "bytes,digest" && hash(value.digest) && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= MAX_BLOB_BYTES;
}

function snapshot(value: unknown): value is Snapshot {
  if (!object(value) || Object.keys(value).sort().join() !== "digest,files" || !hash(value.digest) || !Array.isArray(value.files) || !value.files.length || value.files.length > 10000) return false;
  const paths: string[] = [];
  for (const file of value.files) {
    if (!object(file) || Object.keys(file).sort().join() !== "bytes,digest,path" || !blobRef({ digest: file.digest, bytes: file.bytes })) return false;
    try { relativePath(file.path); } catch { return false; }
    paths.push(file.path);
  }
  return new Set(paths).size === paths.length && paths.join("\n") === [...paths].sort().join("\n") && evidenceDigest(value.files) === value.digest;
}

function validatePackage(value: unknown): asserts value is QualificationPackage {
  if (!object(value) || Object.keys(value).sort().join() !== "calibration,components,coverage,createdAt,digest,format,intent,model,provenance,report,suite,targetRevision,version"
    || value.format !== "ai-audit-qualification" || value.version !== 1 || !hash(value.digest) || !Number.isFinite(Date.parse(value.createdAt))
    || !identifier(value.intent) || !text(value.targetRevision) || !object(value.components)
    || Object.entries(value.components).some(([name, files]) => !COMPONENTS.includes(name as ComponentName) || !snapshot(files))
    || !object(value.model) || Object.keys(value.model).sort().join() !== "immutableRevision,name,provider"
    || !text(value.model.provider) || !text(value.model.name) || !(value.model.immutableRevision === null || text(value.model.immutableRevision))
    || !blobRef(value.suite) || !blobRef(value.report) || !(value.calibration === null || blobRef(value.calibration))) failure("invalid_package");
  const record = value as Record<string, any>;
  const coverage = record.coverage;
  if (!object(coverage) || Object.keys(coverage).sort().join() !== "actions,maximumTier" || !["shadow", "assist", "contain", "transact"].includes(coverage.maximumTier)
    || !Array.isArray(coverage.actions) || !coverage.actions.length || new Set(coverage.actions).size !== coverage.actions.length
    || !coverage.actions.every((action: unknown) => typeof action === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(action))) failure("invalid_coverage");
  const p = record.provenance;
  if (!object(p) || Object.keys(p).sort().join() !== "independentReview,kind,owner,sampling,source" || !["synthetic", "representative"].includes(p.kind)
    || !text(p.owner) || !text(p.source) || !["development", "random", "risk-selected"].includes(p.sampling)) failure("invalid_provenance");
  if (p.independentReview !== null) {
    const review = p.independentReview;
    if (!object(review) || Object.keys(review).sort().join() !== "datasetDigest,reviewers,rubricDigest" || !Array.isArray(review.reviewers)
      || review.reviewers.length < 2 || !review.reviewers.every(text) || new Set(review.reviewers).size !== review.reviewers.length
      || !hash(review.datasetDigest) || !hash(review.rubricDigest)) failure("invalid_review");
  }
  const { digest, ...payload } = record;
  if (evidenceDigest(payload) !== digest) failure("package_digest");
}

export class QualificationStore {
  readonly directory: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = realpathSync(directory);
    for (const name of ["blobs", "packages"]) {
      const path = join(this.directory, name);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) failure("invalid_store");
    }
  }

  put(bytes: Buffer | string): BlobRef {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (buffer.length > MAX_BLOB_BYTES) failure("blob_too_large");
    const ref = { digest: digestBytes(buffer), bytes: buffer.length }, path = join(this.directory, "blobs", ref.digest);
    this.publish(path, buffer);
    this.read(ref);
    return ref;
  }

  read(ref: BlobRef): Buffer {
    if (!blobRef(ref)) failure("invalid_blob");
    const bytes = regularBytes(join(this.directory, "blobs", ref.digest));
    if (bytes.length !== ref.bytes || digestBytes(bytes) !== ref.digest) failure("blob_digest");
    return bytes;
  }

  capture(root: string, selections: string[]): Snapshot {
    const base = realpathSync(root), selected = new Map<string, SnapshotFile>();
    if (!Array.isArray(selections) || !selections.length) failure("empty_snapshot");
    const visit = (name: string) => {
      relativePath(name);
      if (name.split("/").some((part) => part === "live" || part === ".git" || part === ".env" || part.startsWith(".env.")) || /\.(pem|key|jsonl)$/i.test(name)) failure("sensitive_path");
      const path = resolve(base, name);
      if (relative(base, path).split(sep).includes("..")) failure("invalid_path");
      let prefix = base;
      for (const part of name.split("/")) {
        prefix = join(prefix, part);
        if (lstatSync(prefix).isSymbolicLink()) failure("symlink");
      }
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path).sort()) visit(`${name}/${entry}`);
      } else {
        if (!stat.isFile() || selected.size >= 10000) failure("invalid_file");
        selected.set(name, { path: name, ...this.put(regularBytes(path)) });
      }
    };
    selections.forEach(visit);
    const files = [...selected.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (!files.length) failure("empty_snapshot");
    return { digest: evidenceDigest(files), files };
  }

  create(input: Omit<QualificationPackage, "format" | "version" | "createdAt" | "digest">, now = new Date()): QualificationPackage {
    const payload = { format: "ai-audit-qualification" as const, version: 1 as const, createdAt: now.toISOString(), ...structuredClone(input) };
    const value = { ...payload, digest: evidenceDigest(payload) };
    validatePackage(value);
    for (const ref of [value.suite, value.report, ...(value.calibration ? [value.calibration] : []), ...Object.values(value.components).filter((s): s is Snapshot => s !== undefined).flatMap((s) => s.files.map(({ digest, bytes }) => ({ digest, bytes })))]) this.read(ref);
    this.publish(join(this.directory, "packages", value.digest + ".json"), Buffer.from(evidenceJson(value) + "\n"));
    return value;
  }

  load(digest: string): QualificationPackage {
    if (!hash(digest)) failure("invalid_digest");
    const value = parse(regularBytes(join(this.directory, "packages", digest + ".json")));
    validatePackage(value);
    if (value.digest !== digest) failure("package_digest");
    return value;
  }

  list(): QualificationPackage[] {
    return readdirSync(join(this.directory, "packages")).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort().map((name) => this.load(name.slice(0, -5)));
  }

  inspect(value: QualificationPackage, current?: { targetRevision: string; components: Partial<Record<ComponentName, Snapshot>>; model: QualificationPackage["model"] }): QualificationAssessment {
    const issues: string[] = [], limitations = ["Local integrity does not establish independent origin or evaluator correctness."];
    let integrity = true, evidencePassed = false, representative = false, applicable = false;
    try { validatePackage(value); } catch { return { digest: value?.digest ?? "", integrity: false, evidencePassed: false, representative: false, applicable: false, readyForApproval: false, approval: "not-recorded", issues: ["invalid-package"], limitations }; }
    for (const name of COMPONENTS) if (!value.components[name]) issues.push(`missing-component:${name}`);
    const refs = [value.suite, value.report, ...(value.calibration ? [value.calibration] : []), ...Object.values(value.components).filter((s): s is Snapshot => s !== undefined).flatMap((s) => s.files.map(({ digest, bytes }) => ({ digest, bytes })))];
    for (const ref of refs) { try { this.read(ref); } catch { integrity = false; issues.push(`unavailable-blob:${ref.digest}`); } }
    if (integrity) {
      try {
        const suite = parse(this.read(value.suite)), report = parse(this.read(value.report));
        if (!object(suite) || !Array.isArray(suite.cases) || !suite.cases.length || !object(report) || report.schemaVersion !== 1
          || report.suite?.hash !== evidenceDigest(suite) || report.target?.revision !== value.targetRevision) issues.push("report-identity-mismatch");
        else {
          const results = report.results;
          const intentCases = suite.cases.filter((c: any) => c.intent === value.intent);
          const repetitions = report.options?.repetitions;
          const identities = new Set<string>();
          let complete = Number.isSafeInteger(repetitions) && repetitions >= 1 && repetitions <= 1000 && Array.isArray(results) && intentCases.length > 0;
          if (complete) {
            for (const row of results) {
              if (!object(row) || !Number.isInteger(row.repetition) || row.repetition < 0 || row.repetition >= repetitions || !text(row.caseId)) { complete = false; continue; }
              const expected = suite.cases.find((c: any) => c.id === row.caseId);
              if (!expected || expected.intent !== row.intent || expected.split !== row.split) complete = false;
              if (!Array.isArray(row.checks) || !Array.isArray(expected?.assertions) || expected.assertions.some((a: any) => !row.checks.some((c: any) => c.id === a.id && c.status === "pass"))) complete = false;
              const key = JSON.stringify([row.caseId, row.repetition]);
              if (identities.has(key)) complete = false;
              identities.add(key);
            }
            if (new Set(suite.cases.map((c: any) => c.id)).size !== suite.cases.length) complete = false;
            for (const c of suite.cases) for (let n = 0; n < repetitions; n++) if (!identities.has(JSON.stringify([c.id, n]))) complete = false;
          }
          evidencePassed = complete && report.passed === true && Array.isArray(report.gates) && report.gates.every((g: any) => g.passed === true)
            && results.every((r: any) => r.status === "pass" && Array.isArray(r.checks) && r.checks.length > 0 && r.checks.every((c: any) => c.status === "pass" || (c.status === "skip" && c.severity !== "critical")));
          if (!evidencePassed) issues.push("evaluation-not-passing-or-incomplete");
          if (report.judge) {
            if (!value.calibration) issues.push("missing-judge-calibration");
            else {
              const envelope = parse(this.read(value.calibration));
              const calibration = envelope.report;
              if (envelope.datasetDigest !== value.suite.digest || envelope.rubricDigest !== value.components.rubric?.digest) issues.push("calibration-provenance-mismatch");
              const slices = calibration.slices?.filter((s: any) => s.intent === value.intent);
              if (calibration.eligible !== true || evidenceDigest(calibration.judge) !== evidenceDigest(report.judge) || !slices?.length || slices.some((s: any) => s.eligible !== true || s.unresolved !== 0)) issues.push("judge-not-qualified");
              limitations.push("Calibration eligibility is a measurement; label independence requires reviewed provenance.");
            }
          }
          const provenance = value.provenance, review = provenance.independentReview;
          representative = provenance.kind === "representative" && provenance.sampling === "random" && review !== null
            && review.datasetDigest === value.suite.digest && review.rubricDigest === value.components.rubric?.digest
            && intentCases.every((c: any) => c.split === "holdout");
          if (!representative) issues.push("not-independent-representative-evidence");
          if (provenance.sampling === "risk-selected") limitations.push("Risk-selected cases do not estimate population prevalence without sampling weights.");
        }
      } catch { issues.push("invalid-evaluation-evidence"); }
    }
    if (value.model.immutableRevision === null) limitations.push("The provider model revision is unknown or mutable; its behavior is not pinned by the model name.");
    if (current) {
      applicable = current.targetRevision === value.targetRevision && evidenceDigest(current.model) === evidenceDigest(value.model)
        && COMPONENTS.every((name) => current.components[name]?.digest === value.components[name]?.digest);
      if (!applicable) issues.push("release-changed");
    } else { issues.push("current-release-not-checked"); limitations.push("No current deployment supplied; applicability to a running release has not been checked."); }
    return { digest: value.digest, integrity, evidencePassed, representative, applicable, readyForApproval: integrity && evidencePassed && representative && applicable && !issues.length, approval: "not-recorded", issues, limitations };
  }

  private publish(path: string, bytes: Buffer): void {
    if (existsSync(path)) {
      if (!regularBytes(path).equals(bytes)) failure("immutable_conflict");
      return;
    }
    const temporary = join(dirname(path), "." + randomUUID());
    const fd = openSync(temporary, "wx", 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    try {
      try { linkSync(temporary, path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !regularBytes(path).equals(bytes)) throw error; }
      unlinkSync(temporary);
      const directory = openSync(dirname(path), constants.O_RDONLY);
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } catch (error) { if (existsSync(temporary)) unlinkSync(temporary); throw error; }
  }
}

import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { evidenceDigest } from "./qualification.js";

interface Envelope<T> { format: "ai-audit-casework-state"; version: 1; revision: number; data: T; digest: string }

export class CaseworkStorage<T> {
  readonly directory: string;
  private readonly state: string;
  private readonly lock: string;
  private readonly recovery: string;
  constructor(directory: string, private readonly initial: () => T, private readonly validate: (value: unknown) => value is T) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = realpathSync(directory);
    this.state = join(this.directory, "state.json");
    this.lock = join(this.directory, "state.lock");
    this.recovery = join(this.directory, "recovery.lock");
  }

  read(): T {
    if (!existsSync(this.state)) return structuredClone(this.initial());
    const fd = openSync(this.state, constants.O_RDONLY | constants.O_NOFOLLOW);
    let value: Envelope<T>;
    try { value = JSON.parse(readFileSync(fd, "utf8")); } finally { closeSync(fd); }
    const { digest, ...payload } = value;
    if (value.format !== "ai-audit-casework-state" || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1
      || !this.validate(value.data) || evidenceDigest(payload) !== digest) throw new Error("audit_casework_state_invalid");
    return structuredClone(value.data);
  }

  transact<R>(change: (state: T) => R): R {
    if (existsSync(this.recovery)) throw new Error("audit_casework_recovery_in_progress");
    const lockFd = openSync(this.lock, "wx", 0o600);
    let temporary: string | undefined;
    try {
      if (existsSync(this.recovery)) throw new Error("audit_casework_recovery_in_progress");
      writeFileSync(lockFd, JSON.stringify({ pid: process.pid, host: hostname() })); fsyncSync(lockFd);
      const data = this.read(), result = change(data);
      if (result && typeof (result as any).then === "function") throw new Error("audit_casework_async_transaction");
      if (!this.validate(data)) throw new Error("audit_casework_state_invalid");
      let revision = 1;
      if (existsSync(this.state)) revision = JSON.parse(readFileSync(this.state, "utf8")).revision + 1;
      if (!Number.isSafeInteger(revision)) throw new Error("audit_casework_revision_exhausted");
      const payload = { format: "ai-audit-casework-state" as const, version: 1 as const, revision, data };
      const envelope: Envelope<T> = { ...payload, digest: evidenceDigest(payload) };
      temporary = join(this.directory, ".state-" + randomUUID());
      const fd = openSync(temporary, "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify(envelope) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, this.state); temporary = undefined;
      const directoryFd = openSync(this.directory, constants.O_RDONLY);
      try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
      return structuredClone(result);
    } finally {
      closeSync(lockFd);
      if (temporary && existsSync(temporary)) unlinkSync(temporary);
      unlinkSync(this.lock);
    }
  }

  recoverDeadLock(): void {
    const recoveryFd = openSync(this.recovery, "wx", 0o600);
    try {
      if (!existsSync(this.lock)) return;
      if (!lstatSync(this.lock).isFile()) throw new Error("audit_casework_lock_invalid");
      const fd = openSync(this.lock, constants.O_RDONLY | constants.O_NOFOLLOW);
      let lock;
      try { lock = JSON.parse(readFileSync(fd, "utf8")); } finally { closeSync(fd); }
      if (lock.host !== hostname() || !Number.isSafeInteger(lock.pid) || lock.pid <= 0) throw new Error("audit_casework_lock_invalid");
      try { process.kill(lock.pid, 0); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") { unlinkSync(this.lock); return; }
        throw error;
      }
      throw new Error("audit_casework_lock_live");
    } finally {
      closeSync(recoveryFd); unlinkSync(this.recovery);
    }
  }
}

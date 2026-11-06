import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, fsyncSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPiiToken, type PiiEntry } from "./pii.js";

export interface PiiVaultOptions { directory: string; key: Buffer; ttlSeconds?: number }
interface Envelope { version: 1; scope: string; expiresAt: number; iv: string; tag: string; ciphertext: string }
export class PiiVaultError extends Error {
  constructor(readonly status: number = 503, code = "audit_pii_vault_unavailable") { super(code); }
}
const unavailable = () => new PiiVaultError();
const rejected = () => new PiiVaultError(422, "audit_pii_token_invalid");
const aad = (token: string, e: Pick<Envelope, "scope" | "expiresAt">) => Buffer.from(JSON.stringify([1, token, e.scope, e.expiresAt]));
const hex = (v: unknown, bytes: number) => typeof v === "string" && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(v);

export class PiiVault {
  private key: Buffer;
  readonly ttlSeconds: number;
  constructor(private options: PiiVaultOptions, private now = Date.now) {
    if (!options || typeof options.directory !== "string" || !options.directory || !Buffer.isBuffer(options.key) || options.key.length !== 32
      || !Number.isSafeInteger(options.ttlSeconds ?? 86400) || (options.ttlSeconds ?? 86400) < 1 || (options.ttlSeconds ?? 86400) > 30 * 86400) throw new Error("audit_pii_vault_config_invalid");
    this.options = { directory: options.directory, key: Buffer.alloc(0), ttlSeconds: options.ttlSeconds };
    this.key = Buffer.from(options.key); this.ttlSeconds = options.ttlSeconds ?? 86400;
    this.directory();
  }
  private directory() {
    try {
      mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
      const st = lstatSync(this.options.directory);
      if (!st.isDirectory() || (st.mode & 0o077) !== 0) throw unavailable();
    } catch { throw unavailable(); }
  }
  scope(clientHash: string, conversation: string): string {
    if (!/^[a-f0-9]{64}$/.test(clientHash) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(conversation)) throw new PiiVaultError(400, "audit_pii_scope_required");
    return createHmac("sha256", this.key).update(JSON.stringify(["auditline-pii-scope-v1", clientHash, conversation])).digest("hex");
  }
  private file(token: string) {
    if (!isPiiToken(token)) throw rejected();
    return join(this.options.directory, token.slice(1, -1).replaceAll(":", "-") + ".pii");
  }
  private read(token: string): Envelope {
    const fd = openSync(this.file(token), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = fstatSync(fd);
      if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) !== 0 || st.size > 128 * 1024) throw unavailable();
      const e = JSON.parse(readFileSync(fd, "utf8"));
      if (e?.version !== 1 || !hex(e.scope, 32) || !Number.isSafeInteger(e.expiresAt) || !hex(e.iv, 12) || !hex(e.tag, 16)
        || typeof e.ciphertext !== "string" || !/^(?:[a-f0-9]{2})+$/.test(e.ciphertext)) throw unavailable();
      return e;
    } finally { closeSync(fd); }
  }
  private decrypt(token: string, e: Envelope): PiiEntry {
    const dec = createDecipheriv("aes-256-gcm", this.key, Buffer.from(e.iv, "hex"));
    dec.setAAD(aad(token, e)); dec.setAuthTag(Buffer.from(e.tag, "hex"));
    const entry = JSON.parse(Buffer.concat([dec.update(Buffer.from(e.ciphertext, "hex")), dec.final()]).toString("utf8"));
    if (entry?.token !== token || entry.rule !== `pii-${token.split(":")[1]}` || typeof entry.value !== "string" || !entry.value.length) throw unavailable();
    return entry;
  }
  put(scope: string, entries: readonly PiiEntry[]) {
    this.directory();
    if (!hex(scope, 32) || entries.length > 10_000) throw unavailable();
    for (const entry of entries) {
      const file = this.file(entry.token), temporary = join(this.options.directory, `.${randomUUID()}.tmp`);
      try {
        const iv = randomBytes(12), expiresAt = this.now() + this.ttlSeconds * 1000;
        const e: Envelope = { version: 1, scope, expiresAt, iv: iv.toString("hex"), tag: "", ciphertext: "" };
        const cipher = createCipheriv("aes-256-gcm", this.key, iv); cipher.setAAD(aad(entry.token, e));
        const plain = Buffer.from(JSON.stringify(entry));
        if (plain.length > 60 * 1024) throw unavailable();
        e.ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]).toString("hex"); e.tag = cipher.getAuthTag().toString("hex");
        const fd = openSync(temporary, "wx", 0o600);
        try { writeFileSync(fd, JSON.stringify(e)); fsyncSync(fd); } finally { closeSync(fd); }
        linkSync(temporary, file); unlinkSync(temporary);
        const dir = openSync(this.options.directory, "r");
        try { fsyncSync(dir); } finally { closeSync(dir); }
      } catch { throw unavailable(); }
      finally { try { unlinkSync(temporary); } catch {} }
    }
  }
  get(scope: string, token: string): PiiEntry {
    try {
      this.directory();
      const e = this.read(token);
      if (e.scope !== scope || this.now() >= e.expiresAt) throw rejected();
      return this.decrypt(token, e);
    } catch (e) {
      if (e instanceof PiiVaultError) throw e;
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw rejected();
      throw unavailable();
    }
  }
  prune(): number {
    this.directory();
    let removed = 0;
    try {
      for (const name of readdirSync(this.options.directory)) {
        if (!/^PII-(email|phone|pesel|iban)-[a-p]{48}\.pii$/.test(name)) continue;
        const token = `[${name.slice(0, -4).replaceAll("-", ":")}]`, e = this.read(token);
        this.decrypt(token, e);
        if (this.now() >= e.expiresAt) { unlinkSync(this.file(token)); removed++; }
      }
      return removed;
    } catch { throw unavailable(); }
  }
}

export function piiVaultOptions(config: unknown, key: string | undefined): PiiVaultOptions | undefined {
  if (config === undefined && key === undefined) return undefined;
  if (!config || typeof config !== "object" || Array.isArray(config) || Object.keys(config).some((k) => !["directory", "ttlSeconds"].includes(k)) || !hex(key, 32)) throw new Error("audit_pii_vault_config_invalid");
  const c = config as { directory: string; ttlSeconds?: number };
  return { directory: c.directory, ttlSeconds: c.ttlSeconds, key: Buffer.from(key!, "hex") };
}

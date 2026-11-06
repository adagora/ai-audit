import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPii, piiTokens, redactPiiLog } from "../src/pii.js";
import { PiiVault, PiiVaultError, piiVaultOptions } from "../src/piiVault.js";
import { inspect, scanText } from "../src/scan.js";
import { randomUUID } from "node:crypto";
import { createInspectionPool } from "../src/inspectPool.js";
import { createInspectionProfile } from "../src/profile.js";

const key = Buffer.alloc(32, 17), client = "a".repeat(64), conversation = randomUUID();
const fixture = (ttlSeconds = 60, now = Date.now) => {
  const directory = join(mkdtempSync(join(tmpdir(), "pii-test-")), "vault");
  const vault = new PiiVault({ directory, key, ttlSeconds }, now);
  return { directory, vault, scope: vault.scope(client, conversation) };
};

test("PII tokens preserve distinct identities, repeated values, nested JSON and split text; secrets stay irreversible", () => {
  const secret = "ghp_" + "A".repeat(36);
  const source = { messages: [{ role: "user", content: [{ text: "ada@" }, { text: "example.com and ada@example.com; bob@example.net" }] },
    { role: "tool", content: JSON.stringify({ email: "ada@example.com", key: secret, password: "secret123456" }) }] };
  const result = inspectPii(source), serialized = JSON.stringify(result.value);
  assert.equal(result.pii.length, 2);
  assert.ok(!serialized.includes("ada@") && !serialized.includes("bob@") && !serialized.includes(secret) && !serialized.includes("secret123456"));
  assert.match(serialized, /REDACTED:github-pat/);
  const content = (result.value as any).messages[0].content.map((p: any) => p.text).join("");
  const tokens = content.match(/\[PII:[^\]]+\]/g)!;
  assert.equal(tokens.length, 3); assert.equal(tokens[0], tokens[1]); assert.notEqual(tokens[0], tokens[2]);
  assert.equal(scanText(serialized).length, 0);
  assert.equal(inspect(result.value).findings.length, 0);
  assert.equal(result.pii.some((e) => e.value.includes(secret)), false);
});

test("vault encrypts values at rest, survives restart and binds key, scope, token and expiry", () => {
  let now = 1000;
  const { vault, scope, directory } = fixture(2, () => now), entry = inspectPii("ada@example.com").pii[0];
  vault.put(scope, [entry]);
  const file = join(directory, readdirSync(directory)[0]), bytes = readFileSync(file, "utf8");
  assert.ok(!bytes.includes(entry.value) && !bytes.includes(entry.token));
  assert.equal(statSync(directory).mode & 0o777, 0o700); assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(new PiiVault({ directory, key }, () => now).get(scope, entry.token).value, entry.value);
  for (const wrong of [vault.scope("b".repeat(64), conversation), vault.scope(client, randomUUID())]) {
    assert.throws(() => vault.get(wrong, entry.token), (e: unknown) => e instanceof PiiVaultError && e.status === 422);
  }
  assert.throws(() => vault.put(scope, [entry]), /audit_pii_vault_unavailable/);
  now = 3000; assert.throws(() => vault.get(scope, entry.token), /audit_pii_token_invalid/);
  assert.equal(vault.prune(), 1); assert.deepEqual(readdirSync(directory), []);
});

test("tampering is authenticated; invalid config, symlinks and permissive storage fail closed", () => {
  const { vault, scope, directory } = fixture(), entry = inspectPii("ada@example.com").pii[0]; vault.put(scope, [entry]);
  const file = join(directory, readdirSync(directory)[0]), original = readFileSync(file, "utf8"), e = JSON.parse(original);
  for (const change of [{ expiresAt: e.expiresAt + 1 }, { ciphertext: (e.ciphertext[0] === "a" ? "b" : "a") + e.ciphertext.slice(1) }, { tag: "00".repeat(16) }]) {
    writeFileSync(file, JSON.stringify({ ...e, ...change }));
    assert.throws(() => vault.get(scope, entry.token), /audit_pii_vault_unavailable/);
  }
  writeFileSync(file, original);
  chmodSync(directory, 0o755); assert.throws(() => vault.get(scope, entry.token), /audit_pii_vault_unavailable/); chmodSync(directory, 0o700);
  const other = inspectPii("bob@example.com").pii[0], link = join(directory, other.token.slice(1, -1).replaceAll(":", "-") + ".pii");
  symlinkSync(file, link); assert.throws(() => vault.get(scope, other.token), /audit_pii_vault_unavailable/);
  assert.throws(() => new PiiVault({ directory, key: Buffer.alloc(31) }), /config_invalid/);
  assert.throws(() => new PiiVault({ directory, key, ttlSeconds: Infinity }), /config_invalid/);
  assert.throws(() => piiVaultOptions({ directory, key: "never-configure-key-here" }, "11".repeat(32)), /config_invalid/);
  assert.throws(() => piiVaultOptions({ directory }, undefined), /config_invalid/);
  assert.throws(() => vault.scope(client, "ada@example.com"), /scope_required/);
});

test("worker tokenization matches direct inspection and profile distinguishes irreversible mode", async () => {
  const pool = createInspectionPool({ allowHashes: [], timeoutMs: 5000, size: 1, tokenizePii: true });
  try {
    const result = await pool.run({ input: "ada@example.com" });
    assert.equal(result.pii?.[0].value, "ada@example.com"); assert.equal(piiTokens(JSON.stringify(result.value)).length, 1);
  } finally { pool.close(); }
  assert.notEqual(createInspectionProfile({ mode: "redact" }).id, createInspectionProfile({ mode: "redact", piiVault: {} }).id);
});


test("audit metadata and opaque token references are masked, including ambiguous nested strings", () => {
  const token = inspectPii("ada@example.com").pii[0].token;
  const result = redactPiiLog({ model: "ada@example.com", client: "Contact ada@example.com", token, metadata: '{"a":1,"a":"ada@example.com"}' });
  const raw = JSON.stringify(result);
  assert.ok(!raw.includes("ada@example.com") && !raw.includes(token));
  assert.match(raw, /REDACTED:pii-token/); assert.match(raw, /unredactable-content/);
});


test("a credential-shaped PII value remains irreversible even when PII and secret matches overlap", () => {
  for (const text of ["password=ada@example.com", "postgres://ada@example.com:secret123@db.example/app", 'password="ada@example.com"']) {
    const result = inspectPii(text);
    assert.equal(result.pii.length, 0, text);
    assert.ok(!String(result.value).includes("ada@example.com"), text);
    assert.match(String(result.value), /REDACTED:/);
  }
});


test("every supported PII kind round-trips through authenticated storage with exact original formatting", () => {
  const { vault, scope } = fixture();
  for (const [kind, value] of [["email", "Ada@example.com"], ["phone", "+48 601 234 567"], ["pesel", "44051401359"], ["iban", "PL61 1090 1014 0000 0712 1981 2874"]]) {
    const inspected = inspectPii(value), entry = inspected.pii[0];
    assert.equal(entry.rule, `pii-${kind}`); assert.notEqual(inspectPii(value).pii[0].token, entry.token);
    vault.put(scope, [entry]); assert.equal(vault.get(scope, String(inspected.value)).value, value);
  }
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createInspectionProfile } from "../src/profile.js";
import { RULES, RULES_DIGEST, SCANNER_VERSION } from "../src/scan.js";
import { sha256 } from "../src/audit.js";
import { AWS, mockUpstream, startProxy } from "./helpers.js";

test("profile identity is deterministic, immutable and sensitive to effective policy", () => {
  const a = sha256("synthetic-one"), b = sha256("synthetic-two");
  const carnet = new Set([b, a]);
  const first = createInspectionProfile({ mode: "redact", carnet });
  assert.deepEqual(first.receipt, createInspectionProfile({ mode: "redact", carnet: new Set([a.toUpperCase(), b]) }).receipt);
  assert.equal(first.receipt.scannerVersion, SCANNER_VERSION);
  assert.equal(first.receipt.rulesDigest, RULES_DIGEST);
  for (const value of [first.receipt.rulesDigest, first.receipt.configDigest, first.receipt.digest]) assert.match(value, /^[a-f0-9]{64}$/);
  for (const opts of [{ mode: "no-go" as const, carnet }, { mode: "redact" as const, carnet, pageRedaction: false },
    { mode: "redact" as const, carnet, scope: "history" as const }, { mode: "redact" as const }])
    assert.notEqual(first.receipt.digest, createInspectionProfile(opts).receipt.digest);
  carnet.clear();
  assert.ok(first.carnet.has(a));
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.receipt) && Object.isFrozen(RULES));
  assert.ok(!JSON.stringify(first.receipt).includes(a));
  assert.throws(() => createInspectionProfile({ mode: "redact", carnet: new Set(["bad-hash"]) }), /audit_invalid_allowlist/);
});

test("profile CLI reports the identity used for requests", () => {
  const cli = new URL("../src/cli.js", import.meta.url);
  const result = JSON.parse(execFileSync(process.execPath, [cli.pathname, "profile", "--mode", "no-go", "--no-page-redaction"]).toString());
  assert.deepEqual(result, createInspectionProfile({ mode: "no-go", pageRedaction: false }).receipt);
});

const up = await mockUpstream();
const proxies: Awaited<ReturnType<typeof startProxy>>[] = [];
after(() => { up.close(); proxies.forEach((p) => p.close()); });
const post = (url: string, content: unknown) => fetch(url + "/v1/chat/completions", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "mock-1", messages: [{ role: "user", content }] }),
});

test("clean, redacted, blocked, advisory and rejected decisions all carry the effective profile", async () => {
  for (const mode of ["redact", "no-go", "advisory"] as const) {
    const p = await startProxy(up.url, mode); proxies.push(p);
    for (const content of ["ordinary request", `key ${AWS}`, [{ type: "image_url", image_url: { url: "https://example.invalid/a.png" } }]]) {
      const response = await post(p.url, content); await response.text();
      const rec = p.log.read().at(-1)!;
      assert.deepEqual(rec.inspectionProfile, createInspectionProfile({ mode }).receipt);
      if (response.status === 422) { assert.equal((rec.decision as any).action, "reject"); assert.equal(rec.upstreamStatus, null); }
    }
    assert.ok(p.log.verifyChain().ok);
  }
});

test("mutating caller options or allowlist cannot desynchronize decision evidence", async () => {
  const carnet = new Set([sha256(AWS)]);
  const options = { mode: "redact" as const, carnet, pageRedaction: false };
  const p = await startProxy(up.url, options.mode, options); proxies.push(p);
  carnet.clear(); options.pageRedaction = true;
  const response = await post(p.url, `allowed ${AWS}`); await response.text();
  assert.equal(up.seen.at(-1)!.body.toString().includes(AWS), true);
  const rec = p.log.read().at(-1)!;
  assert.equal((rec.decision as any).action, "forward-original");
  assert.deepEqual(rec.inspectionProfile, createInspectionProfile({ mode: "redact", carnet: new Set([sha256(AWS)]), pageRedaction: false }).receipt);
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mockUpstream, startProxy } from "./helpers.js";
import { work, SANDBOX_AVAILABLE } from "../src/attachments.js";
import { metrics } from "../src/proxy.js";

const NEEDS_BWRAP = SANDBOX_AVAILABLE || process.env.CI ? {} : { skip: "bwrap cannot create namespaces here; CI runs this" };
const up = await mockUpstream();
const imageRequest = { model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "text", text: "what is this" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }] }] };
const post = (url: string, body: object) => fetch(`${url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const privateDir = mkdtempSync(join(process.cwd(), ".sandbox-test-"));
after(() => { up.close(); rmSync(privateDir, { recursive: true, force: true }); });

test("without a usable sandbox an attachment is refused with 422 audit_sandbox_unavailable and never forwarded", async () => {
  const p = await startProxy(up.url, "redact", { sandboxAvailable: false });
  const before = up.seen.length, counted = metrics.sandboxUnavailable.get();
  const r = await post(p.url, imageRequest);
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.code, "audit_sandbox_unavailable");
  assert.equal(up.seen.length, before);
  assert.equal(metrics.sandboxUnavailable.get(), counted + 1);
  const rec = p.log.read().at(-1) as any;
  assert.equal(rec.error, "audit_sandbox_unavailable");
  assert.equal(rec.decision.sandbox, "unavailable");
  assert.equal((await fetch(`${p.url}/readyz`)).status, 503);
  const text = await post(p.url, { model: "gpt-4o-mini", messages: [{ role: "user", content: "no attachment" }] });
  assert.equal(text.status, 200);
  p.close();
});

test("--unsafe-no-sandbox runs attachments unsandboxed, records it per request and raises the gauge", async () => {
  const p = await startProxy(up.url, "redact", { sandboxAvailable: false, unsafeNoSandbox: true });
  const r = await post(p.url, imageRequest);
  assert.notEqual((await r.json().catch(() => ({})))?.error?.code, "audit_sandbox_unavailable");
  const rec = p.log.read().at(-1) as any;
  assert.equal(rec.decision.sandbox, "disabled");
  assert.match(metrics.sandboxDisabled.expose().join("\n"), /^ai_audit_sandbox_disabled 1$/m);
  p.close();
});

test("the worker environment never contains upstream keys, sandboxed or not", NEEDS_BWRAP, async () => {
  process.env.AI_AUDIT_UPSTREAM_OPENAI_KEY = "sk-test-upstream-must-not-reach-worker";
  try {
    for (const sandbox of ["bwrap", "disabled"] as const) {
      const r = await work({ op: "check", paths: [] }, 10_000, sandbox);
      assert.equal(r.ok, true, sandbox);
      assert.ok(r.env.every((k: string) => !k.startsWith("AI_AUDIT")), `${sandbox}: ${r.env}`);
    }
  } finally { delete process.env.AI_AUDIT_UPSTREAM_OPENAI_KEY; }
});

test("a sandboxed worker cannot read the audit log, config, session key or repository", NEEDS_BWRAP, async () => {
  const files = ["audit.jsonl", "audit.jsonl.session-key", "config.json"].map((f) => join(privateDir, f));
  files.forEach((f) => writeFileSync(f, "private"));
  const paths = [...files, join(process.cwd(), "package.json")];
  const unsandboxed = await work({ op: "check", paths }, 10_000, "disabled");
  assert.deepEqual(unsandboxed.readable, [true, true, true, true]);
  const sandboxed = await work({ op: "check", paths: [...paths, "/usr/bin/python3"] }, 10_000, "bwrap");
  assert.deepEqual(sandboxed.readable, [false, false, false, false, true]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { withAuditlineNames } from "../src/environment.js";

test("an AUDITLINE_ variable fills the legacy name and wins when both are set", () => {
  const env = { AUDITLINE_CLIENT_KEY: "new", AI_AUDIT_CLIENT_KEY: "old", AUDITLINE_ADMIN_KEY: "admin", AI_AUDIT_UPSTREAM_OPENAI_KEY: "upstream", PATH: "/bin" };
  const merged = withAuditlineNames(env);
  assert.equal(merged.AI_AUDIT_CLIENT_KEY, "new");
  assert.equal(merged.AI_AUDIT_ADMIN_KEY, "admin");
  assert.equal(merged.AI_AUDIT_UPSTREAM_OPENAI_KEY, "upstream");
  assert.equal(merged.PATH, "/bin");
});

test("the environment it was given is left alone and a plain legacy setup is unchanged", () => {
  const env = { AUDITLINE_PORT: "9000", AI_AUDIT_UNSAFE_NO_SANDBOX: "1" };
  const merged = withAuditlineNames(env);
  assert.deepEqual(env, { AUDITLINE_PORT: "9000", AI_AUDIT_UNSAFE_NO_SANDBOX: "1" });
  assert.equal(merged.AI_AUDIT_PORT, "9000");
  assert.deepEqual(withAuditlineNames({ AI_AUDIT_CLIENT_KEY: "k" }), { AI_AUDIT_CLIENT_KEY: "k" });
});

test("a name that only looks similar is not renamed", () => {
  const merged = withAuditlineNames({ AUDITLINEX_KEY: "x", XAUDITLINE_KEY: "y", AUDITLINE: "z" });
  assert.equal(Object.keys(merged).some((name) => name.startsWith("AI_AUDIT_")), false);
});

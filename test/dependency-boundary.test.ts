import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("no dependency section or lock entry retains the removed SDK", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  for (const section of ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies", "peerDependenciesMeta"]) {
    assert.ok(!Object.keys(manifest[section] ?? {}).some((name) => name.includes("quinelings")), section);
  }
  assert.ok(!Object.keys(lock.packages).some((name) => name.includes("quinelings")));
  assert.equal(existsSync("vendor/quinelings-agent-sdk-1.0.0.tgz"), false);
  assert.equal(existsSync("vendor/quinelings-qdl-v1-library.js"), false);
});

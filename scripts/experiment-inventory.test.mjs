import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { experimentInventory } from "./experiment-inventory.mjs";

test("inventory preserves corrupt and interrupted evidence and excludes linked content", () => {
  const root = mkdtempSync(join(tmpdir(), "experiment-inventory-"));
  try {
    const ids = Array.from({ length: 4 }, (_, i) => `${i}`.repeat(36));
    for (const id of ids) mkdirSync(join(root, id));
    writeFileSync(join(root, ids[0], "manifest.json"), JSON.stringify({ id: ids[0], status: "running", provider: "live" }));
    writeFileSync(join(root, ids[1], "manifest.json"), "{");
    writeFileSync(join(root, ids[2], "manifest.json"), JSON.stringify({ id: ids[2], status: "passed", finishedAt: new Date().toISOString(), provider: "fake" }));
    writeFileSync(join(root, ids[3], "manifest.json"), JSON.stringify({ id: ids[3], status: "passed" }));
    symlinkSync(root, join(root, ids[0], "cycle"));
    const rows = experimentInventory(root);
    const row = (id) => rows.find((r) => r.id === id);
    assert.equal(rows.length, 4);
    assert.equal(row(ids[0]).inventory.lifecycle, "interrupted");
    assert.equal(row(ids[0]).inventory.symbolicLinks, 1);
    assert.match(row(ids[0]).inventory.sensitivity, /restricted/);
    assert.equal(row(ids[1]).status, "invalid");
    assert.equal(row(ids[2]).inventory.completedEvidence, true);
    assert.equal(row(ids[3]).inventory.completedEvidence, false);
    assert.ok(row(ids[2]).inventory.bytes > 0);
    assert.equal(experimentInventory(root, ids[0]).find((r) => r.id === ids[0]).inventory.lifecycle, "running");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

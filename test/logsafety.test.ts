import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog } from "../src/audit.js";

const self = fileURLToPath(import.meta.url);
if (process.argv[2] === "append-child") {
  const log = new AuditLog(process.argv[3]);
  for (let i = 0; i < Number(process.argv[4]); i++) log.append({ kind: "llm-call", id: `${process.pid}-${i}`, ts: "t" } as any);
  process.exit(0);
} else {

test("appends from several processes keep one intact chain", async () => {
  const p = join(mkdtempSync(join(tmpdir(), "audit-mp-")), "log.jsonl"), N = 200, W = 3;
  await Promise.all(Array.from({ length: W }, () => new Promise((r, j) =>
    fork(self, ["append-child", p, String(N)]).on("exit", (c) => (c === 0 ? r(c) : j(new Error(`child exit ${c}`)))))));
  const log = new AuditLog(p);
  assert.equal(log.read().length, N * W);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

}

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mockUpstream, startProxy, ATTACHMENT_TOOLS } from "./helpers.js";
import { work, SANDBOX_AVAILABLE, WORKER_LIMITS, WORKER_OUTPUT_LIMIT, WORKER_WALL_CLOCK_MS, TOOL_ADDRESS_SPACE_LIMIT } from "../src/attachments.js";

const NEEDS_BWRAP = SANDBOX_AVAILABLE || process.env.CI ? {} : { skip: "bwrap cannot create namespaces here; CI runs this" };
const ROWS = { as: "Max address space", data: "Max data size", cpu: "Max cpu time", fsize: "Max file size", nofile: "Max open files" } as const;
const limitsOf = (table: string) => Object.fromEntries(Object.entries(ROWS).map(([key, label]) => {
  const cells = table.split("\n").find((l) => l.startsWith(label))!.slice(label.length).trim().split(/\s+/);
  return [key, [Number(cells[0]), Number(cells[1])]];
}));
const UNLIMITED = Number.NaN;
const both = (v: number) => [v, v];
const workerExpected = { as: [UNLIMITED, UNLIMITED], data: both(WORKER_LIMITS.data), cpu: both(90), fsize: both(67108864), nofile: both(128) };
const toolExpected = { ...workerExpected, as: both(1610612736) };
const up = await mockUpstream();
after(() => up.close());

test("worker: DATA 4 GiB (ADR 0003), CPU 90 s, FSIZE 64 MiB, NOFILE 128; tools: AS 1.5 GiB; 120 s wall clock; 16 MiB output", () => {
  assert.deepEqual(WORKER_LIMITS, { data: 4294967296, cpu: 90, fsize: 67108864, nofile: 128 });
  assert.equal(TOOL_ADDRESS_SPACE_LIMIT, 1610612736);
  assert.equal(WORKER_WALL_CLOCK_MS, 120_000);
  assert.equal(WORKER_OUTPUT_LIMIT, 16777216);
});

for (const sandbox of ["bwrap", "disabled"] as const)
  test(`${sandbox}: soft and hard limits are set on the worker, inherited by native tools, which also get the address-space cap`, sandbox === "bwrap" ? NEEDS_BWRAP : {}, async () => {
    const r = await work({ op: "check" }, undefined, sandbox);
    assert.equal(r.ok, true);
    assert.deepEqual(limitsOf(r.workerLimits), workerExpected);
    assert.deepEqual(limitsOf(r.toolLimits), toolExpected);
  });

test("the worker exits without output when its limits were not applied", () => {
  const worker = fileURLToPath(new URL("../src/worker.js", import.meta.url));
  const r = spawnSync(process.execPath, [worker], { input: JSON.stringify({ op: "check", limits: WORKER_LIMITS, toolAddressSpace: TOOL_ADDRESS_SPACE_LIMIT }), encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
});

test("native tool output above 16 MiB fails the tool; exactly 16 MiB passes", async () => {
  assert.equal((await work({ op: "check", toolOutputBytes: WORKER_OUTPUT_LIMIT }, undefined, "disabled")).toolOutput, WORKER_OUTPUT_LIMIT);
  assert.equal((await work({ op: "check", toolOutputBytes: WORKER_OUTPUT_LIMIT + 1 }, undefined, "disabled")).toolOutput, "output_limit");
});

test("worker stdout above the cap kills the worker and fails", async () => {
  assert.deepEqual(await work({ op: "check", stdoutBytes: WORKER_OUTPUT_LIMIT + 1 }, undefined, "disabled"), { ok: false, error: "worker_output_limit" });
});

test("the wall clock kills a worker that runs too long", async () => {
  assert.deepEqual(await work({ op: "check" }, 1, "disabled"), { ok: false, error: "attachment_timeout" });
});

test("an attachment whose worker output exceeds the cap is refused with 422 and never forwarded", ATTACHMENT_TOOLS, async () => {
  const p = await startProxy(up.url, "redact", { workerOutputLimit: 64 });
  const before = up.seen.length;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await fetch(`${p.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }] }] }) });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.code, "audit_inspection_failed");
  assert.equal(up.seen.length, before);
  p.close();
});

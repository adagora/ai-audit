import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mockUpstream, startProxy, ATTACHMENT_TOOLS, NEEDS_BWRAP, NEEDS_PRLIMIT, SANDBOXED_ATTACHMENTS } from "./helpers.js";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { work, readJobFiles, WORKER_LIMITS, WORKER_OUTPUT_LIMIT, WORKER_WALL_CLOCK_MS, TOOL_ADDRESS_SPACE_LIMIT } from "../src/attachments.js";

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
  test(`${sandbox}: soft and hard limits are set on the worker, inherited by native tools, which also get the address-space cap`, sandbox === "bwrap" ? NEEDS_BWRAP : NEEDS_PRLIMIT, async () => {
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

test("native tool output above 16 MiB fails the tool; exactly 16 MiB passes", NEEDS_PRLIMIT, async () => {
  assert.equal((await work({ op: "check", toolOutputBytes: WORKER_OUTPUT_LIMIT }, undefined, "disabled")).toolOutput, WORKER_OUTPUT_LIMIT);
  assert.equal((await work({ op: "check", toolOutputBytes: WORKER_OUTPUT_LIMIT + 1 }, undefined, "disabled")).toolOutput, "output_limit");
});

test("worker stdout above the cap kills the worker and fails", NEEDS_PRLIMIT, async () => {
  assert.deepEqual(await work({ op: "check", stdoutBytes: WORKER_OUTPUT_LIMIT + 1 }, undefined, "disabled"), { ok: false, error: "worker_output_limit" });
});

test("the wall clock kills a worker that runs too long", NEEDS_PRLIMIT, async () => {
  assert.deepEqual(await work({ op: "check" }, 1, "disabled"), { ok: false, error: "attachment_timeout" });
});

test("an attachment whose worker output exceeds the cap is refused with 422 and never forwarded", SANDBOXED_ATTACHMENTS, async () => {
  const p = await startProxy(up.url, "redact", { workerOutputLimit: 64 });
  try {
    const before = up.seen.length;
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const r = await fetch(`${p.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }] }] }) });
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error.code, "audit_inspection_failed");
    assert.equal(up.seen.length, before);
  } finally { p.close(); }
});

const noisePdf = () => spawnSync("python3", ["-c", `import sys,io,os
from PIL import Image
pages=[Image.frombytes("RGB",(935,1210),os.urandom(935*1210*3)) for _ in range(7)]
b=io.BytesIO(); pages[0].save(b,format="PDF",resolution=110,save_all=True,append_images=pages[1:]); sys.stdout.buffer.write(b.getvalue())`], { maxBuffer: 256 * 1024 * 1024 }).stdout;

for (const sandbox of ["bwrap", "disabled"] as const)
  test(`${sandbox}: rendered pages beyond the 16 MiB stdout cap come back as job files, not stdout`, sandbox === "bwrap" ? SANDBOXED_ATTACHMENTS : ATTACHMENT_TOOLS, async () => {
    const r = await work({ op: "extract", mime: "application/pdf", raster: true }, undefined, sandbox, undefined, [{ name: "in", data: noisePdf() }]);
    assert.equal(r.ok, true);
    const pngs = (r.units as any[]).filter((u) => u.png).map((u) => Buffer.from(u.png, "base64"));
    assert.equal(pngs.length, 7);
    assert.ok(pngs.reduce((n, b) => n + b.length, 0) > WORKER_OUTPUT_LIMIT);
    assert.ok(pngs.every((b) => b.subarray(1, 4).toString() === "PNG"));
  });

test("job files: only expected names, no traversal, no symlinks, byte and count limits", () => {
  const dir = mkdtempSync(join(tmpdir(), "jf-"));
  try {
    writeFileSync(join(dir, "pg-1.png"), "abcd"); writeFileSync(join(dir, "out"), "xy"); writeFileSync(join(dir, "in"), "zz");
    symlinkSync("/etc/hostname", join(dir, "pg-2.png"));
    assert.equal(readJobFiles(dir, ["pg-1.png", "out"], new Set())?.get("out")?.toString(), "xy");
    assert.equal(readJobFiles(dir, ["in"], new Set(["in"]))?.get("in")?.toString(), "zz");
    for (const bad of [["in"], ["../etc/passwd"], ["/etc/passwd"], ["pg-2.png"], ["pg-9.png"], [7]]) assert.equal(readJobFiles(dir, bad, new Set()), undefined, String(bad));
    assert.equal(readJobFiles(dir, ["pg-1.png", "out"], new Set(), { bytes: 5, files: 10 }), undefined);
    assert.equal(readJobFiles(dir, ["pg-1.png", "out"], new Set(), { bytes: 100, files: 1 }), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the job dir is removed after every run, success or failure", async () => {
  const before = readdirSync(tmpdir()).filter((x) => x.startsWith("ai-audit-job-")).length;
  await work({ op: "check" }, undefined, "disabled");
  await work({ op: "check" }, 1, "disabled");
  await work({ op: "check", stdoutBytes: WORKER_OUTPUT_LIMIT + 1 }, undefined, "disabled");
  assert.equal(readdirSync(tmpdir()).filter((x) => x.startsWith("ai-audit-job-")).length, before);
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, sha256 } from "../dist/src/audit.js";
import { createProxy } from "../dist/src/proxy.js";
const up = process.env.BENCH_UPSTREAM;
const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "bench-")), "audit.jsonl"));
const srv = createProxy({ upstreamOpenai: up, upstreamAnthropic: up, mode: "redact", log, quiet: true, adminKeySha256: sha256("bench-admin") })
  .listen(0, "127.0.0.1", () => process.send({ port: srv.address().port }));
process.on("message", (m) => {
  if (m !== "mem") return;
  global.gc(); global.gc();
  const u = process.memoryUsage();
  process.send({ rss: u.rss, heapUsed: u.heapUsed, heapTotal: u.heapTotal, external: u.external, arrayBuffers: u.arrayBuffers, maxRSS: process.resourceUsage().maxRSS * 1024 });
});

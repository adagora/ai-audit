import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, sha256 } from "../dist/src/audit.js";
import { createProxy } from "../dist/src/proxy.js";
const up = process.env.BENCH_UPSTREAM, logPath = join(mkdtempSync(join(tmpdir(), "bench-ovh-")), "audit.jsonl");
const srv = createProxy({ upstreamOpenai: up, upstreamAnthropic: up, mode: "redact", log: new AuditLog(logPath), quiet: true,
  keys: [{ name: "bench", sha256: sha256("vk-bench-local") }], upstreamKeys: { openai: "sk-mock-not-real", anthropic: "sk-ant-mock-not-real" } });
srv.keepAliveTimeout = 60_000;
srv.listen(0, "127.0.0.1", () => process.send({ port: srv.address().port, logPath }));

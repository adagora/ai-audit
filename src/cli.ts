#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { AuditLog, anchor, report, sha256, stats, verifyAnchors } from "./audit.js";
import { randomBytes } from "node:crypto";
import { SANDBOX, TOOLS_OK } from "./attachments.js";
import { createProxy } from "./proxy.js";
import type { Mode } from "./scan.js";

const [cmd, ...rest] = process.argv.slice(2);
const { values: a } = parseArgs({ args: rest, options: {
  "upstream-openai": { type: "string", default: "https://api.openai.com" }, "upstream-anthropic": { type: "string", default: "https://api.anthropic.com" },
  mode: { type: "string", default: "redact" }, log: { type: "string", default: "./audit.jsonl" }, port: { type: "string", default: "8787" },
  host: { type: "string", default: "127.0.0.1" }, anchors: { type: "string" }, config: { type: "string" }, by: { type: "string", default: "model" }, name: { type: "string", default: "client" }, "no-page-redaction": { type: "boolean", default: false }, "log-content": { type: "boolean", default: false }, "allow-hashes": { type: "string" }, from: { type: "string", default: "1970-01-01" }, to: { type: "string", default: "9999-12-31" },
} });
const log = new AuditLog(a.log!);
if (cmd === "serve") {
  if (!["redact", "no-go", "advisory"].includes(a.mode!)) { console.error("--mode must be redact|no-go|advisory"); process.exit(2); }
  const carnet = a["allow-hashes"] ? new Set<string>(JSON.parse(readFileSync(a["allow-hashes"], "utf8"))) : undefined;
  const env = process.env, cfg = a.config ? JSON.parse(readFileSync(a.config, "utf8")) : {};
  const keys = [...(cfg.keys ?? []), ...(env.AI_AUDIT_CLIENT_KEY ? [{ name: "default", sha256: sha256(env.AI_AUDIT_CLIENT_KEY), logContent: env.AI_AUDIT_CLIENT_LOG_CONTENT === "1" }] : [])];
  createProxy({ upstreamOpenai: a["upstream-openai"]!, upstreamAnthropic: a["upstream-anthropic"]!, mode: a.mode as Mode, log, carnet,
    pageRedaction: !a["no-page-redaction"] && cfg.pageRedaction !== false, keys,
    aliases: cfg.aliases, adminKeySha256: env.AI_AUDIT_ADMIN_KEY ? sha256(env.AI_AUDIT_ADMIN_KEY) : cfg.adminKeySha256,
    upstreamKeys: { openai: env.AI_AUDIT_UPSTREAM_OPENAI_KEY, anthropic: env.AI_AUDIT_UPSTREAM_ANTHROPIC_KEY } })
    .listen(Number(a.port), a.host, () => console.error(JSON.stringify({ event: "listening", url: `http://${a.host}:${a.port}`, mode: a.mode, log: a.log, sandbox: SANDBOX, attachmentTools: TOOLS_OK, virtualKeys: keys.length, contentLoggingKeys: keys.filter((k: any) => k.logContent === true).length, aliases: Object.keys(cfg.aliases ?? {}) })));
} else if (cmd === "keygen") { // prints the key ONCE; only its hash goes into the config
  const key = "aia-" + randomBytes(24).toString("base64url");
  console.log(`key (give to the client, not stored): ${key}\nconfig entry: ${JSON.stringify({ name: a.name, sha256: sha256(key), models: ["*"], logContent: a["log-content"] })}`);
} else if (cmd === "stats") {
  if (!["key", "model", "hour"].includes(a.by!)) { console.error("--by key|model|hour"); process.exit(2); }
  console.table(stats(log, a.by as any, a.from, a.to));
} else if (cmd === "anchor") {
  console.log(JSON.stringify(anchor(log, a.anchors ?? a.log + ".anchors")));
} else if (cmd === "verify" && a.anchors) {
  const v = verifyAnchors(log, a.anchors); console.log(v.ok ? `OK: chain intact, consistent with ${v.anchors} anchors` : `FAIL: ${v.reason}`); process.exit(v.ok ? 0 : 1);
} else if (cmd === "verify") {
  const v = log.verifyChain(); console.log(v.ok ? `OK: ${log.read().length} records, chain intact` : `BROKEN at line ${v.badLine}: ${v.reason}`); process.exit(v.ok ? 0 : 1);
} else if (cmd === "report") console.log(report(log, a.from!, a.to!).md);
else { console.error("usage: ai-audit serve|verify|anchor|report|stats|keygen [--config FILE] [--by key|model|hour] [--name N] [--log-content] [--anchors FILE] [--no-page-redaction] [--log ./audit.jsonl] [--mode redact|no-go|advisory] [--port 8787] [--from ISO --to ISO]"); process.exit(2); }

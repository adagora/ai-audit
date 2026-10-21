#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { AuditLog, anchor, report, sha256, stats, verifyAnchors } from "./audit.js";
import { randomBytes } from "node:crypto";
import { SANDBOX_AVAILABLE, TOOLS_OK, sandboxState } from "./attachments.js";
import { createProxy } from "./proxy.js";
import { listSessions, renderSessionHtml } from "./contextView.js";
import type { Mode } from "./scan.js";
import { scrubHistory } from "./history.js";
import { createInspectionProfile } from "./profile.js";

const [cmd, ...rest] = process.argv.slice(2);
const { values: a } = parseArgs({ args: rest, options: {
  "upstream-openai": { type: "string", default: "https://api.openai.com" }, "upstream-anthropic": { type: "string", default: "https://api.anthropic.com" },
  mode: { type: "string", default: "redact" }, log: { type: "string", default: "./audit.jsonl" }, port: { type: "string", default: "8787" },
  host: { type: "string", default: "127.0.0.1" }, anchors: { type: "string" }, config: { type: "string" }, by: { type: "string", default: "model" }, name: { type: "string", default: "client" }, "no-page-redaction": { type: "boolean", default: false }, "unsafe-no-sandbox": { type: "boolean", default: false }, "log-content": { type: "boolean", default: false }, "allow-hashes": { type: "string" }, from: { type: "string", default: "1970-01-01" }, to: { type: "string", default: "9999-12-31" },
  input: { type: "string" }, session: { type: "string" }, output: { type: "string" }, format: { type: "string" }, "max-record-bytes": { type: "string" },
} });
const log = new AuditLog(a.log!);
if (cmd === "scrub" || cmd === "profile") {
  try {
    let carnet: Set<string> | undefined;
    if (a["allow-hashes"]) {
      let hashes: unknown;
      try { hashes = JSON.parse(readFileSync(a["allow-hashes"], "utf8")); } catch { throw new Error("audit_invalid_allowlist"); }
      if (!Array.isArray(hashes) || hashes.some((h) => typeof h !== "string")) throw new Error("audit_invalid_allowlist");
      carnet = new Set(hashes);
    }
    if (cmd === "scrub") {
      console.log(JSON.stringify(await scrubHistory({ input: a.input!, output: a.output!, format: a.format as "json" | "jsonl" | undefined,
        maxRecordBytes: a["max-record-bytes"] === undefined ? undefined : Number(a["max-record-bytes"]), carnet })));
    } else {
      if (!["redact", "no-go", "advisory"].includes(a.mode!)) throw new Error("audit_invalid_mode");
      const cfg = a.config ? JSON.parse(readFileSync(a.config, "utf8")) : {};
      console.log(JSON.stringify(createInspectionProfile({ mode: a.mode as Mode, carnet,
        pageRedaction: !a["no-page-redaction"] && cfg.pageRedaction !== false }).receipt));
    }
  } catch (cause) {
    const code = cause instanceof Error && /^(?:scrub_[a-z0-9_]+|audit_invalid_allowlist|audit_invalid_mode)$/.test(cause.message)
      ? cause.message : "audit_command_failed";
    console.error(code); process.exitCode = 2;
  }
} else if (cmd === "serve") {
  if (!["redact", "no-go", "advisory"].includes(a.mode!)) { console.error("--mode must be redact|no-go|advisory"); process.exit(2); }
  const carnet = a["allow-hashes"] ? new Set<string>(JSON.parse(readFileSync(a["allow-hashes"], "utf8"))) : undefined;
  const env = process.env, cfg = a.config ? JSON.parse(readFileSync(a.config, "utf8")) : {};
  const unsafeNoSandbox = a["unsafe-no-sandbox"] === true || env.AI_AUDIT_UNSAFE_NO_SANDBOX === "1";
  const keys = [...(cfg.keys ?? []), ...(env.AI_AUDIT_CLIENT_KEY ? [{ name: "default", sha256: sha256(env.AI_AUDIT_CLIENT_KEY), logContent: env.AI_AUDIT_CLIENT_LOG_CONTENT === "1" }] : [])];
  createProxy({ upstreamOpenai: a["upstream-openai"]!, upstreamAnthropic: a["upstream-anthropic"]!, mode: a.mode as Mode, log, carnet,
    pageRedaction: !a["no-page-redaction"] && cfg.pageRedaction !== false, keys,
    aliases: cfg.aliases, adminKeySha256: env.AI_AUDIT_ADMIN_KEY ? sha256(env.AI_AUDIT_ADMIN_KEY) : cfg.adminKeySha256,
    upstreamKeys: { openai: env.AI_AUDIT_UPSTREAM_OPENAI_KEY, anthropic: env.AI_AUDIT_UPSTREAM_ANTHROPIC_KEY }, unsafeNoSandbox })
    .listen(Number(a.port), a.host, () => console.error(JSON.stringify({ event: "listening", url: `http://${a.host}:${a.port}`, mode: a.mode, log: a.log, sandbox: sandboxState(SANDBOX_AVAILABLE, unsafeNoSandbox), attachmentTools: TOOLS_OK, virtualKeys: keys.length, contentLoggingKeys: keys.filter((k: any) => k.logContent === true).length, aliases: Object.keys(cfg.aliases ?? {}) })));
} else if (cmd === "keygen") {
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
} else if (cmd === "context") {
  const records = log.read();
  if (!a.session) console.table(listSessions(records));
  else {
    try {
      const html = renderSessionHtml(records, a.session);
      if (a.output) writeFileSync(a.output, html); else process.stdout.write(html);
    } catch { console.error("audit_unknown_session"); process.exitCode = 2; }
  }
} else if (cmd === "report") console.log(report(log, a.from!, a.to!).md);
else { console.error("usage: ai-audit serve|verify|anchor|report|stats|context [--session ID --output FILE]|keygen|profile|scrub [--input FILE --output FILE --format json|jsonl --max-record-bytes N] [--allow-hashes FILE] [--config FILE] [--by key|model|hour] [--name N] [--log-content] [--anchors FILE] [--no-page-redaction] [--log ./audit.jsonl] [--mode redact|no-go|advisory] [--port 8787] [--from ISO --to ISO]"); process.exit(2); }

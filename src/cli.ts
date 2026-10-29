#!/usr/bin/env node
import { parseArgs } from "node:util";
import { basename } from "node:path";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { AuditLog, AuditLogUnavailable, anchor, prune, report, sha256, stats, verifyAnchors, type Effect, type Review } from "./audit.js";
import { recordQdl, verifyDecision } from "./qdl.js";
import { decisionReceipt, renderReceipt } from "./receipt.js";
import { policyHistories, withChanges } from "./policies.js";
import { randomBytes } from "node:crypto";
import { SANDBOX_AVAILABLE, TOOLS_OK, sandboxState } from "./attachments.js";
import { createProxy } from "./proxy.js";
import { listSessions, renderSessionHtml } from "./contextView.js";
import type { Mode } from "./scan.js";
import { scrubHistory } from "./history.js";
import { createInspectionProfile } from "./profile.js";
import { validateActionGate } from "./actionGate.js";
import { checkQuotes } from "./quotes.js";
import { readEvidenceRecords } from "./evidence.js";
import { renderWorkbench } from "./workbench.js";
import { createConsole } from "./console.js";
import { awaitVerdict, effectAuthorized } from "./verdict.js";
import { createAttestation, generateAttestationKeys, parseAttestation, verifyAttestation } from "./attestation.js";

const [cmd, ...rest] = process.argv.slice(2);
const { values: a } = parseArgs({ args: rest, options: {
  "upstream-openai": { type: "string", default: "https://api.openai.com" }, "upstream-anthropic": { type: "string", default: "https://api.anthropic.com" },
  "injection-model": { type: "string" }, "injection-task": { type: "string" }, "injection-url": { type: "string" }, "injection-timeout-ms": { type: "string" },
  mode: { type: "string", default: "redact" }, log: { type: "string", default: "./audit.jsonl" }, port: { type: "string", default: "8787" },
  host: { type: "string", default: "127.0.0.1" }, anchors: { type: "string" }, config: { type: "string" }, by: { type: "string", default: "model" }, name: { type: "string", default: "client" }, "no-page-redaction": { type: "boolean", default: false }, "unsafe-no-sandbox": { type: "boolean", default: false }, "log-content": { type: "boolean", default: false }, "allow-hashes": { type: "string" }, from: { type: "string", default: "1970-01-01" }, to: { type: "string", default: "9999-12-31" },
  input: { type: "string" }, session: { type: "string" }, output: { type: "string" }, format: { type: "string" }, "max-record-bytes": { type: "string" },
  policy: { type: "string" }, inputs: { type: "string" }, "system-id": { type: "string" }, "use-case": { type: "string" }, "llm-call": { type: "string" },
  "private-key": { type: "string" }, "public-key": { type: "string" }, attestation: { type: "string" },
  decision: { type: "string" }, reviewer: { type: "string" }, verdict: { type: "string" }, note: { type: "string" },
  source: { type: "string" }, answer: { type: "string" }, metrics: { type: "string" }, "notify-url": { type: "string" }, "overdue-minutes": { type: "string" },
  "timeout-s": { type: "string", default: "600" }, action: { type: "string" }, status: { type: "string" }, code: { type: "string" }, review: { type: "string" },
  "baseline-limit": { type: "string", default: "2" }, "candidate-limit": { type: "string", default: "3" },
  "rotate-bytes": { type: "string", default: String(256 * 1024 * 1024) }, "keep-days": { type: "string" }, "inspect-timeout-ms": { type: "string", default: "5000" },
} });
const NOT_REPRODUCED = new Set(["audit_qdl_source_missing", "audit_qdl_source_invalid", "audit_qdl_source_mismatch", "audit_qdl_intent_mismatch"]);
const log = new AuditLog(a.log!);
const allowlist = () => {
  if (!a["allow-hashes"]) return undefined;
  let hashes: unknown;
  try { hashes = JSON.parse(readFileSync(a["allow-hashes"], "utf8")); } catch { throw new Error("audit_invalid_allowlist"); }
  if (!Array.isArray(hashes) || hashes.some((h) => typeof h !== "string")) throw new Error("audit_invalid_allowlist");
  return new Set<string>(hashes as string[]);
};
if (cmd === "attest-keygen") {
  try {
    if (!a["private-key"] || !a["public-key"]) throw new Error("audit_missing_argument");
    const keyId = generateAttestationKeys(a["private-key"], a["public-key"]);
    console.log(JSON.stringify({ publicKey: a["public-key"], privateKey: a["private-key"], keyId }));
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed");
    process.exitCode = 2;
  }
} else if (cmd === "attest") {
  try {
    if (!a.decision || !a["private-key"] || !a.output || !a.verdict) throw new Error("audit_missing_argument");
    if (statSync(a["private-key"]).size > 16 * 1024) throw new Error("audit_invalid_private_key");
    const attestation = await createAttestation(log, a.decision, readFileSync(a["private-key"], "utf8"), a.verdict as Review["decision"]);
    try { writeFileSync(a.output, JSON.stringify(attestation, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
    catch (cause) { throw new Error((cause as NodeJS.ErrnoException).code === "EEXIST" ? "audit_output_exists" : "audit_output_unavailable"); }
    console.log(JSON.stringify({ output: a.output, decision: attestation.decision.id, verdict: attestation.review.verdict, keyId: attestation.keyId, checkpoint: attestation.checkpoint }));
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed");
    process.exitCode = 2;
  }
} else if (cmd === "verify-attestation") {
  try {
    if (!a.input || !a.attestation || !a["public-key"]) throw new Error("audit_missing_argument");
    if (statSync(a.input).size > 16 * 1024 * 1024 || statSync(a.attestation).size > 64 * 1024 || statSync(a["public-key"]).size > 16 * 1024) throw new Error("audit_package_too_large");
    console.log(JSON.stringify(await verifyAttestation(readFileSync(a.input, "utf8"), readFileSync(a.attestation, "utf8"), readFileSync(a["public-key"], "utf8"))));
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_invalid_attestation");
    process.exitCode = 1;
  }
} else if (cmd === "verify-receipt") {
  try {
    if (!a.input) throw new Error("audit_missing_argument");
    if (statSync(a.input).size > 16 * 1024 * 1024) throw new Error("audit_package_too_large");
    const { verifyPortableReceipt } = await import("./decisionPackage.js");
    console.log(JSON.stringify(await verifyPortableReceipt(readFileSync(a.input, "utf8"))));
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_invalid_decision_package");
    process.exitCode = 1;
  }
} else if (cmd === "console") {
  try {
    const app = createConsole({ log, configPath: a.config, anchorsPath: a.anchors, metricsUrl: a.metrics, reviewer: a.reviewer, host: a.host,
      notifyUrl: a["notify-url"], overdueMinutes: a["overdue-minutes"] === undefined ? undefined : Number(a["overdue-minutes"]) });
    const port = rest.some((x) => x === "--port" || x.startsWith("--port=")) ? Number(a.port) : 8793;
    app.server.listen(port, a.host, () => console.error(JSON.stringify({ event: "console", url: app.url(), log: a.log, config: a.config ?? null, reviewer: a.reviewer ?? null, writes: a.reviewer ? "reviews" : "none", notify: a["notify-url"] ? "on" : "off" })));
  } catch (e) { console.error((e as Error).message); process.exit(2); }
} else if (cmd === "await") {
  if (!a.decision || !/^\d{1,7}$/.test(a["timeout-s"]!)) { console.error("audit_missing_argument"); process.exit(2); }
  try {
    const verdict = await awaitVerdict(log, a.decision, { timeoutMs: Number(a["timeout-s"]) * 1000 });
    console.log(JSON.stringify({ decision: a.decision, ...verdict }));
    process.exitCode = verdict.state === "approved" ? 0 : verdict.state === "timeout" ? 3 : 1;
  } catch (e) { console.error((e as Error).message); process.exit(2); }
} else if (cmd === "effect") {
  try {
    if (!a.decision || !a.action || !a.status) throw new Error("audit_missing_argument");
    const r = log.effect(a.decision, { action: a.action, status: a.status as Effect["status"], review: a.review, code: a.code });
    console.log(JSON.stringify({ effect: r.id, decision: a.decision, action: a.action, status: a.status, authorized: effectAuthorized(log.read(), r.id) }));
  } catch (e) { console.error((e as Error).message); process.exit(2); }
} else if (cmd === "workbench") {
  try {
    if (!a.output) throw new Error("audit_missing_argument");
    const snapshot = readEvidenceRecords(log);
    const trustFiles = [a.input, a.attestation, a["public-key"]];
    if (trustFiles.some(Boolean) && !trustFiles.every(Boolean)) throw new Error("audit_missing_argument");
    let trusted: { decisionId: string; verdict: string; keyId: string; checkpointCount: number; head: string } | undefined;
    if (trustFiles.every(Boolean)) {
      if (statSync(a.input!).size > 16 * 1024 * 1024 || statSync(a.attestation!).size > 64 * 1024 || statSync(a["public-key"]!).size > 16 * 1024) throw new Error("audit_package_too_large");
      const attestationText = readFileSync(a.attestation!, "utf8");
      const verified = await verifyAttestation(readFileSync(a.input!, "utf8"), attestationText, readFileSync(a["public-key"]!, "utf8"));
      const signed = parseAttestation(attestationText);
      if (snapshot.records.length < signed.checkpoint.count || snapshot.records[signed.checkpoint.count - 1]?.hash !== signed.checkpoint.head) throw new Error("audit_attestation_log_mismatch");
      trusted = { decisionId: verified.decision, verdict: verified.verdict, keyId: verified.keyId, checkpointCount: signed.checkpoint.count, head: signed.checkpoint.head };
    }
    const result = renderWorkbench(snapshot.records, snapshot.digest, { from: a.from!, to: a.to!, attestation: trusted });
    try { writeFileSync(a.output, result.html + "\n", { flag: "wx", mode: 0o600 }); }
    catch (error) { throw new Error((error as NodeJS.ErrnoException).code === "EEXIST" ? "audit_output_exists" : "audit_output_unavailable"); }
    console.log(JSON.stringify({ output: a.output, calls: result.calls, sessions: result.sessions, findings: result.findings, decisions: result.decisions, observedQuinelings: result.observedQuinelings, snapshot: snapshot.digest }));
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed");
    process.exitCode = 2;
  }
} else if (cmd === "lab") {
  try {
    const { compareSession, renderComparison } = await import("./labCompare.js");
    const format = a.format ?? (a.output ? "html" : "json");
    if (format !== "html" && format !== "json") throw new Error("audit_invalid_format");
    const comparison = await compareSession(log, { sessionId: a.session, baselineLimit: Number(a["baseline-limit"]), candidateLimit: Number(a["candidate-limit"]) });
    const result = format === "html" ? renderComparison(comparison) : JSON.stringify(comparison, null, 2);
    if (a.output) {
      try { writeFileSync(a.output, result + "\n", { flag: "wx", mode: 0o600 }); }
      catch (error) { throw new Error((error as NodeJS.ErrnoException).code === "EEXIST" ? "audit_output_exists" : "audit_output_unavailable"); }
      console.log(JSON.stringify(comparison.summary));
    } else console.log(result);
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed");
    process.exitCode = 2;
  }
} else if (cmd === "scrub" || cmd === "profile") {
  try {
    const carnet = allowlist();
    if (cmd === "scrub") {
      console.log(JSON.stringify(await scrubHistory({ input: a.input!, output: a.output!, format: a.format as "json" | "jsonl" | undefined,
        maxRecordBytes: a["max-record-bytes"] === undefined ? undefined : Number(a["max-record-bytes"]), carnet })));
    } else {
      if (!["redact", "no-go", "advisory"].includes(a.mode!)) throw new Error("audit_invalid_mode");
      const cfg = a.config ? JSON.parse(readFileSync(a.config, "utf8")) : {};
      console.log(JSON.stringify(createInspectionProfile({ mode: a.mode as Mode, carnet, actionGate: cfg.actionGate && validateActionGate(cfg.actionGate),
        pageRedaction: !a["no-page-redaction"] && cfg.pageRedaction !== false }).receipt));
    }
  } catch (cause) {
    const code = cause instanceof Error && /^(?:scrub_[a-z0-9_]+|audit_invalid_allowlist|audit_invalid_mode|audit_action_gate_[a-z_]+)$/.test(cause.message)
      ? cause.message : "audit_command_failed";
    console.error(code); process.exitCode = 2;
  }
} else if (cmd === "serve") {
  if (!["redact", "no-go", "advisory"].includes(a.mode!)) { console.error("--mode must be redact|no-go|advisory"); process.exit(2); }
  if (!/^\d{1,15}$/.test(a["rotate-bytes"]!)) { console.error("--rotate-bytes must be a whole number of bytes, 0 to disable"); process.exit(2); }
  log.rotateBytes = Number(a["rotate-bytes"]);
  if (!/^[1-9]\d{0,6}$/.test(a["inspect-timeout-ms"]!)) { console.error("--inspect-timeout-ms must be a whole number of milliseconds above 0"); process.exit(2); }
  const carnet = a["allow-hashes"] ? new Set<string>(JSON.parse(readFileSync(a["allow-hashes"], "utf8"))) : undefined;
  const env = process.env, cfg = a.config ? JSON.parse(readFileSync(a.config, "utf8")) : {};
  const unsafeNoSandbox = a["unsafe-no-sandbox"] === true || env.AI_AUDIT_UNSAFE_NO_SANDBOX === "1";
  const keys = [...(cfg.keys ?? []), ...(env.AI_AUDIT_CLIENT_KEY ? [{ name: "default", sha256: sha256(env.AI_AUDIT_CLIENT_KEY), logContent: env.AI_AUDIT_CLIENT_LOG_CONTENT === "1" }] : [])];
  const injectionJudge = a["injection-model"] ? { model: a["injection-model"], task: a["injection-task"] ?? "", url: a["injection-url"],
    ...(a["injection-timeout-ms"] !== undefined && { timeoutMs: Number(a["injection-timeout-ms"]) }) } : cfg.injectionJudge;
  if (!a["injection-model"] && [a["injection-task"], a["injection-url"], a["injection-timeout-ms"]].some((value) => value !== undefined)) {
    console.error("audit_injection_model_required"); process.exit(2);
  }
  const server = createProxy({ upstreamOpenai: a["upstream-openai"]!, upstreamAnthropic: a["upstream-anthropic"]!, mode: a.mode as Mode, log, carnet,
    injectionJudge, actionGate: cfg.actionGate, useCases: cfg.useCases,
    pageRedaction: !a["no-page-redaction"] && cfg.pageRedaction !== false, keys, budgetDirectory: cfg.budgetDirectory,
    aliases: cfg.aliases, adminKeySha256: env.AI_AUDIT_ADMIN_KEY ? sha256(env.AI_AUDIT_ADMIN_KEY) : cfg.adminKeySha256,
    upstreamKeys: { openai: env.AI_AUDIT_UPSTREAM_OPENAI_KEY, anthropic: env.AI_AUDIT_UPSTREAM_ANTHROPIC_KEY }, unsafeNoSandbox,
    inspectTimeoutMs: Number(a["inspect-timeout-ms"]) });
  server.listen(Number(a.port), a.host, () => {
    const addr = server.address();
    const bound = addr && typeof addr === "object" ? addr : { address: a.host, port: Number(a.port) };
    console.error(JSON.stringify({ event: "listening", url: `http://${bound.address}:${bound.port}`, mode: a.mode, log: a.log, rotateBytes: log.rotateBytes, sandbox: sandboxState(SANDBOX_AVAILABLE, unsafeNoSandbox), attachmentTools: TOOLS_OK, virtualKeys: keys.length, contentLoggingKeys: keys.filter((k: any) => k.logContent === true).length, aliases: Object.keys(cfg.aliases ?? {}), useCases: Object.keys(cfg.useCases ?? {}) }));
  });
} else if (cmd === "keygen") {
  const key = "aia-" + randomBytes(24).toString("base64url");
  console.log(`key (give to the client, not stored): ${key}\nconfig entry: ${JSON.stringify({ name: a.name, sha256: sha256(key), models: ["*"], logContent: a["log-content"] })}`);
} else if (cmd === "stats") {
  if (!["key", "model", "hour"].includes(a.by!)) { console.error("--by key|model|hour"); process.exit(2); }
  console.table(stats(log, a.by as any, a.from, a.to));
} else if (cmd === "rotate") {
  try { console.log(JSON.stringify(log.rotate() ?? { rotated: false })); }
  catch (cause) { console.error(cause instanceof AuditLogUnavailable ? "audit_log_unavailable" : "audit_command_failed"); process.exitCode = 1; }
} else if (cmd === "prune") {
  try {
    if (!/^\d{1,6}$/.test(a["keep-days"] ?? "")) throw new Error("audit_invalid_keep_days");
    console.log(JSON.stringify({ pruned: prune(log, Number(a["keep-days"])) }));
  } catch (cause) {
    const code = cause instanceof AuditLogUnavailable ? "audit_log_unavailable" : cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed";
    console.error(code); process.exitCode = code === "audit_invalid_keep_days" ? 2 : 1;
  }
} else if (cmd === "anchor") {
  console.log(JSON.stringify(anchor(log, a.anchors ?? a.log + ".anchors")));
} else if (cmd === "verify" && a.anchors) {
  const v = verifyAnchors(log, a.anchors); console.log(v.ok ? `OK: chain intact, consistent with ${v.anchors} anchors${v.pruned ? `, ${v.pruned} of them before a recorded prune` : ""}` : `FAIL: ${v.reason}`); process.exit(v.ok ? 0 : 1);
} else if (cmd === "verify") {
  const v = log.verifySeries(), current = v.file === undefined || v.file === basename(log.path);
  console.log(v.ok ? `OK: ${v.records} records${v.files > 1 ? ` in ${v.files} files` : ""}, chain intact` : `BROKEN at ${current ? "" : `${v.file} `}line ${v.badLine}: ${v.reason}`); process.exit(v.ok ? 0 : 1);
} else if (cmd === "context") {
  const records = log.read();
  if (!a.session) console.table(listSessions(records));
  else {
    try {
      const html = renderSessionHtml(records, a.session);
      if (a.output) writeFileSync(a.output, html); else process.stdout.write(html);
    } catch { console.error("audit_unknown_session"); process.exitCode = 2; }
  }
} else if (cmd === "decide" || cmd === "approve" || cmd === "replay" || cmd === "policies" || cmd === "receipt") {
  const json = (file: string | undefined, code: string) => { try { return JSON.parse(readFileSync(file!, "utf8")); } catch { throw new Error(code); } };
  try {
    if (cmd === "decide") {
      const policy = json(a.policy, "audit_invalid_policy"), inputs = json(a.inputs, "audit_invalid_inputs");
      const program = policy?.format === "qdl-intent" ? { intent: policy } : typeof policy?.source === "string" ? { source: policy.source } : undefined;
      if (!program) throw new Error("audit_invalid_policy");
      if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) throw new Error("audit_invalid_inputs");
      if (!a["system-id"] || !a["use-case"]) throw new Error("audit_missing_argument");
      if (a["llm-call"] && !log.read().some((r) => r.kind === "llm-call" && r.id === a["llm-call"])) throw new Error("audit_unknown_llm_call");
      const carnet = createInspectionProfile({ mode: "redact", carnet: allowlist() }).carnet;
      const { decision, step } = await recordQdl(log, { systemId: a["system-id"], useCase: a["use-case"], llmCallId: a["llm-call"], input: readFileSync(a.inputs!, "utf8") }, program, inputs, carnet);
      console.log(JSON.stringify({ decision: decision.id, status: step.qdl.status, ...(decision.output !== undefined && { outputs: decision.output }),
        ...(step.qdl.error && { error: step.qdl.error }), ...(step.qdl.findings && { findings: step.qdl.findings }) }));
      process.exitCode = step.qdl.status === "completed" ? 0 : 1;
    } else if (cmd === "approve") {
      if (!a.decision || !a.reviewer) throw new Error("audit_missing_argument");
      if (!["approved", "overridden", "rejected"].includes(a.verdict ?? "")) throw new Error("audit_invalid_verdict");
      const review = log.approve(a.decision, a.reviewer, a.verdict as Review["decision"], a.note);
      console.log(JSON.stringify({ review: review.id, decision: a.decision, verdict: a.verdict }));
    } else if (cmd === "replay") {
      if (!a.decision) throw new Error("audit_missing_argument");
      const check = await verifyDecision(log, a.decision, a.anchors ? { anchorsPath: a.anchors } : undefined);
      if (check.replay.reason) throw new Error(check.replay.reason);
      console.log(JSON.stringify({ decision: a.decision, reproduced: check.replay.reproduced, status: check.replay.status, ...(check.replay.output !== undefined && { outputs: check.replay.output }), ...(check.replay.error && { error: check.replay.error }), ok: check.ok, chain: check.chain, consistency: check.consistency, anchor: check.anchor }));
      process.exitCode = check.replay.reproduced ? 0 : 1;
    } else if (cmd === "receipt") {
      if (!a.decision) throw new Error("audit_missing_argument");
      const format = a.format ?? "html";
      if (!["html", "svg", "json"].includes(format)) throw new Error("audit_invalid_format");
      const { createDecisionPackage, renderDecisionSvg } = await import("./decisionPackage.js");
      let result: string;
      if (format === "html") {
        const receipt = await decisionReceipt(log, a.decision, a.anchors ? { anchorsPath: a.anchors } : undefined);
        let sharing: { json: string; svg: string } | { reason: string };
        try {
          const bundle = await createDecisionPackage(log, a.decision);
          sharing = { json: JSON.stringify(bundle, null, 2), svg: await renderDecisionSvg(bundle) };
        } catch (cause) {
          sharing = { reason: cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_package_unavailable" };
        }
        result = renderReceipt(receipt, sharing);
      } else {
        const bundle = await createDecisionPackage(log, a.decision);
        result = format === "json" ? JSON.stringify(bundle, null, 2) : await renderDecisionSvg(bundle);
      }
      if (a.output) {
        try { writeFileSync(a.output, result + "\n", { flag: "wx", mode: 0o600 }); }
        catch (cause) { throw new Error((cause as NodeJS.ErrnoException).code === "EEXIST" ? "audit_output_exists" : "audit_output_unavailable"); }
      } else console.log(result);
    } else {
      const records = log.read();
      for (const h of await withChanges(policyHistories(records, { systemId: a["system-id"], useCase: a["use-case"] }), records)) console.log(JSON.stringify(h));
    }
  } catch (cause) {
    const code = cause instanceof AuditLogUnavailable ? "audit_log_unavailable"
      : cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed";
    console.error(code); process.exitCode = NOT_REPRODUCED.has(code) ? 1 : 2;
  }
} else if (cmd === "check-quotes") {
  try {
    if (!a.source || !a.answer) throw new Error("audit_missing_argument");
    let source: string, answer: unknown;
    try { source = readFileSync(a.source, "utf8"); } catch { throw new Error("audit_invalid_source"); }
    try { answer = JSON.parse(readFileSync(a.answer, "utf8")); } catch { throw new Error("audit_invalid_answer"); }
    const check = checkQuotes(source, answer);
    console.log(JSON.stringify(check));
    process.exitCode = check.ok ? 0 : 1;
  } catch (cause) {
    console.error(cause instanceof Error && /^audit_[a-z_]+$/.test(cause.message) ? cause.message : "audit_command_failed"); process.exitCode = 2;
  }
} else if (cmd === "report") console.log(report(log, a.from!, a.to!).md);
else { console.error("usage: ai-audit serve|console|await|effect|verify|anchor|rotate|prune|report|stats|context|workbench|keygen|profile|scrub|check-quotes|decide|approve|replay|lab|receipt|verify-receipt|attest-keygen|attest|verify-attestation|policies [options]; see README.md for command examples"); process.exit(2); }

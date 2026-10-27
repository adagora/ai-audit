import { composeContext } from "../../dist/src/context.js";
import { inspect } from "../../dist/src/scan.js";

const readable = (value) => typeof value === "string" ? value : value === null || value === undefined ? "" : JSON.stringify(value);
const item = (role, content, detail) => ({ role, content: readable(content), bytes: Buffer.byteLength(readable(content)), ...(detail && { detail }) });

export function contextItems(api, body) {
  if (api === "openai-responses") return [
    ...(body.instructions === undefined ? [] : [item("system", body.instructions)]),
    ...(typeof body.input === "string" ? [item("user", body.input)] : Array.isArray(body.input) ? body.input.map((entry) => item(entry?.role ?? entry?.type ?? "unknown", entry?.content ?? entry?.output ?? entry, entry?.type)) : []),
  ];
  return [
    ...(body.system === undefined ? [] : [item("system", body.system)]),
    ...(Array.isArray(body.messages) ? body.messages.map((entry) => item(entry?.role ?? "unknown", entry?.content ?? entry?.tool_calls ?? entry, entry?.tool_call_id ?? entry?.type)) : []),
  ];
}

export function contextPreview(api, body, observedForwarded) {
  const original = contextItems(api, body);
  const scanned = inspect(body);
  const forwarded = observedForwarded === null ? null : contextItems(api, observedForwarded ?? scanned.value);
  return {
    original,
    forwarded,
    forwardedBasis: observedForwarded === null ? "not-forwarded" : observedForwarded === undefined ? "scanner-derived" : "observed-upstream",
    composition: composeContext(api, body, Buffer.byteLength(JSON.stringify(body))),
    scannerFindings: scanned.findings.map((finding) => ({ rule: finding.rule, path: finding.path })),
  };
}

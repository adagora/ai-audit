import { createHash } from "node:crypto";

export const DIST = new URL("../../dist/src/", import.meta.url).href;
const TEST = new URL("../../dist/test/", import.meta.url).href;
export const { scanText, inspect, decide, hasDuplicateKeys, redactText } = await import(DIST + "scan.js");
export const { discover } = await import(DIST + "attachments.js");
export const { extract } = await import(DIST + "extract.js");
export const { redact, tokenTotals } = await import(DIST + "audit.js");
export const { quinelingResults, quinelingCalls } = await import(DIST + "quinelings.js");
export const { SEGMENTS, KIND_CODES, BEND_NAT_MAX, scaleToProvider } = await import(DIST + "context.js");
export const { arenaOf } = await import(DIST + "session.js");
export const { turnTokens, bustSignals } = await import(DIST + "contextView.js");
export const { policyHistories } = await import(DIST + "policies.js");
export const { checkActions, requestTexts, validateActionGate, validateKeyTools } = await import(DIST + "actionGate.js");
export const { heldNotice, rewriteResponse, streamGate } = await import(DIST + "enforce.js");
export const { turnTokensReference, bustSignalsReference, tokenTotalsReference } = await import(TEST + "usageReference.js");
export const { policyHistoriesReference } = await import(TEST + "policiesReference.js");
export const APIS = ["openai-chat", "openai-responses", "anthropic-messages"];
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const leavesOf = (v, path = ["$"], out = []) => {
  if (typeof v === "string") out.push([JSON.stringify(path), v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) leavesOf(x, [...path, Array.isArray(v) ? Number(k) : k], out);
  return out;
};
export const fail = (what, detail) => { throw new Error(`${what}: ${JSON.stringify(detail)}`); };

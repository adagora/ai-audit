const DIST = new URL("../../dist/src/", import.meta.url).href;
export const { scanText, inspect, decide, hasDuplicateKeys, redactText } = await import(DIST + "scan.js");
export const { discover } = await import(DIST + "attachments.js");
export const { extract } = await import(DIST + "extract.js");
export const { redact } = await import(DIST + "audit.js");
export const { quinelingResults, quinelingCalls } = await import(DIST + "quinelings.js");
export const APIS = ["openai-chat", "openai-responses", "anthropic-messages"];
export const leavesOf = (v, path = ["$"], out = []) => {
  if (typeof v === "string") out.push([JSON.stringify(path), v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) leavesOf(x, [...path, Array.isArray(v) ? Number(k) : k], out);
  return out;
};
export const fail = (what, detail) => { throw new Error(`${what}: ${JSON.stringify(detail)}`); };

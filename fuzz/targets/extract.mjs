import { extract, APIS, fail } from "./common.mjs";

const PROTO = Object.getOwnPropertyNames(Object.prototype);
const optional = (v, type) => v === undefined || typeof v === type;
export function fuzz(data) {
  if (!data.length) return;
  const api = APIS[data[0] % 3], sse = (data[0] & 4) !== 0, body = data.subarray(1).toString("utf8");
  const o = extract(api, body, sse);
  const added = Object.getOwnPropertyNames(Object.prototype).filter((k) => !PROTO.includes(k));
  if (added.length) fail("Object.prototype polluted", { api, sse, body, added });
  if (typeof o.text !== "string" || !optional(o.model, "string") || !optional(o.stop, "string")) fail("text/model/stop type", { api, sse, body, o });
  for (const t of o.toolCalls) if (typeof t.name !== "string" || typeof t.args !== "string") fail("tool call type", { api, sse, body, t });
  for (const [k, n] of Object.entries(o.usage ?? {})) if (n !== undefined && !(typeof n === "number" && Number.isFinite(n))) fail(`usage.${k} type`, { api, sse, body, usage: o.usage });
}

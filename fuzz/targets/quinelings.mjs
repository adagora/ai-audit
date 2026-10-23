import { quinelingResults, quinelingCalls, APIS, fail } from "./common.mjs";

export function fuzz(data) {
  if (!data.length) return;
  const api = APIS[data[0] % 3], text = data.subarray(1).toString("utf8");
  let body;
  try { body = JSON.parse(text); } catch { body = undefined; }
  const name = typeof body?.name === "string" ? body.name : "quineling_v1_run";
  const events = [...quinelingResults(api, body), ...quinelingCalls([{ name, args: text }])];
  if (JSON.stringify(events).includes("LEAK")) fail("free text in Quinelings events", { api, text, events });
}

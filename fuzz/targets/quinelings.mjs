import { quinelingResults, quinelingCalls, scanText, APIS, fail } from "./common.mjs";

const STRUCTURAL_PATH = /^\$[\w.[\]-]{0,255}$/;
export function fuzz(data) {
  if (!data.length) return;
  const api = APIS[data[0] % 3], text = data.subarray(1).toString("utf8");
  let body;
  try { body = JSON.parse(text); } catch { body = undefined; }
  const name = typeof body?.name === "string" ? body.name : "quineling_v1_run";
  const events = [...quinelingResults(api, body), ...quinelingCalls([{ name, args: text }])];
  for (const e of events)
    if (e.error?.path !== undefined && (!STRUCTURAL_PATH.test(e.error.path) || scanText(e.error.path).length)) fail("error path is not a clean structural path", { api, text, events });
  const withoutPaths = events.map((e) => (e.error ? { ...e, error: { code: e.error.code } } : e));
  if (JSON.stringify(withoutPaths).includes("LEAK")) fail("free text in Quinelings events", { api, text, events });
}

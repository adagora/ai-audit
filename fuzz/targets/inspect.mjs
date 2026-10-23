import { scanText, inspect, decide, discover, leavesOf, fail } from "./common.mjs";

const isJson = (s) => { try { const v = JSON.parse(s); return /^\s*[\[{]/.test(s) && v !== null && typeof v === "object"; } catch { return false; } };
export function fuzz(data) {
  const text = data.toString("utf8");
  let body;
  try { body = JSON.parse(text); } catch { return; }
  const r = inspect(body);
  if (decide("redact", r.findings).action === "block") return;
  const again = inspect(r.value);
  if (again.findings.length) fail("masking is not a fixpoint", { text, once: r.value, again: again.findings });
  const inspected = new Set(discover(r.value).atts.map((a) => JSON.stringify(a.path)));
  for (const [path, leaf] of leavesOf(r.value))
    if (!inspected.has(path) && !isJson(leaf) && scanText(leaf).length) fail("string neither scanned clean nor discovered", { text, path, leaf, spans: scanText(leaf) });
}

import { scanText, inspect, decide, discover, leavesOf, sha256, fail } from "./common.mjs";

const isJson = (s) => { try { const v = JSON.parse(s); return /^\s*[\[{]/.test(s) && v !== null && typeof v === "object"; } catch { return false; } };

function check(text, body, carnet) {
  const r = inspect(body, carnet);
  if (decide("redact", r.findings).action === "block") return;
  const again = inspect(r.value, carnet);
  if (again.findings.length) fail(carnet ? "masking with an allow-list is not a fixpoint" : "masking is not a fixpoint", { text, once: r.value, again: again.findings });
  const inspected = new Set(discover(r.value).atts.map((a) => JSON.stringify(a.path)));
  for (const [path, leaf] of leavesOf(r.value))
    if (!inspected.has(path) && !isJson(leaf) && scanText(leaf, carnet).length) fail("string neither scanned clean nor discovered", { text, path, leaf, spans: scanText(leaf, carnet) });
}

export function fuzz(data) {
  const text = data.toString("utf8");
  let body;
  try { body = JSON.parse(text); } catch { return; }
  check(text, body, undefined);
  const values = leavesOf(body).flatMap(([, leaf]) => [leaf, ...scanText(leaf).map((s) => s.value)]).filter((_, k) => k % 2 === text.length % 2);
  if (values.length) check(text, body, new Set(values.map(sha256)));
}

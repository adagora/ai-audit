import { hasDuplicateKeys, nestedDeeperThan, fail } from "./common.mjs";

function reference(t) {
  let i = 0, dup = false;
  const ws = () => { while (i < t.length && " \t\n\r".includes(t[i])) i++; };
  const str = () => { const s = i++; while (t[i] !== '"') i += t[i] === "\\" ? 2 : 1; i++; return JSON.parse(t.slice(s, i)); };
  const value = () => {
    ws();
    if (t[i] === "{") {
      i++; ws(); const keys = new Set();
      if (t[i] === "}") { i++; return; }
      for (;;) { ws(); const k = str(); if (keys.has(k)) dup = true; keys.add(k); ws(); i++; value(); ws(); if (t[i++] === "}") return; }
    }
    if (t[i] === "[") {
      i++; ws();
      if (t[i] === "]") { i++; return; }
      for (;;) { value(); ws(); if (t[i++] === "]") return; }
    }
    if (t[i] === '"') { str(); return; }
    while (i < t.length && !",]} \t\n\r".includes(t[i])) i++;
  };
  value();
  return dup;
}

export function fuzz(data) {
  const text = data.toString("utf8");
  for (const [name, scan] of [["hasDuplicateKeys", () => hasDuplicateKeys(text)], ["nestedDeeperThan", () => nestedDeeperThan(text, 4)]]) {
    let answer;
    try { answer = scan(); } catch (e) { fail(`${name} throws on text that is not JSON`, { text, e: String(e) }); }
    if (typeof answer !== "boolean") fail(`${name} does not answer`, { text });
  }
  try { JSON.parse(text); } catch { return; }
  const got = hasDuplicateKeys(text), want = reference(text);
  if (got !== want) fail("duplicate-key detection disagrees with the reference parser", { text, got, want });
}

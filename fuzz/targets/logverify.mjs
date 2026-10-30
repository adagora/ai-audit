import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DIST, hasDuplicateKeys, fail } from "./common.mjs";

const { AuditLog, canon, checkSeries } = await import(DIST + "audit.js");

let clock = Date.parse("2026-01-01T00:00:00.000Z");
const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "fuzz-logverify-")), "audit.jsonl"), () => new Date((clock += 1000)).toISOString());
for (let i = 0; i < 12; i++) {
  log.append(i % 3 === 0 ? { kind: "decision", id: `d${i}`, ts: new Date(clock).toISOString(), useCase: "quote", output: [{ action: "send", status: "simulated", amount: i * 1.5, note: "zażółć ✓  " }] }
    : i % 3 === 1 ? { kind: "review", id: `r${i}`, ts: new Date(clock).toISOString(), refId: `d${i - 1}`, review: { reviewer: "ada", decision: "approved", at: "t" } }
    : { kind: "llm-call", id: `c${i}`, ts: new Date(clock).toISOString(), usage: { input: i, output: 2 * i } });
  if (i % 4 === 3) log.rotate();
}
const ORIGINAL = log.files().map((f) => [basename(f), readFileSync(f, "utf8").split("\n").filter(Boolean)]);
const parsed = (line) => { try { const r = JSON.parse(line); return r && typeof r === "object" && !Array.isArray(r) ? r : undefined; } catch { return undefined; } };
const RECORDS = ORIGINAL.flatMap(([, lines]) => lines.map((l) => canon(JSON.parse(l))));

function tamper(data) {
  const files = ORIGINAL.map(([name, lines]) => [name, [...lines]]);
  let i = 0;
  const byte = () => data[i++ % data.length], all = () => files.flatMap(([, lines], f) => lines.map((_, l) => [f, l]));
  const pickLine = () => { const at = all(); return at.length ? at[byte() % at.length] : undefined; };
  for (let ops = 1 + (data[0] % 4), k = 0; k < ops && i < 4 * data.length; k++) {
    const op = byte() % 10, at = pickLine();
    if (op === 0 && at) { const line = files[at[0]][1][at[1]], p = (byte() * 256 + byte()) % Math.max(line.length, 1); files[at[0]][1][at[1]] = line.slice(0, p) + String.fromCharCode(byte()) + line.slice(p + 1); }
    else if (op === 1 && at) files[at[0]][1].splice(at[1], 1);
    else if (op === 2 && at) files[at[0]][1].splice(at[1], 0, files[at[0]][1][at[1]]);
    else if (op === 3 && at) { const other = pickLine(); [files[at[0]][1][at[1]], files[other[0]][1][other[1]]] = [files[other[0]][1][other[1]], files[at[0]][1][at[1]]]; }
    else if (op === 4 && files.length) files.splice(byte() % files.length, 1);
    else if (op === 5 && files.length > 1) { const a = byte() % files.length, b = byte() % files.length; [files[a], files[b]] = [files[b], files[a]]; }
    else if (op === 6 && files.length) { const f = files[byte() % files.length]; f[0] = f[0].replace(/\d(?=\D*$)/, String(byte() % 10)); }
    else if (op === 7 && at && parsed(files[at[0]][1][at[1]])) {
      const r = parsed(files[at[0]][1][at[1]]), keys = Object.keys(r), key = keys[byte() % keys.length];
      r[key] = [`x${byte()}`, byte(), null, { k: byte() }, r[keys[byte() % keys.length]]][byte() % 5];
      files[at[0]][1][at[1]] = JSON.stringify(r);
    } else if (op === 8 && at && parsed(files[at[0]][1][at[1]])) {
      const line = files[at[0]][1][at[1]], key = Object.keys(parsed(line))[byte() % 4];
      files[at[0]][1][at[1]] = `{${JSON.stringify(key)}:${JSON.stringify(`x${byte()}`)},` + line.slice(1);
    } else if (op === 9 && files.length) files[files.length - 1][1].splice(-1 - (byte() % 3));
  }
  return files;
}

export function fuzz(data) {
  if (!data.length) return;
  const files = tamper(data);
  let v;
  try { v = checkSeries(files); } catch (e) { fail("checkSeries throws", { files, e: String(e) }); }
  if (!v.ok) return;
  const lines = files.flatMap(([, ls]) => ls), got = lines.map((l) => canon(JSON.parse(l)));
  if (got.some((r, k) => r !== RECORDS[k]) || got.length > RECORDS.length) fail("a changed log verifies and is not a prefix of the original records", { files });
  const twice = lines.find((l) => hasDuplicateKeys(l));
  if (twice !== undefined) fail("a line with a duplicate key verifies", { line: twice });
}

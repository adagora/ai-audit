import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkQuotes } from "../src/quotes.js";

const email = "Hello, please send an offer for 10 pieces of product A-200, premium version, delivery by 15 Nov.\nJan Nowak, jan@firma.pl, +48 600 100 200";
const read = {
  quantity: { value: 10, quote: "10 pieces" },
  product: { value: "A-200", quote: "product A-200" },
  version: { value: "premium", quote: "premium version" },
  rush: { value: false, quote: "delivery by 15 Nov" },
};

test("quotes: every value found in its quote and every quote in the source passes (ADR 0031)", () => {
  assert.deepEqual(checkQuotes(email, read), { ok: true, checked: 4, issues: [] });
  assert.deepEqual(checkQuotes(email, {}), { ok: true, checked: 0, issues: [] });
});

test("quotes: 1 piece read from a quote that says 10 pieces is caught", () => {
  assert.deepEqual(checkQuotes(email, { ...read, quantity: { value: 1, quote: "10 pieces" } }),
    { ok: false, checked: 4, issues: [{ field: "quantity", code: "value-not-in-quote" }] });
  assert.deepEqual(checkQuotes(email, { product: { value: "A-300", quote: "product A-200" } }).issues, [{ field: "product", code: "value-not-in-quote" }]);
});

test("quotes: a quote the source does not contain, or no quote at all, is an issue", () => {
  const r = checkQuotes(email, {
    invented: { value: 12, quote: "12 pieces" },
    reordered: { value: "A-200", quote: "A-200 product" },
    absent: { value: "steel" },
    nullQuote: { value: "steel", quote: null },
    empty: { value: "steel", quote: "  " },
    maskOnly: { value: "x", quote: "[REDACTED:pii-email]" },
  });
  assert.deepEqual(r.issues.map((i) => `${i.field} ${i.code}`), ["invented quote-not-in-source", "reordered quote-not-in-source", "absent quote-missing",
    "nullQuote quote-missing", "empty quote-missing", "maskOnly quote-missing"]);
  assert.equal(r.ok, false);
});

test("quotes: a proxy mask in a quote stands for the masked text, in order and with at least one character", () => {
  assert.equal(checkQuotes(email, { name: { value: "Jan Nowak", quote: "Jan Nowak, [REDACTED:pii-email], [REDACTED:pii-phone]" } }).ok, true);
  assert.equal(checkQuotes(email, { name: { value: "Jan Nowak", quote: "[redacted:pii-email] Jan Nowak" } }).ok, true);
  assert.equal(checkQuotes(email, { name: { value: "Jan Nowak", quote: "+48 [REDACTED:pii-phone] Jan Nowak" } }).ok, false);
  assert.equal(checkQuotes("Jan Nowak", { name: { value: "Nowak", quote: "Jan[REDACTED:pii-email]Nowak" } }).ok, true);
  assert.equal(checkQuotes("JanNowak", { name: { value: "Nowak", quote: "Jan[REDACTED:pii-email]Nowak" } }).ok, false);
});

test("quotes: case, spacing and Unicode forms do not matter; a number is found as an integer, a decimal or a grouped number", () => {
  const source = "Order:  TEN crates,\n2,5 EUR each, total 1,500 boxes, temperature -5 C, ﬁnish matte";
  const ok = (value: string | number, quote: string) => checkQuotes(source, { f: { value, quote } }).ok;
  assert.equal(ok("ten", "ORDER: ten"), true);
  assert.equal(ok("finish", "finish matte"), true);
  assert.equal(ok(2.5, "2,5 eur"), true);
  assert.equal(ok(1500, "1,500 boxes"), true);
  assert.equal(ok(1.5, "1,500 boxes"), true);
  assert.equal(ok(-5, "-5 c"), true);
  assert.equal(ok(5, "-5 c"), true);
  assert.equal(ok(-2.5, "2,5 eur"), false);
  assert.equal(ok(25, "2,5 eur"), false);
  assert.equal(checkQuotes("10 000 units", { f: { value: 10000, quote: "10 000 units" } }).ok, true);
  assert.equal(checkQuotes("10 pieces", { f: { value: 1, quote: "10 pieces" } }).ok, false);
});

test("quotes: an answer that is not an object of {value, quote} fields is refused", () => {
  for (const answer of [null, [], "x", 1, { f: 1 }, { f: { quote: "x" } }, { f: { value: { n: 1 }, quote: "x" } }, { f: { value: [1], quote: "x" } },
    { f: { value: Number.NaN, quote: "x" } }, { f: { value: 1, quote: 1 } }])
    assert.throws(() => checkQuotes(email, answer), /^Error: audit_invalid_answer$/, JSON.stringify(answer));
  assert.throws(() => checkQuotes(undefined as unknown as string, {}), /^Error: audit_invalid_answer$/);
});

test("quotes: a quote with many masks against a large source is checked in linear time", () => {
  const source = "ab ".repeat(700_000), quote = Array.from({ length: 2_000 }, () => "ab").join("[REDACTED:pii-email]");
  const t0 = Date.now();
  assert.equal(checkQuotes(source, { f: { value: "ab", quote } }).ok, true);
  assert.equal(checkQuotes(source, { f: { value: "ab", quote: quote + "[REDACTED:x]abc" } }).ok, false);
  assert.ok(Date.now() - t0 < 5_000);
});

test("quotes: the CLI prints field names and codes only, exits 0 when every value is found, 1 with issues and 2 on bad input", () => {
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url)), dir = mkdtempSync(join(tmpdir(), "quotes-"));
  const file = (name: string, text: string) => { const p = join(dir, name); writeFileSync(p, text); return p; };
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, "check-quotes", ...args], { encoding: "utf8" });
  const source = file("email.txt", email);
  const good = run("--source", source, "--answer", file("good.json", JSON.stringify(read)));
  assert.equal(good.status, 0);
  assert.deepEqual(JSON.parse(good.stdout), { ok: true, checked: 4, issues: [] });
  const bad = run("--source", source, "--answer", file("bad.json", JSON.stringify({ ...read, quantity: { value: 1, quote: "10 pieces" } })));
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout.trim(), '{"ok":false,"checked":4,"issues":[{"field":"quantity","code":"value-not-in-quote"}]}');
  assert.doesNotMatch(bad.stdout, /pieces|Nowak|firma/);
  const refused = (args: string[], code: string) => { const r = run(...args); assert.equal(r.status, 2); assert.equal(r.stderr.trim(), code); assert.equal(r.stdout, ""); };
  refused(["--source", source], "audit_missing_argument");
  refused(["--source", join(dir, "missing.txt"), "--answer", file("a.json", "{}")], "audit_invalid_source");
  refused(["--source", source, "--answer", file("broken.json", "{")], "audit_invalid_answer");
  refused(["--source", source, "--answer", file("list.json", "[]")], "audit_invalid_answer");
});

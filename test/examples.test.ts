import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const example = (name: string) => spawnSync(process.execPath, [fileURLToPath(new URL(`../../examples/quineling-quote/${name}`, import.meta.url))], { encoding: "utf8" });

test("example: the quote policy decides, replays and catches a tampered rate", { skip }, () => {
  const r = example("run.mjs");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /price 394 PLN, LLM within 5%: false, auto-approve: false, action: route-to-human-review/);
  assert.match(r.stdout, /reproduced=true, chain ok=true/);
  assert.match(r.stdout, /chain BROKEN line \d+ \(hash mismatch\); replay gives 352 PLN, reproduced=false/);
});

test("example: an LLM writes the policy, the refused draft is recorded, the fixed program follows the rule", { skip }, () => {
  const r = example("llm-policy.mjs");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /attempt 1 \(scripted-llm\): refused before running, unit-type at \$\.node\.inputs/);
  assert.match(r.stdout, /attempt 2 \(scripted-llm\): program ql_[0-9a-f]{12}… compiled and ran, price 394 PLN; the rule says 394 PLN, approved/);
  assert.match(r.stdout, /Quinelings events: call compile intentHash [0-9a-f]{8}…; result compile error unit-type; call compile intentHash [0-9a-f]{8}…/);
  assert.match(r.stdout, /intentHash the proxy logged for that LLM call: yes/);
  assert.match(r.stdout, /replay from the log: reproduced=true/);
  assert.match(r.stdout, /\(2 llm-call, 4 decision, 1 program, 1 review\), chain ok/);
});

test("example: a toolroom quote masks the title block, prices the LLM hours with fixed rates and routes an assumed material to the estimator", { skip }, () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../../examples/quineling-wycena/run.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /masked: pii-email at \$\.messages\[1\]\.content, pii-phone at \$\.messages\[1\]\.content/);
  assert.match(r.stdout, /the provider got: Tabliczka rysunkowa: konstruktor Jan Kowalski, e-mail \[REDACTED:pii-email\], tel\. \[REDACTED:pii-phone\]\./);
  assert.match(r.stdout, /materiał \(18G2A, 6\.00 PLN\/kg\) +2262\.00 PLN/);
  assert.match(r.stdout, /rezerwa \(10 %\) +601\.70 PLN/);
  assert.match(r.stdout, /zarobek \(narzut 25 %, marża 20\.0 %\) +1654\.67 PLN/);
  assert.match(r.stdout, /cena netto za partię +8273\.38 PLN/);
  assert.match(r.stdout, /Decision: route-to-estimator, because: the material is not on the drawing \(18G2A assumed\), the price is above 5000 PLN/);
  assert.match(r.stdout, /Replay from the log only: reproduced=true, chain ok/);
});

test("example: a floor quote page is a view, and the log is the audit", { skip }, () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../../examples/quineling-share/run.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /42 min → 189 PLN/);
  assert.match(r.stdout, /10 min → 150 PLN/);
  assert.match(r.stdout, /program ql_[0-9a-f]{64} stored once: yes/);
  assert.match(r.stdout, /sdk reproduce matches: yes/);
  assert.match(r.stdout, /audit replay: reproduced=true, chain ok/);
  assert.match(r.stdout, /This file is a view\. The audit is the log beside it\./);
  const page = r.stdout.match(/open: (file:\S+)/);
  assert.ok(page);
  const html = readFileSync(fileURLToPath(page[1]), "utf8");
  assert.match(html, /This file is a view\. The audit is the log beside it\./);
  assert.match(html, /189 PLN/);
  assert.match(html, /150 PLN/);
  assert.match(html, /Opening this file does not prove the run/);
  assert.doesNotMatch(html, /https?:\/\/[^"\s]+\/share/);
});

test("example: an offline proxy decision corrects a proposed price, records review, and detects a tampered log", { skip }, () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../../examples/decision-receipt/run.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const line of ["proposal: 100", "corrected: 189", "review: pending", "approval: approved", "replay: 189", "altered: detected"]) assert.match(r.stdout, new RegExp(`^${line}$`, "m"));
  const policy = r.stdout.match(/^policy: (ql_[0-9a-f]{64}) version 1$/m);
  const revision = r.stdout.match(/^revision: (ql_[0-9a-f]{64}) version 2$/m);
  const source = r.stdout.match(/^replay-source: (ql_[0-9a-f]{64})$/m);
  assert.ok(policy && revision && source);
  assert.equal(source[1], policy[1]);
  assert.notEqual(policy[1], revision[1]);
  const page = r.stdout.match(/^receipt: (file:\S+)$/m);
  assert.ok(page);
  const html = readFileSync(fileURLToPath(page[1]), "utf8");
  for (const heading of ["LLM call", "Input snapshot", "Policy", "Calculation", "Review", "Verification"]) assert.match(html, new RegExp(`<h2>${heading}</h2>`));
  assert.match(html, /189/);
  assert.doesNotMatch(r.stdout, /sk-/);
});

test("example: the lesson refuses mixed units, runs, writes out its own source, rebuilds from its genome picture and draws its body", { skip }, () => {
  const r = example("lesson.mjs");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /machining = minutes \+ rate \(min \+ PLN\*min\^-1\): refused: unit-type at \$\.node\.inputs/);
  assert.match(r.stdout, /minutes = -5 \(the minimum is 0\): refused: refinement at \$\.bindings\.minutes/);
  assert.match(r.stdout, /42 min: minutes=42 → rate=4\.5 → floor=150 → machining=189 → price=189 PLN/);
  assert.match(r.stdout, /10 min: minutes=10 → rate=4\.5 → floor=150 → machining=45 → price=150 PLN/);
  assert.match(r.stdout, /emits \d+ bytes, identical to its source: yes/);
  assert.match(r.stdout, /reads genome-150\.png and rebuilds ql_[0-9a-f]{12}…, the same name: yes/);
  assert.match(r.stdout, /12000 points; each point belongs to one node: minutes \d+, rate \d+, floor \d+, machining \d+, price \d+/);
  assert.match(r.stdout, /the body has the same shape as body-150\.svg: yes/);
  assert.match(r.stdout, /price=200 PLN; the old program ql_[0-9a-f]{12}… still exists and still gives 150 PLN: yes/);
  assert.doesNotMatch(r.stdout, /: NO\b/);
});

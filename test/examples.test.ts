import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

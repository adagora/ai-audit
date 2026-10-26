import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;

test("example: a policy lab replays two session governors, then a changed threshold in a fresh process", { skip }, () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../../examples/policy-lab/run.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const line = (name: string) => { const found = r.stdout.match(new RegExp(`^${name}: (.+)$`, "m")); assert.ok(found, name); return found[1]; };
  assert.equal(line("forwarding"), "llm-calls only");
  assert.equal(line("unknown-usage"), "absent");
  assert.ok(Number(line("usage-later")) > Number(line("usage-early")));
  assert.ok(Number(line("disagree-turn")) > Number(line("agree-turn")));
  assert.notEqual(line("disagree-strict"), line("disagree-loose"));
  assert.notEqual(line("strict"), line("loose"));
  assert.notEqual(line("revised"), line("loose"));
  assert.equal(line("fresh-source"), line("revised"));
  assert.equal(line("fresh-halt"), line("revised-halt"));
  assert.equal(line("unrevised-source"), line("loose"));
  assert.equal(line("unrevised-halt"), line("disagree-loose"));
  assert.equal(line("replay"), "true");
  const html = readFileSync(fileURLToPath(line("page")), "utf8");
  assert.match(html, /<h2>Threshold<\/h2>/);
  assert.match(html, /<h2>Outputs<\/h2>/);
  assert.doesNotMatch(html, /type="module"|require\(|import /);
});

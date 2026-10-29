import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { effectAuthorized } from "../../dist/src/verdict.js";

const args = process.argv.slice(2), run = args[args.indexOf("--run") + 1];
if (!args.includes("--run") || !run) { console.error("usage: node examples/live-mail/summary.mjs --run DIR"); process.exit(2); }
const log = new AuditLog(join(run, "audit.jsonl")), records = log.read(), raw = log.files().map((f) => readFileSync(f, "utf8")).join("");
const kinds = {};
for (const r of records) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
console.log(`files: ${log.files().length}; records by kind: ${JSON.stringify(kinds)}`);
for (const c of records.filter((r) => r.kind === "llm-call"))
  console.log(`llm-call ${c.id.slice(0, 8)}: ${c.model}, HTTP ${c.upstreamStatus}, ${c.decision?.action}, findings ${(c.decision?.findings ?? []).map((f) => f.rule).join(" ")}, usage ${JSON.stringify(c.usage)}`);
for (const d of records.filter((r) => r.kind === "decision" && !r.qdl)) {
  const reviews = records.filter((r) => r.kind === "review" && r.refId === d.id).map((r) => r.review.decision);
  const effects = records.filter((r) => r.kind === "effect" && r.refId === d.id).map((r) => `${r.effect.status}${r.effect.code ? "/" + r.effect.code : ""}${effectAuthorized(records, r.id) ? "" : " UNAUTHORIZED"}`);
  console.log(`decision ${d.id.slice(0, 8)}: price ${d.output?.[11]} PLN, verdict ${reviews.join(", ") || "none"}, effects ${effects.join(", ") || "none"}`);
}
const leaked = readFileSync(new URL("./leak-check.txt", import.meta.url), "utf8").trim().split("\n").filter((value) => raw.includes(value));
console.log(`values from the mails found in the log: ${leaked.length ? leaked.join(", ") : "none"}`);
console.log(`chain: ${JSON.stringify(log.verifyChain())}`);

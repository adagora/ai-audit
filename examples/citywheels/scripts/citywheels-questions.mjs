import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function runCitywheelsQuestion({ root, pythonRoot, directory, target, model, context, question, policyPath }) {
  if (!["ai-audit", "python", "python-audit"].includes(target) || !["fake-helpdesk", "python-fake"].includes(model)) throw new Error("audit_casework_question_provider_unavailable");
  const evidence = join(directory, "questions", randomUUID());
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const contextPath = join(evidence, "context.json");
  writeFileSync(contextPath, JSON.stringify(context), { mode: 0o600 });
  const args = target === "ai-audit" ? [join(root, "examples/citywheels/scripts/citywheels-intentgauge.mjs")] : target === "python-audit" ? [join(root, "examples/citywheels/scripts/citywheels-python-audited.mjs"), pythonRoot] : ["-B", join(root, "examples/citywheels/scripts/citywheels-python.py"), pythonRoot];
  const command = target === "python" ? process.env.CITYWHEELS_PYTHON ?? "python3" : process.execPath;
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { signal: AbortSignal.timeout(25000), stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", CITYWHEELS_BOOKING_CONTEXT: contextPath, CITYWHEELS_EVIDENCE_ROOT: evidence, ...(policyPath ? { CITYWHEELS_REFUND_RULE: policyPath } : {}) } });
    let out = "", oversized = false;
    child.stdout.on("data", (chunk) => { out += chunk; if (out.length > 2000000) { oversized = true; child.kill(); } });
    child.stderr.resume();
    child.on("error", () => reject(new Error("audit_casework_question_generation_failed")));
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (code || oversized) return reject(new Error("audit_casework_question_generation_failed"));
      try {
        const result = JSON.parse(out);
        if (typeof result.answer !== "string" || !result.answer.trim() || result.answer.length > 128000) throw new Error("Invalid answer");
        resolveResult(result);
      } catch { reject(new Error("audit_casework_question_generation_failed")); }
    });
    child.stdin.end(JSON.stringify({ question, now: context.businessAt }));
  });
}

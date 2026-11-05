import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, question, ...options] = process.argv.slice(2);
let live = false, model;
for (let i = 0; i < options.length; i++) {
  if (options[i] === "--live") live = true;
  else if (options[i] === "--model" && options[i + 1] && !options[i + 1].startsWith("--")) model = options[++i];
  else throw new Error("Usage: run.mjs ask QUESTION [--live --model NAME]");
}
if (command !== "ask" || !question?.trim() || model && !live) throw new Error("Usage: run.mjs ask QUESTION [--live --model NAME]. For evaluation use npm run example:helpdesk.");
const child = spawn(process.execPath, [fileURLToPath(new URL("./scripts/citywheels-intentgauge.mjs", import.meta.url)), ...(live ? ["--live", ...(model ? ["--model", model] : [])] : [])], {
  stdio: ["pipe", "pipe", "inherit"], env: { PATH: process.env.PATH, ...(live && process.env.OPENAI_API_KEY ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}) },
});
let out = "";
child.stdout.on("data", (chunk) => { out += chunk; if (out.length > 2000000) child.kill(); });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.stdin.on("error", () => {});
child.on("close", (code) => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  try {
    const result = JSON.parse(out);
    console.log(result.answer);
    console.log(`Quote only; no booking or payment was changed.\nEvidence: ${result.data.audit.evidenceDirectory}\nAudit chain verified: ${result.data.audit.chainVerified}`);
  } catch { console.error("The application returned invalid output"); process.exitCode = 1; }
});
child.stdin.end(JSON.stringify({ question }));

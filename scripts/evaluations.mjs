import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(fileURLToPath(new URL("../live/evaluations/", import.meta.url)));
if (process.argv[2] === "--console") {
  const directory = resolve(process.argv[3] ?? "");
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  if (!manifest.logPath) throw new Error("This run has no ai-audit log");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../dist/src/cli.js", import.meta.url)), "console", "--log", manifest.logPath, "--port", process.argv[4] ?? "8797"], { stdio: "inherit" });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
} else {
  let directories;
  try { directories = readdirSync(root, { withFileTypes: true }); } catch { console.log(`No retained runs yet: ${root}`); process.exit(0); }
  const runs = directories.filter((d) => d.isDirectory()).flatMap((d) => {
    try { return [{ directory: join(root, d.name), ...JSON.parse(readFileSync(join(root, d.name, "manifest.json"), "utf8")) }]; } catch { return []; }
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const run of runs.slice(0, 30)) console.log(`${run.createdAt}  ${run.implementation ?? "comparison"}  ${run.provider ?? "fake"}  ${run.status}\n${run.directory}\n`);
}

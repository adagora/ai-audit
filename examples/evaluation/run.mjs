import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { evaluateQuotes, readQuoteDataset } from "../../dist/src/quoteEval.js";

const args = process.argv.slice(2);
const live = args.includes("--openai");
const outputIndex = args.indexOf("--output");
const repeatsIndex = args.indexOf("--repeats");
const output = outputIndex < 0 ? undefined : args[outputIndex + 1];
const repeats = live ? (repeatsIndex < 0 ? 3 : Number(args[repeatsIndex + 1])) : 0;
if ((outputIndex >= 0 && !output) || (repeatsIndex >= 0 && !Number.isInteger(repeats)) || (output && existsSync(output))) throw new Error("audit_eval_options_invalid");

const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const key = process.env.OPENAI_API_KEY ?? env.split(/\r?\n/).find((row) => /^OPENAI_API_KEY=/.test(row))?.slice("OPENAI_API_KEY=".length).trim().replace(/^(["'])(.*)\1$/, "$2");
if (live && !key) throw new Error("audit_eval_openai_key_missing");
const dataset = readQuoteDataset(new URL("./quotes.json", import.meta.url).pathname);
const report = await evaluateQuotes(dataset, { repeats, apiKey: key });
const json = JSON.stringify(report, null, 2) + "\n";
if (output) writeFileSync(output, json, { flag: "wx", mode: 0o600 });
else process.stdout.write(json);

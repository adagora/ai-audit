import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { INJECTION_RULES, signalsInText } from "./injection.js";
import { type InjectionJudge, type JudgeInput, type JudgeResult } from "./injectionJudge.js";

export interface InjectionCase extends JudgeInput {
  id: string; language: "en" | "pl" | "mixed"; split: "development" | "challenge"; expected: "benign" | "injection";
}
export interface InjectionDataset { version: 1; cases: InjectionCase[] }
export interface InjectionRow {
  id: string; language: InjectionCase["language"]; split: InjectionCase["split"]; source: JudgeInput["source"];
  expected: InjectionCase["expected"]; rules: string[]; samples: JudgeResult[];
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function readInjectionDataset(path: string): InjectionDataset {
  if (statSync(path).size > 2 * 1024 * 1024) throw new Error("audit_injection_dataset_invalid");
  let value: any;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("audit_injection_dataset_invalid"); }
  if (value?.version !== 1 || !Array.isArray(value.cases) || !value.cases.length || value.cases.length > 2_000) throw new Error("audit_injection_dataset_invalid");
  const ids = new Set<string>();
  for (const item of value.cases) {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(item.id) || ids.has(item.id)
      || !["en", "pl", "mixed"].includes(item.language) || !["development", "challenge"].includes(item.split)
      || !["benign", "injection"].includes(item.expected) || !["tool_result", "document"].includes(item.source)
      || typeof item.task !== "string" || !item.task.trim() || typeof item.content !== "string" || !item.content.trim()) throw new Error("audit_injection_dataset_invalid");
    ids.add(item.id);
  }
  return value;
}

type Observation = { expected: string; verdict: "benign" | "injection" | "uncertain" | "error"; durationMs?: number };
export function scoreInjectionObservations(items: Observation[]) {
  const count = (expected: string, verdict: string) => items.filter((x) => x.expected === expected && x.verdict === verdict).length;
  const tp = count("injection", "injection"), fp = count("benign", "injection"), tn = count("benign", "benign"), fn = count("injection", "benign");
  const attacks = items.filter((x) => x.expected === "injection").length, benign = items.length - attacks;
  const uncertain = items.filter((x) => x.verdict === "uncertain").length, errors = items.filter((x) => x.verdict === "error").length;
  const durations = items.flatMap((x) => x.durationMs === undefined ? [] : [x.durationMs]).sort((a, b) => a - b);
  const ratio = (n: number, d: number) => d ? n / d : null;
  return { samples: items.length, attacks, benign, tp, fp, tn, fn, uncertain, errors, missedOrUnresolvedAttacks: attacks - tp,
    precision: ratio(tp, tp + fp), recall: ratio(tp, attacks), falsePositiveRate: ratio(fp, benign),
    coverage: ratio(tp + fp + tn + fn, items.length), p95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null };
}

export async function evaluateInjection(dataset: InjectionDataset, options: { judge?: InjectionJudge; repeats?: number } = {}) {
  const repeats = options.repeats ?? 1;
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("audit_injection_repeats_invalid");
  const rows: InjectionRow[] = [];
  for (const item of dataset.cases) {
    const samples: JudgeResult[] = [];
    if (options.judge) for (let i = 0; i < repeats; i++) samples.push(await options.judge.check({ task: item.task, source: item.source, content: item.content }));
    rows.push({ id: item.id, language: item.language, split: item.split, source: item.source, expected: item.expected,
      rules: signalsInText(item.content, "$").map((signal) => signal.rule), samples });
  }
  const summarize = (selected: InjectionRow[]) => ({
    regex: scoreInjectionObservations(selected.map((row) => ({ expected: row.expected, verdict: row.rules.length ? "injection" : "benign" }))),
    ollama: options.judge ? scoreInjectionObservations(selected.flatMap((row) => row.samples.map((sample) => ({ expected: row.expected,
      verdict: sample.status === "ok" ? sample.verdict : "error", durationMs: sample.durationMs })))) : null,
    combined: options.judge ? scoreInjectionObservations(selected.flatMap((row) => row.samples.map((sample) => ({ expected: row.expected,
      verdict: row.rules.length ? "injection" : sample.status === "ok" ? sample.verdict : "error", durationMs: sample.durationMs })))) : null,
    verdictChanges: selected.filter((row) => new Set(row.samples.filter((s) => s.status === "ok").map((s) => s.status === "ok" && s.verdict)).size > 1).length,
  });
  return { version: 1, datasetDigest: hash(dataset), fixtureWarning: "Synthetic development and challenge cases, visible during harness design; not a production accuracy benchmark.",
    regexDigest: hash({ rules: INJECTION_RULES.map((r) => [r.id, r.re.source, r.re.flags]), screening: signalsInText.toString() }),
    judge: options.judge?.profile ?? null, repeats: options.judge ? repeats : 0,
    modelDigests: [...new Set(rows.flatMap((row) => row.samples.flatMap((s) => s.status === "ok" ? [s.modelDigest] : [])))],
    summary: { all: summarize(rows), languages: Object.fromEntries(["en", "pl", "mixed"].map((language) => [language, summarize(rows.filter((r) => r.language === language))])),
      splits: Object.fromEntries(["development", "challenge"].map((split) => [split, summarize(rows.filter((r) => r.split === split))])),
      sources: Object.fromEntries(["tool_result", "document"].map((source) => [source, summarize(rows.filter((r) => r.source === source))])) }, rows };
}

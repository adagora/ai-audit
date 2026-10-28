import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canon } from "./audit.js";

export interface QuoteFacts { [key: string]: number; minutes: number; rate: number; setup: number; material: number; llmPrice: number }
export interface QuoteCase { id: string; split: "development" | "holdout"; facts: QuoteFacts; expectedReview: boolean }
export interface QuoteDataset { version: 1; cases: QuoteCase[] }
export interface DecisionSample { probability?: number; review?: boolean; refusal: boolean; durationMs: number; inputTokens?: number; cachedTokens?: number }
export interface QuoteRow { id: string; split: QuoteCase["split"]; expectedReview: boolean; price: number; qdlReview: boolean; qdlReproduced: boolean; qdlEvaluateMs: number; qdlReplayMs: number; samples: DecisionSample[] }

export const QUESTION = "Using only the supplied quote facts, should this machining quote be routed to human review? Compute price as max(150, minutes * rate + setup + material) PLN. Review if price is greater than 1000 PLN or if the absolute difference between llmPrice and price is greater than 5% of price. At either exact boundary, do not review.";
export const THRESHOLD = 0.5;
const MODEL = "gpt-6-luna";
const keys = ["minutes", "rate", "setup", "material", "llmPrice"] as const;

export function readQuoteDataset(path: string): QuoteDataset {
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || (data as any).version !== 1 || !Array.isArray((data as any).cases)) throw new Error("audit_eval_dataset_invalid");
  const cases = (data as any).cases as unknown[];
  if (!cases.length || cases.length > 500) throw new Error("audit_eval_dataset_invalid");
  const ids = new Set<string>();
  for (const value of cases) {
    const item = value as QuoteCase;
    if (!item || typeof item.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(item.id) || ids.has(item.id)
      || !["development", "holdout"].includes(item.split) || typeof item.expectedReview !== "boolean"
      || !item.facts || typeof item.facts !== "object" || Array.isArray(item.facts) || Object.keys(item.facts).length !== keys.length
      || keys.some((key) => !Number.isFinite(item.facts[key]) || item.facts[key] < 0)) throw new Error("audit_eval_dataset_invalid");
    ids.add(item.id);
  }
  if (!cases.some((c: any) => c.split === "development") || !cases.some((c: any) => c.split === "holdout")) throw new Error("audit_eval_dataset_invalid");
  return data as QuoteDataset;
}

export function scoreRows(rows: QuoteRow[], split: QuoteCase["split"]) {
  const selected = rows.filter((r) => r.split === split);
  const samples = selected.flatMap((r) => r.samples.map((s) => ({ row: r, sample: s })));
  const classified = samples.filter((x) => x.sample.review !== undefined);
  const durations = samples.map((x) => x.sample.durationMs).sort((a, b) => a - b);
  const quantile = (p: number) => durations.length ? durations[Math.ceil(p * durations.length) - 1] : undefined;
  const qdlDurations = selected.map((r) => r.qdlEvaluateMs).sort((a, b) => a - b);
  const qdlQuantile = (p: number) => qdlDurations.length ? qdlDurations[Math.ceil(p * qdlDurations.length) - 1] : undefined;
  const counts = {
    cases: selected.length,
    qdlMisses: selected.filter((r) => r.expectedReview && !r.qdlReview).length,
    qdlFalseAlerts: selected.filter((r) => !r.expectedReview && r.qdlReview).length,
    qdlReplayFailures: selected.filter((r) => !r.qdlReproduced).length,
    qdlP50Ms: qdlQuantile(0.5), qdlP95Ms: qdlQuantile(0.95),
    apiSamples: samples.length,
    apiMisses: classified.filter((x) => x.row.expectedReview && !x.sample.review).length,
    apiFalseAlerts: classified.filter((x) => !x.row.expectedReview && x.sample.review).length,
    apiRefusals: samples.filter((x) => x.sample.refusal).length,
    apiFlips: selected.filter((r) => new Set(r.samples.map((s) => s.review).filter((v) => v !== undefined)).size > 1).length,
    apiProbabilityChanges: selected.filter((r) => new Set(r.samples.map((s) => s.probability).filter((v) => v !== undefined)).size > 1).length,
    apiP50Ms: quantile(0.5), apiP95Ms: quantile(0.95),
    inputTokens: samples.length && samples.every((x) => x.sample.inputTokens !== undefined) ? samples.reduce((sum, x) => sum + x.sample.inputTokens!, 0) : undefined,
    cachedTokens: samples.length && samples.every((x) => x.sample.cachedTokens !== undefined) ? samples.reduce((sum, x) => sum + x.sample.cachedTokens!, 0) : undefined,
  };
  return counts;
}

export async function evaluateQuotes(dataset: QuoteDataset, options: { repeats: number; apiKey?: string; fetcher?: typeof fetch; endpoint?: string }) {
  if (!Number.isInteger(options.repeats) || options.repeats < 0 || options.repeats > 10 || (options.repeats > 0 && !options.apiKey)) throw new Error("audit_eval_options_invalid");
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  const policy = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
  const session = new m.Session();
  const artifact = session.compile(policy);
  const recovered = new m.Session();
  if (recovered.recover({ source: artifact.source }).id !== artifact.id) throw new Error("audit_eval_qdl_recovery_failed");
  const rows: QuoteRow[] = [];
  for (const item of dataset.cases) {
    const qdlStart = performance.now();
    const run = session.run({ artifactId: artifact.id, requestId: item.id, inputs: item.facts });
    const qdlEvaluateMs = Math.round((performance.now() - qdlStart) * 1000) / 1000;
    const replayStart = performance.now();
    const again = recovered.run({ artifactId: artifact.id, requestId: item.id, inputs: item.facts });
    const qdlReplayMs = Math.round((performance.now() - replayStart) * 1000) / 1000;
    const output = run.result.occurrences?.[0]?.outputs;
    const other = again.result.occurrences?.[0]?.outputs;
    if (run.result.status !== "completed" || !Array.isArray(output) || typeof output[0] !== "number" || typeof output[2] !== "boolean") throw new Error("audit_eval_qdl_failed");
    const row: QuoteRow = { id: item.id, split: item.split, expectedReview: item.expectedReview, price: output[0], qdlReview: !output[2], qdlReproduced: JSON.stringify(output) === JSON.stringify(other), qdlEvaluateMs, qdlReplayMs, samples: [] };
    for (let i = 0; i < options.repeats; i++) {
      const body = {
        model: MODEL,
        input: [{ role: "user", content: [{ type: "input_json", data: item.facts }] }],
        questions: [{ type: "predicate", name: "needs_review", instructions: QUESTION }],
      };
      const start = performance.now();
      const response = await (options.fetcher ?? fetch)(options.endpoint ?? "https://api.openai.com/v1/decisions", {
        method: "POST", headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`audit_eval_api_http_${response.status}`);
      const data: any = await response.json();
      const durationMs = Math.round(performance.now() - start);
      const answer = data?.answers?.find((a: any) => a?.name === "needs_review");
      if (!answer || !["predicate", "refusal"].includes(answer.type) || (answer.type === "predicate" && (!Number.isFinite(answer.probability) || answer.probability < 0 || answer.probability > 1))) throw new Error("audit_eval_api_response_invalid");
      const usage = data?.usage;
      row.samples.push({
        ...(answer.type === "predicate" && { probability: answer.probability, review: answer.probability >= THRESHOLD }),
        refusal: answer.type === "refusal", durationMs,
        ...(Number.isSafeInteger(usage?.input_tokens) && usage.input_tokens >= 0 && { inputTokens: usage.input_tokens }),
        ...(Number.isSafeInteger(usage?.input_tokens_details?.cached_tokens) && usage.input_tokens_details.cached_tokens >= 0 && { cachedTokens: usage.input_tokens_details.cached_tokens }),
      });
    }
    rows.push(row);
  }
  const datasetHash = createHash("sha256").update(canon(dataset)).digest("hex");
  const questionHash = createHash("sha256").update(QUESTION).digest("hex");
  return {
    format: "ai-audit-quote-evaluation" as const, version: 1 as const, datasetHash, questionHash,
    policy: { sourceHash: artifact.id, registry: session.describe().registry, registryDigest: session.describe().registryDigest },
    api: { model: options.repeats ? MODEL : "not-run", threshold: THRESHOLD, repeats: options.repeats },
    summary: { development: scoreRows(rows, "development"), holdout: scoreRows(rows, "holdout") }, rows,
  };
}

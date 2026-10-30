import { tokenCount, type Usage } from "../src/extract.js";

type Tokens = { input: number; output: number };
const sum = (a: number, b: number) => {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("audit_budget_unavailable");
  return result;
};

export function admissionReference(state: { spent: Tokens; pending: Record<string, Tokens>; blocked?: boolean }, limits: Tokens, request: Tokens): "ok" | "blocked" | "exceeded" {
  if (state.blocked) return "blocked";
  const pending = Object.values(state.pending);
  const usedInput = pending.reduce((n, v) => sum(n, v.input), state.spent.input);
  const usedOutput = pending.reduce((n, v) => sum(n, v.output), state.spent.output);
  return request.input > limits.input - usedInput || request.output > limits.output - usedOutput ? "exceeded" : "ok";
}

export function chargeReference(reserved: Tokens, usage: Usage | undefined, anthropic: boolean) {
  const input = tokenCount(usage?.input), output = tokenCount(usage?.output);
  const completeInput = anthropic && input !== undefined ? sum(sum(input, tokenCount(usage?.cached) ?? 0), tokenCount(usage?.cacheWrite) ?? 0) : input;
  const charged = { input: completeInput ?? reserved.input, output: output ?? reserved.output };
  return { charged, inputKnown: completeInput !== undefined, outputKnown: output !== undefined, overrun: charged.input > reserved.input || charged.output > reserved.output };
}

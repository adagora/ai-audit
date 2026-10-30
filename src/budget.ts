import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tokenCount, type Usage } from "./extract.js";

export interface TokenBudget { period: "day" | "month"; inputTokens: number; outputTokens: number; maxOutputTokens: number }
export interface Tokens { input: number; output: number }
interface State { version: 1; spent: Tokens; pending: Record<string, Tokens>; blocked?: boolean }
export interface Reservation { file: string; id: string; tokens: Tokens }
export class BudgetError extends Error {
  constructor(public status: number, code: string) { super(code); }
}
const valid = (n: unknown) => tokenCount(n) !== undefined;
const sum = (a: number, b: number) => {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new BudgetError(503, "audit_budget_unavailable");
  return result;
};
export function validateBudget(value: TokenBudget) {
  if (!value || !["day", "month"].includes(value.period) || !valid(value.inputTokens) || !valid(value.outputTokens)
    || !valid(value.maxOutputTokens) || value.maxOutputTokens < 1) throw new Error("audit_budget_config_invalid");
}
export type Admission = "ok" | "blocked" | "exceeded";
export function admission(state: { spent: Tokens; pending: Record<string, Tokens>; blocked?: boolean }, limits: Tokens, request: Tokens): Admission {
  if (state.blocked) return "blocked";
  const pending = Object.values(state.pending);
  const usedInput = pending.reduce((n, v) => sum(n, v.input), state.spent.input);
  const usedOutput = pending.reduce((n, v) => sum(n, v.output), state.spent.output);
  return request.input > limits.input - usedInput || request.output > limits.output - usedOutput ? "exceeded" : "ok";
}
export function charge(reserved: Tokens, usage: Usage | undefined, anthropic: boolean) {
  const input = tokenCount(usage?.input), output = tokenCount(usage?.output);
  const completeInput = anthropic && input !== undefined ? sum(sum(input, tokenCount(usage?.cached) ?? 0), tokenCount(usage?.cacheWrite) ?? 0) : input;
  const charged = { input: completeInput ?? reserved.input, output: output ?? reserved.output };
  return { charged, inputKnown: completeInput !== undefined, outputKnown: output !== undefined, overrun: charged.input > reserved.input || charged.output > reserved.output };
}
export class BudgetStore {
  constructor(private directory: string, private now = () => new Date()) {}
  private file(hash: string, budget: TokenBudget) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new BudgetError(503, "audit_budget_unavailable");
    return join(this.directory, `${hash}-${budget.period}-${this.now().toISOString().slice(0, budget.period === "day" ? 10 : 7)}.json`);
  }
  private transact<T>(file: string, change: (state: State) => T): T {
    let lock: number | undefined;
    const temporary = file + "." + randomUUID() + ".tmp";
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      lock = openSync(file + ".lock", "wx", 0o600);
      const state: State = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, spent: { input: 0, output: 0 }, pending: {} };
      if (state?.version !== 1 || !valid(state.spent?.input) || !valid(state.spent?.output) || (state.blocked !== undefined && typeof state.blocked !== "boolean") || !state.pending || typeof state.pending !== "object" || Array.isArray(state.pending)
        || Object.values(state.pending).some((v) => !v || !valid(v.input) || !valid(v.output))) throw new BudgetError(503, "audit_budget_unavailable");
      const result = change(state);
      writeFileSync(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 });
      const fd = openSync(temporary, "r");
      try { fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, file);
      const directory = openSync(this.directory, "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
      return result;
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      throw new BudgetError(503, "audit_budget_unavailable");
    } finally {
      if (lock !== undefined) { closeSync(lock); unlinkSync(file + ".lock"); }
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  reserve(hash: string, budget: TokenBudget, input: number, output: number): Reservation {
    validateBudget(budget);
    if (!valid(input) || !valid(output)) throw new BudgetError(503, "audit_budget_unavailable");
    const file = this.file(hash, budget), id = randomUUID();
    return this.transact(file, (state) => {
      const verdict = admission(state, { input: budget.inputTokens, output: budget.outputTokens }, { input, output });
      if (verdict === "blocked") throw new BudgetError(503, "audit_budget_usage_overrun");
      if (verdict === "exceeded") throw new BudgetError(429, "audit_token_budget_exceeded");
      state.pending[id] = { input, output };
      return { file, id, tokens: { input, output } };
    });
  }
  settle(reservation: Reservation, usage?: Usage, anthropic = false) {
    return this.transact(reservation.file, (state) => {
      const reserved = state.pending[reservation.id];
      if (!reserved) throw new BudgetError(503, "audit_budget_unavailable");
      const result = charge(reserved, usage, anthropic);
      state.spent.input = sum(state.spent.input, result.charged.input);
      state.spent.output = sum(state.spent.output, result.charged.output);
      state.blocked ||= result.overrun;
      delete state.pending[reservation.id];
      return result;
    });
  }
  cancel(reservation: Reservation) {
    this.transact(reservation.file, (state) => { delete state.pending[reservation.id]; });
  }
  status(hash: string, budget: TokenBudget) {
    return this.transact(this.file(hash, budget), (state) => statusOf(state, budget));
  }
  peek(hash: string, budget: TokenBudget) {
    const file = this.file(hash, budget);
    try { return statusOf(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, spent: { input: 0, output: 0 }, pending: {} }, budget); }
    catch { throw new BudgetError(503, "audit_budget_unavailable"); }
  }
}

function statusOf(state: State, budget: TokenBudget) {
  const input = Object.values(state.pending).reduce((n, v) => sum(n, v.input), 0);
  const output = Object.values(state.pending).reduce((n, v) => sum(n, v.output), 0);
  return { period: budget.period, blocked: state.blocked === true, limits: { input: budget.inputTokens, output: budget.outputTokens }, spent: state.spent,
    reserved: { input, output }, remaining: { input: Math.max(0, budget.inputTokens - state.spent.input - input), output: Math.max(0, budget.outputTokens - state.spent.output - output) } };
}

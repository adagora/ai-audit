import { createHash } from "node:crypto";
import { validateKeyTools, type KeyTools } from "./actionGate.js";

export type Tier = "off" | "shadow" | "assist" | "contain" | "transact";
export const TIERS: readonly Tier[] = ["off", "shadow", "assist", "contain", "transact"];
export interface UseCase { readonly tier: Tier; readonly models?: readonly string[]; readonly tools?: KeyTools; readonly digest: string }
export type UseCases = ReadonlyMap<string, UseCase>;
export type Resolution = { name: string; row: UseCase } | { status: 400 | 403; code: string; name?: string };

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FIELDS = new Set(["tier", "models", "tools"]);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const names = (v: unknown, max: number) => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.trim() !== "" && s.length <= max);

export function validateUseCases(value: unknown, keys: readonly { useCases?: unknown }[]): UseCases | undefined {
  const invalid = () => new Error("audit_use_cases_invalid");
  if (value === undefined && keys.every((key) => key.useCases === undefined)) return undefined;
  if (!record(value) || !Object.keys(value).length) throw invalid();
  const table = new Map<string, UseCase>();
  for (const name of Object.keys(value).sort()) {
    const row = value[name];
    if (!NAME.test(name) || !record(row) || Object.keys(row).some((k) => !FIELDS.has(k)) || !TIERS.includes(row.tier as Tier)
      || (row.models !== undefined && !names(row.models, 128))) throw invalid();
    let tools: KeyTools | undefined;
    try { tools = row.tools === undefined ? undefined : validateKeyTools(row.tools); } catch { throw invalid(); }
    const models = row.models === undefined ? undefined : Object.freeze([...new Set(row.models as string[])].sort());
    const canonical = { name, tier: row.tier, ...(models && { models }), ...(tools && { tools: { mode: tools.mode, allow: [...new Set(tools.allow)].sort() } }) };
    table.set(name, Object.freeze({ tier: row.tier as Tier, ...(models && { models }), ...(tools && { tools }), digest: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") }));
  }
  if (keys.some((key) => key.useCases !== undefined && (!names(key.useCases, 64) || (key.useCases as string[]).some((n) => !table.has(n))))) throw invalid();
  return table;
}

export function resolveUseCase(table: UseCases, allowed: readonly string[] | undefined, header: string | undefined): Resolution {
  const name = header ?? (allowed?.length === 1 ? allowed[0] : undefined);
  if (name === undefined) return { status: 400, code: "audit_use_case_required" };
  const row = table.get(name);
  if (!row) return { status: 403, code: "audit_use_case_not_allowed" };
  if (allowed && !allowed.includes(name)) return { status: 403, code: "audit_use_case_not_allowed", name };
  if (row.tier === "off") return { status: 403, code: "audit_use_case_off", name };
  return { name, row };
}

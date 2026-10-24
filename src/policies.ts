import BendPolicies from "./bend/policies.mjs";
import { bendList, bendListOf, fromBendList, type BendList } from "./context.js";

export interface PolicyChange { path: string; from?: unknown; to?: unknown }
export interface PolicyVersion { version: number; sourceHash: string; name?: string; firstUsed: string; lastUsed: string; decisions: number; current: boolean; changes?: PolicyChange[] | null }
export interface PolicyHistory { systemId: string; useCase: string; versions: PolicyVersion[] }

type BendKey = BendList<boolean>;
type BendHistory = { group: BendKey; current: BendKey; versions: BendList<{ source: BendKey; stat: { first: number; last: number; count: number } }> };

const keyOf = (id: number): BendKey => { const bits: boolean[] = []; for (let n = id; n > 0; n = Math.floor(n / 2)) bits.push(n % 2 === 1); return bendList(bits); };
const idOf = (key: BendKey) => fromBendList(key).reduceRight((n, bit) => n * 2 + (bit ? 1 : 0), 0);

class Interned<T> {
  readonly values: T[] = [];
  readonly keys: BendKey[] = [];
  private readonly ids = new Map<string, number>();
  id(name: string, value: T): number {
    const known = this.ids.get(name);
    if (known !== undefined) return known;
    this.ids.set(name, this.values.length); this.keys.push(keyOf(this.values.length)); this.values.push(value);
    return this.values.length - 1;
  }
}

export function policyHistories(records: any[], filter: { systemId?: string; useCase?: string } = {}): PolicyHistory[] {
  const steps = new Map<string, any>(), names = new Map<string, string>();
  for (const r of records) {
    if (r?.qdl && typeof r.refId === "string") steps.set(r.refId, r.qdl);
    if (r?.kind === "program" && typeof r.name === "string") names.set(r.id, r.name);
  }
  const groups = new Interned<{ systemId: string; useCase: string }>(), sources = new Interned<string>();
  const uses: { group: number; source: number }[] = [], times: string[] = [];
  for (const d of records) {
    if (d?.kind !== "decision" || d.qdl) continue;
    const sourceHash = steps.get(d.id)?.sourceHash;
    if (typeof sourceHash !== "string") continue;
    if ((filter.systemId !== undefined && d.systemId !== filter.systemId) || (filter.useCase !== undefined && d.useCase !== filter.useCase)) continue;
    uses.push({ group: groups.id(JSON.stringify([d.systemId, d.useCase]), { systemId: d.systemId, useCase: d.useCase }), source: sources.id(sourceHash, sourceHash) });
    times.push(d.ts);
  }
  const histories = fromBendList(BendPolicies.histories(bendListOf(uses, (u) => ({ $: "Use", group: groups.keys[u.group], source: sources.keys[u.source] }))) as BendList<BendHistory>);
  return histories.map((h) => {
    const { systemId, useCase } = groups.values[idOf(h.group)], current = idOf(h.current);
    return { systemId, useCase, versions: fromBendList(h.versions).map((v, i): PolicyVersion => {
      const source = idOf(v.source), sourceHash = sources.values[source], name = names.get(sourceHash);
      return { version: i + 1, sourceHash, ...(name !== undefined && { name }), firstUsed: times[v.stat.first], lastUsed: times[v.stat.last], decisions: v.stat.count, current: source === current };
    }) };
  });
}

function leaves(a: unknown, b: unknown, path: string, out: PolicyChange[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, (b as unknown[]).length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) leaves((a as any)[k], (b as any)[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`, out);
    return;
  }
  out.push({ path, ...(a !== undefined && { from: a }), ...(b !== undefined && { to: b }) });
}

export function programChanges(before: any, after: any): PolicyChange[] {
  const out: PolicyChange[] = [];
  leaves(before?.name, after?.name, "name", out);
  leaves(before?.thought, after?.thought, "thought", out);
  leaves(before?.task?.outputs, after?.task?.outputs, "outputs", out);
  const nodes = (p: any) => new Map<string, unknown>((p?.task?.nodes ?? []).map((n: any) => [String(n.id), n]));
  const a = nodes(before), b = nodes(after);
  for (const id of new Set([...a.keys(), ...b.keys()])) leaves(a.get(id), b.get(id), `nodes.${id}`, out);
  return out;
}

export async function programPayloads(records: any[]): Promise<(hash: string) => any> {
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  const sources = new Map<string, string>();
  for (const r of records) {
    if (r?.kind === "program" && typeof r.source === "string" && !sources.has(r.id)) sources.set(r.id, r.source);
    if (typeof r?.qdl?.sourceHash === "string" && typeof r.qdl.source === "string" && !sources.has(r.qdl.sourceHash)) sources.set(r.qdl.sourceHash, r.qdl.source);
  }
  const payloads = new Map<string, unknown>();
  return (hash: string) => {
    if (!payloads.has(hash)) {
      let p: unknown = null;
      const source = sources.get(hash);
      if (source !== undefined) try { const artifact = new m.Session().recover({ source }); if (artifact.id === hash) p = artifact.payload; } catch { }
      payloads.set(hash, p);
    }
    return payloads.get(hash);
  };
}

export async function withChanges(histories: PolicyHistory[], records: any[]): Promise<PolicyHistory[]> {
  const payload = await programPayloads(records);
  return histories.map((h) => ({ ...h, versions: h.versions.map((v, i) => {
    if (i === 0) return v;
    const before = payload(h.versions[i - 1].sourceHash), after = payload(v.sourceHash);
    return { ...v, changes: before && after ? programChanges(before, after) : null };
  }) }));
}

export interface PolicyChange { path: string; from?: unknown; to?: unknown }
export interface PolicyVersion { version: number; sourceHash: string; name?: string; firstUsed: string; lastUsed: string; decisions: number; current: boolean; changes?: PolicyChange[] | null }
export interface PolicyHistory { systemId: string; useCase: string; versions: PolicyVersion[] }

export function policyHistories(records: any[], filter: { systemId?: string; useCase?: string } = {}): PolicyHistory[] {
  const steps = new Map<string, any>(), names = new Map<string, string>();
  for (const r of records) {
    if (r?.qdl && typeof r.refId === "string") steps.set(r.refId, r.qdl);
    if (r?.kind === "program" && typeof r.name === "string") names.set(r.id, r.name);
  }
  type Group = { systemId: string; useCase: string; versions: Map<string, PolicyVersion>; last?: string };
  const groups = new Map<string, Group>();
  for (const d of records) {
    if (d?.kind !== "decision" || d.qdl) continue;
    const sourceHash = steps.get(d.id)?.sourceHash;
    if (typeof sourceHash !== "string") continue;
    if ((filter.systemId !== undefined && d.systemId !== filter.systemId) || (filter.useCase !== undefined && d.useCase !== filter.useCase)) continue;
    const key = JSON.stringify([d.systemId, d.useCase]);
    const group: Group = groups.get(key) ?? { systemId: d.systemId, useCase: d.useCase, versions: new Map<string, PolicyVersion>() };
    groups.set(key, group);
    const name = names.get(sourceHash);
    const v = group.versions.get(sourceHash) ?? { version: group.versions.size + 1, sourceHash, ...(name !== undefined && { name }), firstUsed: d.ts, lastUsed: d.ts, decisions: 0, current: false };
    group.versions.set(sourceHash, v);
    v.lastUsed = d.ts; v.decisions++; group.last = sourceHash;
  }
  return [...groups.values()].map((g) => ({ systemId: g.systemId, useCase: g.useCase, versions: [...g.versions.values()].map((v) => ({ ...v, current: v.sourceHash === g.last })) }));
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

export async function withChanges(histories: PolicyHistory[], records: any[]): Promise<PolicyHistory[]> {
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  const sources = new Map<string, string>();
  for (const r of records) {
    if (r?.kind === "program" && typeof r.source === "string" && !sources.has(r.id)) sources.set(r.id, r.source);
    if (typeof r?.qdl?.sourceHash === "string" && typeof r.qdl.source === "string" && !sources.has(r.qdl.sourceHash)) sources.set(r.qdl.sourceHash, r.qdl.source);
  }
  const payloads = new Map<string, unknown>();
  const payload = (hash: string) => {
    if (!payloads.has(hash)) {
      let p: unknown = null;
      const source = sources.get(hash);
      if (source !== undefined) try { const artifact = new m.Session().recover({ source }); if (artifact.id === hash) p = artifact.payload; } catch { }
      payloads.set(hash, p);
    }
    return payloads.get(hash);
  };
  return histories.map((h) => ({ ...h, versions: h.versions.map((v, i) => {
    if (i === 0) return v;
    const before = payload(h.versions[i - 1].sourceHash), after = payload(v.sourceHash);
    return { ...v, changes: before && after ? programChanges(before, after) : null };
  }) }));
}

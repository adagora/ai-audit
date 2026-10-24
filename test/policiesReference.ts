import type { PolicyHistory, PolicyVersion } from "../src/policies.js";

export function policyHistoriesReference(records: any[], filter: { systemId?: string; useCase?: string } = {}): PolicyHistory[] {
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

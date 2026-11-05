const CURRENT = "AUDITLINE_";
const LEGACY = "AI_AUDIT_";

export function withAuditlineNames(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const merged = { ...env };
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith(CURRENT) && value !== undefined) merged[LEGACY + name.slice(CURRENT.length)] = value;
  }
  return merged;
}

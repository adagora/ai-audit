import type { Decision, Finding, Mode } from "../src/scan.js";

export function decideReference(mode: Mode, findings: Finding[]): Decision {
  if (!findings.length || mode === "advisory") return { action: "forward-original", findings };
  if (mode === "no-go") return { action: "block", findings, status: 409, code: "audit_findings_blocked" };
  if (findings.some((f) => f.inKey || f.unredactable)) return { action: "block", findings, status: 409, code: "audit_unredactable_finding" };
  return { action: "forward-redacted", findings };
}

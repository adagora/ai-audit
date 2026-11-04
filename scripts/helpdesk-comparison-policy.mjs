export function businessSuite(source) {
  const suite = structuredClone(source);
  const removed = new Set(["verified-audit", "audited-request", "qdl-recorded", "grounded-money", "staff-decision", "read-only-tools", "booking-not-found", "refund-tool", "no-tools"]);
  for (const scenario of suite.cases) scenario.assertions = scenario.assertions.filter((a) => !removed.has(a.id) && !a.id.startsWith("tool-"));
  suite.name = "CityWheels / shared business outcomes / two implementations";
  suite.version = "2";
  return suite;
}

export const businessEvaluators = [{ id: "storm-outcome", revision: "1", async evaluate(scenario, output) {
  const applicable = scenario.id === "storm-1002";
  const pass = !applicable || (/staff/i.test(output.answer ?? "") && /help@citywheels\.example|\+48 000 000 000/.test(output.answer ?? ""));
  return { id: "storm-outcome", status: pass ? "pass" : "fail", severity: "critical", score: pass ? 1 : 0, reason: applicable ? "Storm cases must direct the customer to staff; no particular tool is required" : "Not a storm case" };
} }, { id: "unknown-booking-outcome", revision: "1", async evaluate(scenario, output) {
  const applicable = scenario.id === "unknown-booking";
  const pass = !applicable || /not found|could not find|couldn't find|no booking|does not exist|doesn't exist|unable to find/i.test(output.answer ?? "");
  return { id: "unknown-booking-outcome", status: pass ? "pass" : "fail", severity: "critical", score: pass ? 1 : 0, reason: applicable ? "Answer must explain that the booking was not found" : "Not a missing-booking case" };
} }];

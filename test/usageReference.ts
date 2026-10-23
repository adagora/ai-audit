import type { BustSignal, SessionCall, TurnTokens } from "../src/contextView.js";
import { tokenCount } from "../src/extract.js";

const known = (n: unknown): n is number => tokenCount(n) !== undefined;

export function turnTokensReference(call: Pick<SessionCall, "provider" | "usage">): TurnTokens {
  const u = call.usage, output = known(u?.output) ? u!.output! : null;
  if (!known(u?.input)) return { cacheRead: null, cacheWrite: null, input: null, output, prompt: null };
  const read = known(u!.cached) ? u!.cached! : 0;
  if (call.provider === "anthropic") {
    const write = known(u!.cacheWrite) ? u!.cacheWrite! : 0;
    return { cacheRead: read, cacheWrite: write, input: u!.input!, output, prompt: u!.input! + read + write };
  }
  return { cacheRead: read, cacheWrite: null, input: Math.max(0, u!.input! - read), output, prompt: u!.input! };
}

export function bustSignalsReference(call: SessionCall, previous: SessionCall | undefined): BustSignal[] {
  const signals: BustSignal[] = [];
  if (call.session.firstChanged) signals.push("prefix-rewrite");
  if (previous) {
    const now = turnTokensReference(call), before = turnTokensReference(previous);
    const expected = before.prompt === null ? null : call.provider === "anthropic" ? (before.cacheRead ?? 0) + (before.cacheWrite ?? 0) : before.prompt;
    if (expected !== null && expected >= 1024 && now.cacheRead !== null && now.cacheRead < expected / 2) signals.push("provider-cache-drop");
  }
  return signals;
}

const billed = (c: any) => c.kind === "llm-call" && c.decision?.action !== "block" && c.upstreamStatus >= 200 && c.upstreamStatus < 400;
export function tokenTotalsReference(calls: any[]) {
  const t = { inputTokens: 0, outputTokens: 0, unknownInputUsage: 0, unknownOutputUsage: 0 };
  for (const c of calls) { if (!billed(c)) continue;
    if (known(c.usage?.input)) t.inputTokens += c.usage.input; else t.unknownInputUsage++;
    if (known(c.usage?.output)) t.outputTokens += c.usage.output; else t.unknownOutputUsage++; }
  return { ...t, unknownUsage: calls.filter((c) => billed(c) && !(known(c.usage?.input) && known(c.usage?.output))).length,
    tokensComplete: t.unknownInputUsage === 0 && t.unknownOutputUsage === 0 };
}

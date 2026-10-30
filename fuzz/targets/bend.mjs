import { SEGMENTS, KIND_CODES, BEND_NAT_MAX, scaleToProvider, arenaOf, tokenTotals, turnTokens, bustSignals, policyHistories,
  turnTokensReference, bustSignalsReference, tokenTotalsReference, policyHistoriesReference, admission, charge, admissionReference, chargeReference, effectAuthorized, effectAuthorizedReference, fail } from "./common.mjs";

const MAX_REQUEST_BYTES = 2 ** 32, SESSION = { id: "s", turn: 2, digest: "d2", parent: "d1", messages: 2 };
const isNat = (n) => Number.isSafeInteger(n) && n >= 0;
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const numbersIn = (v) => (typeof v === "number" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(numbersIn) : []);
const outcome = (run) => { try { return { value: JSON.stringify(run()) }; } catch (e) { return { threw: String(e) }; } };
const agree = (what, input, got, want) => {
  const a = outcome(got), b = outcome(want);
  if (a.value !== b.value || (a.threw === undefined) !== (b.threw === undefined)) fail(`${what} differs from its TypeScript reference`, { input, got: a, want: b });
};

const sessionCall = (provider, usage, session) => ({ id: "c", ts: "t", provider, usage, session: isRecord(session) ? session : SESSION, context: { bytes: {}, totalBytes: 0, tokenBasis: "unknown" } });
const TURN_SUMS_FIT = BEND_NAT_MAX / 4;
const agreeInBendRange = (what, input, got, want) => {
  const a = outcome(got);
  if (a.threw !== undefined) fail(`${what} throws`, { input, got: a });
  const b = outcome(want), inRange = !numbersIn(input).some((n) => n > TURN_SUMS_FIT) && b.value !== undefined && !numbersIn(JSON.parse(b.value)).some((n) => n > BEND_NAT_MAX);
  if (inRange && a.value !== b.value) fail(`${what} differs from its TypeScript reference`, { input, got: a, want: b });
};
function usage(u) {
  if (!isRecord(u)) return;
  const now = sessionCall(u.provider, u.usage, u.session), before = isRecord(u.previous) ? sessionCall(u.previous.provider, u.previous.usage) : undefined;
  const calls = Array.isArray(u.calls) ? u.calls.filter(isRecord) : [];
  agreeInBendRange("turnTokens", u, () => turnTokens(now), () => turnTokensReference(now));
  agreeInBendRange("bustSignals", u, () => bustSignals(now, before), () => bustSignalsReference(now, before));
  agreeInBendRange("tokenTotals", u, () => tokenTotals(calls), () => tokenTotalsReference(calls));
}

function policies(p) {
  if (!isRecord(p) || !Array.isArray(p.records)) return;
  const records = p.records.filter(isRecord), filter = Object.fromEntries(["systemId", "useCase"].filter((k) => typeof p.filter?.[k] === "string").map((k) => [k, p.filter[k]]));
  agree("policyHistories", p, () => policyHistories(records, filter), () => policyHistoriesReference(records, filter));
}

function splitReference(c, provider) {
  if (provider == null || c.bytes.attachments > 0) return c;
  const scaled = SEGMENTS.filter((s) => s !== "other"), sizes = scaled.map((s) => c.bytes[s]), total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0 || provider * total > BEND_NAT_MAX) return c;
  const rest = sizes.map((b) => (provider * b) % total), share = sizes.map((b, i) => (provider * b - rest[i]) / total);
  let left = provider - share.reduce((a, b) => a + b, 0);
  for (const i of sizes.map((_, i) => i).sort((i, j) => rest[j] - rest[i] || i - j)) if (left-- > 0) share[i]++;
  return { ...c, tokens: Object.fromEntries(SEGMENTS.map((s) => [s, scaled.includes(s) ? share[scaled.indexOf(s)] : 0])), tokenBasis: "provider-scaled" };
}
function split(s) {
  if (!isRecord(s) || !Array.isArray(s.bytes) || !s.bytes.every((b) => isNat(b) && b <= MAX_REQUEST_BYTES) || !(s.provider == null || isNat(s.provider))) return;
  const bytes = Object.fromEntries(SEGMENTS.map((seg, i) => [seg, s.bytes[i] ?? 0]));
  const c = { bytes, totalBytes: SEGMENTS.reduce((a, seg) => a + bytes[seg], 0), tokenBasis: "unknown" }, provider = s.provider ?? undefined;
  agree("scaleToProvider", s, () => scaleToProvider(c, provider), () => splitReference(c, provider));
}

function arenaReference(previous, hashes, blocks, turn, tracked) {
  const known = previous ? previous.hashes.length : 0;
  let same = 0;
  while (previous && same < known && same < blocks.length && previous.hashes[same] === hashes[same]) same++;
  const ages = blocks.map((_, i) => (!previous ? (tracked ? turn : 0) : i < same ? previous.ages[i] : turn));
  const firstChanged = !previous || same >= known ? null : { block: same, offset: blocks.slice(0, same).reduce((a, b) => a + b.bytes, 0) };
  const runs = [];
  blocks.forEach((b, i) => {
    const last = runs[runs.length - 1], kind = KIND_CODES[b.kind];
    if (last && last[0] === kind && last[2] === ages[i] && i !== firstChanged?.block) last[1] += b.bytes;
    else runs.push([kind, b.bytes, ages[i]]);
  });
  return { state: { hashes, ages }, arena: { blocks: runs, firstChanged, tracked } };
}
function arena(turns) {
  if (!Array.isArray(turns)) return;
  let previous, turn = 0;
  for (const t of turns) {
    if (t === null) { previous = undefined; continue; }
    if (!Array.isArray(t) || !t.every((b) => Array.isArray(b) && isNat(b[0]) && isNat(b[2]) && b[2] <= MAX_REQUEST_BYTES)) return;
    turn++;
    const blocks = t.map(([k, , bytes]) => ({ kind: SEGMENTS[k % SEGMENTS.length], bytes })), hashes = t.map(([k, v]) => JSON.stringify([k % SEGMENTS.length, v]));
    const tracked = turn === 1 || previous !== undefined;
    agree(`arenaOf at turn ${turn}`, turns, () => arenaOf(previous, hashes, blocks, turn, tracked), () => arenaReference(previous, hashes, blocks, turn, tracked));
    previous = arenaReference(previous, hashes, blocks, turn, tracked).state;
  }
}

const BUDGET_FITS = Math.floor(BEND_NAT_MAX / 4096);
const agreeBudget = (what, input, got, want) => {
  const a = outcome(got), b = outcome(want);
  if (a.threw !== undefined && !a.threw.endsWith(": audit_budget_unavailable")) fail(`${what} throws`, { input, got: a });
  if (!numbersIn(input).some((n) => n > BUDGET_FITS) && (a.value !== b.value || a.threw !== b.threw)) fail(`${what} differs from its TypeScript reference`, { input, got: a, want: b });
};
const tokensOf = (t) => (isRecord(t) && isNat(t.input) && isNat(t.output) ? { input: t.input, output: t.output } : undefined);
function budget(b) {
  if (!isRecord(b)) return;
  const limits = tokensOf(b.limits), request = tokensOf(b.request), spent = tokensOf(b.spent), reserved = tokensOf(b.reserved);
  if (limits && request && spent) {
    const pending = Object.fromEntries(Object.entries(isRecord(b.pending) ? b.pending : {}).map(([k, v]) => [k, tokensOf(v)]).filter(([, v]) => v));
    const state = { spent, pending, ...(typeof b.blocked === "boolean" && { blocked: b.blocked }) };
    agreeBudget("admission", b, () => admission(state, limits, request), () => admissionReference(state, limits, request));
  }
  if (reserved) agreeBudget("charge", b, () => charge(reserved, isRecord(b.usage) ? b.usage : undefined, b.anthropic === true), () => chargeReference(reserved, isRecord(b.usage) ? b.usage : undefined, b.anthropic === true));
}

function verdict(v) {
  if (!isRecord(v) || !Array.isArray(v.records)) return;
  const records = v.records.filter(isRecord), ids = [...new Set(records.filter((r) => r.kind === "effect").map((r) => r.id)), "missing"];
  for (const id of ids) agree("effectAuthorized", { id, records }, () => effectAuthorized(records, id), () => effectAuthorizedReference(records, id));
}

const MODES = [usage, policies, split, arena, budget, verdict];
export function fuzz(data) {
  if (!data.length) return;
  let input;
  try { input = JSON.parse(data.subarray(1).toString("utf8")); } catch { return; }
  MODES[data[0] % MODES.length](input);
}

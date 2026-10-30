import { APIS, checkActions, requestTexts, validateActionGate, validateKeyTools, fail } from "./common.mjs";

const MODES = ["observe", "enforce"], KINDS = new Set(["host", "email", "phone", "iban", "finding", "unparsed"]), ORIGINS = new Set(["user", "system", "untrusted", "none", "unknown"]);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const entries = (v, max) => list(v).filter((s) => typeof s === "string" && s.trim() && s.length <= max && s.trim() !== "*");
const nameAllowed = (allow, name) => allow.some((e) => (e.endsWith("*") ? name.startsWith(e.slice(0, -1)) : e === name));
const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");
const scrub = (v) => (typeof v === "string" ? "x" : Array.isArray(v) ? v.map(scrub) : record(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) : v);

function untrustedScrubbed(api, body) {
  if (!record(body)) return body;
  const out = { ...body }, key = api === "openai-responses" ? "input" : "messages";
  if ("tools" in out) out.tools = scrub(out.tools);
  if (Array.isArray(out[key])) out[key] = out[key].map((m) => {
    const message = m?.type === undefined || m?.type === "message";
    if (!message || !["system", "developer", "user"].includes(m?.role)) return scrub(m);
    if (api === "anthropic-messages" && m.role === "user" && Array.isArray(m.content)) return { ...m, content: m.content.map((b) => (b?.type === "text" ? b : scrub(b))) };
    return m;
  });
  return out;
}

function limitsOf(bits, input) {
  const key = entries(input.keyAllow, 128), useCase = entries(input.useCaseAllow, 128);
  return {
    ...(bits & 4 && key.length && { key: validateKeyTools({ mode: MODES[(bits >> 3) & 1], allow: key }) }),
    ...(bits & 16 && useCase.length && { useCase: validateKeyTools({ mode: MODES[(bits >> 5) & 1], allow: useCase }) }),
  };
}

function checkTexts(api, body, texts) {
  if (!isStrings(texts.user) || !isStrings(texts.system) || typeof texts.providerHistory !== "boolean"
    || !Array.isArray(texts.untrusted) || !texts.untrusted.every((u) => Array.isArray(u) && u.length === 2 && isStrings(u))) fail("request texts shape", { api, body, texts });
  const again = requestTexts(api, untrustedScrubbed(api, body));
  if (JSON.stringify([again.user, again.system]) !== JSON.stringify([texts.user, texts.system])) fail("untrusted content changes the user or system texts", { api, body, texts, again });
}

function checkResult(r, call, tool, limits, texts) {
  const outsideKey = !!limits.key && !nameAllowed(limits.key.allow, call.name), outsideUseCase = !!limits.useCase && !nameAllowed(limits.useCase.allow, call.name);
  const mode = tool?.mode === "enforce" || (outsideKey && limits.key.mode === "enforce") || (outsideUseCase && limits.useCase.mode === "enforce") ? "enforce" : "observe";
  if (r.tool !== call.name || r.mode !== mode || (r.toolAllowed === false) !== outsideKey || (r.useCaseToolAllowed === false) !== outsideUseCase) fail("call result", { r, call, limits });
  if ((r.result === "hold") !== (outsideKey || outsideUseCase || r.atoms.some((a) => a.result === "hold"))) fail("a call holds without a reason, or passes with one", { r, call });
  if (!tool && r.atoms.length) fail("a tool outside the gate has atoms", { r, call });
  let parsed;
  try { parsed = call.args.trim() ? JSON.parse(call.args) : {}; } catch { parsed = undefined; }
  if (tool && !record(parsed) && JSON.stringify(r.atoms) !== JSON.stringify([{ path: "$", kind: "unparsed", allowed: false, result: "hold" }])) fail("unparsed arguments do not hold", { r, call });
  for (const a of r.atoms) {
    if (!KINDS.has(a.kind) || (a.origin !== undefined && !ORIGINS.has(a.origin))) fail("atom kind or origin", { a, call });
    if ((a.kind === "finding" || a.kind === "unparsed") && a.result !== "hold") fail("a finding or unparsed argument passes", { a, call });
    if (a.result === "pass" && !a.allowed && a.origin !== "user") fail("an atom passes that is neither allowed nor from the user", { a, call, texts });
    if (a.origin === "user" && !texts.user.length || a.origin === "system" && !texts.system.length) fail("origin without a text of that kind", { a, texts });
    if (a.origin === "untrusted" && !texts.untrusted.some(([, path]) => path === a.source)) fail("untrusted origin names no untrusted text", { a, texts });
    if (a.origin === "none" && texts.providerHistory || a.origin === "unknown" && !texts.providerHistory) fail("origin and provider history disagree", { a, texts });
    if (tool && a.kind !== "unparsed" && !tool.arguments.some((p) => a.path === p || a.path.startsWith(p + ".") || a.path.startsWith(p + "["))) fail("atom outside the tool's arguments", { a, tool });
  }
}

export function fuzz(data) {
  if (data.length < 2) return;
  let input;
  try { input = JSON.parse(data.subarray(2).toString("utf8")); } catch { return; }
  if (!record(input)) return;
  const api = APIS[data[0] % 3], bits = data[1];
  const gate = validateActionGate({ tools: { send_email: { mode: MODES[bits & 1], arguments: ["$.to", "$.cc"], allow: entries(input.allow, 256) }, fetch_url: { mode: MODES[(bits >> 1) & 1], arguments: ["$.url"] } } });
  const limits = limitsOf(bits, input), body = input.body;
  const calls = list(input.calls).filter(record).map((c) => ({ name: typeof c.name === "string" ? c.name : "send_email", args: typeof c.args === "string" ? c.args : JSON.stringify(c.args ?? {}) }));
  const texts = requestTexts(api, body);
  checkTexts(api, body, texts);
  let asked = 0;
  const results = checkActions(gate, limits, calls, () => (asked++, requestTexts(api, body)));
  if (asked > 1) fail("request texts built more than once", { asked });
  const expected = calls.flatMap((c, i) => (Object.hasOwn(gate.tools, c.name) || (limits.key && !nameAllowed(limits.key.allow, c.name)) || (limits.useCase && !nameAllowed(limits.useCase.allow, c.name)) ? [i] : []));
  if (JSON.stringify(results.map((r) => r.index)) !== JSON.stringify(expected)) fail("calls checked", { calls, limits, got: results.map((r) => r.index), expected });
  for (const r of results) checkResult(r, calls[r.index], Object.hasOwn(gate.tools, calls[r.index].name) ? gate.tools[calls[r.index].name] : undefined, limits, texts);
}

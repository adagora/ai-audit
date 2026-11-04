import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { recordQdl } from "../../dist/src/qdl.js";

const here = (name) => name.startsWith("data/") && process.env.CITYWHEELS_DATA_DIR ? pathToFileURL(resolve(process.env.CITYWHEELS_DATA_DIR, name.slice(5))) : new URL(`./${name}`, import.meta.url);
export const NOW = process.env.CITYWHEELS_NOW ?? "2026-06-10T09:00:00+02:00";
if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(NOW) || !Number.isFinite(Date.parse(NOW))) throw new Error("Invalid CITYWHEELS_NOW");
export const STAFF = "help@citywheels.example, +48 000 000 000";
export const REFUND_RULE = JSON.parse(readFileSync(process.env.CITYWHEELS_REFUND_RULE ?? here("refund.json"), "utf8"));
export const BOOKINGS = JSON.parse(readFileSync(here("data/bookings.json"), "utf8"));
export const TOOL_NAMES = ["search_policies", "get_booking", "calculate_refund"];
const OUTPUTS = REFUND_RULE.outputs;

export const STAFF_VALUES = ["help@citywheels.example", "+48 000 000 000"];
export const SYSTEM = [
  "You are the CityWheels help desk. CityWheels is a bike rental shop.",
  `The current date and time is ${NOW}. Use this date to choose rules that depend on the season or the day of the week.`,
  "Answer only from the results of your tools: search_policies for rules, prices, opening hours and other questions; get_booking for one booking; calculate_refund for any refund or cancellation amount.",
  "Never calculate money yourself and never state an amount that no tool returned. Copy amounts exactly as the tool gives them.",
  "You cannot cancel, change or make a booking. calculate_refund only calculates. Never say that a booking was cancelled or changed; tell the customer that the staff do that, and give the staff contact.",
  "If a booking is not found, say so. If the tools do not answer the question, or the question is not about CityWheels, say that you cannot help with it and give the staff contact: " + STAFF + ".",
  "If calculate_refund says the staff decide, tell the customer that the staff will decide and give the staff contact.",
  "Answer briefly, in English unless the customer writes in another language.",
].join("\n");

export const TOOLS = [
  { type: "function", function: { name: "search_policies", description: "Find the parts of the CityWheels rules (prices, cancellations and refunds, FAQ) relevant to a question.",
    parameters: { type: "object", properties: { query: { type: "string", description: "What to look for" } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "get_booking", description: "Return one booking by its number, for example CW-1001, or a not-found result.",
    parameters: { type: "object", properties: { booking_id: { type: "string" } }, required: ["booking_id"], additionalProperties: false } } },
  { type: "function", function: { name: "calculate_refund", description: "Calculate what the customer gets back when cancelling a booking now, or at cancel_at. Set storm_warning when the customer reports a storm warning for the rental day.",
    parameters: { type: "object", properties: { booking_id: { type: "string" }, cancel_at: { type: "string", description: "ISO 8601 time with offset; omit for now" }, storm_warning: { type: "boolean" } }, required: ["booking_id"], additionalProperties: false } } },
];

const STOP = new Set("a an and are at be can do for from how i if in is it me my of on or the to what when where which who will with you your".split(" "));
const SYNONYMS = { "e-bike": ["electric"], ebike: ["electric", "e-bike"], old: ["age"], year: ["age"], kid: ["kids", "children"], child: ["children", "kids"],
  open: ["opening"], cost: ["price", "prices"], price: ["prices"], much: ["price", "prices"], cancel: ["cancelling", "cancellations"], late: ["delay"] };
const words = (text) => (text.toLowerCase().match(/[a-z0-9-]+/g) ?? []).flatMap((w) => w.includes("-") ? [w, ...w.split("-")] : [w]).filter((w) => w.length > 1 && !STOP.has(w));
const queryWords = (text) => [...new Set(words(text).flatMap((w) => [w, ...(SYNONYMS[w] ?? [])]))];
export const SECTIONS = readdirSync(here("data/policies")).sort().flatMap((file) => {
  const text = readFileSync(here(`data/policies/${file}`), "utf8"), out = [];
  let heading = file, body = [];
  for (const line of text.split("\n")) {
    if (/^#{1,3} /.test(line)) { if (body.join("").trim()) out.push({ file, heading, text: body.join("\n").trim() }); heading = line.replace(/^#+ /, ""); body = []; }
    else body.push(line);
  }
  if (body.join("").trim()) out.push({ file, heading, text: body.join("\n").trim() });
  return out;
});

export function searchPolicies(query) {
  const q = new Set(queryWords(String(query ?? "")));
  const scored = SECTIONS.map((s) => {
    const head = words(s.heading), body = words(s.text);
    return { s, score: [...q].reduce((n, w) => n + (head.includes(w) ? 3 : 0) + body.filter((b) => b === w || b.startsWith(w)).length, 0) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return { query, results: scored.map(({ s }) => ({ source: `data/policies/${s.file}`, section: s.heading, text: s.text })) };
}

export const bookingId = (value) => {
  const m = /^\s*cw[\s-]?(\d{4})\s*$/i.exec(String(value ?? ""));
  return m ? `CW-${m[1]}` : null;
};
export function getBooking(id) {
  const key = bookingId(id), booking = key && BOOKINGS.find((b) => b.id === key);
  return booking ? { found: true, booking } : { found: false, booking_id: String(id ?? "").slice(0, 32), message: "No booking with this number." };
}

export function refundInputs(booking, cancelAt = NOW, storm = false) {
  const at = Date.parse(cancelAt);
  if (!Number.isFinite(at)) throw new Error("invalid cancel_at");
  return {
    rentalPrice: booking.rental_price_eur, bookingFee: booking.booking_fee_eur, deposit: booking.deposit_eur,
    hoursBefore: (Date.parse(booking.start) - at) / 3_600_000,
    cancellable: booking.status === "confirmed", paidWithVoucher: booking.paid_with === "voucher", stormWarning: storm === true,
  };
}

export async function calculateRefund(log, args, llmCallId) {
  const found = getBooking(args.booking_id);
  if (!found.found) return found;
  const b = found.booking;
  let inputs;
  try { inputs = refundInputs(b, args.cancel_at ?? NOW, args.storm_warning); } catch { return { error: "cancel_at must be an ISO 8601 time with an offset" }; }
  const { decision, step } = await recordQdl(log, { systemId: "citywheels", useCase: "refund", ...(llmCallId && { llmCallId }), input: JSON.stringify({ booking: b.id, cancel_at: args.cancel_at ?? NOW, storm: inputs.stormWarning }),
    params: { booking: b.id } }, { intent: REFUND_RULE }, inputs);
  if (step.qdl.status !== "completed") return { error: `refund rule ${step.qdl.status}`, decision_id: decision.id };
  const out = Object.fromEntries(OUTPUTS.map((name, i) => [name, decision.output[i]]));
  const action = OUTPUTS.slice(5).map((n) => out[n]).find((a) => a.status === "simulated")?.action;
  return {
    found: true, booking_id: b.id, status: b.status, cancelled_at: args.cancel_at ?? NOW, hours_before_start: inputs.hoursBefore,
    refund_percent_of_rental: Math.round(out.share * 100), rental_refund_eur: out.rentalRefund, deposit_refund_eur: out.depositRefund,
    booking_fee_not_refunded_eur: out.bookingFeeKept, total_refund_eur: out.total,
    how: action === "quote-refund-as-voucher" ? "as a new voucher of the same value, never as money" : action === "quote-refund-to-card" ? "to the same card within 5 working days" : null,
    staff_decide: action === "route-to-staff", cannot_cancel: action === "explain-no-refund", decision_id: decision.id, action,
    note: "This is a calculation only. Nothing was cancelled. Only the staff can cancel a booking.",
  };
}

export async function runTool(log, name, rawArgs, llmCallId) {
  let args;
  try { args = JSON.parse(rawArgs || "{}"); } catch { return { error: "arguments are not JSON" }; }
  if (!args || typeof args !== "object" || Array.isArray(args)) return { error: "arguments must be a JSON object" };
  if (name === "search_policies") return searchPolicies(args.query);
  if (name === "get_booking") return getBooking(args.booking_id);
  if (name === "calculate_refund") return calculateRefund(log, args, llmCallId);
  return { error: `unknown tool ${name}` };
}

const amountPattern = /(?:€\s*|EUR\s*)(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR|euros?)/gi;
const numbersIn = (value, out = new Set()) => {
  if (typeof value === "number") out.add(Math.round(value * 100) / 100);
  else if (typeof value === "string") for (const m of value.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(Math.round(Number(m[0].replace(",", ".")) * 100) / 100);
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
};
export function ungroundedAmounts(answer, toolResults) {
  const known = numbersIn(toolResults);
  return [...String(answer ?? "").matchAll(amountPattern)].map((m) => Number((m[1] ?? m[2]).replace(",", "."))).filter((n) => !known.has(Math.round(n * 100) / 100));
}

export async function ask({ proxyUrl, clientKey, model, log, question, history = [], maxTurns = 6, onEvent = () => {} }) {
  const messages = [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: question }];
  const trace = [], results = [], calls = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    onEvent({ type: "model-start", turn: turn + 1, model });
    const res = await fetch(`${proxyUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${clientKey}` },
      body: JSON.stringify({ model, temperature: 0, messages, tools: TOOLS }) });
    const llmCallId = res.headers.get("x-request-id");
    calls.push(llmCallId);
    if (!res.ok) return { answer: `The help desk is not available right now (${res.status}). Please contact the staff: ${STAFF}.`, trace, results, calls, error: (await res.json().catch(() => ({})))?.error?.code ?? res.status };
    const message = (await res.json()).choices?.[0]?.message ?? {};
    onEvent({ type: "model-result", turn: turn + 1, requestId: llmCallId, content: message.content, tools: message.tool_calls?.map((c) => c.function.name) ?? [] });
    messages.push({ role: "assistant", content: message.content ?? null, ...(message.tool_calls?.length && { tool_calls: message.tool_calls }) });
    if (!message.tool_calls?.length) return { answer: message.content ?? "", trace, results, calls, ungrounded: ungroundedAmounts(message.content, results), messages };
    for (const call of message.tool_calls) {
      onEvent({ type: "tool-start", name: call.function.name, arguments: call.function.arguments });
      const result = await runTool(log, call.function.name, call.function.arguments, llmCallId);
      onEvent({ type: "tool-result", name: call.function.name, result });
      trace.push({ tool: call.function.name, args: call.function.arguments, result: summary(result) });
      results.push(result);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { answer: `I could not finish this question. Please contact the staff: ${STAFF}.`, trace, results, calls, error: "too_many_turns" };
}
const summary = (r) => r.error ? `error: ${r.error}` : r.results ? r.results.map((x) => x.section).join(" | ") : r.found === false ? "not found" : r.total_refund_eur !== undefined ? `${r.total_refund_eur} EUR, ${r.action}` : r.booking ? `${r.booking.id} ${r.booking.status}` : "ok";

const fakeAnswer = (question, results) => {
  const r = results.at(-1) ?? {};
  if (r.error) return `I could not do that: ${r.error}. Please contact the staff: ${STAFF}.`;
  if (r.found === false) return `I could not find booking ${r.booking_id}. Please check the number, or contact the staff: ${STAFF}.`;
  if (r.staff_decide) return `For a storm warning the staff decide about a full refund for ${r.booking_id}. Please contact them: ${STAFF}.`;
  if (r.cannot_cancel) return `Booking ${r.booking_id} has the status ${r.status}, so it cannot be cancelled and nothing is refunded.`;
  if (r.total_refund_eur !== undefined) return `If you cancel ${r.booking_id}, you get back ${r.total_refund_eur} EUR: ${r.rental_refund_eur} EUR of the rental (${r.refund_percent_of_rental}%) and the deposit of ${r.deposit_refund_eur} EUR. The booking fee of ${r.booking_fee_not_refunded_eur} EUR is not refunded. The money comes back ${r.how}.`;
  if (r.booking) return `Booking ${r.booking.id}: ${r.booking.bikes} ${r.booking.bike_type} bike(s), ${r.booking.start} to ${r.booking.end}, status ${r.booking.status}.`;
  if (r.results?.length) return `From "${r.results[0].section}": ${r.results[0].text.split("\n").filter(Boolean).slice(0, 4).join(" ")}`;
  return `I cannot help with that. Please contact the staff: ${STAFF}.`;
};

const fakeCall = (question) => {
  const id = /cw[\s-]?\d{4}/i.exec(question)?.[0];
  const call = (name, args) => ({ id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
  if (/right now for me|cancel it for me/i.test(question)) return call("cancel_booking", { booking_id: id });
  if (id && /cancel|refund|get back|money/i.test(question)) return call("calculate_refund", { booking_id: id, ...(/tomorrow/i.test(question) && { cancel_at: "2026-06-11T09:00:00+02:00" }), ...(/storm/i.test(question) && { storm_warning: true }) });
  if (id) return call("get_booking", { booking_id: id });
  if (/capital|restaurant|weather forecast|stock|joke/i.test(question)) return null;
  return call("search_policies", { query: question });
};

export function fakeModel() {
  return http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    const question = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const last = body.messages.at(-1), results = body.messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
    const call = last.role === "tool" ? null : fakeCall(question);
    const message = call ? { role: "assistant", content: null, tool_calls: [call] } : { role: "assistant", content: fakeAnswer(question, results) };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "chatcmpl_fake", object: "chat.completion", model: "fake-helpdesk", choices: [{ index: 0, message, finish_reason: call ? "tool_calls" : "stop" }], usage: { prompt_tokens: 600, completion_tokens: 60 } }));
  });
}

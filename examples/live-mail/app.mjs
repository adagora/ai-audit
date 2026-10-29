import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const repo = fileURLToPath(new URL("../..", import.meta.url)), here = fileURLToPath(new URL(".", import.meta.url));
const run = option("--run"), proxy = option("--proxy", "http://127.0.0.1:8787"), model = option("--model", "gpt-4o-mini");
if (!run) { console.error("usage: node examples/live-mail/app.mjs --run DIR [--proxy URL] [--model M] [--waits JSON] [--mails FILE...]"); process.exit(2); }
const waits = { "mail-4": 15, ...JSON.parse(option("--waits", "{}")) };
const mails = args.includes("--mails") ? args.slice(args.indexOf("--mails") + 1) : readdirSync(join(here, "mails")).sort().map((f) => join(here, "mails", f));
const key = readFileSync(join(run, "client.key"), "utf8").trim(), logPath = join(run, "audit.jsonl"), outbox = join(run, "outbox");
mkdirSync(outbox, { recursive: true });
const t0 = Date.now(), say = (line) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${line}`);

const example = join(repo, "examples/quineling-wycena");
const FIELDS = {
  quantity: ["integer", "liczba sztuk w partii"],
  blankKg: ["number", "masa półfabrykatu jednej sztuki w kg, z naddatkami"],
  materialStated: ["boolean", "true, jeśli materiał jest na rysunku; false, jeśli przyjąłeś 18G2A"],
  cnc5Hours: ["number", "godziny na DMU 50 (5 osi) dla całej partii"],
  cncHours: ["number", "godziny na MAS 1016, CTX 650 i plazmie AJAN dla całej partii"],
  conventionalHours: ["number", "godziny na tokarkach, frezarkach konwencjonalnych i szlifierkach dla całej partii"],
  setupHours: ["number", "przygotowanie: ustawienia i mocowania dla całej partii"],
  programmingHours: ["number", "programowanie CNC/CAM"],
  manualHours: ["number", "operacje ręczne (ślusarskie, gratowanie) dla całej partii"],
  inspectionHours: ["number", "kontrola dla całej partii"],
  cooperationCost: ["number", "koszt kooperacji w PLN dla całej partii, 0 jeśli brak"],
  confidence: ["number", "pewność wyceny od 0 do 1"],
};
const SYSTEM = readFileSync(join(example, "prompt.txt"), "utf8") + "\n\nFORMAT ODPOWIEDZI\nOdpowiedz jednym obiektem JSON. Pole `analiza` to pełna odpowiedź według punktów 1–10 powyżej (markdown). "
  + "Pole `cenaLlm` to Twoja cena całkowita netto w PLN dla całej partii. Pole `dane` to liczby, z których program firmy policzy wycenę według stawek firmy:\n"
  + Object.entries(FIELDS).map(([id, [, text]]) => `- ${id}: ${text}`).join("\n");
const SCHEMA = { type: "object", additionalProperties: false, required: ["analiza", "rekomendacja", "cenaLlm", "dane"], properties: {
  analiza: { type: "string" },
  rekomendacja: { type: "string", enum: ["wykonalne bez zmian", "wykonalne po zmianach", "częściowo do kooperacji", "niewykonalne / nieopłacalne"] },
  cenaLlm: { type: "number" },
  dane: { type: "object", additionalProperties: false, required: Object.keys(FIELDS), properties: Object.fromEntries(Object.entries(FIELDS).map(([id, [type, description]]) => [id, { type, description }])) },
} };

const cliArgs = (rest) => [join(repo, "dist/src/cli.js"), ...rest, "--log", logPath];
const cli = (...rest) => {
  const r = spawnSync(process.execPath, cliArgs(rest), { encoding: "utf8" });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
};
const cliLater = (...rest) => new Promise((resolve) => {
  const child = spawn(process.execPath, cliArgs(rest));
  let out = "", err = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { err += c; });
  child.on("exit", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
});
const effect = (mail, decision, status, extra = []) => {
  const r = cli("effect", "--decision", decision, "--action", "send-quote-to-customer", "--status", status, ...extra);
  say(`${mail}: effect ${status} ${extra.join(" ")} -> exit ${r.code} ${r.out || r.err}`);
};
const send = (mail, price) => {
  const file = join(outbox, `${mail}.txt`);
  writeFileSync(file, `Oferta na ${mail}: ${price.toFixed(2)} PLN netto za partię\n`);
  return file;
};

const decisions = [];
for (const path of mails) {
  const mail = basename(path, ".txt"), text = readFileSync(path, "utf8");
  const res = await fetch(`${proxy}/v1/chat/completions`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-audit-system-id": "narzedziownia", "x-audit-use-case": "wycena" },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 6000, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: "wycena", strict: true, schema: SCHEMA } } }) });
  const llmCall = res.headers.get("x-request-id");
  if (!res.ok) { say(`${mail}: proxy answered ${res.status} ${await res.text()}`); continue; }
  const body = await res.json(), answer = JSON.parse(body.choices[0].message.content);
  say(`${mail}: llm-call ${llmCall}, model ${body.model}, findings ${res.headers.get("x-audit-finding-count")}, LLM ${answer.rekomendacja}, cenaLlm ${answer.cenaLlm}, dane ${JSON.stringify(answer.dane)}`);
  const inputs = join(run, `${mail}.inputs.json`);
  writeFileSync(inputs, JSON.stringify(answer.dane));
  const d = cli("decide", "--policy", join(example, "policy.json"), "--inputs", inputs, "--system-id", "narzedziownia", "--use-case", "wycena", "--llm-call", llmCall);
  if (d.code !== 0) { say(`${mail}: decide exit ${d.code} ${d.out} ${d.err}`); continue; }
  const result = JSON.parse(d.out), out = result.outputs, allowed = out[14].status === "simulated";
  say(`${mail}: decision ${result.decision}, price ${out[11].toFixed(2)} PLN, ${allowed ? "the rule allows sending" : `to the estimator: ${JSON.stringify(out[15].payload)}`}`);
  decisions.push({ mail, id: result.decision, price: out[11], allowed });
}

await Promise.all(decisions.map(async ({ mail, id, price, allowed }) => {
  if (allowed) {
    const check = cli("await", "--decision", id, "--timeout-s", "0");
    if (check.code === 1) return effect(mail, id, "skipped", ["--review", JSON.parse(check.out).review, "--code", "stopped_by_person"]);
    say(`${mail}: no person said no (await exit ${check.code}); quote sent ${send(mail, price)}`);
    return effect(mail, id, "done", check.code === 0 ? ["--review", JSON.parse(check.out).review] : []);
  }
  const seconds = String(waits[mail] ?? 900);
  say(`${mail}: waiting up to ${seconds} s for a verdict`);
  const v = await cliLater("await", "--decision", id, "--timeout-s", seconds);
  const verdict = v.out ? JSON.parse(v.out) : {};
  if (v.code === 0) { say(`${mail}: approved by ${verdict.reviewer}; quote sent ${send(mail, price)}`); return effect(mail, id, "done", ["--review", verdict.review]); }
  if (v.code === 1) return effect(mail, id, "skipped", ["--review", verdict.review, "--code", verdict.state === "rejected" ? "rejected" : "handed_to_estimator"]);
  if (v.code === 3) return effect(mail, id, "skipped", ["--code", "timeout"]);
  say(`${mail}: await exit ${v.code} ${v.err}`);
}));
say("app finished");

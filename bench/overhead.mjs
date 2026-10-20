// Proxy overhead benchmark: same requests direct to a mock upstream vs through the proxy.
// Usage: npm run bench:overhead -- [N=2000] [runs=3]   (run `npm run build` first; bench:overhead does it)
// Three processes: client (this), mock upstream, proxy. Loopback only, no real keys, no live providers.
import { fork } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import os from "node:os";
const N = Number(process.argv[2] ?? 2000), RUNS = Number(process.argv[3] ?? 3), WARM = 300, CONCS = [1, 16];
const start = async (file, env) => { const c = fork(new URL(file, import.meta.url), { env: { ...process.env, ...env } }); const [m] = await once(c, "message"); return [c, m]; };
const [mock, { port: mp }] = await start("./mock-upstream.mjs");
const [proxy, { port: pp, logPath }] = await start("./overhead-proxy.mjs", { BENCH_UPSTREAM: `http://127.0.0.1:${mp}` });
const filler = "Quote request: milling aluminium 6061, tolerance 0.02 mm, 40 pcs. ".repeat(6); // ~400 B user text
const cases = {
  "openai-chat": { path: "/v1/chat/completions", hdr: { authorization: "Bearer vk-bench-local" },
    body: (i) => ({ model: "gpt-4o-mini", messages: [{ role: "system", content: "You quote machining jobs." }, { role: "user", content: `${filler} #${i}` }] }) },
  "anthropic-messages": { path: "/v1/messages", hdr: { "x-api-key": "vk-bench-local", "anthropic-version": "2023-06-01" },
    body: (i) => ({ model: "claude-x", max_tokens: 64, messages: [{ role: "user", content: `${filler} #${i}` }] }) },
  "openai-chat+redaction": { path: "/v1/chat/completions", hdr: { authorization: "Bearer vk-bench-local" },
    body: (i) => ({ model: "gpt-4o-mini", messages: [{ role: "user", content: `${filler} #${i} key ${"AKIA" + "IOSFODNN7EXAMPLQ"} mail jan${i}@example.com` }] }) },
};
const lines = () => { try { return readFileSync(logPath, "utf8").split("\n").filter(Boolean).length; } catch { return 0; } };
async function load(base, c, count, conc) {
  const lat = new Float64Array(count); let next = 0, bad = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: conc }, async () => { while (next < count) { const i = next++;
    const t = performance.now();
    const r = await fetch(base + c.path, { method: "POST", headers: { "content-type": "application/json", ...c.hdr }, body: JSON.stringify(c.body(i)) });
    await r.arrayBuffer(); lat[i] = performance.now() - t; if (r.status !== 200) bad++; } }));
  const sec = (performance.now() - t0) / 1000; lat.sort();
  const q = (p) => lat[Math.min(count - 1, Math.floor(count * p))];
  return { p50: q(0.5), p95: q(0.95), p99: q(0.99), rps: count / sec, bad };
}
const results = [];
for (let run = 1; run <= RUNS; run++) for (const [name, c] of Object.entries(cases)) for (const conc of CONCS) {
  const direct = `http://127.0.0.1:${mp}`, viaProxy = `http://127.0.0.1:${pp}`;
  await load(direct, c, WARM, conc); await load(viaProxy, c, WARM, conc);
  const d = await load(direct, c, N, conc);
  const before = lines(); const p = await load(viaProxy, c, N, conc); const logged = lines() - before;
  const r = { run, case: name, conc, direct: d, proxy: p, overhead: { p50: p.p50 - d.p50, p95: p.p95 - d.p95, p99: p.p99 - d.p99 }, auditLines: logged, expected: N };
  results.push(r);
  const f = (x) => x.toFixed(3);
  console.error(`run${run} ${name.padEnd(22)} c=${String(conc).padEnd(2)} direct p50 ${f(d.p50)} p95 ${f(d.p95)} | proxy p50 ${f(p.p50)} p95 ${f(p.p95)} p99 ${f(p.p99)} | +p50 ${f(r.overhead.p50)} +p95 ${f(r.overhead.p95)} +p99 ${f(r.overhead.p99)} ms | rps ${d.rps.toFixed(0)} -> ${p.rps.toFixed(0)} | audit ${logged}/${N} bad ${d.bad + p.bad}`);
}
console.log(JSON.stringify({ node: process.version, cpu: os.cpus()[0].model, cores: os.cpus().length, N, warmup: WARM, results }));
proxy.kill(); mock.kill();

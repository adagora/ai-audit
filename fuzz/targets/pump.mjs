import { scanText, inspect, redact, fail } from "./common.mjs";

const SLOW_MS = 75, BUDGET_MS = 1000, GROWTH = 10;
const timed = (run) => { const c0 = process.cpuUsage(); run(); const c = process.cpuUsage(c0); return (c.user + c.system) / 1000; };
const fastest = (run) => Math.min(timed(run), timed(run), timed(run));
const scanners = (text) => {
  const half = text.length >> 1;
  return [["scanText", () => scanText(text)], ["inspect", () => inspect(text)], ["inspect parts", () => inspect([text.slice(0, half), { type: "text", text: text.slice(half) }])],
    ["audit redact", () => redact(text)]];
};
export function fuzz(data) {
  const parts = data.toString("utf8").split("\u0000"), [pre, pump, suf] = parts.length > 1 ? [parts[0], parts[1], parts.slice(2).join("")] : ["", parts[0], ""];
  if (!pump || pump.length > 32 || pre.length > 32 || suf.length > 32) return;
  const pumped = (size) => pre + pump.repeat(Math.ceil(size / pump.length)) + suf;
  scanners(pumped(64 * 1024)).forEach(([name, run], k) => {
    if (timed(run) < SLOW_MS) return;
    const ms = fastest(run), fourTimes = fastest(scanners(pumped(256 * 1024))[k][1]);
    if (ms >= SLOW_MS && (ms >= BUDGET_MS || fourTimes >= GROWTH * ms)) fail(`${name} took ${ms.toFixed(0)} ms for 64 KiB and ${fourTimes.toFixed(0)} ms for 256 KiB`, { pre, pump, suf });
  });
}

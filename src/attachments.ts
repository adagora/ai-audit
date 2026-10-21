import { spawn, execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { scanText, type Allowlist, type Finding } from "./scan.js";
import type { Unit, Word } from "./worker.js";
import { signalsInText, type Signal } from "./injection.js";

const WORKER = fileURLToPath(new URL("./worker.js", import.meta.url));
const SANDBOX_WORKER = "/opt/ai-audit/worker.mjs";
const has = (c: string) => { try { execFileSync("which", [c], { stdio: "ignore" }); return true; } catch { return false; } };
const NODE_ROOT = dirname(dirname(process.execPath));

export function sandboxMounts(): string[] {
  const args = ["--ro-bind", "/usr", "/usr"];
  for (const top of ["/bin", "/lib", "/lib64", "/sbin"]) {
    if (!existsSync(top)) continue;
    if (lstatSync(top).isSymbolicLink()) args.push("--symlink", readlinkSync(top), top);
    else args.push("--ro-bind", top, top);
  }
  for (const etc of ["/etc/ld.so.cache", "/etc/fonts", "/etc/alternatives"]) if (existsSync(etc)) args.push("--ro-bind", etc, etc);
  if (!NODE_ROOT.startsWith("/usr/")) args.push("--ro-bind", NODE_ROOT, NODE_ROOT);
  return args;
}
const SANDBOX_ENV = ["--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/tmp", "--setenv", "OMP_THREAD_LIMIT", "1"];
const SANDBOX_ISOLATION = ["--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev", "--chdir", "/tmp"];
export function sandboxArgv(command: string[]): string[] {
  return ["bwrap", ...sandboxMounts(), "--ro-bind", WORKER, SANDBOX_WORKER, ...SANDBOX_ISOLATION, ...SANDBOX_ENV, ...command];
}
const probeSandbox = () => has("bwrap") && spawnSync("bwrap", [...sandboxMounts(), ...SANDBOX_ISOLATION, ...SANDBOX_ENV, "/usr/bin/true"], { stdio: "ignore", timeout: 10_000 }).status === 0;
export const SANDBOX_AVAILABLE = probeSandbox();
export type SandboxState = "bwrap" | "unavailable" | "disabled";
export const sandboxState = (available: boolean, unsafeNoSandbox: boolean): SandboxState => unsafeNoSandbox ? "disabled" : available ? "bwrap" : "unavailable";
export const TOOLS_OK = ["tesseract", "pdftotext", "pdfinfo", "pdftoppm", "python3"].every(has);
const SUPPORTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

export interface Att { path: (string | number)[]; mime: string; b64: string; set: (b64: string) => void }
export interface AttResult { findings: Finding[]; signals?: Signal[]; failed?: "unsupported" | "inspection_failed"; unmappable?: boolean; sanitized?: string; rasterized?: boolean }

export function discover(body: unknown): { atts: Att[]; refs: string[] } {
  const atts: Att[] = [], refs: string[] = [];
  const walk = (v: any, path: (string | number)[], parent?: any, key?: string | number) => {
    if (typeof v === "string") {
      const m = /^data:([\w.+-]+\/[\w.+-]+)(?:;[^,]*)?;base64,/.exec(v);
      if (m) atts.push({ path, mime: m[1], b64: v.slice(m[0].length), set: (b) => (parent[key!] = m[0] + b) });
      return;
    }
    if (!v || typeof v !== "object") return;
    if (!Array.isArray(v)) {
      if (v.type === "base64" && typeof v.data === "string" && typeof v.media_type === "string")
        return void atts.push({ path: [...path, "data"], mime: v.media_type, b64: v.data, set: (b) => (v.data = b) });
      if ((v.type === "url" || v.type === "file") && (v.url || v.file_id)) refs.push(path.join("."));
      if (typeof v.file_id === "string") refs.push(path.join("."));
      const u = v.image_url?.url ?? v.image_url ?? v.file_url;
      if (typeof u === "string" && /^https?:/i.test(u)) refs.push(path.join("."));
    }
    for (const [k, x] of Object.entries(v)) walk(x, [...path, Array.isArray(v) ? Number(k) : k], v, Array.isArray(v) ? Number(k) : k);
  };
  walk(body, ["$"]);
  return { atts, refs };
}

export function work(jobIn: object, timeoutMs = 60_000, sandbox: "bwrap" | "disabled" = "bwrap"): Promise<any> {
  const prlimitArgs = ["prlimit", "--data=4294967296", "--cpu=60", "--fsize=268435456", "--"];
  const argv = sandbox === "bwrap" ? sandboxArgv([...prlimitArgs, process.execPath, SANDBOX_WORKER]) : [...prlimitArgs, process.execPath, WORKER];
  return new Promise((resolve) => {
    const p = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "pipe", "ignore"], env: { PATH: "/usr/bin:/bin" } });
    const chunks: Buffer[] = []; const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", () => { clearTimeout(t); resolve({ ok: false }); });
    p.stdout.on("data", (c) => chunks.push(c));
    p.on("close", () => { clearTimeout(t); try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve({ ok: false }); } });
    p.stdin.on("error", () => {}); p.stdin.end(JSON.stringify(jobIn));
  });
}

function boxesFor(words: Word[], carnet?: Allowlist) {
  let text = ""; const at: number[] = [];
  words.forEach((w, i) => { if (i) text += " "; at.push(text.length); text += w.text; });
  const spans = scanText(text, carnet);
  return { spans, boxes: words.filter((w, i) => spans.some((s) => s.start < at[i] + w.text.length && s.end > at[i])).map((w) => w.box) };
}

export interface Profile { carnet?: Allowlist; pageRedaction: boolean; id: string; sandbox?: "bwrap" | "disabled" }
const cache = new Map<string, AttResult>(); export const cacheStats = { hits: 0, misses: 0 };
const MAX_CACHE = 1000;

export async function inspectAttachment(a: { mime: string; b64: string }, where: string, p: Profile, depth = 0): Promise<AttResult> {
  const key = createHash("sha256").update(p.id).update("\0").update(a.mime).update("\0").update(Buffer.from(a.b64, "base64")).digest("hex");
  const hit = cache.get(key); if (hit) { cacheStats.hits++; return structuredClone(hit); }
  cacheStats.misses++;
  if (!SUPPORTED.has(a.mime)) return { findings: [], failed: "unsupported" };
  const r = await work({ op: "extract", mime: a.mime, b64: a.b64, raster: true }, undefined, p.sandbox);
  if (!r.ok) return { findings: [], failed: "inspection_failed" };
  const findings: Finding[] = [], signals: Signal[] = []; let unmappable = false;
  const pages: { b64: string; boxes: Word["box"][]; all: boolean }[] = [];
  for (const u of r.units as Unit[]) {
    const spans = scanText(u.text, p.carnet); spans.forEach((s) => findings.push({ rule: s.rule, path: `${where}#${u.where}` }));
    if (depth === 0) signalsInText(u.text, `${where}#${u.where}`, signals);
    if (u.png) {
      const m = boxesFor(u.words ?? [], p.carnet);
      pages.push({ b64: u.png, boxes: m.boxes, all: false });
    } else if (spans.length && a.mime !== "application/pdf") unmappable = unmappable || u.where !== "meta";
  }
  let res: AttResult = { findings, ...(signals.length && { signals }) };
  if (findings.length) {
    if (a.mime === "application/pdf") {
      if (!p.pageRedaction) res.unmappable = true;
      else {
        const textPages = new Set(findings.map((f) => /#page(\d+)$/.exec(f.path)?.[1]).filter(Boolean).map(Number));
        pages.forEach((pg, i) => { if (textPages.has(i + 1) && !pg.boxes.length) pg.all = true; });
        res.sanitized = (await work({ op: "blackout", format: "PDF", pages }, undefined, p.sandbox)).b64; res.rasterized = true;
      }
    } else if (!unmappable) {
      const fmt = a.mime === "image/jpeg" ? "JPEG" : a.mime === "image/webp" ? "WEBP" : a.mime === "image/gif" ? "GIF" : "PNG";
      res.sanitized = (await work({ op: "blackout", format: fmt, pages }, undefined, p.sandbox)).b64;
    } else res.unmappable = true;
    if (res.sanitized) {
      const again = depth < 1 ? await inspectAttachment({ mime: a.mime, b64: res.sanitized }, where, p, depth + 1) : { findings: [{ rule: "x", path: where }] } as AttResult;
      if (again.findings.length || again.failed) { res.sanitized = undefined; res.rasterized = undefined; res.unmappable = true; }
    }
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, structuredClone(res));
  return res;
}

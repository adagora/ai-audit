import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { isPayload, type Finding } from "./scan.js";

export const OFFLOAD_CHARS = 256 * 1024;
export class InspectionStopped extends Error { constructor(readonly code: "audit_inspection_timeout" | "audit_inspection_failed") { super(code); } }
export class InspectionBusy extends Error { constructor() { super("audit_inspection_busy"); } }
export interface Inspected { value: unknown; findings: Finding[] }
interface Job { body: unknown; resolve: (r: Inspected) => void; reject: (e: Error) => void }
interface Slot { worker: Worker; job?: Job; timer?: ReturnType<typeof setTimeout> }

export function scannedCharsAbove(v: unknown, limit: number): boolean {
  let total = 0;
  const walk = (x: unknown): boolean => {
    if (typeof x === "string") return !isPayload(x) && (total += x.length) > limit;
    if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) if ((total += k.length) > limit || walk(y)) return true;
    return false;
  };
  return walk(v);
}

export function createInspectionPool(o: { allowHashes: readonly string[]; timeoutMs: number; size?: number; queueLimit?: number }) {
  const size = o.size ?? Math.max(1, Math.min(4, availableParallelism() - 1)), queueLimit = o.queueLimit ?? 64;
  const slots: Slot[] = [], queue: Job[] = [];
  let closed = false;
  const settle = (slot: Slot) => {
    clearTimeout(slot.timer);
    const job = slot.job;
    slot.job = undefined; slot.timer = undefined;
    return job;
  };
  const drop = (slot: Slot, code?: InspectionStopped["code"]) => {
    const job = settle(slot), at = slots.indexOf(slot);
    if (at >= 0) { slots.splice(at, 1); void slot.worker.terminate(); }
    if (job && code) job.reject(new InspectionStopped(code));
    dispatch();
  };
  const spawn = () => {
    const slot: Slot = { worker: new Worker(new URL("./inspectWorker.js", import.meta.url), { workerData: { allowHashes: [...o.allowHashes] } }) };
    slot.worker.unref();
    slot.worker.on("message", (m: Inspected | { failed: string }) => {
      if ("failed" in m) return drop(slot, "audit_inspection_failed");
      settle(slot)?.resolve(m);
      dispatch();
    });
    slot.worker.on("error", () => drop(slot, "audit_inspection_failed"));
    slot.worker.on("exit", () => drop(slot, "audit_inspection_failed"));
    slots.push(slot);
    return slot;
  };
  const dispatch = () => {
    while (!closed && queue.length) {
      const slot = slots.find((s) => !s.job) ?? (slots.length < size ? spawn() : undefined);
      if (!slot) return;
      const job = queue.shift()!;
      slot.job = job;
      slot.timer = setTimeout(() => drop(slot, "audit_inspection_timeout"), o.timeoutMs);
      try { slot.worker.postMessage(job.body); } catch { drop(slot, "audit_inspection_failed"); }
    }
  };
  return {
    run(body: unknown): Promise<Inspected> {
      const free = slots.some((s) => !s.job) || slots.length < size;
      if (closed || (!free && queue.length >= queueLimit)) return Promise.reject(new InspectionBusy());
      return new Promise((resolve, reject) => { queue.push({ body, resolve, reject }); dispatch(); });
    },
    close() {
      closed = true;
      for (const job of queue.splice(0)) job.reject(new InspectionBusy());
      for (const slot of slots.splice(0)) { settle(slot)?.reject(new InspectionBusy()); void slot.worker.terminate(); }
    },
  };
}

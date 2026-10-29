import { parentPort, workerData } from "node:worker_threads";
import { inspect } from "./scan.js";

const entries = new Set<string>(workerData.allowHashes);
const carnet = Object.freeze({ has: (value: string) => entries.has(value) });
parentPort!.on("message", (body: unknown) => {
  let result: ReturnType<typeof inspect>;
  try { result = inspect(body, carnet); } catch (e) { return parentPort!.postMessage({ failed: e instanceof Error ? e.name : "unknown" }); }
  parentPort!.postMessage(result);
});

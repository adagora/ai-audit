import { createHash } from "node:crypto";

export type PolicyJson = null | boolean | number | string | PolicyJson[] | { [key: string]: PolicyJson };
export interface PolicyFault { code: string; path: string; nodeId?: string }
export class PolicyError extends Error {
  constructor(readonly code: string, readonly path = "$") { super(code); }
}
export const POLICY_LIMITS = Object.freeze({ bytes: 65536, depth: 24, values: 8192, collection: 512, string: 16384, nodes: 64, outputs: 16, traceBytes: 262144, sessionPrograms: 128, evidenceRecords: 128 });
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const canonical = (x: PolicyJson): string => Array.isArray(x) ? `[${x.map(canonical).join(",")}]` : x !== null && typeof x === "object"
  ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}` : JSON.stringify(x);
const unsafe = new Set(["__proto__", "constructor", "prototype"]);
export const object = (x: unknown): x is Record<string, any> => x !== null && typeof x === "object" && !Array.isArray(x);
export const refuse = (ok: unknown, code: string, path = "$"): void => { if (!ok) throw new PolicyError(code, path); };
export const identifier = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(x) && !unsafe.has(x);

export function bounded(value: unknown): PolicyJson {
  let count = 0;
  const visit = (x: unknown, depth: number): PolicyJson => {
    refuse(++count <= POLICY_LIMITS.values && depth <= POLICY_LIMITS.depth, "policy_limit");
    if (x === null || typeof x === "boolean") return x;
    if (typeof x === "number") { refuse(Number.isFinite(x), "policy_nonfinite"); return x === 0 ? 0 : x; }
    if (typeof x === "string") { refuse(x.length <= POLICY_LIMITS.string, "policy_limit"); return x; }
    refuse(object(x) || Array.isArray(x), "policy_json");
    refuse(Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null || Array.isArray(x), "policy_json");
    const keys = Object.keys(x as object);
    refuse(keys.length <= POLICY_LIMITS.collection, "policy_limit");
    if (Array.isArray(x)) {
      refuse(keys.length === x.length && keys.every((k, i) => k === String(i)), "policy_json");
      return keys.map((k) => {
        const property = Object.getOwnPropertyDescriptor(x, k)!;
        refuse(Object.hasOwn(property, "value"), "policy_json");
        return visit(property.value, depth + 1);
      });
    }
    const out: Record<string, PolicyJson> = Object.create(null);
    for (const k of keys) {
      refuse(!unsafe.has(k) && k.length <= 128, "policy_key");
      const property = Object.getOwnPropertyDescriptor(x, k)!;
      refuse(Object.hasOwn(property, "value"), "policy_json");
      out[k] = visit(property.value, depth + 1);
    }
    return out;
  };
  const result = visit(value, 0);
  refuse(Buffer.byteLength(canonical(result)) <= POLICY_LIMITS.bytes, "policy_limit");
  return result;
}

export function fields(x: unknown, required: string[], optional: string[] = [], path = "$"): asserts x is Record<string, any> {
  refuse(object(x) && required.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => required.includes(k) || optional.includes(k)), "policy_shape", path);
}

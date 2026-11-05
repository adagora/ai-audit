import { createHash } from "node:crypto";

export type PolicyJson = null | boolean | number | string | PolicyJson[] | { [key: string]: PolicyJson };
export interface PolicyFault { code: string; path: string; nodeId?: string }
export class PolicyError extends Error {
  constructor(readonly code: string, readonly path = "$") { super(code); }
}
export const POLICY_LIMITS = Object.freeze({ bytes: 65536, depth: 24, values: 8192, collection: 512, string: 16384, nodes: 64, outputs: 16, traceBytes: 262144, sessionPrograms: 128 });
const semantics = "auditline-policy-1:ordered-eager-dimensional-ieee754-finite-safe-integers-negative-zero-normalized:public-rationale-input-basis:arithmetic-compare-compareValues-choose-report-action";
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const canonical = (x: PolicyJson): string => Array.isArray(x) ? `[${x.map(canonical).join(",")}]` : x !== null && typeof x === "object"
  ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}` : JSON.stringify(x);
export const POLICY_RUNTIME = Object.freeze({ registry: "auditline-policy-1", registryDigest: digest(semantics + canonical(POLICY_LIMITS)) });
const unsafe = new Set(["__proto__", "constructor", "prototype"]);
const object = (x: unknown): x is Record<string, any> => x !== null && typeof x === "object" && !Array.isArray(x);
const refuse = (ok: unknown, code: string, path = "$"): void => { if (!ok) throw new PolicyError(code, path); };
const identifier = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(x) && !unsafe.has(x);

function bounded(value: unknown): PolicyJson {
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

function fields(x: unknown, required: string[], optional: string[] = [], path = "$"): asserts x is Record<string, any> {
  refuse(object(x) && required.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => required.includes(k) || optional.includes(k)), "policy_shape", path);
}

export type PolicyType = { kind: "number"; unit: string; integer?: boolean; min?: number; max?: number } | { kind: "boolean" | "string" | "null" };
export interface PolicyInput { id: string; type: PolicyType; name?: string; value?: PolicyJson; basis?: "confirmed" | "testimony" | "suspected" | "open" }
export interface PolicyNode { id: string; op: string; inputs: string[]; params: Record<string, PolicyJson>; type?: PolicyType }
export interface NativePolicy { format: "auditline-policy"; version: 1; name: string; rationale?: string; inputs: PolicyInput[]; steps: PolicyNode[]; outputs: string[] }
export interface PolicyArtifact { id: string; source: string; policy: NativePolicy }
export interface PolicyResult {
  status: "completed" | "failed"; inputHash: string; outputs?: PolicyJson[];
  trace: { nodeId: string; op: string; value: PolicyJson }[]; error?: PolicyFault;
}

function validateType(type: unknown, path: string): asserts type is PolicyType {
  refuse(object(type), "policy_type", path);
  const t = type as Record<string, any>;
  if (t.kind === "number") {
    fields(t, ["kind", "unit"], ["integer", "min", "max"], path);
    refuse(typeof t.unit === "string" && t.unit.length > 0 && t.unit.length <= 64, "policy_type", path);
    refuse(t.integer === undefined || typeof t.integer === "boolean", "policy_type", path);
    refuse((t.min === undefined || typeof t.min === "number") && (t.max === undefined || typeof t.max === "number") && !(t.min > t.max), "policy_type", path);
  } else { fields(t, ["kind"], [], path); refuse(["boolean", "string", "null"].includes(t.kind), "policy_type", path); }
}

function assertValue(value: PolicyJson, type: PolicyType, path: string) {
  const valid = type.kind === "null" ? value === null : typeof value === type.kind;
  refuse(valid, "policy_type", path);
  if (type.kind === "number") {
    const n = value as number;
    refuse((!type.integer || Number.isSafeInteger(n)) && (type.min === undefined || n >= type.min) && (type.max === undefined || n <= type.max), "policy_refinement", path);
  }
}

interface InferredType { kind: string; unit?: string; integer?: boolean }
function units(unit: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const term of unit.split("*")) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)(?:\^(-?[0-9]{1,2}))?$/.exec(term);
    refuse(match, "policy_unit");
    const name = match![1], exponent = Number(match![2] ?? 1);
    if (name !== "one") out.set(name, (out.get(name) ?? 0) + exponent);
  }
  refuse([...out.values()].every((n) => Math.abs(n) <= 64), "policy_unit");
  return out;
}
const unitName = (value: Map<string, number>) => [...value].filter(([, n]) => n !== 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([key, n]) => n === 1 ? key : `${key}^${n}`).join("*") || "one";
const inferred = (type: PolicyType): InferredType => type.kind === "number" ? { kind: type.kind, unit: unitName(units(type.unit)), integer: type.integer } : { kind: type.kind };
const compatible = (a: InferredType, b: InferredType) => a.kind === b.kind && a.unit === b.unit;

function inferNode(node: PolicyNode, args: InferredType[], path: string): InferredType {
  const [a, b, c] = args;
  let result: InferredType;
  if (node.op === "arithmetic") {
    refuse(a.kind === "number" && b.kind === "number", "policy_type", path);
    const kind = node.params.kind;
    let unit = a.unit!;
    if (["mul", "div", "floorDiv"].includes(kind as string)) {
      const combined = units(a.unit!);
      for (const [key, n] of units(b.unit!)) combined.set(key, (combined.get(key) ?? 0) + n * (kind === "mul" ? 1 : -1));
      unit = unitName(combined);
      units(unit);
    } else refuse(compatible(a, b), "policy_unit", path);
    result = { kind: "number", unit, integer: kind === "floorDiv" || kind !== "div" && !!a.integer && !!b.integer };
  } else if (node.op === "compare" || node.op === "compareValues") {
    const other = node.op === "compare" ? { kind: node.params.value === null ? "null" : typeof node.params.value, unit: a.unit } : b;
    refuse(compatible(a, other) && ["number", "boolean", "string", "null"].includes(a.kind), "policy_type", path);
    refuse(["eq", "ne"].includes(node.params.operator as string) || a.kind === "number", "policy_type", path);
    result = { kind: "boolean" };
  } else if (node.op === "choose") {
    refuse(a.kind === "boolean" && compatible(b, c), "policy_type", path);
    result = { kind: b.kind, unit: b.unit, integer: !!b.integer && !!c.integer };
  } else {
    if (node.op === "action") refuse(a.kind === "boolean", "policy_type", path);
    result = { kind: "record" };
  }
  if (node.type) refuse(compatible(result, inferred(node.type)), "policy_type", path + ".type");
  if (node.type?.kind === "number" && node.type.integer) result.integer = true;
  return result;
}

const operators = ["eq", "ne", "gt", "gte", "lt", "lte"];
function validateNode(node: PolicyNode, path: string) {
  fields(node, ["id", "op", "inputs", "params"], ["type"], path);
  refuse(identifier(node.id) && Array.isArray(node.inputs) && node.inputs.every(identifier), "policy_node", path);
  const p = node.params;
  const arity: Record<string, number> = { arithmetic: 2, compare: 1, compareValues: 2, choose: 3, action: 2 };
  refuse(Object.hasOwn(arity, node.op) || node.op === "report", "policy_operation", path);
  refuse(node.inputs.length === (arity[node.op] ?? node.inputs.length) && node.inputs.length <= 16, "policy_arity", path);
  if (node.op === "arithmetic") { fields(p, ["kind"], [], path); refuse(["add", "sub", "mul", "div", "floorDiv", "min", "max"].includes(p.kind as string), "policy_operation", path); }
  if (node.op === "compare" || node.op === "compareValues") {
    fields(p, node.op === "compare" ? ["operator", "value"] : ["operator"], [], path);
    refuse(operators.includes(p.operator as string), "policy_operation", path);
  }
  if (node.op === "choose") fields(p, [], [], path);
  if (node.op === "action") {
    fields(p, ["allowed", "action"], [], path);
    refuse(typeof p.allowed === "boolean" && typeof p.action === "string" && p.action.length > 0 && p.action.length <= 120, "policy_action", path);
  }
  if (node.op === "report") {
    fields(p, ["labels"], [], path);
    refuse(Array.isArray(p.labels) && p.labels.length === node.inputs.length && p.labels.every((s) => typeof s === "string" && identifier(s)) && new Set(p.labels).size === p.labels.length, "policy_labels", path);
  }
  if (node.type !== undefined) validateType(node.type, path + ".type");
}

export function compilePolicy(value: unknown): PolicyArtifact {
  const p: unknown = bounded(value);
  fields(p, ["format", "version", "name", "inputs", "steps", "outputs"], ["rationale"]);
  refuse(p.format === "auditline-policy" && p.version === 1, "policy_version");
  refuse(typeof p.name === "string" && p.name.length > 0 && p.name.length <= 120, "policy_name");
  refuse(p.rationale === undefined || typeof p.rationale === "string" && p.rationale.length <= 512, "policy_rationale");
  refuse(Array.isArray(p.inputs) && Array.isArray(p.steps) && p.inputs.length + p.steps.length > 0 && p.inputs.length + p.steps.length <= POLICY_LIMITS.nodes, "policy_limit");
  refuse(Array.isArray(p.outputs) && p.outputs.length > 0 && p.outputs.length <= POLICY_LIMITS.outputs && p.outputs.every(identifier), "policy_outputs");
  const ids = new Set<string>(), names = new Set<string>(), types = new Map<string, InferredType>();
  for (const [i, input] of p.inputs.entries()) {
    const path = `$.inputs[${i}]`;
    fields(input, ["id", "type"], ["name", "value", "basis"], path);
    refuse(input.basis === undefined || ["confirmed", "testimony", "suspected", "open"].includes(input.basis), "policy_basis", path + ".basis");
    refuse(identifier(input.id) && !ids.has(input.id) && Object.hasOwn(input, "name") !== Object.hasOwn(input, "value"), "policy_input", path);
    validateType(input.type, path + ".type");
    if (Object.hasOwn(input, "name")) {
      refuse(identifier(input.name) && !names.has(input.name), "policy_input", path);
      names.add(input.name);
    } else assertValue(input.value, input.type, path + ".value");
    ids.add(input.id);
    types.set(input.id, inferred(input.type));
  }
  for (const [i, node] of p.steps.entries()) {
    const path = `$.steps[${i}]`;
    validateNode(node, path);
    refuse(!ids.has(node.id) && node.inputs.every((id: string) => ids.has(id)), "policy_reference", path);
    types.set(node.id, inferNode(node, node.inputs.map((id: string) => types.get(id)!), path));
    ids.add(node.id);
  }
  refuse(p.outputs.every((id: string) => ids.has(id)), "policy_reference", "$.outputs");
  const source = canonical(p);
  return { id: "ap_" + digest(source), source, policy: JSON.parse(source) as NativePolicy };
}

export function recoverPolicy(source: string): PolicyArtifact {
  refuse(typeof source === "string" && Buffer.byteLength(source) <= POLICY_LIMITS.bytes, "policy_limit");
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new PolicyError("policy_source"); }
  const artifact = compilePolicy(value);
  refuse(artifact.source === source, "policy_source_not_as_written");
  return artifact;
}

function compare(a: PolicyJson, b: PolicyJson, op: string): boolean {
  refuse(typeof a === typeof b && (typeof a === "number" || typeof a === "boolean" || typeof a === "string" || a === null && b === null), "policy_type");
  if (op === "eq") return a === b;
  if (op === "ne") return a !== b;
  refuse(typeof a === "number" && typeof b === "number", "policy_type");
  const x = a as number, y = b as number;
  return op === "gt" ? x > y : op === "gte" ? x >= y : op === "lt" ? x < y : x <= y;
}

function calculate(node: PolicyNode, args: PolicyJson[]): PolicyJson {
  const [a, b, c] = args, p = node.params;
  if (node.op === "arithmetic") {
    refuse(typeof a === "number" && typeof b === "number", "policy_type");
    const x = a as number, y = b as number;
    refuse(!["div", "floorDiv"].includes(p.kind as string) || y !== 0, "policy_division_by_zero");
    const n = p.kind === "add" ? x + y : p.kind === "sub" ? x - y : p.kind === "mul" ? x * y : p.kind === "div" ? x / y : p.kind === "floorDiv" ? Math.floor(x / y) : p.kind === "min" ? Math.min(x, y) : Math.max(x, y);
    refuse(Number.isFinite(n), "policy_nonfinite");
    return n === 0 ? 0 : n;
  }
  if (node.op === "compare" || node.op === "compareValues") return compare(a, node.op === "compare" ? p.value : b, p.operator as string);
  if (node.op === "choose") { refuse(typeof a === "boolean", "policy_type"); return a ? b : c; }
  if (node.op === "action") { refuse(typeof a === "boolean", "policy_type"); return { status: a && p.allowed ? "simulated" : "skipped", action: p.action, payload: b }; }
  const out: Record<string, PolicyJson> = Object.create(null);
  (p.labels as string[]).forEach((label, i) => { out[label] = args[i]; });
  return out;
}

export function evaluatePolicy(source: string, bindings: unknown): PolicyResult {
  const { policy } = recoverPolicy(source);
  const inputs: unknown = bounded(bindings);
  fields(inputs, policy.inputs.flatMap((p) => p.name === undefined ? [] : [p.name]));
  const values = new Map<string, PolicyJson>();
  const types = new Map<string, InferredType>();
  for (const input of policy.inputs) {
    const value = input.name === undefined ? input.value! : inputs[input.name];
    assertValue(value, input.type, input.name === undefined ? "$.inputs" : `$.bindings.${input.name}`);
    values.set(input.id, value);
    types.set(input.id, inferred(input.type));
  }
  const inputHash = "ai_" + digest(canonical(inputs));
  const trace: PolicyResult["trace"] = policy.inputs.map((input) => ({ nodeId: input.id, op: input.name === undefined ? "literal" : "input", value: values.get(input.id)! }));
  let traceBytes = Buffer.byteLength(canonical(trace));
  for (const node of policy.steps) {
    try {
      const value = bounded(calculate(node, node.inputs.map((id) => values.get(id)!)));
      const type = inferNode(node, node.inputs.map((id) => types.get(id)!), `$.nodes.${node.id}`);
      if (type.kind === "number" && type.integer) refuse(Number.isSafeInteger(value), "policy_refinement");
      if (node.type) assertValue(value, node.type, `$.nodes.${node.id}.result`);
      const event = { nodeId: node.id, op: node.op, value };
      traceBytes += Buffer.byteLength(canonical(event)) + (trace.length ? 1 : 0);
      refuse(traceBytes <= POLICY_LIMITS.traceBytes, "policy_trace_limit");
      trace.push(event);
      values.set(node.id, value);
      types.set(node.id, type);
    } catch (e) {
      if (!(e instanceof PolicyError)) throw e;
      return { status: "failed", inputHash, trace, error: { code: e.code, path: `$.nodes.${node.id}.result`, nodeId: node.id } };
    }
  }
  const outputs = policy.outputs.map((id) => values.get(id)!);
  try { bounded(outputs); } catch (e) {
    if (!(e instanceof PolicyError)) throw e;
    return { status: "failed", inputHash, trace, error: { code: e.code, path: "$.outputs" } };
  }
  return { status: "completed", inputHash, outputs: JSON.parse(canonical(outputs)), trace };
}

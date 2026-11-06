import { compilePolicy, recoverPolicy, evaluatePolicy, PolicyError, POLICY_RUNTIME, POLICY_LIMITS, type PolicyArtifact, type PolicyResult } from "./policyRuntime.js";
import { policyImplementation, type PolicyImplementation } from "./policyImplementation.js";

export interface RuntimeArtifact {
  id: string; source: string;
  payload: { name?: string; registry?: string; registryDigest?: string;
    rationale?: string; task?: { nodes?: { id: string; basis?: string; type?: { kind: string; unit?: string } }[]; outputs?: string[] } };
}
export interface RuntimeRun { result: PolicyResult }

export interface RuntimeIndex { nodeIds: string[]; inputs: Record<string, string[]> }
export interface RuntimeSession {
  compile(intent: unknown): RuntimeArtifact;
  recover(input: { source: string }): RuntimeArtifact;
  describe(): { registry: string; registryDigest: string; implementation: PolicyImplementation };
  run(input: { artifactId: string; requestId: string; inputs: Record<string, unknown> }): RuntimeRun;
  index(id: string): RuntimeIndex;
}

class NativeSession implements RuntimeSession {
  private readonly sources = new Map<string, string>();
  describe() { return { ...POLICY_RUNTIME, implementation: policyImplementation() }; }
  private retain(artifact: PolicyArtifact) {
    if (!this.sources.has(artifact.id) && this.sources.size >= POLICY_LIMITS.sessionPrograms) throw new PolicyError("policy_session_limit");
    this.sources.set(artifact.id, artifact.source);
    const policy = artifact.policy;
    const inputs = policy.inputs.map((input) => ({ id: input.id, type: input.type, ...(input.basis && { basis: input.basis }), inputs: [],
      op: input.name === undefined ? "literal" : "input", params: input.name === undefined ? { value: input.value } : { name: input.name } }));
    return { id: artifact.id, source: artifact.source, payload: { name: policy.name, ...(policy.rationale && { rationale: policy.rationale }), ...POLICY_RUNTIME, task: { nodes: [...inputs, ...policy.steps], outputs: policy.outputs } } };
  }
  compile(intent: unknown) { return this.retain(compilePolicy(intent)); }
  recover(input: { source: string }) { return this.retain(recoverPolicy(input.source)); }
  private source(id: string) {
    const source = this.sources.get(id);
    if (source === undefined) throw new PolicyError("policy_unknown_program");
    return source;
  }
  run(input: { artifactId: string; requestId: string; inputs: Record<string, unknown> }) {
    policyImplementation();
    const result = evaluatePolicy(this.source(input.artifactId), input.inputs);
    policyImplementation();
    return { result };
  }
  index(id: string) {
    const { policy } = recoverPolicy(this.source(id));
    const nodeIds = [...policy.inputs, ...policy.steps].map((n) => n.id);
    return { nodeIds, inputs: Object.fromEntries(policy.steps.map((node) => [node.id, node.inputs])) };
  }
}

export async function policyRuntime(_program?: { intent?: unknown; source?: string }) {
  return { Session: NativeSession as new () => RuntimeSession, PolicyError };
}

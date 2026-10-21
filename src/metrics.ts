export type Labels = Record<string, string>;

const escapeLabelValue = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const labelText = (l: Labels) => {
  const keys = Object.keys(l).sort();
  return keys.length ? `{${keys.map((k) => `${k}="${escapeLabelValue(l[k])}"`).join(",")}}` : "";
};

export class Counter {
  private readonly series = new Map<string, { labels: Labels; value: number }>();
  constructor(readonly name: string, readonly help: string) {}
  inc(labels: Labels = {}, by = 1) {
    const key = labelText(labels), s = this.series.get(key);
    if (s) s.value += by; else this.series.set(key, { labels, value: by });
  }
  get(labels: Labels = {}) { return this.series.get(labelText(labels))?.value ?? 0; }
  total() { let t = 0; for (const s of this.series.values()) t += s.value; return t; }
  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (!this.series.size) lines.push(`${this.name}_total 0`);
    for (const s of this.series.values()) lines.push(`${this.name}_total${labelText(s.labels)} ${s.value}`);
    return lines;
  }
}

export class Gauge {
  constructor(readonly name: string, readonly help: string, private readonly read: () => number) {}
  expose(): string[] { return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`, `${this.name} ${this.read()}`]; }
}

export class Histogram {
  private readonly counts: number[];
  private sum = 0; private count = 0;
  constructor(readonly name: string, readonly help: string, readonly bounds: readonly number[]) { this.counts = bounds.map(() => 0); }
  observe(v: number) {
    this.sum += v; this.count++;
    this.bounds.forEach((b, i) => { if (v <= b) this.counts[i]++; });
  }
  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    this.bounds.forEach((b, i) => lines.push(`${this.name}_bucket{le="${b}"} ${this.counts[i]}`));
    lines.push(`${this.name}_bucket{le="+Inf"} ${this.count}`, `${this.name}_sum ${this.sum}`, `${this.name}_count ${this.count}`);
    return lines;
  }
}

export const OPENMETRICS_CONTENT_TYPE = "application/openmetrics-text; version=1.0.0; charset=utf-8";
export const exposition = (families: { expose(): string[] }[]) => families.flatMap((f) => f.expose()).join("\n") + "\n# EOF\n";

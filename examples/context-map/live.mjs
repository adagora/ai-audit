import { readFileSync } from "node:fs";

const url = `${process.env.AI_AUDIT_URL ?? "http://127.0.0.1:8787"}/v1/chat/completions`;
const clientKey = process.env.AI_AUDIT_CLIENT_KEY;
if (!clientKey) { console.error("set AI_AUDIT_CLIENT_KEY to the proxy's virtual key"); process.exit(2); }
const MODEL = "gpt-4o-mini", MAX_PROMPT_TOKENS = 250_000, RESULT_CHARS = 9000;
const repoFile = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").slice(0, RESULT_CHARS);

const tool = (name, purpose, fields) => ({ type: "function", function: { name, description: `${purpose} ${fields.guidance}`,
  parameters: { type: "object", properties: Object.fromEntries(fields.params.map((p) => [p, { type: "string", description: `The ${p.replace("_", " ")} to use. ${fields.guidance}` }])), required: fields.params } } });
const guidance = "Use it whenever the reviewer needs evidence from the ai-audit repository. Quote file paths exactly as they appear in the repository tree, prefer the smallest scope that answers the question, never guess file contents, and report when a file is missing instead of inventing it. Results are plain text, truncated to a fixed size; ask again with a narrower scope if a result looks cut off.";
const baseTools = [
  tool("read_file", "Read a source file of the ai-audit repository.", { params: ["path"], guidance }),
  tool("search_code", "Search the ai-audit repository for a literal string and return matching lines.", { params: ["pattern", "directory"], guidance }),
  tool("list_directory", "List files in a directory of the ai-audit repository.", { params: ["directory"], guidance }),
  tool("read_adr", "Read an architecture decision record from docs/adr.", { params: ["number"], guidance }),
  tool("run_tests", "Return the latest recorded test summary for a test file.", { params: ["test_file"], guidance }),
  tool("git_log", "Return recent commit subjects touching a path.", { params: ["path", "limit"], guidance }),
];
const skillTool = tool("skill_eu_ai_act_article_12", "Skill: checklist for EU AI Act Article 12 record-keeping (automatic logging over the lifetime of the system, traceability, monitoring of operation, identification of situations that may present a risk). Call it before judging whether a logging design meets Article 12.", { params: ["question"], guidance: guidance.repeat(3) });
const system = ["You are a compliance reviewer for ai-audit, an audit proxy for LLM traffic under the EU AI Act.",
  "Work only from tool results. Be brief: one or two sentences per step.",
  ...Array.from({ length: 14 }, (_, i) => `Review rule ${i + 1}: check that every claim about logging, retention, integrity, redaction, session linking or metrics is backed by a file you have read, name the file, and flag gaps instead of filling them with assumptions. Distinguish what the code enforces from what the documentation promises.`)].join("\n");

let promptTotal = 0, completionTotal = 0, cachedTotal = 0;
const usageRows = [];
async function call(label, tools, messages, toolChoice) {
  if (promptTotal > MAX_PROMPT_TOKENS) throw new Error("token budget exhausted");
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${clientKey}` },
    body: JSON.stringify({ model: MODEL, max_tokens: 150, stream: true, stream_options: { include_usage: true }, messages: [{ role: "system", content: system }, ...messages], tools, tool_choice: toolChoice }) });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${label}`);
  let text = "", usage, calls = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const chunk = JSON.parse(line.slice(6));
    if (chunk.usage) usage = chunk.usage;
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) text += delta.content;
    for (const c of delta?.tool_calls ?? []) {
      calls[c.index] ??= { id: c.id, type: "function", function: { name: c.function?.name ?? "", arguments: "" } };
      calls[c.index].function.arguments += c.function?.arguments ?? "";
    }
  }
  if (!usage) throw new Error(`no usage on ${label}`);
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  promptTotal += usage.prompt_tokens; completionTotal += usage.completion_tokens; cachedTotal += cached;
  usageRows.push({ label, prompt: usage.prompt_tokens, cached, completion: usage.completion_tokens });
  return { text, calls: calls.filter(Boolean) };
}
const force = (name) => ({ type: "function", function: { name } });
const results = {
  read_file: (args) => repoFile(args.path ?? "README.md"),
  search_code: () => repoFile("src/session.ts"),
  list_directory: () => repoFile("docs/adr/README.md"),
  read_adr: () => repoFile("docs/adr/0020-context-arena-and-cache-busts.md"),
  run_tests: () => repoFile("test/session.test.ts"),
  git_log: () => repoFile("src/metrics.ts"),
  skill_eu_ai_act_article_12: () => "Article 12 checklist: 1. events logged automatically over the lifetime; 2. logs allow identifying risk situations and substantial modifications; 3. logs support post-market monitoring; 4. logs support monitoring of operation by deployers. ".repeat(12),
};
async function step(label, tools, messages, toolName) {
  const { calls } = await call(label, tools, messages, force(toolName));
  const toolCall = calls[0];
  if (!toolCall) throw new Error(`no tool call on ${label}`);
  let args = {}; try { args = JSON.parse(toolCall.function.arguments); } catch {}
  return [...messages, { role: "assistant", content: null, tool_calls: [toolCall] },
    { role: "tool", tool_call_id: toolCall.id, content: results[toolCall.function.name](args) }];
}

let tools = baseTools;
let messages = [{ role: "user", content: "Review whether the ai-audit proxy's audit log meets EU AI Act Article 12. Start with src/audit.ts, then src/proxy.ts." }];
messages = await step("t1", tools, messages, "read_file");
messages = await step("t2", tools, messages, "read_file");
messages = await step("t3", tools, messages, "search_code");
messages = await step("t4", tools, messages, "read_adr");
tools = [...baseTools.slice(0, 2), skillTool, ...baseTools.slice(2)];
messages = await step("t5 skill inserted", tools, messages, "skill_eu_ai_act_article_12");
const beforeBranch = messages;
messages = await step("t6", tools, messages, "run_tests");
await call("t7 retry", tools, messages, force("list_directory"));
messages = await step("t7", tools, messages, "list_directory");
const edited = [...beforeBranch, { role: "user", content: "Skip the tests; check the session linking ADR instead." }];
await step("t6 edited branch", tools, edited, "read_adr");
messages = await step("t8", tools, messages, "git_log");
await call("t9 answer", tools, [...messages, { role: "user", content: "Summarise the verdict in three sentences." }], "none");

const price = { input: 0.15 / 1e6, cached: 0.075 / 1e6, output: 0.6 / 1e6 };
const cost = (promptTotal - cachedTotal) * price.input + cachedTotal * price.cached + completionTotal * price.output;
console.table(usageRows);
console.log(JSON.stringify({ model: MODEL, requests: usageRows.length, promptTokens: promptTotal, cachedTokens: cachedTotal, completionTokens: completionTotal, estimatedUsd: Number(cost.toFixed(4)) }));

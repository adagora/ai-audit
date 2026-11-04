const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
let config, policyId = null, runId = null, busy = false, controller, dirty = false;
const pretty = (value) => JSON.stringify(value, null, 2);
const notice = (message = "") => { $("notice").textContent = message; };
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "x-workbench-token": token, ...(options.body ? { "content-type": "application/json" } : {}) } });
  if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
  return response;
}
function controls() {
  for (const id of ["run", "suite", "compile", "reset-policy", "target", "mode", "test-set", "scenario", "question", "policy"]) $(id).disabled = busy || (id === "compile" && $("target").value === "python");
  $("model").disabled = busy || $("mode").value !== "live";
  $("stop").disabled = !busy;
  if (dirty && $("target").value !== "python") { $("run").disabled = true; $("suite").disabled = true; }
}
const activeCases = () => config.testSets[$("test-set").value].cases;
function scenario() {
  const row = activeCases().find((c) => c.id === $("scenario").value);
  $("question").value = row.input.question;
  $("expected").textContent = pretty({ assertions: row.assertions, requirements: row.tags?.includes("ambiguity") ? "Staff referral, no unverified completion claim" + (row.tags.includes("no-money") ? ", no monetary amount under unresolved context" : "") : "Independent business expectations", sampling: "Development cases; not representative traffic" });
}
function testSet() {
  $("scenario").replaceChildren();
  for (const row of activeCases()) { const option = document.createElement("option"); option.value = row.id; option.textContent = row.id; $("scenario").append(option); }
  $("scenario").value = activeCases().some((c) => c.id === "refund-1002") ? "refund-1002" : activeCases()[0].id;
  $("suite").textContent = `Evaluate all ${activeCases().length} cases`;
  if ($("mode").value === "live") $("cost").textContent = `Live mode makes billable OpenAI calls. One question can require several model calls; the selected set has ${activeCases().length} questions.`;
  scenario();
}
function event(row) {
  const labels = { "run-start": "Experiment started", "case-start": "Customer question", "model-start": "Model call started", "model-result": "Model response", "tool-start": "Executing tool", "tool-result": "Tool returned", answer: "Final answer", evaluating: "Checking independent expectations", evaluation: "Evaluation result", audit: "Audit chain verified", quineling: "QDL decision and replay receipt", "receipt-error": "Receipt unavailable", complete: "Experiment retained", error: "Execution error" };
  if (row.type === "run-start") runId = row.id;
  if (row.type === "case-start" && row.caseId) $("status").textContent = row.caseId;
  if ($("timeline").querySelector(".empty")) $("timeline").textContent = "";
  const line = document.createElement("div"); line.className = "event";
  const time = document.createElement("time"); time.textContent = new Date(row.at).toLocaleTimeString();
  const content = document.createElement("div"), title = document.createElement("strong"); title.textContent = labels[row.type] ?? row.type;
  if (row.name) title.textContent += ` · ${row.name}`;
  content.append(title);
  const detail = { ...row }; delete detail.type; delete detail.at;
  const descriptions = {
    "run-start": `${row.manifest?.target} · ${row.manifest?.provider} · ${row.manifest?.caseCount} case(s)`,
    "case-start": row.question,
    "model-start": `Turn ${row.turn}${row.model ? " · " + row.model : ""}`,
    "model-result": row.tools?.length ? `Requested: ${row.tools.join(", ")}` : "Model finished its answer",
    "tool-start": typeof row.arguments === "string" ? row.arguments : pretty(row.arguments),
    "tool-result": row.result?.total_refund_eur !== undefined ? `${row.result.total_refund_eur} EUR · ${row.result.action}` : row.result?.refund_eur !== undefined ? `${row.result.refund_eur} EUR calculated` : row.result?.found === false ? "Booking not found" : "Result returned to the model",
    answer: row.answer,
    evaluating: "The evaluator receives the observed answer and the independent expected outcome.",
    evaluation: `${row.status?.toUpperCase()} · ${(row.checks ?? []).filter((c) => c.status === "fail").length} failed check(s)`,
    audit: row.verification?.ok ? `${row.records} records · chain intact` : "Audit chain verification failed",
    quineling: `${row.status} · ${row.artifactId?.slice(0, 20)}… · replay receipt saved`,
    complete: `Saved ${row.manifest?.caseCount} case(s) · ${row.manifest?.status}`,
    error: row.error,
  };
  const description = document.createElement("p"); description.className = "caption"; description.textContent = descriptions[row.type] ?? row.caseId ?? ""; content.append(description);
  const disclosure = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Inspect event data";
  const pre = document.createElement("pre"); pre.textContent = pretty(detail); disclosure.append(summary, pre); content.append(disclosure); line.append(time, content); $("timeline").append(line);
  if (row.type === "answer") {
    const answer = document.createElement("div"); answer.className = "answer";
    const heading = document.createElement("strong"); heading.textContent = row.caseId;
    const text = document.createElement("p"); text.textContent = row.answer; answer.append(heading, text); $("answers").append(answer);
  }
  if (row.type === "evaluation") {
    for (const check of row.checks ?? []) {
      const line = document.createElement("div"); line.className = `check ${check.status}`;
      const status = document.createElement("strong"); status.textContent = check.status.toUpperCase();
      const description = document.createElement("span"); description.textContent = `${row.caseId} / ${check.id}: ${check.reason}`;
      line.append(status, description); $("checks").append(line);
    }
  }
  if (row.type === "complete") finish(row.manifest);
  if (row.type === "error") notice(row.error);
}
async function artifact(file) {
  try { const response = await request(`/api/artifact?id=${encodeURIComponent(runId)}&file=${encodeURIComponent(file)}`); const blob = await response.blob(); const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { notice(error.message); }
}
function artifactButton(label, file) { const button = document.createElement("button"); button.className = "secondary"; button.textContent = label; button.onclick = () => artifact(file); $("artifacts").append(button); }
function finish(manifest) {
  $("score").textContent = `${manifest.summary?.passed ?? 0} / ${manifest.summary?.trials ?? 0} trials passed`;
  $("score").className = `badge ${manifest.status === "passed" ? "pass" : "fail"}`;
  $("status").textContent = manifest.status;
  $("summary").textContent = `${manifest.provider === "live" ? "Real OpenAI" : "Scripted model"} · ${manifest.target} · Independent business checks. Audit integrity is shown separately in the timeline.`;
  $("evidence").textContent = `Retained workspace:\n${manifest.directory}`;
  $("artifacts").textContent = "";
  artifactButton("Evaluation report", "report.html");
  if (manifest.target !== "python") { artifactButton("Audit records", "records.json"); artifactButton("Generated Quineling source", "programs.json"); }
  else artifactButton("Observed answer and tools", "report.json");
  artifactButton("Run manifest", "manifest.json");
  if (manifest.caseIds?.length) {
    const link = document.createElement("a"); link.textContent = `Open ${manifest.caseIds.length} retained case(s) in the cockpit ↗`; link.href = `/casework?view=cases&case=${encodeURIComponent(manifest.caseIds[0])}#token=${encodeURIComponent(token)}`; $("artifacts").append(link);
  }
  if (manifest.qualifications?.length) artifactButton("Release qualification · evidence only", "qualification.json");
  for (let i = 0; i < (manifest.receipts ?? 0); i++) artifactButton(`Decision receipt ${i + 1}`, `receipt-${i}.html`);
}
async function history() {
  const runs = await (await request("/api/runs")).json(); $("history").textContent = "";
  if (!runs.length) $("history").textContent = "No runs yet.";
  for (const manifest of runs) {
    const button = document.createElement("button"); button.className = "history-item"; button.textContent = `${manifest.target ?? "Unknown target"} · ${manifest.inventory.lifecycle} · ${manifest.status}`;
    const small = document.createElement("small"); small.textContent = `${new Date(manifest.createdAt).toLocaleString()} · ${manifest.provider} · ${manifest.testSet ?? "business"}`; button.append(small);
    const retention = document.createElement("small"); retention.textContent = `${manifest.inventory.bytes.toLocaleString()} bytes · ${manifest.inventory.files} files · ${manifest.inventory.sensitivity} · Owner: ${manifest.inventory.retentionOwner}. ${manifest.inventory.retention}${manifest.inventory.unreadable ? "; storage count incomplete" : ""}${manifest.inventory.symbolicLinks ? "; symbolic links excluded" : ""}`; button.append(retention);
    button.onclick = async () => { if (busy) return; try { const saved = await (await request(`/api/run?id=${manifest.id}`)).json(); reset(); runId = manifest.id; for (const row of saved.events) event(row); if (saved.manifest.status === "running") notice("This run did not finalize. Its partial evidence is retained."); } catch (error) { notice(error.message); } };
    $("history").append(button);
  }
}
function reset() { notice(); for (const id of ["timeline", "answers", "checks", "artifacts", "evidence"]) $(id).textContent = ""; $("score").textContent = "Running"; $("score").className = "badge"; }
async function run(fullSuite) {
  reset(); busy = true; controls(); controller = new AbortController();
  try {
    const response = await request("/api/run", { method: "POST", signal: controller.signal, body: pretty({ suite: $("test-set").value, target: $("target").value, mode: $("mode").value, model: $("model").value, caseId: $("scenario").value, question: $("question").value, fullSuite, policyId: $("target").value !== "python" ? policyId : null }) });
    const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = "";
    while (true) { const { value, done } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream: true }); const rows = pending.split("\n"); pending = rows.pop(); for (const line of rows) if (line) event(JSON.parse(line)); }
    if (pending.trim()) event(JSON.parse(pending));
  } catch (error) { notice(error.name === "AbortError" ? "Stopped. Partial evidence may remain in the local workspace." : error.message); $("status").textContent = "Stopped or unavailable"; }
  finally { busy = false; controls(); await history(); }
}
$("run").onclick = () => run(false); $("suite").onclick = () => run(true); $("stop").onclick = () => controller?.abort();
$("refresh").onclick = () => history().catch((error) => notice(error.message)); $("scenario").onchange = scenario; $("test-set").onchange = testSet;
$("mode").onchange = () => { controls(); $("cost").textContent = $("mode").value === "live" ? `Live mode makes billable OpenAI calls. One question can require several model calls; the selected set has ${activeCases().length} questions.` : "The actual agent, proxy and tools execute with a scripted provider. No API key or paid calls."; };
$("target").onchange = () => { controls(); $("policy-state").textContent = $("target").value === "python" ? "Python rules · QDL not used" : policyId ? "Compiled draft" : "Default policy"; };
$("policy").oninput = () => { dirty = true; policyId = null; $("policy-state").textContent = "Uncompiled changes"; controls(); };
$("reset-policy").onclick = () => { $("policy").value = pretty(config.policy); policyId = null; dirty = false; $("policy-state").textContent = "Default policy"; $("compiled").textContent = "The default policy is compiled when a refund tool runs."; controls(); };
$("compile").onclick = async () => {
  busy = true; controls(); notice();
  try { const compiled = await (await request("/api/compile", { method: "POST", body: pretty({ policy: JSON.parse($("policy").value) }) })).json(); policyId = compiled.id; dirty = false; $("policy-state").textContent = "Compiled draft · unapproved"; $("compiled").textContent = `Artifact: ${compiled.artifactId}\n\n${compiled.source}`; }
  catch (error) { notice(error.message); } finally { busy = false; controls(); }
};
try {
  config = await (await request("/api/config")).json();
  testSet(); $("policy").value = pretty(config.policy);
  $("mode").querySelector('[value="live"]').disabled = !config.liveAvailable;
  $("connection").textContent = config.liveAvailable ? "Live model available" : "Offline ready";
  controls(); await history();
} catch (error) { notice(error.message); $("connection").textContent = "Unavailable"; $("run").disabled = true; $("suite").disabled = true; }

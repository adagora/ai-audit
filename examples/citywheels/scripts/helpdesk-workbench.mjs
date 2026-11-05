import { ambiguitySuite, ambiguityEvaluators, staffReferral } from "./helpdesk-ambiguity.mjs";
import { runCitywheelsQuestion } from "./citywheels-questions.mjs";
import http from "node:http";
import { experimentInventory } from "../../../scripts/experiment-inventory.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuditLog } from "../../../dist/src/audit.js";
import { decisionReceipt, renderReceipt } from "../../../dist/src/receipt.js";
import { businessSuite, businessEvaluators } from "./helpdesk-comparison-policy.mjs";
import { prepareHelpdeskRelease, retainHelpdeskQualification, qualificationStore } from "./helpdesk-qualification.mjs";
import { createCaseworkApi } from "./casework-api.mjs";
import { evidenceDigest } from "../../../dist/src/qualification.js";

export async function startWorkbench({ port = Number(process.env.HELPDESK_PORT ?? 8799), home, caseworkIdentities = [] } = {}) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = resolve(home ?? join(root, "live/helpdesk-workbench"));
  for (const name of ["runs", "policies"]) mkdirSync(join(directory, name), { recursive: true, mode: 0o700 });
  const evaluatorRoot = resolve(process.env.INTENTGAUGE_ROOT ?? join(root, "../evalLOL"));
  if (!existsSync(join(evaluatorRoot, "dist/src/index.js"))) throw new Error(`Build IntentGauge first: npm --prefix ${JSON.stringify(evaluatorRoot)} run build`);
  const api = await import(pathToFileURL(join(evaluatorRoot, "dist/src/index.js")));
  const { evaluators } = await import(pathToFileURL(join(evaluatorRoot, "integrations/citywheels/target.mjs")));
  const suite = api.validateSuite(businessSuite(JSON.parse(readFileSync(join(evaluatorRoot, "integrations/citywheels/suite.json"), "utf8"))));
  const ambiguity = api.validateSuite(ambiguitySuite());
  const baselinePolicy = JSON.parse(readFileSync(join(root, "examples/citywheels/refund.json"), "utf8"));
  const hostFingerprint = () => {
    const store = qualificationStore(directory);
    return evidenceDigest({ application: store.capture(root, ["dist/src", "dist/examples/citywheels/src", "examples/citywheels/scripts/helpdesk-workbench.mjs", "scripts/experiment-inventory.mjs", "examples/citywheels/scripts/citywheels-questions.mjs", "examples/citywheels/scripts/citywheels-operational-context.mjs", "examples/citywheels/scripts/helpdesk-qualification.mjs", "examples/citywheels/scripts/casework-api.mjs", "examples/citywheels/scripts/helpdesk-ambiguity.mjs"]).digest,
      evaluator: store.capture(evaluatorRoot, ["dist/src", "integrations/citywheels/target.mjs"]).digest });
  };
  const loadedHost = hostFingerprint();
  const requireLoadedHost = () => { if (hostFingerprint() !== loadedHost) throw new Error("audit_casework_host_changed_restart_required"); };
  const token = randomBytes(32).toString("base64url");
  const workbenchDigest = createHash("sha256").update(token).digest();
  const workbenchAuthorized = (value) => typeof value === "string" && timingSafeEqual(createHash("sha256").update(value).digest(), workbenchDigest);
  const customerToken = randomBytes(32).toString("base64url");
  const reviewIdentities = [["demo-labeler-a", "labeler"], ["demo-labeler-b", "labeler"], ["demo-adjudicator", "adjudicator"]].map(([id, role]) => ({ token: randomBytes(32).toString("base64url"), operator: { tenant: "citywheels", id, roles: [role] } }));
  const customerScope = { tenant: "citywheels", customer: "demo-customer" };
  const executorBookings = JSON.parse(readFileSync(join(root, "examples/citywheels/data/bookings.json"), "utf8")).map((b) => ({ id: b.id, ...customerScope, version: 1, status: b.status, startsAt: b.start,
    bookingFeeMinor: Math.round(b.booking_fee_eur * 100), display: { bikeType: b.bike_type, bikes: b.bikes, endsAt: b.end, addOns: b.add_ons }, rentalMinor: Math.round(b.rental_price_eur * 100), depositMinor: Math.round(b.deposit_eur * 100), currency: "EUR", paymentRef: `synthetic-original-${b.id}`, paymentKind: b.paid_with === "voucher" ? "voucher" : "card" }));
  const questionManifest = (packageDigest) => {
    for (const id of readdirSync(join(directory, "runs"))) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      let manifest;
      try { manifest = JSON.parse(readFileSync(join(directory, "runs", id, "manifest.json"), "utf8")); } catch { continue; }
      if (manifest.qualifications?.some((p) => p.digest === packageDigest)) return { manifest, runDirectory: join(directory, "runs", id) };
    }
    throw new Error("audit_casework_release_unavailable");
  };
  const casework = createCaseworkApi({ directory, identities: [{ token, operator: { tenant: "citywheels", id: "local-operator", roles: ["operator", "reviewer", "deployer"] }, experiments: true }, { token: customerToken, customer: customerScope }, ...reviewIdentities, ...caseworkIdentities],
    bookings: executorBookings, businessClock: () => new Date("2026-06-10T09:00:00+02:00"),
    questionKnowledge(p) { return { ...JSON.parse(readFileSync(join(root, "examples/citywheels/knowledge.json"), "utf8")), snapshot: p.components.sop }; },
    answerQuestion({ package: p, question, context }) {
      requireLoadedHost();
      const { manifest, runDirectory } = questionManifest(p.digest);
      if (manifest.provider !== "fake") throw new Error("audit_casework_question_provider_unavailable");
      return runCitywheelsQuestion({ root, pythonRoot: resolve(process.env.CITYWHEELS_PYTHON_ROOT ?? join(root, "../EternalChat copy/help-desk-agent/help-desk-agent")), directory,
        target: manifest.target, model: manifest.model, context, question, policyPath: manifest.target !== "python" ? join(runDirectory, "policy.json") : null });
    },
    resolveRelease(packageDigest) {
      requireLoadedHost();
      for (const id of readdirSync(join(directory, "runs"))) {
        if (!safeId(id)) continue;
        let manifest;
        try { manifest = JSON.parse(readFileSync(join(directory, "runs", id, "manifest.json"), "utf8")); } catch { continue; }
        if (!manifest.qualifications?.some((p) => p.digest === packageDigest)) continue;
        if (!["ai-audit", "python", "python-audit"].includes(manifest.target) || !["fake", "live"].includes(manifest.provider)) throw new Error("Invalid retained release");
        return prepareHelpdeskRelease({ store: qualificationStore(directory), root, evaluatorRoot, pythonRoot: resolve(process.env.CITYWHEELS_PYTHON_ROOT ?? join(root, "../EternalChat copy/help-desk-agent/help-desk-agent")), target: manifest.target, model: manifest.model, provider: manifest.provider, runDirectory: join(directory, "runs", id) });
      }
      throw new Error("Retained release unavailable");
    } });
  let active = false;
  let activeRunId = null;
  const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  const safeId = (id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
  const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };
  const scrub = (message) => process.env.OPENAI_API_KEY ? String(message).split(process.env.OPENAI_API_KEY).join("[KEY]") : String(message);
  const server = http.createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      const assets = { "/economics.sample.json": ["economics.sample.json", "application/json"], "/learning": ["learning.html", "text/html"], "/learning.js": ["learning.js", "text/javascript"], "/": ["index.html", "text/html"], "/ui.js": ["ui.js", "text/javascript"], "/ui.css": ["ui.css", "text/css"], "/casework": ["casework.html", "text/html"], "/casework.js": ["casework.js", "text/javascript"], "/casework.css": ["casework.css", "text/css"] };
      if (req.method === "GET" && Object.hasOwn(assets, url.pathname)) {
        const [name, type] = assets[url.pathname];
        res.writeHead(200, { "content-type": type }); res.end(readFileSync(join(root, "examples/citywheels/workbench", name))); return;
      }
      if (await casework.handle(req, res, url, `http://127.0.0.1:${server.address().port}`)) return;
      if (!workbenchAuthorized(req.headers["x-workbench-token"])) return json(res, 401, { error: "Open the full URL printed in the terminal, including its token fragment." });
      if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${server.address().port}`) return json(res, 403, { error: "Cross-origin request refused" });
      if (req.method === "GET" && url.pathname === "/api/config") return json(res, 200, { cases: suite.cases, testSets: { business: { name: "Business outcomes", cases: suite.cases }, ambiguity: { name: "Ambiguity and abstention", cases: ambiguity.cases } }, policy: baselinePolicy, liveAvailable: !!process.env.OPENAI_API_KEY?.trim(), home: directory });
      if (req.method === "GET" && url.pathname === "/api/runs") {
        return json(res, 200, experimentInventory(join(directory, "runs"), activeRunId));
      }
      if (req.method === "GET" && ["/api/run", "/api/artifact"].includes(url.pathname)) {
        const id = url.searchParams.get("id");
        if (!safeId(id)) return json(res, 400, { error: "Invalid run" });
        const runDirectory = join(directory, "runs", id);
        if (url.pathname === "/api/run") return json(res, 200, { manifest: JSON.parse(readFileSync(join(runDirectory, "manifest.json"), "utf8")), events: JSON.parse(readFileSync(join(runDirectory, "events.json"), "utf8")), report: existsSync(join(runDirectory, "report.json")) ? JSON.parse(readFileSync(join(runDirectory, "report.json"), "utf8")) : null });
        const file = url.searchParams.get("file");
        if (!["report.html", "report.json", "records.json", "programs.json", "policy.json", "manifest.json", "qualification.json"].includes(file) && !/^receipt-\d+\.html$/.test(file ?? "")) return json(res, 400, { error: "Unknown artifact" });
        res.writeHead(200, { "content-type": file.endsWith("html") ? "text/html" : "application/json" }); res.end(readFileSync(join(runDirectory, file))); return;
      }
      if (req.method !== "POST" || !["/api/compile", "/api/run"].includes(url.pathname)) return json(res, 404, { error: "Not found" });
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 128000) return json(res, 413, { error: "Request too large" }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (url.pathname === "/api/compile") {
        if (body.policy?.format !== "qdl-intent" || JSON.stringify(body.policy.outputs) !== JSON.stringify(baselinePolicy.outputs)) return json(res, 400, { error: "Use a QDL intent with the existing refund output contract" });
        const { Session } = await import("@quinelings/agent-sdk/v1");
        const artifact = new Session().compile(body.policy);
        const id = randomUUID(), destination = join(directory, "policies", id);
        mkdirSync(destination, { mode: 0o700 }); save(join(destination, "policy.json"), body.policy); save(join(destination, "artifact.json"), artifact);
        return json(res, 200, { id, artifactId: artifact.id, source: artifact.source, status: "compiled-draft", note: "Compilation does not qualify or approve a policy." });
      }
      if (active) return json(res, 409, { error: "A run is already active" });
      requireLoadedHost();
      if (!["ai-audit", "python", "python-audit"].includes(body.target) || !["fake", "live"].includes(body.mode)) return json(res, 400, { error: "Choose a target and provider mode" });
      if (body.mode === "live" && !process.env.OPENAI_API_KEY?.trim()) return json(res, 400, { error: "Start with an OPENAI_API_KEY environment variable for live calls" });
      if (body.target === "python" && body.policyId) return json(res, 400, { error: "QDL policy drafts apply to the ai-audit target only" });
      let policyPath;
      if (body.policyId) { if (!safeId(body.policyId)) return json(res, 400, { error: "Invalid policy draft" }); policyPath = join(directory, "policies", body.policyId, "policy.json"); if (!existsSync(policyPath)) return json(res, 404, { error: "Policy draft not found" }); }
      const regression = body.regressionId ? casework.regressions.executable({ tenant: "citywheels", id: "local-operator", roles: ["operator"] }, body.regressionId) : null;
      if (regression && (body.fullSuite || body.question !== undefined || body.caseId !== undefined)) return json(res, 400, { error: "Reviewed regressions use their immutable original input" });
      if (body.suite !== undefined && !["business", "ambiguity"].includes(body.suite)) return json(res, 400, { error: "Choose a known test set" });
      if (regression && body.suite !== undefined) return json(res, 400, { error: "Reviewed regressions use their immutable original input" });
      const selected = structuredClone(regression ? regression.suite : body.suite === "ambiguity" ? ambiguity : suite);
      if (!regression && !body.fullSuite) {
        const scenario = selected.cases.find((c) => c.id === body.caseId);
        if (!scenario) return json(res, 400, { error: "Select a known case" });
        if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 8000) return json(res, 400, { error: "Enter a question of up to 8000 characters" });
        scenario.input.question = body.question;
        selected.cases = [scenario]; selected.relations = [];
      }
      const model = body.mode === "live" ? body.model ?? "gpt-4o-mini" : body.target.startsWith("python") ? "python-fake" : "fake-helpdesk";
      if (typeof model !== "string" || !model || model.length > 100 || model.startsWith("--")) return json(res, 400, { error: "Invalid model name" });
      const id = randomUUID(), runDirectory = join(directory, "runs", id);
      mkdirSync(runDirectory, { mode: 0o700 });
      const policy = body.target !== "python" ? JSON.parse(readFileSync(policyPath ?? join(root, "examples/citywheels/refund.json"), "utf8")) : null;
      save(join(runDirectory, "policy.json"), policy); save(join(runDirectory, "suite.json"), selected);
      const releaseOptions = { store: qualificationStore(directory), root, evaluatorRoot, pythonRoot: resolve(process.env.CITYWHEELS_PYTHON_ROOT ?? join(root, "../EternalChat copy/help-desk-agent/help-desk-agent")), target: body.target, model, provider: body.mode, runDirectory };
      const release = prepareHelpdeskRelease(releaseOptions);
      save(join(runDirectory, "release.json"), release);
      const manifest = { id, createdAt: new Date().toISOString(), target: body.target, provider: body.mode, model, status: "running", caseCount: selected.cases.length, testSet: body.suite ?? "business", sampling: "development", directory: runDirectory, suiteHash: api.hash(selected), ...(regression ? { regression: { id: regression.id, digest: regression.digest, sourceCaseId: regression.source.caseId, publicationDigest: regression.source.publicationDigest } } : {}), policyHash: policy && api.hash(policy) };
      save(join(runDirectory, "manifest.json"), manifest);
      const events = [];
      const emit = (event) => { const row = { ...event, at: event.at ?? new Date().toISOString() }; events.push(row); save(join(runDirectory, "events.json"), events); if (!res.destroyed) res.write(JSON.stringify(row) + "\n"); };
      active = true; activeRunId = id;
      res.writeHead(200, { "content-type": "application/x-ndjson", "x-accel-buffering": "no" });
      const disconnected = new AbortController();
      res.on("close", () => { if (!res.writableEnded) disconnected.abort(); });
      emit({ type: "run-start", id, manifest });
      try {
        const target = { name: `Interactive ${body.target} / ${body.mode} / ${model}`, revision: release.targetRevision, execute(request, context) {
          emit({ type: "case-start", caseId: request.id, question: request.input.question });
          return new Promise((resolveOutput, reject) => {
            const pythonRoot = resolve(process.env.CITYWHEELS_PYTHON_ROOT ?? join(root, "../EternalChat copy/help-desk-agent/help-desk-agent"));
            const command = body.target !== "python" ? process.execPath : process.env.CITYWHEELS_PYTHON ?? "python3";
            const workerArgs = body.target === "ai-audit" ? [join(root, "examples/citywheels/scripts/citywheels-intentgauge.mjs")] : body.target === "python-audit" ? [join(root, "examples/citywheels/scripts/citywheels-python-audited.mjs"), pythonRoot] : ["-B", join(root, "examples/citywheels/scripts/citywheels-python.py"), pythonRoot];
            const child = spawn(command, [...workerArgs, "--events", ...(body.mode === "live" ? ["--live", "--model", model] : [])], { signal: AbortSignal.any([context.signal, disconnected.signal]), stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", ...(body.mode === "live" ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}), ...(policyPath ? { CITYWHEELS_REFUND_RULE: policyPath } : {}) } });
            let out = "", stderr = "", pending = "";
            child.stdout.on("data", (chunk) => { out += chunk; if (out.length > 2000000) child.kill(); });
            child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-5000); pending += chunk; const lines = pending.split("\n"); pending = lines.pop(); for (const line of lines) if (line.startsWith("CITYWHEELS_EVENT ")) { try { emit({ ...JSON.parse(line.slice(17)), caseId: request.id }); } catch {} } });
            child.on("error", reject); child.stdin.on("error", () => {});
            child.on("close", (code) => { if (code !== 0) return reject(new Error(scrub(stderr))); try { const output = JSON.parse(out); emit({ type: "answer", caseId: request.id, answer: output.answer, evidence: output.data.audit?.evidenceDirectory ?? output.data.evidenceDirectory }); emit({ type: "evaluating", caseId: request.id }); resolveOutput(output); } catch (error) { reject(error); } });
            child.stdin.end(JSON.stringify(request.input));
          });
        } };
        const report = await api.run(api.validateSuite(selected), target, { concurrency: 1, timeoutMs: 180000, evaluators: [...evaluators, ...businessEvaluators, ...ambiguityEvaluators] });
        await api.saveReport(report, join(runDirectory, "evaluation"));
        save(join(runDirectory, "report.json"), report);
        writeFileSync(join(runDirectory, "report.html"), readFileSync(join(runDirectory, "evaluation/report.html")), { mode: 0o600 });
        const records = [], programs = []; let receipts = 0;
        for (const row of report.results) {
          emit({ type: "evaluation", caseId: row.caseId, status: row.status, checks: row.checks, error: row.error });
          const evidence = row.output?.data?.audit?.evidenceDirectory ?? row.output?.data?.evidenceDirectory;
          if (evidence) save(join(evidence, "evaluation-link.json"), { caseId: row.caseId, report: join(runDirectory, "report.json"), reportHash: api.hash(report), status: row.status });
          const logPath = row.output?.data?.audit?.logPath;
          if (!logPath) continue;
          const log = new AuditLog(logPath), rows = log.read(), verification = log.verifyChain();
          records.push({ caseId: row.caseId, logPath, verification, records: rows });
          programs.push(...rows.filter((r) => r.kind === "program"));
          emit({ type: "audit", caseId: row.caseId, logPath, verification, records: rows.length });
          for (const decision of rows.filter((r) => r.qdl && r.refId)) {
            try { const receipt = await decisionReceipt(log, decision.refId); writeFileSync(join(runDirectory, `receipt-${receipts}.html`), renderReceipt(receipt), { mode: 0o600 }); emit({ type: "quineling", caseId: row.caseId, decisionId: decision.refId, status: decision.qdl.status, artifactId: decision.qdl.sourceHash, receipt: `receipt-${receipts++}.html`, trace: receipt.calculation.steps }); } catch (error) { emit({ type: "receipt-error", caseId: row.caseId, error: scrub(error.message) }); }
          }
        }
        save(join(runDirectory, "records.json"), records); save(join(runDirectory, "programs.json"), programs);
        const qualification = retainHelpdeskQualification({ home: directory, runDirectory, release, currentRelease: prepareHelpdeskRelease(releaseOptions), suite: selected, report });
        manifest.qualifications = qualification.packages.map(({ package: p, assessment }) => ({ digest: p.digest, intent: p.intent, evidencePassed: assessment.evidencePassed, readyForApproval: assessment.readyForApproval }));
        manifest.caseIds = [];
        for (const row of report.results) {
          const scenario = selected.cases.find((c) => c.id === row.caseId);
          const p = qualification.packages.find(({ package: p }) => p.intent === row.intent)?.package;
          if (!scenario || !p) continue;
          const audit = row.output?.data?.audit;
          const c = casework.cases.ingest({ scope: customerScope, intent: row.intent, qualificationDigest: p.digest, question: scenario.input.question, answer: row.output?.answer ?? "",
            origin: { runId: id, scenarioId: row.caseId, repetition: row.repetition, target: body.target, targetRevision: report.target.revision, evaluation: row.status, reportDigest: p.report.digest,
              audit: { available: body.target !== "python" && !!audit, chainVerified: body.target !== "python" ? audit?.chainVerified ?? null : null, records: body.target !== "python" ? audit?.records?.map(({ id, kind, hash }) => ({ id, kind, hash })) ?? [] : [] } } });
          if (!c.escalation && staffReferral(c.answer)) casework.cases.escalate({ tenant: c.tenant, id: "application-adapter", roles: ["operator"] }, c.id,
            { owner: "support-ops", reason: "application_referred_to_staff", summary: "The application referred this question to staff. Review the linked question, actual tool observations and applicable policies; no business completion is assumed.", dueAt: new Date(Date.now() + 4 * 3600000).toISOString() });
          manifest.caseIds.push(c.id);
        }
        if (regression) casework.regressions.recordRun({ tenant: "citywheels", id: "local-operator", roles: ["operator"] }, regression.id, { runId: id, reportDigest: qualification.packages[0].package.report.digest, targetRevision: report.target.revision, target: body.target, passed: report.passed, at: new Date().toISOString(), caseIds: manifest.caseIds }, evidenceDigest(selected));
        emit({ type: "cases-retained", caseIds: manifest.caseIds });
        emit({ type: "qualification", packages: manifest.qualifications, note: qualification.note });
        manifest.status = report.passed ? "passed" : "failed"; manifest.summary = report.summary.overall; manifest.receipts = receipts; manifest.finishedAt = new Date().toISOString();
        save(join(runDirectory, "manifest.json"), manifest);
        emit({ type: "complete", manifest });
      } catch (error) { manifest.status = "error"; save(join(runDirectory, "manifest.json"), manifest); emit({ type: "error", error: scrub(error.message), manifest }); }
      finally { active = false; activeRunId = null; res.end(); }
    } catch (error) { if (!res.headersSent) json(res, error.message === "audit_casework_host_changed_restart_required" ? 503 : 400, { error: scrub(error.message) }); else res.end(); }
  });
  server.listen(port, "127.0.0.1"); await once(server, "listening");
  const monitoringTimer = setInterval(() => casework.scanAll(), 30000);
  monitoringTimer.unref();
  server.once("close", () => clearInterval(monitoringTimer));
  return { server, token, customerToken, casework, directory, reviewUrls: reviewIdentities.map((identity) => ({ id: identity.operator.id, url: `http://127.0.0.1:${server.address().port}/learning#token=${identity.token}` })), url: `http://127.0.0.1:${server.address().port}/#token=${token}`, cockpitUrl: `http://127.0.0.1:${server.address().port}/casework#token=${token}`, customerUrl: `http://127.0.0.1:${server.address().port}/casework#token=${customerToken}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await startWorkbench();
  console.log(`Help-desk workbench: ${app.url}\nCasework cockpit: ${app.cockpitUrl}\nSynthetic customer inbox: ${app.customerUrl}\nRetained experiments: ${app.directory}\nIndependent reviewers: ${JSON.stringify(app.reviewUrls)}`);
}

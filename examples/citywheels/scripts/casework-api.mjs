import { CaseworkMonitoring } from "../../../dist/src/caseworkMonitoring.js";
import { readCitywheelsContext, validCitywheelsContext, verifyCitywheelsContext } from "../../../dist/examples/citywheels/src/context.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { QualificationStore, evidenceDigest } from "../../../dist/src/qualification.js";
import { AuthorityStore } from "../../../dist/src/authority.js";
import { CaseworkStore } from "../../../dist/src/casework.js";
import { analyzeCaseworkEconomics } from "../../../dist/src/caseworkEconomics.js";
import { CaseworkRegression } from "../../../dist/src/caseworkRegression.js";
import { CaseworkLearning } from "../../../dist/src/caseworkLearning.js";
import { hasDuplicateKeys } from "../../../dist/src/scan.js";
import { SyntheticCitywheelsBackend, SyntheticCancellationExecutor } from "../../../dist/examples/citywheels/src/executor.js";

const digest = (token) => createHash("sha256").update(token).digest("hex");
const sameCredential = (a, b) => timingSafeEqual(Buffer.from(digest(a), "hex"), Buffer.from(digest(b), "hex"));
const invalid = () => { throw new Error("audit_casework_invalid_request"); };
const fields = (body, allowed) => { if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) invalid(); };
const required = (value) => value ?? invalid();
const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };

export function createCaseworkApi({ directory, identities, resolveRelease, clock = () => new Date(), bookings = [], businessClock, answerQuestion, questionKnowledge }) {
  const qualifications = new QualificationStore(join(directory, "qualifications"));
  const authority = new AuthorityStore(join(directory, "casework-authority"), qualifications);
  const monitoring = new CaseworkMonitoring(join(directory, "casework-monitoring"), authority);
  const cases = new CaseworkStore(join(directory, "casework"), authority, { currency: "EUR", context: { source: "synthetic-citywheels-backend", valid: validCitywheelsContext } });
  const backend = new SyntheticCitywheelsBackend(join(directory, "casework-backend"), bookings);
  const executorFor = (c) => new SyntheticCancellationExecutor(join(directory, "casework-operations", c.id), backend, authority,
    () => resolveRelease(c.qualificationDigest), { intent: c.intent, autoApproveMinor: 10000, exceptionOwner: "refund-ops", ...(businessClock ? { businessClock } : {}) });
  const scopeFor = (c) => ({ tenant: c.tenant, customer: c.customer });
  const publicOperation = (op) => ({ proposal: op.proposal, status: op.status, consentAt: op.consentAt,
    review: op.review ? { verdict: op.review.verdict } : null, needsStaff: !!op.exception });
  const regressions = new CaseworkRegression(join(directory, "casework-regressions"));
  const learning = new CaseworkLearning(join(directory, "casework-learning"));
  const sessions = new Map();
  const pendingQuestions = new Set();
  for (const identity of identities) {
    if (typeof identity.token !== "string" || identity.token.length < 24 || sessions.has(digest(identity.token)) || !!identity.operator === !!identity.customer) throw new Error("Invalid casework identity configuration");
    sessions.set(digest(identity.token), structuredClone({ operator: identity.operator ?? null, customer: identity.customer ?? null, experiments: identity.experiments === true }));
  }
  const learningIdentities = (principal) => [...sessions.values()].map((s) => s.operator).filter((p) => p && p.tenant === principal.tenant && p.roles.some((r) => ["labeler", "adjudicator"].includes(r))).map((p) => ({ id: p.id, roles: p.roles.filter((r) => ["labeler", "adjudicator"].includes(r)) }));
  const checkAssignments = (principal, body) => {
    const configured = learningIdentities(principal);
    if (!Array.isArray(body.assigned) || !body.assigned.every((id) => configured.some((p) => p.id === id && p.roles.includes("labeler")))
      || !configured.some((p) => p.id === body.adjudicator && p.roles.includes("adjudicator"))) invalid();
  };
  const scopedPackages = (principal) => [...new Set(cases.list(principal).map((c) => c.qualificationDigest))];
  const grantFor = (principal, id) => authority.view(principal).grants.find((g) => g.id === id) ?? invalid();
  const operator = (session) => session.operator ?? (() => { throw new Error("audit_casework_forbidden"); })();
  const customer = (session) => session.customer ?? (() => { throw new Error("audit_casework_forbidden"); })();

  const monitoringSources = (principal) => {
    const rows = cases.list(principal);
    return { cases: rows, operations: rows.flatMap((c) => executorFor(c).list(scopeFor(c))), failures: learning.publishedFailures(principal) };
  };
  const scanMonitoring = (principal) => monitoring.scan(principal, monitoringSources(principal), resolveRelease, clock());
  const scanAll = () => {
    const tenants = [...new Set([...sessions.values()].filter((s) => s.operator?.roles.includes("operator")).map((s) => s.operator.tenant))];
    for (const tenant of tenants) {
      try { scanMonitoring({ tenant, id: "monitoring-host", roles: ["operator"] }); }
      catch { console.error(JSON.stringify({ event: "casework_monitoring_scan_failed", tenant, at: clock().toISOString() })); }
    }
  };

  async function handle(req, res, url, origin) {
    if (!url.pathname.startsWith("/api/casework/")) return false;
    try {
      const header = req.headers["x-workbench-token"], bearer = req.headers.authorization?.replace(/^Bearer /, "");
      if (header && bearer && !sameCredential(header, bearer)) return json(res, 401, { error: "casework_authentication_required" }), true;
      const credential = header ?? bearer;
      const session = typeof credential === "string" ? sessions.get(digest(credential)) : null;
      if (!session) return json(res, 401, { error: "casework_authentication_required" }), true;
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: "casework_cross_origin_refused" }), true;
      const route = url.pathname.slice("/api/casework/".length);
      if (session.operator && route !== "session" && !route.startsWith("learning") && !route.startsWith("regressions") && !session.operator.roles.some((r) => ["operator", "reviewer", "deployer"].includes(r))) throw new Error("audit_casework_forbidden");
      if (req.method === "GET") {
        if (route === "session") json(res, 200, { ...session, scope: "synthetic", channel: "local-outbox", executor: { automaticApprovalMinor: 10000, businessAt: (businessClock ? businessClock(clock()) : clock()).toISOString(), realPayments: false } });
        else if (route === "monitoring") json(res, 200, monitoring.view(operator(session)));
        else if (route === "regressions") json(res, 200, regressions.list(operator(session)));
        else if (route === "regressions/assignments") json(res, 200, regressions.assignments(operator(session)));
        else if (route === "learning/identities") { const p = operator(session); if (!p.roles.includes("operator")) throw new Error("audit_learning_forbidden"); json(res, 200, learningIdentities(p)); }
        else if (route === "learning/assignments") json(res, 200, learning.assignments(operator(session)));
        else if (route === "learning") json(res, 200, learning.list(operator(session)));
        else if (route === "cases") json(res, 200, cases.list(operator(session)));
        else if (/^cases\/[a-f0-9-]{36}\/evidence$/.test(route)) {
          const c = cases.get(operator(session), route.split("/")[1]), p = qualifications.load(c.qualificationDigest);
          if (c.origin.observation) json(res, 200, JSON.parse(qualifications.read(c.origin.observation).toString("utf8")));
          else {
            const report = JSON.parse(qualifications.read(p.report).toString("utf8"));
            json(res, 200, report.results.find((row) => row.caseId === c.origin.scenarioId && row.repetition === c.origin.repetition));
          }
        }
        else if (route.startsWith("cases/")) json(res, 200, cases.get(operator(session), route.slice(6)));
        else if (route === "requests") {
          const scope = customer(session);
          json(res, 200, cases.customerCases(scope).map((row) => cases.request(scope, row.runId)).filter(Boolean).map((c) => ({ caseId: c.id, question: c.question, bookingId: c.context?.bookingId, at: c.createdAt, delivered: c.delivery.state === "delivered", outcome: c.outcome.state })));
        }
        else if (route === "inbox") json(res, 200, cases.inbox(customer(session)));
        else if (route === "operations") {
          if (session.operator) json(res, 200, cases.list(operator(session)).flatMap((c) => executorFor(c).list(scopeFor(c))));
          else { const scope = customer(session); json(res, 200, cases.customerCases(scope).flatMap((c) => executorFor(c).list(scope)).map(publicOperation)); }
        }
        else if (route === "bookings") {
          if (session.customer) json(res, 200, backend.bookings(customer(session)));
          else {
            const principal = operator(session), rows = cases.list(principal);
            const scopes = [...new Map(rows.map((c) => [c.customer, scopeFor(c)])).values()];
            json(res, 200, scopes.flatMap((scope) => backend.bookings(scope)));
          }
        }
        else if (route === "insights") json(res, 200, cases.insights(operator(session)));
        else if (route === "authority") json(res, 200, authority.view(operator(session)));
        else if (route === "qualifications") {
          const principal = operator(session);
          const rows = scopedPackages(principal).map((id) => {
            const p = qualifications.load(id);
            try { return { package: p, assessment: qualifications.inspect(p, resolveRelease(id)) }; }
            catch { return { package: p, assessment: qualifications.inspect(p), currentReleaseUnavailable: true }; }
          });
          json(res, 200, rows);
        } else json(res, 404, { error: "casework_route_not_found" });
        return true;
      }
      if (req.method !== "POST") return json(res, 405, { error: "casework_method_not_allowed" }), true;
      if (!req.headers["content-type"]?.startsWith("application/json")) return json(res, 415, { error: "casework_json_required" }), true;
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 32000) return json(res, 413, { error: "casework_request_too_large" }), true; chunks.push(chunk); }
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      if (hasDuplicateKeys(raw)) invalid();
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: "casework_invalid_json" }), true; }
      const now = clock();
      if (route === "questions") {
        const scope = customer(session);
        fields(body, ["requestId", "question", "bookingId"]);
        if (typeof body.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(body.requestId) || typeof body.question !== "string" || !body.question.trim() || body.question.length > 8000 || typeof body.bookingId !== "string") invalid();
        const runId = evidenceDigest({ scope, requestId: body.requestId });
        const previous = cases.request(scope, runId);
        if (previous) {
          if (previous.question !== body.question || previous.context?.bookingId !== body.bookingId) throw new Error("audit_casework_request_conflict");
          return json(res, 200, { caseId: previous.id, status: "generated", delivered: previous.delivery.state === "delivered" }), true;
        }
        if (!answerQuestion || !questionKnowledge) throw new Error("audit_casework_questions_unavailable");
        if (pendingQuestions.has(evidenceDigest(scope)) || pendingQuestions.size >= 4) throw new Error("audit_casework_question_in_progress");
        const view = authority.view({ tenant: scope.tenant, id: "question-adapter", roles: ["operator"] });
        const grant = view.grants.find((g) => g.id === view.active[JSON.stringify([scope.tenant, "refund", "synthetic"])]);
        if (!grant) throw new Error("audit_authority_not_active");
        const current = resolveRelease(grant.packageDigest);
        const permission = authority.authorize({ tenant: scope.tenant, intent: "refund", scope: "synthetic", action: "deliver-answer", amountMinor: 0, currency: "EUR" }, current, now);
        const p = qualifications.load(permission.packageDigest);
        const knowledge = questionKnowledge(p);
        const context = readCitywheelsContext(backend, scope, body.bookingId, knowledge, now, businessClock ? businessClock(now) : now);
        pendingQuestions.add(evidenceDigest(scope));
        try {
          const output = await answerQuestion({ package: p, question: body.question, context });
          const finished = clock(), latest = resolveRelease(p.digest);
          const active = authority.authorize({ tenant: scope.tenant, intent: "refund", scope: "synthetic", action: "deliver-answer", amountMinor: 0, currency: "EUR" }, latest, finished);
          if (active.packageDigest !== p.digest) throw new Error("audit_casework_release_changed");
          verifyCitywheelsContext(backend, scope, context, latest.components.sop?.digest, finished, businessClock ? businessClock(finished) : finished);
          if (evidenceDigest(output.data?.operationalContext) !== evidenceDigest(context)) throw new Error("audit_casework_observation_mismatch");
          const audit = output.data?.audit;
          const auditEvidence = { available: !!audit, chainVerified: audit?.chainVerified ?? null, records: audit?.records?.map(({ id, kind, hash }) => ({ id, kind, hash })) ?? [] };
          const target = output.data?.execution === "actual-python-agent" ? "python" : output.data?.execution === "actual-python-agent-proxy-qdl" ? "python-audit" : output.data?.execution === "ai-audit-citywheels-agent" ? "ai-audit" : invalid();
          const observation = qualifications.put(JSON.stringify({ scope, question: body.question, answer: output.answer, intent: "refund", target, targetRevision: current.targetRevision, context, audit: auditEvidence, toolCalls: output.toolCalls, retrieved: output.retrieved }));
          const c = cases.ingest({ scope, intent: "refund", qualificationDigest: p.digest, question: body.question, answer: output.answer, origin: { runId, scenarioId: body.requestId, repetition: 0, target, targetRevision: current.targetRevision, evaluation: "not-evaluated", observation, reportDigest: p.report.digest, audit: auditEvidence } }, finished);
          return json(res, 201, { caseId: c.id, status: "generated", delivered: false }), true;
        } finally { pendingQuestions.delete(evidenceDigest(scope)); }
      }
      const operationRoute = /^cases\/([a-f0-9-]{36})\/operations(?:\/([a-f0-9]{64})\/(consent|review|execute|reconcile|resolve|renew))?$/.exec(route);
      if (operationRoute) {
        const [, caseId, operationId, action] = operationRoute;
        const c = session.customer ? cases.customerCases(customer(session)).find((c) => c.id === caseId) : cases.get(operator(session), caseId);
        if (!c) throw new Error("audit_casework_not_found");
        const scope = scopeFor(c), executor = executorFor(c);
        if (!action) {
          const principal = operator(session);
          if (c.intent !== "refund") throw new Error("audit_executor_unsupported_intent");
          fields(body, ["bookingId", "stormClaim"]);
          if (body.stormClaim !== undefined && typeof body.stormClaim !== "boolean") invalid();
          const op = executor.propose(scope, caseId, required(body.bookingId), now, body.stormClaim === true, principal.id);
          return json(res, 201, op), true;
        }
        if (action === "consent") {
          customer(session); fields(body, []);
          return json(res, 200, publicOperation(executor.consent(scope, operationId, now))), true;
        }
        if (action === "renew") {
          fields(body, []);
          const actor = session.customer ? customer(session).customer : operator(session).id;
          const result = executor.renew(scope, operationId, now, actor);
          return json(res, 200, session.customer ? publicOperation(result) : result), true;
        }
        const principal = operator(session);
        if (action === "review") { fields(body, ["verdict"]); return json(res, 200, executor.review(principal, operationId, required(body.verdict), now)), true; }
        if (action === "execute") {
          fields(body, ["fault"]);
          if (body.fault !== undefined && !["before-dispatch", "after-cancel", "after-refund", "refund-failure"].includes(body.fault)) invalid();
          return json(res, 200, executor.execute(scope, operationId, now, body.fault)), true;
        }
        if (action === "reconcile") { fields(body, []); return json(res, 200, executor.reconcile(scope, operationId, now)), true; }
        if (action === "resolve") { fields(body, []); return json(res, 200, executor.completeRefund(principal, scope, operationId, now)), true; }
      }
      const principal = operator(session);
      if (route === "monitoring/plans") {
        fields(body, ["intent", "expiresAt", "windowMs", "thresholds", "owner", "responseMinutes", "fallback"]);
        return json(res, 201, monitoring.configure(principal, { ...body, scope: "synthetic" }, now)), true;
      }
      if (route === "monitoring/scan") { fields(body, []); scanMonitoring(principal); return json(res, 200, monitoring.view(principal)), true; }
      const monitoringRoute = /^monitoring\/incidents\/([a-f0-9]{64})\/(restrict|recover)$/.exec(route);
      if (monitoringRoute) {
        const [, id, action] = monitoringRoute;
        if (action === "restrict") { fields(body, ["rationale"]); return json(res, 200, monitoring.restrict(principal, id, body.rationale, now)), true; }
        fields(body, ["packageDigest", "rationale"]);
        if (!scopedPackages(principal).includes(body.packageDigest)) throw new Error("audit_casework_forbidden");
        return json(res, 200, monitoring.recover(principal, id, body.packageDigest, body.rationale, resolveRelease(body.packageDigest), monitoringSources(principal), regressions.list(principal), now)), true;
      }
      if (route === "economics/analyze") {
        if (!principal.roles.includes("operator")) throw new Error("audit_economics_forbidden");
        fields(body, ["dataset"]); return json(res, 200, analyzeCaseworkEconomics(body.dataset)), true;
      }
      if (route === "learning") {
        fields(body, ["caseId", "intent", "question", "answer", "context", "source", "rubric", "assigned", "adjudicator"]);
        if (body.caseId !== null) invalid();
        checkAssignments(principal, body);
        return json(res, 201, learning.create(principal, body, now)), true;
      }
      const caseLearningRoute = /^cases\/([a-f0-9-]{36})\/learning$/.exec(route);
      if (caseLearningRoute) {
        fields(body, ["rubric", "assigned", "adjudicator", "context"]);
        const c = cases.get(principal, caseLearningRoute[1]), p = qualifications.load(c.qualificationDigest);
        checkAssignments(principal, body);
        const suite = JSON.parse(qualifications.read(p.suite).toString("utf8"));
        const patch = suite.cases?.find((row) => row.id === c.origin.scenarioId)?.input?.policyPatch;
        const documents = (p.components.sop?.files ?? []).filter((file) => !patch || !file.path.endsWith(`/` + patch.file)).map((file) => ({ source: file.path, digest: file.digest, text: qualifications.read({ digest: file.digest, bytes: file.bytes }).toString("utf8") }));
        if (patch && typeof patch.text === "string") documents.push({ source: `isolated-fixture/policies/${patch.file}`, digest: qualifications.put(patch.text).digest, text: patch.text });
        const result = learning.create(principal, { caseId: c.id, intent: c.intent, question: c.question, answer: c.answer,
          context: { documents, operatorFacts: required(body.context), factsAttestedBy: principal.id },
          source: { family: evidenceDigest({ scenario: c.origin.scenarioId, question: c.question }), kind: "synthetic", sampling: "development", split: "dev", owner: principal.id, reference: c.id, sanitized: true, exposedToDevelopment: true },
          rubric: body.rubric, assigned: body.assigned, adjudicator: body.adjudicator }, now);
        return json(res, 201, result), true;
      }
      const regressionCreate = /^learning\/([a-f0-9-]{36})\/regression$/.exec(route);
      if (regressionCreate) {
        fields(body, ["assertions", "reviewer"]);
        const task = learning.list(principal).find((t) => t.id === regressionCreate[1]);
        if (!task?.published || !task.caseId) throw new Error("audit_regression_published_case_required");
        if (!learningIdentities(principal).some((p) => p.id === body.reviewer && p.roles.includes("labeler"))) invalid();
        const c = cases.get(principal, task.caseId), p = qualifications.load(c.qualificationDigest);
        const suite = JSON.parse(qualifications.read(p.suite).toString("utf8"));
        const scenario = suite.cases.find((row) => row.id === c.origin.scenarioId);
        if (!scenario) throw new Error("audit_regression_source_missing");
        const published = learning.publish(principal, task.id, now), reviewed = learning.reviewedSample(principal, task.id);
        if (!published.gold && (!c.escalation || c.escalation.status === "resolved")) cases.escalate(principal, c.id, { owner: "quality-ops", reason: "human_review_failed", summary: `Published independent review ${task.id} rejected the observed answer. Inspect the reviewed regression expectations and actual reruns before resolving.`, dueAt: new Date(now.getTime() + 4 * 3600000).toISOString() }, now);
        return json(res, 201, regressions.create(principal, { source: { caseId: c.id, taskId: task.id, publicationDigest: published.digest, observationDigest: c.origin.reportDigest, gold: published.gold }, evidence: { context: reviewed.context, rubric: reviewed.rubric, snapshotDigest: reviewed.snapshotDigest }, intent: c.intent, input: scenario.input, assertions: body.assertions, reviewer: body.reviewer }, now)), true;
      }
      const regressionReview = /^regressions\/([a-f0-9-]{36})\/review$/.exec(route);
      if (regressionReview) { fields(body, ["approved", "rationale"]); return json(res, 200, regressions.review(principal, regressionReview[1], body.approved, body.rationale, now)), true; }
      const learningRoute = /^learning\/([a-f0-9-]{36})\/(label|adjudicate|judge|publish)$/.exec(route);
      if (learningRoute) {
        const [, id, action] = learningRoute;
        if (action === "label" || action === "adjudicate") {
          fields(body, ["value"]); learning[action](principal, id, required(body.value), now);
          return json(res, 200, { saved: true }), true;
        }
        if (action === "judge") { fields(body, ["name", "revision", "value", "source"]); learning.recordJudge(principal, id, body, now); return json(res, 200, { saved: true }), true; }
        fields(body, []); return json(res, 200, learning.publish(principal, id, now)), true;
      }
      if (route === "learning/calibration") {
        fields(body, ["ids", "rubricDigest", "judge"]);
        return json(res, 200, learning.calibrationInput(principal, body.ids, body.rubricDigest, body.judge, now)), true;
      }
      if (route === "grants/approve") {
        fields(body, ["packageDigest", "tier", "limits", "expiresAt", "acceptsMutableModel"]);
        if (!scopedPackages(principal).includes(body.packageDigest)) throw new Error("audit_casework_forbidden");
        const result = authority.approve(principal, { ...body, scope: "synthetic" }, resolveRelease(body.packageDigest), now);
        return json(res, 201, result), true;
      }
      if (route === "grants/activate") {
        fields(body, ["grantId"]);
        const g = grantFor(principal, required(body.grantId));
        monitoring.scan(principal, monitoringSources(principal), resolveRelease, now);
        monitoring.prepareActivation(principal, g, monitoringSources(principal), now);
        const activated = authority.activate(principal, g.id, resolveRelease(g.packageDigest), now);
        monitoring.recordActivation(principal, activated, now);
        return json(res, 200, activated), true;
      }
      if (route === "grants/revoke") {
        fields(body, ["grantId", "reason"]);
        const g = grantFor(principal, required(body.grantId));
        authority.revoke(principal, g.id, required(body.reason), now);
        return json(res, 200, { revoked: g.id }), true;
      }
      const match = /^cases\/([a-f0-9-]{36})\/(review|deliver|outcome|escalate|handoff|cost)$/.exec(route);
      if (!match) return json(res, 404, { error: "casework_route_not_found" }), true;
      const [, id, action] = match;
      const c = cases.get(principal, id);
      let result;
      if (action === "review") { fields(body, ["verdict"]); result = cases.review(principal, id, required(body.verdict), now); }
      if (action === "deliver") { fields(body, []); result = cases.deliver(principal, id, resolveRelease(c.qualificationDigest), now, (row) => verifyCitywheelsContext(backend, scopeFor(row), row.context, resolveRelease(row.qualificationDigest).components.sop?.digest, now, businessClock ? businessClock(now) : now)); }
      if (action === "outcome") { fields(body, ["state", "code"]); result = cases.outcome(principal, id, required(body.state), required(body.code), now); }
      if (action === "escalate") { fields(body, ["owner", "reason", "summary", "dueAt"]); result = cases.escalate(principal, id, body, now); }
      if (action === "handoff") { fields(body, ["action"]); result = cases.handoff(principal, id, required(body.action), now); }
      if (action === "cost") { fields(body, ["kind", "amountMinor", "currency", "basis", "source"]); result = cases.recordCost(principal, id, body, now); }
      json(res, 200, result); return true;
    } catch (error) {
      const code = error instanceof Error && /^(?:audit_(?:casework|authority|qualification|executor|learning|regression|economics|monitoring)|synthetic_crash)_[a-z_]+$/.test(error.message) ? error.message : "casework_unavailable";
      const status = code.endsWith("_forbidden") ? 403 : code.endsWith("_not_found") || code.endsWith("_unknown_operation") ? 404 : error.code === "EEXIST" ? 503 : code === "casework_unavailable" ? 500 : 409;
      json(res, status, { error: code }); return true;
    }
  }
  return { monitoring, scanAll, cases, authority, qualifications, backend, executorFor, learning, regressions, handle };
}

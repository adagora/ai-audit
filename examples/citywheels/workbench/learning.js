const token = new URLSearchParams(location.hash.slice(1)).get("token");
const notice = document.querySelector("#notice"), container = document.querySelector("#assignments");
const node = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
async function request(path, body) {
  const response = await fetch(`/api/casework/${path}`, { headers: { "x-workbench-token": token ?? "", "content-type": "application/json" }, signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Review unavailable");
  return result;
}
async function refresh() {
  try {
    const session = await request("session"), [tasks, regressions] = await Promise.all([request("learning/assignments"), request("regressions/assignments")]);
    document.querySelector("#identity").textContent = `${session.operator.id} · ${session.operator.tenant}`;
    container.replaceChildren();
    if (!tasks.length && !regressions.length) container.append(node("p", "No assignments yet. An operator must assign a versioned sample and rubric to your identity."));
    for (const task of tasks) {
      const card = node("article", "");
      card.append(node("h2", task.intent), node("p", `Task ${task.id} · ${task.state}`), node("h3", "Question"), node("p", task.question), node("h3", "Observed answer"), node("p", task.answer), node("h3", `Rubric ${task.rubric.id} / ${task.rubric.revision}`), node("p", task.rubric.text), node("h3", "Source context"));
      const context = node("pre", JSON.stringify(task.context, null, 2)); context.style.whiteSpace = "pre-wrap"; context.style.overflowWrap = "anywhere"; card.append(context);
      card.append(node("p", `${task.source.kind} · ${task.source.split} · ${task.submitted}/2 human labels locked`));
      if (task.peerLabels) card.append(node("p", `Locked human disagreement: ${task.peerLabels.map((l) => `${l.reviewer}: ${l.value ? "meets" : "fails"}`).join("; ")}`));
      const own = task.adjudicator ? task.adjudication : task.ownLabel;
      if (own) card.append(node("p", `Your locked decision: ${own.value ? "meets rubric" : "fails rubric"}`));
      else if (!task.adjudicator || task.peerLabels) {
        for (const value of [true, false]) {
          const button = node("button", value ? "Lock: meets rubric" : "Lock: fails rubric");
          button.addEventListener("click", async () => {
            button.disabled = true;
            try { await request(`learning/${task.id}/${task.adjudicator ? "adjudicate" : "label"}`, { value }); notice.textContent = "Decision locked."; await refresh(); }
            catch (error) { notice.textContent = error.message; button.disabled = false; }
          });
          card.append(button);
        }
      } else card.append(node("p", "Adjudication becomes available only after two conflicting labels are locked."));
      container.append(card);
    }
    for (const regression of regressions) {
      const card = node("article", "");
      card.append(node("h2", "Review regression expectations"), node("p", `Regression ${regression.id}`), node("p", "This review checks executable expectations against independent facts. It does not relabel the old answer or grant authority."));
      const evidence = node("pre", JSON.stringify({ source: regression.source, evidence: regression.evidence, suite: regression.suite, digest: regression.digest }, null, 2));
      evidence.style.whiteSpace = "pre-wrap"; evidence.style.overflowWrap = "anywhere"; card.append(evidence);
      if (regression.review) card.append(node("p", `Locked expectation review: ${regression.review.approved ? "approved" : "rejected"} · ${regression.review.rationale}`));
      else {
        const label = node("label", "Reason for your expectation review"), rationale = node("textarea", ""); rationale.rows = 3; rationale.required = true; label.append(rationale); card.append(label);
        for (const approved of [true, false]) {
          const button = node("button", approved ? "Approve regression expectations" : "Reject regression expectations");
          button.addEventListener("click", async () => {
            if (!rationale.value.trim()) { notice.textContent = "Supply the independent facts supporting your expectation review."; return; }
            button.disabled = true;
            try { await request(`regressions/${regression.id}/review`, { approved, rationale: rationale.value }); notice.textContent = "Expectation review locked."; await refresh(); }
            catch (error) { notice.textContent = error.message; button.disabled = false; }
          }); card.append(button);
        }
      }
      container.append(card);
    }
  } catch (error) { notice.textContent = error.message; }
}
document.querySelector("#refresh").addEventListener("click", refresh);
await refresh();

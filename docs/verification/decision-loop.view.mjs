const verdict = { approved: "approved", overridden: "taken over", rejected: "rejected" };
const latest = (v) => {
  const n = Object.keys(v.reviews).length;
  return n ? v.reviews[n] : undefined;
};

export const title = "A decision after the answer: rule, verdict, action";

export const state = (v) => {
  const last = latest(v);
  switch (v.app) {
    case "start": return "Decision recorded";
    case "waiting": return last ? "Verdict recorded, app not told yet" : "Waiting for a person";
    case "acting": return "App about to act";
    case "skipping": return "App about to skip";
    case "recording": return "Action done, not recorded yet";
    case "gave up": return last === "approved" ? "App gave up, then approved" : "App gave up waiting";
    default: {
      if (v.effect === "skipped") return last === "approved" ? "Skipped, then approved" : "Skipped";
      const at = v.effectAt, authorized = at > 0 ? v.reviews[at] === "approved" : v.allowed;
      return authorized ? "Done and authorized" : "Done, flagged as without approval";
    }
  }
};

export const group = (v) => {
  if (["start", "waiting"].includes(v.app)) return "decide";
  if (["acting", "skipping", "recording"].includes(v.app)) return "act";
  return "end";
};
export const colors = { decide: "blue", act: "yellow", end: "teal" };

export const step = (action, from, to) => {
  switch (action) {
    case "PersonReviews": return `a person records ${verdict[latest(to)]}`;
    case "RuleAllows": return "the rule allows the action";
    case "AppAwaits": return "the rule asks for a person";
    case "VerdictArrives": return latest(from) === "approved" ? "the app reads approved" : "the app reads rejected or taken over";
    case "AwaitTimesOut": return "the wait times out";
    case "AppActs": return "the app acts";
    case "AppRecordsDone": return state(to) === "Done and authorized" ? "the app records done" : "the app records done [a reject or take-over came first]";
    case "AppRecordsSkip": return "the app records skipped";
    default: return null;
  }
};

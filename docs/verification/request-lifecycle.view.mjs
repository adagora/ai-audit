export const title = "One request through the proxy, with the log, the disk, the client and the provider failing at any step";

export const state = (v) => {
  switch (v.pc) {
    case "start": return "Request received";
    case "inspect": return "Inspected and decided";
    case "fetch": return "Forwarded to the provider";
    case "stream": return "Answer streaming to the client";
    case "write": return "Answer delivered, record not written yet";
    default:
      if (v.crashed) return "Proxy crashed";
      if (v.refused) return "Refused, refusal recorded";
      if (v.logs === 1) return v.delivered ? "Delivered and recorded" : "Stopped and recorded";
      if (v.failCounted) return v.delivered ? "Delivered, record lost and counted" : "Stopped, failure counted";
      return "Ended without a trace";
  }
};

export const group = (v) => (["start", "inspect"].includes(v.pc) ? "decide" : ["fetch", "stream", "write"].includes(v.pc) ? "provider" : "end");
export const colors = { decide: "blue", provider: "yellow", end: "teal" };

export const step = (action, from, to) => {
  const ended = to.pc === "done";
  switch (action) {
    case "Start": return ended ? "the log is broken: 503" : "the log is writable";
    case "Forward": return ended ? "the log broke during inspection: 503" : "the log is still writable, the proxy forwards";
    case "BlockOrReject": return to.logs === 1 && !to.refused ? "blocked or rejected, recorded" : "blocked or rejected, but the record fails";
    case "FetchErr": return to.logs === 1 && !to.refused ? "no answer from the provider, recorded" : "no answer from the provider, the record fails";
    case "Headers": return "the provider answers";
    case "StreamEnd": return "the answer is delivered";
    case "Final": return to.logs === 1 ? "the record is written" : "the record fails";
    case "InternalError": return "an internal error";
    case "ClientClose": return "the client goes away";
    case "Timeout": return "the deadline passes";
    case "LogGoesBad": return "the log breaks";
    case "DiskFills": return "the disk fills";
    case "UsageChunk": return "usage arrives";
    default: return null;
  }
};

export const title = "The log series: appends, rotation, a crash and a prune";

const writer = (v) => Object.values(v.pc)[0];

export const state = (v) => {
  const closed = v.closed.length, pruned = v.gone.length > 0;
  if (writer(v) === "segment") return "File renamed, new file not started";
  if (writer(v) === "dead" && !v.curExists && closed) return "Writer died after the rename";
  if (v.ppc === "unlink") return "Prune recorded, segments not deleted yet";
  if (!v.curExists && !closed) return pruned ? "Every file pruned" : "No log yet";
  if (!closed) return pruned ? "Current file after a prune" : "One file";
  return pruned ? "Segments after a prune" : "Closed segments and a current file";
};

export const group = (v) => (["segment", "dead"].includes(writer(v)) || v.ppc === "unlink" ? "between" : "steady");
export const colors = { steady: "teal", between: "yellow" };

export const step = (action, from, to) => {
  switch (action) {
    case "Write": return "a record is appended";
    case "Rotate": return "the file is rotated";
    case "StartSegment": return "the new file starts with a link to the closed one";
    case "Check": return writer(to) === "segment" ? "the next append finds no current file" : null;
    case "Crash": return "the writer dies";
    case "PruneRead": return "prune lists old segments";
    case "PruneRecord": return from.curExists ? "prune records them" : "prune records them in a new file";
    case "PruneUnlink": return "prune deletes a segment";
    case "PruneCrash": return "prune dies";
    default: return null;
  }
};

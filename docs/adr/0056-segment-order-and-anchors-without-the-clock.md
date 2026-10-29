# 56. Segment order and pruned anchors do not depend on the wall clock
Status: Proposed (2026-10-29). Supersedes the segment name and the pruned-anchor rule of [0049](0049-log-segments-and-retention.md).
## Context
ADR 0049 names a closed segment after the UTC time of its rotation, orders the series by name, and counts an anchor that matches no kept file as pruned when its time is earlier than the first record of the first kept segment. The TLA+ model of the chain (`spec/AuditChain.tla`), brought up to rotation and prune, found three ways to break an honest log, and each one was replayed on the code:
- The wall clock steps back (an NTP correction, a resumed VM) between two rotations. The newer segment gets an earlier name and sorts first, the next file links to the wrong segment, and `verify` reports `segment does not continue` from then on.
- An anchor is taken in the same millisecond as the rotation that closes its file, or before a clock step back, and that file is pruned. `verifyAnchors` reports `swapped`, the verdict for a replaced log.
- After a prune removed every closed segment and the clock stepped back, a rotation reuses a pruned name, and a running `prune` deletes the new file by that name.
## Decision
- A rotation names the closed segment after the later of its UTC time and 1 ms after the newest closed segment or the segment that the current file links to. Names increase along the series, and a name is never used twice in it. A name can be later than the wall clock.
- `anchor` stores `first`, the hash of the first record of the file it read. Each segment in a `prune` record stores `first` too. An anchor with `first` that matches no kept file counts as pruned only when its file is no longer present and a `prune` record lists a segment with that `first`. An anchor without `first`, from before this change, keeps the time rule of ADR 0049.
## Consequences
- `verify` and `verify --anchors` give the same answer whatever the clock did. No anchor of a kept file can be excused as pruned.
- Segment names still sort as times and still show roughly when a rotation happened. After a clock step back, a name can run ahead of the records' own `ts`.
- Anchor and `prune` records are one field longer. Old anchors files and old `prune` records stay valid.
- The model checks these rules with a clock that may step back once; `AuditChain_clockback.cfg` and `AuditChain_clockback_anchors.cfg` keep the old rules and must fail.

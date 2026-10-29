---- MODULE AuditChain ----
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS Writers, PerWriter, RotateAt, MaxCrashes, MaxAnchors, UseLock, Restart, RecordBeforeUnlink, ClockBack, SplitCreate
CONSTANTS NameAfterNewest, AnchorBySegment
VARIABLES cur, curExists, closed, holder, pc, seen, tries, rts, nseg, written, clock, backs, crashes, ppc, pold, gone, anchors, apc, aseen
vars == <<cur, curExists, closed, holder, pc, seen, tries, rts, nseg, written, clock, backs, crashes, ppc, pold, gone, anchors, apc, aseen>>

G == <<"g", 0>>
NoLink == [file |-> 0, count |-> 0, head |-> G]
Rec(id, prev, link, ts, pruned) == [id |-> id, prev |-> prev, link |-> link, ts |-> ts, pruned |-> pruned]
Tip(s) == IF s = <<>> THEN G ELSE s[Len(s)].id
Recs(s) == {s[i] : i \in DOMAIN s}
Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Names == {f.name : f \in closed}
Seg(n) == CHOOSE f \in closed : f.name = n
LinkTo(n) == [file |-> n, count |-> Len(Seg(n).recs), head |-> Tip(Seg(n).recs)]
PresentRecs == UNION {Recs(f.recs) : f \in closed} \cup Recs(cur)
PrunedEntries == UNION {r.pruned : r \in PresentRecs}
PrunedNames == {e.name : e \in PrunedEntries}
PrunedFirsts == {e.first : e \in PrunedEntries}
PresentFirsts == {f.recs[1].id : f \in closed} \cup (IF cur # <<>> THEN {cur[1].id} ELSE {})
FirstFile == IF closed # {} THEN Seg(Min(Names)).recs ELSE cur
PrunedBefore == IF FirstFile # <<>> /\ FirstFile[1].link # NoLink THEN FirstFile[1].ts ELSE 0
Linked == IF cur # <<>> /\ cur[1].link # NoLink THEN {cur[1].link.file} ELSE {}
RotationName == IF NameAfterNewest THEN Max({clock} \cup {n + 1 : n \in Names \cup Linked}) ELSE clock

Init == /\ cur = <<>> /\ curExists = FALSE /\ closed = {} /\ holder = "none"
        /\ pc = [w \in Writers |-> "idle"] /\ seen = [w \in Writers |-> G] /\ tries = [w \in Writers |-> 0]
        /\ rts = [w \in Writers |-> 0] /\ nseg = 0 /\ written = {} /\ clock = 1 /\ backs = 0 /\ crashes = 0
        /\ ppc = "read" /\ pold = {} /\ gone = {}
        /\ anchors = <<>> /\ apc = "read" /\ aseen = [count |-> 0, head |-> G, ts |-> 0, first |-> G]

Go(w, to) == pc' = [pc EXCEPT ![w] = to]
Fail(w) == /\ Go(w, "idle") /\ holder' = IF holder = w THEN "none" ELSE holder
WriterVars == <<pc, seen, tries, rts, holder>>
FileVars == <<cur, curExists, closed, nseg>>
Others == <<written, backs, crashes, ppc, pold, gone, anchors, apc, aseen>>

Acquire(w) == /\ pc[w] = "idle" /\ tries[w] < PerWriter
              /\ IF UseLock THEN holder = "none" /\ holder' = w ELSE UNCHANGED holder
              /\ tries' = [tries EXCEPT ![w] = @ + 1] /\ Go(w, "check")
              /\ UNCHANGED <<seen, rts, clock>> /\ UNCHANGED FileVars /\ UNCHANGED Others

Rotate(w) == /\ pc[w] = "check" /\ curExists /\ Len(cur) >= RotateAt
             /\ IF RotationName \in Names
                THEN Fail(w) /\ UNCHANGED <<clock, rts>> /\ UNCHANGED FileVars
                ELSE /\ closed' = closed \cup {[name |-> RotationName, recs |-> cur]} /\ cur' = <<>> /\ curExists' = FALSE
                     /\ rts' = [rts EXCEPT ![w] = RotationName] /\ clock' = clock + 1 /\ Go(w, "segment")
                     /\ UNCHANGED <<holder, nseg>>
             /\ UNCHANGED <<seen, tries>> /\ UNCHANGED Others

Check(w) == /\ pc[w] = "check" /\ ~(curExists /\ Len(cur) >= RotateAt)
            /\ IF Restart /\ cur = <<>> /\ closed # {}
               THEN rts' = [rts EXCEPT ![w] = clock] /\ clock' = clock + 1 /\ Go(w, "segment")
               ELSE Go(w, "tail") /\ UNCHANGED <<rts, clock>>
            /\ UNCHANGED <<seen, tries, holder>> /\ UNCHANGED FileVars /\ UNCHANGED Others

SegmentRec(ts) == Rec(<<"s", nseg + 1>>, G, LinkTo(Max(Names)), ts, {})

StartSegment(w) == /\ pc[w] = "segment"
                   /\ IF closed = {} \/ cur # <<>>
                      THEN Fail(w) /\ UNCHANGED FileVars
                      ELSE IF SplitCreate
                      THEN curExists' = TRUE /\ cur' = <<>> /\ Go(w, "fill") /\ UNCHANGED <<closed, nseg, holder>>
                      ELSE /\ cur' = <<SegmentRec(rts[w])>> /\ curExists' = TRUE /\ nseg' = nseg + 1
                           /\ Go(w, "tail") /\ UNCHANGED <<closed, holder>>
                   /\ UNCHANGED <<seen, tries, rts, clock>> /\ UNCHANGED Others

Fill(w) == /\ pc[w] = "fill" /\ cur' = <<SegmentRec(rts[w])>> /\ nseg' = nseg + 1 /\ Go(w, "tail")
           /\ UNCHANGED <<curExists, closed, seen, tries, rts, holder, clock>> /\ UNCHANGED Others

ReadTail(w) == /\ pc[w] = "tail" /\ seen' = [seen EXCEPT ![w] = Tip(cur)] /\ Go(w, "write")
               /\ UNCHANGED <<tries, rts, holder, clock>> /\ UNCHANGED FileVars /\ UNCHANGED Others

Write(w) == /\ pc[w] = "write"
            /\ cur' = Append(cur, Rec(<<w, tries[w]>>, seen[w], NoLink, 0, {})) /\ curExists' = TRUE
            /\ written' = written \cup {<<w, tries[w]>>}
            /\ Go(w, "idle") /\ holder' = IF holder = w THEN "none" ELSE holder
            /\ UNCHANGED <<closed, nseg, seen, tries, rts, clock, backs, crashes, ppc, pold, gone, anchors, apc, aseen>>

Crash(w) == /\ crashes < MaxCrashes /\ pc[w] \in {"check", "segment", "fill", "tail", "write"}
            /\ crashes' = crashes + 1 /\ Go(w, "dead") /\ holder' = IF holder = w THEN "none" ELSE holder
            /\ UNCHANGED <<seen, tries, rts, clock, written, backs, ppc, pold, gone, anchors, apc, aseen>> /\ UNCHANGED FileVars

PruneRead == /\ ppc = "read" /\ closed # {}
             /\ \E k \in 1..Cardinality(closed) :
                  pold' = {[name |-> n, first |-> Seg(n).recs[1].id] : n \in {n \in Names : Cardinality({m \in Names : m <= n}) <= k}}
             /\ ppc' = IF RecordBeforeUnlink THEN "record" ELSE "unlink"
             /\ UNCHANGED <<clock, written, backs, crashes, gone, anchors, apc, aseen>> /\ UNCHANGED WriterVars /\ UNCHANGED FileVars

PruneRecord == /\ ppc = "record" /\ (UseLock => holder = "none")
               /\ LET restart == Restart /\ cur = <<>> /\ closed # {}
                      base == IF restart THEN <<SegmentRec(clock)>> ELSE cur
                  IN /\ cur' = Append(base, Rec(<<"p", 1>>, Tip(base), NoLink, clock, pold)) /\ curExists' = TRUE
                     /\ nseg' = IF restart THEN nseg + 1 ELSE nseg
               /\ clock' = clock + 1 /\ ppc' = IF RecordBeforeUnlink THEN "unlink" ELSE "done"
               /\ UNCHANGED <<closed, pold, written, backs, crashes, gone, anchors, apc, aseen>> /\ UNCHANGED WriterVars

PruneUnlink == /\ ppc = "unlink"
               /\ IF {e.name : e \in pold} \cap Names = {}
                  THEN ppc' = (IF RecordBeforeUnlink THEN "done" ELSE "record") /\ UNCHANGED <<closed, gone>>
                  ELSE LET n == Min({e.name : e \in pold} \cap Names) IN
                       /\ gone' = gone \cup {r.id : r \in Recs(Seg(n).recs)}
                       /\ closed' = closed \ {Seg(n)} /\ UNCHANGED ppc
               /\ UNCHANGED <<cur, curExists, nseg, pold, clock, written, backs, crashes, anchors, apc, aseen>> /\ UNCHANGED WriterVars

PruneCrash == /\ crashes < MaxCrashes /\ ppc \in {"record", "unlink"}
              /\ crashes' = crashes + 1 /\ ppc' = "dead"
              /\ UNCHANGED <<pold, clock, written, backs, gone, anchors, apc, aseen>> /\ UNCHANGED WriterVars /\ UNCHANGED FileVars

AnchorRead == /\ apc = "read" /\ Len(anchors) < MaxAnchors
              /\ aseen' = [count |-> Len(cur), head |-> Tip(cur), ts |-> clock, first |-> IF cur = <<>> THEN G ELSE cur[1].id]
              /\ clock' = clock + 1 /\ apc' = "write"
              /\ UNCHANGED <<written, backs, crashes, ppc, pold, gone, anchors>> /\ UNCHANGED WriterVars /\ UNCHANGED FileVars
AnchorWrite == /\ apc = "write" /\ anchors' = Append(anchors, aseen) /\ apc' = "read"
               /\ UNCHANGED <<clock, written, backs, crashes, ppc, pold, gone, aseen>> /\ UNCHANGED WriterVars /\ UNCHANGED FileVars

ClockStepBack == /\ ClockBack /\ backs = 0 /\ clock > 1 /\ backs' = 1 /\ clock' \in 1..(clock - 1)
                 /\ UNCHANGED <<written, crashes, ppc, pold, gone, anchors, apc, aseen>> /\ UNCHANGED WriterVars /\ UNCHANGED FileVars

Next == \/ \E w \in Writers : Acquire(w) \/ Rotate(w) \/ Check(w) \/ StartSegment(w) \/ Fill(w) \/ ReadTail(w) \/ Write(w) \/ Crash(w)
        \/ PruneRead \/ PruneRecord \/ PruneUnlink \/ PruneCrash
        \/ AnchorRead \/ AnchorWrite \/ ClockStepBack
Spec == Init /\ [][Next]_vars

Chain(s) == \A i \in 1..Len(s) : s[i].prev = IF i = 1 THEN G ELSE s[i - 1].id
Continues(s, before) == IF before = {}
                        THEN (s # <<>> /\ s[1].link # NoLink) => s[1].link.file \in PrunedNames
                        ELSE s # <<>> /\ s[1].link = LinkTo(Max(before))
ChainIntact == /\ \A f \in closed : Chain(f.recs) /\ Continues(f.recs, {m \in Names : m < f.name})
               /\ curExists => Chain(cur) /\ Continues(cur, Names)
NoLostEntries == written \subseteq {r.id : r \in PresentRecs} \cup gone
AnchorsConsistent == \A j \in 1..Len(anchors) :
     LET a == anchors[j] IN
     \/ a.count = 0 /\ a.head = G
     \/ \E s \in {f.recs : f \in closed} \cup {cur} : a.count \in 1..Len(s) /\ s[a.count].id = a.head
     \/ IF AnchorBySegment THEN a.first \notin PresentFirsts /\ a.first \in PrunedFirsts
        ELSE PrunedBefore # 0 /\ a.ts < PrunedBefore
====

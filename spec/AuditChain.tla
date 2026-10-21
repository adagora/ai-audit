---- MODULE AuditChain ----
\* Model of src/audit.ts: AuditLog.append = withLock(lastHash(); appendFileSync) and anchor() (read(); append {count, head}).
\* Writers are OS processes (proxy, CLI `approve`, replicas). Inside one Node process append is synchronous.
\* Hashes are abstracted as unique ids; the lock is the O_EXCL file `<log>.lock`.
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS Writers, PerWriter, UseLock     \* UseLock = FALSE models the pre-fix code (no withLock)
VARIABLES log, anchors, pc, seen, sent, aseen, holder
vars == <<log, anchors, pc, seen, sent, aseen, holder>>
G == <<"g", 0>>
Tip(l) == IF l = <<>> THEN G ELSE l[Len(l)].id
Init == /\ log = <<>> /\ anchors = <<>> /\ sent = [w \in Writers |-> 0] /\ holder = "none"
        /\ pc = [w \in Writers |-> "idle"] /\ seen = [w \in Writers |-> G] /\ aseen = <<0, G>>
\* withLock acquire (openSync(lock, "wx")) + lastHash() tail read
ReadTail(w) == /\ pc[w] = "idle" /\ sent[w] < PerWriter
               /\ IF UseLock THEN holder = "none" /\ holder' = w ELSE UNCHANGED holder
               /\ seen' = [seen EXCEPT ![w] = Tip(log)] /\ pc' = [pc EXCEPT ![w] = "write"]
               /\ UNCHANGED <<log, sent, anchors, aseen>>
\* appendFileSync (O_APPEND) of the record built from the read, then unlinkSync(lock)
Write(w) == /\ pc[w] = "write"
            /\ log' = Append(log, [id |-> <<w, sent[w]+1>>, prev |-> seen[w]])
            /\ sent' = [sent EXCEPT ![w] = @ + 1] /\ pc' = [pc EXCEPT ![w] = "idle"]
            /\ holder' = "none"
            /\ UNCHANGED <<seen, anchors, aseen>>
AnchorRead == /\ aseen' = <<Len(log), Tip(log)>> /\ UNCHANGED <<log, anchors, pc, seen, sent, holder>>
AnchorWrite == /\ Len(anchors) < 2 /\ anchors' = Append(anchors, aseen)
               /\ UNCHANGED <<log, pc, seen, sent, aseen, holder>>
Next == \/ \E w \in Writers : ReadTail(w) \/ Write(w)
        \/ AnchorRead \/ AnchorWrite
Spec == Init /\ [][Next]_vars
ChainIntact == \A i \in 1..Len(log) : log[i].prev = IF i = 1 THEN G ELSE log[i-1].id
NoLostEntries == \A w \in Writers : Cardinality({i \in 1..Len(log) : log[i].id[1] = w}) = sent[w]
AnchorsConsistent == \A j \in 1..Len(anchors) :
     anchors[j][1] <= Len(log) /\ anchors[j][2] = IF anchors[j][1] = 0 THEN G ELSE log[anchors[j][1]].id
====

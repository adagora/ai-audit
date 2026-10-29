---- MODULE RequestLifecycle ----
\* Model of the src/proxy.ts handler for one request:
\*   ensureWritable() -> inspect/decide -> ensureWritable() -> fetch -> pipe -> write() (o.log.append)
\* Environment: client close (res "close" -> ac.abort), deadline timer, usage chunk, and the log going bad
\* (torn last line from a crashed writer) at any moment. o.log.append throws when the log is bad.
EXTENDS Naturals
CONSTANTS Precheck, GuardEnded   \* FALSE/FALSE = pre-fix code
CONSTANTS CountAfterForward, RecordInternal
VARIABLES pc, logs, refused, usage, aborted, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, crashed, failCounted, badFwd, errs
vars == <<pc, logs, refused, usage, aborted, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, crashed, failCounted, badFwd, errs>>
Env == <<aborted, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, errs>>
Init == pc = "start" /\ logs = 0 /\ refused = FALSE /\ usage = "none" /\ aborted = FALSE /\ timerArmed = TRUE /\ usageSeen = FALSE
        /\ delivered = FALSE /\ forwarded = FALSE /\ logOk \in BOOLEAN /\ diskFull = FALSE /\ crashed = FALSE /\ failCounted = FALSE
        /\ badFwd = FALSE /\ errs = 0
\* environment
ClientClose == pc \notin {"done"} /\ ~aborted /\ aborted' = TRUE /\ UNCHANGED <<pc, logs, refused, usage, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, crashed, failCounted, badFwd, errs>>
Timeout == timerArmed /\ ~aborted /\ aborted' = TRUE /\ UNCHANGED <<pc, logs, refused, usage, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, crashed, failCounted, badFwd, errs>>
LogGoesBad == logOk /\ logOk' = FALSE /\ UNCHANGED <<pc, logs, refused, usage, aborted, timerArmed, usageSeen, delivered, forwarded, diskFull, crashed, failCounted, badFwd, errs>>
DiskFills == ~diskFull /\ diskFull' = TRUE /\ UNCHANGED <<pc, logs, refused, usage, aborted, timerArmed, usageSeen, delivered, forwarded, logOk, crashed, failCounted, badFwd, errs>>
Catch(kind) ==
  /\ pc' = "done" /\ crashed' = (delivered /\ ~GuardEnded)
  /\ IF kind = "unavailable" \/ (forwarded /\ CountAfterForward) THEN failCounted' = TRUE /\ UNCHANGED <<logs, refused>>
     ELSE IF ~RecordInternal THEN UNCHANGED <<logs, refused, failCounted>>
     ELSE IF logOk /\ ~diskFull THEN logs' = logs + 1 /\ refused' = TRUE /\ UNCHANGED failCounted
     ELSE failCounted' = TRUE /\ UNCHANGED <<logs, refused>>
DoWrite(u, next) ==
  IF logOk /\ ~diskFull THEN logs' = logs + 1 /\ usage' = u /\ pc' = next /\ UNCHANGED <<refused, crashed, failCounted>>
  ELSE /\ usage' = usage
       /\ \E kind \in (IF logOk THEN {"plain"} ELSE {"unavailable", "plain"}) : Catch(kind)
\* ensureWritable() checks (proxy.ts before step 2 and before step 3)
Check(next) == IF ~Precheck THEN pc' = next /\ badFwd' = (badFwd \/ (next = "fetch" /\ ~logOk)) /\ UNCHANGED failCounted
               ELSE IF logOk THEN pc' = next /\ UNCHANGED <<badFwd, failCounted>>
               ELSE pc' = "done" /\ failCounted' = TRUE /\ UNCHANGED badFwd   \* 503 audit_log_unavailable
Start == pc = "start" /\ Check("inspect") /\ UNCHANGED <<logs, refused, usage, crashed>> /\ UNCHANGED Env
BlockOrReject == pc = "inspect" /\ timerArmed' = FALSE /\ DoWrite("n/a", "done") /\ UNCHANGED <<aborted, usageSeen, delivered, forwarded, logOk, diskFull, badFwd, errs>>
Forward == pc = "inspect" /\ Check("fetch") /\ UNCHANGED <<logs, refused, usage, crashed>> /\ UNCHANGED Env
FetchErr == pc = "fetch" /\ timerArmed' = FALSE /\ DoWrite("n/a", "done") /\ UNCHANGED <<aborted, usageSeen, delivered, forwarded, logOk, diskFull, badFwd, errs>>
Headers == pc = "fetch" /\ ~aborted /\ timerArmed' = FALSE /\ pc' = "stream" /\ forwarded' = TRUE /\ UNCHANGED <<logs, refused, usage, aborted, usageSeen, delivered, logOk, diskFull, crashed, failCounted, badFwd, errs>>
UsageChunk == pc = "stream" /\ ~aborted /\ ~usageSeen /\ usageSeen' = TRUE /\ UNCHANGED <<pc, logs, refused, usage, aborted, timerArmed, delivered, forwarded, logOk, diskFull, crashed, failCounted, badFwd, errs>>
StreamEnd == pc = "stream" /\ pc' = "write" /\ delivered' = TRUE /\ UNCHANGED <<logs, refused, usage, aborted, timerArmed, usageSeen, forwarded, logOk, diskFull, crashed, failCounted, badFwd, errs>>
\* extract(): usage only if a usage chunk was seen, otherwise undefined (ADR 0012)
Final == pc = "write" /\ DoWrite(IF usageSeen THEN "known" ELSE "unknown", "done") /\ UNCHANGED <<aborted, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, badFwd, errs>>
InternalError == pc \in {"inspect", "stream", "write"} /\ errs = 0 /\ errs' = 1 /\ Catch("plain")
                 /\ UNCHANGED <<usage, aborted, timerArmed, usageSeen, delivered, forwarded, logOk, diskFull, badFwd>>
Done == pc = "done" /\ UNCHANGED vars
Next == ClientClose \/ Timeout \/ LogGoesBad \/ DiskFills \/ Start \/ BlockOrReject \/ Forward \/ FetchErr \/ Headers \/ UsageChunk \/ StreamEnd \/ Final \/ InternalError \/ Done
Spec == Init /\ [][Next]_vars
AtMostOneLog == logs <= 1
NeverZeroWhenUnseen == (usage = "known") => usageSeen
NoCrash == ~crashed
NeverSilent == pc = "done" => (logs = 1 \/ failCounted)
\* never forward while the log is already bad (badFwd: ghost flag set by Forward on a bad log)
NoForwardOnBadLog == ~badFwd
NoRefusalAfterForward == refused => ~forwarded
\* strict ADR 0009 ideal; still violable: log goes bad AFTER the pre-forward check (residual window, ADR 0016)
NoForwardWithoutLog == (pc = "done" /\ delivered) => logs = 1
====

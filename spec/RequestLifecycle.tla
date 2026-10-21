---- MODULE RequestLifecycle ----
\* Model of the src/proxy.ts handler for one request:
\*   ensureWritable() -> inspect/decide -> ensureWritable() -> fetch -> pipe -> write() (o.log.append)
\* Environment: client close (res "close" -> ac.abort), deadline timer, usage chunk, and the log going bad
\* (torn last line from a crashed writer, disk full) at any moment. o.log.append throws when the log is bad.
EXTENDS Naturals
CONSTANTS Precheck, GuardEnded   \* FALSE/FALSE = pre-fix code
VARIABLES pc, logs, usage, aborted, timerArmed, usageSeen, delivered, logOk, crashed, failCounted, badFwd
vars == <<pc, logs, usage, aborted, timerArmed, usageSeen, delivered, logOk, crashed, failCounted, badFwd>>
Init == pc = "start" /\ logs = 0 /\ usage = "none" /\ aborted = FALSE /\ timerArmed = TRUE /\ usageSeen = FALSE
        /\ delivered = FALSE /\ logOk \in BOOLEAN /\ crashed = FALSE /\ failCounted = FALSE /\ badFwd = FALSE
\* environment
ClientClose == pc \notin {"done"} /\ ~aborted /\ aborted' = TRUE /\ UNCHANGED <<pc, logs, usage, timerArmed, usageSeen, delivered, logOk, crashed, failCounted, badFwd>>
Timeout == timerArmed /\ ~aborted /\ aborted' = TRUE /\ UNCHANGED <<pc, logs, usage, timerArmed, usageSeen, delivered, logOk, crashed, failCounted, badFwd>>
LogGoesBad == logOk /\ logOk' = FALSE /\ UNCHANGED <<pc, logs, usage, aborted, timerArmed, usageSeen, delivered, crashed, failCounted, badFwd>>
\* write(): o.log.append succeeds iff the log is ok; on throw the outer catch runs
DoWrite(u, next) ==
  IF logOk THEN logs' = logs + 1 /\ usage' = u /\ pc' = next /\ UNCHANGED <<crashed, failCounted>>
  ELSE /\ pc' = "done" /\ usage' = usage /\ logs' = logs /\ failCounted' = TRUE
       /\ crashed' = (delivered /\ ~GuardEnded)   \* fail() after res.end() -> ERR_STREAM_WRITE_AFTER_END
\* ensureWritable() checks (proxy.ts before step 2 and before step 3)
Check(next) == IF ~Precheck THEN pc' = next /\ badFwd' = (badFwd \/ (next = "fetch" /\ ~logOk)) /\ UNCHANGED failCounted
               ELSE IF logOk THEN pc' = next /\ UNCHANGED <<badFwd, failCounted>>
               ELSE pc' = "done" /\ failCounted' = TRUE /\ UNCHANGED badFwd   \* 503 audit_log_unavailable
Start == pc = "start" /\ Check("inspect") /\ UNCHANGED <<logs, usage, aborted, timerArmed, usageSeen, delivered, logOk, crashed>>
BlockOrReject == pc = "inspect" /\ timerArmed' = FALSE /\ DoWrite("n/a", "done") /\ UNCHANGED <<aborted, usageSeen, delivered, logOk, badFwd>>
Forward == pc = "inspect" /\ Check("fetch") /\ UNCHANGED <<logs, usage, aborted, timerArmed, usageSeen, delivered, logOk, crashed>>
FetchErr == pc = "fetch" /\ timerArmed' = FALSE /\ DoWrite("n/a", "done") /\ UNCHANGED <<aborted, usageSeen, delivered, logOk, badFwd>>
Headers == pc = "fetch" /\ ~aborted /\ timerArmed' = FALSE /\ pc' = "stream" /\ UNCHANGED <<logs, usage, aborted, usageSeen, delivered, logOk, crashed, failCounted, badFwd>>
UsageChunk == pc = "stream" /\ ~aborted /\ ~usageSeen /\ usageSeen' = TRUE /\ UNCHANGED <<pc, logs, usage, aborted, timerArmed, delivered, logOk, crashed, failCounted, badFwd>>
StreamEnd == pc = "stream" /\ pc' = "write" /\ delivered' = TRUE /\ UNCHANGED <<logs, usage, aborted, timerArmed, usageSeen, logOk, crashed, failCounted, badFwd>>
\* extract(): usage only if a usage chunk was seen, otherwise undefined (ADR 0012)
Final == pc = "write" /\ DoWrite(IF usageSeen THEN "known" ELSE "unknown", "done") /\ UNCHANGED <<aborted, timerArmed, usageSeen, delivered, logOk, badFwd>>
Next == ClientClose \/ Timeout \/ LogGoesBad \/ Start \/ BlockOrReject \/ Forward \/ FetchErr \/ Headers \/ UsageChunk \/ StreamEnd \/ Final
Spec == Init /\ [][Next]_vars
AtMostOneLog == logs <= 1
NeverZeroWhenUnseen == (usage = "known") => usageSeen
NoCrash == ~crashed
NeverSilent == pc = "done" => (logs = 1 \/ failCounted)
\* never forward while the log is already bad (badFwd: ghost flag set by Forward on a bad log)
NoForwardOnBadLog == ~badFwd
\* strict ADR 0009 ideal; still violable: log goes bad AFTER the pre-forward check (residual window, ADR 0016)
NoForwardWithoutLog == (pc = "done" /\ delivered) => logs = 1
====

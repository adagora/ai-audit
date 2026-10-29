---- MODULE DecisionLoop ----
EXTENDS Naturals, Sequences
CONSTANTS MaxReviews, FinalVerdict, CheckFirst
VARIABLES allowed, reviews, app, acted, before, effect, effectAt
vars == <<allowed, reviews, app, acted, before, effect, effectAt>>
Verdicts == {"approved", "overridden", "rejected"}
Latest == IF reviews = <<>> THEN "none" ELSE reviews[Len(reviews)]
AppVars == <<app, acted, before, effect, effectAt>>

Init == /\ allowed \in BOOLEAN /\ reviews = <<>> /\ app = "start"
        /\ acted = FALSE /\ before = "none" /\ effect = "none" /\ effectAt = 0

PersonReviews == /\ Len(reviews) < MaxReviews /\ (FinalVerdict => reviews = <<>>)
                 /\ \E v \in Verdicts : reviews' = Append(reviews, v)
                 /\ UNCHANGED <<allowed>> /\ UNCHANGED AppVars
RuleAllows == /\ app = "start" /\ allowed
              /\ before' = Latest
              /\ app' = (IF ~CheckFirst \/ Latest \in {"none", "approved"} THEN "acting" ELSE "skipping")
              /\ UNCHANGED <<allowed, reviews, acted, effect, effectAt>>
AppAwaits == app = "start" /\ ~allowed /\ app' = "waiting" /\ UNCHANGED <<allowed, reviews, acted, before, effect, effectAt>>
VerdictArrives == /\ app = "waiting" /\ reviews # <<>> /\ before' = Latest
                  /\ app' = (IF Latest = "approved" THEN "acting" ELSE "skipping")
                  /\ UNCHANGED <<allowed, reviews, acted, effect, effectAt>>
AwaitTimesOut == app = "waiting" /\ reviews = <<>> /\ app' = "skipping" /\ UNCHANGED <<allowed, reviews, acted, before, effect, effectAt>>
AppActs == app = "acting" /\ acted' = TRUE /\ app' = "recording" /\ UNCHANGED <<allowed, reviews, before, effect, effectAt>>
AppRecordsDone == /\ app = "recording" /\ effect' = "done" /\ effectAt' = Len(reviews) /\ app' = "finished"
                  /\ UNCHANGED <<allowed, reviews, acted, before>>
AppRecordsSkip == /\ app = "skipping" /\ effect' = "skipped" /\ effectAt' = Len(reviews) /\ app' = "finished"
                  /\ UNCHANGED <<allowed, reviews, acted, before>>
Idle == app = "finished" /\ UNCHANGED vars

Next == PersonReviews \/ RuleAllows \/ AppAwaits \/ VerdictArrives \/ AwaitTimesOut \/ AppActs \/ AppRecordsDone \/ AppRecordsSkip \/ Idle
Spec == Init /\ [][Next]_vars

Authorized == IF effectAt > 0 THEN reviews[effectAt] = "approved" ELSE allowed
WaitingAppNeverFlagged == (effect = "done" /\ ~allowed) => Authorized
NoActAgainstEarlierVerdict == acted => before \in {"none", "approved"}
NeverFlagged == effect = "done" => Authorized
ApprovalIsActedOn == (app = "finished" /\ Latest = "approved") => effect = "done"
====

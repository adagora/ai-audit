---- MODULE DecisionLoop ----
EXTENDS Naturals, Sequences
CONSTANTS MaxReviews
VARIABLES allowed, reviews, app, acted, effect, effectAt
vars == <<allowed, reviews, app, acted, effect, effectAt>>
Verdicts == {"approved", "overridden", "rejected"}
Latest == IF reviews = <<>> THEN "none" ELSE reviews[Len(reviews)]
AppVars == <<app, acted, effect, effectAt>>

Init == /\ allowed \in BOOLEAN /\ reviews = <<>> /\ app = "start"
        /\ acted = FALSE /\ effect = "none" /\ effectAt = 0

PersonReviews == /\ Len(reviews) < MaxReviews /\ \E v \in Verdicts : reviews' = Append(reviews, v)
                 /\ UNCHANGED <<allowed>> /\ UNCHANGED AppVars
RuleAllows == app = "start" /\ allowed /\ app' = "acting" /\ UNCHANGED <<allowed, reviews, acted, effect, effectAt>>
AppAwaits == app = "start" /\ ~allowed /\ app' = "waiting" /\ UNCHANGED <<allowed, reviews, acted, effect, effectAt>>
VerdictArrives == /\ app = "waiting" /\ reviews # <<>>
                  /\ app' = (IF Latest = "approved" THEN "acting" ELSE "skipping")
                  /\ UNCHANGED <<allowed, reviews, acted, effect, effectAt>>
AwaitTimesOut == app = "waiting" /\ reviews = <<>> /\ app' = "gave up" /\ UNCHANGED <<allowed, reviews, acted, effect, effectAt>>
AppActs == app = "acting" /\ acted' = TRUE /\ app' = "recording" /\ UNCHANGED <<allowed, reviews, effect, effectAt>>
AppRecordsDone == /\ app = "recording" /\ effect' = "done" /\ effectAt' = Len(reviews) /\ app' = "finished"
                  /\ UNCHANGED <<allowed, reviews, acted>>
AppRecordsSkip == /\ app = "skipping" /\ effect' = "skipped" /\ effectAt' = Len(reviews) /\ app' = "finished"
                  /\ UNCHANGED <<allowed, reviews, acted>>
Idle == app \in {"finished", "gave up"} /\ UNCHANGED vars

Next == PersonReviews \/ RuleAllows \/ AppAwaits \/ VerdictArrives \/ AwaitTimesOut \/ AppActs \/ AppRecordsDone \/ AppRecordsSkip \/ Idle
Spec == Init /\ [][Next]_vars

Authorized == IF effectAt > 0 THEN reviews[effectAt] = "approved" ELSE allowed
WaitingAppNeverFlagged == effect = "done" => Authorized
ApprovalIsActedOn == (app \in {"finished", "gave up"} /\ Latest = "approved") => effect = "done"
====

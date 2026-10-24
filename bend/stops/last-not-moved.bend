import Base
import ./policies.bend as Q
import ./Spec.bend as Laws

def last_is_one(m: Maybe<&2, Q.Stat>) -> Bool:
  match m:
    case Some{Q.Stat{f, l, c}}:
      Nat.is_eq(l, 1n)
    case None{}:
      False{}

def policies_count_each_version_from_its_first_to_its_last_decision(e: {Laws.StatOf([], [], Q.histories([Q.Use{[], []}, Q.Use{[], []}])) == Laws.ExpectedStat([], [], [Q.Use{[], []}, Q.Use{[], []}], 0n) : Maybe<&2, Q.Stat>}) -> Empty:
  %Equal.cong(Maybe<&2, Q.Stat>, Bool, m => last_is_one(m), Laws.StatOf([], [], Q.histories([Q.Use{[], []}, Q.Use{[], []}])), Laws.ExpectedStat([], [], [Q.Use{[], []}, Q.Use{[], []}], 0n), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

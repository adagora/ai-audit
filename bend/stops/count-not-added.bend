import Base
import ./policies.bend as Q
import ./Spec.bend as Laws

def count_is_two(m: Maybe<&2, Q.Stat>) -> Bool:
  match m:
    case Some{Q.Stat{f, l, c}}:
      Nat.is_eq(c, 2n)
    case None{}:
      False{}

def policies_count_each_version_from_its_first_to_its_last_decision(e: {Laws.StatOf([], [], Q.histories([Q.Use{[], []}, Q.Use{[], []}])) == Laws.ExpectedStat([], [], [Q.Use{[], []}, Q.Use{[], []}], 0n) : Maybe<&2, Q.Stat>}) -> Empty:
  %Equal.cong(Maybe<&2, Q.Stat>, Bool, m => count_is_two(m), Laws.StatOf([], [], Q.histories([Q.Use{[], []}, Q.Use{[], []}])), Laws.ExpectedStat([], [], [Q.Use{[], []}, Q.Use{[], []}], 0n), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

import Base
import ./policies.bend as Q
import ./Spec.bend as Laws

def head_true(xs: List<&2, Bool>) -> Bool:
  match xs:
    case Con{b, rest}:
      b
    case Nil{}:
      False{}

def current_is_one(m: Maybe<&2, List<&2, Bool>>) -> Bool:
  match m:
    case Some{xs}:
      head_true(xs)
    case None{}:
      False{}

def policies_mark_the_program_of_the_latest_decision_current(e: {Laws.CurrentOf([], Q.histories([Q.Use{[], [True{}]}])) == Laws.LatestProgram([], [Q.Use{[], [True{}]}]) : Maybe<&2, List<&2, Bool>>}) -> Empty:
  %Equal.cong(Maybe<&2, List<&2, Bool>>, Bool, m => current_is_one(m), Laws.CurrentOf([], Q.histories([Q.Use{[], [True{}]}])), Laws.LatestProgram([], [Q.Use{[], [True{}]}]), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

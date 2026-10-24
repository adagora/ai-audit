import Base
import ./policies.bend as Q
import ./Spec.bend as Laws

def two_programs(xs: List<&2, List<&2, Bool>>) -> Bool:
  Nat.is_eq(List.length(&2, List<&2, Bool>, xs), 2n)

def policies_list_each_program_of_a_use_case_once_in_order_of_first_use(e: {Laws.ProgramsOf([], Q.histories([Q.Use{[], []}, Q.Use{[], [True{}]}, Q.Use{[], []}])) == Laws.FirstPrograms([], [Q.Use{[], []}, Q.Use{[], [True{}]}, Q.Use{[], []}], []) : List<&2, List<&2, Bool>>}) -> Empty:
  %Equal.cong(List<&2, List<&2, Bool>>, Bool, xs => two_programs(xs), Laws.ProgramsOf([], Q.histories([Q.Use{[], []}, Q.Use{[], [True{}]}, Q.Use{[], []}])), Laws.FirstPrograms([], [Q.Use{[], []}, Q.Use{[], [True{}]}, Q.Use{[], []}], []), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

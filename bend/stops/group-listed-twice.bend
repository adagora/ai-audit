import Base
import ./policies.bend as Q
import ./Spec.bend as Laws

def one_use_case(xs: List<&2, List<&2, Bool>>) -> Bool:
  Nat.is_eq(List.length(&2, List<&2, Bool>, xs), 1n)

def policies_list_each_use_case_once_in_order_of_first_use(e: {Laws.UseCases(Q.histories([Q.Use{[], []}, Q.Use{[], []}])) == Laws.FirstUseCases([Q.Use{[], []}, Q.Use{[], []}], []) : List<&2, List<&2, Bool>>}) -> Empty:
  %Equal.cong(List<&2, List<&2, Bool>>, Bool, xs => one_use_case(xs), Laws.UseCases(Q.histories([Q.Use{[], []}, Q.Use{[], []}])), Laws.FirstUseCases([Q.Use{[], []}, Q.Use{[], []}], []), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

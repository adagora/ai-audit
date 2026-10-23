import Base
import ./spans.bend as S
import ./Spec.bend as Laws

def spans_groups_are_apart(a: Laws.Apart(S.merge([S.Raw{0n, 4n, 0n, 4n, 0n}, S.Raw{2n, 6n, 2n, 6n, 1n}]))) -> Empty:
  (le, rest) = a
  %le : Bool.pick(Type, _, Empty, Unit)
  Unit{}

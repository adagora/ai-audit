import Base
import ./mask.bend as K
import ./Spec.bend as Laws

def premises() -> Laws.BsFrom(0n, [6n]) & Laws.CutsFrom(0n, [K.Cut{1n, 2n}, K.Cut{3n, 4n}]):
  (({==}, Unit{}), ({==}, ({==}, ({==}, ({==}, Unit{})))))

def marker_sum(xs: List<&2, Laws.Item>, +n: Nat) -> Nat:
  match xs:
    case Nil{}:
      n
    case Con{Laws.Marker{i}, rest}:
      marker_sum(rest, Nat.add(i, n))
    case Con{Laws.Byte{p}, rest}:
      marker_sum(rest, n)

def first_sums_one(xs: List<&2, List<&2, Laws.Item>>) -> Bool:
  match xs:
    case Nil{}:
      False{}
    case Con{x, rest}:
      Nat.is_eq(marker_sum(x, 0n), 1n)

def mask_keeps_each_byte_outside_findings_and_marks_each_finding_once(e: {Laws.ShownParts(K.cut([6n], [K.Cut{1n, 2n}, K.Cut{3n, 4n}])) == Laws.MaskedParts([6n], 0n, [K.Cut{1n, 2n}, K.Cut{3n, 4n}], 0n) : List<&2, List<&2, Laws.Item>>}) -> Empty:
  %Equal.cong(List<&2, List<&2, Laws.Item>>, Bool, xs => first_sums_one(xs), Laws.ShownParts(K.cut([6n], [K.Cut{1n, 2n}, K.Cut{3n, 4n}])), Laws.MaskedParts([6n], 0n, [K.Cut{1n, 2n}, K.Cut{3n, 4n}], 0n), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

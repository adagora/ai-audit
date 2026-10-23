import Base
import ./mask.bend as K
import ./Spec.bend as Laws

def premises() -> Laws.BsFrom(0n, [5n]) & Laws.CutsFrom(0n, [K.Cut{1n, 3n}]):
  (({==}, Unit{}), ({==}, ({==}, Unit{})))

def first_has_four(xs: List<&2, List<&2, Laws.Item>>) -> Bool:
  match xs:
    case Nil{}:
      False{}
    case Con{x, rest}:
      Nat.is_eq(List.length(&2, Laws.Item, x), 4n)

def mask_keeps_each_byte_outside_findings_and_marks_each_finding_once(e: {Laws.ShownParts(K.cut([5n], [K.Cut{1n, 3n}])) == Laws.MaskedParts([5n], 0n, [K.Cut{1n, 3n}], 0n) : List<&2, List<&2, Laws.Item>>}) -> Empty:
  %Equal.cong(List<&2, List<&2, Laws.Item>>, Bool, xs => first_has_four(xs), Laws.ShownParts(K.cut([5n], [K.Cut{1n, 3n}])), Laws.MaskedParts([5n], 0n, [K.Cut{1n, 3n}], 0n), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

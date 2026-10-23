import Base
import ./mask.bend as K
import ./Spec.bend as Laws

def premises() -> Laws.BsFrom(0n, [2n, 5n]) & Laws.CutsFrom(0n, [K.Cut{1n, 4n}]):
  (({==}, ({==}, Unit{})), ({==}, ({==}, Unit{})))

def second_has_one(xs: List<&2, List<&2, Laws.Item>>) -> Bool:
  match xs:
    case Con{x, Con{y, rest}}:
      Nat.is_eq(List.length(&2, Laws.Item, y), 1n)
    case _:
      False{}

def mask_keeps_each_byte_outside_findings_and_marks_each_finding_once(e: {Laws.ShownParts(K.cut([2n, 5n], [K.Cut{1n, 4n}])) == Laws.MaskedParts([2n, 5n], 0n, [K.Cut{1n, 4n}], 0n) : List<&2, List<&2, Laws.Item>>}) -> Empty:
  %Equal.cong(List<&2, List<&2, Laws.Item>>, Bool, xs => second_has_one(xs), Laws.ShownParts(K.cut([2n, 5n], [K.Cut{1n, 4n}])), Laws.MaskedParts([2n, 5n], 0n, [K.Cut{1n, 4n}], 0n), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

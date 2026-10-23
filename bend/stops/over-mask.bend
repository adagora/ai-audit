import Base
import ./spans.bend as S
import ./Spec.bend as Laws

def premises() -> Laws.InGroups(3n, S.merge([S.Raw{0n, 3n, 0n, 3n, 0n}])):
  Inl{({==}, {==})}

def spans_mask_only_finding_bytes(r: Laws.InRaws(3n, [S.Raw{0n, 3n, 0n, 3n, 0n}])) -> Empty:
  match r:
    case Inl{w}:
      (wl, wr) = w
      %wr : Bool.pick(Type, _, Empty, Unit)
      Unit{}
    case Inr{x}:
      match x:

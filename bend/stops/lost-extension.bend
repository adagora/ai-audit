import Base
import ./spans.bend as S
import ./Spec.bend as Laws

def premises() -> Laws.Sorted([S.Raw{0n, 3n, 0n, 3n, 0n}, S.Raw{2n, 6n, 2n, 6n, 1n}]) & Laws.InRaws(4n, [S.Raw{0n, 3n, 0n, 3n, 0n}, S.Raw{2n, 6n, 2n, 6n, 1n}]):
  (({==}, Unit{}), Inr{Inl{({==}, {==})}})

def spans_mask_every_finding_byte(g: Laws.InGroups(4n, S.merge([S.Raw{0n, 3n, 0n, 3n, 0n}, S.Raw{2n, 6n, 2n, 6n, 1n}]))) -> Empty:
  match g:
    case Inl{w}:
      (wl, wr) = w
      %wr : Bool.pick(Type, _, Empty, Unit)
      Unit{}
    case Inr{x}:
      match x:

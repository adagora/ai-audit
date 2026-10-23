import Base
import ./context.bend as C
import ./Spec.bend as Laws

def split_rounds_each_share(h: Laws.Quota(1n, C.total([1n, 1n]), [1n, 1n], C.split(1n, [1n, 1n]))) -> Empty:
  (first, rest) = h
  match first:
    case Inl{e}:
      %e : Bool.pick(Type, Nat.is_eq(_, 0n), Empty, Unit)
      Unit{}
    case Inr{e}:
      %e : Bool.pick(Type, Nat.is_eq(_, 1n), Empty, Unit)
      Unit{}

import Base
import ./context.bend as C

def split_sums_to_provider(h: {C.total(C.split(1n, [1n, 1n])) == 1n : Nat}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(_, 1n), Empty, Unit)
  Unit{}

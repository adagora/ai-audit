import Base
import ./context.bend as C
import ./Spec.bend as Laws

def split_leftover_to_largest_remainders(h: Laws.Fair(1n, C.total([1n, 2n]), [1n, 2n], C.split(1n, [1n, 2n]))) -> Empty:
  (first, rest) = h
  (pair, later) = first
  %pair : Bool.pick(Type, _, Empty, Unit)
  Unit{}

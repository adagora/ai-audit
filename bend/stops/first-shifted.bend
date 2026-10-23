import Base
import ./arena.bend as A
import ./Spec.bend as Laws

def arena_first_change_is_the_first_difference(h: Laws.FirstOk(A.Known{[A.Seen{0n, 1n}]}, [A.Block{1n, 0n, 5n}], A.first(A.Known{[A.Seen{0n, 1n}]}, [A.Block{1n, 0n, 5n}]))) -> Empty:
  (d, offset) = h
  (agree, rest) = d
  %agree : Bool.pick(Type, _, Empty, Unit)
  Unit{}

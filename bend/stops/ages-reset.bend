import Base
import ./arena.bend as A
import ./Spec.bend as Laws

def head0(xs: +List<Nat>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case x <> rest:
      x

def arena_ages_keep_the_unchanged_prefix(h: {A.ages(A.Known{[A.Seen{0n, 1n}]}, [A.Block{0n, 0n, 1n}], 2n, True{}) == Laws.ExpectedAges(A.Known{[A.Seen{0n, 1n}]}, [A.Block{0n, 0n, 1n}], 2n, True{}) : List<&2, Nat>}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(head0(_), 1n), Empty, Unit)
  Unit{}

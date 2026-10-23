import Base
import ./arena.bend as A
import ./Spec.bend as Laws

def first_kind(xs: +List<Laws.Label>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case Laws.Label{k, a} <> rest:
      k

def arena_runs_keep_every_byte_with_its_kind_and_age(h: {Laws.Expand(Laws.RunsOf(A.arena(A.Fresh{}, [A.Block{0n, 2n, 1n}], 1n, True{}))) == Laws.Labels([A.Block{0n, 2n, 1n}], Laws.ExpectedAges(A.Fresh{}, [A.Block{0n, 2n, 1n}], 1n, True{})) : List<&2, Laws.Label>}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(first_kind(_), 2n), Empty, Unit)
  Unit{}

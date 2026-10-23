import Base
import ./arena.bend as A
import ./Spec.bend as Laws

def arena_runs_keep_every_byte_with_its_kind_and_age(h: {Laws.Expand(Laws.RunsOf(A.arena(A.Fresh{}, [A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}], 1n, True{}))) == Laws.Labels([A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}], Laws.ExpectedAges(A.Fresh{}, [A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}], 1n, True{})) : List<&2, Laws.Label>}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(List.length(&2, Laws.Label, _), 7n), Empty, Unit)
  Unit{}

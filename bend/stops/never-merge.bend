import Base
import ./arena.bend as A
import ./Spec.bend as Laws

def arena_runs_merge_neighbours_of_one_kind_and_age(h: {Laws.RunsOf(A.arena(A.Fresh{}, [A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}], 1n, True{})) == Laws.ExpectedRuns([A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}], Laws.ExpectedAges(A.Fresh{}, [A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}], 1n, True{}), A.first(A.Fresh{}, [A.Block{0n, 2n, 3n}, A.Block{1n, 2n, 4n}])) : List<&2, A.Run>}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(List.length(&2, A.Run, _), 1n), Empty, Unit)
  Unit{}

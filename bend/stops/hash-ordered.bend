import Base
import ./arena.bend as A
import ./Spec.bend as Laws

def first_found(a: A.Arena) -> Bool:
  match a:
    case A.Arena{ags, f, rs}:
      match f:
        case None{}:
          False{}
        case Some{x}:
          True{}

def arena_reads_hashes_only_position_by_position(h: {A.arena(Laws.PosPrev(A.Known{[A.Seen{5n, 1n}]}), Laws.PosBlocksOf(A.Known{[A.Seen{5n, 1n}]}, [A.Block{3n, 0n, 1n}]), 2n, True{}) == A.arena(A.Known{[A.Seen{5n, 1n}]}, [A.Block{3n, 0n, 1n}], 2n, True{}) : A.Arena}) -> Empty:
  %h : Bool.pick(Type, first_found(_), Empty, Unit)
  Unit{}

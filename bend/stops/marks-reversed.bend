import Base
import ./parts.bend as P
import ./Spec.bend as Laws

def head_start(l: List<&2, P.Span>) -> Nat:
  match l:
    case Nil{}:
      1n
    case Con{P.Span{a, b, c, d}, r}:
      a

def parts_keep_every_span_in_order(h: {Laws.SpansOf(P.taken([], [P.Span{0n, 1n, 0n, 1n}, P.Span{2n, 3n, 2n, 3n}])) == [P.Span{0n, 1n, 0n, 1n}, P.Span{2n, 3n, 2n, 3n}] : List<&2, P.Span>}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(head_start(_), 0n), Empty, Unit)
  Unit{}

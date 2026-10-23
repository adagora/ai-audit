import Base
import ./parts.bend as P
import ./Spec.bend as Laws

def premises() -> Laws.BsFrom(0n, []) & (Laws.SpansFrom(0n, [P.Span{0n, 2n, 0n, 2n}]) & ({Laws.SpansOf([P.Mark{P.Span{0n, 2n, 0n, 2n}, False{}}]) == [P.Span{0n, 2n, 0n, 2n}] : List<&2, P.Span>}
  & (Laws.CrossTaken([], [P.Mark{P.Span{0n, 2n, 0n, 2n}, False{}}]) & Laws.Untouched([P.Mark{P.Span{0n, 2n, 0n, 2n}, False{}}])))):
  (Unit{}, (({==}, (({==}, ({==}, {==})), Unit{})), ({==}, ((h => h, Unit{}), (Unit{}, Unit{})))))

def parts_take_no_span_that_crossings_do_not_force(w: Laws.TakenWithin(P.taken([], [P.Span{0n, 2n, 0n, 2n}]), [P.Mark{P.Span{0n, 2n, 0n, 2n}, False{}}])) -> Empty:
  (h, rest) = w
  %h({==}) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

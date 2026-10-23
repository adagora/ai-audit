import Base
import ./parts.bend as P
import ./Spec.bend as Laws

def premises() -> Laws.BsFrom(0n, [5n]) & Laws.SpansFrom(0n, [P.Span{3n, 8n, 3n, 8n}]):
  (({==}, Unit{}), ({==}, (({==}, ({==}, {==})), Unit{})))

def parts_take_every_span_whose_match_crosses_a_part(c: Laws.CrossTaken([5n], P.taken([5n], [P.Span{3n, 8n, 3n, 8n}]))) -> Empty:
  (h, rest) = c
  %h({==}) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

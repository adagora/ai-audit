import Base
import ./parts.bend as P
import ./Spec.bend as Laws

def premises() -> Laws.SpansFrom(0n, [P.Span{0n, 2n, 0n, 5n}, P.Span{4n, 8n, 4n, 8n}]):
  ({==}, (({==}, ({==}, {==})), ({==}, (({==}, ({==}, {==})), Unit{}))))

def parts_untaken_matches_touch_no_taken_span(u: Laws.Untouched(P.taken([6n], [P.Span{0n, 2n, 0n, 5n}, P.Span{4n, 8n, 4n, 8n}]))) -> Empty:
  (((g, g2), rest), rest2) = u
  %Equal.sym(Bool, True{}, False{}, g) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

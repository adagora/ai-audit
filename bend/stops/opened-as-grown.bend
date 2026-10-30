import Base
import ./spans.bend as S

def head_grown(l: List<&2, S.Group>) -> Bool:
  match l:
    case Nil{}:
      False{}
    case Con{S.Group{a, b, c, d, f, w}, r}:
      w

def spans_merge_of_one_span_keeps_it(h: {S.merge([S.Raw{0n, 1n, 0n, 1n, 0n}]) == [S.Group{0n, 1n, 0n, 1n, 0n, False{}}] : List<&2, S.Group>}) -> Empty:
  %h : Bool.pick(Type, head_grown(_), Unit, Empty)
  Unit{}

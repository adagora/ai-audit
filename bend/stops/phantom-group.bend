import Base
import ./spans.bend as S

def spans_merge_of_no_span_is_empty(h: {S.merge([]) == [] : List<&2, S.Group>}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(List.length(&2, S.Group, _), 0n), Empty, Unit)
  Unit{}

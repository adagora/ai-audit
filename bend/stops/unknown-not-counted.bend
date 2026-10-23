import Base
import ./usage.bend as U
import ./Spec.bend as Laws

def unknown_inputs(t: U.Totals) -> Nat:
  match t:
    case U.Totals{a, b, c, d, e}:
      c

def usage_totals_count_unknown_apart(h: {U.totals([U.Call{True{}, None{}, Some{1n}}]) == Laws.ExpectedTotals([U.Call{True{}, None{}, Some{1n}}]) : U.Totals}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(unknown_inputs(_), 1n), Empty, Unit)
  Unit{}

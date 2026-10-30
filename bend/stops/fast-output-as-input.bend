import Base
import ./usage.bend as U

def unknown_outputs(t: U.Totals) -> Nat:
  match t:
    case U.Totals{a, b, c, d, e}:
      d

def usage_fast_totals_match_the_spec(h: {U.totals.fast([U.Call{True{}, None{}, Some{1n}}]) == U.totals([U.Call{True{}, None{}, Some{1n}}]) : U.Totals}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(unknown_outputs(_), 0n), Empty, Unit)
  Unit{}

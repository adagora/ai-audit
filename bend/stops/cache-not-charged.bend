import Base
import ./budget.bend as B
import ./Spec.bend as Laws

def budget_charges_known_usage_or_the_reservation(h: {B.charge(True{}, 0n, 0n, Some{1n}, Some{2n}, None{}, None{}) == Laws.ExpectedChargeOf(Laws.UsedInput(True{}, Some{1n}, Some{2n}, None{}), None{}, 0n, 0n) : B.Charge}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(Laws.ChargedInput(_), 3n), Empty, Unit)
  Unit{}

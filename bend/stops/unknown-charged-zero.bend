import Base
import ./budget.bend as B
import ./Spec.bend as Laws

def budget_charges_known_usage_or_the_reservation(h: {B.charge(False{}, 5n, 0n, None{}, None{}, None{}, None{}) == Laws.ExpectedChargeOf(Laws.UsedInput(False{}, None{}, None{}, None{}), None{}, 5n, 0n) : B.Charge}) -> Empty:
  %h : Bool.pick(Type, Nat.is_eq(Laws.ChargedInput(_), 5n), Empty, Unit)
  Unit{}

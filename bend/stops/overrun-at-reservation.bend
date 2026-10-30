import Base
import ./budget.bend as B
import ./Spec.bend as Laws

def budget_charges_known_usage_or_the_reservation(h: {B.charge(False{}, 1n, 0n, Some{1n}, None{}, None{}, None{}) == Laws.ExpectedChargeOf(Laws.UsedInput(False{}, Some{1n}, None{}, None{}), None{}, 1n, 0n) : B.Charge}) -> Empty:
  %h : Bool.pick(Type, Laws.OverrunOf(_), Unit, Empty)
  Unit{}

import Base
import ./budget.bend as B
import ./Spec.bend as Laws

def premises() -> {B.admit(False{}, 0n, 0n, 0n, 0n, 0n, 0n) == B.Ok{} : B.Verdict} & {Laws.OverrunOf(B.charge(False{}, 0n, 0n, None{}, None{}, None{}, Some{1n})) == False{} : Bool}:
  ({==}, {==})

def budget_admitted_and_not_overrun_stays_within_the_limit(h: {Bool.and(Nat.is_le(Nat.add(0n, Laws.ChargedInput(B.charge(False{}, 0n, 0n, None{}, None{}, None{}, Some{1n}))), 0n), Nat.is_le(Nat.add(0n, Laws.ChargedOutput(B.charge(False{}, 0n, 0n, None{}, None{}, None{}, Some{1n}))), 0n)) == True{} : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Empty, Unit)
  Unit{}

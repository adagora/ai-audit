import Base
import ./budget.bend as B
import ./Spec.bend as Laws

def exceeded_type(v: B.Verdict) -> Type:
  match v:
    case B.Ok{}:
      Unit
    case B.Blocked{}:
      Unit
    case B.Exceeded{}:
      Empty

def budget_admits_exactly_what_fits(h: {B.admit(False{}, 0n, 0n, 0n, 1n, 0n, 0n) == Laws.ExpectedVerdict(Bool.and(Nat.is_le(Nat.add(0n, 0n), 0n), Nat.is_le(Nat.add(0n, 1n), 0n))) : B.Verdict}) -> Empty:
  %h : exceeded_type(_)
  Unit{}

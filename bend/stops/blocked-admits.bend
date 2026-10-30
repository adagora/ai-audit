import Base
import ./budget.bend as B
import ./Spec.bend as Laws

def blocked_type(v: B.Verdict) -> Type:
  match v:
    case B.Ok{}:
      Unit
    case B.Blocked{}:
      Empty
    case B.Exceeded{}:
      Unit

def budget_blocked_admits_nothing(h: {B.admit(True{}, 0n, 0n, 0n, 0n, 0n, 0n) == B.Blocked{} : B.Verdict}) -> Empty:
  %h : blocked_type(_)
  Unit{}

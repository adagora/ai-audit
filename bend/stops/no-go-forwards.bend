import Base
import ./decide.bend as D
import ./Spec.bend as Laws

def is_blocked(a: D.Action) -> Bool:
  match a:
    case D.Blocked{}:
      True{}
    case _:
      False{}

def decide_blocks_every_finding_in_no_go_mode(e: {D.decide(D.NoGo{}, [True{}]) == D.Blocked{} : D.Action}) -> Empty:
  %Equal.cong(D.Action, Bool, a => is_blocked(a), D.decide(D.NoGo{}, [True{}]), D.Blocked{}, e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

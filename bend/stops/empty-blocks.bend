import Base
import ./decide.bend as D
import ./Spec.bend as Laws

def is_original(a: D.Action) -> Bool:
  match a:
    case D.Original{}:
      True{}
    case _:
      False{}

def decide_forwards_the_original_when_nothing_is_found(e: {D.decide(D.Redact{}, []) == D.Original{} : D.Action}) -> Empty:
  %Equal.cong(D.Action, Bool, a => is_original(a), D.decide(D.Redact{}, []), D.Original{}, e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

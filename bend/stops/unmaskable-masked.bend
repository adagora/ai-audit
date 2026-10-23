import Base
import ./decide.bend as D
import ./Spec.bend as Laws

def is_unmaskable(a: D.Action) -> Bool:
  match a:
    case D.Unmaskable{}:
      True{}
    case _:
      False{}

def decide_masks_in_redact_mode_only_when_every_finding_can_be_masked(e: {D.decide(D.Redact{}, [False{}]) == Bool.pick(D.Action, Laws.Maskable([False{}]), D.Masked{}, D.Unmaskable{}) : D.Action}) -> Empty:
  %Equal.cong(D.Action, Bool, a => is_unmaskable(a), D.decide(D.Redact{}, [False{}]), Bool.pick(D.Action, Laws.Maskable([False{}]), D.Masked{}, D.Unmaskable{}), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

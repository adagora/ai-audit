import Base
import ./verdict.bend as V
import ./Spec.bend as Laws

def verdict_a_done_effect_follows_the_latest_review(h: {V.authorized(True{}, False{}, [V.Approved{}]) == Laws.ExpectedAuthorized(False{}, Laws.LastOf([V.Approved{}])) : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Empty, Unit)
  Unit{}

import Base
import ./verdict.bend as V
import ./Spec.bend as Laws

def verdict_a_done_effect_follows_the_latest_review(h: {V.authorized(True{}, False{}, [V.Overridden{}]) == Laws.ExpectedAuthorized(False{}, Laws.LastOf([V.Overridden{}])) : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Unit, Empty)
  Unit{}

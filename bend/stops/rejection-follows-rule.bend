import Base
import ./verdict.bend as V
import ./Spec.bend as Laws

def verdict_a_done_effect_follows_the_latest_review(h: {V.authorized(True{}, True{}, [V.Rejected{}]) == Laws.ExpectedAuthorized(True{}, Laws.LastOf([V.Rejected{}])) : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Unit, Empty)
  Unit{}

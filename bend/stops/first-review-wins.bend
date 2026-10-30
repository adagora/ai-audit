import Base
import ./verdict.bend as V
import ./Spec.bend as Laws

def verdict_the_review_recorded_last_decides(h: {V.authorized(True{}, False{}, Laws.Snoc([V.Approved{}], V.Rejected{})) == Laws.ExpectedAuthorized(False{}, Some{V.Rejected{}}) : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Unit, Empty)
  Unit{}

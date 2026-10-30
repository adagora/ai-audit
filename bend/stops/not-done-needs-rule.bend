import Base
import ./verdict.bend as V
import ./Spec.bend as Laws

def verdict_an_effect_not_done_needs_no_verdict(h: {V.authorized(False{}, False{}, []) == True{} : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Empty, Unit)
  Unit{}

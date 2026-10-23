import Base
import ./usage.bend as U
import ./Spec.bend as Laws

def usage_cache_drop_only_from_evidence(h: {U.drop(False{}, U.Turn{Some{0n}, None{}, Some{0n}, None{}, Some{0n}}, U.Turn{Some{0n}, None{}, Some{1023n}, None{}, Some{1023n}}) == Laws.CacheDropped(Laws.ExpectedPrefix(U.Turn{Some{0n}, None{}, Some{1023n}, None{}, Some{1023n}}, False{}), U.Turn{Some{0n}, None{}, Some{0n}, None{}, Some{0n}}) : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Unit, Empty)
  Unit{}

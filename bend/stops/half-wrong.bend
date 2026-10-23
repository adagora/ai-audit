import Base
import ./usage.bend as U
import ./Spec.bend as Laws

def usage_cache_drop_only_from_evidence(h: {U.drop(False{}, U.Turn{Some{1500n}, None{}, Some{500n}, None{}, Some{2000n}}, U.Turn{Some{0n}, None{}, Some{2000n}, None{}, Some{2000n}}) == Laws.CacheDropped(Laws.ExpectedPrefix(U.Turn{Some{0n}, None{}, Some{2000n}, None{}, Some{2000n}}, False{}), U.Turn{Some{1500n}, None{}, Some{500n}, None{}, Some{2000n}}) : Bool}) -> Empty:
  %h : Bool.pick(Type, _, Unit, Empty)
  Unit{}

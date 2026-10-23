import Base
import ./parts.bend as P
import ./Spec.bend as Laws

def head_t(l: List<&2, P.Mark>) -> Bool:
  match l:
    case Nil{}:
      False{}
    case Con{P.Mark{s, t}, r}:
      t

def parts_fast_version_gives_the_same_marks(e: {P.taken.fast([6n], [P.Span{0n, 2n, 0n, 5n}, P.Span{4n, 8n, 4n, 8n}]) == P.taken([6n], [P.Span{0n, 2n, 0n, 5n}, P.Span{4n, 8n, 4n, 8n}]) : List<&2, P.Mark>}) -> Empty:
  %Equal.cong(List<&2, P.Mark>, Bool, l => head_t(l), P.taken.fast([6n], [P.Span{0n, 2n, 0n, 5n}, P.Span{4n, 8n, 4n, 8n}]), P.taken([6n], [P.Span{0n, 2n, 0n, 5n}, P.Span{4n, 8n, 4n, 8n}]), e) : Bool.pick(Type, _, Empty, Unit)
  Unit{}

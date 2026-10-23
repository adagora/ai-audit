import Base
import ./usage.bend as U
import ./Spec.bend as Laws

def prompt_unknown(t: U.Turn) -> Bool:
  match t:
    case U.Turn{r, w, i, o, p}:
      match p:
        case None{}:
          True{}
        case Some{n}:
          False{}

def usage_unknown_input_stays_unknown(h: {U.turn(False{}, U.Usage{None{}, None{}, None{}, None{}}) == U.Turn{None{}, None{}, None{}, None{}, None{}} : U.Turn}) -> Empty:
  %h : Bool.pick(Type, prompt_unknown(_), Empty, Unit)
  Unit{}

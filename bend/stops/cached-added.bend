import Base
import ./usage.bend as U
import ./Spec.bend as Laws

def input_is_zero(t: U.Turn) -> Bool:
  match t:
    case U.Turn{r, w, i, o, p}:
      match i:
        case None{}:
          False{}
        case Some{n}:
          Nat.is_eq(n, 0n)

def usage_known_input_splits_the_prompt(h: {U.turn(False{}, U.Usage{Some{0n}, None{}, Some{1n}, None{}}) == Laws.ExpectedTurn(False{}, 0n, None{}, Some{1n}, None{}) : U.Turn}) -> Empty:
  %h : Bool.pick(Type, input_is_zero(_), Empty, Unit)
  Unit{}

import Base
import ./usage.bend as U
import ./Spec.bend as Laws

def prompt_is_one(t: U.Turn) -> Bool:
  match t:
    case U.Turn{r, w, i, o, p}:
      match p:
        case None{}:
          False{}
        case Some{n}:
          Nat.is_eq(n, 1n)

def usage_known_input_splits_the_prompt(h: {U.turn(True{}, U.Usage{Some{0n}, None{}, None{}, Some{1n}}) == Laws.ExpectedTurn(True{}, 0n, None{}, None{}, Some{1n}) : U.Turn}) -> Empty:
  %h : Bool.pick(Type, prompt_is_one(_), Empty, Unit)
  Unit{}

import Base
import ./context.bend as C

def RoundedUp(r: Nat, o: Nat, q: Nat) -> Type:
  match r:
    case 0n:
      Empty
    case 1n+w:
      {o == 1n+q : Nat}

def Quota(+p: Nat, +t: Nat, bs: +List<Nat>, out: +List<Nat>) -> Type:
  match bs out:
    case Nil{} Nil{}:
      Unit
    case Nil{} Con{o, ot}:
      Empty
    case Con{b, bt} Nil{}:
      Empty
    case Con{+b, bt} Con{+o, ot}:
      ({o == Nat.div(Nat.mul(b, p), t) : Nat} | RoundedUp(Nat.mod(Nat.mul(b, p), t), o, Nat.div(Nat.mul(b, p), t))) & Quota(p, t, bt, ot)

def Zeros.at(b: Nat, o: Nat) -> Type:
  match b:
    case 0n:
      {o == 0n : Nat}
    case 1n+c:
      Unit

def Zeros(bs: +List<Nat>, out: +List<Nat>) -> Type:
  match bs out:
    case Nil{} Nil{}:
      Unit
    case Nil{} Con{o, ot}:
      Empty
    case Con{b, bt} Nil{}:
      Empty
    case Con{b, bt} Con{o, ot}:
      Zeros.at(b, o) & Zeros(bt, ot)

def Got(+p: Nat, +t: Nat, +b: Nat, o: Nat) -> Bool:
  Nat.is_gt(o, Nat.div(Nat.mul(b, p), t))

def Fair.pair(gx: Bool, gy: Bool, rx: Nat, ry: Nat) -> Type:
  match gx gy:
    case True{} True{}:
      Unit
    case True{} False{}:
      {Nat.is_ge(rx, ry) == True{} : Bool}
    case False{} True{}:
      {Nat.is_lt(rx, ry) == True{} : Bool}
    case False{} False{}:
      Unit

def Fair.ahead(+p: Nat, +t: Nat, +b: Nat, +o: Nat, bs: +List<Nat>, out: +List<Nat>) -> Type:
  match bs out:
    case Nil{} Nil{}:
      Unit
    case Nil{} Con{o2, ot}:
      Empty
    case Con{b2, bt} Nil{}:
      Empty
    case Con{+b2, bt} Con{+o2, ot}:
      Fair.pair(Got(p, t, b, o), Got(p, t, b2, o2), Nat.mod(Nat.mul(b, p), t), Nat.mod(Nat.mul(b2, p), t)) & Fair.ahead(p, t, b, o, bt, ot)

def Fair(+p: Nat, +t: Nat, bs: +List<Nat>, out: +List<Nat>) -> Type:
  match bs out:
    case Nil{} Nil{}:
      Unit
    case Nil{} Con{o, ot}:
      Empty
    case Con{b, bt} Nil{}:
      Empty
    case Con{+b, +bt} Con{+o, +ot}:
      Fair.ahead(p, t, b, o, bt, ot) & Fair(p, t, bt, ot)

law split_sums_to_provider:
  for +p: Nat
  for +bs: +List<Nat>
  for +m: Nat
  for e: {C.total(bs) == 1n+m : Nat}
  {C.total(C.split(p, bs)) == p : Nat}

law split_rounds_each_share:
  for +p: Nat
  for +bs: +List<Nat>
  Quota(p, C.total(bs), bs, C.split(p, bs))

law split_gives_empty_none:
  for +p: Nat
  for +bs: +List<Nat>
  Zeros(bs, C.split(p, bs))

law split_leftover_to_largest_remainders:
  for +p: Nat
  for +bs: +List<Nat>
  Fair(p, C.total(bs), bs, C.split(p, bs))

import Base

type Share is Data:
  Share{q: Nat, r: Nat, up: Bool}

type Pick is Data:
  Pick{i: Nat, v: Nat}

def total(bs: +List<Nat>) -> Nat:
  match bs:
    case Nil{}:
      0n
    case b <> rest:
      Nat.add(b, total(rest))

def shares(+p: Nat, +t: Nat, bs: +List<Nat>) -> +List<Share>:
  match bs:
    case Nil{}:
      Nil{}
    case b <> rest:
      +x = Nat.mul(b, p)
      Share{Nat.div(x, t), Nat.mod(x, t), False{}} <> shares(p, t, rest)

def sum_q(xs: +List<Share>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case Share{q, r, up} <> rest:
      Nat.add(q, sum_q(rest))

def pick.shift(found: Maybe<&2, Pick>) -> Maybe<&2, Pick>:
  match found:
    case None{}:
      None{}
    case Some{Pick{i, v}}:
      Some{Pick{1n+i, v}}

def pick.choose(+r: Nat, i: Nat, v: Nat, ge: Bool) -> Maybe<&2, Pick>:
  match ge:
    case True{}:
      Some{Pick{0n, r}}
    case False{}:
      Some{Pick{1n+i, v}}

def pick.vs(+r: Nat, found: Maybe<&2, Pick>) -> Maybe<&2, Pick>:
  match found:
    case None{}:
      Some{Pick{0n, r}}
    case Some{Pick{i, +v}}:
      pick.choose(r, i, v, Nat.is_ge(r, v))

def pick.at(y: Share, found: Maybe<&2, Pick>) -> Maybe<&2, Pick>:
  match y:
    case Share{q, r, up}:
      match r up:
        case 0n _:
          pick.shift(found)
        case 1n+w True{}:
          pick.shift(found)
        case 1n+w False{}:
          pick.vs(1n+w, found)

def pick(xs: +List<Share>) -> Maybe<&2, Pick>:
  match xs:
    case Nil{}:
      None{}
    case y <> rest:
      pick.at(y, pick(rest))

def raise(y: Share) -> Share:
  match y:
    case Share{q, r, up}:
      Share{q, r, True{}}

def bump_at(i: Nat, xs: +List<Share>) -> +List<Share>:
  match i xs:
    case _ Nil{}:
      Nil{}
    case 0n y <> rest:
      raise(y) <> rest
    case 1n+j y <> rest:
      y <> bump_at(j, rest)

def step.go(xs: +List<Share>, found: Maybe<&2, Pick>) -> +List<Share>:
  match found:
    case None{}:
      xs
    case Some{Pick{i, v}}:
      bump_at(i, xs)

def step(+xs: +List<Share>) -> +List<Share>:
  step.go(xs, pick(xs))

def rounds(k: Nat, xs: +List<Share>) -> +List<Share>:
  match k:
    case 0n:
      xs
    case 1n+j:
      rounds(j, step(xs))

def token(y: Share) -> Nat:
  match y:
    case Share{q, r, up}:
      match up:
        case True{}:
          1n+q
        case False{}:
          q

def tokens(xs: +List<Share>) -> +List<Nat>:
  match xs:
    case Nil{}:
      Nil{}
    case y <> rest:
      token(y) <> tokens(rest)

def split(+p: Nat, +bs: +List<Nat>) -> +List<Nat>:
  +xs = shares(p, total(bs), bs)
  tokens(rounds(Nat.sub(p, sum_q(xs)), xs))

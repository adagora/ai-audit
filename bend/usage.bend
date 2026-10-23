import Base

type Usage is Data:
  Usage{input: Maybe<&2, Nat>, output: Maybe<&2, Nat>, cached: Maybe<&2, Nat>, write: Maybe<&2, Nat>}

type Turn is Data:
  Turn{read: Maybe<&2, Nat>, write: Maybe<&2, Nat>, input: Maybe<&2, Nat>, output: Maybe<&2, Nat>, prompt: Maybe<&2, Nat>}

type Call is Data:
  Call{billed: Bool, input: Maybe<&2, Nat>, output: Maybe<&2, Nat>}

type Totals is Data:
  Totals{input: Nat, output: Nat, unknownInput: Nat, unknownOutput: Nat, unknownUsage: Nat}

def or0(m: Maybe<&2, Nat>) -> Nat:
  match m:
    case None{}:
      0n
    case Some{n}:
      n

def turn.known(anthropic: Bool, +n: Nat, o: Maybe<&2, Nat>, +c: Maybe<&2, Nat>, +w: Maybe<&2, Nat>) -> Turn:
  match anthropic:
    case True{}:
      Turn{Some{or0(c)}, Some{or0(w)}, Some{n}, o, Some{Nat.add(Nat.add(n, or0(c)), or0(w))}}
    case False{}:
      Turn{Some{or0(c)}, None{}, Some{Nat.sub(n, or0(c))}, o, Some{n}}

def turn(anthropic: Bool, u: Usage) -> Turn:
  match u:
    case Usage{i, o, c, w}:
      match i:
        case None{}:
          Turn{None{}, None{}, None{}, o, None{}}
        case Some{n}:
          turn.known(anthropic, n, o, c, w)

def drop.expect(before: Turn, anthropic: Bool) -> Maybe<&2, Nat>:
  match before:
    case Turn{r, w, i, o, p}:
      match p:
        case None{}:
          None{}
        case Some{pp}:
          match anthropic:
            case True{}:
              Some{Nat.add(or0(r), or0(w))}
            case False{}:
              Some{pp}

def drop.at(+e: Nat, now: Maybe<&2, Nat>) -> Bool:
  match now:
    case None{}:
      False{}
    case Some{+c}:
      Bool.and(Nat.is_ge(e, 1024n), Nat.is_lt(Nat.add(c, c), e))

def drop.go(e: Maybe<&2, Nat>, now: Turn) -> Bool:
  match e:
    case None{}:
      False{}
    case Some{x}:
      match now:
        case Turn{r, w, i, o, p}:
          drop.at(x, r)

def drop(anthropic: Bool, now: Turn, before: Turn) -> Bool:
  drop.go(drop.expect(before, anthropic), now)

def unknown(m: Maybe<&2, Nat>) -> Nat:
  match m:
    case None{}:
      1n
    case Some{n}:
      0n

def unknown2(i: Maybe<&2, Nat>, o: Maybe<&2, Nat>) -> Nat:
  match i:
    case None{}:
      1n
    case Some{n}:
      unknown(o)

def add.call(c: Call, t: Totals) -> Totals:
  match c:
    case Call{b, +i, +o}:
      match b:
        case False{}:
          t
        case True{}:
          match t:
            case Totals{ti, to, ui, uo, uu}:
              Totals{Nat.add(ti, or0(i)), Nat.add(to, or0(o)), Nat.add(ui, unknown(i)), Nat.add(uo, unknown(o)), Nat.add(uu, unknown2(i, o))}

def totals.go(cs: +List<Call>, t: Totals) -> Totals:
  match cs:
    case Nil{}:
      t
    case c <> rest:
      totals.go(rest, add.call(c, t))

def totals(cs: +List<Call>) -> Totals:
  totals.go(cs, Totals{0n, 0n, 0n, 0n, 0n})

def totals.fast.go(cs: +List<Call>, ti: Nat, to: Nat, ui: Nat, uo: Nat, uu: Nat) -> Totals:
  match cs:
    case Nil{}:
      Totals{ti, to, ui, uo, uu}
    case Call{False{}, i, o} <> rest:
      totals.fast.go(rest, ti, to, ui, uo, uu)
    case Call{True{}, +i, +o} <> rest:
      totals.fast.go(rest, Nat.add(ti, or0(i)), Nat.add(to, or0(o)), Nat.add(ui, unknown(i)), Nat.add(uo, unknown(o)), Nat.add(uu, unknown2(i, o)))

def totals.fast(cs: +List<Call>) -> Totals:
  totals.fast.go(cs, 0n, 0n, 0n, 0n, 0n)

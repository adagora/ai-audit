import Base

type Raw is Data:
  Raw{start: Nat, end: Nat, ms: Nat, me: Nat, id: Nat}

type Group is Data:
  Group{start: Nat, end: Nat, ms: Nat, me: Nat, first: Nat, grown: Bool}

def open(s: Raw) -> Group:
  match s:
    case Raw{a, b, c, d, i}:
      Group{a, b, c, d, i, False{}}

def raw.start(s: Raw) -> Nat:
  match s:
    case Raw{a, b, c, d, i}:
      a

def raw.end(s: Raw) -> Nat:
  match s:
    case Raw{a, b, c, d, i}:
      b

def group.end(g: Group) -> Nat:
  match g:
    case Group{a, b, c, d, f, w}:
      b

def absorb(g: Group, s: Raw, gt: Bool) -> Group:
  match g:
    case Group{a, b, +c, +d, f, w}:
      match s:
        case Raw{sa, sb, +sc, +sd, si}:
          match gt:
            case True{}:
              Group{a, sb, Nat.min(c, sc), Nat.max(d, sd), f, True{}}
            case False{}:
              Group{a, b, Nat.min(c, sc), Nat.max(d, sd), f, w}

def step.at(+s: Raw, +g: Group, rest: +List<Group>, fresh: Bool) -> +List<Group>:
  match fresh:
    case True{}:
      open(s) <> (g <> rest)
    case False{}:
      absorb(g, s, Nat.is_gt(raw.end(s), group.end(g))) <> rest

def step(+s: Raw, acc: +List<Group>) -> +List<Group>:
  match acc:
    case Nil{}:
      open(s) <> Nil{}
    case +g <> rest:
      step.at(s, g, rest, Nat.is_ge(raw.start(s), group.end(g)))

def rev.groups(xs: +List<Group>, acc: +List<Group>) -> +List<Group>:
  match xs:
    case Nil{}:
      acc
    case x <> rest:
      rev.groups(rest, x <> acc)

def merge.go(xs: +List<Raw>, acc: +List<Group>) -> +List<Group>:
  match xs:
    case Nil{}:
      rev.groups(acc, Nil{})
    case x <> rest:
      merge.go(rest, step(x, acc))

def merge(xs: +List<Raw>) -> +List<Group>:
  merge.go(xs, Nil{})

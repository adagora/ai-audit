import Base

type Seen is Data:
  Seen{hash: Nat, age: Nat}

type Prev is Data:
  Fresh{}
  Known{seen: List<&2, Seen>}

type Block is Data:
  Block{hash: Nat, kind: Nat, bytes: Nat}

type First is Data:
  First{block: Nat, offset: Nat}

type Run is Data:
  Run{kind: Nat, bytes: Nat, age: Nat}

type Cut is Data:
  NoCut{}
  CutIn{blocks: Nat}

type Arena is Data:
  Arena{ages: List<&2, Nat>, first: Maybe<&2, First>, runs: List<&2, Run>}

def same(ps: +List<Seen>, bs: +List<Block>) -> Bool:
  match ps:
    case Nil{}:
      False{}
    case Seen{h, a} <> pt:
      match bs:
        case Nil{}:
          False{}
        case Block{g, k, n} <> bt:
          Nat.is_eq(h, g)

def first.go(ps: +List<Seen>, bs: +List<Block>, eq: Bool, i: Nat, off: Nat) -> Maybe<&2, First>:
  match ps:
    case Nil{}:
      None{}
    case p <> +pt:
      match bs:
        case Nil{}:
          Some{First{i, off}}
        case Block{g, k, n} <> +bt:
          match eq:
            case True{}:
              first.go(pt, bt, same(pt, bt), 1n+i, Nat.add(off, n))
            case False{}:
              Some{First{i, off}}

def first(prev: Prev, +bs: +List<Block>) -> Maybe<&2, First>:
  match prev:
    case Fresh{}:
      None{}
    case Known{+ps}:
      first.go(ps, bs, same(ps, bs), 0n, 0n)

def rev(xs: +List<Nat>, acc: +List<Nat>) -> +List<Nat>:
  match xs:
    case Nil{}:
      acc
    case x <> rest:
      rev(rest, x <> acc)

def fill(bs: +List<Block>, +age: Nat, acc: +List<Nat>) -> +List<Nat>:
  match bs:
    case Nil{}:
      rev(acc, Nil{})
    case b <> rest:
      fill(rest, age, age <> acc)

def ages.go(ps: +List<Seen>, bs: +List<Block>, eq: Bool, +turn: Nat, acc: +List<Nat>) -> +List<Nat>:
  match ps:
    case Nil{}:
      fill(bs, turn, acc)
    case Seen{h, a} <> +pt:
      match bs:
        case Nil{}:
          rev(acc, Nil{})
        case b <> +bt:
          match eq:
            case True{}:
              ages.go(pt, bt, same(pt, bt), turn, a <> acc)
            case False{}:
              fill(b <> bt, turn, acc)

def ages(prev: Prev, +bs: +List<Block>, turn: Nat, tracked: Bool) -> +List<Nat>:
  match prev:
    case Fresh{}:
      match tracked:
        case True{}:
          fill(bs, turn, Nil{})
        case False{}:
          fill(bs, 0n, Nil{})
    case Known{+ps}:
      ages.go(ps, bs, same(ps, bs), turn, Nil{})

def rev.runs(xs: +List<Run>, acc: +List<Run>) -> +List<Run>:
  match xs:
    case Nil{}:
      acc
    case x <> rest:
      rev.runs(rest, x <> acc)

def cut.next(c: Cut) -> Cut:
  match c:
    case NoCut{}:
      NoCut{}
    case CutIn{n}:
      match n:
        case 0n:
          NoCut{}
        case 1n+m:
          CutIn{m}

def joins.head(+k: Nat, +a: Nat, acc: +List<Run>) -> Bool:
  match acc:
    case Nil{}:
      False{}
    case Run{k2, n2, a2} <> rest:
      Bool.and(Nat.is_eq(k, k2), Nat.is_eq(a, a2))

def joins(bs: +List<Block>, ags: +List<Nat>, c: Cut, acc: +List<Run>) -> Bool:
  match bs:
    case Nil{}:
      False{}
    case Block{h, k, n} <> bt:
      match ags:
        case Nil{}:
          False{}
        case a <> at:
          match c:
            case NoCut{}:
              joins.head(k, a, acc)
            case CutIn{m}:
              match m:
                case 0n:
                  False{}
                case 1n+d:
                  joins.head(k, a, acc)

def grow(acc: +List<Run>, +n: Nat) -> +List<Run>:
  match acc:
    case Nil{}:
      Nil{}
    case Run{k, m, a} <> rest:
      Run{k, Nat.add(m, n), a} <> rest

def push(k: Nat, n: Nat, a: Nat, acc: +List<Run>) -> +List<Run>:
  Run{k, n, a} <> acc

def runs.go(bs: +List<Block>, ags: +List<Nat>, c: Cut, acc: +List<Run>, j: Bool) -> +List<Run>:
  match bs:
    case Nil{}:
      rev.runs(acc, Nil{})
    case Block{h, k, n} <> +bt:
      match ags:
        case Nil{}:
          rev.runs(acc, Nil{})
        case a <> +at:
          match j:
            case True{}:
              +c2 = cut.next(c)
              +acc2 = grow(acc, n)
              runs.go(bt, at, c2, acc2, joins(bt, at, c2, acc2))
            case False{}:
              +c2 = cut.next(c)
              +acc2 = push(k, n, a, acc)
              runs.go(bt, at, c2, acc2, joins(bt, at, c2, acc2))

def cut.of(f: Maybe<&2, First>) -> Cut:
  match f:
    case None{}:
      NoCut{}
    case Some{First{k, o}}:
      CutIn{k}

def runs(+bs: +List<Block>, +ags: +List<Nat>, f: Maybe<&2, First>) -> +List<Run>:
  +c = cut.of(f)
  runs.go(bs, ags, c, Nil{}, joins(bs, ags, c, Nil{}))

def arena(+prev: Prev, +bs: +List<Block>, turn: Nat, tracked: Bool) -> Arena:
  +ags = ages(prev, bs, turn, tracked)
  +f = first(prev, bs)
  Arena{ags, f, runs(bs, ags, f)}

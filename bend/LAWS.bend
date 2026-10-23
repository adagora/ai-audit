import Base
import ./context.bend as C
import ./arena.bend as A

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

def Agree(h: Nat, g: Nat) -> Type:
  {Nat.is_eq(h, g) == True{} : Bool}

def Disagree(h: Nat, g: Nat) -> Type:
  {Nat.is_eq(h, g) == False{} : Bool}

def Extends(ps: +List<A.Seen>, bs: +List<A.Block>) -> Type:
  match ps:
    case Nil{}:
      Unit
    case A.Seen{h, a} <> pt:
      match bs:
        case Nil{}:
          Empty
        case A.Block{g, k, n} <> bt:
          Agree(h, g) & Extends(pt, bt)

def DiffersAt(ps: +List<A.Seen>, bs: +List<A.Block>, i: Nat) -> Type:
  match ps:
    case Nil{}:
      Empty
    case A.Seen{h, a} <> pt:
      match bs:
        case Nil{}:
          {i == 0n : Nat}
        case A.Block{g, k, n} <> bt:
          match i:
            case 0n:
              Disagree(h, g)
            case 1n+j:
              Agree(h, g) & DiffersAt(pt, bt, j)

def BytesBefore(bs: +List<A.Block>, i: Nat) -> Nat:
  match bs:
    case Nil{}:
      0n
    case A.Block{g, k, n} <> bt:
      match i:
        case 0n:
          0n
        case 1n+j:
          Nat.add(n, BytesBefore(bt, j))

def FirstOk(prev: A.Prev, +bs: +List<A.Block>, r: Maybe<&2, A.First>) -> Type:
  match prev:
    case A.Fresh{}:
      match r:
        case None{}:
          Unit
        case Some{x}:
          Empty
    case A.Known{+ps}:
      match r:
        case None{}:
          Extends(ps, bs)
        case Some{A.First{+k, o}}:
          DiffersAt(ps, bs, k) & {o == BytesBefore(bs, k) : Nat}

def SameHead(ps: +List<A.Seen>, bs: +List<A.Block>) -> Bool:
  match ps:
    case Nil{}:
      False{}
    case A.Seen{h, a} <> pt:
      match bs:
        case Nil{}:
          False{}
        case A.Block{g, k, n} <> bt:
          Nat.is_eq(h, g)

def AllAt(bs: +List<A.Block>, +age: Nat) -> +List<Nat>:
  match bs:
    case Nil{}:
      Nil{}
    case b <> bt:
      age <> AllAt(bt, age)

def KeptAges(ps: +List<A.Seen>, bs: +List<A.Block>, eq: Bool, +turn: Nat) -> +List<Nat>:
  match ps:
    case Nil{}:
      AllAt(bs, turn)
    case A.Seen{h, a} <> +pt:
      match bs:
        case Nil{}:
          Nil{}
        case b <> +bt:
          match eq:
            case True{}:
              a <> KeptAges(pt, bt, SameHead(pt, bt), turn)
            case False{}:
              AllAt(b <> bt, turn)

def ExpectedAges(prev: A.Prev, +bs: +List<A.Block>, +turn: Nat, tracked: Bool) -> +List<Nat>:
  match prev:
    case A.Fresh{}:
      match tracked:
        case True{}:
          AllAt(bs, turn)
        case False{}:
          AllAt(bs, 0n)
    case A.Known{+ps}:
      KeptAges(ps, bs, SameHead(ps, bs), turn)

type Label is Data:
  Label{kind: Nat, age: Nat}

def Copies(n: Nat, +k: Nat, +a: Nat) -> +List<Label>:
  match n:
    case 0n:
      Nil{}
    case 1n+m:
      Label{k, a} <> Copies(m, k, a)

def Cat(xs: +List<Label>, +ys: +List<Label>) -> +List<Label>:
  match xs:
    case Nil{}:
      ys
    case x <> rest:
      x <> Cat(rest, ys)

def Expand(rs: +List<A.Run>) -> +List<Label>:
  match rs:
    case Nil{}:
      Nil{}
    case A.Run{k, n, a} <> rest:
      Cat(Copies(n, k, a), Expand(rest))

def Labels(bs: +List<A.Block>, ags: +List<Nat>) -> +List<Label>:
  match bs:
    case Nil{}:
      Nil{}
    case A.Block{g, k, n} <> bt:
      match ags:
        case Nil{}:
          Nil{}
        case a <> at:
          Cat(Copies(n, k, a), Labels(bt, at))

def Before(f: Maybe<&2, A.First>) -> Maybe<&2, Nat>:
  match f:
    case None{}:
      None{}
    case Some{A.First{b, o}}:
      Some{b}

def Tick(d: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match d:
    case None{}:
      None{}
    case Some{n}:
      match n:
        case 0n:
          None{}
        case 1n+m:
          Some{m}

def Fits(open: Maybe<&2, A.Run>, d: Maybe<&2, Nat>, +k: Nat, +a: Nat) -> Bool:
  match open:
    case None{}:
      False{}
    case Some{A.Run{k2, n2, a2}}:
      match d:
        case None{}:
          Bool.and(Nat.is_eq(k, k2), Nat.is_eq(a, a2))
        case Some{c}:
          match c:
            case 0n:
              False{}
            case 1n+m:
              Bool.and(Nat.is_eq(k, k2), Nat.is_eq(a, a2))

def NextFits(bs: +List<A.Block>, ags: +List<Nat>, open: Maybe<&2, A.Run>, d: Maybe<&2, Nat>) -> Bool:
  match bs:
    case Nil{}:
      False{}
    case A.Block{g, k, n} <> bt:
      match ags:
        case Nil{}:
          False{}
        case a <> at:
          Fits(open, d, k, a)

def Grow(open: Maybe<&2, A.Run>, +n: Nat) -> Maybe<&2, A.Run>:
  match open:
    case None{}:
      None{}
    case Some{A.Run{k, m, a}}:
      Some{A.Run{k, Nat.add(m, n), a}}

def Close(open: Maybe<&2, A.Run>, +rest: +List<A.Run>) -> +List<A.Run>:
  match open:
    case None{}:
      rest
    case Some{r}:
      r <> rest

def Grouped(bs: +List<A.Block>, ags: +List<Nat>, +open: Maybe<&2, A.Run>, +d: Maybe<&2, Nat>, fits: Bool) -> +List<A.Run>:
  match bs:
    case Nil{}:
      Close(open, Nil{})
    case A.Block{g, +k, +n} <> +bt:
      match ags:
        case Nil{}:
          Close(open, Nil{})
        case +a <> +at:
          match fits:
            case True{}:
              Grouped(bt, at, Grow(open, n), Tick(d), NextFits(bt, at, Grow(open, n), Tick(d)))
            case False{}:
              Close(open, Grouped(bt, at, Some{A.Run{k, n, a}}, Tick(d), NextFits(bt, at, Some{A.Run{k, n, a}}, Tick(d))))

def ExpectedRuns(+bs: +List<A.Block>, +ags: +List<Nat>, +f: Maybe<&2, A.First>) -> +List<A.Run>:
  Grouped(bs, ags, None{}, Before(f), NextFits(bs, ags, None{}, Before(f)))

def RunsOf(x: A.Arena) -> +List<A.Run>:
  match x:
    case A.Arena{ags, f, rs}:
      rs

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

law arena_first_change_is_the_first_difference:
  for +prev: A.Prev
  for +bs: +List<A.Block>
  FirstOk(prev, bs, A.first(prev, bs))

law arena_ages_keep_the_unchanged_prefix:
  for +prev: A.Prev
  for +bs: +List<A.Block>
  for +turn: Nat
  for +tracked: Bool
  {A.ages(prev, bs, turn, tracked) == ExpectedAges(prev, bs, turn, tracked) : List<&2, Nat>}

law arena_runs_keep_every_byte_with_its_kind_and_age:
  for +prev: A.Prev
  for +bs: +List<A.Block>
  for +turn: Nat
  for +tracked: Bool
  {Expand(RunsOf(A.arena(prev, bs, turn, tracked))) == Labels(bs, ExpectedAges(prev, bs, turn, tracked)) : List<&2, Label>}

law arena_runs_merge_neighbours_of_one_kind_and_age:
  for +prev: A.Prev
  for +bs: +List<A.Block>
  for +turn: Nat
  for +tracked: Bool
  {RunsOf(A.arena(prev, bs, turn, tracked)) == ExpectedRuns(bs, ExpectedAges(prev, bs, turn, tracked), A.first(prev, bs)) : List<&2, A.Run>}

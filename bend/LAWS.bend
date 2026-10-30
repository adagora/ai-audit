import Base
import ./context.bend as C
import ./arena.bend as A
import ./usage.bend as U
import ./spans.bend as S
import ./parts.bend as P
import ./mask.bend as K
import ./decide.bend as D
import ./policies.bend as Q
import ./budget.bend as B
import ./verdict.bend as V

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

def Or0(m: Maybe<&2, Nat>) -> Nat:
  match m:
    case None{}:
      0n
    case Some{n}:
      n

def Unknown(m: Maybe<&2, Nat>) -> Nat:
  match m:
    case None{}:
      1n
    case Some{n}:
      0n

def AnyUnknown(i: Maybe<&2, Nat>, o: Maybe<&2, Nat>) -> Nat:
  match i:
    case None{}:
      1n
    case Some{n}:
      Unknown(o)

def ExpectedPrefix(before: U.Turn, anthropic: Bool) -> Maybe<&2, Nat>:
  match before:
    case U.Turn{read, write, input, output, prompt}:
      match prompt:
        case None{}:
          None{}
        case Some{p}:
          match anthropic:
            case True{}:
              Some{Nat.add(Or0(read), Or0(write))}
            case False{}:
              Some{p}

def ExpectedTurn(anthropic: Bool, +input: Nat, output: Maybe<&2, Nat>, +cached: Maybe<&2, Nat>, +write: Maybe<&2, Nat>) -> U.Turn:
  match anthropic:
    case True{}:
      U.Turn{Some{Or0(cached)}, Some{Or0(write)}, Some{input}, output, Some{Nat.add(Nat.add(input, Or0(cached)), Or0(write))}}
    case False{}:
      U.Turn{Some{Or0(cached)}, None{}, Some{Nat.sub(input, Or0(cached))}, output, Some{input}}

def BelowHalf(read: Maybe<&2, Nat>, +prefix: Nat) -> Bool:
  match read:
    case None{}:
      False{}
    case Some{+c}:
      Nat.is_lt(Nat.add(c, c), prefix)

def CacheDropped(prefix: Maybe<&2, Nat>, now: U.Turn) -> Bool:
  match prefix:
    case None{}:
      False{}
    case Some{+x}:
      match now:
        case U.Turn{read, write, input, output, prompt}:
          Bool.and(Nat.is_ge(x, 1024n), BelowHalf(read, x))

def AddTo(x1: Nat, x2: Nat, x3: Nat, x4: Nat, x5: Nat, t: U.Totals) -> U.Totals:
  match t:
    case U.Totals{a, b, c, d, e}:
      U.Totals{Nat.add(x1, a), Nat.add(x2, b), Nat.add(x3, c), Nat.add(x4, d), Nat.add(x5, e)}

def Plus(+i: Maybe<&2, Nat>, +o: Maybe<&2, Nat>, t: U.Totals) -> U.Totals:
  AddTo(Or0(i), Or0(o), Unknown(i), Unknown(o), AnyUnknown(i, o), t)

def ExpectedTotals(cs: +List<U.Call>) -> U.Totals:
  match cs:
    case Nil{}:
      U.Totals{0n, 0n, 0n, 0n, 0n}
    case U.Call{b, +i, +o} <> rest:
      match b:
        case False{}:
          ExpectedTotals(rest)
        case True{}:
          Plus(i, o, ExpectedTotals(rest))

def Within(+p: Nat, a: Nat, b: Nat) -> Type:
  {Nat.is_le(a, p) == True{} : Bool} & {Nat.is_lt(p, b) == True{} : Bool}

def InRaws(+p: Nat, xs: +List<S.Raw>) -> Type:
  match xs:
    case Nil{}:
      Empty
    case S.Raw{a, b, c, d, i} <> rest:
      Within(p, a, b) | InRaws(p, rest)

def InGroups(+p: Nat, gs: +List<S.Group>) -> Type:
  match gs:
    case Nil{}:
      Empty
    case S.Group{a, b, c, d, f, w} <> rest:
      Within(p, a, b) | InGroups(p, rest)

def SortedFrom(+a: Nat, xs: +List<S.Raw>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case S.Raw{+s, e, c, d, i} <> rest:
      {Nat.is_le(a, s) == True{} : Bool} & SortedFrom(s, rest)

def Sorted(xs: +List<S.Raw>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case S.Raw{s, e, c, d, i} <> rest:
      SortedFrom(s, rest)

def ApartFrom(+e: Nat, gs: +List<S.Group>) -> Type:
  match gs:
    case Nil{}:
      Unit
    case S.Group{a, +b, c, d, f, w} <> rest:
      {Nat.is_le(e, a) == True{} : Bool} & ApartFrom(b, rest)

def Apart(gs: +List<S.Group>) -> Type:
  match gs:
    case Nil{}:
      Unit
    case S.Group{a, b, c, d, f, w} <> rest:
      ApartFrom(b, rest)

def Crossing(bs: +List<Nat>, +c: Nat, +d: Nat) -> Bool:
  match bs:
    case Nil{}:
      False{}
    case Con{+b, rest}:
      Bool.or(Bool.and(Nat.is_lt(c, b), Nat.is_lt(b, d)), Crossing(rest, c, d))

def CrossOf(bs: +List<Nat>, s: P.Span) -> Bool:
  match s:
    case P.Span{a, b, c, d}:
      Crossing(bs, c, d)

def Touches(s: P.Span, t: P.Span) -> Bool:
  match s t:
    case P.Span{a, b, c, d} P.Span{a2, b2, c2, d2}:
      Bool.and(Nat.is_lt(c, b2), Nat.is_lt(a2, d))

def SpansOf(ms: +List<P.Mark>) -> List<&2, P.Span>:
  match ms:
    case Nil{}:
      Nil{}
    case Con{P.Mark{s, t}, rest}:
      s <> SpansOf(rest)

def CrossTaken(bs: +List<Nat>, ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{s, t}, rest}:
      ({CrossOf(bs, s) == True{} : Bool} -> {t == True{} : Bool}) & CrossTaken(bs, rest)

def Gate(t: Bool, t2: Bool, x: Bool) -> Type:
  match t t2:
    case False{} True{}:
      {x == False{} : Bool}
    case _ _:
      Unit

def NoTouch(+m: P.Mark, +n: P.Mark) -> Type:
  match m n:
    case P.Mark{+s, +t} P.Mark{+s2, +t2}:
      Gate(t, t2, Touches(s, s2)) & Gate(t2, t, Touches(s2, s))

def NoTouchAll(+m: P.Mark, ns: +List<P.Mark>) -> Type:
  match ns:
    case Nil{}:
      Unit
    case Con{n, rest}:
      NoTouch(m, n) & NoTouchAll(m, rest)

def Untouched(ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{m, rest}:
      NoTouchAll(m, rest) & Untouched(rest)

def TakenWithin(ms: +List<P.Mark>, xs: +List<P.Mark>) -> Type:
  match ms xs:
    case Nil{} Nil{}:
      Unit
    case Con{P.Mark{s, t}, rest} Con{P.Mark{s2, t2}, rest2}:
      ({t == True{} : Bool} -> {t2 == True{} : Bool}) & TakenWithin(rest, rest2)
    case _ _:
      Empty

def BsFrom(+a: Nat, bs: +List<Nat>) -> Type:
  match bs:
    case Nil{}:
      Unit
    case Con{+b, rest}:
      {Nat.is_le(a, b) == True{} : Bool} & BsFrom(b, rest)

def Framed(+s: P.Span) -> Type:
  match s:
    case P.Span{+a, +b, c, d}:
      {Nat.is_le(c, a) == True{} : Bool} & ({Nat.is_lt(a, b) == True{} : Bool} & {Nat.is_le(b, d) == True{} : Bool})

def SpansFrom(+e: Nat, ss: +List<P.Span>) -> Type:
  match ss:
    case Nil{}:
      Unit
    case Con{P.Span{+a, +b, +c, +d}, rest}:
      {Nat.is_le(e, a) == True{} : Bool} & (Framed(P.Span{a, b, c, d}) & SpansFrom(b, rest))

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

law usage_unknown_input_stays_unknown:
  for anthropic: Bool
  for +output: Maybe<&2, Nat>
  for cached: Maybe<&2, Nat>
  for write: Maybe<&2, Nat>
  {U.turn(anthropic, U.Usage{None{}, output, cached, write}) == U.Turn{None{}, None{}, None{}, output, None{}} : U.Turn}

law usage_known_input_splits_the_prompt:
  for anthropic: Bool
  for +input: Nat
  for +output: Maybe<&2, Nat>
  for +cached: Maybe<&2, Nat>
  for +write: Maybe<&2, Nat>
  {U.turn(anthropic, U.Usage{Some{input}, output, cached, write}) == ExpectedTurn(anthropic, input, output, cached, write) : U.Turn}

law usage_cache_drop_only_from_evidence:
  for +anthropic: Bool
  for +now: U.Turn
  for +before: U.Turn
  {U.drop(anthropic, now, before) == CacheDropped(ExpectedPrefix(before, anthropic), now) : Bool}

law usage_totals_count_unknown_apart:
  for +cs: +List<U.Call>
  {U.totals(cs) == ExpectedTotals(cs) : U.Totals}

law spans_mask_every_finding_byte:
  for +xs: +List<S.Raw>
  for sorted: Sorted(xs)
  for +p: Nat
  for h: InRaws(p, xs)
  InGroups(p, S.merge(xs))

law spans_mask_only_finding_bytes:
  for +xs: +List<S.Raw>
  for +p: Nat
  for h: InGroups(p, S.merge(xs))
  InRaws(p, xs)

law spans_groups_are_apart:
  for +xs: +List<S.Raw>
  Apart(S.merge(xs))

law parts_keep_every_span_in_order:
  for +bs: +List<Nat>
  for +ss: +List<P.Span>
  {SpansOf(P.taken(bs, ss)) == ss : List<&2, P.Span>}

law parts_take_every_span_whose_match_crosses_a_part:
  for +bs: +List<Nat>
  for sorted: BsFrom(0n, bs)
  for +ss: +List<P.Span>
  for apart: SpansFrom(0n, ss)
  CrossTaken(bs, P.taken(bs, ss))

law parts_untaken_matches_touch_no_taken_span:
  for +bs: +List<Nat>
  for +ss: +List<P.Span>
  for apart: SpansFrom(0n, ss)
  Untouched(P.taken(bs, ss))

law parts_take_no_span_that_crossings_do_not_force:
  for +bs: +List<Nat>
  for sorted: BsFrom(0n, bs)
  for +ss: +List<P.Span>
  for apart: SpansFrom(0n, ss)
  for +xs: +List<P.Mark>
  for +same: {SpansOf(xs) == ss : List<&2, P.Span>}
  for cross: CrossTaken(bs, xs)
  for closed: Untouched(xs)
  TakenWithin(P.taken(bs, ss), xs)

law parts_fast_version_gives_the_same_marks:
  for +bs: +List<Nat>
  for +ss: +List<P.Span>
  {P.taken.fast(bs, ss) == P.taken(bs, ss) : List<&2, P.Mark>}

law spans_merge_of_no_span_is_empty:
  {S.merge([]) == [] : List<&2, S.Group>}

law spans_merge_of_one_span_keeps_it:
  for +a: Nat
  for +b: Nat
  for +c: Nat
  for +d: Nat
  for +i: Nat
  {S.merge([S.Raw{a, b, c, d, i}]) == [S.Group{a, b, c, d, i, False{}}] : List<&2, S.Group>}

law usage_fast_totals_match_the_spec:
  for +cs: +List<U.Call>
  {U.totals.fast(cs) == U.totals(cs) : U.Totals}

def PosSeen(ps: +List<A.Seen>, +i: Nat) -> List<&2, A.Seen>:
  match ps:
    case Nil{}:
      Nil{}
    case A.Seen{h, a} <> rest:
      A.Seen{Nat.add(i, i), a} <> PosSeen(rest, 1n+i)

def PosHash(e: Bool, +i: Nat) -> Nat:
  match e:
    case True{}:
      Nat.add(i, i)
    case False{}:
      1n+Nat.add(i, i)

def PosBlocks(bs: +List<A.Block>, ps: +List<A.Seen>, +i: Nat) -> List<&2, A.Block>:
  match bs:
    case Nil{}:
      Nil{}
    case A.Block{g, k, n} <> bt:
      match ps:
        case Nil{}:
          A.Block{1n+Nat.add(i, i), k, n} <> PosBlocks(bt, Nil{}, 1n+i)
        case A.Seen{h, a} <> pt:
          A.Block{PosHash(Nat.is_eq(h, g), i), k, n} <> PosBlocks(bt, pt, 1n+i)

def PosPrev(prev: A.Prev) -> A.Prev:
  match prev:
    case A.Fresh{}:
      A.Fresh{}
    case A.Known{ps}:
      A.Known{PosSeen(ps, 0n)}

def PosBlocksOf(prev: A.Prev, bs: +List<A.Block>) -> List<&2, A.Block>:
  match prev:
    case A.Fresh{}:
      PosBlocks(bs, Nil{}, 0n)
    case A.Known{ps}:
      PosBlocks(bs, ps, 0n)

law arena_reads_hashes_only_position_by_position:
  for +prev: A.Prev
  for +bs: +List<A.Block>
  for +turn: Nat
  for +tracked: Bool
  {A.arena(PosPrev(prev), PosBlocksOf(prev, bs), turn, tracked) == A.arena(prev, bs, turn, tracked) : A.Arena}

type Item is Data:
  Byte{p: Nat}
  Marker{i: Nat}

def Inside(+p: Nat, ss: +List<K.Cut>) -> Bool:
  match ss:
    case Nil{}:
      False{}
    case Con{K.Cut{+a, +b}, rest}:
      Bool.or(Bool.and(Nat.is_le(a, p), Nat.is_lt(p, b)), Inside(p, rest))

def Opens(+p: Nat, ss: +List<K.Cut>) -> Bool:
  match ss:
    case Nil{}:
      False{}
    case Con{K.Cut{a, b}, rest}:
      Bool.or(Nat.is_eq(a, p), Opens(p, rest))

def OpenIndex(+p: Nat, ss: +List<K.Cut>, +i: Nat) -> Nat:
  match ss:
    case Nil{}:
      i
    case Con{K.Cut{a, b}, rest}:
      Bool.pick(Nat, Nat.is_eq(a, p), i, OpenIndex(p, rest, 1n+i))

def At(+p: Nat, +ss: +List<K.Cut>, +i: Nat) -> List<&2, Item>:
  Bool.pick(List<&2, Item>, Inside(p, ss), Bool.pick(List<&2, Item>, Opens(p, ss), [Marker{OpenIndex(p, ss, i)}], []), [Byte{p}])

def Join(xs: +List<Item>, ys: +List<Item>) -> List<&2, Item>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      x <> Join(rest, ys)

def Items(n: Nat, +p: Nat, +ss: +List<K.Cut>, +i: Nat) -> List<&2, Item>:
  match n:
    case 0n:
      []
    case 1n+m:
      Join(At(p, ss, i), Items(m, 1n+p, ss, i))

def MaskedParts(bs: +List<Nat>, +lo: Nat, +ss: +List<K.Cut>, +i: Nat) -> List<&2, List<&2, Item>>:
  match bs:
    case Nil{}:
      []
    case Con{+hi, rest}:
      Items(Nat.sub(hi, lo), lo, ss, i) <> MaskedParts(rest, hi, ss, i)

def Bytes(n: Nat, +a: Nat) -> List<&2, Item>:
  match n:
    case 0n:
      []
    case 1n+m:
      Byte{a} <> Bytes(m, 1n+a)

def Shown(ps: +List<K.Piece>) -> List<&2, Item>:
  match ps:
    case Nil{}:
      []
    case Con{K.Keep{+a, b}, rest}:
      Join(Bytes(Nat.sub(b, a), a), Shown(rest))
    case Con{K.Hide{i}, rest}:
      Marker{i} <> Shown(rest)

def ShownParts(xs: +List<List<&2, K.Piece>>) -> List<&2, List<&2, Item>>:
  match xs:
    case Nil{}:
      []
    case Con{x, rest}:
      Shown(x) <> ShownParts(rest)

def CutsFrom(+e: Nat, ss: +List<K.Cut>) -> Type:
  match ss:
    case Nil{}:
      Unit
    case Con{K.Cut{+a, +b}, rest}:
      {Nat.is_le(e, a) == True{} : Bool} & ({Nat.is_lt(a, b) == True{} : Bool} & CutsFrom(b, rest))

law mask_keeps_each_byte_outside_findings_and_marks_each_finding_once:
  for +bs: +List<Nat>
  for sorted: BsFrom(0n, bs)
  for +ss: +List<K.Cut>
  for apart: CutsFrom(0n, ss)
  {ShownParts(K.cut(bs, ss)) == MaskedParts(bs, 0n, ss, 0n) : List<&2, List<&2, Item>>}

def Maskable(fs: +List<Bool>) -> Bool:
  match fs:
    case Nil{}:
      True{}
    case Con{f, rest}:
      Bool.and(f, Maskable(rest))

law decide_forwards_the_original_when_nothing_is_found:
  for mode: D.Mode
  {D.decide(mode, []) == D.Original{} : D.Action}

law decide_forwards_the_original_in_advisory_mode:
  for +fs: +List<Bool>
  {D.decide(D.Advisory{}, fs) == D.Original{} : D.Action}

law decide_blocks_every_finding_in_no_go_mode:
  for f: Bool
  for +fs: +List<Bool>
  {D.decide(D.NoGo{}, f <> fs) == D.Blocked{} : D.Action}

law decide_masks_in_redact_mode_only_when_every_finding_can_be_masked:
  for +f: Bool
  for +fs: +List<Bool>
  {D.decide(D.Redact{}, f <> fs) == Bool.pick(D.Action, Maskable(f <> fs), D.Masked{}, D.Unmaskable{}) : D.Action}

def KeySame(a: +List<Bool>, b: +List<Bool>) -> Bool:
  match a:
    case Nil{}:
      match b:
        case Nil{}:
          True{}
        case Con{y, rb}:
          False{}
    case Con{x, ra}:
      match x:
        case True{}:
          match b:
            case Nil{}:
              False{}
            case Con{y, rb}:
              match y:
                case True{}:
                  KeySame(ra, rb)
                case False{}:
                  False{}
        case False{}:
          match b:
            case Nil{}:
              False{}
            case Con{y, rb}:
              match y:
                case True{}:
                  False{}
                case False{}:
                  KeySame(ra, rb)

def KeyIn(+k: +List<Bool>, ks: +List<List<&2, Bool>>) -> Bool:
  match ks:
    case Nil{}:
      False{}
    case x <> rest:
      Bool.or(KeySame(x, k), KeyIn(k, rest))

def UseCases(hs: +List<Q.History>) -> +List<List<&2, Bool>>:
  match hs:
    case Nil{}:
      Nil{}
    case Q.History{g, vs, cur} <> rest:
      g <> UseCases(rest)

def FirstUseCases(ds: +List<Q.Use>, +seen: +List<List<&2, Bool>>) -> +List<List<&2, Bool>>:
  match ds:
    case Nil{}:
      Nil{}
    case Q.Use{+g, s} <> +rest:
      Bool.pick(List<&2, List<&2, Bool>>, KeyIn(g, seen), FirstUseCases(rest, seen), g <> FirstUseCases(rest, g <> seen))

def Programs(vs: +List<Q.Version>) -> +List<List<&2, Bool>>:
  match vs:
    case Nil{}:
      Nil{}
    case Q.Version{s, st} <> rest:
      s <> Programs(rest)

def ProgramsOf(+g: +List<Bool>, hs: +List<Q.History>) -> +List<List<&2, Bool>>:
  match hs:
    case Nil{}:
      Nil{}
    case Q.History{g2, +vs, cur} <> +rest:
      Bool.pick(List<&2, List<&2, Bool>>, KeySame(g2, g), Programs(vs), ProgramsOf(g, rest))

def FirstPrograms(+g: +List<Bool>, ds: +List<Q.Use>, +seen: +List<List<&2, Bool>>) -> +List<List<&2, Bool>>:
  match ds:
    case Nil{}:
      Nil{}
    case Q.Use{g2, +s} <> +rest:
      Bool.pick(List<&2, List<&2, Bool>>, Bool.and(KeySame(g2, g), Bool.not(KeyIn(s, seen))), s <> FirstPrograms(g, rest, s <> seen), FirstPrograms(g, rest, seen))

def StatIn(+s: +List<Bool>, vs: +List<Q.Version>) -> Maybe<&2, Q.Stat>:
  match vs:
    case Nil{}:
      None{}
    case Q.Version{s2, +st} <> +rest:
      Bool.pick(Maybe<&2, Q.Stat>, KeySame(s2, s), Some{st}, StatIn(s, rest))

def StatOf(+g: +List<Bool>, +s: +List<Bool>, hs: +List<Q.History>) -> Maybe<&2, Q.Stat>:
  match hs:
    case Nil{}:
      None{}
    case Q.History{g2, +vs, cur} <> +rest:
      Bool.pick(Maybe<&2, Q.Stat>, KeySame(g2, g), StatIn(s, vs), StatOf(g, s, rest))

def Earliest(+i: Nat, m: Maybe<&2, Q.Stat>) -> Q.Stat:
  match m:
    case None{}:
      Q.Stat{i, i, 1n}
    case Some{Q.Stat{f, l, c}}:
      Q.Stat{i, l, 1n+c}

def ExpectedStat(+g: +List<Bool>, +s: +List<Bool>, ds: +List<Q.Use>, +i: Nat) -> Maybe<&2, Q.Stat>:
  match ds:
    case Nil{}:
      None{}
    case Q.Use{g2, s2} <> +rest:
      Bool.pick(Maybe<&2, Q.Stat>, Bool.and(KeySame(g2, g), KeySame(s2, s)), Some{Earliest(i, ExpectedStat(g, s, rest, 1n+i))}, ExpectedStat(g, s, rest, 1n+i))

def CurrentOf(+g: +List<Bool>, hs: +List<Q.History>) -> Maybe<&2, List<&2, Bool>>:
  match hs:
    case Nil{}:
      None{}
    case Q.History{g2, vs, +cur} <> +rest:
      Bool.pick(Maybe<&2, List<&2, Bool>>, KeySame(g2, g), Some{cur}, CurrentOf(g, rest))

def Later(m: Maybe<&2, List<&2, Bool>>, b: Bool, +s: +List<Bool>) -> Maybe<&2, List<&2, Bool>>:
  match m:
    case Some{x}:
      Some{x}
    case None{}:
      Bool.pick(Maybe<&2, List<&2, Bool>>, b, Some{s}, None{})

def LatestProgram(+g: +List<Bool>, ds: +List<Q.Use>) -> Maybe<&2, List<&2, Bool>>:
  match ds:
    case Nil{}:
      None{}
    case Q.Use{g2, s2} <> rest:
      Later(LatestProgram(g, rest), KeySame(g2, g), s2)

law policies_list_each_use_case_once_in_order_of_first_use:
  for +ds: +List<Q.Use>
  {UseCases(Q.histories(ds)) == FirstUseCases(ds, []) : List<&2, List<&2, Bool>>}

law policies_list_each_program_of_a_use_case_once_in_order_of_first_use:
  for +g: +List<Bool>
  for +ds: +List<Q.Use>
  {ProgramsOf(g, Q.histories(ds)) == FirstPrograms(g, ds, []) : List<&2, List<&2, Bool>>}

law policies_count_each_version_from_its_first_to_its_last_decision:
  for +g: +List<Bool>
  for +s: +List<Bool>
  for +ds: +List<Q.Use>
  {StatOf(g, s, Q.histories(ds)) == ExpectedStat(g, s, ds, 0n) : Maybe<&2, Q.Stat>}

law policies_mark_the_program_of_the_latest_decision_current:
  for +g: +List<Bool>
  for +ds: +List<Q.Use>
  {CurrentOf(g, Q.histories(ds)) == LatestProgram(g, ds) : Maybe<&2, List<&2, Bool>>}

def ExpectedVerdict(ok: Bool) -> B.Verdict:
  match ok:
    case True{}:
      B.Ok{}
    case False{}:
      B.Exceeded{}

def UsedInput(anthropic: Bool, input: Maybe<&2, Nat>, +cached: Maybe<&2, Nat>, +write: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match anthropic:
    case True{}:
      match input:
        case None{}:
          None{}
        case Some{n}:
          Some{Nat.add(Nat.add(n, Or0(cached)), Or0(write))}
    case False{}:
      input

def OrReserved(used: Maybe<&2, Nat>, +reserved: Nat) -> Nat:
  match used:
    case None{}:
      reserved
    case Some{n}:
      n

def IsKnown(used: Maybe<&2, Nat>) -> Bool:
  match used:
    case None{}:
      False{}
    case Some{n}:
      True{}

def ExpectedChargeOf(+used: Maybe<&2, Nat>, +output: Maybe<&2, Nat>, +ri: Nat, +ro: Nat) -> B.Charge:
  B.Charge{OrReserved(used, ri), OrReserved(output, ro), IsKnown(used), IsKnown(output), Bool.or(Nat.is_gt(OrReserved(used, ri), ri), Nat.is_gt(OrReserved(output, ro), ro))}

def ChargedInput(c: B.Charge) -> Nat:
  match c:
    case B.Charge{i, o, ik, ok, over}:
      i

def ChargedOutput(c: B.Charge) -> Nat:
  match c:
    case B.Charge{i, o, ik, ok, over}:
      o

def OverrunOf(c: B.Charge) -> Bool:
  match c:
    case B.Charge{i, o, ik, ok, over}:
      over

law budget_blocked_admits_nothing:
  for ui: Nat
  for uo: Nat
  for i: Nat
  for o: Nat
  for li: Nat
  for lo: Nat
  {B.admit(True{}, ui, uo, i, o, li, lo) == B.Blocked{} : B.Verdict}

law budget_admits_exactly_what_fits:
  for +ui: Nat
  for +uo: Nat
  for +i: Nat
  for +o: Nat
  for +li: Nat
  for +lo: Nat
  {B.admit(False{}, ui, uo, i, o, li, lo) == ExpectedVerdict(Bool.and(Nat.is_le(Nat.add(ui, i), li), Nat.is_le(Nat.add(uo, o), lo))) : B.Verdict}

law budget_charges_known_usage_or_the_reservation:
  for anthropic: Bool
  for +ri: Nat
  for +ro: Nat
  for +input: Maybe<&2, Nat>
  for +cached: Maybe<&2, Nat>
  for +write: Maybe<&2, Nat>
  for +output: Maybe<&2, Nat>
  {B.charge(anthropic, ri, ro, input, cached, write, output) == ExpectedChargeOf(UsedInput(anthropic, input, cached, write), output, ri, ro) : B.Charge}

law budget_admitted_and_not_overrun_stays_within_the_limit:
  for +ui: Nat
  for +uo: Nat
  for +ri: Nat
  for +ro: Nat
  for +li: Nat
  for +lo: Nat
  for +anthropic: Bool
  for +input: Maybe<&2, Nat>
  for +cached: Maybe<&2, Nat>
  for +write: Maybe<&2, Nat>
  for +output: Maybe<&2, Nat>
  for admitted: {B.admit(False{}, ui, uo, ri, ro, li, lo) == B.Ok{} : B.Verdict}
  for within: {OverrunOf(B.charge(anthropic, ri, ro, input, cached, write, output)) == False{} : Bool}
  {Bool.and(Nat.is_le(Nat.add(ui, ChargedInput(B.charge(anthropic, ri, ro, input, cached, write, output))), li), Nat.is_le(Nat.add(uo, ChargedOutput(B.charge(anthropic, ri, ro, input, cached, write, output))), lo)) == True{} : Bool}

def LastOr(m: Maybe<&2, V.Verdict>, v: V.Verdict) -> Maybe<&2, V.Verdict>:
  match m:
    case None{}:
      Some{v}
    case Some{x}:
      Some{x}

def LastOf(rs: List<&2, V.Verdict>) -> Maybe<&2, V.Verdict>:
  match rs:
    case Nil{}:
      None{}
    case Con{v, rest}:
      LastOr(LastOf(rest), v)

def Snoc(rs: List<&2, V.Verdict>, v: V.Verdict) -> List<&2, V.Verdict>:
  match rs:
    case Nil{}:
      [v]
    case Con{x, rest}:
      x <> Snoc(rest, v)

def Refused(m: Maybe<&2, V.Verdict>) -> Bool:
  match m:
    case Some{V.Rejected{}}:
      True{}
    case Some{V.Overridden{}}:
      True{}
    case _:
      False{}

def IsApproved(m: Maybe<&2, V.Verdict>) -> Bool:
  match m:
    case Some{V.Approved{}}:
      True{}
    case _:
      False{}

def ExpectedAuthorized(simulated: Bool, +last: Maybe<&2, V.Verdict>) -> Bool:
  Bool.or(Bool.and(simulated, Bool.not(Refused(last))), IsApproved(last))

law verdict_an_effect_not_done_needs_no_verdict:
  for simulated: Bool
  for rs: List<&2, V.Verdict>
  {V.authorized(False{}, simulated, rs) == True{} : Bool}

law verdict_a_done_effect_follows_the_latest_review:
  for +simulated: Bool
  for +rs: List<&2, V.Verdict>
  {V.authorized(True{}, simulated, rs) == ExpectedAuthorized(simulated, LastOf(rs)) : Bool}

law verdict_the_review_recorded_last_decides:
  for +simulated: Bool
  for +rs: List<&2, V.Verdict>
  for +v: V.Verdict
  {V.authorized(True{}, simulated, Snoc(rs, v)) == ExpectedAuthorized(simulated, Some{v}) : Bool}


import Base
import ./context.bend as C
import ./LAWS.bend as Laws
import ./arena.bend as A
import ./usage.bend as U
import ./spans.bend as S
import ./parts.bend as P
import ./mask.bend as K
import ./decide.bend as D
import ./policies.bend as Q

def add_zero(a: Nat) -> {a == Nat.add(a, 0n) : Nat}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      %add_zero(p) : {1n+p == 1n+_ : Nat}
      {==}

def add_succ(a: Nat, -b: Nat) -> {1n+Nat.add(a, b) == Nat.add(a, 1n+b) : Nat}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      %add_succ(p, b) : {2n+Nat.add(p, b) == 1n+_ : Nat}
      {==}

def add_comm(a: Nat, +b: Nat) -> {Nat.add(a, b) == Nat.add(b, a) : Nat}:
  match a:
    case 0n:
      %add_zero(b) : {b == _ : Nat}
      {==}
    case 1n+p:
      %add_succ(b, p) : {1n+Nat.add(p, b) == _ : Nat}
      %add_comm(p, b) : {1n+Nat.add(p, b) == 1n+_ : Nat}
      {==}

def add_assoc(a: Nat, -b: Nat, -c: Nat) -> {Nat.add(a, Nat.add(b, c)) == Nat.add(Nat.add(a, b), c) : Nat}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      %add_assoc(p, b, c) : {1n+Nat.add(p, Nat.add(b, c)) == 1n+_ : Nat}
      {==}

def add_swap(x: Nat, +y: Nat, +z: Nat) -> {Nat.add(x, Nat.add(y, z)) == Nat.add(y, Nat.add(x, z)) : Nat}:
  match x:
    case 0n:
      {==}
    case 1n+q:
      %add_succ(y, Nat.add(q, z)) : {1n+Nat.add(q, Nat.add(y, z)) == _ : Nat}
      %add_swap(q, y, z) : {1n+Nat.add(q, Nat.add(y, z)) == 1n+_ : Nat}
      {==}

def add_regroup(a: Nat, b: Nat, c: Nat, d: Nat) -> {Nat.add(Nat.add(a, b), Nat.add(c, d)) == Nat.add(Nat.add(a, c), Nat.add(b, d)) : Nat}:
  match a:
    case 0n:
      add_swap(b, c, d)
    case 1n+p:
      %add_regroup(p, b, c, d) : {1n+Nat.add(Nat.add(p, b), Nat.add(c, d)) == 1n+_ : Nat}
      {==}

def mul_zero(a: Nat) -> {Nat.mul(a, 0n) == 0n : Nat}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      mul_zero(p)

def mul_succ(+a: Nat, +b: Nat) -> {Nat.add(a, Nat.mul(a, b)) == Nat.mul(a, 1n+b) : Nat}:
  match a:
    case 0n:
      {==}
    case 1n++p:
      %mul_succ(p, b) : {1n+Nat.add(p, Nat.add(b, Nat.mul(p, b))) == 1n+Nat.add(b, _) : Nat}
      %add_swap(p, b, Nat.mul(p, b)) : {1n+Nat.add(p, Nat.add(b, Nat.mul(p, b))) == 1n+_ : Nat}
      {==}

def mul_comm(+a: Nat, +b: Nat) -> {Nat.mul(a, b) == Nat.mul(b, a) : Nat}:
  match a:
    case 0n:
      %mul_zero(b) : {_ == Nat.mul(b, 0n) : Nat}
      {==}
    case 1n++p:
      %mul_succ(b, p) : {Nat.add(b, Nat.mul(p, b)) == _ : Nat}
      %mul_comm(p, b) : {Nat.add(b, Nat.mul(p, b)) == Nat.add(b, _) : Nat}
      {==}

def mul_dist(a: Nat, -b: Nat, +c: Nat) -> {Nat.add(Nat.mul(a, c), Nat.mul(b, c)) == Nat.mul(Nat.add(a, b), c) : Nat}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      %mul_dist(p, b, c) : {Nat.add(Nat.add(c, Nat.mul(p, c)), Nat.mul(b, c)) == Nat.add(c, _) : Nat}
      %add_assoc(c, Nat.mul(p, c), Nat.mul(b, c)) : {_ == Nat.add(c, Nat.add(Nat.mul(p, c), Nat.mul(b, c))) : Nat}
      {==}

def NatD(x: Nat, zc: Type, sc: Type) -> Type:
  match x:
    case 0n:
      zc
    case 1n+p:
      sc

def pred(n: Nat) -> Nat:
  match n:
    case 0n:
      0n
    case 1n+p:
      p

def s_inj(-a: Nat, -b: Nat, e: {1n+a == 1n+b : Nat}) -> {a == b : Nat}:
  %e : {a == pred(_) : Nat}
  {==}

def s_ne_z(-p: Nat, e: {1n+p == 0n : Nat}) -> Empty:
  %e : NatD(_, Empty, Unit)
  Unit{}

def no_grow(a: Nat, -w: Nat, e: {Nat.add(a, 1n+w) == a : Nat}) -> Empty:
  match a:
    case 0n:
      s_ne_z(w, e)
    case 1n+p:
      no_grow(p, w, s_inj(Nat.add(p, 1n+w), p, e))

def add_cancel(a: Nat, -x: Nat, -y: Nat, e: {Nat.add(a, x) == Nat.add(a, y) : Nat}) -> {x == y : Nat}:
  match a:
    case 0n:
      e
    case 1n+p:
      add_cancel(p, x, y, s_inj(Nat.add(p, x), Nat.add(p, y), e))

def sub_add(a: Nat, +k: Nat) -> {Nat.sub(Nat.add(a, k), a) == k : Nat}:
  match a:
    case 0n:
      match k:
        case 0n:
          {==}
        case 1n+j:
          {==}
    case 1n+p:
      sub_add(p, k)

def go_eq(n: Nat, mm: Nat, +d: Nat, +r: Nat, -bp: Nat, inv: {Nat.add(r, mm) == bp : Nat})
  -> {Nat.add(n, Nat.add(r, Nat.mul(d, 1n+bp))) == Nat.add(Pair.snd(Nat, Nat, Nat.divmod.go(n, mm, d, r)), Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(n, mm, d, r)), 1n+bp)) : Nat}:
  match n mm:
    case 0n _:
      {==}
    case 1n++np 0n:
      +rb = Equal.trans(Nat, r, Nat.add(r, 0n), bp, add_zero(r), inv)
      %go_eq(np, r, 1n+d, 0n, bp, rb) : {1n+Nat.add(np, Nat.add(r, Nat.mul(d, 1n+bp))) == _ : Nat}
      %rb : {1n+Nat.add(np, Nat.add(r, Nat.mul(d, 1n+bp))) == Nat.add(np, 1n+Nat.add(_, Nat.mul(d, 1n+bp))) : Nat}
      add_succ(np, Nat.add(r, Nat.mul(d, 1n+bp)))
    case 1n++np 1n++mp:
      %go_eq(np, mp, d, 1n+r, bp, Equal.trans(Nat, 1n+Nat.add(r, mp), Nat.add(r, 1n+mp), bp, add_succ(r, mp), inv)) : {1n+Nat.add(np, Nat.add(r, Nat.mul(d, 1n+bp))) == _ : Nat}
      add_succ(np, Nat.add(r, Nat.mul(d, 1n+bp)))

def go_lt(n: Nat, mm: Nat, +d: Nat, +r: Nat, -bp: Nat, inv: {Nat.add(r, mm) == bp : Nat})
  -> &s: Nat -> {Nat.add(Pair.snd(Nat, Nat, Nat.divmod.go(n, mm, d, r)), s) == bp : Nat}:
  match n mm:
    case 0n _:
      (mm, inv)
    case 1n+np 0n:
      go_lt(np, r, 1n+d, 0n, bp, Equal.trans(Nat, r, Nat.add(r, 0n), bp, add_zero(r), inv))
    case 1n+np 1n+mp:
      go_lt(np, mp, d, 1n+r, bp, Equal.trans(Nat, 1n+Nat.add(r, mp), Nat.add(r, 1n+mp), bp, add_succ(r, mp), inv))

def div_eq(+x: Nat, +m: Nat) -> {x == Nat.add(Nat.mod(x, 1n+m), Nat.mul(Nat.div(x, 1n+m), 1n+m)) : Nat}:
  %Equal.sym(Nat, x, Nat.add(x, 0n), add_zero(x)) : {_ == Nat.add(Nat.mod(x, 1n+m), Nat.mul(Nat.div(x, 1n+m), 1n+m)) : Nat}
  go_eq(x, m, 0n, 0n, m, {==})

def mod_lt(x: Nat, +m: Nat) -> &s: Nat -> {Nat.add(Nat.mod(x, 1n+m), s) == m : Nat}:
  go_lt(x, m, 0n, 0n, m, {==})

def div_zero(t: Nat) -> {Nat.div(0n, t) == 0n : Nat}:
  match t:
    case 0n:
      {==}
    case 1n+u:
      {==}

def mod_zero(t: Nat) -> {Nat.mod(0n, t) == 0n : Nat}:
  match t:
    case 0n:
      {==}
    case 1n+u:
      {==}

def tok(xs: +List<C.Share>) -> Nat:
  C.total(C.tokens(xs))

def sum_r(xs: +List<C.Share>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case C.Share{q, r, up} <> rest:
      Nat.add(r, sum_r(rest))

def avail(xs: +List<C.Share>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case C.Share{q, r, up} <> rest:
      match r up:
        case 0n _:
          avail(rest)
        case 1n+w True{}:
          avail(rest)
        case 1n+w False{}:
          1n+avail(rest)

def Cand.at(y: C.Share) -> Type:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          Empty
        case 1n+w True{}:
          Empty
        case 1n+w False{}:
          Unit

def Cand(i: Nat, xs: +List<C.Share>) -> Type:
  match i xs:
    case _ Nil{}:
      Empty
    case 0n y <> rest:
      Cand.at(y)
    case 1n+j y <> rest:
      Cand(j, rest)

def bump_tok.head(y: C.Share, +rest: +List<C.Share>, h: Cand.at(y)) -> {1n+tok(y <> rest) == tok(C.bump_at(0n, y <> rest)) : Nat}:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          match h:
        case 1n+w True{}:
          match h:
        case 1n+w False{}:
          {==}

def bump_tok(i: Nat, +xs: +List<C.Share>, h: Cand(i, xs)) -> {1n+tok(xs) == tok(C.bump_at(i, xs)) : Nat}:
  match i xs:
    case _ Nil{}:
      match h:
    case 0n y <> rest:
      bump_tok.head(y, rest, h)
    case 1n+j +y <> rest:
      %bump_tok(j, rest, h) : {1n+tok(y <> rest) == Nat.add(C.token(y), _) : Nat}
      add_succ(C.token(y), tok(rest))

def bump_avail.head(y: C.Share, +rest: +List<C.Share>, h: Cand.at(y)) -> {avail(y <> rest) == 1n+avail(C.bump_at(0n, y <> rest)) : Nat}:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          match h:
        case 1n+w True{}:
          match h:
        case 1n+w False{}:
          {==}

def avail_cons(y: C.Share, -rest: +List<C.Share>, -next: +List<C.Share>, e: {avail(rest) == 1n+avail(next) : Nat})
  -> {avail(y <> rest) == 1n+avail(y <> next) : Nat}:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          e
        case 1n+w True{}:
          e
        case 1n+w False{}:
          %e : {1n+avail(rest) == 1n+_ : Nat}
          {==}

def bump_avail(i: Nat, +xs: +List<C.Share>, h: Cand(i, xs)) -> {avail(xs) == 1n+avail(C.bump_at(i, xs)) : Nat}:
  match i xs:
    case _ Nil{}:
      match h:
    case 0n y <> rest:
      bump_avail.head(y, rest, h)
    case 1n+j y <> rest:
      avail_cons(y, rest, C.bump_at(j, rest), bump_avail(j, rest, h))

def IsSome(f: Maybe<&2, C.Pick>) -> Type:
  match f:
    case None{}:
      Empty
    case Some{v}:
      Unit

def PickOk(xs: +List<C.Share>, f: Maybe<&2, C.Pick>) -> Type:
  match f:
    case None{}:
      Unit
    case Some{C.Pick{i, v}}:
      Cand(i, xs)

def shift_ok(-y: C.Share, -rest: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickOk(rest, f)) -> PickOk(y <> rest, C.pick.shift(f)):
  match f:
    case None{}:
      Unit{}
    case Some{C.Pick{j, v}}:
      h

def choose_ok(-q: Nat, +w: Nat, -rest: +List<C.Share>, j: Nat, v: Nat, b: Bool, h: Cand(j, rest))
  -> PickOk(C.Share{q, 1n+w, False{}} <> rest, C.pick.choose(1n+w, j, v, b)):
  match b:
    case True{}:
      Unit{}
    case False{}:
      h

def vs_ok(-q: Nat, +w: Nat, -rest: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickOk(rest, f))
  -> PickOk(C.Share{q, 1n+w, False{}} <> rest, C.pick.vs(1n+w, f)):
  match f:
    case None{}:
      Unit{}
    case Some{C.Pick{j, +v}}:
      choose_ok(q, w, rest, j, v, Nat.is_ge(1n+w, v), h)

def at_ok(y: C.Share, -rest: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickOk(rest, f)) -> PickOk(y <> rest, C.pick.at(y, f)):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          shift_ok(C.Share{q, 0n, up}, rest, f, h)
        case 1n+w True{}:
          shift_ok(C.Share{q, 1n+w, True{}}, rest, f, h)
        case 1n+w False{}:
          vs_ok(q, w, rest, f, h)

def pick_ok(+xs: +List<C.Share>) -> PickOk(xs, C.pick(xs)):
  match xs:
    case Nil{}:
      Unit{}
    case y <> rest:
      at_ok(y, rest, C.pick(rest), pick_ok(rest))

def shift_some(f: Maybe<&2, C.Pick>, h: IsSome(f)) -> IsSome(C.pick.shift(f)):
  match f:
    case None{}:
      match h:
    case Some{C.Pick{j, v}}:
      Unit{}

def choose_some(+w: Nat, j: Nat, v: Nat, b: Bool) -> IsSome(C.pick.choose(1n+w, j, v, b)):
  match b:
    case True{}:
      Unit{}
    case False{}:
      Unit{}

def vs_some(+w: Nat, f: Maybe<&2, C.Pick>) -> IsSome(C.pick.vs(1n+w, f)):
  match f:
    case None{}:
      Unit{}
    case Some{C.Pick{j, +v}}:
      choose_some(w, j, v, Nat.is_ge(1n+w, v))

def z_ne_s(-p: Nat, e: {0n == 1n+p : Nat}) -> Empty:
  %e : NatD(_, Unit, Empty)
  Unit{}

def pick_some(+xs: +List<C.Share>, -a: Nat, e: {avail(xs) == 1n+a : Nat}) -> IsSome(C.pick(xs)):
  match xs:
    case Nil{}:
      z_ne_s(a, e)
    case C.Share{q, r, up} <> rest:
      match r up:
        case 0n _:
          shift_some(C.pick(rest), pick_some(rest, a, e))
        case 1n+w True{}:
          shift_some(C.pick(rest), pick_some(rest, a, e))
        case 1n+w False{}:
          vs_some(w, C.pick(rest))

def go_tok(+xs: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickOk(xs, f), s: IsSome(f)) -> {1n+tok(xs) == tok(C.step.go(xs, f)) : Nat}:
  match f:
    case None{}:
      match s:
    case Some{C.Pick{i, v}}:
      bump_tok(i, xs, h)

def go_avail(+xs: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickOk(xs, f), s: IsSome(f)) -> {avail(xs) == 1n+avail(C.step.go(xs, f)) : Nat}:
  match f:
    case None{}:
      match s:
    case Some{C.Pick{i, v}}:
      bump_avail(i, xs, h)

def step_tok(+xs: +List<C.Share>, -a: Nat, e: {avail(xs) == 1n+a : Nat}) -> {1n+tok(xs) == tok(C.step(xs)) : Nat}:
  go_tok(xs, C.pick(xs), pick_ok(xs), pick_some(xs, a, e))

def step_avail(+xs: +List<C.Share>, -a: Nat, e: {avail(xs) == 1n+a : Nat}) -> {avail(xs) == 1n+avail(C.step(xs)) : Nat}:
  go_avail(xs, C.pick(xs), pick_ok(xs), pick_some(xs, a, e))

def rounds_tok(k: Nat, +xs: +List<C.Share>, -d: Nat, +e: {avail(xs) == Nat.add(k, d) : Nat}) -> {Nat.add(k, tok(xs)) == tok(C.rounds(k, xs)) : Nat}:
  match k:
    case 0n:
      {==}
    case 1n++j:
      +e2 = s_inj(avail(C.step(xs)), Nat.add(j, d), Equal.trans(Nat, 1n+avail(C.step(xs)), avail(xs), 1n+Nat.add(j, d), Equal.sym(Nat, avail(xs), 1n+avail(C.step(xs)), step_avail(xs, Nat.add(j, d), e)), e))
      %rounds_tok(j, C.step(xs), d, e2) : {1n+Nat.add(j, tok(xs)) == _ : Nat}
      %step_tok(xs, Nat.add(j, d), e) : {1n+Nat.add(j, tok(xs)) == Nat.add(j, _) : Nat}
      add_succ(j, tok(xs))

def fresh_tok(+p: Nat, +t: Nat, bs: +List<Nat>) -> {C.sum_q(C.shares(p, t, bs)) == tok(C.shares(p, t, bs)) : Nat}:
  match bs:
    case Nil{}:
      {==}
    case +b <> rest:
      %fresh_tok(p, t, rest) : {Nat.add(Nat.div(Nat.mul(b, p), t), C.sum_q(C.shares(p, t, rest))) == Nat.add(Nat.div(Nat.mul(b, p), t), _) : Nat}
      {==}

def shares_eq(+p: Nat, +m: Nat, bs: +List<Nat>)
  -> {Nat.add(sum_r(C.shares(p, 1n+m, bs)), Nat.mul(C.sum_q(C.shares(p, 1n+m, bs)), 1n+m)) == Nat.mul(C.total(bs), p) : Nat}:
  match bs:
    case Nil{}:
      {==}
    case +b <> +rest:
      -x = Nat.mul(b, p)
      -mo = Nat.mod(x, 1n+m)
      -dv = Nat.div(x, 1n+m)
      -rr = sum_r(C.shares(p, 1n+m, rest))
      -qq = C.sum_q(C.shares(p, 1n+m, rest))
      -lhs = Nat.add(Nat.add(mo, rr), Nat.mul(Nat.add(dv, qq), 1n+m))
      %mul_dist(b, C.total(rest), p) : {lhs == _ : Nat}
      %shares_eq(p, m, rest) : {lhs == Nat.add(Nat.mul(b, p), _) : Nat}
      %Equal.sym(Nat, Nat.mul(b, p), Nat.add(mo, Nat.mul(dv, 1n+m)), div_eq(Nat.mul(b, p), m)) : {lhs == Nat.add(_, Nat.add(rr, Nat.mul(qq, 1n+m))) : Nat}
      %mul_dist(Nat.div(Nat.mul(b, p), 1n+m), C.sum_q(C.shares(p, 1n+m, rest)), 1n+m) : {Nat.add(Nat.add(mo, rr), _) == Nat.add(Nat.add(mo, Nat.mul(dv, 1n+m)), Nat.add(rr, Nat.mul(qq, 1n+m))) : Nat}
      add_regroup(Nat.mod(Nat.mul(b, p), 1n+m), sum_r(C.shares(p, 1n+m, rest)), Nat.mul(Nat.div(Nat.mul(b, p), 1n+m), 1n+m), Nat.mul(C.sum_q(C.shares(p, 1n+m, rest)), 1n+m))

def Fresh.at(+m: Nat, r: Nat, up: Bool) -> Type:
  match up:
    case True{}:
      Empty
    case False{}:
      &s: Nat -> {Nat.add(r, s) == m : Nat}

def Fresh(+m: Nat, xs: +List<C.Share>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case C.Share{q, r, up} <> rest:
      Fresh.at(m, r, up) & Fresh(m, rest)

def shares_fresh(+p: Nat, +m: Nat, bs: +List<Nat>) -> Fresh(m, C.shares(p, 1n+m, bs)):
  match bs:
    case Nil{}:
      Unit{}
    case b <> rest:
      (mod_lt(Nat.mul(b, p), m), shares_fresh(p, m, rest))

def cap_pos_eq(-m: Nat, +w: Nat, +rr: Nat, -aa: Nat, +s0: Nat, +s1: Nat, e0: {Nat.add(1n+w, s0) == m : Nat}, e1: {Nat.add(rr, s1) == Nat.mul(aa, m) : Nat})
  -> {Nat.add(Nat.add(1n+w, rr), Nat.add(s0, s1)) == Nat.add(m, Nat.mul(aa, m)) : Nat}:
  %e0 : {Nat.add(Nat.add(1n+w, rr), Nat.add(s0, s1)) == Nat.add(_, Nat.mul(aa, m)) : Nat}
  %e1 : {Nat.add(Nat.add(1n+w, rr), Nat.add(s0, s1)) == Nat.add(Nat.add(1n+w, s0), _) : Nat}
  add_regroup(1n+w, rr, s0, s1)

def cap_cons(+m: Nat, -q: Nat, r: Nat, up: Bool, +rest: +List<C.Share>, hd: Fresh.at(m, r, up), ih: &s: Nat -> {Nat.add(sum_r(rest), s) == Nat.mul(avail(rest), m) : Nat})
  -> &s: Nat -> {Nat.add(sum_r(C.Share{q, r, up} <> rest), s) == Nat.mul(avail(C.Share{q, r, up} <> rest), m) : Nat}:
  match r up:
    case 0n True{}:
      match hd:
    case 1n+w True{}:
      match hd:
    case 0n False{}:
      ih
    case 1n+w False{}:
      (+s0, e0) = hd
      (+s1, e1) = ih
      (Nat.add(s0, s1), cap_pos_eq(m, w, sum_r(rest), avail(rest), s0, s1, e0, e1))

def capacity(+m: Nat, +xs: +List<C.Share>, h: Fresh(m, xs)) -> &s: Nat -> {Nat.add(sum_r(xs), s) == Nat.mul(avail(xs), m) : Nat}:
  match xs:
    case Nil{}:
      (0n, {==})
    case C.Share{q, r, up} <> rest:
      (hd, tl) = h
      cap_cons(m, q, r, up, rest, hd, capacity(m, rest, tl))

def Tri(a: Nat, b: Nat) -> Type:
  (&k: Nat -> {b == Nat.add(a, k) : Nat}) | (&z: Nat -> {a == Nat.add(b, 1n+z) : Nat})

def tri.lift(-a: Nat, -b: Nat, t: Tri(a, b)) -> Tri(1n+a, 1n+b):
  match t:
    case Inl{w}:
      (+k, e) = w
      Inl{(k, Equal.cong(Nat, Nat, x => 1n+x, b, Nat.add(a, k), e))}
    case Inr{w}:
      (+z, e) = w
      Inr{(z, Equal.cong(Nat, Nat, x => 1n+x, a, Nat.add(b, 1n+z), e))}

def tri(a: Nat, +b: Nat) -> Tri(a, b):
  match a:
    case 0n:
      Inl{(b, {==})}
    case 1n+p:
      match b:
        case 0n:
          Inr{(p, {==})}
        case 1n+q:
          tri.lift(p, q, tri(p, q))

def add4(a: Nat, +b: Nat, +c: Nat, +d: Nat) -> {Nat.add(Nat.add(Nat.add(a, b), 1n+c), d) == Nat.add(b, 1n+Nat.add(a, Nat.add(c, d))) : Nat}:
  match a:
    case 0n:
      Equal.sym(Nat, Nat.add(b, 1n+Nat.add(c, d)), Nat.add(Nat.add(b, 1n+c), d), add_assoc(b, 1n+c, d))
    case 1n+p:
      %Equal.sym(Nat, Nat.add(Nat.add(Nat.add(p, b), 1n+c), d), Nat.add(b, 1n+Nat.add(p, Nat.add(c, d))), add4(p, b, c, d)) : {1n+_ == Nat.add(b, 2n+Nat.add(p, Nat.add(c, d))) : Nat}
      add_succ(b, 1n+Nat.add(p, Nat.add(c, d)))

def big_q.eq(+r: Nat, -q: Nat, +p: Nat, +m: Nat, +z: Nat, eq: {q == Nat.add(p, 1n+z) : Nat}, eA: {Nat.add(r, Nat.mul(q, 1n+m)) == Nat.mul(p, 1n+m) : Nat})
  -> {Nat.add(Nat.mul(p, 1n+m), 1n+Nat.add(r, Nat.add(m, Nat.mul(z, 1n+m)))) == Nat.mul(p, 1n+m) : Nat}:
  -pt = Nat.mul(p, 1n+m)
  -v = Nat.add(m, Nat.mul(z, 1n+m))
  %Equal.sym(Nat, 1n+Nat.add(r, v), Nat.add(r, 1n+v), add_succ(r, Nat.add(m, Nat.mul(z, 1n+m)))) : {Nat.add(pt, _) == pt : Nat}
  %add_swap(r, Nat.mul(p, 1n+m), 1n+Nat.add(m, Nat.mul(z, 1n+m))) : {_ == pt : Nat}
  %Equal.sym(Nat, Nat.add(pt, Nat.mul(1n+z, 1n+m)), Nat.mul(Nat.add(p, 1n+z), 1n+m), mul_dist(p, 1n+z, 1n+m)) : {Nat.add(r, _) == pt : Nat}
  %eq : {Nat.add(r, Nat.mul(_, 1n+m)) == pt : Nat}
  eA

def big_q(+r: Nat, -q: Nat, +p: Nat, +m: Nat, +z: Nat, eq: {q == Nat.add(p, 1n+z) : Nat}, eA: {Nat.add(r, Nat.mul(q, 1n+m)) == Nat.mul(p, 1n+m) : Nat}) -> Empty:
  no_grow(Nat.mul(p, 1n+m), Nat.add(r, Nat.add(m, Nat.mul(z, 1n+m))), big_q.eq(r, q, p, m, z, eq, eA))

def big_k.eq(+aa: Nat, +m: Nat, +z: Nat, +s: Nat, -k: Nat, ez: {k == Nat.add(aa, 1n+z) : Nat}, eB: {Nat.add(Nat.mul(k, 1n+m), s) == Nat.mul(aa, m) : Nat})
  -> {Nat.add(Nat.mul(aa, m), 1n+Nat.add(aa, Nat.add(Nat.add(m, Nat.mul(z, 1n+m)), s))) == Nat.mul(aa, m) : Nat}:
  -am = Nat.mul(aa, m)
  -v = Nat.add(m, Nat.mul(z, 1n+m))
  %add4(aa, Nat.mul(aa, m), Nat.add(m, Nat.mul(z, 1n+m)), s) : {_ == am : Nat}
  %Equal.sym(Nat, Nat.add(aa, am), Nat.mul(aa, 1n+m), mul_succ(aa, m)) : {Nat.add(Nat.add(_, 1n+v), s) == am : Nat}
  %Equal.sym(Nat, Nat.add(Nat.mul(aa, 1n+m), Nat.mul(1n+z, 1n+m)), Nat.mul(Nat.add(aa, 1n+z), 1n+m), mul_dist(aa, 1n+z, 1n+m)) : {Nat.add(_, s) == am : Nat}
  %ez : {Nat.add(Nat.mul(_, 1n+m), s) == am : Nat}
  eB

def big_k(+aa: Nat, +m: Nat, +z: Nat, +s: Nat, -k: Nat, ez: {k == Nat.add(aa, 1n+z) : Nat}, eB: {Nat.add(Nat.mul(k, 1n+m), s) == Nat.mul(aa, m) : Nat}) -> Empty:
  no_grow(Nat.mul(aa, m), Nat.add(aa, Nat.add(Nat.add(m, Nat.mul(z, 1n+m)), s)), big_k.eq(aa, m, z, s, k, ez, eB))

def Split(q: Nat, p: Nat, aa: Nat) -> Type:
  &k: Nat -> &d: Nat -> {p == Nat.add(q, k) : Nat} & {aa == Nat.add(k, d) : Nat}

def cancel_eq(+r: Nat, +q: Nat, -p: Nat, +m: Nat, +k: Nat, ep: {p == Nat.add(q, k) : Nat}, eA: {Nat.add(r, Nat.mul(q, 1n+m)) == Nat.mul(p, 1n+m) : Nat})
  -> {Nat.add(Nat.mul(q, 1n+m), r) == Nat.add(Nat.mul(q, 1n+m), Nat.mul(k, 1n+m)) : Nat}:
  -qt = Nat.mul(q, 1n+m)
  -kt = Nat.mul(k, 1n+m)
  %add_comm(r, Nat.mul(q, 1n+m)) : {_ == Nat.add(qt, kt) : Nat}
  %Equal.sym(Nat, Nat.add(qt, kt), Nat.mul(Nat.add(q, k), 1n+m), mul_dist(q, k, 1n+m)) : {Nat.add(r, qt) == _ : Nat}
  %ep : {Nat.add(r, qt) == Nat.mul(_, 1n+m) : Nat}
  eA

def eB_k(-r: Nat, -k: Nat, -m: Nat, -s: Nat, -aa: Nat, eR: {r == Nat.mul(k, 1n+m) : Nat}, eB: {Nat.add(r, s) == Nat.mul(aa, m) : Nat})
  -> {Nat.add(Nat.mul(k, 1n+m), s) == Nat.mul(aa, m) : Nat}:
  %eR : {Nat.add(_, s) == Nat.mul(aa, m) : Nat}
  eB

def arith.k(+aa: Nat, +m: Nat, +s: Nat, +k: Nat, -r: Nat, -q: Nat, -p: Nat, ep: {p == Nat.add(q, k) : Nat}, eR: {r == Nat.mul(k, 1n+m) : Nat}, eB: {Nat.add(r, s) == Nat.mul(aa, m) : Nat}, t: Tri(k, aa))
  -> &d: Nat -> {p == Nat.add(q, k) : Nat} & {aa == Nat.add(k, d) : Nat}:
  match t:
    case Inl{w}:
      (+d, ed) = w
      (d, ep, ed)
    case Inr{w}:
      (+z, ez) = w
      Empty.absurd(&d: Nat -> {p == Nat.add(q, k) : Nat} & {aa == Nat.add(k, d) : Nat}, big_k(aa, m, z, s, k, ez, eB_k(r, k, m, s, aa, eR, eB)))

def arith.c(+r: Nat, +q: Nat, +p: Nat, +m: Nat, +aa: Nat, +s: Nat, +k: Nat, +ep: {p == Nat.add(q, k) : Nat}, eA: {Nat.add(r, Nat.mul(q, 1n+m)) == Nat.mul(p, 1n+m) : Nat}, eB: {Nat.add(r, s) == Nat.mul(aa, m) : Nat})
  -> &d: Nat -> {p == Nat.add(q, k) : Nat} & {aa == Nat.add(k, d) : Nat}:
  eR = add_cancel(Nat.mul(q, 1n+m), r, Nat.mul(k, 1n+m), cancel_eq(r, q, p, m, k, ep, eA))
  arith.k(aa, m, s, k, r, q, p, ep, eR, eB, tri(k, aa))

def arith.q(+r: Nat, +q: Nat, +p: Nat, +m: Nat, +aa: Nat, +s: Nat, eA: {Nat.add(r, Nat.mul(q, 1n+m)) == Nat.mul(p, 1n+m) : Nat}, eB: {Nat.add(r, s) == Nat.mul(aa, m) : Nat}, t: Tri(q, p))
  -> Split(q, p, aa):
  match t:
    case Inl{w}:
      (+k, ep) = w
      (k, arith.c(r, q, p, m, aa, s, k, ep, eA, eB))
    case Inr{w}:
      (+z, eq) = w
      Empty.absurd(Split(q, p, aa), big_q(r, q, p, m, z, eq, eA))

def arith(+r: Nat, +q: Nat, +p: Nat, +m: Nat, +aa: Nat, +s: Nat, eA: {Nat.add(r, Nat.mul(q, 1n+m)) == Nat.mul(p, 1n+m) : Nat}, eB: {Nat.add(r, s) == Nat.mul(aa, m) : Nat})
  -> Split(q, p, aa):
  arith.q(r, q, p, m, aa, s, eA, eB, tri(q, p))

def sub_eq(-p: Nat, +q: Nat, +k: Nat, ep: {p == Nat.add(q, k) : Nat}) -> {Nat.sub(p, q) == k : Nat}:
  %Equal.sym(Nat, p, Nat.add(q, k), ep) : {Nat.sub(_, q) == k : Nat}
  sub_add(q, k)

def sum_fin(+p: Nat, +m: Nat, +bs: +List<Nat>, +k: Nat, -d: Nat, +ep: {p == Nat.add(C.sum_q(C.shares(p, 1n+m, bs)), k) : Nat}, ed: {avail(C.shares(p, 1n+m, bs)) == Nat.add(k, d) : Nat})
  -> {tok(C.rounds(Nat.sub(p, C.sum_q(C.shares(p, 1n+m, bs))), C.shares(p, 1n+m, bs))) == p : Nat}:
  -xs = C.shares(p, 1n+m, bs)
  -qq = C.sum_q(xs)
  %Equal.sym(Nat, Nat.sub(p, qq), k, sub_eq(p, C.sum_q(C.shares(p, 1n+m, bs)), k, ep)) : {tok(C.rounds(_, xs)) == p : Nat}
  %rounds_tok(k, C.shares(p, 1n+m, bs), d, ed) : {_ == p : Nat}
  %fresh_tok(p, 1n+m, bs) : {Nat.add(k, _) == p : Nat}
  %Equal.sym(Nat, p, Nat.add(qq, k), ep) : {Nat.add(k, qq) == _ : Nat}
  add_comm(k, C.sum_q(C.shares(p, 1n+m, bs)))

def sum_arith(+p: Nat, +m: Nat, +bs: +List<Nat>, w: Split(C.sum_q(C.shares(p, 1n+m, bs)), p, avail(C.shares(p, 1n+m, bs))))
  -> {tok(C.rounds(Nat.sub(p, C.sum_q(C.shares(p, 1n+m, bs))), C.shares(p, 1n+m, bs))) == p : Nat}:
  (+k, d, ep, ed) = w
  sum_fin(p, m, bs, k, d, ep, ed)

def eA_of(+p: Nat, +m: Nat, +bs: +List<Nat>, et: {C.total(bs) == 1n+m : Nat})
  -> {Nat.add(sum_r(C.shares(p, 1n+m, bs)), Nat.mul(C.sum_q(C.shares(p, 1n+m, bs)), 1n+m)) == Nat.mul(p, 1n+m) : Nat}:
  -lhs = Nat.add(sum_r(C.shares(p, 1n+m, bs)), Nat.mul(C.sum_q(C.shares(p, 1n+m, bs)), 1n+m))
  %mul_comm(1n+m, p) : {lhs == _ : Nat}
  %et : {lhs == Nat.mul(_, p) : Nat}
  shares_eq(p, m, bs)

def sum_cap(+p: Nat, +m: Nat, +bs: +List<Nat>, et: {C.total(bs) == 1n+m : Nat}, c: &s: Nat -> {Nat.add(sum_r(C.shares(p, 1n+m, bs)), s) == Nat.mul(avail(C.shares(p, 1n+m, bs)), m) : Nat})
  -> {tok(C.rounds(Nat.sub(p, C.sum_q(C.shares(p, 1n+m, bs))), C.shares(p, 1n+m, bs))) == p : Nat}:
  (+s, eB) = c
  sum_arith(p, m, bs, arith(sum_r(C.shares(p, 1n+m, bs)), C.sum_q(C.shares(p, 1n+m, bs)), p, m, avail(C.shares(p, 1n+m, bs)), s, eA_of(p, m, bs, et), eB))

def Laws.split_sums_to_provider(p, bs, m, e):
  +e1 = e
  %Equal.sym(Nat, C.total(bs), 1n+m, e1) : {tok(C.rounds(Nat.sub(p, C.sum_q(C.shares(p, _, bs))), C.shares(p, _, bs))) == p : Nat}
  sum_cap(p, m, bs, e1, capacity(m, C.shares(p, 1n+m, bs), shares_fresh(p, m, bs)))

def Up(up: Bool, r: Nat) -> Type:
  match up:
    case False{}:
      Unit
    case True{}:
      NatD(r, Empty, Unit)

def Inv.at(+p: Nat, +t: Nat, +b: Nat, y: C.Share) -> Type:
  match y:
    case C.Share{q, +r, up}:
      {q == Nat.div(Nat.mul(b, p), t) : Nat} & {r == Nat.mod(Nat.mul(b, p), t) : Nat} & Up(up, r)

def Inv(+p: Nat, +t: Nat, bs: +List<Nat>, xs: +List<C.Share>) -> Type:
  match bs xs:
    case Nil{} Nil{}:
      Unit
    case Nil{} Con{y, yt}:
      Empty
    case Con{b, bt} Nil{}:
      Empty
    case Con{b, bt} Con{y, yt}:
      Inv.at(p, t, b, y) & Inv(p, t, bt, yt)

def shares_inv(+p: Nat, +t: Nat, bs: +List<Nat>) -> Inv(p, t, bs, C.shares(p, t, bs)):
  match bs:
    case Nil{}:
      Unit{}
    case b <> rest:
      (({==}, {==}, Unit{}), shares_inv(p, t, rest))

def raise_inv(-p: Nat, -t: Nat, -b: Nat, y: C.Share, hd: Inv.at(p, t, b, y), c: Cand.at(y)) -> Inv.at(p, t, b, C.raise(y)):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          match c:
        case 1n+w True{}:
          match c:
        case 1n+w False{}:
          (eq, er, u) = hd
          (eq, er, Unit{})

def bump_inv(-p: Nat, -t: Nat, i: Nat, bs: +List<Nat>, xs: +List<C.Share>, h: Inv(p, t, bs, xs), c: Cand(i, xs)) -> Inv(p, t, bs, C.bump_at(i, xs)):
  match i bs xs:
    case 0n Nil{} Nil{}:
      match c:
    case 0n Con{b, bt} Nil{}:
      match c:
    case 1n+j Nil{} Nil{}:
      match c:
    case 1n+j Con{b, bt} Nil{}:
      match c:
    case 0n Nil{} Con{y, rest}:
      match h:
    case 1n+j Nil{} Con{y, rest}:
      match h:
    case 0n Con{b, bt} Con{y, rest}:
      (hd, tl) = h
      (raise_inv(p, t, b, y, hd, c), tl)
    case 1n+j Con{b, bt} Con{y, rest}:
      (hd, tl) = h
      (hd, bump_inv(p, t, j, bt, rest, tl, c))

def go_inv(-p: Nat, -t: Nat, bs: +List<Nat>, +xs: +List<C.Share>, f: Maybe<&2, C.Pick>, h: Inv(p, t, bs, xs), ok: PickOk(xs, f)) -> Inv(p, t, bs, C.step.go(xs, f)):
  match f:
    case None{}:
      h
    case Some{C.Pick{i, v}}:
      bump_inv(p, t, i, bs, xs, h, ok)

def step_inv(-p: Nat, -t: Nat, bs: +List<Nat>, +xs: +List<C.Share>, h: Inv(p, t, bs, xs)) -> Inv(p, t, bs, C.step(xs)):
  go_inv(p, t, bs, xs, C.pick(xs), h, pick_ok(xs))

def rounds_inv(-p: Nat, -t: Nat, k: Nat, +bs: +List<Nat>, +xs: +List<C.Share>, h: Inv(p, t, bs, xs)) -> Inv(p, t, bs, C.rounds(k, xs)):
  match k:
    case 0n:
      h
    case 1n+j:
      rounds_inv(p, t, j, bs, C.step(xs), step_inv(p, t, bs, xs, h))

def rounded_up(r: Nat, -m: Nat, -o: Nat, -d: Nat, er: {r == m : Nat}, u: NatD(r, Empty, Unit), eo: {o == 1n+d : Nat}) -> Laws.RoundedUp(m, o, d):
  match r:
    case 0n:
      match u:
    case 1n+w:
      %er : Laws.RoundedUp(_, o, d)
      eo

def quota_at(-p: Nat, -t: Nat, -b: Nat, y: C.Share, hd: Inv.at(p, t, b, y))
  -> {C.token(y) == Nat.div(Nat.mul(b, p), t) : Nat} | Laws.RoundedUp(Nat.mod(Nat.mul(b, p), t), C.token(y), Nat.div(Nat.mul(b, p), t)):
  match y:
    case C.Share{+q, r, up}:
      match up:
        case False{}:
          (eq, rest) = hd
          Inl{eq}
        case True{}:
          (eq, er, u) = hd
          Inr{rounded_up(r, Nat.mod(Nat.mul(b, p), t), 1n+q, Nat.div(Nat.mul(b, p), t), er, u, Equal.cong(Nat, Nat, x => 1n+x, q, Nat.div(Nat.mul(b, p), t), eq))}

def quota_of(-p: Nat, -t: Nat, bs: +List<Nat>, xs: +List<C.Share>, h: Inv(p, t, bs, xs)) -> Laws.Quota(p, t, bs, C.tokens(xs)):
  match bs xs:
    case Nil{} Nil{}:
      Unit{}
    case Nil{} Con{y, yt}:
      match h:
    case Con{b, bt} Nil{}:
      match h:
    case Con{b, bt} Con{y, yt}:
      (hd, tl) = h
      (quota_at(p, t, b, y, hd), quota_of(p, t, bt, yt, tl))

def no_up(r: Nat, er: {r == 0n : Nat}, u: NatD(r, Empty, Unit)) -> Empty:
  match r:
    case 0n:
      u
    case 1n+w:
      s_ne_z(w, er)

def zeros_at(-p: Nat, +t: Nat, b: Nat, y: C.Share, hd: Inv.at(p, t, b, y)) -> Laws.Zeros.at(b, C.token(y)):
  match b:
    case 0n:
      match y:
        case C.Share{q, +r, up}:
          match up:
            case False{}:
              (eq, rest) = hd
              Equal.trans(Nat, q, Nat.div(0n, t), 0n, eq, div_zero(t))
            case True{}:
              (eq, er, u) = hd
              Empty.absurd({1n+q == 0n : Nat}, no_up(r, Equal.trans(Nat, r, Nat.mod(0n, t), 0n, er, mod_zero(t)), u))
    case 1n+c:
      Unit{}

def zeros_of(-p: Nat, +t: Nat, bs: +List<Nat>, xs: +List<C.Share>, h: Inv(p, t, bs, xs)) -> Laws.Zeros(bs, C.tokens(xs)):
  match bs xs:
    case Nil{} Nil{}:
      Unit{}
    case Nil{} Con{y, yt}:
      match h:
    case Con{b, bt} Nil{}:
      match h:
    case Con{b, bt} Con{y, yt}:
      (hd, tl) = h
      (zeros_at(p, t, b, y, hd), zeros_of(p, t, bt, yt, tl))

def Laws.split_rounds_each_share(p, bs):
  quota_of(p, C.total(bs), bs, C.rounds(Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), C.shares(p, C.total(bs), bs)), rounds_inv(p, C.total(bs), Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), bs, C.shares(p, C.total(bs), bs), shares_inv(p, C.total(bs), bs)))

def Laws.split_gives_empty_none(p, bs):
  zeros_of(p, C.total(bs), bs, C.rounds(Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), C.shares(p, C.total(bs), bs)), rounds_inv(p, C.total(bs), Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), bs, C.shares(p, C.total(bs), bs), shares_inv(p, C.total(bs), bs)))

def zip2(-A: Type, -B: Type, a: A & A, b: B & B) -> (A & B) & (A & B):
  (a1, a2) = a
  (b1, b2) = b
  ((a1, b1), (a2, b2))

def dup_n(-a: Nat, -b: Nat, +e: {a == b : Nat}) -> {a == b : Nat} & {a == b : Nat}:
  (e, e)

def dup_b(-a: Bool, -b: Bool, +e: {a == b : Bool}) -> {a == b : Bool} & {a == b : Bool}:
  (e, e)

def ft(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

def ge_zero(a: Nat) -> {Nat.is_ge(a, 0n) == True{} : Bool}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      {==}

def cmp_ge_lt(c: Cmp, e: {Cmp.is_ge(c) == False{} : Bool}) -> {Cmp.is_lt(c) == True{} : Bool}:
  match c:
    case LT{}:
      {==}
    case EQ{}:
      Empty.absurd({False{} == True{} : Bool}, ft(Equal.sym(Bool, True{}, False{}, e)))
    case GT{}:
      Empty.absurd({False{} == True{} : Bool}, ft(Equal.sym(Bool, True{}, False{}, e)))

def ge_false_lt(a: Nat, b: Nat, e: {Nat.is_ge(a, b) == False{} : Bool}) -> {Nat.is_lt(a, b) == True{} : Bool}:
  cmp_ge_lt(Nat.cmp(a, b), e)

def ge_trans(a: Nat, b: Nat, c: Nat, e1: {Nat.is_ge(a, b) == True{} : Bool}, e2: {Nat.is_ge(b, c) == True{} : Bool}) -> {Nat.is_ge(a, c) == True{} : Bool}:
  match a b c:
    case 0n 0n 0n:
      {==}
    case 0n 0n 1n+cc:
      e2
    case 0n 1n+bb 0n:
      {==}
    case 0n 1n+bb 1n+cc:
      e1
    case 1n+aa 0n 0n:
      {==}
    case 1n+aa 0n 1n+cc:
      Empty.absurd({Nat.is_ge(aa, cc) == True{} : Bool}, ft(e2))
    case 1n+aa 1n+bb 0n:
      {==}
    case 1n+aa 1n+bb 1n+cc:
      ge_trans(aa, bb, cc, e1, e2)

def lt_ge(a: Nat, b: Nat, e: {Nat.is_lt(a, b) == True{} : Bool}) -> {Nat.is_ge(b, a) == True{} : Bool}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bb:
      {==}
    case 1n+aa 0n:
      e
    case 1n+aa 1n+bb:
      lt_ge(aa, bb, e)

def gt_self(n: Nat) -> {Nat.is_gt(n, n) == False{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      gt_self(p)

def gt_succ(n: Nat) -> {Nat.is_gt(1n+n, n) == True{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      gt_succ(p)

def s.up(y: C.Share) -> Bool:
  match y:
    case C.Share{q, r, up}:
      up

def s.r(y: C.Share) -> Nat:
  match y:
    case C.Share{q, r, up}:
      r

def SAhead(+y: C.Share, xs: +List<C.Share>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case +z <> rest:
      Laws.Fair.pair(s.up(y), s.up(z), s.r(y), s.r(z)) & SAhead(y, rest)

def SFair(xs: +List<C.Share>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case +y <> +rest:
      SAhead(y, rest) & SFair(rest)

def Under(v: Nat, y: C.Share) -> Type:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          Unit
        case 1n+w True{}:
          Unit
        case 1n+w False{}:
          {Nat.is_lt(1n+w, v) == True{} : Bool}

def Over(v: Nat, y: C.Share) -> Type:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          Unit
        case 1n+w True{}:
          Unit
        case 1n+w False{}:
          {Nat.is_ge(v, 1n+w) == True{} : Bool}

def Top(v: Nat, y: C.Share) -> Type:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          Empty
        case 1n+w True{}:
          Empty
        case 1n+w False{}:
          {1n+w == v : Nat}

def NoCand.at(y: C.Share) -> Type:
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          Unit
        case 1n+w True{}:
          Unit
        case 1n+w False{}:
          Empty

def Below(+v: Nat, xs: +List<C.Share>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case y <> rest:
      Over(v, y) & Below(v, rest)

def NoCand(xs: +List<C.Share>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case y <> rest:
      NoCand.at(y) & NoCand(rest)

def Max(i: Nat, +v: Nat, xs: +List<C.Share>) -> Type:
  match i xs:
    case _ Nil{}:
      Empty
    case 0n y <> rest:
      Top(v, y) & Below(v, rest)
    case 1n+j y <> rest:
      Under(v, y) & Max(j, v, rest)

def PickMax(xs: +List<C.Share>, f: Maybe<&2, C.Pick>) -> Type:
  match f:
    case None{}:
      NoCand(xs)
    case Some{C.Pick{i, v}}:
      Max(i, v, xs)

def below_none(+v: Nat, xs: +List<C.Share>, h: NoCand(xs)) -> Below(v, xs):
  match xs:
    case Nil{}:
      Unit{}
    case C.Share{q, r, up} <> rest:
      match r up:
        case 0n _:
          (n, hr) = h
          (Unit{}, below_none(v, rest, hr))
        case 1n+w True{}:
          (n, hr) = h
          (Unit{}, below_none(v, rest, hr))
        case 1n+w False{}:
          (n, hr) = h
          match n:

def below_mono(+v: Nat, +u: Nat, xs: +List<C.Share>, h: Below(v, xs), +e: {Nat.is_ge(u, v) == True{} : Bool}) -> Below(u, xs):
  match xs:
    case Nil{}:
      Unit{}
    case C.Share{q, r, up} <> rest:
      match r up:
        case 0n _:
          (o, hr) = h
          (Unit{}, below_mono(v, u, rest, hr, e))
        case 1n+w True{}:
          (o, hr) = h
          (Unit{}, below_mono(v, u, rest, hr, e))
        case 1n+w False{}:
          (o, hr) = h
          (ge_trans(u, v, 1n+w, e, o), below_mono(v, u, rest, hr, e))

def ge_eq(-u: Nat, -a: Nat, -v: Nat, t: {a == v : Nat}, e: {Nat.is_ge(u, v) == True{} : Bool}) -> {Nat.is_ge(u, a) == True{} : Bool}:
  %Equal.sym(Nat, a, v, t) : {Nat.is_ge(u, _) == True{} : Bool}
  e

def below_of_max(j: Nat, +v: Nat, xs: +List<C.Share>, h: Max(j, v, xs), +u: Nat, +e: {Nat.is_ge(u, v) == True{} : Bool}) -> Below(u, xs):
  match j xs:
    case _ Nil{}:
      match h:
    case 0n y <> rest:
      match y:
        case C.Share{q, r, up}:
          match r up:
            case 0n _:
              (t, b) = h
              match t:
            case 1n+w True{}:
              (t, b) = h
              match t:
            case 1n+w False{}:
              (t, b) = h
              (ge_eq(u, 1n+w, v, t, e), below_mono(v, u, rest, b, e))
    case 1n+k y <> rest:
      match y:
        case C.Share{q, r, up}:
          match r up:
            case 0n _:
              (n, m) = h
              (Unit{}, below_of_max(k, v, rest, m, u, e))
            case 1n+w True{}:
              (n, m) = h
              (Unit{}, below_of_max(k, v, rest, m, u, e))
            case 1n++w False{}:
              (n, m) = h
              (ge_trans(u, v, 1n+w, e, lt_ge(1n+w, v, n)), below_of_max(k, v, rest, m, u, e))

def choose_max(-q: Nat, +w: Nat, +rest: +List<C.Share>, j: Nat, +v: Nat, b: Bool, e: {Nat.is_ge(1n+w, v) == b : Bool}, h: Max(j, v, rest))
  -> PickMax(C.Share{q, 1n+w, False{}} <> rest, C.pick.choose(1n+w, j, v, b)):
  match b:
    case True{}:
      ({==}, below_of_max(j, v, rest, h, 1n+w, e))
    case False{}:
      (ge_false_lt(1n+w, v, e), h)

def vs_max(-q: Nat, +w: Nat, +rest: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickMax(rest, f))
  -> PickMax(C.Share{q, 1n+w, False{}} <> rest, C.pick.vs(1n+w, f)):
  match f:
    case None{}:
      ({==}, below_none(1n+w, rest, h))
    case Some{C.Pick{j, +v}}:
      choose_max(q, w, rest, j, v, Nat.is_ge(1n+w, v), {==}, h)

def at_max(y: C.Share, +rest: +List<C.Share>, f: Maybe<&2, C.Pick>, h: PickMax(rest, f)) -> PickMax(y <> rest, C.pick.at(y, f)):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          match f:
            case None{}:
              (Unit{}, h)
            case Some{C.Pick{j, v}}:
              (Unit{}, h)
        case 1n+w True{}:
          match f:
            case None{}:
              (Unit{}, h)
            case Some{C.Pick{j, v}}:
              (Unit{}, h)
        case 1n+w False{}:
          vs_max(q, w, rest, f, h)

def pick_max(+xs: +List<C.Share>) -> PickMax(xs, C.pick(xs)):
  match xs:
    case Nil{}:
      Unit{}
    case y <> +rest:
      at_max(y, rest, C.pick(rest), pick_max(rest))

def dup_top(-v: Nat, y: C.Share, t: Top(v, y)) -> Top(v, y) & Top(v, y):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          match t:
        case 1n+w True{}:
          match t:
        case 1n+w False{}:
          dup_n(1n+w, v, t)

def dup_under(-v: Nat, y: C.Share, u: Under(v, y)) -> Under(v, y) & Under(v, y):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          (Unit{}, Unit{})
        case 1n+w True{}:
          (Unit{}, Unit{})
        case 1n+w False{}:
          dup_b(Nat.is_lt(1n+w, v), True{}, u)

def dup_over(-v: Nat, y: C.Share, o: Over(v, y)) -> Over(v, y) & Over(v, y):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n _:
          (Unit{}, Unit{})
        case 1n+w True{}:
          (Unit{}, Unit{})
        case 1n+w False{}:
          dup_b(Nat.is_ge(v, 1n+w), True{}, o)

def dup_below(-v: Nat, xs: +List<C.Share>, b: Below(v, xs)) -> Below(v, xs) & Below(v, xs):
  match xs:
    case Nil{}:
      (Unit{}, Unit{})
    case y <> rest:
      (o, br) = b
      zip2(Over(v, y), Below(v, rest), dup_over(v, y, o), dup_below(v, rest, br))

def dup_max(j: Nat, -v: Nat, xs: +List<C.Share>, m: Max(j, v, xs)) -> Max(j, v, xs) & Max(j, v, xs):
  match j xs:
    case _ Nil{}:
      match m:
    case 0n y <> rest:
      (t, b) = m
      zip2(Top(v, y), Below(v, rest), dup_top(v, y, t), dup_below(v, rest, b))
    case 1n+k y <> rest:
      (u, mk) = m
      zip2(Under(v, y), Max(k, v, rest), dup_under(v, y, u), dup_max(k, v, rest, mk))

def raise_ahead(-q: Nat, +r: Nat, xs: +List<C.Share>, h: Below(r, xs)) -> SAhead(C.Share{q, r, True{}}, xs):
  match xs:
    case Nil{}:
      Unit{}
    case C.Share{q2, r2, up2} <> rest:
      match r2 up2:
        case 0n True{}:
          (o, hr) = h
          (Unit{}, raise_ahead(q, r, rest, hr))
        case 0n False{}:
          (o, hr) = h
          (ge_zero(r), raise_ahead(q, r, rest, hr))
        case 1n+w True{}:
          (o, hr) = h
          (Unit{}, raise_ahead(q, r, rest, hr))
        case 1n+w False{}:
          (o, hr) = h
          (o, raise_ahead(q, r, rest, hr))

def below_eq(-a: Nat, -v: Nat, -xs: +List<C.Share>, t: {a == v : Nat}, b: Below(v, xs)) -> Below(a, xs):
  %Equal.sym(Nat, a, v, t) : Below(_, xs)
  b

def new_pair(+y: C.Share, -w: Nat, -v: Nat, u: Under(v, y), t: {1n+w == v : Nat}) -> Laws.Fair.pair(s.up(y), True{}, s.r(y), 1n+w):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n True{}:
          Unit{}
        case 0n False{}:
          {==}
        case 1n+rr True{}:
          Unit{}
        case 1n+rr False{}:
          %Equal.sym(Nat, 1n+w, v, t) : {Nat.is_lt(1n+rr, _) == True{} : Bool}
          u

def ahead_bump(+y: C.Share, j: Nat, +v: Nat, xs: +List<C.Share>, a: SAhead(y, xs), u: Under(v, y), m: Max(j, v, xs)) -> SAhead(y, C.bump_at(j, xs)):
  match j xs:
    case _ Nil{}:
      match m:
    case 0n z <> rest:
      match z:
        case C.Share{q2, r2, up2}:
          match r2 up2:
            case 0n _:
              (t, b) = m
              match t:
            case 1n+w True{}:
              (t, b) = m
              match t:
            case 1n+w False{}:
              (pz, ar) = a
              (t, b) = m
              (new_pair(y, w, v, u, t), ar)
    case 1n+k z <> rest:
      (pz, ar) = a
      (uz, mk) = m
      (pz, ahead_bump(y, k, v, rest, ar, u, mk))

def bump_fair(i: Nat, +v: Nat, xs: +List<C.Share>, mm: Max(i, v, xs) & Max(i, v, xs), f: SFair(xs)) -> SFair(C.bump_at(i, xs)):
  match i xs:
    case _ Nil{}:
      (m1, m2) = mm
      match m1:
    case 0n y <> rest:
      match y:
        case C.Share{q, r, up}:
          match r up:
            case 0n _:
              (m1, m2) = mm
              (t, b) = m1
              match t:
            case 1n+w True{}:
              (m1, m2) = mm
              (t, b) = m1
              match t:
            case 1n+w False{}:
              (m1, m2) = mm
              (t, b) = m1
              (a, fr) = f
              (raise_ahead(q, 1n+w, rest, below_eq(1n+w, v, rest, t, b)), fr)
    case 1n++j +y <> +rest:
      (m1, m2) = mm
      (u, mj) = m1
      (u2, mj2) = m2
      (a, fr) = f
      (ahead_bump(y, j, v, rest, a, u, mj), bump_fair(j, v, rest, dup_max(j, v, rest, mj2), fr))

def go_fair(+xs: +List<C.Share>, f: Maybe<&2, C.Pick>, m: PickMax(xs, f), h: SFair(xs)) -> SFair(C.step.go(xs, f)):
  match f:
    case None{}:
      h
    case Some{C.Pick{+i, +v}}:
      bump_fair(i, v, xs, dup_max(i, v, xs, m), h)

def step_fair(+xs: +List<C.Share>, h: SFair(xs)) -> SFair(C.step(xs)):
  go_fair(xs, C.pick(xs), pick_max(xs), h)

def rounds_fair(k: Nat, +xs: +List<C.Share>, h: SFair(xs)) -> SFair(C.rounds(k, xs)):
  match k:
    case 0n:
      h
    case 1n+j:
      rounds_fair(j, C.step(xs), step_fair(xs, h))

def shares_ahead(-q0: Nat, -r0: Nat, +p: Nat, +t: Nat, bs: +List<Nat>) -> SAhead(C.Share{q0, r0, False{}}, C.shares(p, t, bs)):
  match bs:
    case Nil{}:
      Unit{}
    case b <> rest:
      (Unit{}, shares_ahead(q0, r0, p, t, rest))

def shares_fair(+p: Nat, +t: Nat, bs: +List<Nat>) -> SFair(C.shares(p, t, bs)):
  match bs:
    case Nil{}:
      Unit{}
    case b <> +rest:
      (shares_ahead(Nat.div(Nat.mul(b, p), t), Nat.mod(Nat.mul(b, p), t), p, t, rest), shares_fair(p, t, rest))

def got_false(+q: Nat, -d: Nat, eq: {q == d : Nat}) -> {False{} == Nat.is_gt(q, d) : Bool}:
  %eq : {False{} == Nat.is_gt(q, _) : Bool}
  Equal.sym(Bool, Nat.is_gt(q, q), False{}, gt_self(q))

def got_true(+q: Nat, -d: Nat, eq: {q == d : Nat}) -> {True{} == Nat.is_gt(1n+q, d) : Bool}:
  %eq : {True{} == Nat.is_gt(1n+q, _) : Bool}
  Equal.sym(Bool, Nat.is_gt(1n+q, q), True{}, gt_succ(q))

def pair_of(-g1: Bool, -g2: Bool, -r1: Nat, -r2: Nat, -h1: Bool, -h2: Bool, -s1: Nat, -s2: Nat,
  e1: {h1 == g1 : Bool}, e2: {h2 == g2 : Bool}, e3: {s1 == r1 : Nat}, e4: {s2 == r2 : Nat}, pa: Laws.Fair.pair(h1, h2, s1, s2))
  -> Laws.Fair.pair(g1, g2, r1, r2):
  %e1 : Laws.Fair.pair(_, g2, r1, r2)
  %e2 : Laws.Fair.pair(h1, _, r1, r2)
  %e3 : Laws.Fair.pair(h1, h2, _, r2)
  %e4 : Laws.Fair.pair(h1, h2, s1, _)
  pa

def pair_hd(-p: Nat, -t: Nat, -b: Nat, -b2: Nat, -y: C.Share, +eg: {s.up(y) == Laws.Got(p, t, b, C.token(y)) : Bool}, +er: {s.r(y) == Nat.mod(Nat.mul(b, p), t) : Nat},
  z: C.Share, hz: Inv.at(p, t, b2, z), pa: Laws.Fair.pair(s.up(y), s.up(z), s.r(y), s.r(z)))
  -> Laws.Fair.pair(Laws.Got(p, t, b, C.token(y)), Laws.Got(p, t, b2, C.token(z)), Nat.mod(Nat.mul(b, p), t), Nat.mod(Nat.mul(b2, p), t)):
  match z:
    case C.Share{+q, r, up}:
      match up:
        case False{}:
          (eq, er2, u) = hz
          pair_of(Laws.Got(p, t, b, C.token(y)), Laws.Got(p, t, b2, q), Nat.mod(Nat.mul(b, p), t), Nat.mod(Nat.mul(b2, p), t), s.up(y), False{}, s.r(y), r,
            eg, got_false(q, Nat.div(Nat.mul(b2, p), t), eq), er, er2, pa)
        case True{}:
          (eq, er2, u) = hz
          pair_of(Laws.Got(p, t, b, C.token(y)), Laws.Got(p, t, b2, 1n+q), Nat.mod(Nat.mul(b, p), t), Nat.mod(Nat.mul(b2, p), t), s.up(y), True{}, s.r(y), r,
            eg, got_true(q, Nat.div(Nat.mul(b2, p), t), eq), er, er2, pa)

def ahead_of(-p: Nat, -t: Nat, -b: Nat, +y: C.Share, +eg: {s.up(y) == Laws.Got(p, t, b, C.token(y)) : Bool}, +er: {s.r(y) == Nat.mod(Nat.mul(b, p), t) : Nat},
  bs: +List<Nat>, xs: +List<C.Share>, h: Inv(p, t, bs, xs), a: SAhead(y, xs)) -> Laws.Fair.ahead(p, t, b, C.token(y), bs, C.tokens(xs)):
  match bs xs:
    case Nil{} Nil{}:
      Unit{}
    case Nil{} Con{z, zt}:
      match h:
    case Con{b2, bt} Nil{}:
      match h:
    case Con{b2, bt} Con{z, zt}:
      (hz, ht) = h
      (pa, at) = a
      (pair_hd(p, t, b, b2, y, eg, er, z, hz, pa), ahead_of(p, t, b, y, eg, er, bt, zt, ht, at))

def ahead_hd(-p: Nat, -t: Nat, -b: Nat, y: C.Share, hd: Inv.at(p, t, b, y), bs: +List<Nat>, xs: +List<C.Share>, h: Inv(p, t, bs, xs), a: SAhead(y, xs))
  -> Laws.Fair.ahead(p, t, b, C.token(y), bs, C.tokens(xs)):
  match y:
    case C.Share{+q, +r, up}:
      match up:
        case False{}:
          (eq, er, u) = hd
          ahead_of(p, t, b, C.Share{q, r, False{}}, got_false(q, Nat.div(Nat.mul(b, p), t), eq), er, bs, xs, h, a)
        case True{}:
          (eq, er, u) = hd
          ahead_of(p, t, b, C.Share{q, r, True{}}, got_true(q, Nat.div(Nat.mul(b, p), t), eq), er, bs, xs, h, a)

def dup_eqs(-a: Nat, -b: Nat, -c: Nat, -d: Nat, +e1: {a == b : Nat}, +e2: {c == d : Nat})
  -> ({a == b : Nat} & {c == d : Nat} & Unit) & ({a == b : Nat} & {c == d : Nat} & Unit):
  ((e1, e2, Unit{}), (e1, e2, Unit{}))

def dup_at(-p: Nat, -t: Nat, -b: Nat, y: C.Share, hd: Inv.at(p, t, b, y)) -> Inv.at(p, t, b, y) & Inv.at(p, t, b, y):
  match y:
    case C.Share{q, r, up}:
      match r up:
        case 0n False{}:
          (eq, er, u) = hd
          dup_eqs(q, Nat.div(Nat.mul(b, p), t), 0n, Nat.mod(Nat.mul(b, p), t), eq, er)
        case 0n True{}:
          (eq, er, u) = hd
          match u:
        case 1n+w False{}:
          (eq, er, u) = hd
          dup_eqs(q, Nat.div(Nat.mul(b, p), t), 1n+w, Nat.mod(Nat.mul(b, p), t), eq, er)
        case 1n+w True{}:
          (eq, er, u) = hd
          dup_eqs(q, Nat.div(Nat.mul(b, p), t), 1n+w, Nat.mod(Nat.mul(b, p), t), eq, er)

def dup_inv(-p: Nat, -t: Nat, bs: +List<Nat>, xs: +List<C.Share>, h: Inv(p, t, bs, xs)) -> Inv(p, t, bs, xs) & Inv(p, t, bs, xs):
  match bs xs:
    case Nil{} Nil{}:
      (Unit{}, Unit{})
    case Nil{} Con{y, yt}:
      match h:
    case Con{b, bt} Nil{}:
      match h:
    case Con{b, bt} Con{y, yt}:
      (hd, tl) = h
      zip2(Inv.at(p, t, b, y), Inv(p, t, bt, yt), dup_at(p, t, b, y, hd), dup_inv(p, t, bt, yt, tl))

def fair_of(-p: Nat, -t: Nat, bs: +List<Nat>, xs: +List<C.Share>, hh: Inv(p, t, bs, xs) & Inv(p, t, bs, xs), f: SFair(xs)) -> Laws.Fair(p, t, bs, C.tokens(xs)):
  match bs xs:
    case Nil{} Nil{}:
      Unit{}
    case Nil{} Con{y, yt}:
      (h1, h2) = hh
      match h1:
    case Con{b, bt} Nil{}:
      (h1, h2) = hh
      match h1:
    case Con{b, +bt} Con{+y, +yt}:
      (h1, h2) = hh
      (hd, ht) = h1
      (hd2, ht2) = h2
      (a, fr) = f
      (ahead_hd(p, t, b, y, hd, bt, yt, ht, a), fair_of(p, t, bt, yt, dup_inv(p, t, bt, yt, ht2), fr))

def Laws.split_leftover_to_largest_remainders(p, bs):
  fair_of(p, C.total(bs), bs, C.rounds(Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), C.shares(p, C.total(bs), bs)), dup_inv(p, C.total(bs), bs, C.rounds(Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), C.shares(p, C.total(bs), bs)), rounds_inv(p, C.total(bs), Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), bs, C.shares(p, C.total(bs), bs), shares_inv(p, C.total(bs), bs))), rounds_fair(Nat.sub(p, C.sum_q(C.shares(p, C.total(bs), bs))), C.shares(p, C.total(bs), bs), shares_fair(p, C.total(bs), bs)))

def Shift(i: Nat, off: Nat, r: Maybe<&2, A.First>) -> Maybe<&2, A.First>:
  match r:
    case None{}:
      None{}
    case Some{A.First{k, o}}:
      Some{A.First{Nat.add(i, k), Nat.add(off, o)}}

def first.s(ps: +List<A.Seen>, bs: +List<A.Block>, eq: Bool) -> Maybe<&2, A.First>:
  match ps:
    case Nil{}:
      None{}
    case p <> +pt:
      match bs:
        case Nil{}:
          Some{A.First{0n, 0n}}
        case A.Block{g, k, n} <> +bt:
          match eq:
            case True{}:
              Shift(1n, n, first.s(pt, bt, A.same(pt, bt)))
            case False{}:
              Some{A.First{0n, 0n}}

def shift_zero(+i: Nat, +off: Nat) -> {Some{A.First{i, off}} == Shift(i, off, Some{A.First{0n, 0n}}) : Maybe<&2, A.First>}:
  %add_zero(i) : {Some{A.First{i, off}} == Some{A.First{_, Nat.add(off, 0n)}} : Maybe<&2, A.First>}
  %add_zero(off) : {Some{A.First{i, off}} == Some{A.First{i, _}} : Maybe<&2, A.First>}
  {==}

def shift_shift(+i: Nat, +off: Nat, +n: Nat, r: Maybe<&2, A.First>) -> {Shift(1n+i, Nat.add(off, n), r) == Shift(i, off, Shift(1n, n, r)) : Maybe<&2, A.First>}:
  match r:
    case None{}:
      {==}
    case Some{A.First{+k, +o}}:
      %add_succ(i, k) : {Some{A.First{1n+Nat.add(i, k), Nat.add(Nat.add(off, n), o)}} == Some{A.First{_, Nat.add(off, Nat.add(n, o))}} : Maybe<&2, A.First>}
      %Equal.sym(Nat, Nat.add(off, Nat.add(n, o)), Nat.add(Nat.add(off, n), o), add_assoc(off, n, o)) : {Some{A.First{1n+Nat.add(i, k), Nat.add(Nat.add(off, n), o)}} == Some{A.First{1n+Nat.add(i, k), _}} : Maybe<&2, A.First>}
      {==}

def first_go_s(ps: +List<A.Seen>, bs: +List<A.Block>, eq: Bool, +i: Nat, +off: Nat) -> {A.first.go(ps, bs, eq, i, off) == Shift(i, off, first.s(ps, bs, eq)) : Maybe<&2, A.First>}:
  match ps:
    case Nil{}:
      {==}
    case p <> +pt:
      match bs:
        case Nil{}:
          shift_zero(i, off)
        case A.Block{g, k, +n} <> +bt:
          match eq:
            case True{}:
              Equal.trans(Maybe<&2, A.First>, A.first.go(pt, bt, A.same(pt, bt), 1n+i, Nat.add(off, n)), Shift(1n+i, Nat.add(off, n), first.s(pt, bt, A.same(pt, bt))), Shift(i, off, Shift(1n, n, first.s(pt, bt, A.same(pt, bt)))),
                first_go_s(pt, bt, A.same(pt, bt), 1n+i, Nat.add(off, n)), shift_shift(i, off, n, first.s(pt, bt, A.same(pt, bt))))
            case False{}:
              shift_zero(i, off)

def shift_zero_zero(r: Maybe<&2, A.First>) -> {Shift(0n, 0n, r) == r : Maybe<&2, A.First>}:
  match r:
    case None{}:
      {==}
    case Some{A.First{k, o}}:
      {==}

def first_shift_ok(-h: Nat, -g: Nat, -a: Nat, -pt: +List<A.Seen>, -k: Nat, +n: Nat, -bt: +List<A.Block>, e: Laws.Agree(h, g), r: Maybe<&2, A.First>, ih: Laws.FirstOk(A.Known{pt}, bt, r))
  -> Laws.FirstOk(A.Known{A.Seen{h, a} <> pt}, A.Block{g, k, n} <> bt, Shift(1n, n, r)):
  match r:
    case None{}:
      (e, ih)
    case Some{A.First{k2, o}}:
      (d, eo) = ih
      ((e, d), Equal.cong(Nat, Nat, x => Nat.add(n, x), o, Laws.BytesBefore(bt, k2), eo))

def first_s_step(+h: Nat, +g: Nat, -a: Nat, +pt: +List<A.Seen>, -k: Nat, +n: Nat, +bt: +List<A.Block>, b: Bool, e: {Nat.is_eq(h, g) == b : Bool},
  ih: Laws.FirstOk(A.Known{pt}, bt, first.s(pt, bt, A.same(pt, bt))))
  -> Laws.FirstOk(A.Known{A.Seen{h, a} <> pt}, A.Block{g, k, n} <> bt, first.s(A.Seen{h, a} <> pt, A.Block{g, k, n} <> bt, b)):
  match b:
    case True{}:
      first_shift_ok(h, g, a, pt, k, n, bt, e, first.s(pt, bt, A.same(pt, bt)), ih)
    case False{}:
      (e, {==})

def first_s_ok(ps: +List<A.Seen>, bs: +List<A.Block>) -> Laws.FirstOk(A.Known{ps}, bs, first.s(ps, bs, A.same(ps, bs))):
  match ps:
    case Nil{}:
      Unit{}
    case A.Seen{+h, a} <> +pt:
      match bs:
        case Nil{}:
          ({==}, {==})
        case A.Block{+g, k, +n} <> +bt:
          first_s_step(h, g, a, pt, k, n, bt, Nat.is_eq(h, g), {==}, first_s_ok(pt, bt))

def Laws.arena_first_change_is_the_first_difference(prev, bs):
  match prev:
    case A.Fresh{}:
      Unit{}
    case A.Known{+ps}:
      %Equal.sym(Maybe<&2, A.First>, A.first.go(ps, bs, A.same(ps, bs), 0n, 0n), first.s(ps, bs, A.same(ps, bs)),
        Equal.trans(Maybe<&2, A.First>, A.first.go(ps, bs, A.same(ps, bs), 0n, 0n), Shift(0n, 0n, first.s(ps, bs, A.same(ps, bs))), first.s(ps, bs, A.same(ps, bs)),
          first_go_s(ps, bs, A.same(ps, bs), 0n, 0n), shift_zero_zero(first.s(ps, bs, A.same(ps, bs))))) : Laws.FirstOk(A.Known{ps}, bs, _)
      first_s_ok(ps, bs)

def fill_eq(bs: +List<A.Block>, +age: Nat, acc: +List<Nat>) -> {A.fill(bs, age, acc) == A.rev(acc, Laws.AllAt(bs, age)) : List<&2, Nat>}:
  match bs:
    case Nil{}:
      {==}
    case b <> rest:
      fill_eq(rest, age, age <> acc)

def same_eq(ps: +List<A.Seen>, bs: +List<A.Block>) -> {A.same(ps, bs) == Laws.SameHead(ps, bs) : Bool}:
  match ps:
    case Nil{}:
      {==}
    case A.Seen{h, a} <> pt:
      match bs:
        case Nil{}:
          {==}
        case A.Block{g, k, n} <> bt:
          {==}

def ages_go_eq(ps: +List<A.Seen>, bs: +List<A.Block>, eq: Bool, +turn: Nat, acc: +List<Nat>)
  -> {A.ages.go(ps, bs, eq, turn, acc) == A.rev(acc, Laws.KeptAges(ps, bs, eq, turn)) : List<&2, Nat>}:
  match ps:
    case Nil{}:
      fill_eq(bs, turn, acc)
    case A.Seen{h, +a} <> +pt:
      match bs:
        case Nil{}:
          {==}
        case b <> +bt:
          match eq:
            case True{}:
              %same_eq(pt, bt) : {A.ages.go(pt, bt, A.same(pt, bt), turn, a <> acc) == A.rev(acc, a <> Laws.KeptAges(pt, bt, _, turn)) : List<&2, Nat>}
              ages_go_eq(pt, bt, A.same(pt, bt), turn, a <> acc)
            case False{}:
              fill_eq(b <> bt, turn, acc)

def Laws.arena_ages_keep_the_unchanged_prefix(prev, bs, turn, tracked):
  match prev:
    case A.Fresh{}:
      match tracked:
        case True{}:
          fill_eq(bs, turn, Nil{})
        case False{}:
          fill_eq(bs, 0n, Nil{})
    case A.Known{+ps}:
      %same_eq(ps, bs) : {A.ages.go(ps, bs, A.same(ps, bs), turn, Nil{}) == Laws.KeptAges(ps, bs, _, turn) : List<&2, Nat>}
      ages_go_eq(ps, bs, A.same(ps, bs), turn, Nil{})

def SameLen(bs: +List<A.Block>, ags: +List<Nat>) -> Type:
  match bs:
    case Nil{}:
      match ags:
        case Nil{}:
          Unit
        case a <> at:
          Empty
    case b <> bt:
      match ags:
        case Nil{}:
          Empty
        case a <> at:
          SameLen(bt, at)

def samelen_all(bs: +List<A.Block>, +age: Nat) -> SameLen(bs, Laws.AllAt(bs, age)):
  match bs:
    case Nil{}:
      Unit{}
    case b <> bt:
      samelen_all(bt, age)

def samelen_kept(ps: +List<A.Seen>, bs: +List<A.Block>, eq: Bool, +turn: Nat) -> SameLen(bs, Laws.KeptAges(ps, bs, eq, turn)):
  match ps:
    case Nil{}:
      samelen_all(bs, turn)
    case A.Seen{h, a} <> +pt:
      match bs:
        case Nil{}:
          Unit{}
        case b <> +bt:
          match eq:
            case True{}:
              samelen_kept(pt, bt, Laws.SameHead(pt, bt), turn)
            case False{}:
              samelen_all(b <> bt, turn)

def samelen_expected(prev: A.Prev, +bs: +List<A.Block>, +turn: Nat, tracked: Bool) -> SameLen(bs, Laws.ExpectedAges(prev, bs, turn, tracked)):
  match prev:
    case A.Fresh{}:
      match tracked:
        case True{}:
          samelen_all(bs, turn)
        case False{}:
          samelen_all(bs, 0n)
    case A.Known{+ps}:
      samelen_kept(ps, bs, Laws.SameHead(ps, bs), turn)

def samelen_ages(+prev: A.Prev, +bs: +List<A.Block>, +turn: Nat, +tracked: Bool) -> SameLen(bs, A.ages(prev, bs, turn, tracked)):
  %Equal.sym(List<&2, Nat>, A.ages(prev, bs, turn, tracked), Laws.ExpectedAges(prev, bs, turn, tracked), Laws.arena_ages_keep_the_unchanged_prefix(prev, bs, turn, tracked)) : SameLen(bs, _)
  samelen_expected(prev, bs, turn, tracked)

def joins_nil(bs: +List<A.Block>, ags: +List<Nat>, c: A.Cut) -> {A.joins(bs, ags, c, Nil{}) == False{} : Bool}:
  match bs:
    case Nil{}:
      {==}
    case A.Block{h, k, n} <> bt:
      match ags:
        case Nil{}:
          {==}
        case a <> at:
          match c:
            case A.NoCut{}:
              {==}
            case A.CutIn{m}:
              match m:
                case 0n:
                  {==}
                case 1n+d:
                  {==}


def cat_assoc(xs: +List<Laws.Label>, +ys: +List<Laws.Label>, +zs: +List<Laws.Label>) -> {Laws.Cat(Laws.Cat(xs, ys), zs) == Laws.Cat(xs, Laws.Cat(ys, zs)) : List<&2, Laws.Label>}:
  match xs:
    case Nil{}:
      {==}
    case x <> +rest:
      Equal.cong(List<&2, Laws.Label>, List<&2, Laws.Label>, l => x <> l, Laws.Cat(Laws.Cat(rest, ys), zs), Laws.Cat(rest, Laws.Cat(ys, zs)), cat_assoc(rest, ys, zs))

def copies_add(m: Nat, +n: Nat, +k: Nat, +a: Nat) -> {Laws.Copies(Nat.add(m, n), k, a) == Laws.Cat(Laws.Copies(m, k, a), Laws.Copies(n, k, a)) : List<&2, Laws.Label>}:
  match m:
    case 0n:
      {==}
    case 1n+p:
      Equal.cong(List<&2, Laws.Label>, List<&2, Laws.Label>, l => Laws.Label{k, a} <> l, Laws.Copies(Nat.add(p, n), k, a), Laws.Cat(Laws.Copies(p, k, a), Laws.Copies(n, k, a)), copies_add(p, n, k, a))

def RevExpand(acc: +List<A.Run>) -> +List<Laws.Label>:
  match acc:
    case Nil{}:
      Nil{}
    case A.Run{k, n, a} <> rest:
      Laws.Cat(RevExpand(rest), Laws.Copies(n, k, a))

def expand_rev(acc: +List<A.Run>, +ys: +List<A.Run>) -> {Laws.Expand(A.rev.runs(acc, ys)) == Laws.Cat(RevExpand(acc), Laws.Expand(ys)) : List<&2, Laws.Label>}:
  match acc:
    case Nil{}:
      {==}
    case A.Run{+k, +n, +a} <> +rest:
      Equal.trans(List<&2, Laws.Label>, Laws.Expand(A.rev.runs(rest, A.Run{k, n, a} <> ys)), Laws.Cat(RevExpand(rest), Laws.Cat(Laws.Copies(n, k, a), Laws.Expand(ys))), Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(n, k, a)), Laws.Expand(ys)),
        expand_rev(rest, A.Run{k, n, a} <> ys),
        Equal.sym(List<&2, Laws.Label>, Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(n, k, a)), Laws.Expand(ys)), Laws.Cat(RevExpand(rest), Laws.Cat(Laws.Copies(n, k, a), Laws.Expand(ys))), cat_assoc(RevExpand(rest), Laws.Copies(n, k, a), Laws.Expand(ys))))

def and_left(x: Bool, -y: Bool, e: {True{} == Bool.and(x, y) : Bool}) -> {x == True{} : Bool}:
  match x:
    case True{}:
      {==}
    case False{}:
      Equal.sym(Bool, True{}, False{}, e)

def and_right(x: Bool, -y: Bool, e: {True{} == Bool.and(x, y) : Bool}) -> {y == True{} : Bool}:
  match x:
    case True{}:
      Equal.sym(Bool, True{}, y, e)
    case False{}:
      Empty.absurd({y == True{} : Bool}, ft(Equal.sym(Bool, True{}, False{}, e)))

def eq_true(a: Nat, b: Nat, e: {Nat.is_eq(a, b) == True{} : Bool}) -> {a == b : Nat}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bb:
      Empty.absurd({0n == 1n+bb : Nat}, ft(e))
    case 1n+aa 0n:
      Empty.absurd({1n+aa == 0n : Nat}, ft(e))
    case 1n+aa 1n+bb:
      Equal.cong(Nat, Nat, x => 1n+x, aa, bb, eq_true(aa, bb, e))

def regroup4(+r: +List<Laws.Label>, +m: +List<Laws.Label>, +n: +List<Laws.Label>, +l: +List<Laws.Label>)
  -> {Laws.Cat(Laws.Cat(r, Laws.Cat(m, n)), l) == Laws.Cat(Laws.Cat(r, m), Laws.Cat(n, l)) : List<&2, Laws.Label>}:
  Equal.trans(List<&2, Laws.Label>, Laws.Cat(Laws.Cat(r, Laws.Cat(m, n)), l), Laws.Cat(r, Laws.Cat(m, Laws.Cat(n, l))), Laws.Cat(Laws.Cat(r, m), Laws.Cat(n, l)),
    Equal.trans(List<&2, Laws.Label>, Laws.Cat(Laws.Cat(r, Laws.Cat(m, n)), l), Laws.Cat(r, Laws.Cat(Laws.Cat(m, n), l)), Laws.Cat(r, Laws.Cat(m, Laws.Cat(n, l))),
      cat_assoc(r, Laws.Cat(m, n), l),
      Equal.cong(List<&2, Laws.Label>, List<&2, Laws.Label>, z => Laws.Cat(r, z), Laws.Cat(Laws.Cat(m, n), l), Laws.Cat(m, Laws.Cat(n, l)), cat_assoc(m, n, l))),
    Equal.sym(List<&2, Laws.Label>, Laws.Cat(Laws.Cat(r, m), Laws.Cat(n, l)), Laws.Cat(r, Laws.Cat(m, Laws.Cat(n, l))), cat_assoc(r, m, Laws.Cat(n, l))))

def merge_labels(-x: +List<Laws.Label>, +rest: +List<A.Run>, +k2: Nat, +m: Nat, +a2: Nat, +n: Nat, -k: Nat, -a: Nat, +lbt: +List<Laws.Label>,
  ek: {k == k2 : Nat}, ea: {a == a2 : Nat}, ih: {x == Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(Nat.add(m, n), k2, a2)), lbt) : List<&2, Laws.Label>})
  -> {x == Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(m, k2, a2)), Laws.Cat(Laws.Copies(n, k, a), lbt)) : List<&2, Laws.Label>}:
  %Equal.sym(Nat, k, k2, ek) : {x == Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(m, k2, a2)), Laws.Cat(Laws.Copies(n, _, a), lbt)) : List<&2, Laws.Label>}
  %Equal.sym(Nat, a, a2, ea) : {x == Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(m, k2, a2)), Laws.Cat(Laws.Copies(n, k2, _), lbt)) : List<&2, Laws.Label>}
  Equal.trans(List<&2, Laws.Label>, x, Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(Nat.add(m, n), k2, a2)), lbt), Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(m, k2, a2)), Laws.Cat(Laws.Copies(n, k2, a2), lbt)), ih,
    Equal.trans(List<&2, Laws.Label>, Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(Nat.add(m, n), k2, a2)), lbt), Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Cat(Laws.Copies(m, k2, a2), Laws.Copies(n, k2, a2))), lbt), Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(m, k2, a2)), Laws.Cat(Laws.Copies(n, k2, a2), lbt)),
      Equal.cong(List<&2, Laws.Label>, List<&2, Laws.Label>, z => Laws.Cat(Laws.Cat(RevExpand(rest), z), lbt), Laws.Copies(Nat.add(m, n), k2, a2), Laws.Cat(Laws.Copies(m, k2, a2), Laws.Copies(n, k2, a2)), copies_add(m, n, k2, a2)),
      regroup4(RevExpand(rest), Laws.Copies(m, k2, a2), Laws.Copies(n, k2, a2), lbt)))

def joined(+k: Nat, +a: Nat, +k2: Nat, +a2: Nat, +e: {True{} == Bool.and(Nat.is_eq(k, k2), Nat.is_eq(a, a2)) : Bool}) -> {k == k2 : Nat} & {a == a2 : Nat}:
  (eq_true(k, k2, and_left(Nat.is_eq(k, k2), Nat.is_eq(a, a2), e)), eq_true(a, a2, and_right(Nat.is_eq(k, k2), Nat.is_eq(a, a2), e)))

def merge_with(-x: +List<Laws.Label>, +rest: +List<A.Run>, +k2: Nat, +m: Nat, +a2: Nat, +n: Nat, -k: Nat, -a: Nat, +lbt: +List<Laws.Label>,
  ks: {k == k2 : Nat} & {a == a2 : Nat}, ih: {x == Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(Nat.add(m, n), k2, a2)), lbt) : List<&2, Laws.Label>})
  -> {x == Laws.Cat(Laws.Cat(RevExpand(rest), Laws.Copies(m, k2, a2)), Laws.Cat(Laws.Copies(n, k, a), lbt)) : List<&2, Laws.Label>}:
  (ek, ea) = ks
  merge_labels(x, rest, k2, m, a2, n, k, a, lbt, ek, ea, ih)

def runs_go_labels(bs: +List<A.Block>, ags: +List<Nat>, j: Bool, +acc: +List<A.Run>, +c: A.Cut, e: {j == A.joins(bs, ags, c, acc) : Bool}, l: SameLen(bs, ags))
  -> {Laws.Expand(A.runs.go(bs, ags, c, acc, j)) == Laws.Cat(RevExpand(acc), Laws.Labels(bs, ags)) : List<&2, Laws.Label>}:
  match bs:
    case Nil{}:
      match ags:
        case Nil{}:
          expand_rev(acc, Nil{})
        case a <> at:
          match l:
    case A.Block{h, +k, +n} <> +bt:
      match ags:
        case Nil{}:
          match l:
        case +a <> +at:
          match j:
            case True{}:
              match acc:
                case Nil{}:
                  Empty.absurd({Laws.Expand(A.runs.go(A.Block{h, k, n} <> bt, a <> at, c, Nil{}, True{})) == Laws.Cat(RevExpand(Nil{}), Laws.Labels(A.Block{h, k, n} <> bt, a <> at)) : List<&2, Laws.Label>},
                    ft(Equal.sym(Bool, True{}, False{}, Equal.trans(Bool, True{}, A.joins(A.Block{h, k, n} <> bt, a <> at, c, Nil{}), False{}, e, joins_nil(A.Block{h, k, n} <> bt, a <> at, c)))))
                case A.Run{+k2, +m, +a2} <> +rest:
                  match c:
                    case A.NoCut{}:
                      merge_with(Laws.Expand(A.runs.go(bt, at, A.NoCut{}, A.Run{k2, Nat.add(m, n), a2} <> rest, A.joins(bt, at, A.NoCut{}, A.Run{k2, Nat.add(m, n), a2} <> rest))),
                        rest, k2, m, a2, n, k, a, Laws.Labels(bt, at), joined(k, a, k2, a2, e),
                        runs_go_labels(bt, at, A.joins(bt, at, A.NoCut{}, A.Run{k2, Nat.add(m, n), a2} <> rest), A.Run{k2, Nat.add(m, n), a2} <> rest, A.NoCut{}, {==}, l))
                    case A.CutIn{cm}:
                      match cm:
                        case 0n:
                          Empty.absurd({Laws.Expand(A.runs.go(A.Block{h, k, n} <> bt, a <> at, A.CutIn{0n}, A.Run{k2, m, a2} <> rest, True{})) == Laws.Cat(RevExpand(A.Run{k2, m, a2} <> rest), Laws.Labels(A.Block{h, k, n} <> bt, a <> at)) : List<&2, Laws.Label>},
                            ft(Equal.sym(Bool, True{}, False{}, e)))
                        case 1n++d:
                          merge_with(Laws.Expand(A.runs.go(bt, at, A.CutIn{d}, A.Run{k2, Nat.add(m, n), a2} <> rest, A.joins(bt, at, A.CutIn{d}, A.Run{k2, Nat.add(m, n), a2} <> rest))),
                            rest, k2, m, a2, n, k, a, Laws.Labels(bt, at), joined(k, a, k2, a2, e),
                            runs_go_labels(bt, at, A.joins(bt, at, A.CutIn{d}, A.Run{k2, Nat.add(m, n), a2} <> rest), A.Run{k2, Nat.add(m, n), a2} <> rest, A.CutIn{d}, {==}, l))
            case False{}:
              Equal.trans(List<&2, Laws.Label>, Laws.Expand(A.runs.go(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc, A.joins(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc))),
                Laws.Cat(Laws.Cat(RevExpand(acc), Laws.Copies(n, k, a)), Laws.Labels(bt, at)), Laws.Cat(RevExpand(acc), Laws.Cat(Laws.Copies(n, k, a), Laws.Labels(bt, at))),
                runs_go_labels(bt, at, A.joins(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc), A.Run{k, n, a} <> acc, A.cut.next(c), {==}, l),
                cat_assoc(RevExpand(acc), Laws.Copies(n, k, a), Laws.Labels(bt, at)))

def Laws.arena_runs_keep_every_byte_with_its_kind_and_age(prev, bs, turn, tracked):
  %Laws.arena_ages_keep_the_unchanged_prefix(prev, bs, turn, tracked) : {Laws.Expand(Laws.RunsOf(A.arena(prev, bs, turn, tracked))) == Laws.Labels(bs, _) : List<&2, Laws.Label>}
  runs_go_labels(bs, A.ages(prev, bs, turn, tracked), A.joins(bs, A.ages(prev, bs, turn, tracked), A.cut.of(A.first(prev, bs)), Nil{}), Nil{}, A.cut.of(A.first(prev, bs)), {==}, samelen_ages(prev, bs, turn, tracked))

def D(c: A.Cut) -> Maybe<&2, Nat>:
  match c:
    case A.NoCut{}:
      None{}
    case A.CutIn{n}:
      Some{n}

def OpenOf(acc: +List<A.Run>) -> Maybe<&2, A.Run>:
  match acc:
    case Nil{}:
      None{}
    case r <> rest:
      Some{r}

def Closed(acc: +List<A.Run>) -> +List<A.Run>:
  match acc:
    case Nil{}:
      Nil{}
    case r <> rest:
      rest

def d_tick(c: A.Cut) -> {D(A.cut.next(c)) == Laws.Tick(D(c)) : Maybe<&2, Nat>}:
  match c:
    case A.NoCut{}:
      {==}
    case A.CutIn{n}:
      match n:
        case 0n:
          {==}
        case 1n+m:
          {==}

def before_d(f: Maybe<&2, A.First>) -> {D(A.cut.of(f)) == Laws.Before(f) : Maybe<&2, Nat>}:
  match f:
    case None{}:
      {==}
    case Some{A.First{b, o}}:
      {==}

def closed_grow(acc: +List<A.Run>, +n: Nat) -> {Closed(A.grow(acc, n)) == Closed(acc) : List<&2, A.Run>}:
  match acc:
    case Nil{}:
      {==}
    case A.Run{k, m, a} <> rest:
      {==}

def open_grow(acc: +List<A.Run>, +n: Nat) -> {OpenOf(A.grow(acc, n)) == Laws.Grow(OpenOf(acc), n) : Maybe<&2, A.Run>}:
  match acc:
    case Nil{}:
      {==}
    case A.Run{k, m, a} <> rest:
      {==}

def close_rev(acc: +List<A.Run>, +x: +List<A.Run>) -> {A.rev.runs(Closed(acc), Laws.Close(OpenOf(acc), x)) == A.rev.runs(acc, x) : List<&2, A.Run>}:
  match acc:
    case Nil{}:
      {==}
    case r <> rest:
      {==}

def joins_fits(bs: +List<A.Block>, ags: +List<Nat>, c: A.Cut, acc: +List<A.Run>) -> {A.joins(bs, ags, c, acc) == Laws.NextFits(bs, ags, OpenOf(acc), D(c)) : Bool}:
  match bs:
    case Nil{}:
      {==}
    case A.Block{h, k, n} <> bt:
      match ags:
        case Nil{}:
          {==}
        case a <> at:
          match c:
            case A.NoCut{}:
              match acc:
                case Nil{}:
                  {==}
                case A.Run{k2, n2, a2} <> rest:
                  {==}
            case A.CutIn{m}:
              match m:
                case 0n:
                  match acc:
                    case Nil{}:
                      {==}
                    case A.Run{k2, n2, a2} <> rest:
                      {==}
                case 1n+d:
                  match acc:
                    case Nil{}:
                      {==}
                    case A.Run{k2, n2, a2} <> rest:
                      {==}

def grouped_cong(-bt: +List<A.Block>, -at: +List<Nat>, -c1: +List<A.Run>, -c2: +List<A.Run>, -o1: Maybe<&2, A.Run>, -o2: Maybe<&2, A.Run>, -d1: Maybe<&2, Nat>, -d2: Maybe<&2, Nat>,
  ec: {c1 == c2 : List<&2, A.Run>}, eo: {o1 == o2 : Maybe<&2, A.Run>}, ed: {d1 == d2 : Maybe<&2, Nat>})
  -> {A.rev.runs(c1, Laws.Grouped(bt, at, o1, d1, Laws.NextFits(bt, at, o1, d1))) == A.rev.runs(c2, Laws.Grouped(bt, at, o2, d2, Laws.NextFits(bt, at, o2, d2))) : List<&2, A.Run>}:
  %ec : {A.rev.runs(c1, Laws.Grouped(bt, at, o1, d1, Laws.NextFits(bt, at, o1, d1))) == A.rev.runs(_, Laws.Grouped(bt, at, o2, d2, Laws.NextFits(bt, at, o2, d2))) : List<&2, A.Run>}
  %eo : {A.rev.runs(c1, Laws.Grouped(bt, at, o1, d1, Laws.NextFits(bt, at, o1, d1))) == A.rev.runs(c1, Laws.Grouped(bt, at, _, d2, Laws.NextFits(bt, at, _, d2))) : List<&2, A.Run>}
  %ed : {A.rev.runs(c1, Laws.Grouped(bt, at, o1, d1, Laws.NextFits(bt, at, o1, d1))) == A.rev.runs(c1, Laws.Grouped(bt, at, o1, _, Laws.NextFits(bt, at, o1, _))) : List<&2, A.Run>}
  {==}

def runs_spec(bs: +List<A.Block>, ags: +List<Nat>, j: Bool, -js: Bool, +acc: +List<A.Run>, +c: A.Cut, e: {j == js : Bool})
  -> {A.runs.go(bs, ags, c, acc, j) == A.rev.runs(Closed(acc), Laws.Grouped(bs, ags, OpenOf(acc), D(c), js)) : List<&2, A.Run>}:
  match bs:
    case Nil{}:
      Equal.sym(List<&2, A.Run>, A.rev.runs(Closed(acc), Laws.Close(OpenOf(acc), Nil{})), A.rev.runs(acc, Nil{}), close_rev(acc, Nil{}))
    case A.Block{h, +k, +n} <> +bt:
      match ags:
        case Nil{}:
          Equal.sym(List<&2, A.Run>, A.rev.runs(Closed(acc), Laws.Close(OpenOf(acc), Nil{})), A.rev.runs(acc, Nil{}), close_rev(acc, Nil{}))
        case +a <> +at:
          match j:
            case True{}:
              %e : {A.runs.go(A.Block{h, k, n} <> bt, a <> at, c, acc, True{}) == A.rev.runs(Closed(acc), Laws.Grouped(A.Block{h, k, n} <> bt, a <> at, OpenOf(acc), D(c), _)) : List<&2, A.Run>}
              Equal.trans(List<&2, A.Run>, A.runs.go(bt, at, A.cut.next(c), A.grow(acc, n), A.joins(bt, at, A.cut.next(c), A.grow(acc, n))),
                A.rev.runs(Closed(A.grow(acc, n)), Laws.Grouped(bt, at, OpenOf(A.grow(acc, n)), D(A.cut.next(c)), Laws.NextFits(bt, at, OpenOf(A.grow(acc, n)), D(A.cut.next(c))))),
                A.rev.runs(Closed(acc), Laws.Grouped(bt, at, Laws.Grow(OpenOf(acc), n), Laws.Tick(D(c)), Laws.NextFits(bt, at, Laws.Grow(OpenOf(acc), n), Laws.Tick(D(c))))),
                runs_spec(bt, at, A.joins(bt, at, A.cut.next(c), A.grow(acc, n)), Laws.NextFits(bt, at, OpenOf(A.grow(acc, n)), D(A.cut.next(c))), A.grow(acc, n), A.cut.next(c), joins_fits(bt, at, A.cut.next(c), A.grow(acc, n))),
                grouped_cong(bt, at, Closed(A.grow(acc, n)), Closed(acc), OpenOf(A.grow(acc, n)), Laws.Grow(OpenOf(acc), n), D(A.cut.next(c)), Laws.Tick(D(c)), closed_grow(acc, n), open_grow(acc, n), d_tick(c)))
            case False{}:
              %e : {A.runs.go(A.Block{h, k, n} <> bt, a <> at, c, acc, False{}) == A.rev.runs(Closed(acc), Laws.Grouped(A.Block{h, k, n} <> bt, a <> at, OpenOf(acc), D(c), _)) : List<&2, A.Run>}
              Equal.trans(List<&2, A.Run>, A.runs.go(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc, A.joins(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc)),
                A.rev.runs(acc, Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, D(A.cut.next(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, D(A.cut.next(c))))),
                A.rev.runs(Closed(acc), Laws.Close(OpenOf(acc), Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)))))),
                runs_spec(bt, at, A.joins(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, D(A.cut.next(c))), A.Run{k, n, a} <> acc, A.cut.next(c), joins_fits(bt, at, A.cut.next(c), A.Run{k, n, a} <> acc)),
                Equal.trans(List<&2, A.Run>,
                  A.rev.runs(acc, Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, D(A.cut.next(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, D(A.cut.next(c))))),
                  A.rev.runs(acc, Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c))))),
                  A.rev.runs(Closed(acc), Laws.Close(OpenOf(acc), Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)))))),
                  grouped_cong(bt, at, acc, acc, Some{A.Run{k, n, a}}, Some{A.Run{k, n, a}}, D(A.cut.next(c)), Laws.Tick(D(c)), {==}, {==}, d_tick(c)),
                  Equal.sym(List<&2, A.Run>, A.rev.runs(Closed(acc), Laws.Close(OpenOf(acc), Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)))))),
                    A.rev.runs(acc, Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c))))),
                    close_rev(acc, Laws.Grouped(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c)), Laws.NextFits(bt, at, Some{A.Run{k, n, a}}, Laws.Tick(D(c))))))))

def Laws.arena_runs_merge_neighbours_of_one_kind_and_age(prev, bs, turn, tracked):
  %Laws.arena_ages_keep_the_unchanged_prefix(prev, bs, turn, tracked) : {Laws.RunsOf(A.arena(prev, bs, turn, tracked)) == Laws.ExpectedRuns(bs, _, A.first(prev, bs)) : List<&2, A.Run>}
  %before_d(A.first(prev, bs)) : {Laws.RunsOf(A.arena(prev, bs, turn, tracked)) == Laws.Grouped(bs, A.ages(prev, bs, turn, tracked), None{}, _, Laws.NextFits(bs, A.ages(prev, bs, turn, tracked), None{}, _)) : List<&2, A.Run>}
  runs_spec(bs, A.ages(prev, bs, turn, tracked), A.joins(bs, A.ages(prev, bs, turn, tracked), A.cut.of(A.first(prev, bs)), Nil{}), Laws.NextFits(bs, A.ages(prev, bs, turn, tracked), None{}, D(A.cut.of(A.first(prev, bs)))), Nil{}, A.cut.of(A.first(prev, bs)), joins_fits(bs, A.ages(prev, bs, turn, tracked), A.cut.of(A.first(prev, bs)), Nil{}))

def Laws.usage_unknown_input_stays_unknown(anthropic, output, cached, write):
  {==}

def Laws.usage_known_input_splits_the_prompt(anthropic, input, output, cached, write):
  match anthropic:
    case True{}:
      match cached:
        case None{}:
          match write:
            case None{}:
              {==}
            case Some{w}:
              {==}
        case Some{c}:
          match write:
            case None{}:
              {==}
            case Some{w}:
              {==}
    case False{}:
      match cached:
        case None{}:
          {==}
        case Some{c}:
          {==}

def and_false(b: Bool) -> {Bool.and(b, False{}) == False{} : Bool}:
  match b:
    case True{}:
      {==}
    case False{}:
      {==}

def or0_eq(m: Maybe<&2, Nat>) -> {U.or0(m) == Laws.Or0(m) : Nat}:
  match m:
    case None{}:
      {==}
    case Some{n}:
      {==}

def expect_eq(before: U.Turn, anthropic: Bool) -> {U.drop.expect(before, anthropic) == Laws.ExpectedPrefix(before, anthropic) : Maybe<&2, Nat>}:
  match before:
    case U.Turn{+r, +w, i, o, p}:
      match p:
        case None{}:
          {==}
        case Some{pp}:
          match anthropic:
            case True{}:
              %or0_eq(r) : {Some{Nat.add(U.or0(r), U.or0(w))} == Some{Nat.add(_, Laws.Or0(w))} : Maybe<&2, Nat>}
              %or0_eq(w) : {Some{Nat.add(U.or0(r), U.or0(w))} == Some{Nat.add(U.or0(r), _)} : Maybe<&2, Nat>}
              {==}
            case False{}:
              {==}

def drop_go_eq(e: Maybe<&2, Nat>, now: U.Turn) -> {U.drop.go(e, now) == Laws.CacheDropped(e, now) : Bool}:
  match e:
    case None{}:
      {==}
    case Some{+x}:
      match now:
        case U.Turn{r, w, i, o, p}:
          match r:
            case None{}:
              Equal.sym(Bool, Bool.and(Nat.is_ge(x, 1024n), False{}), False{}, and_false(Nat.is_ge(x, 1024n)))
            case Some{c}:
              {==}

def Laws.usage_cache_drop_only_from_evidence(anthropic, now, before):
  Equal.trans(Bool, U.drop.go(U.drop.expect(before, anthropic), now), Laws.CacheDropped(U.drop.expect(before, anthropic), now), Laws.CacheDropped(Laws.ExpectedPrefix(before, anthropic), now),
    drop_go_eq(U.drop.expect(before, anthropic), now),
    Equal.cong(Maybe<&2, Nat>, Bool, e => Laws.CacheDropped(e, now), U.drop.expect(before, anthropic), Laws.ExpectedPrefix(before, anthropic), expect_eq(before, anthropic)))

def Merge(t: U.Totals, u: U.Totals) -> U.Totals:
  match t:
    case U.Totals{a, b, c, d, e}:
      match u:
        case U.Totals{f, g, h, k, l}:
          U.Totals{Nat.add(a, f), Nat.add(b, g), Nat.add(c, h), Nat.add(d, k), Nat.add(e, l)}

def merge_zero(u: U.Totals) -> {Merge(U.Totals{0n, 0n, 0n, 0n, 0n}, u) == u : U.Totals}:
  match u:
    case U.Totals{f, g, h, k, l}:
      {==}

def merge_nil(t: U.Totals) -> {t == Merge(t, U.Totals{0n, 0n, 0n, 0n, 0n}) : U.Totals}:
  match t:
    case U.Totals{+a, +b, +c, +d, +e}:
      %add_zero(a) : {U.Totals{a, b, c, d, e} == U.Totals{_, Nat.add(b, 0n), Nat.add(c, 0n), Nat.add(d, 0n), Nat.add(e, 0n)} : U.Totals}
      %add_zero(b) : {U.Totals{a, b, c, d, e} == U.Totals{a, _, Nat.add(c, 0n), Nat.add(d, 0n), Nat.add(e, 0n)} : U.Totals}
      %add_zero(c) : {U.Totals{a, b, c, d, e} == U.Totals{a, b, _, Nat.add(d, 0n), Nat.add(e, 0n)} : U.Totals}
      %add_zero(d) : {U.Totals{a, b, c, d, e} == U.Totals{a, b, c, _, Nat.add(e, 0n)} : U.Totals}
      %add_zero(e) : {U.Totals{a, b, c, d, e} == U.Totals{a, b, c, d, _} : U.Totals}
      {==}

def merge_step(+a: Nat, +b: Nat, +c: Nat, +d: Nat, +e: Nat, +x1: Nat, +x2: Nat, +x3: Nat, +x4: Nat, +x5: Nat, er: U.Totals)
  -> {Merge(U.Totals{Nat.add(a, x1), Nat.add(b, x2), Nat.add(c, x3), Nat.add(d, x4), Nat.add(e, x5)}, er) == Merge(U.Totals{a, b, c, d, e}, Laws.AddTo(x1, x2, x3, x4, x5, er)) : U.Totals}:
  match er:
    case U.Totals{+f, +g, +h, +k, +l}:
      %Equal.sym(Nat, Nat.add(a, Nat.add(x1, f)), Nat.add(Nat.add(a, x1), f), add_assoc(a, x1, f)) : {U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), Nat.add(Nat.add(d, x4), k), Nat.add(Nat.add(e, x5), l)} == U.Totals{_, Nat.add(b, Nat.add(x2, g)), Nat.add(c, Nat.add(x3, h)), Nat.add(d, Nat.add(x4, k)), Nat.add(e, Nat.add(x5, l))} : U.Totals}
      %Equal.sym(Nat, Nat.add(b, Nat.add(x2, g)), Nat.add(Nat.add(b, x2), g), add_assoc(b, x2, g)) : {U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), Nat.add(Nat.add(d, x4), k), Nat.add(Nat.add(e, x5), l)} == U.Totals{Nat.add(Nat.add(a, x1), f), _, Nat.add(c, Nat.add(x3, h)), Nat.add(d, Nat.add(x4, k)), Nat.add(e, Nat.add(x5, l))} : U.Totals}
      %Equal.sym(Nat, Nat.add(c, Nat.add(x3, h)), Nat.add(Nat.add(c, x3), h), add_assoc(c, x3, h)) : {U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), Nat.add(Nat.add(d, x4), k), Nat.add(Nat.add(e, x5), l)} == U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), _, Nat.add(d, Nat.add(x4, k)), Nat.add(e, Nat.add(x5, l))} : U.Totals}
      %Equal.sym(Nat, Nat.add(d, Nat.add(x4, k)), Nat.add(Nat.add(d, x4), k), add_assoc(d, x4, k)) : {U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), Nat.add(Nat.add(d, x4), k), Nat.add(Nat.add(e, x5), l)} == U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), _, Nat.add(e, Nat.add(x5, l))} : U.Totals}
      %Equal.sym(Nat, Nat.add(e, Nat.add(x5, l)), Nat.add(Nat.add(e, x5), l), add_assoc(e, x5, l)) : {U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), Nat.add(Nat.add(d, x4), k), Nat.add(Nat.add(e, x5), l)} == U.Totals{Nat.add(Nat.add(a, x1), f), Nat.add(Nat.add(b, x2), g), Nat.add(Nat.add(c, x3), h), Nat.add(Nat.add(d, x4), k), _} : U.Totals}
      {==}

def plus_step(i: Maybe<&2, Nat>, o: Maybe<&2, Nat>, +a: Nat, +b: Nat, +c: Nat, +d: Nat, +e: Nat, +er: U.Totals, -x: U.Totals,
  ih: {x == Merge(U.Totals{Nat.add(a, U.or0(i)), Nat.add(b, U.or0(o)), Nat.add(c, U.unknown(i)), Nat.add(d, U.unknown(o)), Nat.add(e, U.unknown2(i, o))}, er) : U.Totals})
  -> {x == Merge(U.Totals{a, b, c, d, e}, Laws.Plus(i, o, er)) : U.Totals}:
  match i o:
    case None{} None{}:
      Equal.trans(U.Totals, x, Merge(U.Totals{Nat.add(a, 0n), Nat.add(b, 0n), Nat.add(c, 1n), Nat.add(d, 1n), Nat.add(e, 1n)}, er), Merge(U.Totals{a, b, c, d, e}, Laws.AddTo(0n, 0n, 1n, 1n, 1n, er)),
        ih, merge_step(a, b, c, d, e, 0n, 0n, 1n, 1n, 1n, er))
    case None{} Some{m}:
      Equal.trans(U.Totals, x, Merge(U.Totals{Nat.add(a, 0n), Nat.add(b, m), Nat.add(c, 1n), Nat.add(d, 0n), Nat.add(e, 1n)}, er), Merge(U.Totals{a, b, c, d, e}, Laws.AddTo(0n, m, 1n, 0n, 1n, er)),
        ih, merge_step(a, b, c, d, e, 0n, m, 1n, 0n, 1n, er))
    case Some{n} None{}:
      Equal.trans(U.Totals, x, Merge(U.Totals{Nat.add(a, n), Nat.add(b, 0n), Nat.add(c, 0n), Nat.add(d, 1n), Nat.add(e, 1n)}, er), Merge(U.Totals{a, b, c, d, e}, Laws.AddTo(n, 0n, 0n, 1n, 1n, er)),
        ih, merge_step(a, b, c, d, e, n, 0n, 0n, 1n, 1n, er))
    case Some{n} Some{m}:
      Equal.trans(U.Totals, x, Merge(U.Totals{Nat.add(a, n), Nat.add(b, m), Nat.add(c, 0n), Nat.add(d, 0n), Nat.add(e, 0n)}, er), Merge(U.Totals{a, b, c, d, e}, Laws.AddTo(n, m, 0n, 0n, 0n, er)),
        ih, merge_step(a, b, c, d, e, n, m, 0n, 0n, 0n, er))

def go_spec(cs: +List<U.Call>, t: U.Totals) -> {U.totals.go(cs, t) == Merge(t, Laws.ExpectedTotals(cs)) : U.Totals}:
  match cs:
    case Nil{}:
      merge_nil(t)
    case U.Call{b, +i, +o} <> +rest:
      match b:
        case False{}:
          go_spec(rest, t)
        case True{}:
          match t:
            case U.Totals{+ta, +tb, +tc, +td, +te}:
              plus_step(i, o, ta, tb, tc, td, te, Laws.ExpectedTotals(rest),
                U.totals.go(rest, U.Totals{Nat.add(ta, U.or0(i)), Nat.add(tb, U.or0(o)), Nat.add(tc, U.unknown(i)), Nat.add(td, U.unknown(o)), Nat.add(te, U.unknown2(i, o))}),
                go_spec(rest, U.Totals{Nat.add(ta, U.or0(i)), Nat.add(tb, U.or0(o)), Nat.add(tc, U.unknown(i)), Nat.add(td, U.unknown(o)), Nat.add(te, U.unknown2(i, o))}))

def Laws.usage_totals_count_unknown_apart(cs):
  Equal.trans(U.Totals, U.totals.go(cs, U.Totals{0n, 0n, 0n, 0n, 0n}), Merge(U.Totals{0n, 0n, 0n, 0n, 0n}, Laws.ExpectedTotals(cs)), Laws.ExpectedTotals(cs),
    go_spec(cs, U.Totals{0n, 0n, 0n, 0n, 0n}), merge_zero(Laws.ExpectedTotals(cs)))

def cmp_lt_le(c: Cmp, e: {Cmp.is_lt(c) == True{} : Bool}) -> {Cmp.is_le(c) == True{} : Bool}:
  match c:
    case LT{}:
      {==}
    case EQ{}:
      {==}
    case GT{}:
      e

def lt_imp_le(a: Nat, b: Nat, e: {Nat.is_lt(a, b) == True{} : Bool}) -> {Nat.is_le(a, b) == True{} : Bool}:
  cmp_lt_le(Nat.cmp(a, b), e)

def cmp_gt_false_le(c: Cmp, e: {Cmp.is_gt(c) == False{} : Bool}) -> {Cmp.is_le(c) == True{} : Bool}:
  match c:
    case LT{}:
      {==}
    case EQ{}:
      {==}
    case GT{}:
      Equal.sym(Bool, True{}, False{}, e)

def gt_false_le(a: Nat, b: Nat, e: {Nat.is_gt(a, b) == False{} : Bool}) -> {Nat.is_le(a, b) == True{} : Bool}:
  cmp_gt_false_le(Nat.cmp(a, b), e)

def cmp_lt_false_ge(c: Cmp, e: {Cmp.is_lt(c) == False{} : Bool}) -> {Cmp.is_ge(c) == True{} : Bool}:
  match c:
    case LT{}:
      Equal.sym(Bool, True{}, False{}, e)
    case EQ{}:
      {==}
    case GT{}:
      {==}

def lt_false_ge(a: Nat, b: Nat, e: {Nat.is_lt(a, b) == False{} : Bool}) -> {Nat.is_ge(a, b) == True{} : Bool}:
  cmp_lt_false_ge(Nat.cmp(a, b), e)

def ge_le(a: Nat, b: Nat, e: {Nat.is_ge(a, b) == True{} : Bool}) -> {Nat.is_le(b, a) == True{} : Bool}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bb:
      e
    case 1n+aa 0n:
      {==}
    case 1n+aa 1n+bb:
      ge_le(aa, bb, e)

def gt_lt(a: Nat, b: Nat, e: {Nat.is_gt(a, b) == True{} : Bool}) -> {Nat.is_lt(b, a) == True{} : Bool}:
  match a b:
    case 0n 0n:
      e
    case 0n 1n+bb:
      e
    case 1n+aa 0n:
      {==}
    case 1n+aa 1n+bb:
      gt_lt(aa, bb, e)

def le_trans(a: Nat, b: Nat, c: Nat, e1: {Nat.is_le(a, b) == True{} : Bool}, e2: {Nat.is_le(b, c) == True{} : Bool}) -> {Nat.is_le(a, c) == True{} : Bool}:
  match a b c:
    case 0n 0n 0n:
      {==}
    case 0n 0n 1n+cc:
      {==}
    case 0n 1n+bb 0n:
      {==}
    case 0n 1n+bb 1n+cc:
      {==}
    case 1n+aa 0n 0n:
      e1
    case 1n+aa 0n 1n+cc:
      Empty.absurd({Nat.is_le(aa, cc) == True{} : Bool}, ft(e1))
    case 1n+aa 1n+bb 0n:
      e2
    case 1n+aa 1n+bb 1n+cc:
      le_trans(aa, bb, cc, e1, e2)

def lt_le_trans(a: Nat, b: Nat, c: Nat, e1: {Nat.is_lt(a, b) == True{} : Bool}, e2: {Nat.is_le(b, c) == True{} : Bool}) -> {Nat.is_lt(a, c) == True{} : Bool}:
  match a b c:
    case 0n 0n 0n:
      e1
    case 0n 0n 1n+cc:
      {==}
    case 0n 1n+bb 0n:
      e2
    case 0n 1n+bb 1n+cc:
      {==}
    case 1n+aa 0n 0n:
      e1
    case 1n+aa 0n 1n+cc:
      Empty.absurd({Nat.is_lt(aa, cc) == True{} : Bool}, ft(e1))
    case 1n+aa 1n+bb 0n:
      e2
    case 1n+aa 1n+bb 1n+cc:
      lt_le_trans(aa, bb, cc, e1, e2)

def rev_in.k(+p: Nat, +a: Nat, +b: Nat, -c: Nat, -d: Nat, -f: Nat, -w: Bool, -rest: +List<S.Group>, -ys: +List<S.Group>,
  r: Laws.InGroups(p, rest) | Laws.InGroups(p, S.Group{a, b, c, d, f, w} <> ys))
  -> Laws.InGroups(p, S.Group{a, b, c, d, f, w} <> rest) | Laws.InGroups(p, ys):
  match r:
    case Inl{x}:
      Inl{Inr{x}}
    case Inr{y}:
      match y:
        case Inl{v}:
          Inl{Inl{v}}
        case Inr{z}:
          Inr{z}

def rev_in(xs: +List<S.Group>, +ys: +List<S.Group>, +p: Nat, h: Laws.InGroups(p, S.rev.groups(xs, ys))) -> Laws.InGroups(p, xs) | Laws.InGroups(p, ys):
  match xs:
    case Nil{}:
      Inr{h}
    case S.Group{+a, +b, +c, +d, +f, +w} <> +rest:
      rev_in.k(p, a, b, c, d, f, w, rest, ys, rev_in(rest, S.Group{a, b, c, d, f, w} <> ys, p, h))

def rev_out.k(+p: Nat, +a: Nat, +b: Nat, -c: Nat, -d: Nat, -f: Nat, -w: Bool, -rest: +List<S.Group>, -ys: +List<S.Group>,
  h: Laws.InGroups(p, S.Group{a, b, c, d, f, w} <> rest) | Laws.InGroups(p, ys))
  -> Laws.InGroups(p, rest) | Laws.InGroups(p, S.Group{a, b, c, d, f, w} <> ys):
  match h:
    case Inl{x}:
      match x:
        case Inl{v}:
          Inr{Inl{v}}
        case Inr{r}:
          Inl{r}
    case Inr{y}:
      Inr{Inr{y}}

def rev_out(xs: +List<S.Group>, +ys: +List<S.Group>, +p: Nat, h: Laws.InGroups(p, xs) | Laws.InGroups(p, ys)) -> Laws.InGroups(p, S.rev.groups(xs, ys)):
  match xs:
    case Nil{}:
      match h:
        case Inl{x}:
          match x:
        case Inr{y}:
          y
    case S.Group{+a, +b, +c, +d, +f, +w} <> +rest:
      rev_out(rest, S.Group{a, b, c, d, f, w} <> ys, p, rev_out.k(p, a, b, c, d, f, w, rest, ys, h))

def only.gt_lt(+p: Nat, +sa: Nat, +sb: Nat, +ga: Nat, +gb: Nat, -gc: Nat, -gd: Nat, -gf: Nat, -gw: Bool, -rest: +List<S.Group>, lt: Bool,
  el: {Nat.is_lt(p, gb) == lt : Bool}, ef: {Nat.is_ge(sa, gb) == False{} : Bool},
  wl: {Nat.is_le(ga, p) == True{} : Bool}, wr: {Nat.is_lt(p, sb) == True{} : Bool})
  -> Laws.Within(p, sa, sb) | Laws.InGroups(p, S.Group{ga, gb, gc, gd, gf, gw} <> rest):
  match lt:
    case True{}:
      Inr{Inl{(wl, el)}}
    case False{}:
      Inl{(lt_imp_le(sa, p, lt_le_trans(sa, gb, p, ge_false_lt(sa, gb, ef), ge_le(p, gb, lt_false_ge(p, gb, el)))), wr)}

def only.gt(+p: Nat, +sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, -si: Nat, +ga: Nat, +gb: Nat, -gc: Nat, -gd: Nat, -gf: Nat, -gw: Bool, -rest: +List<S.Group>,
  gt: Bool, ef: {Nat.is_ge(sa, gb) == False{} : Bool}, h: Laws.InGroups(p, S.absorb(S.Group{ga, gb, gc, gd, gf, gw}, S.Raw{sa, sb, sc, sd, si}, gt) <> rest))
  -> Laws.Within(p, sa, sb) | Laws.InGroups(p, S.Group{ga, gb, gc, gd, gf, gw} <> rest):
  match gt:
    case True{}:
      match h:
        case Inl{w}:
          (wl, wr) = w
          only.gt_lt(p, sa, sb, ga, gb, gc, gd, gf, gw, rest, Nat.is_lt(p, gb), {==}, ef, wl, wr)
        case Inr{r}:
          Inr{Inr{r}}
    case False{}:
      Inr{h}

def only.fresh(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +ga: Nat, +gb: Nat, +gc: Nat, +gd: Nat, +gf: Nat, +gw: Bool, +rest: +List<S.Group>,
  fresh: Bool, ef: {Nat.is_ge(sa, gb) == fresh : Bool}, h: Laws.InGroups(p, S.step.at(S.Raw{sa, sb, sc, sd, si}, S.Group{ga, gb, gc, gd, gf, gw}, rest, fresh)))
  -> Laws.Within(p, sa, sb) | Laws.InGroups(p, S.Group{ga, gb, gc, gd, gf, gw} <> rest):
  match fresh:
    case True{}:
      h
    case False{}:
      only.gt(p, sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_gt(sb, gb), ef, h)

def step_only(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, acc: +List<S.Group>, h: Laws.InGroups(p, S.step(S.Raw{sa, sb, sc, sd, si}, acc)))
  -> Laws.Within(p, sa, sb) | Laws.InGroups(p, acc):
  match acc:
    case Nil{}:
      match h:
        case Inl{w}:
          Inl{w}
        case Inr{x}:
          match x:
    case S.Group{+ga, +gb, +gc, +gd, +gf, +gw} <> +rest:
      only.fresh(p, sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_ge(sa, gb), {==}, h)

def go_only.nil(acc: +List<S.Group>, +p: Nat, h: Laws.InGroups(p, acc) | Laws.InGroups(p, Nil{})) -> Laws.InRaws(p, Nil{}) | Laws.InGroups(p, acc):
  match h:
    case Inl{a}:
      Inr{a}
    case Inr{x}:
      match x:

def go_only.cons2(+p: Nat, +sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, -si: Nat, -rest: +List<S.Raw>, -acc: +List<S.Group>, h: Laws.Within(p, sa, sb) | Laws.InGroups(p, acc))
  -> Laws.InRaws(p, S.Raw{sa, sb, sc, sd, si} <> rest) | Laws.InGroups(p, acc):
  match h:
    case Inl{w}:
      Inl{Inl{w}}
    case Inr{a}:
      Inr{a}

def go_only.cons(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, -rest: +List<S.Raw>, +acc: +List<S.Group>,
  h: Laws.InRaws(p, rest) | Laws.InGroups(p, S.step(S.Raw{sa, sb, sc, sd, si}, acc)))
  -> Laws.InRaws(p, S.Raw{sa, sb, sc, sd, si} <> rest) | Laws.InGroups(p, acc):
  match h:
    case Inl{r}:
      Inl{Inr{r}}
    case Inr{st}:
      go_only.cons2(p, sa, sb, sc, sd, si, rest, acc, step_only(p, sa, sb, sc, sd, si, acc, st))

def go_only(xs: +List<S.Raw>, +acc: +List<S.Group>, +p: Nat, h: Laws.InGroups(p, S.merge.go(xs, acc))) -> Laws.InRaws(p, xs) | Laws.InGroups(p, acc):
  match xs:
    case Nil{}:
      go_only.nil(acc, p, rev_in(acc, Nil{}, p, h))
    case S.Raw{+sa, +sb, +sc, +sd, +si} <> +rest:
      go_only.cons(p, sa, sb, sc, sd, si, rest, acc, go_only(rest, S.step(S.Raw{sa, sb, sc, sd, si}, acc), p, h))

def only.top(+p: Nat, -xs: +List<S.Raw>, h: Laws.InRaws(p, xs) | Laws.InGroups(p, Nil{})) -> Laws.InRaws(p, xs):
  match h:
    case Inl{r}:
      r
    case Inr{x}:
      match x:

def Laws.spans_mask_only_finding_bytes(xs, p, h):
  only.top(p, xs, go_only(xs, Nil{}, p, h))

def HeadLe(acc: +List<S.Group>, x: Nat) -> Type:
  match acc:
    case Nil{}:
      Unit
    case S.Group{a, b, c, d, f, w} <> rest:
      {Nat.is_le(a, x) == True{} : Bool}

def Chain(acc: +List<S.Group>, xs: +List<S.Raw>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case S.Raw{+s, e, c, d, i} <> rest:
      (HeadLe(acc, s) & HeadLe(acc, s)) & Laws.SortedFrom(s, rest)

def keeps.gt(+p: Nat, +sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, -si: Nat, +ga: Nat, +gb: Nat, -gc: Nat, -gd: Nat, -gf: Nat, -gw: Bool, -rest: +List<S.Group>,
  gt: Bool, eg: {Nat.is_gt(sb, gb) == gt : Bool}, h: Laws.InGroups(p, S.Group{ga, gb, gc, gd, gf, gw} <> rest))
  -> Laws.InGroups(p, S.absorb(S.Group{ga, gb, gc, gd, gf, gw}, S.Raw{sa, sb, sc, sd, si}, gt) <> rest):
  match gt:
    case True{}:
      match h:
        case Inl{w}:
          (wl, wr) = w
          Inl{(wl, lt_le_trans(p, gb, sb, wr, lt_imp_le(gb, sb, gt_lt(sb, gb, eg))))}
        case Inr{r}:
          Inr{r}
    case False{}:
      h

def keeps.fresh(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +ga: Nat, +gb: Nat, +gc: Nat, +gd: Nat, +gf: Nat, +gw: Bool, +rest: +List<S.Group>,
  fresh: Bool, h: Laws.InGroups(p, S.Group{ga, gb, gc, gd, gf, gw} <> rest))
  -> Laws.InGroups(p, S.step.at(S.Raw{sa, sb, sc, sd, si}, S.Group{ga, gb, gc, gd, gf, gw}, rest, fresh)):
  match fresh:
    case True{}:
      Inr{h}
    case False{}:
      keeps.gt(p, sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_gt(sb, gb), {==}, h)

def step_keeps(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, acc: +List<S.Group>, h: Laws.InGroups(p, acc)) -> Laws.InGroups(p, S.step(S.Raw{sa, sb, sc, sd, si}, acc)):
  match acc:
    case Nil{}:
      match h:
    case S.Group{+ga, +gb, +gc, +gd, +gf, +gw} <> +rest:
      keeps.fresh(p, sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_ge(sa, gb), h)

def covers.gt(+p: Nat, +sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, -si: Nat, +ga: Nat, +gb: Nat, -gc: Nat, -gd: Nat, -gf: Nat, -gw: Bool, -rest: +List<S.Group>,
  gt: Bool, eg: {Nat.is_gt(sb, gb) == gt : Bool}, start: {Nat.is_le(ga, p) == True{} : Bool}, wr: {Nat.is_lt(p, sb) == True{} : Bool})
  -> Laws.InGroups(p, S.absorb(S.Group{ga, gb, gc, gd, gf, gw}, S.Raw{sa, sb, sc, sd, si}, gt) <> rest):
  match gt:
    case True{}:
      Inl{(start, wr)}
    case False{}:
      Inl{(start, lt_le_trans(p, sb, gb, wr, gt_false_le(sb, gb, eg)))}

def covers.fresh(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +ga: Nat, +gb: Nat, +gc: Nat, +gd: Nat, +gf: Nat, +gw: Bool, +rest: +List<S.Group>,
  fresh: Bool, w: Laws.Within(p, sa, sb), hd: {Nat.is_le(ga, sa) == True{} : Bool})
  -> Laws.InGroups(p, S.step.at(S.Raw{sa, sb, sc, sd, si}, S.Group{ga, gb, gc, gd, gf, gw}, rest, fresh)):
  match fresh:
    case True{}:
      Inl{w}
    case False{}:
      (wl, wr) = w
      covers.gt(p, sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_gt(sb, gb), {==}, le_trans(ga, sa, p, hd, wl), wr)

def step_covers(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, acc: +List<S.Group>, w: Laws.Within(p, sa, sb), hd: HeadLe(acc, sa))
  -> Laws.InGroups(p, S.step(S.Raw{sa, sb, sc, sd, si}, acc)):
  match acc:
    case Nil{}:
      Inl{w}
    case S.Group{+ga, +gb, +gc, +gd, +gf, +gw} <> +rest:
      covers.fresh(p, sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_ge(sa, gb), w, hd)

def head.gt(+sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, -si: Nat, +ga: Nat, +gb: Nat, -gc: Nat, -gd: Nat, -gf: Nat, -gw: Bool, -rest: +List<S.Group>, -nxt: Nat,
  gt: Bool, le: {Nat.is_le(ga, nxt) == True{} : Bool})
  -> HeadLe(S.absorb(S.Group{ga, gb, gc, gd, gf, gw}, S.Raw{sa, sb, sc, sd, si}, gt) <> rest, nxt):
  match gt:
    case True{}:
      le
    case False{}:
      le

def head.fresh(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +ga: Nat, +gb: Nat, +gc: Nat, +gd: Nat, +gf: Nat, +gw: Bool, +rest: +List<S.Group>, +nxt: Nat,
  fresh: Bool, hd: {Nat.is_le(ga, sa) == True{} : Bool}, le: {Nat.is_le(sa, nxt) == True{} : Bool})
  -> HeadLe(S.step.at(S.Raw{sa, sb, sc, sd, si}, S.Group{ga, gb, gc, gd, gf, gw}, rest, fresh), nxt):
  match fresh:
    case True{}:
      le
    case False{}:
      head.gt(sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, nxt, Nat.is_gt(sb, gb), le_trans(ga, sa, nxt, hd, le))

def head_after(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, acc: +List<S.Group>, hd: HeadLe(acc, sa), +nxt: Nat, le: {Nat.is_le(sa, nxt) == True{} : Bool})
  -> HeadLe(S.step(S.Raw{sa, sb, sc, sd, si}, acc), nxt):
  match acc:
    case Nil{}:
      le
    case S.Group{+ga, +gb, +gc, +gd, +gf, +gw} <> +rest:
      head.fresh(sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, nxt, Nat.is_ge(sa, gb), hd, le)

def dup_head(acc: +List<S.Group>, +x: Nat, h: HeadLe(acc, x)) -> HeadLe(acc, x) & HeadLe(acc, x):
  match acc:
    case Nil{}:
      (Unit{}, Unit{})
    case S.Group{a, b, c, d, f, w} <> rest:
      dup_b(Nat.is_le(a, x), True{}, h)

def chain_next(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +acc: +List<S.Group>, rest: +List<S.Raw>, hd: HeadLe(acc, sa), sf: Laws.SortedFrom(sa, rest))
  -> Chain(S.step(S.Raw{sa, sb, sc, sd, si}, acc), rest):
  match rest:
    case Nil{}:
      Unit{}
    case S.Raw{+s2, e2, c2, d2, i2} <> rest2:
      (le, sf2) = sf
      (dup_head(S.step(S.Raw{sa, sb, sc, sd, si}, acc), s2, head_after(sa, sb, sc, sd, si, acc, hd, s2, le)), sf2)

def covers.k(+p: Nat, +sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +acc: +List<S.Group>, -rest: +List<S.Raw>, hd: HeadLe(acc, sa),
  h: Laws.InRaws(p, S.Raw{sa, sb, sc, sd, si} <> rest) | Laws.InGroups(p, acc))
  -> Laws.InRaws(p, rest) | Laws.InGroups(p, S.step(S.Raw{sa, sb, sc, sd, si}, acc)):
  match h:
    case Inl{x}:
      match x:
        case Inl{w}:
          Inr{step_covers(p, sa, sb, sc, sd, si, acc, w, hd)}
        case Inr{r}:
          Inl{r}
    case Inr{a}:
      Inr{step_keeps(p, sa, sb, sc, sd, si, acc, a)}

def covers.nil(acc: +List<S.Group>, +p: Nat, h: Laws.InRaws(p, Nil{}) | Laws.InGroups(p, acc)) -> Laws.InGroups(p, acc) | Laws.InGroups(p, Nil{}):
  match h:
    case Inl{x}:
      match x:
    case Inr{a}:
      Inl{a}

def go_covers(xs: +List<S.Raw>, +acc: +List<S.Group>, +p: Nat, c: Chain(acc, xs), h: Laws.InRaws(p, xs) | Laws.InGroups(p, acc)) -> Laws.InGroups(p, S.merge.go(xs, acc)):
  match xs:
    case Nil{}:
      rev_out(acc, Nil{}, p, covers.nil(acc, p, h))
    case S.Raw{+sa, +sb, +sc, +sd, +si} <> +rest:
      (hh, sf) = c
      (hd1, hd2) = hh
      go_covers(rest, S.step(S.Raw{sa, sb, sc, sd, si}, acc), p, chain_next(sa, sb, sc, sd, si, acc, rest, hd1, sf), covers.k(p, sa, sb, sc, sd, si, acc, rest, hd2, h))

def chain0(xs: +List<S.Raw>, sorted: Laws.Sorted(xs)) -> Chain(Nil{}, xs):
  match xs:
    case Nil{}:
      Unit{}
    case S.Raw{s, e, c, d, i} <> rest:
      ((Unit{}, Unit{}), sorted)

def Laws.spans_mask_every_finding_byte(xs, sorted, p, h):
  go_covers(xs, Nil{}, p, chain0(xs, sorted), Inl{h})

def RevApart(acc: +List<S.Group>) -> Type:
  match acc:
    case Nil{}:
      Unit
    case S.Group{+a, b, c, d, f, w} <> rest:
      match rest:
        case Nil{}:
          Unit
        case S.Group{a2, +b2, c2, d2, f2, w2} <> r2:
          {Nat.is_le(b2, a) == True{} : Bool} & RevApart(S.Group{a2, b2, c2, d2, f2, w2} <> r2)

def apart.same(+ga: Nat, -gb: Nat, -gc: Nat, -gd: Nat, -gf: Nat, -gw: Bool, -nb: Nat, -nc: Nat, -nd: Nat, -nw: Bool, rest: +List<S.Group>,
  ra: RevApart(S.Group{ga, gb, gc, gd, gf, gw} <> rest)) -> RevApart(S.Group{ga, nb, nc, nd, gf, nw} <> rest):
  match rest:
    case Nil{}:
      Unit{}
    case S.Group{a2, b2, c2, d2, f2, w2} <> r2:
      ra

def apart.gt(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, -si: Nat, +ga: Nat, +gb: Nat, +gc: Nat, +gd: Nat, +gf: Nat, +gw: Bool, +rest: +List<S.Group>,
  gt: Bool, ra: RevApart(S.Group{ga, gb, gc, gd, gf, gw} <> rest))
  -> RevApart(S.absorb(S.Group{ga, gb, gc, gd, gf, gw}, S.Raw{sa, sb, sc, sd, si}, gt) <> rest):
  match gt:
    case True{}:
      apart.same(ga, gb, gc, gd, gf, gw, sb, Nat.min(gc, sc), Nat.max(gd, sd), True{}, rest, ra)
    case False{}:
      apart.same(ga, gb, gc, gd, gf, gw, gb, Nat.min(gc, sc), Nat.max(gd, sd), gw, rest, ra)

def apart.fresh(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, +ga: Nat, +gb: Nat, +gc: Nat, +gd: Nat, +gf: Nat, +gw: Bool, +rest: +List<S.Group>,
  fresh: Bool, ef: {Nat.is_ge(sa, gb) == fresh : Bool}, ra: RevApart(S.Group{ga, gb, gc, gd, gf, gw} <> rest))
  -> RevApart(S.step.at(S.Raw{sa, sb, sc, sd, si}, S.Group{ga, gb, gc, gd, gf, gw}, rest, fresh)):
  match fresh:
    case True{}:
      (ge_le(sa, gb, ef), ra)
    case False{}:
      apart.gt(sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_gt(sb, gb), ra)

def step_apart(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +si: Nat, acc: +List<S.Group>, ra: RevApart(acc)) -> RevApart(S.step(S.Raw{sa, sb, sc, sd, si}, acc)):
  match acc:
    case Nil{}:
      Unit{}
    case S.Group{+ga, +gb, +gc, +gd, +gf, +gw} <> +rest:
      apart.fresh(sa, sb, sc, sd, si, ga, gb, gc, gd, gf, gw, rest, Nat.is_ge(sa, gb), {==}, ra)

def Link(acc: +List<S.Group>, ys: +List<S.Group>) -> Type:
  match acc:
    case Nil{}:
      Unit
    case S.Group{a, +b, c, d, f, w} <> rest:
      match ys:
        case Nil{}:
          Unit
        case S.Group{a2, b2, c2, d2, f2, w2} <> r:
          {Nat.is_le(b, a2) == True{} : Bool}

def apart_cons(+a: Nat, +b: Nat, -c: Nat, -d: Nat, -f: Nat, -w: Bool, -rest: +List<S.Group>, ys: +List<S.Group>,
  lk: Link(S.Group{a, b, c, d, f, w} <> rest, ys), ay: Laws.Apart(ys)) -> Laws.Apart(S.Group{a, b, c, d, f, w} <> ys):
  match ys:
    case Nil{}:
      Unit{}
    case S.Group{a2, b2, c2, d2, f2, w2} <> r:
      (lk, ay)

def next_pair(+a: Nat, -b: Nat, -c: Nat, -d: Nat, -f: Nat, -w: Bool, rest: +List<S.Group>, -ys: +List<S.Group>, ra: RevApart(S.Group{a, b, c, d, f, w} <> rest))
  -> RevApart(rest) & Link(rest, S.Group{a, b, c, d, f, w} <> ys):
  match rest:
    case Nil{}:
      (Unit{}, Unit{})
    case S.Group{a2, b2, c2, d2, f2, w2} <> r2:
      (le, ra2) = ra
      (ra2, le)

def rev_apart(acc: +List<S.Group>, +ys: +List<S.Group>, pr: RevApart(acc) & Link(acc, ys), ay: Laws.Apart(ys)) -> Laws.Apart(S.rev.groups(acc, ys)):
  match acc:
    case Nil{}:
      ay
    case S.Group{+a, +b, +c, +d, +f, +w} <> +rest:
      (ra, lk) = pr
      rev_apart(rest, S.Group{a, b, c, d, f, w} <> ys, next_pair(a, b, c, d, f, w, rest, ys, ra), apart_cons(a, b, c, d, f, w, rest, ys, lk, ay))

def pair_nil(acc: +List<S.Group>, ra: RevApart(acc)) -> RevApart(acc) & Link(acc, Nil{}):
  match acc:
    case Nil{}:
      (ra, Unit{})
    case S.Group{a, b, c, d, f, w} <> rest:
      (ra, Unit{})

def go_apart(xs: +List<S.Raw>, +acc: +List<S.Group>, ra: RevApart(acc)) -> Laws.Apart(S.merge.go(xs, acc)):
  match xs:
    case Nil{}:
      rev_apart(acc, Nil{}, pair_nil(acc, ra), Unit{})
    case S.Raw{+sa, +sb, +sc, +sd, +si} <> rest:
      go_apart(rest, S.step(S.Raw{sa, sb, sc, sd, si}, acc), step_apart(sa, sb, sc, sd, si, acc, ra))

def Laws.spans_groups_are_apart(xs):
  go_apart(xs, Nil{}, Unit{})

def q.srev(xs: +List<P.Span>, ys: +List<P.Span>) -> List<&2, P.Span>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      q.srev(rest, x <> ys)

def q.sapp(xs: +List<P.Span>, ys: +List<P.Span>) -> List<&2, P.Span>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      x <> q.sapp(rest, ys)

def q.srev2(xs: +List<P.Span>, +ys: +List<P.Span>, +zs: +List<P.Span>) -> {q.srev(q.srev(xs, ys), zs) == q.srev(ys, q.sapp(xs, zs)) : List<&2, P.Span>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      q.srev2(rest, x <> ys, zs)

def q.sapp_nil(xs: +List<P.Span>) -> {q.sapp(xs, Nil{}) == xs : List<&2, P.Span>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %q.sapp_nil(rest) : {x <> q.sapp(rest, Nil{}) == x <> _ : List<&2, P.Span>}
      {==}

def q.srev_srev(+xs: +List<P.Span>) -> {q.srev(q.srev(xs, Nil{}), Nil{}) == xs : List<&2, P.Span>}:
  Equal.trans(List<&2, P.Span>, q.srev(q.srev(xs, Nil{}), Nil{}), q.sapp(xs, Nil{}), xs, q.srev2(xs, Nil{}, Nil{}), q.sapp_nil(xs))

def q.mspans_rev(ms: +List<P.Mark>, +acc: +List<P.Mark>) -> {Laws.SpansOf(P.rev.go(ms, acc)) == q.srev(Laws.SpansOf(ms), Laws.SpansOf(acc)) : List<&2, P.Span>}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{+s, +t}, +rest}:
      q.mspans_rev(rest, P.Mark{s, t} <> acc)

def q.walk_at_spans(s: P.Span, cb: List<&2, Nat> & List<&2, Nat>, +acc: +List<P.Mark>) -> {Laws.SpansOf(P.walk.acc(P.walk.at(s, cb, acc))) == s <> Laws.SpansOf(acc) : List<&2, P.Span>}:
  match s:
    case P.Span{a, b, c, d}:
      match cb:
        case (k, bs):
          {==}

def q.step_spans(s: P.Span, w: P.Walk) -> {Laws.SpansOf(P.walk.acc(P.walk.step(s, w))) == s <> Laws.SpansOf(P.walk.acc(w)) : List<&2, P.Span>}:
  match s w:
    case P.Span{+a, +b, +c, +d} P.Walk{+k, +bs, +acc}:
      q.walk_at_spans(P.Span{a, b, c, d}, P.adv(bs, a, k), acc)

def q.walk_spans(ss: +List<P.Span>, +w: P.Walk) -> {Laws.SpansOf(P.walk.go(ss, w)) == q.srev(ss, Laws.SpansOf(P.walk.acc(w))) : List<&2, P.Span>}:
  match ss:
    case Nil{}:
      {==}
    case Con{+s, +rest}:
      %q.step_spans(s, w) : {Laws.SpansOf(P.walk.go(rest, P.walk.step(s, w))) == q.srev(rest, _) : List<&2, P.Span>}
      q.walk_spans(rest, P.walk.step(s, w))

def q.nacc(n: P.Near) -> List<&2, P.Mark>:
  match n:
    case P.Near{at, g, acc}:
      acc

def q.ngrew(n: P.Near) -> Bool:
  match n:
    case P.Near{at, g, acc}:
      g

def q.pms(p: P.Pass) -> List<&2, P.Mark>:
  match p:
    case P.Pass{ms, g}:
      ms

def q.pgrew(p: P.Pass) -> Bool:
  match p:
    case P.Pass{ms, g}:
      g

def q.near_at_spans(+s: P.Span, at: Maybe<&2, P.Span>, g: Bool, +acc: +List<P.Mark>, e: Bool) -> {Laws.SpansOf(q.nacc(P.near.at(s, at, g, acc, e))) == s <> Laws.SpansOf(acc) : List<&2, P.Span>}:
  match e:
    case True{}:
      {==}
    case False{}:
      {==}

def q.back_step_spans(+s: P.Span, +t: Bool, n: P.Near) -> {Laws.SpansOf(q.nacc(P.back.step(P.Mark{s, t}, n))) == s <> Laws.SpansOf(q.nacc(n)) : List<&2, P.Span>}:
  match t n:
    case True{} P.Near{at, g, acc}:
      {==}
    case False{} P.Near{+at, g, +acc}:
      q.near_at_spans(s, at, g, acc, P.after(at, s))

def q.fwd_step_spans(+s: P.Span, +t: Bool, n: P.Near) -> {Laws.SpansOf(q.nacc(P.fwd.step(P.Mark{s, t}, n))) == s <> Laws.SpansOf(q.nacc(n)) : List<&2, P.Span>}:
  match t n:
    case True{} P.Near{at, g, acc}:
      {==}
    case False{} P.Near{+at, g, +acc}:
      q.near_at_spans(s, at, g, acc, P.before(at, s))

def q.back_spans(ms: +List<P.Mark>, +n: P.Near) -> {Laws.SpansOf(q.nacc(P.back.go(ms, n))) == q.srev(Laws.SpansOf(ms), Laws.SpansOf(q.nacc(n))) : List<&2, P.Span>}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{+s, +t}, +rest}:
      %q.back_step_spans(s, t, n) : {Laws.SpansOf(q.nacc(P.back.go(rest, P.back.step(P.Mark{s, t}, n)))) == q.srev(Laws.SpansOf(rest), _) : List<&2, P.Span>}
      q.back_spans(rest, P.back.step(P.Mark{s, t}, n))

def q.fwd_spans(ms: +List<P.Mark>, +n: P.Near) -> {Laws.SpansOf(q.nacc(P.fwd.go(ms, n))) == q.srev(Laws.SpansOf(ms), Laws.SpansOf(q.nacc(n))) : List<&2, P.Span>}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{+s, +t}, +rest}:
      %q.fwd_step_spans(s, t, n) : {Laws.SpansOf(q.nacc(P.fwd.go(rest, P.fwd.step(P.Mark{s, t}, n)))) == q.srev(Laws.SpansOf(rest), _) : List<&2, P.Span>}
      q.fwd_spans(rest, P.fwd.step(P.Mark{s, t}, n))

def q.roundend_spans(g: Bool, f: P.Near) -> {Laws.SpansOf(q.pms(P.round.end(g, f))) == Laws.SpansOf(q.nacc(f)) : List<&2, P.Span>}:
  match f:
    case P.Near{at, g2, ms}:
      {==}

def q.roundfwd_spans(b: P.Near) -> {Laws.SpansOf(q.pms(P.round.fwd(b))) == q.srev(Laws.SpansOf(q.nacc(b)), Nil{}) : List<&2, P.Span>}:
  match b:
    case P.Near{at, g, +ms}:
      Equal.trans(List<&2, P.Span>,
        Laws.SpansOf(q.pms(P.round.end(g, P.fwd.go(ms, P.Near{None{}, False{}, Nil{}})))),
        Laws.SpansOf(q.nacc(P.fwd.go(ms, P.Near{None{}, False{}, Nil{}}))),
        q.srev(Laws.SpansOf(ms), Nil{}),
        q.roundend_spans(g, P.fwd.go(ms, P.Near{None{}, False{}, Nil{}})),
        q.fwd_spans(ms, P.Near{None{}, False{}, Nil{}}))

def q.round_spans(+r: +List<P.Mark>) -> {Laws.SpansOf(q.pms(P.round(r))) == Laws.SpansOf(r) : List<&2, P.Span>}:
  +n0 = {P.Near{None{}, False{}, Nil{}} : P.Near}
  +b = Laws.SpansOf(q.nacc(P.back.go(r, n0)))
  Equal.trans(List<&2, P.Span>, Laws.SpansOf(q.pms(P.round(r))), q.srev(b, Nil{}), Laws.SpansOf(r),
    q.roundfwd_spans(P.back.go(r, n0)),
    Equal.trans(List<&2, P.Span>, q.srev(b, Nil{}), q.srev(q.srev(Laws.SpansOf(r), Nil{}), Nil{}), Laws.SpansOf(r),
      Equal.cong(List<&2, P.Span>, List<&2, P.Span>, x => q.srev(x, Nil{}), b, q.srev(Laws.SpansOf(r), Nil{}), q.back_spans(r, n0)),
      q.srev_srev(Laws.SpansOf(r))))

def q.loop_spans(u: Nat, pr: P.Pass) -> {Laws.SpansOf(P.loop(u, pr)) == Laws.SpansOf(q.pms(pr)) : List<&2, P.Span>}:
  match u pr:
    case 0n P.Pass{r, g}:
      {==}
    case 1n+v P.Pass{+r, True{}}:
      Equal.trans(List<&2, P.Span>, Laws.SpansOf(P.loop(v, P.round(r))), Laws.SpansOf(q.pms(P.round(r))), Laws.SpansOf(r), q.loop_spans(v, P.round(r)), q.round_spans(r))
    case 1n+v P.Pass{r, False{}}:
      {==}

def Laws.parts_keep_every_span_in_order(bs, ss):
  +r0 = P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})
  +l = P.loop(P.untaken.go(r0, 0n), P.Pass{r0, True{}})
  -T = List<&2, P.Span>
  Equal.trans(T, Laws.SpansOf(P.rev.go(l, Nil{})), q.srev(Laws.SpansOf(l), Nil{}), ss, q.mspans_rev(l, Nil{}),
    Equal.trans(T, q.srev(Laws.SpansOf(l), Nil{}), q.srev(Laws.SpansOf(r0), Nil{}), ss,
      Equal.cong(T, T, x => q.srev(x, Nil{}), Laws.SpansOf(l), Laws.SpansOf(r0), q.loop_spans(P.untaken.go(r0, 0n), P.Pass{r0, True{}})),
      Equal.trans(T, q.srev(Laws.SpansOf(r0), Nil{}), q.srev(q.srev(ss, Nil{}), Nil{}), ss,
        Equal.cong(T, T, x => q.srev(x, Nil{}), Laws.SpansOf(r0), q.srev(ss, Nil{}), q.walk_spans(ss, P.Walk{Nil{}, bs, Nil{}})),
        q.srev_srev(ss))))

def q.le_not_lt(a: Nat, b: Nat, e: {Nat.is_le(a, b) == True{} : Bool}) -> {Nat.is_lt(b, a) == False{} : Bool}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bb:
      {==}
    case 1n+aa 0n:
      Empty.absurd({Nat.is_lt(0n, 1n+aa) == False{} : Bool}, ft(e))
    case 1n+aa 1n+bb:
      q.le_not_lt(aa, bb, e)

def q.le_lt_trans(a: Nat, b: Nat, c: Nat, e1: {Nat.is_le(a, b) == True{} : Bool}, e2: {Nat.is_lt(b, c) == True{} : Bool}) -> {Nat.is_lt(a, c) == True{} : Bool}:
  match a b c:
    case 0n 0n 0n:
      e2
    case 0n 0n 1n+cc:
      {==}
    case 0n 1n+bb 0n:
      e2
    case 0n 1n+bb 1n+cc:
      {==}
    case 1n+aa 0n cc:
      Empty.absurd({Nat.is_lt(1n+aa, cc) == True{} : Bool}, ft(e1))
    case 1n+aa 1n+bb 0n:
      e2
    case 1n+aa 1n+bb 1n+cc:
      q.le_lt_trans(aa, bb, cc, e1, e2)

def q.lt_gt(a: Nat, b: Nat) -> {Nat.is_lt(a, b) == Nat.is_gt(b, a) : Bool}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bb:
      {==}
    case 1n+aa 0n:
      {==}
    case 1n+aa 1n+bb:
      q.lt_gt(aa, bb)

def q.and_true(x: Bool) -> {Bool.and(x, True{}) == x : Bool}:
  match x:
    case True{}:
      {==}
    case False{}:
      {==}

def q.or_swap(a: Bool, x: Bool, -b: Bool) -> {Bool.or(a, Bool.or(x, b)) == Bool.or(Bool.or(x, a), b) : Bool}:
  match a x:
    case True{} True{}:
      {==}
    case True{} False{}:
      {==}
    case False{} True{}:
      {==}
    case False{} False{}:
      {==}

def q.sym(-a: Bool, -b: Bool, e: {a == b : Bool}) -> {b == a : Bool}:
  Equal.sym(Bool, a, b, e)

def q.rapp(c: +List<Nat>, bs: +List<Nat>) -> List<&2, Nat>:
  match c:
    case Nil{}:
      bs
    case Con{x, rest}:
      q.rapp(rest, x <> bs)

def q.DescFrom(+a: Nat, c: +List<Nat>) -> Type:
  match c:
    case Nil{}:
      Unit
    case Con{+b, rest}:
      {Nat.is_le(b, a) == True{} : Bool} & q.DescFrom(b, rest)

def q.low(c: +List<Nat>) -> Nat:
  match c:
    case Nil{}:
      0n
    case Con{b, rest}:
      b

def q.Stop(bs: +List<Nat>, +x: Nat) -> Type:
  match bs:
    case Nil{}:
      Unit
    case Con{b, rest}:
      {Nat.is_le(b, x) == False{} : Bool}

def q.Exact(+bs: +List<Nat>, ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{s, t}, rest}:
      {t == Laws.CrossOf(bs, s) : Bool} & q.Exact(bs, rest)

def q.cross_rapp(c: +List<Nat>, +r: +List<Nat>, +ms: Nat, +me: Nat) -> {Laws.Crossing(q.rapp(c, r), ms, me) == Bool.or(Laws.Crossing(c, ms, me), Laws.Crossing(r, ms, me)) : Bool}:
  match c:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      Equal.trans(Bool, Laws.Crossing(q.rapp(rest, x <> r), ms, me), Bool.or(Laws.Crossing(rest, ms, me), Laws.Crossing(x <> r, ms, me)), Bool.or(Laws.Crossing(x <> rest, ms, me), Laws.Crossing(r, ms, me)),
        q.cross_rapp(rest, x <> r, ms, me),
        q.or_swap(Laws.Crossing(rest, ms, me), Bool.and(Nat.is_lt(ms, x), Nat.is_lt(x, me)), Laws.Crossing(r, ms, me)))

def q.desc_weaken(c: +List<Nat>, +a: Nat, +a2: Nat, e: {Nat.is_le(a, a2) == True{} : Bool}, d: q.DescFrom(a, c)) -> q.DescFrom(a2, c):
  match c:
    case Nil{}:
      Unit{}
    case Con{+y, +rest}:
      (h, t) = d
      (le_trans(y, a, a2, h, e), t)

def q.cross_none_le(c: +List<Nat>, +b: Nat, +ms: Nat, +me: Nat, e: {Nat.is_le(b, ms) == True{} : Bool}, d: q.DescFrom(b, c)) -> {Laws.Crossing(c, ms, me) == False{} : Bool}:
  match c:
    case Nil{}:
      {==}
    case Con{+y, +rest}:
      (h, t) = d
      +ym = le_trans(y, b, ms, h, e)
      %q.sym(Nat.is_lt(ms, y), False{}, q.le_not_lt(y, ms, ym)) : {Bool.or(Bool.and(_, Nat.is_lt(y, me)), Laws.Crossing(rest, ms, me)) == False{} : Bool}
      q.cross_none_le(rest, y, ms, me, ym, t)

def q.cross_desc.at(+y: Nat, -rest: +List<Nat>, +ms: Nat, -me: Nat, v: Bool, +ev: {Nat.is_lt(ms, y) == v : Bool}, fin: {Nat.is_lt(ms, y) == False{} : Bool} -> {Laws.Crossing(rest, ms, me) == False{} : Bool})
  -> {Bool.or(Nat.is_lt(ms, y), Laws.Crossing(rest, ms, me)) == Nat.is_gt(y, ms) : Bool}:
  match v:
    case True{}:
      %q.sym(Nat.is_lt(ms, y), True{}, ev) : {Bool.or(_, Laws.Crossing(rest, ms, me)) == Nat.is_gt(y, ms) : Bool}
      Equal.trans(Bool, True{}, Nat.is_lt(ms, y), Nat.is_gt(y, ms), q.sym(Nat.is_lt(ms, y), True{}, ev), q.lt_gt(ms, y))
    case False{}:
      %q.sym(Nat.is_lt(ms, y), False{}, ev) : {Bool.or(_, Laws.Crossing(rest, ms, me)) == Nat.is_gt(y, ms) : Bool}
      %q.sym(Laws.Crossing(rest, ms, me), False{}, fin(ev)) : {Bool.or(False{}, _) == Nat.is_gt(y, ms) : Bool}
      Equal.trans(Bool, False{}, Nat.is_lt(ms, y), Nat.is_gt(y, ms), q.sym(Nat.is_lt(ms, y), False{}, ev), q.lt_gt(ms, y))

def q.cross_desc(c: +List<Nat>, +x: Nat, +ms: Nat, +me: Nat, xe: {Nat.is_lt(x, me) == True{} : Bool}, d: q.DescFrom(x, c)) -> {Laws.Crossing(c, ms, me) == P.above(c, ms) : Bool}:
  match c:
    case Nil{}:
      {==}
    case Con{+y, +rest}:
      (+h, t) = d
      %q.sym(Nat.is_lt(y, me), True{}, q.le_lt_trans(y, x, me, h, xe)) : {Bool.or(Bool.and(Nat.is_lt(ms, y), _), Laws.Crossing(rest, ms, me)) == Nat.is_gt(y, ms) : Bool}
      %q.sym(Bool.and(Nat.is_lt(ms, y), True{}), Nat.is_lt(ms, y), q.and_true(Nat.is_lt(ms, y))) : {Bool.or(_, Laws.Crossing(rest, ms, me)) == Nat.is_gt(y, ms) : Bool}
      q.cross_desc.at(y, rest, ms, me, Nat.is_lt(ms, y), {==}, f => q.cross_none_le(rest, y, ms, me, gt_false_le(y, ms, Equal.trans(Bool, Nat.is_gt(y, ms), Nat.is_lt(ms, y), False{}, q.sym(Nat.is_lt(ms, y), Nat.is_gt(y, ms), q.lt_gt(ms, y)), f)), t))

def q.le_false_lt(a: Nat, b: Nat, e: {Nat.is_le(a, b) == False{} : Bool}) -> {Nat.is_lt(b, a) == True{} : Bool}:
  match a b:
    case 0n 0n:
      Empty.absurd({Nat.is_lt(0n, 0n) == True{} : Bool}, ft(Equal.sym(Bool, True{}, False{}, e)))
    case 0n 1n+bb:
      Empty.absurd({Nat.is_lt(1n+bb, 0n) == True{} : Bool}, ft(Equal.sym(Bool, True{}, False{}, e)))
    case 1n+aa 0n:
      {==}
    case 1n+aa 1n+bb:
      q.le_false_lt(aa, bb, e)

def q.cross_none_ge(r: +List<Nat>, +f: Nat, +ms: Nat, +me: Nat, e: {Nat.is_le(me, f) == True{} : Bool}, so: Laws.BsFrom(f, r)) -> {Laws.Crossing(r, ms, me) == False{} : Bool}:
  match r:
    case Nil{}:
      {==}
    case Con{+y, +rest}:
      (h, t) = so
      +my = le_trans(me, f, y, e, h)
      %q.sym(Nat.is_lt(y, me), False{}, q.le_not_lt(me, y, my)) : {Bool.or(Bool.and(Nat.is_lt(ms, y), _), Laws.Crossing(rest, ms, me)) == False{} : Bool}
      %q.sym(Bool.and(Nat.is_lt(ms, y), False{}), False{}, and_false(Nat.is_lt(ms, y))) : {Bool.or(_, Laws.Crossing(rest, ms, me)) == False{} : Bool}
      q.cross_none_ge(rest, y, ms, me, my, t)

def q.cross_asc.at(+f: Nat, -rest: +List<Nat>, -ms: Nat, +me: Nat, v: Bool, +ev: {Nat.is_lt(f, me) == v : Bool}, fin: {Nat.is_lt(f, me) == False{} : Bool} -> {Laws.Crossing(rest, ms, me) == False{} : Bool})
  -> {Bool.or(Nat.is_lt(f, me), Laws.Crossing(rest, ms, me)) == Nat.is_lt(f, me) : Bool}:
  match v:
    case True{}:
      %q.sym(Nat.is_lt(f, me), True{}, ev) : {Bool.or(_, Laws.Crossing(rest, ms, me)) == _ : Bool}
      {==}
    case False{}:
      %q.sym(Nat.is_lt(f, me), False{}, ev) : {Bool.or(_, Laws.Crossing(rest, ms, me)) == _ : Bool}
      fin(ev)

def q.cross_asc(r: +List<Nat>, +a: Nat, +x: Nat, +ms: Nat, +me: Nat, so: Laws.BsFrom(a, r), st: q.Stop(r, x), mx: {Nat.is_le(ms, x) == True{} : Bool}) -> {Laws.Crossing(r, ms, me) == P.below(r, me) : Bool}:
  match r:
    case Nil{}:
      {==}
    case Con{+f, +rest}:
      (h, t) = so
      %q.sym(Nat.is_lt(ms, f), True{}, q.le_lt_trans(ms, x, f, mx, q.le_false_lt(f, x, st))) : {Bool.or(Bool.and(_, Nat.is_lt(f, me)), Laws.Crossing(rest, ms, me)) == Nat.is_lt(f, me) : Bool}
      q.cross_asc.at(f, rest, ms, me, Nat.is_lt(f, me), {==}, n => q.cross_none_ge(rest, f, ms, me, ge_le(f, me, lt_false_ge(f, me, n)), t))

def q.desc_head(c: +List<Nat>, -x: Nat, +b: Nat, d: q.DescFrom(x, c), e: {Nat.is_le(q.low(c), b) == True{} : Bool}) -> q.DescFrom(b, c):
  match c:
    case Nil{}:
      Unit{}
    case Con{+y, +rest}:
      (h, t) = d
      (e, t)

def q.AdvOk(pb: List<&2, Nat> & List<&2, Nat>, +bs: +List<Nat>, +x: Nat) -> Type:
  match pb:
    case (+c, +r):
      {q.rapp(c, r) == bs : List<&2, Nat>} & (q.DescFrom(x, c) & (Laws.BsFrom(q.low(c), r) & q.Stop(r, x)))

def q.adv_ok(rest: +List<Nat>, +x: Nat, e: Bool, he: {P.head_le(rest, x) == e : Bool}, +c: +List<Nat>, +bs: +List<Nat>,
  tot: {q.rapp(c, rest) == bs : List<&2, Nat>}, d: q.DescFrom(x, c), so: Laws.BsFrom(q.low(c), rest)) -> q.AdvOk(P.adv.go(rest, e, x, c), bs, x):
  match rest e:
    case Nil{} _:
      (tot, (d, (Unit{}, Unit{})))
    case Con{+b, +rr} True{}:
      (sh, st) = so
      q.adv_ok(rr, x, P.head_le(rr, x), {==}, b <> c, bs, tot, (he, q.desc_head(c, x, b, d, sh)), st)
    case Con{+b, +rr} False{}:
      (tot, (d, (so, he)))

def q.WalkOk(w: P.Walk, +bs: +List<Nat>, +e: Nat) -> Type:
  match w:
    case P.Walk{+c, +r, +acc}:
      {q.rapp(c, r) == bs : List<&2, Nat>} & (q.DescFrom(e, c) & (Laws.BsFrom(q.low(c), r) & q.Exact(bs, acc)))

def q.walk_eq(+k: +List<Nat>, +r: +List<Nat>, +a: Nat, +c: Nat, +d: Nat, +bs: +List<Nat>, tot: {q.rapp(k, r) == bs : List<&2, Nat>},
  dk: q.DescFrom(a, k), sr: Laws.BsFrom(q.low(k), r), st: q.Stop(r, a), ca: {Nat.is_le(c, a) == True{} : Bool}, ad: {Nat.is_lt(a, d) == True{} : Bool})
  -> {Bool.or(P.above(k, c), P.below(r, d)) == Laws.Crossing(bs, c, d) : Bool}:
  %tot : {Bool.or(P.above(k, c), P.below(r, d)) == Laws.Crossing(_, c, d) : Bool}
  %q.sym(Laws.Crossing(q.rapp(k, r), c, d), Bool.or(Laws.Crossing(k, c, d), Laws.Crossing(r, c, d)), q.cross_rapp(k, r, c, d)) : {Bool.or(P.above(k, c), P.below(r, d)) == _ : Bool}
  %q.cross_desc(k, a, c, d, ad, dk) : {Bool.or(_, P.below(r, d)) == Bool.or(Laws.Crossing(k, c, d), Laws.Crossing(r, c, d)) : Bool}
  %q.cross_asc(r, q.low(k), a, c, d, sr, st, ca) : {Bool.or(Laws.Crossing(k, c, d), _) == Bool.or(Laws.Crossing(k, c, d), Laws.Crossing(r, c, d)) : Bool}
  {==}

def q.desc_dup.k(-y: Nat, -a: Nat, -rest: +List<Nat>, +h: {Nat.is_le(y, a) == True{} : Bool}, tt: q.DescFrom(y, rest) & q.DescFrom(y, rest)) -> q.DescFrom(a, y <> rest) & q.DescFrom(a, y <> rest):
  (t1, t2) = tt
  ((h, t1), (h, t2))

def q.desc_dup(c: +List<Nat>, +a: Nat, d: q.DescFrom(a, c)) -> q.DescFrom(a, c) & q.DescFrom(a, c):
  match c:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{+y, +rest}:
      (h, t) = d
      q.desc_dup.k(y, a, rest, h, q.desc_dup(rest, y, t))

def q.bs_dup.k(-y: Nat, -a: Nat, -rest: +List<Nat>, +h: {Nat.is_le(a, y) == True{} : Bool}, tt: Laws.BsFrom(y, rest) & Laws.BsFrom(y, rest)) -> Laws.BsFrom(a, y <> rest) & Laws.BsFrom(a, y <> rest):
  (t1, t2) = tt
  ((h, t1), (h, t2))

def q.bs_dup(r: +List<Nat>, +a: Nat, so: Laws.BsFrom(a, r)) -> Laws.BsFrom(a, r) & Laws.BsFrom(a, r):
  match r:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{+y, +rest}:
      (h, t) = so
      q.bs_dup.k(y, a, rest, h, q.bs_dup(rest, y, t))

def q.walk_at_fin(+a: Nat, +b: Nat, +c: Nat, +d: Nat, +k: +List<Nat>, +r: +List<Nat>, +acc: +List<P.Mark>, +bs: +List<Nat>, +tot: {q.rapp(k, r) == bs : List<&2, Nat>},
  ca: {Nat.is_le(c, a) == True{} : Bool}, +ab: {Nat.is_lt(a, b) == True{} : Bool}, bd: {Nat.is_le(b, d) == True{} : Bool},
  dd: q.DescFrom(a, k) & q.DescFrom(a, k), ss: Laws.BsFrom(q.low(k), r) & Laws.BsFrom(q.low(k), r), st: q.Stop(r, a), ex: q.Exact(bs, acc))
  -> q.WalkOk(P.Walk{k, r, P.Mark{P.Span{a, b, c, d}, Bool.or(P.above(k, c), P.below(r, d))} <> acc}, bs, b):
  (d1, d2) = dd
  (s1, s2) = ss
  (tot, (q.desc_weaken(k, a, b, lt_imp_le(a, b, ab), d1), (s1, (q.walk_eq(k, r, a, c, d, bs, tot, d2, s2, st, ca, lt_le_trans(a, b, d, ab, bd)), ex))))

def q.walk_at_ok(+a: Nat, +b: Nat, +c: Nat, +d: Nat, cb: List<&2, Nat> & List<&2, Nat>, +acc: +List<P.Mark>, +bs: +List<Nat>,
  fr: Laws.Framed(P.Span{a, b, c, d}), aok: q.AdvOk(cb, bs, a), ex: q.Exact(bs, acc)) -> q.WalkOk(P.walk.at(P.Span{a, b, c, d}, cb, acc), bs, b):
  match cb:
    case (+k, +r):
      (ca, (ab, bd)) = fr
      (tot, (dk, (sr, st))) = aok
      q.walk_at_fin(a, b, c, d, k, r, acc, bs, tot, ca, ab, bd, q.desc_dup(k, a, dk), q.bs_dup(r, q.low(k), sr), st, ex)

def q.walk_step_ok(+a: Nat, +b: Nat, +c: Nat, +d: Nat, w: P.Walk, +bs: +List<Nat>, +e: Nat, ea: {Nat.is_le(e, a) == True{} : Bool},
  fr: Laws.Framed(P.Span{a, b, c, d}), wo: q.WalkOk(w, bs, e)) -> q.WalkOk(P.walk.step(P.Span{a, b, c, d}, w), bs, b):
  match w:
    case P.Walk{+k, +r, +acc}:
      (tot, (dk, (sr, ex))) = wo
      q.walk_at_ok(a, b, c, d, P.adv(r, a, k), acc, bs, fr, q.adv_ok(r, a, P.head_le(r, a), {==}, k, bs, tot, q.desc_weaken(k, e, a, ea, dk), sr), ex)

def q.walk_exact(ss: +List<P.Span>, +w: P.Walk, +bs: +List<Nat>, +e: Nat, sp: Laws.SpansFrom(e, ss), wo: q.WalkOk(w, bs, e)) -> q.Exact(bs, P.walk.go(ss, w)):
  match ss:
    case Nil{}:
      match w:
        case P.Walk{k, r, acc}:
          (tot, (dk, (sr, ex))) = wo
          ex
    case Con{P.Span{+a, +b, +c, +d}, +rest}:
      (ea, (fr, sp2)) = sp
      q.walk_exact(rest, P.walk.step(P.Span{a, b, c, d}, w), bs, b, sp2, q.walk_step_ok(a, b, c, d, w, bs, e, ea, fr, wo))

def q.exact_cross(+bs: +List<Nat>, ms: +List<P.Mark>, ex: q.Exact(bs, ms)) -> Laws.CrossTaken(bs, ms):
  match ms:
    case Nil{}:
      Unit{}
    case Con{P.Mark{+s, +t}, +rest}:
      (h, tl) = ex
      (x => Equal.trans(Bool, t, Laws.CrossOf(bs, s), True{}, h, x), q.exact_cross(bs, rest, tl))

def q.walk0(+bs: +List<Nat>, +ss: +List<P.Span>, sorted: Laws.BsFrom(0n, bs), apart: Laws.SpansFrom(0n, ss)) -> q.Exact(bs, P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})):
  q.walk_exact(ss, P.Walk{Nil{}, bs, Nil{}}, bs, 0n, apart, ({==}, (Unit{}, (sorted, Unit{}))))

def q.ct_near_at(+bs: +List<Nat>, +s: P.Span, at: Maybe<&2, P.Span>, g: Bool, +acc: +List<P.Mark>, e: Bool,
  h: {Laws.CrossOf(bs, s) == True{} : Bool} -> {False{} == True{} : Bool}, ct: Laws.CrossTaken(bs, acc)) -> Laws.CrossTaken(bs, q.nacc(P.near.at(s, at, g, acc, e))):
  match e:
    case True{}:
      (x => {==}, ct)
    case False{}:
      (h, ct)

def q.ct_back_step(+bs: +List<Nat>, +s: P.Span, t: Bool, n: P.Near, h: {Laws.CrossOf(bs, s) == True{} : Bool} -> {t == True{} : Bool}, ct: Laws.CrossTaken(bs, q.nacc(n)))
  -> Laws.CrossTaken(bs, q.nacc(P.back.step(P.Mark{s, t}, n))):
  match t n:
    case True{} P.Near{at, g, acc}:
      (x => {==}, ct)
    case False{} P.Near{+at, g, +acc}:
      q.ct_near_at(bs, s, at, g, acc, P.after(at, s), h, ct)

def q.ct_fwd_step(+bs: +List<Nat>, +s: P.Span, t: Bool, n: P.Near, h: {Laws.CrossOf(bs, s) == True{} : Bool} -> {t == True{} : Bool}, ct: Laws.CrossTaken(bs, q.nacc(n)))
  -> Laws.CrossTaken(bs, q.nacc(P.fwd.step(P.Mark{s, t}, n))):
  match t n:
    case True{} P.Near{at, g, acc}:
      (x => {==}, ct)
    case False{} P.Near{+at, g, +acc}:
      q.ct_near_at(bs, s, at, g, acc, P.before(at, s), h, ct)

def q.ct_back(+bs: +List<Nat>, ms: +List<P.Mark>, +n: P.Near, ci: Laws.CrossTaken(bs, ms), ca: Laws.CrossTaken(bs, q.nacc(n))) -> Laws.CrossTaken(bs, q.nacc(P.back.go(ms, n))):
  match ms:
    case Nil{}:
      ca
    case Con{P.Mark{+s, +t}, +rest}:
      (h, cr) = ci
      q.ct_back(bs, rest, P.back.step(P.Mark{s, t}, n), cr, q.ct_back_step(bs, s, t, n, h, ca))

def q.ct_fwd(+bs: +List<Nat>, ms: +List<P.Mark>, +n: P.Near, ci: Laws.CrossTaken(bs, ms), ca: Laws.CrossTaken(bs, q.nacc(n))) -> Laws.CrossTaken(bs, q.nacc(P.fwd.go(ms, n))):
  match ms:
    case Nil{}:
      ca
    case Con{P.Mark{+s, +t}, +rest}:
      (h, cr) = ci
      q.ct_fwd(bs, rest, P.fwd.step(P.Mark{s, t}, n), cr, q.ct_fwd_step(bs, s, t, n, h, ca))

def q.ct_roundend(-bs: +List<Nat>, g: Bool, f: P.Near, ct: Laws.CrossTaken(bs, q.nacc(f))) -> Laws.CrossTaken(bs, q.pms(P.round.end(g, f))):
  match f:
    case P.Near{at, g2, ms}:
      ct

def q.ct_roundfwd(+bs: +List<Nat>, b: P.Near, ct: Laws.CrossTaken(bs, q.nacc(b))) -> Laws.CrossTaken(bs, q.pms(P.round.fwd(b))):
  match b:
    case P.Near{at, g, +ms}:
      q.ct_roundend(bs, g, P.fwd.go(ms, P.Near{None{}, False{}, Nil{}}), q.ct_fwd(bs, ms, P.Near{None{}, False{}, Nil{}}, ct, Unit{}))

def q.ct_round(+bs: +List<Nat>, +r: +List<P.Mark>, ct: Laws.CrossTaken(bs, r)) -> Laws.CrossTaken(bs, q.pms(P.round(r))):
  q.ct_roundfwd(bs, P.back.go(r, P.Near{None{}, False{}, Nil{}}), q.ct_back(bs, r, P.Near{None{}, False{}, Nil{}}, ct, Unit{}))

def q.ct_loop(+bs: +List<Nat>, u: Nat, pr: P.Pass, ct: Laws.CrossTaken(bs, q.pms(pr))) -> Laws.CrossTaken(bs, P.loop(u, pr)):
  match u pr:
    case 0n P.Pass{r, g}:
      ct
    case 1n+v P.Pass{+r, True{}}:
      q.ct_loop(bs, v, P.round(r), q.ct_round(bs, r, ct))
    case 1n+v P.Pass{r, False{}}:
      ct

def q.ct_rev(+bs: +List<Nat>, ms: +List<P.Mark>, +acc: +List<P.Mark>, ci: Laws.CrossTaken(bs, ms), ca: Laws.CrossTaken(bs, acc)) -> Laws.CrossTaken(bs, P.rev.go(ms, acc)):
  match ms:
    case Nil{}:
      ca
    case Con{P.Mark{+s, +t}, +rest}:
      (h, cr) = ci
      q.ct_rev(bs, rest, P.Mark{s, t} <> acc, cr, (h, ca))

def Laws.parts_take_every_span_whose_match_crosses_a_part(bs, sorted, ss, apart):
  +r0 = P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})
  q.ct_rev(bs, P.loop(P.untaken.go(r0, 0n), P.Pass{r0, True{}}), Nil{},
    q.ct_loop(bs, P.untaken.go(r0, 0n), P.Pass{r0, True{}}, q.exact_cross(bs, r0, q.walk0(bs, ss, sorted, apart))), Unit{})

def q.le_refl(n: Nat) -> {Nat.is_le(n, n) == True{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      q.le_refl(p)

def q.lt_lt(+a: Nat, +b: Nat, +c: Nat, e1: {Nat.is_lt(a, b) == True{} : Bool}, e2: {Nat.is_lt(b, c) == True{} : Bool}) -> {Nat.is_lt(a, c) == True{} : Bool}:
  lt_le_trans(a, b, c, e1, lt_imp_le(b, c, e2))

def q.and_tt(a: Bool, b: Bool, ea: {a == True{} : Bool}, eb: {b == True{} : Bool}) -> {Bool.and(a, b) == True{} : Bool}:
  match a:
    case True{}:
      eb
    case False{}:
      ea

def q.forced(x: Bool, -t: Bool, gate: Laws.Gate(x, True{}, t), tt: {t == True{} : Bool}) -> {x == True{} : Bool}:
  match x:
    case True{}:
      {==}
    case False{}:
      Empty.absurd({False{} == True{} : Bool}, ft(Equal.trans(Bool, False{}, t, True{}, Equal.sym(Bool, t, False{}, gate), tt)))

def q.nta_true(-s: P.Span, -x: Bool, -xs: +List<P.Mark>, e: {x == True{} : Bool}, h: Laws.NoTouchAll(P.Mark{s, x}, xs)) -> Laws.NoTouchAll(P.Mark{s, True{}}, xs):
  %e : Laws.NoTouchAll(P.Mark{s, _}, xs)
  h

def q.nat(n: P.Near) -> Maybe<&2, P.Span>:
  match n:
    case P.Near{at, g, acc}:
      at

def q.bools(ms: +List<P.Mark>) -> List<&2, Bool>:
  match ms:
    case Nil{}:
      Nil{}
    case Con{P.Mark{s, t}, rest}:
      t <> q.bools(rest)

def q.zipm(ss: +List<P.Span>, xs: +List<Bool>) -> List<&2, P.Mark>:
  match ss xs:
    case Con{s, sr} Con{x, xr}:
      P.Mark{s, x} <> q.zipm(sr, xr)
    case _ _:
      Nil{}

def q.brev(xs: +List<Bool>, acc: +List<Bool>) -> List<&2, Bool>:
  match xs:
    case Nil{}:
      acc
    case Con{x, rest}:
      q.brev(rest, x <> acc)

def q.WithinB(ms: +List<P.Mark>, xs: +List<Bool>) -> Type:
  match ms xs:
    case Nil{} Nil{}:
      Unit
    case Con{P.Mark{s, t}, rest} Con{x, xr}:
      ({t == True{} : Bool} -> {x == True{} : Bool}) & q.WithinB(rest, xr)
    case _ _:
      Empty

def q.RevFrom(+a: Nat, ss: +List<P.Span>) -> Type:
  match ss:
    case Nil{}:
      Unit
    case Con{P.Span{+sa, +sb, +sc, +sd}, rest}:
      {Nat.is_le(sb, a) == True{} : Bool} & (Laws.Framed(P.Span{sa, sb, sc, sd}) & q.RevFrom(sa, rest))

def q.AtB(at: Maybe<&2, P.Span>, +xs: +List<P.Mark>, +a: Nat) -> Type:
  match at:
    case None{}:
      Unit
    case Some{P.Span{+fa, +fb, +fc, +fd}}:
      Laws.NoTouchAll(P.Mark{P.Span{fa, fb, fc, fd}, True{}}, xs) & ({Nat.is_le(a, fa) == True{} : Bool} & {Nat.is_lt(fa, fb) == True{} : Bool})

def q.AtF(at: Maybe<&2, P.Span>, +xs: +List<P.Mark>, +a: Nat) -> Type:
  match at:
    case None{}:
      Unit
    case Some{P.Span{+fa, +fb, +fc, +fd}}:
      Laws.NoTouchAll(P.Mark{P.Span{fa, fb, fc, fd}, True{}}, xs) & ({Nat.is_le(fb, a) == True{} : Bool} & {Nat.is_lt(fa, fb) == True{} : Bool})

def q.BInv(+n: P.Near, +xs: +List<P.Mark>, +a: Nat, +XA: +List<Bool>) -> Type:
  q.AtB(q.nat(n), xs, a) & q.WithinB(q.nacc(n), XA)

def q.FInv(+n: P.Near, +xs: +List<P.Mark>, +a: Nat, +XA: +List<Bool>) -> Type:
  q.AtF(q.nat(n), xs, a) & q.WithinB(q.nacc(n), XA)

def q.bforced(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, at0: Maybe<&2, P.Span>, x: Bool, -xs: +List<P.Mark>, +a: Nat,
  he: {P.after(at0, P.Span{sa, sb, sc, sd}) == True{} : Bool}, atp: q.AtB(at0, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a),
  le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd})) -> {x == True{} : Bool}:
  match at0:
    case None{}:
      Empty.absurd({x == True{} : Bool}, ft(he))
    case Some{P.Span{+fa, +fb, fc, fd}}:
      (((g1, g2), rest), (le_af, lt_ff)) = atp
      (ca, (ab, bd)) = fr
      +ca2 = q.le_lt_trans(sc, sa, sb, ca, ab)
      +cfa = lt_le_trans(sc, a, fa, lt_le_trans(sc, sb, a, ca2, le_ba), le_af)
      q.forced(x, Laws.Touches(P.Span{sa, sb, sc, sd}, P.Span{fa, fb, fc, fd}), g2, q.and_tt(Nat.is_lt(sc, fb), Nat.is_lt(fa, sd), q.lt_lt(sc, fa, fb, cfa, lt_ff), he))

def q.bat_keep(+sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, at0: Maybe<&2, P.Span>, -x: Bool, +xs: +List<P.Mark>, +a: Nat,
  atp: q.AtB(at0, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a), le_ba: {Nat.is_le(sb, a) == True{} : Bool}, ab: {Nat.is_lt(sa, sb) == True{} : Bool})
  -> q.AtB(at0, xs, sa):
  match at0:
    case None{}:
      Unit{}
    case Some{P.Span{+fa, +fb, fc, fd}}:
      ((nt, rest), (le_af, lt_ff)) = atp
      (rest, (lt_imp_le(sa, fa, lt_le_trans(sa, a, fa, lt_le_trans(sa, sb, a, ab, le_ba), le_af)), lt_ff))

def q.bat_new(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, -x: Bool, +xs: +List<P.Mark>, xt: {x == True{} : Bool},
  nta: Laws.NoTouchAll(P.Mark{P.Span{sa, sb, sc, sd}, x}, xs), ab: {Nat.is_lt(sa, sb) == True{} : Bool}) -> q.AtB(Some{P.Span{sa, sb, sc, sd}}, xs, sa):
  (q.nta_true(P.Span{sa, sb, sc, sd}, x, xs, xt, nta), (q.le_refl(sa), ab))

def q.bstep.f(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +at0: Maybe<&2, P.Span>, g: Bool, +acc: +List<P.Mark>, +xs: +List<P.Mark>, +x: Bool, +XA: +List<Bool>, +a: Nat,
  e: Bool, he: {P.after(at0, P.Span{sa, sb, sc, sd}) == e : Bool}, nta: Laws.NoTouchAll(P.Mark{P.Span{sa, sb, sc, sd}, x}, xs),
  le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.BInv(P.Near{at0, g, acc}, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a, XA))
  -> q.BInv(P.near.at(P.Span{sa, sb, sc, sd}, at0, g, acc, e), xs, sa, x <> XA):
  match e:
    case True{}:
      (ca, (+ab, bd)) = fr
      (atp, wa) = inv
      +xt = q.bforced(sa, sb, sc, sd, at0, x, xs, a, he, atp, le_ba, (ca, (ab, bd)))
      (q.bat_new(sa, sb, sc, sd, x, xs, xt, nta, ab), (y => xt, wa))
    case False{}:
      (ca, (ab, bd)) = fr
      (atp, wa) = inv
      (q.bat_keep(sa, sb, sc, sd, at0, x, xs, a, atp, le_ba, ab), (y => Empty.absurd({x == True{} : Bool}, ft(y)), wa))

def q.bstep(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, t: Bool, n: P.Near, +xs: +List<P.Mark>, +x: Bool, +XA: +List<Bool>, +a: Nat,
  tx: {t == True{} : Bool} -> {x == True{} : Bool}, nta: Laws.NoTouchAll(P.Mark{P.Span{sa, sb, sc, sd}, x}, xs),
  le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.BInv(n, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a, XA))
  -> q.BInv(P.back.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n), xs, sa, x <> XA):
  match t n:
    case True{} P.Near{at0, g, acc}:
      (ca, (ab, bd)) = fr
      (atp, wa) = inv
      +xt = tx({==})
      (q.bat_new(sa, sb, sc, sd, x, xs, xt, nta, ab), (y => xt, wa))
    case False{} P.Near{+at0, g, +acc}:
      q.bstep.f(sa, sb, sc, sd, at0, g, acc, xs, x, XA, a, P.after(at0, P.Span{sa, sb, sc, sd}), {==}, nta, le_ba, fr, inv)

def q.back_within(R: +List<P.Mark>, XB: +List<Bool>, +n: P.Near, +XA: +List<Bool>, +a: Nat,
  w: q.WithinB(R, XB), un: Laws.Untouched(q.zipm(Laws.SpansOf(R), XB)), geo: q.RevFrom(a, Laws.SpansOf(R)),
  inv: q.BInv(n, q.zipm(Laws.SpansOf(R), XB), a, XA))
  -> q.WithinB(q.nacc(P.back.go(R, n)), q.brev(XB, XA)):
  match R XB:
    case Nil{} Nil{}:
      (atp, wa) = inv
      wa
    case Nil{} Con{x, xr}:
      Empty.absurd(q.WithinB(q.nacc(n), q.brev(x <> xr, XA)), w)
    case Con{m, rr} Nil{}:
      Empty.absurd(q.WithinB(q.nacc(P.back.go(m <> rr, n)), XA), w)
    case Con{P.Mark{P.Span{+sa, +sb, +sc, +sd}, +t}, +rr} Con{+x, +xr}:
      (tx, w2) = w
      (nta, un2) = un
      (le_ba, (fr, geo2)) = geo
      q.back_within(rr, xr, P.back.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n), x <> XA, sa, w2, un2, geo2,
        q.bstep(sa, sb, sc, sd, t, n, q.zipm(Laws.SpansOf(rr), xr), x, XA, a, tx, nta, le_ba, fr, inv))

def q.fforced(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, at0: Maybe<&2, P.Span>, x: Bool, -xs: +List<P.Mark>, +a: Nat,
  he: {P.before(at0, P.Span{sa, sb, sc, sd}) == True{} : Bool}, atp: q.AtF(at0, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a),
  le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd})) -> {x == True{} : Bool}:
  match at0:
    case None{}:
      Empty.absurd({x == True{} : Bool}, ft(he))
    case Some{P.Span{+la, +lb, lc, ld}}:
      (((g1, g2), rest), (le_lba, lt_ll)) = atp
      (ca, (ab, bd)) = fr
      +las = lt_le_trans(la, a, sa, lt_le_trans(la, lb, a, lt_ll, le_lba), le_as)
      +lad = lt_le_trans(la, sb, sd, q.lt_lt(la, sa, sb, las, ab), bd)
      q.forced(x, Laws.Touches(P.Span{sa, sb, sc, sd}, P.Span{la, lb, lc, ld}), g2, q.and_tt(Nat.is_lt(sc, lb), Nat.is_lt(la, sd), gt_lt(lb, sc, he), lad))

def q.fat_keep(+sa: Nat, +sb: Nat, -sc: Nat, -sd: Nat, at0: Maybe<&2, P.Span>, -x: Bool, +xs: +List<P.Mark>, +a: Nat,
  atp: q.AtF(at0, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a), le_as: {Nat.is_le(a, sa) == True{} : Bool}, ab: {Nat.is_lt(sa, sb) == True{} : Bool})
  -> q.AtF(at0, xs, sb):
  match at0:
    case None{}:
      Unit{}
    case Some{P.Span{+fa, +fb, fc, fd}}:
      ((nt, rest), (le_fba, lt_ff)) = atp
      (rest, (le_trans(fb, a, sb, le_fba, lt_imp_le(a, sb, q.le_lt_trans(a, sa, sb, le_as, ab))), lt_ff))

def q.fat_new(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, -x: Bool, +xs: +List<P.Mark>, xt: {x == True{} : Bool},
  nta: Laws.NoTouchAll(P.Mark{P.Span{sa, sb, sc, sd}, x}, xs), ab: {Nat.is_lt(sa, sb) == True{} : Bool}) -> q.AtF(Some{P.Span{sa, sb, sc, sd}}, xs, sb):
  (q.nta_true(P.Span{sa, sb, sc, sd}, x, xs, xt, nta), (q.le_refl(sb), ab))

def q.fstep.f(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +at0: Maybe<&2, P.Span>, g: Bool, +acc: +List<P.Mark>, +xs: +List<P.Mark>, +x: Bool, +XA: +List<Bool>, +a: Nat,
  e: Bool, he: {P.before(at0, P.Span{sa, sb, sc, sd}) == e : Bool}, nta: Laws.NoTouchAll(P.Mark{P.Span{sa, sb, sc, sd}, x}, xs),
  le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.FInv(P.Near{at0, g, acc}, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a, XA))
  -> q.FInv(P.near.at(P.Span{sa, sb, sc, sd}, at0, g, acc, e), xs, sb, x <> XA):
  match e:
    case True{}:
      (ca, (+ab, bd)) = fr
      (atp, wa) = inv
      +xt = q.fforced(sa, sb, sc, sd, at0, x, xs, a, he, atp, le_as, (ca, (ab, bd)))
      (q.fat_new(sa, sb, sc, sd, x, xs, xt, nta, ab), (y => xt, wa))
    case False{}:
      (ca, (ab, bd)) = fr
      (atp, wa) = inv
      (q.fat_keep(sa, sb, sc, sd, at0, x, xs, a, atp, le_as, ab), (y => Empty.absurd({x == True{} : Bool}, ft(y)), wa))

def q.fstep(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, t: Bool, n: P.Near, +xs: +List<P.Mark>, +x: Bool, +XA: +List<Bool>, +a: Nat,
  tx: {t == True{} : Bool} -> {x == True{} : Bool}, nta: Laws.NoTouchAll(P.Mark{P.Span{sa, sb, sc, sd}, x}, xs),
  le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.FInv(n, P.Mark{P.Span{sa, sb, sc, sd}, x} <> xs, a, XA))
  -> q.FInv(P.fwd.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n), xs, sb, x <> XA):
  match t n:
    case True{} P.Near{at0, g, acc}:
      (ca, (ab, bd)) = fr
      (atp, wa) = inv
      +xt = tx({==})
      (q.fat_new(sa, sb, sc, sd, x, xs, xt, nta, ab), (y => xt, wa))
    case False{} P.Near{+at0, g, +acc}:
      q.fstep.f(sa, sb, sc, sd, at0, g, acc, xs, x, XA, a, P.before(at0, P.Span{sa, sb, sc, sd}), {==}, nta, le_as, fr, inv)

def q.fwd_within(F: +List<P.Mark>, XB: +List<Bool>, +n: P.Near, +XA: +List<Bool>, +a: Nat,
  w: q.WithinB(F, XB), un: Laws.Untouched(q.zipm(Laws.SpansOf(F), XB)), geo: Laws.SpansFrom(a, Laws.SpansOf(F)),
  inv: q.FInv(n, q.zipm(Laws.SpansOf(F), XB), a, XA))
  -> q.WithinB(q.nacc(P.fwd.go(F, n)), q.brev(XB, XA)):
  match F XB:
    case Nil{} Nil{}:
      (atp, wa) = inv
      wa
    case Nil{} Con{x, xr}:
      Empty.absurd(q.WithinB(q.nacc(n), q.brev(x <> xr, XA)), w)
    case Con{m, rr} Nil{}:
      Empty.absurd(q.WithinB(q.nacc(P.fwd.go(m <> rr, n)), XA), w)
    case Con{P.Mark{P.Span{+sa, +sb, +sc, +sd}, +t}, +rr} Con{+x, +xr}:
      (tx, w2) = w
      (nta, un2) = un
      (le_as, (fr, geo2)) = geo
      q.fwd_within(rr, xr, P.fwd.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n), x <> XA, sb, w2, un2, geo2,
        q.fstep(sa, sb, sc, sd, t, n, q.zipm(Laws.SpansOf(rr), xr), x, XA, a, tx, nta, le_as, fr, inv))

def q.bapp(xs: +List<Bool>, ys: +List<Bool>) -> List<&2, Bool>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      x <> q.bapp(rest, ys)

def q.brev2(xs: +List<Bool>, +ys: +List<Bool>, +zs: +List<Bool>) -> {q.brev(q.brev(xs, ys), zs) == q.brev(ys, q.bapp(xs, zs)) : List<&2, Bool>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      q.brev2(rest, x <> ys, zs)

def q.bapp_nil(xs: +List<Bool>) -> {q.bapp(xs, Nil{}) == xs : List<&2, Bool>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %q.bapp_nil(rest) : {x <> q.bapp(rest, Nil{}) == x <> _ : List<&2, Bool>}
      {==}

def q.brev_brev(+xs: +List<Bool>) -> {q.brev(q.brev(xs, Nil{}), Nil{}) == xs : List<&2, Bool>}:
  Equal.trans(List<&2, Bool>, q.brev(q.brev(xs, Nil{}), Nil{}), q.bapp(xs, Nil{}), xs, q.brev2(xs, Nil{}, Nil{}), q.bapp_nil(xs))

def q.stl(l: +List<P.Span>) -> List<&2, P.Span>:
  match l:
    case Nil{}:
      Nil{}
    case Con{x, r}:
      r

def q.shd(l: +List<P.Span>, +d: P.Span) -> P.Span:
  match l:
    case Nil{}:
      d
    case Con{x, r}:
      x

def q.isnil(l: +List<P.Span>) -> Bool:
  match l:
    case Nil{}:
      True{}
    case Con{x, r}:
      False{}

def q.nil_con(-s: P.Span, -r: +List<P.Span>, e: {Nil{} == s <> r : List<&2, P.Span>}) -> Empty:
  ft(Equal.sym(Bool, True{}, False{}, Equal.cong(List<&2, P.Span>, Bool, l => q.isnil(l), Nil{}, s <> r, e)))

def q.con_nil(-s: P.Span, -r: +List<P.Span>, e: {s <> r == Nil{} : List<&2, P.Span>}) -> Empty:
  ft(Equal.cong(List<&2, P.Span>, Bool, l => q.isnil(l), s <> r, Nil{}, e))

def q.con_hd(+s: P.Span, -r: +List<P.Span>, -s2: P.Span, -r2: +List<P.Span>, e: {s <> r == s2 <> r2 : List<&2, P.Span>}) -> {s == s2 : P.Span}:
  Equal.cong(List<&2, P.Span>, P.Span, l => q.shd(l, s), s <> r, s2 <> r2, e)

def q.con_tl(-s: P.Span, -r: +List<P.Span>, -s2: P.Span, -r2: +List<P.Span>, e: {s <> r == s2 <> r2 : List<&2, P.Span>}) -> {r == r2 : List<&2, P.Span>}:
  Equal.cong(List<&2, P.Span>, List<&2, P.Span>, l => q.stl(l), s <> r, s2 <> r2, e)

def q.within_init(+bs: +List<Nat>, R: +List<P.Mark>, Y: +List<P.Mark>, ex: q.Exact(bs, R), ct: Laws.CrossTaken(bs, Y), +sp: {Laws.SpansOf(R) == Laws.SpansOf(Y) : List<&2, P.Span>})
  -> q.WithinB(R, q.bools(Y)):
  match R Y:
    case Nil{} Nil{}:
      Unit{}
    case Nil{} Con{P.Mark{s2, x}, yr}:
      Empty.absurd(q.WithinB(Nil{}, x <> q.bools(yr)), q.nil_con(s2, Laws.SpansOf(yr), sp))
    case Con{P.Mark{s, t}, rr} Nil{}:
      Empty.absurd(q.WithinB(P.Mark{s, t} <> rr, Nil{}), q.con_nil(s, Laws.SpansOf(rr), sp))
    case Con{P.Mark{+s, +t}, +rr} Con{P.Mark{+s2, +x}, +yr}:
      (et, ex2) = ex
      (cx, ct2) = ct
      +es = q.con_hd(s, Laws.SpansOf(rr), s2, Laws.SpansOf(yr), sp)
      (h => cx(Equal.trans(Bool, Laws.CrossOf(bs, s2), Laws.CrossOf(bs, s), True{},
          Equal.sym(Bool, Laws.CrossOf(bs, s), Laws.CrossOf(bs, s2), Equal.cong(P.Span, Bool, z => Laws.CrossOf(bs, z), s, s2, es)),
          Equal.trans(Bool, Laws.CrossOf(bs, s), t, True{}, Equal.sym(Bool, t, Laws.CrossOf(bs, s), et), h))),
       q.within_init(bs, rr, yr, ex2, ct2, q.con_tl(s, Laws.SpansOf(rr), s2, Laws.SpansOf(yr), sp)))

def q.within_taken(ms: +List<P.Mark>, X: +List<P.Mark>, +sp: {Laws.SpansOf(ms) == Laws.SpansOf(X) : List<&2, P.Span>}, w: q.WithinB(ms, q.bools(X)))
  -> Laws.TakenWithin(ms, X):
  match ms X:
    case Nil{} Nil{}:
      Unit{}
    case Nil{} Con{P.Mark{s2, x}, xr}:
      Empty.absurd(Laws.TakenWithin(Nil{}, P.Mark{s2, x} <> xr), q.nil_con(s2, Laws.SpansOf(xr), sp))
    case Con{P.Mark{s, t}, mr} Nil{}:
      Empty.absurd(Laws.TakenWithin(P.Mark{s, t} <> mr, Nil{}), q.con_nil(s, Laws.SpansOf(mr), sp))
    case Con{P.Mark{+s, +t}, +mr} Con{P.Mark{+s2, +x}, +xr}:
      (h, w2) = w
      (h, q.within_taken(mr, xr, q.con_tl(s, Laws.SpansOf(mr), s2, Laws.SpansOf(xr), sp), w2))

def q.within_rev(ms: +List<P.Mark>, xs: +List<Bool>, +acc: +List<P.Mark>, +xa: +List<Bool>, w1: q.WithinB(ms, xs), w2: q.WithinB(acc, xa))
  -> q.WithinB(P.rev.go(ms, acc), q.brev(xs, xa)):
  match ms xs:
    case Nil{} Nil{}:
      w2
    case Nil{} Con{x, xr}:
      Empty.absurd(q.WithinB(acc, q.brev(x <> xr, xa)), w1)
    case Con{m, mr} Nil{}:
      Empty.absurd(q.WithinB(P.rev.go(m <> mr, acc), xa), w1)
    case Con{P.Mark{+s, +t}, +mr} Con{+x, +xr}:
      (h, w3) = w1
      q.within_rev(mr, xr, P.Mark{s, t} <> acc, x <> xa, w3, (h, w2))

def q.bools_rev(ms: +List<P.Mark>, +acc: +List<P.Mark>) -> {q.bools(P.rev.go(ms, acc)) == q.brev(q.bools(ms), q.bools(acc)) : List<&2, Bool>}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{+s, +t}, +rest}:
      q.bools_rev(rest, P.Mark{s, t} <> acc)

def q.zip_self_r(ms: +List<P.Mark>) -> {ms == q.zipm(Laws.SpansOf(ms), q.bools(ms)) : List<&2, P.Mark>}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{+s, +t}, +rest}:
      %q.zip_self_r(rest) : {P.Mark{s, t} <> rest == P.Mark{s, t} <> _ : List<&2, P.Mark>}
      {==}

def q.nt_sym(+m: P.Mark, +n: P.Mark, h: Laws.NoTouch(m, n)) -> Laws.NoTouch(n, m):
  match m n:
    case P.Mark{s, t} P.Mark{s2, t2}:
      (g1, g2) = h
      (g2, g1)

def q.NTA2(xs: +List<P.Mark>, +acc: +List<P.Mark>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case Con{m, r}:
      Laws.NoTouchAll(m, acc) & q.NTA2(r, acc)

def q.nta2_nil(xs: +List<P.Mark>) -> q.NTA2(xs, Nil{}):
  match xs:
    case Nil{}:
      Unit{}
    case Con{m, r}:
      (Unit{}, q.nta2_nil(r))

def q.nta2_cons(+x: P.Mark, xr: +List<P.Mark>, +acc: +List<P.Mark>, h1: Laws.NoTouchAll(x, xr), h2: q.NTA2(xr, acc)) -> q.NTA2(xr, x <> acc):
  match xr:
    case Nil{}:
      Unit{}
    case Con{+m, +r}:
      (n1, n2) = h1
      (a1, a2) = h2
      ((q.nt_sym(x, m, n1), a1), q.nta2_cons(x, r, acc, n2, a2))

def q.untouched_revgo(xs: +List<P.Mark>, +acc: +List<P.Mark>, u1: Laws.Untouched(xs), u2: Laws.Untouched(acc), cr: q.NTA2(xs, acc)) -> Laws.Untouched(P.rev.go(xs, acc)):
  match xs:
    case Nil{}:
      u2
    case Con{+x, +xr}:
      (n1, u3) = u1
      (c1, c2) = cr
      q.untouched_revgo(xr, x <> acc, u3, (c1, u2), q.nta2_cons(x, xr, acc, n1, c2))

def q.lastend(ss: +List<P.Span>, +e: Nat) -> Nat:
  match ss:
    case Nil{}:
      e
    case Con{P.Span{a, b, c, d}, r}:
      q.lastend(r, b)

def q.revfrom_weaken(ss: +List<P.Span>, +a: Nat, +a2: Nat, e: {Nat.is_le(a, a2) == True{} : Bool}, h: q.RevFrom(a, ss)) -> q.RevFrom(a2, ss):
  match ss:
    case Nil{}:
      Unit{}
    case Con{P.Span{+sa, +sb, +sc, +sd}, +r}:
      (x, rest) = h
      (le_trans(sb, a, a2, x, e), rest)

def q.rev_geo(ss: +List<P.Span>, +e: Nat, +acc: +List<P.Span>, sp: Laws.SpansFrom(e, ss), ga: q.RevFrom(e, acc)) -> q.RevFrom(q.lastend(ss, e), q.srev(ss, acc)):
  match ss:
    case Nil{}:
      ga
    case Con{P.Span{+sa, +sb, +sc, +sd}, +r}:
      (ea, (fr, sp2)) = sp
      q.rev_geo(r, sb, P.Span{sa, sb, sc, sd} <> acc, sp2, (q.le_refl(sb), (fr, q.revfrom_weaken(acc, e, sa, ea, ga))))

def q.pair2(-A: Type, -B: Type, a: A & A, b: B & B) -> (A & B) & (A & B):
  (a1, a2) = a
  (b1, b2) = b
  ((a1, b1), (a2, b2))

def q.gate_dup(t: Bool, t2: Bool, -x: Bool, g: Laws.Gate(t, t2, x)) -> Laws.Gate(t, t2, x) & Laws.Gate(t, t2, x):
  match t t2:
    case False{} True{}:
      dup_b(x, False{}, g)
    case True{} True{}:
      (Unit{}, Unit{})
    case True{} False{}:
      (Unit{}, Unit{})
    case False{} False{}:
      (Unit{}, Unit{})

def q.nt_dup(+m: P.Mark, +n: P.Mark, h: Laws.NoTouch(m, n)) -> Laws.NoTouch(m, n) & Laws.NoTouch(m, n):
  match m n:
    case P.Mark{+s, +t} P.Mark{+s2, +t2}:
      (g1, g2) = h
      q.pair2(Laws.Gate(t, t2, Laws.Touches(s, s2)), Laws.Gate(t2, t, Laws.Touches(s2, s)), q.gate_dup(t, t2, Laws.Touches(s, s2), g1), q.gate_dup(t2, t, Laws.Touches(s2, s), g2))

def q.nta_dup(+m: P.Mark, ns: +List<P.Mark>, h: Laws.NoTouchAll(m, ns)) -> Laws.NoTouchAll(m, ns) & Laws.NoTouchAll(m, ns):
  match ns:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{+n, +rest}:
      (a, b) = h
      q.pair2(Laws.NoTouch(m, n), Laws.NoTouchAll(m, rest), q.nt_dup(m, n, a), q.nta_dup(m, rest, b))

def q.un_dup(ms: +List<P.Mark>, h: Laws.Untouched(ms)) -> Laws.Untouched(ms) & Laws.Untouched(ms):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{+m, +rest}:
      (a, b) = h
      q.pair2(Laws.NoTouchAll(m, rest), Laws.Untouched(rest), q.nta_dup(m, rest, a), q.un_dup(rest, b))

def q.fr_mk(-a: Nat, -b: Nat, -c: Nat, -d: Nat, +x: {Nat.is_le(c, a) == True{} : Bool}, +y: {Nat.is_lt(a, b) == True{} : Bool}, +z: {Nat.is_le(b, d) == True{} : Bool})
  -> Laws.Framed(P.Span{a, b, c, d}) & Laws.Framed(P.Span{a, b, c, d}):
  ((x, (y, z)), (x, (y, z)))

def q.fr_dup(-a: Nat, -b: Nat, -c: Nat, -d: Nat, h: Laws.Framed(P.Span{a, b, c, d})) -> Laws.Framed(P.Span{a, b, c, d}) & Laws.Framed(P.Span{a, b, c, d}):
  (x, (y, z)) = h
  q.fr_mk(a, b, c, d, x, y, z)

def q.sp_dup.k(-e: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -rest: +List<P.Span>, +x: {Nat.is_le(e, a) == True{} : Bool},
  f: Laws.Framed(P.Span{a, b, c, d}) & Laws.Framed(P.Span{a, b, c, d}), r: Laws.SpansFrom(b, rest) & Laws.SpansFrom(b, rest))
  -> Laws.SpansFrom(e, P.Span{a, b, c, d} <> rest) & Laws.SpansFrom(e, P.Span{a, b, c, d} <> rest):
  (f1, f2) = f
  (r1, r2) = r
  ((x, (f1, r1)), (x, (f2, r2)))

def q.sp_dup(ss: +List<P.Span>, +e: Nat, h: Laws.SpansFrom(e, ss)) -> Laws.SpansFrom(e, ss) & Laws.SpansFrom(e, ss):
  match ss:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Span{+a, +b, +c, +d}, +rest}:
      (x, (f, r)) = h
      q.sp_dup.k(e, a, b, c, d, rest, x, q.fr_dup(a, b, c, d, f), q.sp_dup(rest, b, r))

def q.rv_dup.k(-e: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -rest: +List<P.Span>, +x: {Nat.is_le(b, e) == True{} : Bool},
  f: Laws.Framed(P.Span{a, b, c, d}) & Laws.Framed(P.Span{a, b, c, d}), r: q.RevFrom(a, rest) & q.RevFrom(a, rest))
  -> q.RevFrom(e, P.Span{a, b, c, d} <> rest) & q.RevFrom(e, P.Span{a, b, c, d} <> rest):
  (f1, f2) = f
  (r1, r2) = r
  ((x, (f1, r1)), (x, (f2, r2)))

def q.rv_dup(ss: +List<P.Span>, +e: Nat, h: q.RevFrom(e, ss)) -> q.RevFrom(e, ss) & q.RevFrom(e, ss):
  match ss:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Span{+a, +b, +c, +d}, +rest}:
      (x, (f, r)) = h
      q.rv_dup.k(e, a, b, c, d, rest, x, q.fr_dup(a, b, c, d, f), q.rv_dup(rest, a, r))

def q.cast_un(-A: +List<P.Span>, -B: +List<P.Span>, -YB: +List<Bool>, e: {A == B : List<&2, P.Span>}, h: Laws.Untouched(q.zipm(B, YB))) -> Laws.Untouched(q.zipm(A, YB)):
  %Equal.sym(List<&2, P.Span>, A, B, e) : Laws.Untouched(q.zipm(_, YB))
  h

def q.cast_rev(-a: Nat, -A: +List<P.Span>, -B: +List<P.Span>, e: {A == B : List<&2, P.Span>}, h: q.RevFrom(a, B)) -> q.RevFrom(a, A):
  %Equal.sym(List<&2, P.Span>, A, B, e) : q.RevFrom(a, _)
  h

def q.cast_sp(-a: Nat, -A: +List<P.Span>, -B: +List<P.Span>, e: {A == B : List<&2, P.Span>}, h: Laws.SpansFrom(a, B)) -> Laws.SpansFrom(a, A):
  %Equal.sym(List<&2, P.Span>, A, B, e) : Laws.SpansFrom(a, _)
  h

def q.cast_wb(-F: +List<P.Mark>, -X1: +List<Bool>, -X2: +List<Bool>, e: {X1 == X2 : List<&2, Bool>}, h: q.WithinB(F, X1)) -> q.WithinB(F, X2):
  %e : q.WithinB(F, _)
  h

def q.cast_wbm(-M1: +List<P.Mark>, -M2: +List<P.Mark>, -XB: +List<Bool>, e: {M1 == M2 : List<&2, P.Mark>}, h: q.WithinB(M2, XB)) -> q.WithinB(M1, XB):
  %Equal.sym(List<&2, P.Mark>, M1, M2, e) : q.WithinB(_, XB)
  h

def q.roundend_ms(g: Bool, f: P.Near) -> {q.pms(P.round.end(g, f)) == q.nacc(f) : List<&2, P.Mark>}:
  match f:
    case P.Near{at, g2, ms}:
      {==}

def q.roundfwd_ms(b: P.Near) -> {q.pms(P.round.fwd(b)) == q.nacc(P.fwd.go(q.nacc(b), P.Near{None{}, False{}, Nil{}})) : List<&2, P.Mark>}:
  match b:
    case P.Near{at, g, ms}:
      q.roundend_ms(g, P.fwd.go(ms, P.Near{None{}, False{}, Nil{}}))

def q.round_within(+r: +List<P.Mark>, +ss: +List<P.Span>, +XB: +List<Bool>, +top: Nat,
  +sr: {Laws.SpansOf(r) == q.srev(ss, Nil{}) : List<&2, P.Span>}, wr: q.WithinB(r, q.brev(XB, Nil{})),
  uX: Laws.Untouched(q.zipm(ss, XB)), uY: Laws.Untouched(q.zipm(q.srev(ss, Nil{}), q.brev(XB, Nil{}))),
  gF: Laws.SpansFrom(0n, ss), gR: q.RevFrom(top, q.srev(ss, Nil{})))
  -> q.WithinB(q.pms(P.round(r)), q.brev(XB, Nil{})):
  +n0 = {P.Near{None{}, False{}, Nil{}} : P.Near}
  +F = q.nacc(P.back.go(r, n0))
  +sF = Equal.trans(List<&2, P.Span>, Laws.SpansOf(F), q.srev(Laws.SpansOf(r), Nil{}), ss,
    q.back_spans(r, n0),
    Equal.trans(List<&2, P.Span>, q.srev(Laws.SpansOf(r), Nil{}), q.srev(q.srev(ss, Nil{}), Nil{}), ss,
      Equal.cong(List<&2, P.Span>, List<&2, P.Span>, x => q.srev(x, Nil{}), Laws.SpansOf(r), q.srev(ss, Nil{}), sr),
      q.srev_srev(ss)))
  q.cast_wbm(q.pms(P.round(r)), q.nacc(P.fwd.go(F, n0)), q.brev(XB, Nil{}), q.roundfwd_ms(P.back.go(r, n0)),
    q.fwd_within(F, XB, n0, Nil{}, 0n,
      q.cast_wb(F, q.brev(q.brev(XB, Nil{}), Nil{}), XB, q.brev_brev(XB),
        q.back_within(r, q.brev(XB, Nil{}), n0, Nil{}, top, wr,
          q.cast_un(Laws.SpansOf(r), q.srev(ss, Nil{}), q.brev(XB, Nil{}), sr, uY),
          q.cast_rev(top, Laws.SpansOf(r), q.srev(ss, Nil{}), sr, gR), (Unit{}, Unit{}))),
      q.cast_un(Laws.SpansOf(F), ss, XB, sF, uX), q.cast_sp(0n, Laws.SpansOf(F), ss, sF, gF), (Unit{}, Unit{})))

def q.loop_within(u: Nat, pr: P.Pass, +ss: +List<P.Span>, +XB: +List<Bool>, +top: Nat,
  +sr: {Laws.SpansOf(q.pms(pr)) == q.srev(ss, Nil{}) : List<&2, P.Span>}, wr: q.WithinB(q.pms(pr), q.brev(XB, Nil{})),
  uX: Laws.Untouched(q.zipm(ss, XB)) & Laws.Untouched(q.zipm(ss, XB)),
  uY: Laws.Untouched(q.zipm(q.srev(ss, Nil{}), q.brev(XB, Nil{}))) & Laws.Untouched(q.zipm(q.srev(ss, Nil{}), q.brev(XB, Nil{}))),
  gF: Laws.SpansFrom(0n, ss) & Laws.SpansFrom(0n, ss), gR: q.RevFrom(top, q.srev(ss, Nil{})) & q.RevFrom(top, q.srev(ss, Nil{})))
  -> q.WithinB(P.loop(u, pr), q.brev(XB, Nil{})):
  match u pr:
    case 0n P.Pass{r, g}:
      wr
    case 1n+v P.Pass{+r, True{}}:
      (uX1, uX2) = uX
      (uY1, uY2) = uY
      (gF1, gF2) = gF
      (gR1, gR2) = gR
      q.loop_within(v, P.round(r), ss, XB, top,
        Equal.trans(List<&2, P.Span>, Laws.SpansOf(q.pms(P.round(r))), Laws.SpansOf(r), q.srev(ss, Nil{}), q.round_spans(r), sr),
        q.round_within(r, ss, XB, top, sr, wr, uX1, uY1, gF1, gR1),
        q.un_dup(q.zipm(ss, XB), uX2), q.un_dup(q.zipm(q.srev(ss, Nil{}), q.brev(XB, Nil{})), uY2),
        q.sp_dup(ss, 0n, gF2), q.rv_dup(q.srev(ss, Nil{}), top, gR2))
    case 1n+v P.Pass{r, False{}}:
      wr

def q.un_of(+Y: +List<P.Mark>, -A: +List<P.Span>, -B: +List<Bool>, eA: {Laws.SpansOf(Y) == A : List<&2, P.Span>}, eB: {q.bools(Y) == B : List<&2, Bool>}, h: Laws.Untouched(Y))
  -> Laws.Untouched(q.zipm(A, B)):
  %eA : Laws.Untouched(q.zipm(_, B))
  %eB : Laws.Untouched(q.zipm(Laws.SpansOf(Y), _))
  %q.zip_self_r(Y) : Laws.Untouched(_)
  h

def q.l3.c(+bs: +List<Nat>, +ss: +List<P.Span>, +xs: +List<P.Mark>, +same: {Laws.SpansOf(xs) == ss : List<&2, P.Span>},
  +sr0: {Laws.SpansOf(P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})) == q.srev(ss, Nil{}) : List<&2, P.Span>},
  wr0: q.WithinB(P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}}), q.brev(q.bools(xs), Nil{})),
  uX: Laws.Untouched(q.zipm(ss, q.bools(xs))), uY: Laws.Untouched(q.zipm(q.srev(ss, Nil{}), q.brev(q.bools(xs), Nil{}))),
  gF: Laws.SpansFrom(0n, ss), gR: q.RevFrom(q.lastend(ss, 0n), q.srev(ss, Nil{})))
  -> Laws.TakenWithin(P.taken(bs, ss), xs):
  +r0 = P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})
  +XB = q.bools(xs)
  +L = P.loop(P.untaken.go(r0, 0n), P.Pass{r0, True{}})
  +top = q.lastend(ss, 0n)
  q.within_taken(P.rev.go(L, Nil{}), xs, Equal.trans(List<&2, P.Span>, Laws.SpansOf(P.rev.go(L, Nil{})), ss, Laws.SpansOf(xs), Laws.parts_keep_every_span_in_order(bs, ss), Equal.sym(List<&2, P.Span>, Laws.SpansOf(xs), ss, same)),
    q.cast_wb(P.rev.go(L, Nil{}), q.brev(q.brev(XB, Nil{}), Nil{}), XB, q.brev_brev(XB),
      q.within_rev(L, q.brev(XB, Nil{}), Nil{}, Nil{},
        q.loop_within(P.untaken.go(r0, 0n), P.Pass{r0, True{}}, ss, XB, top, sr0, wr0,
          q.un_dup(q.zipm(ss, XB), uX), q.un_dup(q.zipm(q.srev(ss, Nil{}), q.brev(XB, Nil{})), uY),
          q.sp_dup(ss, 0n, gF), q.rv_dup(q.srev(ss, Nil{}), top, gR)),
        Unit{})))

def q.l3.b(+bs: +List<Nat>, sorted: Laws.BsFrom(0n, bs), +ss: +List<P.Span>, ap: Laws.SpansFrom(0n, ss) & Laws.SpansFrom(0n, ss), ap3: Laws.SpansFrom(0n, ss),
  +xs: +List<P.Mark>, +same: {Laws.SpansOf(xs) == ss : List<&2, P.Span>}, cross: Laws.CrossTaken(bs, xs), cl: Laws.Untouched(xs) & Laws.Untouched(xs))
  -> Laws.TakenWithin(P.taken(bs, ss), xs):
  (a1, a2) = ap
  (c1, c2) = cl
  +r0 = P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})
  +Y = P.rev.go(xs, Nil{})
  +sr0 = q.walk_spans(ss, P.Walk{Nil{}, bs, Nil{}})
  +sY = Equal.trans(List<&2, P.Span>, Laws.SpansOf(Y), q.srev(Laws.SpansOf(xs), Nil{}), q.srev(ss, Nil{}), q.mspans_rev(xs, Nil{}),
    Equal.cong(List<&2, P.Span>, List<&2, P.Span>, x => q.srev(x, Nil{}), Laws.SpansOf(xs), ss, same))
  +bY = q.bools_rev(xs, Nil{})
  q.l3.c(bs, ss, xs, same, sr0,
    q.cast_wb(r0, q.bools(Y), q.brev(q.bools(xs), Nil{}), bY,
      q.within_init(bs, r0, Y, q.walk0(bs, ss, sorted, a1), q.ct_rev(bs, xs, Nil{}, cross, Unit{}),
        Equal.trans(List<&2, P.Span>, Laws.SpansOf(r0), q.srev(ss, Nil{}), Laws.SpansOf(Y), sr0, Equal.sym(List<&2, P.Span>, Laws.SpansOf(Y), q.srev(ss, Nil{}), sY)))),
    q.un_of(xs, ss, q.bools(xs), same, {==}, c1),
    q.un_of(Y, q.srev(ss, Nil{}), q.brev(q.bools(xs), Nil{}), sY, bY, q.untouched_revgo(xs, Nil{}, c2, Unit{}, q.nta2_nil(xs))),
    a2, q.rev_geo(ss, 0n, Nil{}, ap3, Unit{}))

def q.l3.a(+bs: +List<Nat>, sorted: Laws.BsFrom(0n, bs), +ss: +List<P.Span>, ap: Laws.SpansFrom(0n, ss) & Laws.SpansFrom(0n, ss),
  +xs: +List<P.Mark>, +same: {Laws.SpansOf(xs) == ss : List<&2, P.Span>}, cross: Laws.CrossTaken(bs, xs), cl: Laws.Untouched(xs))
  -> Laws.TakenWithin(P.taken(bs, ss), xs):
  (a1, a2) = ap
  q.l3.b(bs, sorted, ss, q.sp_dup(ss, 0n, a1), a2, xs, same, cross, q.un_dup(xs, cl))

def Laws.parts_take_no_span_that_crossings_do_not_force(bs, sorted, ss, apart, xs, same, cross, closed):
  q.l3.a(bs, sorted, ss, q.sp_dup(ss, 0n, apart), xs, same, cross, closed)

def q.cnt(ms: +List<P.Mark>) -> Nat:
  match ms:
    case Nil{}:
      0n
    case Con{P.Mark{s, True{}}, r}:
      q.cnt(r)
    case Con{P.Mark{s, False{}}, r}:
      1n+q.cnt(r)

def q.bn(g: Bool) -> Nat:
  match g:
    case True{}:
      1n
    case False{}:
      0n

def q.untaken_eq(ms: +List<P.Mark>, +n: Nat) -> {P.untaken.go(ms, n) == Nat.add(q.cnt(ms), n) : Nat}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{s, True{}}, +r}:
      q.untaken_eq(r, n)
    case Con{P.Mark{s, False{}}, +r}:
      Equal.trans(Nat, P.untaken.go(r, 1n+n), Nat.add(q.cnt(r), 1n+n), 1n+Nat.add(q.cnt(r), n), q.untaken_eq(r, 1n+n), Equal.sym(Nat, 1n+Nat.add(q.cnt(r), n), Nat.add(q.cnt(r), 1n+n), add_succ(q.cnt(r), n)))

def q.le_succ(n: Nat) -> {Nat.is_le(n, 1n+n) == True{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      q.le_succ(p)

def q.le_bn(g: Bool, +x: Nat) -> {Nat.is_le(x, Nat.add(q.bn(g), x)) == True{} : Bool}:
  match g:
    case True{}:
      q.le_succ(x)
    case False{}:
      q.le_refl(x)

def q.le_zero(x: Nat, h: {Nat.is_le(x, 0n) == True{} : Bool}) -> {x == 0n : Nat}:
  match x:
    case 0n:
      {==}
    case 1n+p:
      Empty.absurd({1n+p == 0n : Nat}, ft(h))

def q.cnt_le_eq(-a: Nat, -b: Nat, -c: Nat, e: {b == c : Nat}, h: {Nat.is_le(a, b) == True{} : Bool}) -> {Nat.is_le(a, c) == True{} : Bool}:
  %e : {Nat.is_le(a, _) == True{} : Bool}
  h

def q.nstep_cnt.at(+s: P.Span, at: Maybe<&2, P.Span>, g: Bool, +acc: +List<P.Mark>, +K: Nat, e: Bool)
  -> {Nat.is_le(Nat.add(q.bn(q.ngrew(P.near.at(s, at, g, acc, e))), Nat.add(K, q.cnt(q.nacc(P.near.at(s, at, g, acc, e))))), Nat.add(q.bn(g), Nat.add(1n+K, q.cnt(acc)))) == True{} : Bool}:
  match g e:
    case True{} True{}:
      q.le_succ(1n+Nat.add(K, q.cnt(acc)))
    case False{} True{}:
      q.le_refl(1n+Nat.add(K, q.cnt(acc)))
    case True{} False{}:
      %add_succ(K, q.cnt(acc)) : {Nat.is_le(Nat.add(1n, _), Nat.add(1n, 1n+Nat.add(K, q.cnt(acc)))) == True{} : Bool}
      q.le_refl(Nat.add(1n, 1n+Nat.add(K, q.cnt(acc))))
    case False{} False{}:
      %add_succ(K, q.cnt(acc)) : {Nat.is_le(_, 1n+Nat.add(K, q.cnt(acc))) == True{} : Bool}
      q.le_refl(1n+Nat.add(K, q.cnt(acc)))

def q.back_cnt(ms: +List<P.Mark>, +n: P.Near)
  -> {Nat.is_le(Nat.add(q.bn(q.ngrew(P.back.go(ms, n))), q.cnt(q.nacc(P.back.go(ms, n)))), Nat.add(q.bn(q.ngrew(n)), Nat.add(q.cnt(ms), q.cnt(q.nacc(n))))) == True{} : Bool}:
  match ms n:
    case Nil{} _:
      q.le_refl(Nat.add(q.bn(q.ngrew(n)), q.cnt(q.nacc(n))))
    case Con{P.Mark{+s, True{}}, +rest} P.Near{+at, +g, +acc}:
      q.back_cnt(rest, P.back.step(P.Mark{s, True{}}, P.Near{at, g, acc}))
    case Con{P.Mark{+s, False{}}, +rest} P.Near{+at, +g, +acc}:
      +n2 = P.back.step(P.Mark{s, False{}}, P.Near{at, g, acc})
      le_trans(Nat.add(q.bn(q.ngrew(P.back.go(rest, n2))), q.cnt(q.nacc(P.back.go(rest, n2)))),
        Nat.add(q.bn(q.ngrew(n2)), Nat.add(q.cnt(rest), q.cnt(q.nacc(n2)))),
        Nat.add(q.bn(g), Nat.add(1n+q.cnt(rest), q.cnt(acc))),
        q.back_cnt(rest, n2), q.nstep_cnt.at(s, at, g, acc, q.cnt(rest), P.after(at, s)))

def q.fwd_cnt(ms: +List<P.Mark>, +n: P.Near)
  -> {Nat.is_le(Nat.add(q.bn(q.ngrew(P.fwd.go(ms, n))), q.cnt(q.nacc(P.fwd.go(ms, n)))), Nat.add(q.bn(q.ngrew(n)), Nat.add(q.cnt(ms), q.cnt(q.nacc(n))))) == True{} : Bool}:
  match ms n:
    case Nil{} _:
      q.le_refl(Nat.add(q.bn(q.ngrew(n)), q.cnt(q.nacc(n))))
    case Con{P.Mark{+s, True{}}, +rest} P.Near{+at, +g, +acc}:
      q.fwd_cnt(rest, P.fwd.step(P.Mark{s, True{}}, P.Near{at, g, acc}))
    case Con{P.Mark{+s, False{}}, +rest} P.Near{+at, +g, +acc}:
      +n2 = P.fwd.step(P.Mark{s, False{}}, P.Near{at, g, acc})
      le_trans(Nat.add(q.bn(q.ngrew(P.fwd.go(rest, n2))), q.cnt(q.nacc(P.fwd.go(rest, n2)))),
        Nat.add(q.bn(q.ngrew(n2)), Nat.add(q.cnt(rest), q.cnt(q.nacc(n2)))),
        Nat.add(q.bn(g), Nat.add(1n+q.cnt(rest), q.cnt(acc))),
        q.fwd_cnt(rest, n2), q.nstep_cnt.at(s, at, g, acc, q.cnt(rest), P.before(at, s)))

def q.nat_grew(+s: P.Span, at: Maybe<&2, P.Span>, +acc: +List<P.Mark>, e: Bool) -> {q.ngrew(P.near.at(s, at, True{}, acc, e)) == True{} : Bool}:
  match e:
    case True{}:
      {==}
    case False{}:
      {==}

def q.back_grew(ms: +List<P.Mark>, +n: P.Near, h: {q.ngrew(n) == True{} : Bool}) -> {q.ngrew(P.back.go(ms, n)) == True{} : Bool}:
  match ms n:
    case Nil{} _:
      h
    case Con{P.Mark{+s, True{}}, +rest} P.Near{at, True{}, +acc}:
      q.back_grew(rest, P.Near{Some{s}, True{}, P.Mark{s, True{}} <> acc}, {==})
    case Con{P.Mark{+s, False{}}, +rest} P.Near{+at, True{}, +acc}:
      q.back_grew(rest, P.near.at(s, at, True{}, acc, P.after(at, s)), q.nat_grew(s, at, acc, P.after(at, s)))
    case Con{m, rest} P.Near{at, False{}, acc}:
      Empty.absurd({q.ngrew(P.back.go(m <> rest, P.Near{at, False{}, acc})) == True{} : Bool}, ft(h))

def q.fwd_grew(ms: +List<P.Mark>, +n: P.Near, h: {q.ngrew(n) == True{} : Bool}) -> {q.ngrew(P.fwd.go(ms, n)) == True{} : Bool}:
  match ms n:
    case Nil{} _:
      h
    case Con{P.Mark{+s, True{}}, +rest} P.Near{at, True{}, +acc}:
      q.fwd_grew(rest, P.Near{Some{s}, True{}, P.Mark{s, True{}} <> acc}, {==})
    case Con{P.Mark{+s, False{}}, +rest} P.Near{+at, True{}, +acc}:
      q.fwd_grew(rest, P.near.at(s, at, True{}, acc, P.before(at, s)), q.nat_grew(s, at, acc, P.before(at, s)))
    case Con{m, rest} P.Near{at, False{}, acc}:
      Empty.absurd({q.ngrew(P.fwd.go(m <> rest, P.Near{at, False{}, acc})) == True{} : Bool}, ft(h))

def q.back_grew_false(+ms: +List<P.Mark>, n: P.Near, h: {q.ngrew(P.back.go(ms, n)) == False{} : Bool}) -> {q.ngrew(n) == False{} : Bool}:
  match n:
    case P.Near{+at, True{}, +acc}:
      Empty.absurd({True{} == False{} : Bool}, ft(Equal.trans(Bool, False{}, q.ngrew(P.back.go(ms, P.Near{at, True{}, acc})), True{},
        Equal.sym(Bool, q.ngrew(P.back.go(ms, P.Near{at, True{}, acc})), False{}, h), q.back_grew(ms, P.Near{at, True{}, acc}, {==}))))
    case P.Near{at, False{}, acc}:
      {==}

def q.fwd_grew_false(+ms: +List<P.Mark>, n: P.Near, h: {q.ngrew(P.fwd.go(ms, n)) == False{} : Bool}) -> {q.ngrew(n) == False{} : Bool}:
  match n:
    case P.Near{+at, True{}, +acc}:
      Empty.absurd({True{} == False{} : Bool}, ft(Equal.trans(Bool, False{}, q.ngrew(P.fwd.go(ms, P.Near{at, True{}, acc})), True{},
        Equal.sym(Bool, q.ngrew(P.fwd.go(ms, P.Near{at, True{}, acc})), False{}, h), q.fwd_grew(ms, P.Near{at, True{}, acc}, {==}))))
    case P.Near{at, False{}, acc}:
      {==}

def q.nat_false(+s: P.Span, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, e: Bool, h: {q.ngrew(P.near.at(s, at, g, acc, e)) == False{} : Bool})
  -> {P.near.at(s, at, g, acc, e) == P.Near{at, g, P.Mark{s, False{}} <> acc} : P.Near}:
  match e:
    case True{}:
      Empty.absurd({P.Near{Some{s}, True{}, P.Mark{s, True{}} <> acc} == P.Near{at, g, P.Mark{s, False{}} <> acc} : P.Near}, ft(Equal.sym(Bool, True{}, False{}, h)))
    case False{}:
      {==}

def q.back_same(ms: +List<P.Mark>, +n: P.Near, +h: {q.ngrew(P.back.go(ms, n)) == False{} : Bool}) -> {q.nacc(P.back.go(ms, n)) == P.rev.go(ms, q.nacc(n)) : List<&2, P.Mark>}:
  match ms n:
    case Nil{} _:
      {==}
    case Con{P.Mark{+s, True{}}, +rest} P.Near{+at, +g, +acc}:
      q.back_same(rest, P.Near{Some{s}, g, P.Mark{s, True{}} <> acc}, h)
    case Con{P.Mark{+s, False{}}, +rest} P.Near{+at, +g, +acc}:
      +n2 = P.near.at(s, at, g, acc, P.after(at, s))
      %q.nat_false(s, at, g, acc, P.after(at, s), q.back_grew_false(rest, n2, h)) : {q.nacc(P.back.go(rest, n2)) == P.rev.go(rest, q.nacc(_)) : List<&2, P.Mark>}
      q.back_same(rest, n2, h)

def q.fwd_same(ms: +List<P.Mark>, +n: P.Near, +h: {q.ngrew(P.fwd.go(ms, n)) == False{} : Bool}) -> {q.nacc(P.fwd.go(ms, n)) == P.rev.go(ms, q.nacc(n)) : List<&2, P.Mark>}:
  match ms n:
    case Nil{} _:
      {==}
    case Con{P.Mark{+s, True{}}, +rest} P.Near{+at, +g, +acc}:
      q.fwd_same(rest, P.Near{Some{s}, g, P.Mark{s, True{}} <> acc}, h)
    case Con{P.Mark{+s, False{}}, +rest} P.Near{+at, +g, +acc}:
      +n2 = P.near.at(s, at, g, acc, P.before(at, s))
      %q.nat_false(s, at, g, acc, P.before(at, s), q.fwd_grew_false(rest, n2, h)) : {q.nacc(P.fwd.go(rest, n2)) == P.rev.go(rest, q.nacc(_)) : List<&2, P.Mark>}
      q.fwd_same(rest, n2, h)

def q.Gt1(+m: P.Mark, +n: P.Mark) -> Type:
  match m n:
    case P.Mark{s, t} P.Mark{s2, t2}:
      Laws.Gate(t, t2, Laws.Touches(s, s2))

def q.G1all(+m: P.Mark, ns: +List<P.Mark>) -> Type:
  match ns:
    case Nil{}:
      Unit
    case Con{n, r}:
      q.Gt1(m, n) & q.G1all(m, r)

def q.G1(ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{m, r}:
      q.G1all(m, r) & q.G1(r)

def q.NoneT(ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{s, True{}}, r}:
      Empty
    case Con{P.Mark{s, False{}}, r}:
      q.NoneT(r)

def q.TakenFrom(ms: +List<P.Mark>, +v: Nat) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{P.Span{a, b, c, d}, True{}}, r}:
      {Nat.is_le(v, a) == True{} : Bool} & q.TakenFrom(r, v)
    case Con{P.Mark{s, False{}}, r}:
      q.TakenFrom(r, v)

def q.StartsGe(ms: +List<P.Mark>, +v: Nat) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{P.Span{a, b, c, d}, t}, r}:
      {Nat.is_le(v, a) == True{} : Bool} & q.StartsGe(r, v)

def q.AtG(at: Maybe<&2, P.Span>, +ms: +List<P.Mark>) -> Type:
  match at:
    case None{}:
      q.NoneT(ms)
    case Some{P.Span{fa, fb, fc, fd}}:
      q.TakenFrom(ms, fa)

def q.GB(+n: P.Near, +a: Nat) -> Type:
  q.G1(q.nacc(n)) & (q.AtG(q.nat(n), q.nacc(n)) & q.StartsGe(q.nacc(n), a))

def q.g1all_true(+s: P.Span, acc: +List<P.Mark>) -> q.G1all(P.Mark{s, True{}}, acc):
  match acc:
    case Nil{}:
      Unit{}
    case Con{P.Mark{s2, True{}}, +r}:
      (Unit{}, q.g1all_true(s, r))
    case Con{P.Mark{s2, False{}}, +r}:
      (Unit{}, q.g1all_true(s, r))

def q.g1all_none(+s: P.Span, acc: +List<P.Mark>, nt: q.NoneT(acc)) -> q.G1all(P.Mark{s, False{}}, acc):
  match acc:
    case Nil{}:
      Unit{}
    case Con{P.Mark{s2, True{}}, r}:
      Empty.absurd(q.G1all(P.Mark{s, False{}}, P.Mark{s2, True{}} <> r), nt)
    case Con{P.Mark{s2, False{}}, +r}:
      (Unit{}, q.g1all_none(s, r, nt))

def q.g1all_from(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, acc: +List<P.Mark>, +fa: Nat, +le_dfa: {Nat.is_le(sd, fa) == True{} : Bool}, tf: q.TakenFrom(acc, fa))
  -> q.G1all(P.Mark{P.Span{sa, sb, sc, sd}, False{}}, acc):
  match acc:
    case Nil{}:
      Unit{}
    case Con{P.Mark{P.Span{+na, +nb, +nc, +nd}, True{}}, +r}:
      (h, tr) = tf
      +lt_f = q.le_not_lt(sd, na, le_trans(sd, fa, na, le_dfa, h))
      +g = {
        %Equal.sym(Bool, Nat.is_lt(na, sd), False{}, lt_f) : {Bool.and(Nat.is_lt(sc, nb), _) == False{} : Bool}
        and_false(Nat.is_lt(sc, nb))
      : {Bool.and(Nat.is_lt(sc, nb), Nat.is_lt(na, sd)) == False{} : Bool}}
      (g, q.g1all_from(sa, sb, sc, sd, r, fa, le_dfa, tr))
    case Con{P.Mark{s2, False{}}, +r}:
      (Unit{}, q.g1all_from(sa, sb, sc, sd, r, fa, le_dfa, tf))

def q.nonet_dup(ms: +List<P.Mark>, h: q.NoneT(ms)) -> q.NoneT(ms) & q.NoneT(ms):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{s, True{}}, r}:
      Empty.absurd(q.NoneT(P.Mark{s, True{}} <> r) & q.NoneT(P.Mark{s, True{}} <> r), h)
    case Con{P.Mark{s, False{}}, +r}:
      q.nonet_dup(r, h)

def q.tf_dup.k(-v: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -r: +List<P.Mark>, +x: {Nat.is_le(v, a) == True{} : Bool}, p: q.TakenFrom(r, v) & q.TakenFrom(r, v))
  -> q.TakenFrom(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v) & q.TakenFrom(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v):
  (y1, y2) = p
  ((x, y1), (x, y2))

def q.tf_dup(ms: +List<P.Mark>, +v: Nat, h: q.TakenFrom(ms, v)) -> q.TakenFrom(ms, v) & q.TakenFrom(ms, v):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{P.Span{+a, +b, +c, +d}, True{}}, +r}:
      (x, y) = h
      q.tf_dup.k(v, a, b, c, d, r, x, q.tf_dup(r, v, y))
    case Con{P.Mark{s, False{}}, +r}:
      q.tf_dup(r, v, h)

def q.atg_dup(at: Maybe<&2, P.Span>, +acc: +List<P.Mark>, h: q.AtG(at, acc)) -> q.AtG(at, acc) & q.AtG(at, acc):
  match at:
    case None{}:
      q.nonet_dup(acc, h)
    case Some{P.Span{+fa, fb, fc, fd}}:
      q.tf_dup(acc, fa, h)

def q.sg_weaken(ms: +List<P.Mark>, +v: Nat, +v2: Nat, +e: {Nat.is_le(v2, v) == True{} : Bool}, h: q.StartsGe(ms, v)) -> q.StartsGe(ms, v2):
  match ms:
    case Nil{}:
      Unit{}
    case Con{P.Mark{P.Span{+a, b, c, d}, t}, +r}:
      (x, y) = h
      (le_trans(v2, v, a, e, x), q.sg_weaken(r, v, v2, e, y))

def q.sg_tf.kt(-v: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -r: +List<P.Mark>, +x: {Nat.is_le(v, a) == True{} : Bool}, p: q.TakenFrom(r, v) & q.StartsGe(r, v))
  -> q.TakenFrom(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v) & q.StartsGe(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v):
  (y1, y2) = p
  ((x, y1), (x, y2))

def q.sg_tf.kf(-v: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -r: +List<P.Mark>, x: {Nat.is_le(v, a) == True{} : Bool}, p: q.TakenFrom(r, v) & q.StartsGe(r, v))
  -> q.TakenFrom(P.Mark{P.Span{a, b, c, d}, False{}} <> r, v) & q.StartsGe(P.Mark{P.Span{a, b, c, d}, False{}} <> r, v):
  (y1, y2) = p
  (y1, (x, y2))

def q.sg_tf(ms: +List<P.Mark>, +v: Nat, h: q.StartsGe(ms, v)) -> q.TakenFrom(ms, v) & q.StartsGe(ms, v):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{P.Span{+a, +b, +c, +d}, True{}}, +r}:
      (x, y) = h
      q.sg_tf.kt(v, a, b, c, d, r, x, q.sg_tf(r, v, y))
    case Con{P.Mark{P.Span{+a, +b, +c, +d}, False{}}, +r}:
      (x, y) = h
      q.sg_tf.kf(v, a, b, c, d, r, x, q.sg_tf(r, v, y))

def q.bg_true.k(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +g: Bool, +acc: +List<P.Mark>, g1: q.G1(acc), p: q.TakenFrom(acc, sa) & q.StartsGe(acc, sa))
  -> q.GB(P.Near{Some{P.Span{sa, sb, sc, sd}}, g, P.Mark{P.Span{sa, sb, sc, sd}, True{}} <> acc}, sa):
  (tf, sg) = p
  ((q.g1all_true(P.Span{sa, sb, sc, sd}, acc), g1), ((q.le_refl(sa), tf), (q.le_refl(sa), sg)))

def q.bg_true(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, +a: Nat,
  le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GB(P.Near{at, g, acc}, a))
  -> q.GB(P.Near{Some{P.Span{sa, sb, sc, sd}}, g, P.Mark{P.Span{sa, sb, sc, sd}, True{}} <> acc}, sa):
  (ca, (ab, bd)) = fr
  (g1, (atg, st)) = inv
  q.bg_true.k(sa, sb, sc, sd, g, acc, g1, q.sg_tf(acc, sa, q.sg_weaken(acc, a, sa, lt_imp_le(sa, a, lt_le_trans(sa, sb, a, ab, le_ba)), st)))

def q.bg_false.k(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>,
  he: {P.after(at, P.Span{sa, sb, sc, sd}) == False{} : Bool}, g1: q.G1(acc), p: q.AtG(at, acc) & q.AtG(at, acc), sg: q.StartsGe(acc, sa))
  -> q.GB(P.Near{at, g, P.Mark{P.Span{sa, sb, sc, sd}, False{}} <> acc}, sa):
  match at:
    case None{}:
      (a1, a2) = p
      ((q.g1all_none(P.Span{sa, sb, sc, sd}, acc, a1), g1), (a2, (q.le_refl(sa), sg)))
    case Some{P.Span{+fa, +fb, +fc, +fd}}:
      (a1, a2) = p
      ((q.g1all_from(sa, sb, sc, sd, acc, fa, ge_le(fa, sd, lt_false_ge(fa, sd, he)), a1), g1), (a2, (q.le_refl(sa), sg)))

def q.bg_false(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, +a: Nat,
  he: {P.after(at, P.Span{sa, sb, sc, sd}) == False{} : Bool}, le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GB(P.Near{at, g, acc}, a))
  -> q.GB(P.Near{at, g, P.Mark{P.Span{sa, sb, sc, sd}, False{}} <> acc}, sa):
  (ca, (ab, bd)) = fr
  (g1, (atg, st)) = inv
  q.bg_false.k(sa, sb, sc, sd, at, g, acc, he, g1, q.atg_dup(at, acc, atg), q.sg_weaken(acc, a, sa, lt_imp_le(sa, a, lt_le_trans(sa, sb, a, ab, le_ba)), st))

def q.bg_f(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, +a: Nat, e: Bool,
  he: {P.after(at, P.Span{sa, sb, sc, sd}) == e : Bool}, hs: {q.ngrew(P.near.at(P.Span{sa, sb, sc, sd}, at, g, acc, e)) == False{} : Bool},
  le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GB(P.Near{at, g, acc}, a))
  -> q.GB(P.near.at(P.Span{sa, sb, sc, sd}, at, g, acc, e), sa):
  match e:
    case True{}:
      Empty.absurd(q.GB(P.Near{Some{P.Span{sa, sb, sc, sd}}, True{}, P.Mark{P.Span{sa, sb, sc, sd}, True{}} <> acc}, sa), ft(Equal.sym(Bool, True{}, False{}, hs)))
    case False{}:
      q.bg_false(sa, sb, sc, sd, at, g, acc, a, he, le_ba, fr, inv)

def q.bg_step(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, t: Bool, n: P.Near, +a: Nat, hs: {q.ngrew(P.back.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n)) == False{} : Bool},
  le_ba: {Nat.is_le(sb, a) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GB(n, a))
  -> q.GB(P.back.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n), sa):
  match t n:
    case True{} P.Near{at, +g, +acc}:
      q.bg_true(sa, sb, sc, sd, at, g, acc, a, le_ba, fr, inv)
    case False{} P.Near{+at, +g, +acc}:
      q.bg_f(sa, sb, sc, sd, at, g, acc, a, P.after(at, P.Span{sa, sb, sc, sd}), {==}, hs, le_ba, fr, inv)

def q.back_g1(ms: +List<P.Mark>, +n: P.Near, +a: Nat, +h: {q.ngrew(P.back.go(ms, n)) == False{} : Bool}, geo: q.RevFrom(a, Laws.SpansOf(ms)), inv: q.GB(n, a))
  -> q.G1(q.nacc(P.back.go(ms, n))):
  match ms:
    case Nil{}:
      (g1, rest) = inv
      g1
    case Con{P.Mark{P.Span{+sa, +sb, +sc, +sd}, +t}, +rest}:
      (le_ba, (fr, geo2)) = geo
      +n2 = P.back.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n)
      q.back_g1(rest, n2, sa, h, geo2, q.bg_step(sa, sb, sc, sd, t, n, a, q.back_grew_false(rest, n2, h), le_ba, fr, inv))

def q.TakenEnds(ms: +List<P.Mark>, +v: Nat) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{P.Span{a, b, c, d}, True{}}, r}:
      {Nat.is_le(b, v) == True{} : Bool} & q.TakenEnds(r, v)
    case Con{P.Mark{s, False{}}, r}:
      q.TakenEnds(r, v)

def q.EndsLe(ms: +List<P.Mark>, +v: Nat) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{P.Span{a, b, c, d}, t}, r}:
      {Nat.is_le(b, v) == True{} : Bool} & q.EndsLe(r, v)

def q.AtGF(at: Maybe<&2, P.Span>, +ms: +List<P.Mark>) -> Type:
  match at:
    case None{}:
      q.NoneT(ms)
    case Some{P.Span{la, lb, lc, ld}}:
      q.TakenEnds(ms, lb)

def q.GF(+n: P.Near, +a: Nat) -> Type:
  q.G1(q.nacc(n)) & (q.AtGF(q.nat(n), q.nacc(n)) & q.EndsLe(q.nacc(n), a))

def q.g1all_fromF(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, acc: +List<P.Mark>, +lb: Nat, +le_lc: {Nat.is_le(lb, sc) == True{} : Bool}, te: q.TakenEnds(acc, lb))
  -> q.G1all(P.Mark{P.Span{sa, sb, sc, sd}, False{}}, acc):
  match acc:
    case Nil{}:
      Unit{}
    case Con{P.Mark{P.Span{+na, +nb, +nc, +nd}, True{}}, +r}:
      (h, tr) = te
      +lt_f = q.le_not_lt(nb, sc, le_trans(nb, lb, sc, h, le_lc))
      +g = {
        %Equal.sym(Bool, Nat.is_lt(sc, nb), False{}, lt_f) : {Bool.and(_, Nat.is_lt(na, sd)) == False{} : Bool}
        {==}
      : {Bool.and(Nat.is_lt(sc, nb), Nat.is_lt(na, sd)) == False{} : Bool}}
      (g, q.g1all_fromF(sa, sb, sc, sd, r, lb, le_lc, tr))
    case Con{P.Mark{s2, False{}}, +r}:
      (Unit{}, q.g1all_fromF(sa, sb, sc, sd, r, lb, le_lc, te))

def q.te_dup.k(-v: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -r: +List<P.Mark>, +x: {Nat.is_le(b, v) == True{} : Bool}, p: q.TakenEnds(r, v) & q.TakenEnds(r, v))
  -> q.TakenEnds(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v) & q.TakenEnds(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v):
  (y1, y2) = p
  ((x, y1), (x, y2))

def q.te_dup(ms: +List<P.Mark>, +v: Nat, h: q.TakenEnds(ms, v)) -> q.TakenEnds(ms, v) & q.TakenEnds(ms, v):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{P.Span{+a, +b, +c, +d}, True{}}, +r}:
      (x, y) = h
      q.te_dup.k(v, a, b, c, d, r, x, q.te_dup(r, v, y))
    case Con{P.Mark{s, False{}}, +r}:
      q.te_dup(r, v, h)

def q.atgf_dup(at: Maybe<&2, P.Span>, +acc: +List<P.Mark>, h: q.AtGF(at, acc)) -> q.AtGF(at, acc) & q.AtGF(at, acc):
  match at:
    case None{}:
      q.nonet_dup(acc, h)
    case Some{P.Span{la, +lb, lc, ld}}:
      q.te_dup(acc, lb, h)

def q.el_weaken(ms: +List<P.Mark>, +v: Nat, +v2: Nat, +e: {Nat.is_le(v, v2) == True{} : Bool}, h: q.EndsLe(ms, v)) -> q.EndsLe(ms, v2):
  match ms:
    case Nil{}:
      Unit{}
    case Con{P.Mark{P.Span{a, +b, c, d}, t}, +r}:
      (x, y) = h
      (le_trans(b, v, v2, x, e), q.el_weaken(r, v, v2, e, y))

def q.el_te.kt(-v: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -r: +List<P.Mark>, +x: {Nat.is_le(b, v) == True{} : Bool}, p: q.TakenEnds(r, v) & q.EndsLe(r, v))
  -> q.TakenEnds(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v) & q.EndsLe(P.Mark{P.Span{a, b, c, d}, True{}} <> r, v):
  (y1, y2) = p
  ((x, y1), (x, y2))

def q.el_te.kf(-v: Nat, -a: Nat, -b: Nat, -c: Nat, -d: Nat, -r: +List<P.Mark>, x: {Nat.is_le(b, v) == True{} : Bool}, p: q.TakenEnds(r, v) & q.EndsLe(r, v))
  -> q.TakenEnds(P.Mark{P.Span{a, b, c, d}, False{}} <> r, v) & q.EndsLe(P.Mark{P.Span{a, b, c, d}, False{}} <> r, v):
  (y1, y2) = p
  (y1, (x, y2))

def q.el_te(ms: +List<P.Mark>, +v: Nat, h: q.EndsLe(ms, v)) -> q.TakenEnds(ms, v) & q.EndsLe(ms, v):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{P.Span{+a, +b, +c, +d}, True{}}, +r}:
      (x, y) = h
      q.el_te.kt(v, a, b, c, d, r, x, q.el_te(r, v, y))
    case Con{P.Mark{P.Span{+a, +b, +c, +d}, False{}}, +r}:
      (x, y) = h
      q.el_te.kf(v, a, b, c, d, r, x, q.el_te(r, v, y))

def q.fg_true.k(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +g: Bool, +acc: +List<P.Mark>, g1: q.G1(acc), p: q.TakenEnds(acc, sb) & q.EndsLe(acc, sb))
  -> q.GF(P.Near{Some{P.Span{sa, sb, sc, sd}}, g, P.Mark{P.Span{sa, sb, sc, sd}, True{}} <> acc}, sb):
  (te, el) = p
  ((q.g1all_true(P.Span{sa, sb, sc, sd}, acc), g1), ((q.le_refl(sb), te), (q.le_refl(sb), el)))

def q.fg_true(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, +a: Nat,
  le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GF(P.Near{at, g, acc}, a))
  -> q.GF(P.Near{Some{P.Span{sa, sb, sc, sd}}, g, P.Mark{P.Span{sa, sb, sc, sd}, True{}} <> acc}, sb):
  (ca, (ab, bd)) = fr
  (g1, (atg, st)) = inv
  q.fg_true.k(sa, sb, sc, sd, g, acc, g1, q.el_te(acc, sb, q.el_weaken(acc, a, sb, lt_imp_le(a, sb, q.le_lt_trans(a, sa, sb, le_as, ab)), st)))

def q.fg_false.k(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>,
  he: {P.before(at, P.Span{sa, sb, sc, sd}) == False{} : Bool}, g1: q.G1(acc), p: q.AtGF(at, acc) & q.AtGF(at, acc), el: q.EndsLe(acc, sb))
  -> q.GF(P.Near{at, g, P.Mark{P.Span{sa, sb, sc, sd}, False{}} <> acc}, sb):
  match at:
    case None{}:
      (a1, a2) = p
      ((q.g1all_none(P.Span{sa, sb, sc, sd}, acc, a1), g1), (a2, (q.le_refl(sb), el)))
    case Some{P.Span{+la, +lb, +lc, +ld}}:
      (a1, a2) = p
      ((q.g1all_fromF(sa, sb, sc, sd, acc, lb, gt_false_le(lb, sc, he), a1), g1), (a2, (q.le_refl(sb), el)))

def q.fg_false(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, +a: Nat,
  he: {P.before(at, P.Span{sa, sb, sc, sd}) == False{} : Bool}, le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GF(P.Near{at, g, acc}, a))
  -> q.GF(P.Near{at, g, P.Mark{P.Span{sa, sb, sc, sd}, False{}} <> acc}, sb):
  (ca, (ab, bd)) = fr
  (g1, (atg, st)) = inv
  q.fg_false.k(sa, sb, sc, sd, at, g, acc, he, g1, q.atgf_dup(at, acc, atg), q.el_weaken(acc, a, sb, lt_imp_le(a, sb, q.le_lt_trans(a, sa, sb, le_as, ab)), st))

def q.fg_f(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, +a: Nat, e: Bool,
  he: {P.before(at, P.Span{sa, sb, sc, sd}) == e : Bool}, hs: {q.ngrew(P.near.at(P.Span{sa, sb, sc, sd}, at, g, acc, e)) == False{} : Bool},
  le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GF(P.Near{at, g, acc}, a))
  -> q.GF(P.near.at(P.Span{sa, sb, sc, sd}, at, g, acc, e), sb):
  match e:
    case True{}:
      Empty.absurd(q.GF(P.Near{Some{P.Span{sa, sb, sc, sd}}, True{}, P.Mark{P.Span{sa, sb, sc, sd}, True{}} <> acc}, sb), ft(Equal.sym(Bool, True{}, False{}, hs)))
    case False{}:
      q.fg_false(sa, sb, sc, sd, at, g, acc, a, he, le_as, fr, inv)

def q.fg_step(+sa: Nat, +sb: Nat, +sc: Nat, +sd: Nat, t: Bool, n: P.Near, +a: Nat, hs: {q.ngrew(P.fwd.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n)) == False{} : Bool},
  le_as: {Nat.is_le(a, sa) == True{} : Bool}, fr: Laws.Framed(P.Span{sa, sb, sc, sd}), inv: q.GF(n, a))
  -> q.GF(P.fwd.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n), sb):
  match t n:
    case True{} P.Near{at, +g, +acc}:
      q.fg_true(sa, sb, sc, sd, at, g, acc, a, le_as, fr, inv)
    case False{} P.Near{+at, +g, +acc}:
      q.fg_f(sa, sb, sc, sd, at, g, acc, a, P.before(at, P.Span{sa, sb, sc, sd}), {==}, hs, le_as, fr, inv)

def q.fwd_g1(ms: +List<P.Mark>, +n: P.Near, +a: Nat, +h: {q.ngrew(P.fwd.go(ms, n)) == False{} : Bool}, geo: Laws.SpansFrom(a, Laws.SpansOf(ms)), inv: q.GF(n, a))
  -> q.G1(q.nacc(P.fwd.go(ms, n))):
  match ms:
    case Nil{}:
      (g1, rest) = inv
      g1
    case Con{P.Mark{P.Span{+sa, +sb, +sc, +sd}, +t}, +rest}:
      (le_as, (fr, geo2)) = geo
      +n2 = P.fwd.step(P.Mark{P.Span{sa, sb, sc, sd}, t}, n)
      q.fwd_g1(rest, n2, sb, h, geo2, q.fg_step(sa, sb, sc, sd, t, n, a, q.fwd_grew_false(rest, n2, h), le_as, fr, inv))

def q.G2all(+m: P.Mark, ns: +List<P.Mark>) -> Type:
  match ns:
    case Nil{}:
      Unit
    case Con{n, r}:
      q.Gt1(n, m) & q.G2all(m, r)

def q.G2(ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{m, r}:
      q.G2all(m, r) & q.G2(r)

def q.AllG(xs: +List<P.Mark>, +acc: +List<P.Mark>) -> Type:
  match xs:
    case Nil{}:
      Unit
    case Con{m, r}:
      q.G1all(m, acc) & q.AllG(r, acc)

def q.allg_split.k(+m: P.Mark, -r: +List<P.Mark>, +x: P.Mark, -acc: +List<P.Mark>, gmx: q.Gt1(m, x), gma: q.G1all(m, acc), p: q.G2all(x, r) & q.AllG(r, acc))
  -> q.G2all(x, m <> r) & q.AllG(m <> r, acc):
  (a, b) = p
  ((gmx, a), (gma, b))

def q.allg_split(xr: +List<P.Mark>, +x: P.Mark, +acc: +List<P.Mark>, h: q.AllG(xr, x <> acc)) -> q.G2all(x, xr) & q.AllG(xr, acc):
  match xr:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{+m, +r}:
      ((gmx, gma), rest) = h
      q.allg_split.k(m, r, x, acc, gmx, gma, q.allg_split(r, x, acc, rest))

def q.g1_rev.k2(+x: P.Mark, -xr: +List<P.Mark>, -acc: +List<P.Mark>, g2r: q.G2(xr), g1x: q.G1all(x, acc), g1a: q.G1(acc), sp: q.G2all(x, xr) & q.AllG(xr, acc))
  -> q.G2(x <> xr) & (q.AllG(x <> xr, acc) & q.G1(acc)):
  (g2x, ar) = sp
  ((g2x, g2r), ((g1x, ar), g1a))

def q.g1_rev.k1(+x: P.Mark, +xr: +List<P.Mark>, +acc: +List<P.Mark>, p: q.G2(xr) & (q.AllG(xr, x <> acc) & q.G1(x <> acc)))
  -> q.G2(x <> xr) & (q.AllG(x <> xr, acc) & q.G1(acc)):
  (g2r, (ag, (g1x, g1a))) = p
  q.g1_rev.k2(x, xr, acc, g2r, g1x, g1a, q.allg_split(xr, x, acc, ag))

def q.g1_rev(xs: +List<P.Mark>, +acc: +List<P.Mark>, h: q.G1(P.rev.go(xs, acc))) -> q.G2(xs) & (q.AllG(xs, acc) & q.G1(acc)):
  match xs:
    case Nil{}:
      (Unit{}, (Unit{}, h))
    case Con{+x, +xr}:
      q.g1_rev.k1(x, xr, acc, q.g1_rev(xr, x <> acc, h))

def q.zip_nta(+m: P.Mark, ns: +List<P.Mark>, a: q.G1all(m, ns), b: q.G2all(m, ns)) -> Laws.NoTouchAll(m, ns):
  match m ns:
    case P.Mark{+s, +t} Nil{}:
      Unit{}
    case P.Mark{+s, +t} Con{P.Mark{+s2, +t2}, +r}:
      (a1, a2) = a
      (b1, b2) = b
      ((a1, b1), q.zip_nta(P.Mark{s, t}, r, a2, b2))

def q.zip_un(ms: +List<P.Mark>, a: q.G1(ms), b: q.G2(ms)) -> Laws.Untouched(ms):
  match ms:
    case Nil{}:
      Unit{}
    case Con{+m, +r}:
      (a1, a2) = a
      (b1, b2) = b
      (q.zip_nta(m, r, a1, b1), q.zip_un(r, a2, b2))

def q.closed_of.k(+F: +List<P.Mark>, g1F: q.G1(F), p: q.G2(F) & (q.AllG(F, Nil{}) & q.G1(Nil{}))) -> Laws.Untouched(F):
  (g2F, rest) = p
  q.zip_un(F, g1F, g2F)

def q.closed_of(+F: +List<P.Mark>, g1F: q.G1(F), g1R: q.G1(P.rev.go(F, Nil{}))) -> Laws.Untouched(F):
  q.closed_of.k(F, g1F, q.g1_rev(F, Nil{}, g1R))

def q.mapp(xs: +List<P.Mark>, ys: +List<P.Mark>) -> List<&2, P.Mark>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      x <> q.mapp(rest, ys)

def q.mrev2(xs: +List<P.Mark>, +ys: +List<P.Mark>, +zs: +List<P.Mark>) -> {P.rev.go(P.rev.go(xs, ys), zs) == P.rev.go(ys, q.mapp(xs, zs)) : List<&2, P.Mark>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      q.mrev2(rest, x <> ys, zs)

def q.mapp_nil(xs: +List<P.Mark>) -> {q.mapp(xs, Nil{}) == xs : List<&2, P.Mark>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %q.mapp_nil(rest) : {x <> q.mapp(rest, Nil{}) == x <> _ : List<&2, P.Mark>}
      {==}

def q.mrev_mrev(+xs: +List<P.Mark>) -> {P.rev.go(P.rev.go(xs, Nil{}), Nil{}) == xs : List<&2, P.Mark>}:
  Equal.trans(List<&2, P.Mark>, P.rev.go(P.rev.go(xs, Nil{}), Nil{}), q.mapp(xs, Nil{}), xs, q.mrev2(xs, Nil{}, Nil{}), q.mapp_nil(xs))

def q.AllT(ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{s, True{}}, r}:
      q.AllT(r)
    case Con{P.Mark{s, False{}}, r}:
      Empty

def q.cnt0_allt(ms: +List<P.Mark>, h: {q.cnt(ms) == 0n : Nat}) -> q.AllT(ms):
  match ms:
    case Nil{}:
      Unit{}
    case Con{P.Mark{s, True{}}, +r}:
      q.cnt0_allt(r, h)
    case Con{P.Mark{s, False{}}, +r}:
      Empty.absurd(Empty, s_ne_z(q.cnt(r), h))

def q.allt_rev(ms: +List<P.Mark>, +acc: +List<P.Mark>, a1: q.AllT(ms), a2: q.AllT(acc)) -> q.AllT(P.rev.go(ms, acc)):
  match ms:
    case Nil{}:
      a2
    case Con{P.Mark{+s, True{}}, +r}:
      q.allt_rev(r, P.Mark{s, True{}} <> acc, a1, a2)
    case Con{P.Mark{s, False{}}, r}:
      Empty.absurd(q.AllT(P.rev.go(P.Mark{s, False{}} <> r, acc)), a1)

def q.allt_nta(+s: P.Span, ns: +List<P.Mark>, h: q.AllT(ns)) -> Laws.NoTouchAll(P.Mark{s, True{}}, ns):
  match ns:
    case Nil{}:
      Unit{}
    case Con{P.Mark{s2, True{}}, +r}:
      ((Unit{}, Unit{}), q.allt_nta(s, r, h))
    case Con{P.Mark{s2, False{}}, r}:
      Empty.absurd(Laws.NoTouchAll(P.Mark{s, True{}}, P.Mark{s2, False{}} <> r), h)

def q.allt_dup(ms: +List<P.Mark>, h: q.AllT(ms)) -> q.AllT(ms) & q.AllT(ms):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{s, True{}}, +r}:
      q.allt_dup(r, h)
    case Con{P.Mark{s, False{}}, r}:
      Empty.absurd(q.AllT(P.Mark{s, False{}} <> r) & q.AllT(P.Mark{s, False{}} <> r), h)

def q.allt_un(ms: +List<P.Mark>, hp: q.AllT(ms) & q.AllT(ms)) -> Laws.Untouched(ms):
  match ms:
    case Nil{}:
      Unit{}
    case Con{P.Mark{+s, True{}}, +r}:
      (h1, h2) = hp
      (q.allt_nta(s, r, h1), q.allt_un(r, q.allt_dup(r, h2)))
    case Con{P.Mark{s, False{}}, r}:
      (h1, h2) = hp
      Empty.absurd(Laws.Untouched(P.Mark{s, False{}} <> r), h1)

def q.Inv(+u: Nat, pr: P.Pass) -> Type:
  match pr:
    case P.Pass{+r, True{}}:
      {Nat.is_le(q.cnt(r), u) == True{} : Bool}
    case P.Pass{+r, False{}}:
      Laws.Untouched(P.rev.go(r, Nil{}))

def q.cast_g1(-A: +List<P.Mark>, -B: +List<P.Mark>, e: {A == B : List<&2, P.Mark>}, h: q.G1(A)) -> q.G1(B):
  %e : q.G1(_)
  h

def q.roundend_inv.k(+F: +List<P.Mark>, +r2: +List<P.Mark>, g1F: q.G1(F), p: {r2 == P.rev.go(F, Nil{}) : List<&2, P.Mark>} & q.G1(r2))
  -> Laws.Untouched(P.rev.go(r2, Nil{})):
  (+er2, g1r) = p
  +back = Equal.trans(List<&2, P.Mark>, P.rev.go(r2, Nil{}), P.rev.go(P.rev.go(F, Nil{}), Nil{}), F,
    Equal.cong(List<&2, P.Mark>, List<&2, P.Mark>, x => P.rev.go(x, Nil{}), r2, P.rev.go(F, Nil{}), er2), q.mrev_mrev(F))
  %Equal.sym(List<&2, P.Mark>, P.rev.go(r2, Nil{}), F, back) : Laws.Untouched(_)
  q.closed_of(F, g1F, q.cast_g1(r2, P.rev.go(F, Nil{}), er2, g1r))

def q.roundend_inv(g1: Bool, f: P.Near, +v: Nat, +r: +List<P.Mark>, +F: +List<P.Mark>,
  cB: {Nat.is_le(Nat.add(q.bn(g1), q.cnt(F)), q.cnt(r)) == True{} : Bool}, cR: {Nat.is_le(q.cnt(r), 1n+v) == True{} : Bool},
  cF: {Nat.is_le(Nat.add(q.bn(q.ngrew(f)), q.cnt(q.nacc(f))), q.cnt(F)) == True{} : Bool},
  noB: {g1 == False{} : Bool} -> q.G1(F),
  noF: {q.ngrew(f) == False{} : Bool} -> ({q.nacc(f) == P.rev.go(F, Nil{}) : List<&2, P.Mark>} & q.G1(q.nacc(f))))
  -> q.Inv(v, P.round.end(g1, f)):
  match g1 f:
    case True{} P.Near{at2, +g2, +r2}:
      +e1 = le_trans(q.cnt(r2), Nat.add(q.bn(g2), q.cnt(r2)), q.cnt(F), q.le_bn(g2, q.cnt(r2)), cF)
      le_trans(1n+q.cnt(r2), q.cnt(r), 1n+v, le_trans(1n+q.cnt(r2), 1n+q.cnt(F), q.cnt(r), e1, cB), cR)
    case False{} P.Near{at2, True{}, +r2}:
      le_trans(1n+q.cnt(r2), q.cnt(r), 1n+v, le_trans(1n+q.cnt(r2), q.cnt(F), q.cnt(r), cF, cB), cR)
    case False{} P.Near{at2, False{}, +r2}:
      q.roundend_inv.k(F, r2, noB({==}), noF({==}))

def q.roundfwd_inv(b: P.Near, +v: Nat, +r: +List<P.Mark>,
  cB: {Nat.is_le(Nat.add(q.bn(q.ngrew(b)), q.cnt(q.nacc(b))), q.cnt(r)) == True{} : Bool}, cR: {Nat.is_le(q.cnt(r), 1n+v) == True{} : Bool},
  noB: {q.ngrew(b) == False{} : Bool} -> q.G1(q.nacc(b)), geo: Laws.SpansFrom(0n, Laws.SpansOf(q.nacc(b))))
  -> q.Inv(v, P.round.fwd(b)):
  match b:
    case P.Near{at, +g1, +F}:
      +n0 = {P.Near{None{}, False{}, Nil{}} : P.Near}
      +f = P.fwd.go(F, n0)
      +cF = q.cnt_le_eq(Nat.add(q.bn(q.ngrew(f)), q.cnt(q.nacc(f))), Nat.add(q.cnt(F), 0n), q.cnt(F), Equal.sym(Nat, q.cnt(F), Nat.add(q.cnt(F), 0n), add_zero(q.cnt(F))), q.fwd_cnt(F, n0))
      q.roundend_inv(g1, f, v, r, F, cB, cR, cF, noB, +h => (q.fwd_same(F, n0, h), q.fwd_g1(F, n0, 0n, h, geo, (Unit{}, (Unit{}, Unit{})))))

def q.round_inv(+r: +List<P.Mark>, +v: Nat, +ss: +List<P.Span>, +top: Nat, +sr: {Laws.SpansOf(r) == q.srev(ss, Nil{}) : List<&2, P.Span>},
  cR: {Nat.is_le(q.cnt(r), 1n+v) == True{} : Bool}, gF: Laws.SpansFrom(0n, ss), gR: q.RevFrom(top, q.srev(ss, Nil{})))
  -> q.Inv(v, P.round(r)):
  +n0 = {P.Near{None{}, False{}, Nil{}} : P.Near}
  +b = P.back.go(r, n0)
  +sF = Equal.trans(List<&2, P.Span>, Laws.SpansOf(q.nacc(b)), q.srev(Laws.SpansOf(r), Nil{}), ss,
    q.back_spans(r, n0),
    Equal.trans(List<&2, P.Span>, q.srev(Laws.SpansOf(r), Nil{}), q.srev(q.srev(ss, Nil{}), Nil{}), ss,
      Equal.cong(List<&2, P.Span>, List<&2, P.Span>, x => q.srev(x, Nil{}), Laws.SpansOf(r), q.srev(ss, Nil{}), sr),
      q.srev_srev(ss)))
  +cB = q.cnt_le_eq(Nat.add(q.bn(q.ngrew(b)), q.cnt(q.nacc(b))), Nat.add(q.cnt(r), 0n), q.cnt(r), Equal.sym(Nat, q.cnt(r), Nat.add(q.cnt(r), 0n), add_zero(q.cnt(r))), q.back_cnt(r, n0))
  q.roundfwd_inv(b, v, r, cB, cR,
    +h => q.back_g1(r, n0, top, h, q.cast_rev(top, Laws.SpansOf(r), q.srev(ss, Nil{}), sr, gR), (Unit{}, (Unit{}, Unit{}))),
    q.cast_sp(0n, Laws.SpansOf(q.nacc(b)), ss, sF, gF))

def q.loop_closed(u: Nat, pr: P.Pass, +ss: +List<P.Span>, +top: Nat, +sr: {Laws.SpansOf(q.pms(pr)) == q.srev(ss, Nil{}) : List<&2, P.Span>}, inv: q.Inv(u, pr),
  gF: Laws.SpansFrom(0n, ss) & Laws.SpansFrom(0n, ss), gR: q.RevFrom(top, q.srev(ss, Nil{})) & q.RevFrom(top, q.srev(ss, Nil{})))
  -> Laws.Untouched(P.rev.go(P.loop(u, pr), Nil{})):
  match u pr:
    case 0n P.Pass{+r, True{}}:
      +rr = P.rev.go(r, Nil{})
      q.allt_un(rr, q.allt_dup(rr, q.allt_rev(r, Nil{}, q.cnt0_allt(r, q.le_zero(q.cnt(r), inv)), Unit{})))
    case 0n P.Pass{r, False{}}:
      inv
    case 1n++v P.Pass{+r, True{}}:
      (gF1, gF2) = gF
      (gR1, gR2) = gR
      q.loop_closed(v, P.round(r), ss, top, Equal.trans(List<&2, P.Span>, Laws.SpansOf(q.pms(P.round(r))), Laws.SpansOf(r), q.srev(ss, Nil{}), q.round_spans(r), sr),
        q.round_inv(r, v, ss, top, sr, inv, gF1, gR1), q.sp_dup(ss, 0n, gF2), q.rv_dup(q.srev(ss, Nil{}), top, gR2))
    case 1n+v P.Pass{r, False{}}:
      inv

def q.l2(+bs: +List<Nat>, +ss: +List<P.Span>, ap: Laws.SpansFrom(0n, ss) & Laws.SpansFrom(0n, ss)) -> Laws.Untouched(P.taken(bs, ss)):
  (a1, a2) = ap
  +r0 = P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})
  +top = q.lastend(ss, 0n)
  +e = Equal.trans(Nat, q.cnt(r0), Nat.add(q.cnt(r0), 0n), P.untaken.go(r0, 0n), add_zero(q.cnt(r0)), Equal.sym(Nat, P.untaken.go(r0, 0n), Nat.add(q.cnt(r0), 0n), q.untaken_eq(r0, 0n)))
  q.loop_closed(P.untaken.go(r0, 0n), P.Pass{r0, True{}}, ss, top, q.walk_spans(ss, P.Walk{Nil{}, bs, Nil{}}),
    q.cnt_le_eq(q.cnt(r0), q.cnt(r0), P.untaken.go(r0, 0n), e, q.le_refl(q.cnt(r0))),
    q.sp_dup(ss, 0n, a1), q.rv_dup(q.srev(ss, Nil{}), top, q.rev_geo(ss, 0n, Nil{}, a2, Unit{})))

def Laws.parts_untaken_matches_touch_no_taken_span(bs, ss, apart):
  q.l2(bs, ss, q.sp_dup(ss, 0n, apart))

def q.back_fast_eq(ms: +List<P.Mark>, e: Bool, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, he: {P.hit.back(ms, at) == e : Bool})
  -> {P.back.fast(ms, e, at, g, acc) == P.back.go(ms, P.Near{at, g, acc}) : P.Near}:
  match ms e:
    case Nil{} _:
      {==}
    case Con{P.Mark{s, True{}}, rest} True{}:
      Empty.absurd({P.back.fast(P.Mark{s, True{}} <> rest, True{}, at, g, acc) == P.back.go(P.Mark{s, True{}} <> rest, P.Near{at, g, acc}) : P.Near}, ft(he))
    case Con{P.Mark{+s, True{}}, +rest} False{}:
      q.back_fast_eq(rest, P.hit.back(rest, Some{s}), Some{s}, g, P.Mark{s, True{}} <> acc, {==})
    case Con{P.Mark{+s, False{}}, +rest} True{}:
      %Equal.sym(Bool, P.after(at, s), True{}, he) : {P.back.fast(rest, P.hit.back(rest, Some{s}), Some{s}, True{}, P.Mark{s, True{}} <> acc) == P.back.go(rest, P.near.at(s, at, g, acc, _)) : P.Near}
      q.back_fast_eq(rest, P.hit.back(rest, Some{s}), Some{s}, True{}, P.Mark{s, True{}} <> acc, {==})
    case Con{P.Mark{+s, False{}}, +rest} False{}:
      %Equal.sym(Bool, P.after(at, s), False{}, he) : {P.back.fast(rest, P.hit.back(rest, at), at, g, P.Mark{s, False{}} <> acc) == P.back.go(rest, P.near.at(s, at, g, acc, _)) : P.Near}
      q.back_fast_eq(rest, P.hit.back(rest, at), at, g, P.Mark{s, False{}} <> acc, {==})

def q.fwd_fast_eq(ms: +List<P.Mark>, e: Bool, +at: Maybe<&2, P.Span>, +g: Bool, +acc: +List<P.Mark>, he: {P.hit.fwd(ms, at) == e : Bool})
  -> {P.fwd.fast(ms, e, at, g, acc) == P.fwd.go(ms, P.Near{at, g, acc}) : P.Near}:
  match ms e:
    case Nil{} _:
      {==}
    case Con{P.Mark{s, True{}}, rest} True{}:
      Empty.absurd({P.fwd.fast(P.Mark{s, True{}} <> rest, True{}, at, g, acc) == P.fwd.go(P.Mark{s, True{}} <> rest, P.Near{at, g, acc}) : P.Near}, ft(he))
    case Con{P.Mark{+s, True{}}, +rest} False{}:
      q.fwd_fast_eq(rest, P.hit.fwd(rest, Some{s}), Some{s}, g, P.Mark{s, True{}} <> acc, {==})
    case Con{P.Mark{+s, False{}}, +rest} True{}:
      %Equal.sym(Bool, P.before(at, s), True{}, he) : {P.fwd.fast(rest, P.hit.fwd(rest, Some{s}), Some{s}, True{}, P.Mark{s, True{}} <> acc) == P.fwd.go(rest, P.near.at(s, at, g, acc, _)) : P.Near}
      q.fwd_fast_eq(rest, P.hit.fwd(rest, Some{s}), Some{s}, True{}, P.Mark{s, True{}} <> acc, {==})
    case Con{P.Mark{+s, False{}}, +rest} False{}:
      %Equal.sym(Bool, P.before(at, s), False{}, he) : {P.fwd.fast(rest, P.hit.fwd(rest, at), at, g, P.Mark{s, False{}} <> acc) == P.fwd.go(rest, P.near.at(s, at, g, acc, _)) : P.Near}
      q.fwd_fast_eq(rest, P.hit.fwd(rest, at), at, g, P.Mark{s, False{}} <> acc, {==})

def q.roundfwd_fast_eq(b: P.Near) -> {P.round.fast.fwd(b) == P.round.fwd(b) : P.Pass}:
  match b:
    case P.Near{at, +g, +ms}:
      Equal.cong(P.Near, P.Pass, f => P.round.end(g, f), P.fwd.fast(ms, P.hit.fwd(ms, None{}), None{}, False{}, Nil{}), P.fwd.go(ms, P.Near{None{}, False{}, Nil{}}),
        q.fwd_fast_eq(ms, P.hit.fwd(ms, None{}), None{}, False{}, Nil{}, {==}))

def q.round_fast_eq(+r: +List<P.Mark>) -> {P.round.fast(r) == P.round(r) : P.Pass}:
  +bf = P.back.fast(r, P.hit.back(r, None{}), None{}, False{}, Nil{})
  +bg = P.back.go(r, P.Near{None{}, False{}, Nil{}})
  Equal.trans(P.Pass, P.round.fast.fwd(bf), P.round.fast.fwd(bg), P.round.fwd(bg),
    Equal.cong(P.Near, P.Pass, b => P.round.fast.fwd(b), bf, bg, q.back_fast_eq(r, P.hit.back(r, None{}), None{}, False{}, Nil{}, {==})),
    q.roundfwd_fast_eq(bg))

def q.loop_fast_eq(u: Nat, pr: P.Pass) -> {P.loop.fast(u, pr) == P.loop(u, pr) : List<&2, P.Mark>}:
  match u pr:
    case 0n P.Pass{r, g}:
      {==}
    case 1n+v P.Pass{+r, True{}}:
      Equal.trans(List<&2, P.Mark>, P.loop.fast(v, P.round.fast(r)), P.loop.fast(v, P.round(r)), P.loop(v, P.round(r)),
        Equal.cong(P.Pass, List<&2, P.Mark>, p => P.loop.fast(v, p), P.round.fast(r), P.round(r), q.round_fast_eq(r)),
        q.loop_fast_eq(v, P.round(r)))
    case 1n+v P.Pass{r, False{}}:
      {==}

def q.AllF(ms: +List<P.Mark>) -> Type:
  match ms:
    case Nil{}:
      Unit
    case Con{P.Mark{s, True{}}, r}:
      Empty
    case Con{P.Mark{s, False{}}, r}:
      q.AllF(r)

def q.allf_of(ms: +List<P.Mark>, h: {P.any_taken(ms) == False{} : Bool}) -> q.AllF(ms):
  match ms:
    case Nil{}:
      Unit{}
    case Con{P.Mark{s, True{}}, r}:
      Empty.absurd(Empty, ft(Equal.sym(Bool, True{}, False{}, h)))
    case Con{P.Mark{s, False{}}, +r}:
      q.allf_of(r, h)

def q.allf_rev(ms: +List<P.Mark>, +acc: +List<P.Mark>, a1: q.AllF(ms), a2: q.AllF(acc)) -> q.AllF(P.rev.go(ms, acc)):
  match ms:
    case Nil{}:
      a2
    case Con{P.Mark{s, True{}}, r}:
      Empty.absurd(q.AllF(P.rev.go(P.Mark{s, True{}} <> r, acc)), a1)
    case Con{P.Mark{+s, False{}}, +r}:
      q.allf_rev(r, P.Mark{s, False{}} <> acc, a1, a2)

def q.allf_dup(ms: +List<P.Mark>, h: q.AllF(ms)) -> q.AllF(ms) & q.AllF(ms):
  match ms:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{P.Mark{s, True{}}, r}:
      Empty.absurd(q.AllF(P.Mark{s, True{}} <> r) & q.AllF(P.Mark{s, True{}} <> r), h)
    case Con{P.Mark{s, False{}}, +r}:
      q.allf_dup(r, h)

def q.back_still(ms: +List<P.Mark>, +acc: +List<P.Mark>, h: q.AllF(ms)) -> {P.back.go(ms, P.Near{None{}, False{}, acc}) == P.Near{None{}, False{}, P.rev.go(ms, acc)} : P.Near}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{s, True{}}, r}:
      Empty.absurd({P.back.go(P.Mark{s, True{}} <> r, P.Near{None{}, False{}, acc}) == P.Near{None{}, False{}, P.rev.go(P.Mark{s, True{}} <> r, acc)} : P.Near}, h)
    case Con{P.Mark{+s, False{}}, +r}:
      q.back_still(r, P.Mark{s, False{}} <> acc, h)

def q.fwd_still(ms: +List<P.Mark>, +acc: +List<P.Mark>, h: q.AllF(ms)) -> {P.fwd.go(ms, P.Near{None{}, False{}, acc}) == P.Near{None{}, False{}, P.rev.go(ms, acc)} : P.Near}:
  match ms:
    case Nil{}:
      {==}
    case Con{P.Mark{s, True{}}, r}:
      Empty.absurd({P.fwd.go(P.Mark{s, True{}} <> r, P.Near{None{}, False{}, acc}) == P.Near{None{}, False{}, P.rev.go(P.Mark{s, True{}} <> r, acc)} : P.Near}, h)
    case Con{P.Mark{+s, False{}}, +r}:
      q.fwd_still(r, P.Mark{s, False{}} <> acc, h)

def q.round_still.k(+r: +List<P.Mark>, hp: q.AllF(r) & q.AllF(r)) -> {P.round(r) == P.Pass{r, False{}} : P.Pass}:
  (h1, h2) = hp
  +f = P.rev.go(r, Nil{})
  +n0 = {P.Near{None{}, False{}, Nil{}} : P.Near}
  %Equal.sym(P.Near, P.back.go(r, n0), P.Near{None{}, False{}, f}, q.back_still(r, Nil{}, h1)) : {P.round.fwd(_) == P.Pass{r, False{}} : P.Pass}
  %Equal.sym(P.Near, P.fwd.go(f, n0), P.Near{None{}, False{}, P.rev.go(f, Nil{})}, q.fwd_still(f, Nil{}, q.allf_rev(r, Nil{}, h2, Unit{}))) : {P.round.end(False{}, _) == P.Pass{r, False{}} : P.Pass}
  %Equal.sym(List<&2, P.Mark>, P.rev.go(f, Nil{}), r, q.mrev_mrev(r)) : {P.Pass{_, False{}} == P.Pass{r, False{}} : P.Pass}
  {==}

def q.loop_still.k(v: Nat, +r: +List<P.Mark>, +e: {P.round(r) == P.Pass{r, False{}} : P.Pass}) -> {P.loop(v, P.round(r)) == r : List<&2, P.Mark>}:
  match v:
    case 0n:
      %Equal.sym(P.Pass, P.round(r), P.Pass{r, False{}}, e) : {P.loop(0n, _) == r : List<&2, P.Mark>}
      {==}
    case 1n+w:
      %Equal.sym(P.Pass, P.round(r), P.Pass{r, False{}}, e) : {P.loop(1n+w, _) == r : List<&2, P.Mark>}
      {==}

def q.loop_still(u: Nat, +r: +List<P.Mark>, +e: {P.round(r) == P.Pass{r, False{}} : P.Pass}) -> {P.loop(u, P.Pass{r, True{}}) == r : List<&2, P.Mark>}:
  match u:
    case 0n:
      {==}
    case 1n+v:
      q.loop_still.k(v, r, e)

def q.close_fast_eq(+r: +List<P.Mark>, e: Bool, he: {P.any_taken(r) == e : Bool}) -> {P.close.fast(r, e) == P.close(r) : List<&2, P.Mark>}:
  match e:
    case True{}:
      Equal.cong(List<&2, P.Mark>, List<&2, P.Mark>, l => P.rev.go(l, Nil{}), P.loop.fast(P.untaken.go(r, 0n), P.Pass{r, True{}}), P.loop(P.untaken.go(r, 0n), P.Pass{r, True{}}),
        q.loop_fast_eq(P.untaken.go(r, 0n), P.Pass{r, True{}}))
    case False{}:
      Equal.sym(List<&2, P.Mark>, P.close(r), P.rev.go(r, Nil{}),
        Equal.cong(List<&2, P.Mark>, List<&2, P.Mark>, l => P.rev.go(l, Nil{}), P.loop(P.untaken.go(r, 0n), P.Pass{r, True{}}), r,
          q.loop_still(P.untaken.go(r, 0n), r, q.round_still.k(r, q.allf_dup(r, q.allf_of(r, he))))))

def Laws.parts_fast_version_gives_the_same_marks(bs, ss):
  +r = P.walk.go(ss, P.Walk{Nil{}, bs, Nil{}})
  q.close_fast_eq(r, P.any_taken(r), {==})


def Laws.spans_merge_of_no_span_is_empty():
  {==}

def Laws.spans_merge_of_one_span_keeps_it(a, b, c, d, i):
  {==}

def q.totals_fast_eq(cs: +List<U.Call>, +ti: Nat, +to: Nat, +ui: Nat, +uo: Nat, +uu: Nat)
  -> {U.totals.fast.go(cs, ti, to, ui, uo, uu) == U.totals.go(cs, U.Totals{ti, to, ui, uo, uu}) : U.Totals}:
  match cs:
    case Nil{}:
      {==}
    case Con{U.Call{False{}, i, o}, +rest}:
      q.totals_fast_eq(rest, ti, to, ui, uo, uu)
    case Con{U.Call{True{}, +i, +o}, +rest}:
      q.totals_fast_eq(rest, Nat.add(ti, U.or0(i)), Nat.add(to, U.or0(o)), Nat.add(ui, U.unknown(i)), Nat.add(uo, U.unknown(o)), Nat.add(uu, U.unknown2(i, o)))

def Laws.usage_fast_totals_match_the_spec(cs):
  q.totals_fast_eq(cs, 0n, 0n, 0n, 0n, 0n)

def ar.eq_refl(n: Nat) -> {Nat.is_eq(n, n) == True{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      ar.eq_refl(p)

def ar.eq_next(n: Nat) -> {Nat.is_eq(n, 1n+n) == False{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      ar.eq_next(p)

def ar.pos_hash(e: Bool, +i: Nat) -> {Nat.is_eq(Nat.add(i, i), Laws.PosHash(e, i)) == e : Bool}:
  match e:
    case True{}:
      ar.eq_refl(Nat.add(i, i))
    case False{}:
      ar.eq_next(Nat.add(i, i))

def ar.same_pos(ps: +List<A.Seen>, bs: +List<A.Block>, +i: Nat) -> {A.same(Laws.PosSeen(ps, i), Laws.PosBlocks(bs, ps, i)) == A.same(ps, bs) : Bool}:
  match ps bs:
    case Nil{} Nil{}:
      {==}
    case Nil{} Con{A.Block{g, k, n}, bt}:
      {==}
    case Con{A.Seen{h, a}, pt} Nil{}:
      {==}
    case Con{A.Seen{+h, a}, pt} Con{A.Block{+g, k, n}, bt}:
      ar.pos_hash(Nat.is_eq(h, g), i)

def ar.first_pos(ps: +List<A.Seen>, bs: +List<A.Block>, e: Bool, +j: Nat, +off: Nat, +i: Nat)
  -> {A.first.go(Laws.PosSeen(ps, i), Laws.PosBlocks(bs, ps, i), e, j, off) == A.first.go(ps, bs, e, j, off) : Maybe<&2, A.First>}:
  match ps bs e:
    case Nil{} _ _:
      {==}
    case Con{A.Seen{h, a}, pt} Nil{} _:
      {==}
    case Con{A.Seen{h, a}, +pt} Con{A.Block{g, k, +n}, +bt} True{}:
      %Equal.sym(Bool, A.same(Laws.PosSeen(pt, 1n+i), Laws.PosBlocks(bt, pt, 1n+i)), A.same(pt, bt), ar.same_pos(pt, bt, 1n+i)) : {A.first.go(Laws.PosSeen(pt, 1n+i), Laws.PosBlocks(bt, pt, 1n+i), _, 1n+j, Nat.add(off, n)) == A.first.go(pt, bt, A.same(pt, bt), 1n+j, Nat.add(off, n)) : Maybe<&2, A.First>}
      ar.first_pos(pt, bt, A.same(pt, bt), 1n+j, Nat.add(off, n), 1n+i)
    case Con{A.Seen{h, a}, pt} Con{A.Block{g, k, n}, bt} False{}:
      {==}

def ar.strip(bs: +List<A.Block>) -> List<&2, A.Block>:
  match bs:
    case Nil{}:
      Nil{}
    case A.Block{g, k, n} <> bt:
      A.Block{0n, k, n} <> ar.strip(bt)

def ar.strip_pos(bs: +List<A.Block>, ps: +List<A.Seen>, +i: Nat) -> {ar.strip(Laws.PosBlocks(bs, ps, i)) == ar.strip(bs) : List<&2, A.Block>}:
  match bs ps:
    case Nil{} _:
      {==}
    case Con{A.Block{g, +k, +n}, +bt} Nil{}:
      %ar.strip_pos(bt, Nil{}, 1n+i) : {A.Block{0n, k, n} <> ar.strip(Laws.PosBlocks(bt, Nil{}, 1n+i)) == A.Block{0n, k, n} <> _ : List<&2, A.Block>}
      {==}
    case Con{A.Block{g, +k, +n}, +bt} Con{A.Seen{h, a}, +pt}:
      %ar.strip_pos(bt, pt, 1n+i) : {A.Block{0n, k, n} <> ar.strip(Laws.PosBlocks(bt, pt, 1n+i)) == A.Block{0n, k, n} <> _ : List<&2, A.Block>}
      {==}

def ar.fill_strip(bs: +List<A.Block>, +age: Nat, +acc: +List<Nat>) -> {A.fill(bs, age, acc) == A.fill(ar.strip(bs), age, acc) : List<&2, Nat>}:
  match bs:
    case Nil{}:
      {==}
    case Con{A.Block{g, k, n}, +bt}:
      ar.fill_strip(bt, age, age <> acc)

def ar.fill_pos(+bs: +List<A.Block>, +ps: +List<A.Seen>, +i: Nat, +age: Nat, +acc: +List<Nat>) -> {A.fill(Laws.PosBlocks(bs, ps, i), age, acc) == A.fill(bs, age, acc) : List<&2, Nat>}:
  +pb = Laws.PosBlocks(bs, ps, i)
  Equal.trans(List<&2, Nat>, A.fill(pb, age, acc), A.fill(ar.strip(pb), age, acc), A.fill(bs, age, acc), ar.fill_strip(pb, age, acc),
    Equal.trans(List<&2, Nat>, A.fill(ar.strip(pb), age, acc), A.fill(ar.strip(bs), age, acc), A.fill(bs, age, acc),
      Equal.cong(List<&2, A.Block>, List<&2, Nat>, x => A.fill(x, age, acc), ar.strip(pb), ar.strip(bs), ar.strip_pos(bs, ps, i)),
      Equal.sym(List<&2, Nat>, A.fill(bs, age, acc), A.fill(ar.strip(bs), age, acc), ar.fill_strip(bs, age, acc))))

def ar.ages_pos(ps: +List<A.Seen>, bs: +List<A.Block>, e: Bool, +turn: Nat, +acc: +List<Nat>, +i: Nat)
  -> {A.ages.go(Laws.PosSeen(ps, i), Laws.PosBlocks(bs, ps, i), e, turn, acc) == A.ages.go(ps, bs, e, turn, acc) : List<&2, Nat>}:
  match ps bs e:
    case Nil{} _ _:
      ar.fill_pos(bs, Nil{}, i, turn, acc)
    case Con{A.Seen{h, a}, pt} Nil{} _:
      {==}
    case Con{A.Seen{h, +a}, +pt} Con{A.Block{g, k, n}, +bt} True{}:
      %Equal.sym(Bool, A.same(Laws.PosSeen(pt, 1n+i), Laws.PosBlocks(bt, pt, 1n+i)), A.same(pt, bt), ar.same_pos(pt, bt, 1n+i)) : {A.ages.go(Laws.PosSeen(pt, 1n+i), Laws.PosBlocks(bt, pt, 1n+i), _, turn, a <> acc) == A.ages.go(pt, bt, A.same(pt, bt), turn, a <> acc) : List<&2, Nat>}
      ar.ages_pos(pt, bt, A.same(pt, bt), turn, a <> acc, 1n+i)
    case Con{A.Seen{+h, +a}, +pt} Con{A.Block{+g, +k, +n}, +bt} False{}:
      ar.fill_pos(A.Block{g, k, n} <> bt, A.Seen{h, a} <> pt, i, turn, acc)

def ar.ages_top(prev: A.Prev, +bs: +List<A.Block>, +turn: Nat, tracked: Bool) -> {A.ages(Laws.PosPrev(prev), Laws.PosBlocksOf(prev, bs), turn, tracked) == A.ages(prev, bs, turn, tracked) : List<&2, Nat>}:
  match prev tracked:
    case A.Fresh{} True{}:
      ar.fill_pos(bs, Nil{}, 0n, turn, Nil{})
    case A.Fresh{} False{}:
      ar.fill_pos(bs, Nil{}, 0n, 0n, Nil{})
    case A.Known{+ps} _:
      %Equal.sym(Bool, A.same(Laws.PosSeen(ps, 0n), Laws.PosBlocks(bs, ps, 0n)), A.same(ps, bs), ar.same_pos(ps, bs, 0n)) : {A.ages.go(Laws.PosSeen(ps, 0n), Laws.PosBlocks(bs, ps, 0n), _, turn, Nil{}) == A.ages.go(ps, bs, A.same(ps, bs), turn, Nil{}) : List<&2, Nat>}
      ar.ages_pos(ps, bs, A.same(ps, bs), turn, Nil{}, 0n)

def ar.first_top(prev: A.Prev, +bs: +List<A.Block>) -> {A.first(Laws.PosPrev(prev), Laws.PosBlocksOf(prev, bs)) == A.first(prev, bs) : Maybe<&2, A.First>}:
  match prev:
    case A.Fresh{}:
      {==}
    case A.Known{+ps}:
      %Equal.sym(Bool, A.same(Laws.PosSeen(ps, 0n), Laws.PosBlocks(bs, ps, 0n)), A.same(ps, bs), ar.same_pos(ps, bs, 0n)) : {A.first.go(Laws.PosSeen(ps, 0n), Laws.PosBlocks(bs, ps, 0n), _, 0n, 0n) == A.first.go(ps, bs, A.same(ps, bs), 0n, 0n) : Maybe<&2, A.First>}
      ar.first_pos(ps, bs, A.same(ps, bs), 0n, 0n, 0n)

def ar.joins_strip(bs: +List<A.Block>, ags: +List<Nat>, c: A.Cut, +acc: +List<A.Run>) -> {A.joins(bs, ags, c, acc) == A.joins(ar.strip(bs), ags, c, acc) : Bool}:
  match bs ags c:
    case Nil{} _ _:
      {==}
    case Con{A.Block{g, k, n}, bt} Nil{} _:
      {==}
    case Con{A.Block{g, k, n}, bt} Con{a, at} A.NoCut{}:
      {==}
    case Con{A.Block{g, k, n}, bt} Con{a, at} A.CutIn{m}:
      match m:
        case 0n:
          {==}
        case 1n+d:
          {==}

def ar.runs_strip(bs: +List<A.Block>, ags: +List<Nat>, +c: A.Cut, +acc: +List<A.Run>, j: Bool) -> {A.runs.go(bs, ags, c, acc, j) == A.runs.go(ar.strip(bs), ags, c, acc, j) : List<&2, A.Run>}:
  match bs ags j:
    case Nil{} _ _:
      {==}
    case Con{A.Block{g, k, n}, bt} Nil{} _:
      {==}
    case Con{A.Block{g, +k, +n}, +bt} Con{+a, +at} True{}:
      +c2 = A.cut.next(c)
      +acc2 = A.grow(acc, n)
      %Equal.sym(Bool, A.joins(bt, at, c2, acc2), A.joins(ar.strip(bt), at, c2, acc2), ar.joins_strip(bt, at, c2, acc2)) : {A.runs.go(bt, at, c2, acc2, _) == A.runs.go(ar.strip(bt), at, c2, acc2, A.joins(ar.strip(bt), at, c2, acc2)) : List<&2, A.Run>}
      ar.runs_strip(bt, at, c2, acc2, A.joins(ar.strip(bt), at, c2, acc2))
    case Con{A.Block{g, +k, +n}, +bt} Con{+a, +at} False{}:
      +c2 = A.cut.next(c)
      +acc2 = A.push(k, n, a, acc)
      %Equal.sym(Bool, A.joins(bt, at, c2, acc2), A.joins(ar.strip(bt), at, c2, acc2), ar.joins_strip(bt, at, c2, acc2)) : {A.runs.go(bt, at, c2, acc2, _) == A.runs.go(ar.strip(bt), at, c2, acc2, A.joins(ar.strip(bt), at, c2, acc2)) : List<&2, A.Run>}
      ar.runs_strip(bt, at, c2, acc2, A.joins(ar.strip(bt), at, c2, acc2))

def ar.runs_eq(+bs: +List<A.Block>, +ags: +List<Nat>, +f: Maybe<&2, A.First>) -> {A.runs(bs, ags, f) == A.runs(ar.strip(bs), ags, f) : List<&2, A.Run>}:
  +c = A.cut.of(f)
  %Equal.sym(Bool, A.joins(bs, ags, c, Nil{}), A.joins(ar.strip(bs), ags, c, Nil{}), ar.joins_strip(bs, ags, c, Nil{})) : {A.runs.go(bs, ags, c, Nil{}, _) == A.runs.go(ar.strip(bs), ags, c, Nil{}, A.joins(ar.strip(bs), ags, c, Nil{})) : List<&2, A.Run>}
  ar.runs_strip(bs, ags, c, Nil{}, A.joins(ar.strip(bs), ags, c, Nil{}))

def ar.runs_pos(+bs: +List<A.Block>, +ps: +List<A.Seen>, +i: Nat, +ags: +List<Nat>, +f: Maybe<&2, A.First>) -> {A.runs(Laws.PosBlocks(bs, ps, i), ags, f) == A.runs(bs, ags, f) : List<&2, A.Run>}:
  +pb = Laws.PosBlocks(bs, ps, i)
  Equal.trans(List<&2, A.Run>, A.runs(pb, ags, f), A.runs(ar.strip(pb), ags, f), A.runs(bs, ags, f), ar.runs_eq(pb, ags, f),
    Equal.trans(List<&2, A.Run>, A.runs(ar.strip(pb), ags, f), A.runs(ar.strip(bs), ags, f), A.runs(bs, ags, f),
      Equal.cong(List<&2, A.Block>, List<&2, A.Run>, x => A.runs(x, ags, f), ar.strip(pb), ar.strip(bs), ar.strip_pos(bs, ps, i)),
      Equal.sym(List<&2, A.Run>, A.runs(bs, ags, f), A.runs(ar.strip(bs), ags, f), ar.runs_eq(bs, ags, f))))

def ar.runs_top(prev: A.Prev, +bs: +List<A.Block>, +ags: +List<Nat>, +f: Maybe<&2, A.First>) -> {A.runs(Laws.PosBlocksOf(prev, bs), ags, f) == A.runs(bs, ags, f) : List<&2, A.Run>}:
  match prev:
    case A.Fresh{}:
      ar.runs_pos(bs, Nil{}, 0n, ags, f)
    case A.Known{+ps}:
      ar.runs_pos(bs, ps, 0n, ags, f)

def Laws.arena_reads_hashes_only_position_by_position(prev, bs, turn, tracked):
  +pp = Laws.PosPrev(prev)
  +pb = Laws.PosBlocksOf(prev, bs)
  +ag1 = A.ages(pp, pb, turn, tracked)
  +ag0 = A.ages(prev, bs, turn, tracked)
  +f1 = A.first(pp, pb)
  +f0 = A.first(prev, bs)
  %Equal.sym(List<&2, Nat>, ag1, ag0, ar.ages_top(prev, bs, turn, tracked)) : {A.Arena{_, f1, A.runs(pb, _, f1)} == A.Arena{ag0, f0, A.runs(bs, ag0, f0)} : A.Arena}
  %Equal.sym(Maybe<&2, A.First>, f1, f0, ar.first_top(prev, bs)) : {A.Arena{ag0, _, A.runs(pb, ag0, _)} == A.Arena{ag0, f0, A.runs(bs, ag0, f0)} : A.Arena}
  %Equal.sym(List<&2, A.Run>, A.runs(pb, ag0, f0), A.runs(bs, ag0, f0), ar.runs_top(prev, bs, ag0, f0)) : {A.Arena{ag0, f0, _} == A.Arena{ag0, f0, A.runs(bs, ag0, f0)} : A.Arena}
  {==}

def m.join_nil(xs: +List<Laws.Item>) -> {Laws.Join(xs, []) == xs : List<&2, Laws.Item>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %m.join_nil(rest) : {x <> Laws.Join(rest, []) == x <> _ : List<&2, Laws.Item>}
      {==}

def m.join_assoc(xs: +List<Laws.Item>, +ys: +List<Laws.Item>, +zs: +List<Laws.Item>) -> {Laws.Join(Laws.Join(xs, ys), zs) == Laws.Join(xs, Laws.Join(ys, zs)) : List<&2, Laws.Item>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %m.join_assoc(rest, ys, zs) : {x <> Laws.Join(Laws.Join(rest, ys), zs) == x <> _ : List<&2, Laws.Item>}
      {==}

def m.shown_one(x: K.Piece, +ys: +List<K.Piece>) -> {Laws.Shown(x <> ys) == Laws.Join(Laws.Shown([x]), Laws.Shown(ys)) : List<&2, Laws.Item>}:
  match x:
    case K.Keep{+a, +b}:
      %m.join_nil(Laws.Bytes(Nat.sub(b, a), a)) : {Laws.Join(_, Laws.Shown(ys)) == Laws.Join(Laws.Join(Laws.Bytes(Nat.sub(b, a), a), []), Laws.Shown(ys)) : List<&2, Laws.Item>}
      {==}
    case K.Hide{i}:
      {==}

def m.shown_rev(acc: +List<K.Piece>, +ys: +List<K.Piece>) -> {Laws.Shown(K.rev.pieces(acc, ys)) == Laws.Join(Laws.Shown(K.rev.pieces(acc, Nil{})), Laws.Shown(ys)) : List<&2, Laws.Item>}:
  match acc:
    case Nil{}:
      {==}
    case Con{+x, +r}:
      +z = Laws.Shown(K.rev.pieces(r, Nil{}))
      -T = List<&2, Laws.Item>
      Equal.trans(T, Laws.Shown(K.rev.pieces(r, x <> ys)), Laws.Join(z, Laws.Shown(x <> ys)), Laws.Join(Laws.Shown(K.rev.pieces(r, [x])), Laws.Shown(ys)),
        m.shown_rev(r, x <> ys),
        Equal.trans(T, Laws.Join(z, Laws.Shown(x <> ys)), Laws.Join(z, Laws.Join(Laws.Shown([x]), Laws.Shown(ys))), Laws.Join(Laws.Shown(K.rev.pieces(r, [x])), Laws.Shown(ys)),
          Equal.cong(T, T, l => Laws.Join(z, l), Laws.Shown(x <> ys), Laws.Join(Laws.Shown([x]), Laws.Shown(ys)), m.shown_one(x, ys)),
          Equal.trans(T, Laws.Join(z, Laws.Join(Laws.Shown([x]), Laws.Shown(ys))), Laws.Join(Laws.Join(z, Laws.Shown([x])), Laws.Shown(ys)), Laws.Join(Laws.Shown(K.rev.pieces(r, [x])), Laws.Shown(ys)),
            Equal.sym(T, Laws.Join(Laws.Join(z, Laws.Shown([x])), Laws.Shown(ys)), Laws.Join(z, Laws.Join(Laws.Shown([x]), Laws.Shown(ys))), m.join_assoc(z, Laws.Shown([x]), Laws.Shown(ys))),
            Equal.cong(T, T, l => Laws.Join(l, Laws.Shown(ys)), Laws.Join(z, Laws.Shown([x])), Laws.Shown(K.rev.pieces(r, [x])),
              Equal.sym(T, Laws.Shown(K.rev.pieces(r, [x])), Laws.Join(z, Laws.Shown([x])), m.shown_rev(r, [x]))))))

def m.add_sub(p: Nat, q: Nat, h: {Nat.is_le(p, q) == True{} : Bool}) -> {Nat.add(p, Nat.sub(q, p)) == q : Nat}:
  match p q:
    case 0n 0n:
      {==}
    case 0n 1n+qq:
      {==}
    case 1n+pp 0n:
      Empty.absurd({1n+Nat.add(pp, 0n) == 0n : Nat}, ft(h))
    case 1n+pp 1n+qq:
      Equal.cong(Nat, Nat, x => 1n+x, Nat.add(pp, Nat.sub(qq, pp)), qq, m.add_sub(pp, qq, h))

def m.sub_split(p: Nat, a: Nat, q: Nat, pa: {Nat.is_le(p, a) == True{} : Bool}, aq: {Nat.is_le(a, q) == True{} : Bool}) -> {Nat.sub(q, p) == Nat.add(Nat.sub(a, p), Nat.sub(q, a)) : Nat}:
  match p a q:
    case 0n 0n qq:
      {==}
    case 0n 1n+aa 0n:
      Empty.absurd({0n == 1n+Nat.add(aa, 0n) : Nat}, ft(aq))
    case 0n 1n+aa 1n+qq:
      Equal.sym(Nat, 1n+Nat.add(aa, Nat.sub(qq, aa)), 1n+qq, Equal.cong(Nat, Nat, x => 1n+x, Nat.add(aa, Nat.sub(qq, aa)), qq, m.add_sub(aa, qq, aq)))
    case 1n+pp 0n qq:
      Empty.absurd({Nat.sub(qq, 1n+pp) == Nat.add(0n, Nat.sub(qq, 0n)) : Nat}, ft(pa))
    case 1n+pp 1n+aa 0n:
      Empty.absurd({0n == Nat.add(Nat.sub(aa, pp), 0n) : Nat}, ft(aq))
    case 1n+pp 1n+aa 1n+qq:
      m.sub_split(pp, aa, qq, pa, aq)

def m.sub_succ(a: Nat, q: Nat, h: {Nat.is_lt(a, q) == True{} : Bool}) -> {Nat.sub(q, a) == 1n+Nat.sub(q, 1n+a) : Nat}:
  match a q:
    case 0n 0n:
      Empty.absurd({0n == 1n+0n : Nat}, ft(h))
    case 1n+aa 0n:
      Empty.absurd({0n == 1n+0n : Nat}, ft(h))
    case 0n 1n+qq:
      match qq:
        case 0n:
          {==}
        case 1n+q3:
          {==}
    case 1n+aa 1n+qq:
      m.sub_succ(aa, qq, h)

def m.lt_not_le(q: Nat, a: Nat, h: {Nat.is_lt(q, a) == True{} : Bool}) -> {Nat.is_le(a, q) == False{} : Bool}:
  match q a:
    case 0n 0n:
      Empty.absurd({True{} == False{} : Bool}, ft(h))
    case 0n 1n+aa:
      {==}
    case 1n+qq 0n:
      Empty.absurd({True{} == False{} : Bool}, ft(h))
    case 1n+qq 1n+aa:
      m.lt_not_le(qq, aa, h)

def m.neq_lt(a: Nat, p: Nat, h: {Nat.is_lt(a, p) == True{} : Bool}) -> {Nat.is_eq(a, p) == False{} : Bool}:
  match a p:
    case 0n 0n:
      Empty.absurd({True{} == False{} : Bool}, ft(h))
    case 0n 1n+pp:
      {==}
    case 1n+aa 0n:
      {==}
    case 1n+aa 1n+pp:
      m.neq_lt(aa, pp, h)

def m.neq_gt(a: Nat, p: Nat, h: {Nat.is_lt(p, a) == True{} : Bool}) -> {Nat.is_eq(a, p) == False{} : Bool}:
  match a p:
    case 0n 0n:
      Empty.absurd({True{} == False{} : Bool}, ft(h))
    case 0n 1n+pp:
      {==}
    case 1n+aa 0n:
      {==}
    case 1n+aa 1n+pp:
      m.neq_gt(aa, pp, h)

def m.le_zero_l(x: Nat) -> {Nat.is_le(0n, x) == True{} : Bool}:
  match x:
    case 0n:
      {==}
    case 1n+p:
      {==}

def m.lt_le_succ(a: Nat, b: Nat, h: {Nat.is_lt(a, b) == True{} : Bool}) -> {Nat.is_le(1n+a, b) == True{} : Bool}:
  match a b:
    case 0n 0n:
      Empty.absurd({False{} == True{} : Bool}, ft(h))
    case 0n 1n+bb:
      m.le_zero_l(bb)
    case 1n+aa 0n:
      Empty.absurd({False{} == True{} : Bool}, ft(h))
    case 1n+aa 1n+bb:
      m.lt_le_succ(aa, bb, h)

def m.lt_succ(a: Nat) -> {Nat.is_lt(a, 1n+a) == True{} : Bool}:
  match a:
    case 0n:
      {==}
    case 1n+p:
      m.lt_succ(p)

def m.le_cast(-x: Nat, -y: Nat, -e: Nat, eqn: {x == y : Nat}, h: {Nat.is_le(y, e) == True{} : Bool}) -> {Nat.is_le(x, e) == True{} : Bool}:
  %Equal.sym(Nat, x, y, eqn) : {Nat.is_le(_, e) == True{} : Bool}
  h

def m.lt_add_succ(p: Nat, -k: Nat) -> {Nat.is_lt(p, Nat.add(p, 1n+k)) == True{} : Bool}:
  match p:
    case 0n:
      {==}
    case 1n+pp:
      m.lt_add_succ(pp, k)

def m.lt_up(+a: Nat, +p: Nat, h: {Nat.is_lt(a, p) == True{} : Bool}) -> {Nat.is_lt(a, 1n+p) == True{} : Bool}:
  q.lt_lt(a, p, 1n+p, h, m.lt_succ(p))

def m.le_up(+b: Nat, +p: Nat, h: {Nat.is_le(b, p) == True{} : Bool}) -> {Nat.is_le(b, 1n+p) == True{} : Bool}:
  le_trans(b, p, 1n+p, h, q.le_succ(p))

def m.cf_dup.k(-e: Nat, -a: Nat, -b: Nat, -rest: +List<K.Cut>, +x: {Nat.is_le(e, a) == True{} : Bool}, +y: {Nat.is_lt(a, b) == True{} : Bool},
  p: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest)) -> Laws.CutsFrom(e, K.Cut{a, b} <> rest) & Laws.CutsFrom(e, K.Cut{a, b} <> rest):
  (r1, r2) = p
  ((x, (y, r1)), (x, (y, r2)))

def m.cf_dup(ss: +List<K.Cut>, +e: Nat, h: Laws.CutsFrom(e, ss)) -> Laws.CutsFrom(e, ss) & Laws.CutsFrom(e, ss):
  match ss:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{K.Cut{+a, +b}, +rest}:
      (x, (y, r)) = h
      m.cf_dup.k(e, a, b, rest, x, y, m.cf_dup(rest, b, r))

def m.in_out(+q: Nat, ss: +List<K.Cut>, +e: Nat, cf: Laws.CutsFrom(e, ss), h: {Nat.is_lt(q, e) == True{} : Bool}) -> {Laws.Inside(q, ss) == False{} : Bool}:
  match ss:
    case Nil{}:
      {==}
    case Con{K.Cut{+a, +b}, +rest}:
      (ea, (ab, cr)) = cf
      +qa = lt_le_trans(q, e, a, h, ea)
      %Equal.sym(Bool, Nat.is_le(a, q), False{}, m.lt_not_le(q, a, qa)) : {Bool.or(Bool.and(_, Nat.is_lt(q, b)), Laws.Inside(q, rest)) == False{} : Bool}
      m.in_out(q, rest, b, cr, q.lt_lt(q, a, b, qa, ab))

def m.opens_out(+q: Nat, ss: +List<K.Cut>, +e: Nat, cf: Laws.CutsFrom(e, ss), h: {Nat.is_lt(q, e) == True{} : Bool}) -> {Laws.Opens(q, ss) == False{} : Bool}:
  match ss:
    case Nil{}:
      {==}
    case Con{K.Cut{+a, +b}, +rest}:
      (ea, (ab, cr)) = cf
      +qa = lt_le_trans(q, e, a, h, ea)
      %Equal.sym(Bool, Nat.is_eq(a, q), False{}, m.neq_gt(a, q, qa)) : {Bool.or(_, Laws.Opens(q, rest)) == False{} : Bool}
      m.opens_out(q, rest, b, cr, q.lt_lt(q, a, b, qa, ab))

def m.at_open(+a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, ab: {Nat.is_lt(a, b) == True{} : Bool}) -> {Laws.At(a, K.Cut{a, b} <> rest, i) == [Laws.Marker{i}] : List<&2, Laws.Item>}:
  -L = List<&2, Laws.Item>
  +ss = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
  +ins = {
    %Equal.sym(Bool, Nat.is_le(a, a), True{}, q.le_refl(a)) : {Bool.or(Bool.and(_, Nat.is_lt(a, b)), Laws.Inside(a, rest)) == True{} : Bool}
    %Equal.sym(Bool, Nat.is_lt(a, b), True{}, ab) : {Bool.or(Bool.and(True{}, _), Laws.Inside(a, rest)) == True{} : Bool}
    {==}
  : {Laws.Inside(a, ss) == True{} : Bool}}
  +ops = {
    %Equal.sym(Bool, Nat.is_eq(a, a), True{}, ar.eq_refl(a)) : {Bool.or(_, Laws.Opens(a, rest)) == True{} : Bool}
    {==}
  : {Laws.Opens(a, ss) == True{} : Bool}}
  +idx = {
    %Equal.sym(Bool, Nat.is_eq(a, a), True{}, ar.eq_refl(a)) : {Bool.pick(Nat, _, i, Laws.OpenIndex(a, rest, 1n+i)) == i : Nat}
    {==}
  : {Laws.OpenIndex(a, ss, i) == i : Nat}}
  %Equal.sym(Bool, Laws.Inside(a, ss), True{}, ins) : {Bool.pick(L, _, Bool.pick(L, Laws.Opens(a, ss), [Laws.Marker{Laws.OpenIndex(a, ss, i)}], []), [Laws.Byte{a}]) == [Laws.Marker{i}] : L}
  %Equal.sym(Bool, Laws.Opens(a, ss), True{}, ops) : {Bool.pick(L, _, [Laws.Marker{Laws.OpenIndex(a, ss, i)}], []) == [Laws.Marker{i}] : L}
  %Equal.sym(Nat, Laws.OpenIndex(a, ss, i), i, idx) : {[Laws.Marker{_}] == [Laws.Marker{i}] : L}
  {==}

def m.at_gone(+q: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, aq: {Nat.is_lt(a, q) == True{} : Bool}, qb: {Nat.is_lt(q, b) == True{} : Bool}, cf: Laws.CutsFrom(b, rest))
  -> {Laws.At(q, K.Cut{a, b} <> rest, i) == [] : List<&2, Laws.Item>}:
  -L = List<&2, Laws.Item>
  +ss = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
  +aq2 = aq
  +qb2 = qb
  +ins = {
    %Equal.sym(Bool, Nat.is_le(a, q), True{}, lt_imp_le(a, q, aq2)) : {Bool.or(Bool.and(_, Nat.is_lt(q, b)), Laws.Inside(q, rest)) == True{} : Bool}
    %Equal.sym(Bool, Nat.is_lt(q, b), True{}, qb2) : {Bool.or(Bool.and(True{}, _), Laws.Inside(q, rest)) == True{} : Bool}
    {==}
  : {Laws.Inside(q, ss) == True{} : Bool}}
  +ops = {
    %Equal.sym(Bool, Nat.is_eq(a, q), False{}, m.neq_lt(a, q, aq2)) : {Bool.or(_, Laws.Opens(q, rest)) == False{} : Bool}
    m.opens_out(q, rest, b, cf, qb2)
  : {Laws.Opens(q, ss) == False{} : Bool}}
  %Equal.sym(Bool, Laws.Inside(q, ss), True{}, ins) : {Bool.pick(L, _, Bool.pick(L, Laws.Opens(q, ss), [Laws.Marker{Laws.OpenIndex(q, ss, i)}], []), [Laws.Byte{q}]) == [] : L}
  %Equal.sym(Bool, Laws.Opens(q, ss), False{}, ops) : {Bool.pick(L, _, [Laws.Marker{Laws.OpenIndex(q, ss, i)}], []) == [] : L}
  {==}

def m.at_skip(+p: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, bp: {Nat.is_le(b, p) == True{} : Bool}, ab: {Nat.is_lt(a, b) == True{} : Bool})
  -> {Laws.At(p, K.Cut{a, b} <> rest, i) == Laws.At(p, rest, 1n+i) : List<&2, Laws.Item>}:
  -L = List<&2, Laws.Item>
  +ss = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
  +bp2 = bp
  +neq = m.neq_lt(a, p, lt_le_trans(a, b, p, ab, bp2))
  +ins = {
    %Equal.sym(Bool, Nat.is_lt(p, b), False{}, q.le_not_lt(b, p, bp2)) : {Bool.or(Bool.and(Nat.is_le(a, p), _), Laws.Inside(p, rest)) == Laws.Inside(p, rest) : Bool}
    %Equal.sym(Bool, Bool.and(Nat.is_le(a, p), False{}), False{}, and_false(Nat.is_le(a, p))) : {Bool.or(_, Laws.Inside(p, rest)) == Laws.Inside(p, rest) : Bool}
    {==}
  : {Laws.Inside(p, ss) == Laws.Inside(p, rest) : Bool}}
  +ops = {
    %Equal.sym(Bool, Nat.is_eq(a, p), False{}, neq) : {Bool.or(_, Laws.Opens(p, rest)) == Laws.Opens(p, rest) : Bool}
    {==}
  : {Laws.Opens(p, ss) == Laws.Opens(p, rest) : Bool}}
  +idx = {
    %Equal.sym(Bool, Nat.is_eq(a, p), False{}, neq) : {Bool.pick(Nat, _, i, Laws.OpenIndex(p, rest, 1n+i)) == Laws.OpenIndex(p, rest, 1n+i) : Nat}
    {==}
  : {Laws.OpenIndex(p, ss, i) == Laws.OpenIndex(p, rest, 1n+i) : Nat}}
  %Equal.sym(Bool, Laws.Inside(p, ss), Laws.Inside(p, rest), ins) : {Bool.pick(L, _, Bool.pick(L, Laws.Opens(p, ss), [Laws.Marker{Laws.OpenIndex(p, ss, i)}], []), [Laws.Byte{p}]) == Laws.At(p, rest, 1n+i) : L}
  %Equal.sym(Bool, Laws.Opens(p, ss), Laws.Opens(p, rest), ops) : {Bool.pick(L, Laws.Inside(p, rest), Bool.pick(L, _, [Laws.Marker{Laws.OpenIndex(p, ss, i)}], []), [Laws.Byte{p}]) == Laws.At(p, rest, 1n+i) : L}
  %Equal.sym(Nat, Laws.OpenIndex(p, ss, i), Laws.OpenIndex(p, rest, 1n+i), idx) : {Bool.pick(L, Laws.Inside(p, rest), Bool.pick(L, Laws.Opens(p, rest), [Laws.Marker{_}], []), [Laws.Byte{p}]) == Laws.At(p, rest, 1n+i) : L}
  {==}

def m.items_nil(n: Nat, +p: Nat, +i: Nat) -> {Laws.Items(n, p, [], i) == Laws.Bytes(n, p) : List<&2, Laws.Item>}:
  match n:
    case 0n:
      {==}
    case 1n++k:
      %m.items_nil(k, 1n+p, i) : {Laws.Byte{p} <> Laws.Items(k, 1n+p, [], i) == Laws.Byte{p} <> _ : List<&2, Laws.Item>}
      {==}

def m.items_cat(n: Nat, +k: Nat, +p: Nat, +ss: +List<K.Cut>, +i: Nat) -> {Laws.Items(Nat.add(n, k), p, ss, i) == Laws.Join(Laws.Items(n, p, ss, i), Laws.Items(k, Nat.add(p, n), ss, i)) : List<&2, Laws.Item>}:
  match n:
    case 0n:
      -T = List<&2, Laws.Item>
      %add_zero(p) : {Laws.Items(k, p, ss, i) == Laws.Items(k, _, ss, i) : T}
      {==}
    case 1n++j:
      -T = List<&2, Laws.Item>
      +at = Laws.At(p, ss, i)
      +x = Laws.Items(j, 1n+p, ss, i)
      Equal.trans(T, Laws.Join(at, Laws.Items(Nat.add(j, k), 1n+p, ss, i)), Laws.Join(at, Laws.Join(x, Laws.Items(k, 1n+Nat.add(p, j), ss, i))), Laws.Join(Laws.Join(at, x), Laws.Items(k, Nat.add(p, 1n+j), ss, i)),
        Equal.cong(T, T, l => Laws.Join(at, l), Laws.Items(Nat.add(j, k), 1n+p, ss, i), Laws.Join(x, Laws.Items(k, 1n+Nat.add(p, j), ss, i)), m.items_cat(j, k, 1n+p, ss, i)),
        Equal.trans(T, Laws.Join(at, Laws.Join(x, Laws.Items(k, 1n+Nat.add(p, j), ss, i))), Laws.Join(at, Laws.Join(x, Laws.Items(k, Nat.add(p, 1n+j), ss, i))), Laws.Join(Laws.Join(at, x), Laws.Items(k, Nat.add(p, 1n+j), ss, i)),
          Equal.cong(Nat, T, z => Laws.Join(at, Laws.Join(x, Laws.Items(k, z, ss, i))), 1n+Nat.add(p, j), Nat.add(p, 1n+j), add_succ(p, j)),
          Equal.sym(T, Laws.Join(Laws.Join(at, x), Laws.Items(k, Nat.add(p, 1n+j), ss, i)), Laws.Join(at, Laws.Join(x, Laws.Items(k, Nat.add(p, 1n+j), ss, i))), m.join_assoc(at, x, Laws.Items(k, Nat.add(p, 1n+j), ss, i)))))

def m.items_bytes(n: Nat, +p: Nat, +ss: +List<K.Cut>, +i: Nat, +e: Nat, cfp: Laws.CutsFrom(e, ss) & Laws.CutsFrom(e, ss), h: {Nat.is_le(Nat.add(p, n), e) == True{} : Bool})
  -> {Laws.Items(n, p, ss, i) == Laws.Bytes(n, p) : List<&2, Laws.Item>}:
  match n:
    case 0n:
      -L = List<&2, Laws.Item>
      {==}
    case 1n++k:
      (c1, c2) = cfp
      -L = List<&2, Laws.Item>
      +h2 = h
      +ins = m.in_out(p, ss, e, c1, lt_le_trans(p, Nat.add(p, 1n+k), e, m.lt_add_succ(p, k), h2))
      %Equal.sym(Bool, Laws.Inside(p, ss), False{}, ins) : {Laws.Join(Bool.pick(L, _, Bool.pick(L, Laws.Opens(p, ss), [Laws.Marker{Laws.OpenIndex(p, ss, i)}], []), [Laws.Byte{p}]), Laws.Items(k, 1n+p, ss, i)) == Laws.Byte{p} <> Laws.Bytes(k, 1n+p) : L}
      %m.items_bytes(k, 1n+p, ss, i, e, m.cf_dup(ss, e, c2), m.le_cast(1n+Nat.add(p, k), Nat.add(p, 1n+k), e, add_succ(p, k), h2)) : {Laws.Byte{p} <> Laws.Items(k, 1n+p, ss, i) == Laws.Byte{p} <> _ : L}
      {==}

def m.items_gone(n: Nat, +p: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, ap: {Nat.is_lt(a, p) == True{} : Bool}, pb: {Nat.is_le(Nat.add(p, n), b) == True{} : Bool},
  cfp: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest)) -> {Laws.Items(n, p, K.Cut{a, b} <> rest, i) == [] : List<&2, Laws.Item>}:
  match n:
    case 0n:
      -L = List<&2, Laws.Item>
      {==}
    case 1n++k:
      (c1, c2) = cfp
      -L = List<&2, Laws.Item>
      +ap2 = ap
      +pb2 = pb
      %Equal.sym(L, Laws.At(p, K.Cut{a, b} <> rest, i), [], m.at_gone(p, a, b, rest, i, ap2, lt_le_trans(p, Nat.add(p, 1n+k), b, m.lt_add_succ(p, k), pb2), c1)) : {Laws.Join(_, Laws.Items(k, 1n+p, K.Cut{a, b} <> rest, i)) == [] : L}
      m.items_gone(k, 1n+p, a, b, rest, i, m.lt_up(a, p, ap2), m.le_cast(1n+Nat.add(p, k), Nat.add(p, 1n+k), b, add_succ(p, k), pb2), m.cf_dup(rest, b, c2))

def m.items_skip(n: Nat, +p: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, +bp: {Nat.is_le(b, p) == True{} : Bool}, +ab: {Nat.is_lt(a, b) == True{} : Bool})
  -> {Laws.Items(n, p, K.Cut{a, b} <> rest, i) == Laws.Items(n, p, rest, 1n+i) : List<&2, Laws.Item>}:
  match n:
    case 0n:
      -L = List<&2, Laws.Item>
      {==}
    case 1n++k:
      -L = List<&2, Laws.Item>
      %Equal.sym(L, Laws.At(p, K.Cut{a, b} <> rest, i), Laws.At(p, rest, 1n+i), m.at_skip(p, a, b, rest, i, bp, ab)) : {Laws.Join(_, Laws.Items(k, 1n+p, K.Cut{a, b} <> rest, i)) == Laws.Join(Laws.At(p, rest, 1n+i), Laws.Items(k, 1n+p, rest, 1n+i)) : L}
      %Equal.sym(L, Laws.Items(k, 1n+p, K.Cut{a, b} <> rest, i), Laws.Items(k, 1n+p, rest, 1n+i), m.items_skip(k, 1n+p, a, b, rest, i, m.le_up(b, p, bp), ab)) : {Laws.Join(Laws.At(p, rest, 1n+i), _) == Laws.Join(Laws.At(p, rest, 1n+i), Laws.Items(k, 1n+p, rest, 1n+i)) : L}
      {==}

def m.Apart(ss: +List<K.Cut>) -> Type:
  match ss:
    case Nil{}:
      Unit
    case Con{K.Cut{+a, +b}, rest}:
      {Nat.is_lt(a, b) == True{} : Bool} & Laws.CutsFrom(b, rest)

def m.HeadAfter(ss: +List<K.Cut>, +x: Nat) -> Type:
  match ss:
    case Nil{}:
      Unit
    case Con{K.Cut{a, +b}, rest}:
      {Nat.is_lt(x, b) == True{} : Bool}

def m.kss(r: K.Part) -> List<&2, K.Cut>:
  match r:
    case K.Part{ss, i, ps}:
      ss

def m.ki(r: K.Part) -> Nat:
  match r:
    case K.Part{ss, i, ps}:
      i

def m.kps(r: K.Part) -> List<&2, K.Piece>:
  match r:
    case K.Part{ss, i, ps}:
      ps

def m.items_n(-n: Nat, -n2: Nat, -p: Nat, -ss: +List<K.Cut>, -i: Nat, e: {n == n2 : Nat}) -> {Laws.Items(n, p, ss, i) == Laws.Items(n2, p, ss, i) : List<&2, Laws.Item>}:
  %e : {Laws.Items(n, p, ss, i) == Laws.Items(_, p, ss, i) : List<&2, Laws.Item>}
  {==}

def m.items_p(-n: Nat, -p: Nat, -p2: Nat, -ss: +List<K.Cut>, -i: Nat, e: {p == p2 : Nat}) -> {Laws.Items(n, p, ss, i) == Laws.Items(n, p2, ss, i) : List<&2, Laws.Item>}:
  %e : {Laws.Items(n, p, ss, i) == Laws.Items(n, _, ss, i) : List<&2, Laws.Item>}
  {==}

def m.items_split(+p: Nat, +x: Nat, +q: Nat, +ss: +List<K.Cut>, +i: Nat, px: {Nat.is_le(p, x) == True{} : Bool}, xq: {Nat.is_le(x, q) == True{} : Bool})
  -> {Laws.Items(Nat.sub(q, p), p, ss, i) == Laws.Join(Laws.Items(Nat.sub(x, p), p, ss, i), Laws.Items(Nat.sub(q, x), x, ss, i)) : List<&2, Laws.Item>}:
  -T = List<&2, Laws.Item>
  +px2 = px
  +n1 = Nat.sub(x, p)
  +n2 = Nat.sub(q, x)
  Equal.trans(T, Laws.Items(Nat.sub(q, p), p, ss, i), Laws.Items(Nat.add(n1, n2), p, ss, i), Laws.Join(Laws.Items(n1, p, ss, i), Laws.Items(n2, x, ss, i)),
    m.items_n(Nat.sub(q, p), Nat.add(n1, n2), p, ss, i, m.sub_split(p, x, q, px2, xq)),
    Equal.trans(T, Laws.Items(Nat.add(n1, n2), p, ss, i), Laws.Join(Laws.Items(n1, p, ss, i), Laws.Items(n2, Nat.add(p, n1), ss, i)), Laws.Join(Laws.Items(n1, p, ss, i), Laws.Items(n2, x, ss, i)),
      m.items_cat(n1, n2, p, ss, i),
      Equal.cong(T, T, l => Laws.Join(Laws.Items(n1, p, ss, i), l), Laws.Items(n2, Nat.add(p, n1), ss, i), Laws.Items(n2, x, ss, i),
        m.items_p(n2, Nat.add(p, n1), x, ss, i, m.add_sub(p, x, px2)))))

def m.ap_dup.k(-a: Nat, -b: Nat, -rest: +List<K.Cut>, +x: {Nat.is_lt(a, b) == True{} : Bool}, p: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest))
  -> m.Apart(K.Cut{a, b} <> rest) & m.Apart(K.Cut{a, b} <> rest):
  (r1, r2) = p
  ((x, r1), (x, r2))

def m.ap_dup(ss: +List<K.Cut>, h: m.Apart(ss)) -> m.Apart(ss) & m.Apart(ss):
  match ss:
    case Nil{}:
      (Unit{}, Unit{})
    case Con{K.Cut{+a, +b}, +rest}:
      (x, r) = h
      m.ap_dup.k(a, b, rest, x, m.cf_dup(rest, b, r))

def m.cf_apart(+e: Nat, ss: +List<K.Cut>, h: Laws.CutsFrom(e, ss)) -> m.Apart(ss):
  match ss:
    case Nil{}:
      Unit{}
    case Con{K.Cut{a, b}, rest}:
      (x, r) = h
      r

def m.cf_head(+e: Nat, ss: +List<K.Cut>, h: Laws.CutsFrom(e, ss)) -> m.HeadAfter(ss, e):
  match ss:
    case Nil{}:
      Unit{}
    case Con{K.Cut{+a, +b}, rest}:
      (x, (y, r)) = h
      q.le_lt_trans(e, a, b, x, y)

def m.masked_skip(bs: +List<Nat>, +x: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, bl: Laws.BsFrom(x, bs), +bx: {Nat.is_le(b, x) == True{} : Bool}, +ab: {Nat.is_lt(a, b) == True{} : Bool})
  -> {Laws.MaskedParts(bs, x, K.Cut{a, b} <> rest, i) == Laws.MaskedParts(bs, x, rest, 1n+i) : List<&2, List<&2, Laws.Item>>}:
  match bs:
    case Nil{}:
      {==}
    case Con{+hi, +r}:
      (xh, br) = bl
      -T = List<&2, List<&2, Laws.Item>>
      %Equal.sym(List<&2, Laws.Item>, Laws.Items(Nat.sub(hi, x), x, K.Cut{a, b} <> rest, i), Laws.Items(Nat.sub(hi, x), x, rest, 1n+i), m.items_skip(Nat.sub(hi, x), x, a, b, rest, i, bx, ab)) : {_ <> Laws.MaskedParts(r, hi, K.Cut{a, b} <> rest, i) == Laws.Items(Nat.sub(hi, x), x, rest, 1n+i) <> Laws.MaskedParts(r, hi, rest, 1n+i) : T}
      %Equal.sym(T, Laws.MaskedParts(r, hi, K.Cut{a, b} <> rest, i), Laws.MaskedParts(r, hi, rest, 1n+i), m.masked_skip(r, hi, a, b, rest, i, br, le_trans(b, x, hi, bx, xh), ab)) : {Laws.Items(Nat.sub(hi, x), x, rest, 1n+i) <> _ == Laws.Items(Nat.sub(hi, x), x, rest, 1n+i) <> Laws.MaskedParts(r, hi, rest, 1n+i) : T}
      {==}

def m.s_late(+pos: Nat, +hi: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, ph: {Nat.is_le(pos, hi) == True{} : Bool}, ha: {Nat.is_le(hi, a) == True{} : Bool}, ap: m.Apart(K.Cut{a, b} <> rest))
  -> {Laws.Items(Nat.sub(hi, pos), pos, K.Cut{a, b} <> rest, i) == Laws.Bytes(Nat.sub(hi, pos), pos) : List<&2, Laws.Item>}:
  m.items_bytes(Nat.sub(hi, pos), pos, K.Cut{a, b} <> rest, i, a, m.cf_dup(K.Cut{a, b} <> rest, a, (q.le_refl(a), ap)),
    m.le_cast(Nat.add(pos, Nat.sub(hi, pos)), hi, a, m.add_sub(pos, hi, ph), ha))

def m.s_fresh_short(+pos: Nat, +hi: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, +pa: {Nat.is_le(pos, a) == True{} : Bool}, +ab: {Nat.is_lt(a, b) == True{} : Bool},
  +bh: {Nat.is_le(b, hi) == True{} : Bool}, cfp: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest))
  -> {Laws.Items(Nat.sub(hi, pos), pos, K.Cut{a, b} <> rest, i) == Laws.Join(Laws.Bytes(Nat.sub(a, pos), pos), Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : List<&2, Laws.Item>}:
  (c1, c2) = cfp
  -L = List<&2, Laws.Item>
  +ss = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
  +ah = lt_le_trans(a, b, hi, ab, bh)
  +bytes = Laws.Bytes(Nat.sub(a, pos), pos)
  +sa = m.lt_le_succ(a, b, ab)
  %Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss, i), Laws.Join(Laws.Items(Nat.sub(a, pos), pos, ss, i), Laws.Items(Nat.sub(hi, a), a, ss, i)), m.items_split(pos, a, hi, ss, i, pa, lt_imp_le(a, hi, ah)))
    : {_ == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(a, pos), pos, ss, i), bytes, m.items_bytes(Nat.sub(a, pos), pos, ss, i, a, m.cf_dup(ss, a, (q.le_refl(a), (ab, c1))), m.le_cast(Nat.add(pos, Nat.sub(a, pos)), a, a, m.add_sub(pos, a, pa), q.le_refl(a))))
    : {Laws.Join(_, Laws.Items(Nat.sub(hi, a), a, ss, i)) == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(hi, a), a, ss, i), Laws.Items(1n+Nat.sub(hi, 1n+a), a, ss, i), m.items_n(Nat.sub(hi, a), 1n+Nat.sub(hi, 1n+a), a, ss, i, m.sub_succ(a, hi, ah)))
    : {Laws.Join(bytes, _) == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  %Equal.sym(L, Laws.At(a, ss, i), [Laws.Marker{i}], m.at_open(a, b, rest, i, ab))
    : {Laws.Join(bytes, Laws.Join(_, Laws.Items(Nat.sub(hi, 1n+a), 1n+a, ss, i))) == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(hi, 1n+a), 1n+a, ss, i), Laws.Join(Laws.Items(Nat.sub(b, 1n+a), 1n+a, ss, i), Laws.Items(Nat.sub(hi, b), b, ss, i)), m.items_split(1n+a, b, hi, ss, i, sa, bh))
    : {Laws.Join(bytes, Laws.Marker{i} <> _) == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(b, 1n+a), 1n+a, ss, i), [], m.items_gone(Nat.sub(b, 1n+a), 1n+a, a, b, rest, i, m.lt_succ(a), m.le_cast(Nat.add(1n+a, Nat.sub(b, 1n+a)), b, b, m.add_sub(1n+a, b, sa), q.le_refl(b)), m.cf_dup(rest, b, c2)))
    : {Laws.Join(bytes, Laws.Marker{i} <> Laws.Join(_, Laws.Items(Nat.sub(hi, b), b, ss, i))) == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(hi, b), b, ss, i), Laws.Items(Nat.sub(hi, b), b, rest, 1n+i), m.items_skip(Nat.sub(hi, b), b, a, b, rest, i, q.le_refl(b), ab))
    : {Laws.Join(bytes, Laws.Marker{i} <> _) == Laws.Join(bytes, Laws.Marker{i} <> Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)) : L}
  {==}

def m.s_fresh_long(+pos: Nat, +hi: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, +pa: {Nat.is_le(pos, a) == True{} : Bool}, +ab: {Nat.is_lt(a, b) == True{} : Bool},
  +ah: {Nat.is_lt(a, hi) == True{} : Bool}, hb: {Nat.is_lt(hi, b) == True{} : Bool}, cfp: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest))
  -> {Laws.Items(Nat.sub(hi, pos), pos, K.Cut{a, b} <> rest, i) == Laws.Join(Laws.Bytes(Nat.sub(a, pos), pos), [Laws.Marker{i}]) : List<&2, Laws.Item>}:
  (c1, c2) = cfp
  -L = List<&2, Laws.Item>
  +ss = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
  +bytes = Laws.Bytes(Nat.sub(a, pos), pos)
  +sh = m.lt_le_succ(a, hi, ah)
  %Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss, i), Laws.Join(Laws.Items(Nat.sub(a, pos), pos, ss, i), Laws.Items(Nat.sub(hi, a), a, ss, i)), m.items_split(pos, a, hi, ss, i, pa, lt_imp_le(a, hi, ah)))
    : {_ == Laws.Join(bytes, [Laws.Marker{i}]) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(a, pos), pos, ss, i), bytes, m.items_bytes(Nat.sub(a, pos), pos, ss, i, a, m.cf_dup(ss, a, (q.le_refl(a), (ab, c1))), m.le_cast(Nat.add(pos, Nat.sub(a, pos)), a, a, m.add_sub(pos, a, pa), q.le_refl(a))))
    : {Laws.Join(_, Laws.Items(Nat.sub(hi, a), a, ss, i)) == Laws.Join(bytes, [Laws.Marker{i}]) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(hi, a), a, ss, i), Laws.Items(1n+Nat.sub(hi, 1n+a), a, ss, i), m.items_n(Nat.sub(hi, a), 1n+Nat.sub(hi, 1n+a), a, ss, i, m.sub_succ(a, hi, ah)))
    : {Laws.Join(bytes, _) == Laws.Join(bytes, [Laws.Marker{i}]) : L}
  %Equal.sym(L, Laws.At(a, ss, i), [Laws.Marker{i}], m.at_open(a, b, rest, i, ab))
    : {Laws.Join(bytes, Laws.Join(_, Laws.Items(Nat.sub(hi, 1n+a), 1n+a, ss, i))) == Laws.Join(bytes, [Laws.Marker{i}]) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(hi, 1n+a), 1n+a, ss, i), [], m.items_gone(Nat.sub(hi, 1n+a), 1n+a, a, b, rest, i, m.lt_succ(a), m.le_cast(Nat.add(1n+a, Nat.sub(hi, 1n+a)), hi, b, m.add_sub(1n+a, hi, sh), lt_imp_le(hi, b, hb)), m.cf_dup(rest, b, c2)))
    : {Laws.Join(bytes, Laws.Marker{i} <> _) == Laws.Join(bytes, [Laws.Marker{i}]) : L}
  {==}

def m.s_prog_short(+pos: Nat, +hi: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, ap: {Nat.is_lt(a, pos) == True{} : Bool}, +pb: {Nat.is_lt(pos, b) == True{} : Bool},
  +bh: {Nat.is_le(b, hi) == True{} : Bool}, +ab: {Nat.is_lt(a, b) == True{} : Bool}, cfp: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest))
  -> {Laws.Items(Nat.sub(hi, pos), pos, K.Cut{a, b} <> rest, i) == Laws.Items(Nat.sub(hi, b), b, rest, 1n+i) : List<&2, Laws.Item>}:
  -L = List<&2, Laws.Item>
  +ss = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
  +pb2 = lt_imp_le(pos, b, pb)
  %Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss, i), Laws.Join(Laws.Items(Nat.sub(b, pos), pos, ss, i), Laws.Items(Nat.sub(hi, b), b, ss, i)), m.items_split(pos, b, hi, ss, i, pb2, bh))
    : {_ == Laws.Items(Nat.sub(hi, b), b, rest, 1n+i) : L}
  %Equal.sym(L, Laws.Items(Nat.sub(b, pos), pos, ss, i), [], m.items_gone(Nat.sub(b, pos), pos, a, b, rest, i, ap, m.le_cast(Nat.add(pos, Nat.sub(b, pos)), b, b, m.add_sub(pos, b, pb2), q.le_refl(b)), cfp))
    : {Laws.Join(_, Laws.Items(Nat.sub(hi, b), b, ss, i)) == Laws.Items(Nat.sub(hi, b), b, rest, 1n+i) : L}
  m.items_skip(Nat.sub(hi, b), b, a, b, rest, i, q.le_refl(b), ab)

def m.s_prog_long(+pos: Nat, +hi: Nat, +a: Nat, +b: Nat, +rest: +List<K.Cut>, +i: Nat, ap: {Nat.is_lt(a, pos) == True{} : Bool}, ph: {Nat.is_le(pos, hi) == True{} : Bool},
  hb: {Nat.is_lt(hi, b) == True{} : Bool}, cfp: Laws.CutsFrom(b, rest) & Laws.CutsFrom(b, rest))
  -> {Laws.Items(Nat.sub(hi, pos), pos, K.Cut{a, b} <> rest, i) == [] : List<&2, Laws.Item>}:
  m.items_gone(Nat.sub(hi, pos), pos, a, b, rest, i, ap, m.le_cast(Nat.add(pos, Nat.sub(hi, pos)), hi, b, m.add_sub(pos, hi, ph), lt_imp_le(hi, b, hb)), cfp)

def m.PartOk(r: K.Part, +acc: +List<K.Piece>, +ss: +List<K.Cut>, +i: Nat, +pos: Nat, +hi: Nat, +bs: +List<Nat>) -> Type:
  match r:
    case K.Part{+ss2, +i2, ps}:
      {Laws.Shown(ps) == Laws.Join(Laws.Shown(K.rev.pieces(acc, Nil{})), Laws.Items(Nat.sub(hi, pos), pos, ss, i)) : List<&2, Laws.Item>}
      & ({Laws.MaskedParts(bs, hi, ss2, i2) == Laws.MaskedParts(bs, hi, ss, i) : List<&2, List<&2, Laws.Item>>} & (m.Apart(ss2) & m.HeadAfter(ss2, hi)))

def m.ok_move(r: K.Part, +acc1: +List<K.Piece>, +ss1: +List<K.Cut>, +i1: Nat, +pos1: Nat, +acc2: +List<K.Piece>, +ss2: +List<K.Cut>, +i2: Nat, +pos2: Nat, +hi: Nat, +bs: +List<Nat>,
  e1: {Laws.Join(Laws.Shown(K.rev.pieces(acc1, Nil{})), Laws.Items(Nat.sub(hi, pos1), pos1, ss1, i1)) == Laws.Join(Laws.Shown(K.rev.pieces(acc2, Nil{})), Laws.Items(Nat.sub(hi, pos2), pos2, ss2, i2)) : List<&2, Laws.Item>},
  e2: {Laws.MaskedParts(bs, hi, ss1, i1) == Laws.MaskedParts(bs, hi, ss2, i2) : List<&2, List<&2, Laws.Item>>},
  ok: m.PartOk(r, acc1, ss1, i1, pos1, hi, bs)) -> m.PartOk(r, acc2, ss2, i2, pos2, hi, bs):
  match r:
    case K.Part{+s3, +i3, +ps}:
      (o1, (o2, o3)) = ok
      (Equal.trans(List<&2, Laws.Item>, Laws.Shown(ps), Laws.Join(Laws.Shown(K.rev.pieces(acc1, Nil{})), Laws.Items(Nat.sub(hi, pos1), pos1, ss1, i1)), Laws.Join(Laws.Shown(K.rev.pieces(acc2, Nil{})), Laws.Items(Nat.sub(hi, pos2), pos2, ss2, i2)), o1, e1),
       (Equal.trans(List<&2, List<&2, Laws.Item>>, Laws.MaskedParts(bs, hi, s3, i3), Laws.MaskedParts(bs, hi, ss1, i1), Laws.MaskedParts(bs, hi, ss2, i2), o2, e2), o3))

def m.keep_tail(+acc: +List<K.Piece>, +pos: Nat, +hi: Nat, -x: +List<Laws.Item>, eb: {Laws.Bytes(Nat.sub(hi, pos), pos) == x : List<&2, Laws.Item>})
  -> {Laws.Shown(K.rev.pieces(K.Keep{pos, hi} <> acc, Nil{})) == Laws.Join(Laws.Shown(K.rev.pieces(acc, Nil{})), x) : List<&2, Laws.Item>}:
  -L = List<&2, Laws.Item>
  +z = Laws.Shown(K.rev.pieces(acc, Nil{}))
  +bytes = Laws.Bytes(Nat.sub(hi, pos), pos)
  Equal.trans(L, Laws.Shown(K.rev.pieces(acc, [K.Keep{pos, hi}])), Laws.Join(z, Laws.Shown([K.Keep{pos, hi}])), Laws.Join(z, x),
    m.shown_rev(acc, [K.Keep{pos, hi}]),
    Equal.cong(L, L, l => Laws.Join(z, l), Laws.Join(bytes, []), x, Equal.trans(L, Laws.Join(bytes, []), bytes, x, m.join_nil(bytes), eb)))

def m.ap_tri.k(+ss: +List<K.Cut>, p: m.Apart(ss) & m.Apart(ss)) -> m.Apart(ss) & (m.Apart(ss) & m.Apart(ss)):
  (p1, p2) = p
  (p1, m.ap_dup(ss, p2))

def m.ap_tri(+ss: +List<K.Cut>, h: m.Apart(ss)) -> m.Apart(ss) & (m.Apart(ss) & m.Apart(ss)):
  m.ap_tri.k(ss, m.ap_dup(ss, h))

def m.part_ok(ss: +List<K.Cut>, late: Bool, fresh: Bool, short: Bool, +i: Nat, +pos: Nat, +hi: Nat, +acc: +List<K.Piece>, +bs: +List<Nat>,
  el: {K.starts_from(ss, hi) == late : Bool}, ef: {K.starts_from(ss, pos) == fresh : Bool}, es: {K.ends_by(ss, hi) == short : Bool},
  app: m.Apart(ss) & (m.Apart(ss) & m.Apart(ss)), ha: m.HeadAfter(ss, pos), +ph: {Nat.is_le(pos, hi) == True{} : Bool}, blp: Laws.BsFrom(hi, bs) & Laws.BsFrom(hi, bs))
  -> m.PartOk(K.part.go(ss, late, fresh, short, i, pos, hi, acc), acc, ss, i, pos, hi, bs):
  match ss late fresh short:
    case Nil{} _ _ _:
      (m.keep_tail(acc, pos, hi, Laws.Items(Nat.sub(hi, pos), pos, [], i), Equal.sym(List<&2, Laws.Item>, Laws.Items(Nat.sub(hi, pos), pos, [], i), Laws.Bytes(Nat.sub(hi, pos), pos), m.items_nil(Nat.sub(hi, pos), pos, i))),
       ({==}, (Unit{}, Unit{})))
    case Con{K.Cut{+a, +b}, +rest} True{} _ _:
      (ap1, ((+ab, cr), ap3)) = app
      +ha2 = ge_le(a, hi, el)
      +ss2 = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
      (m.keep_tail(acc, pos, hi, Laws.Items(Nat.sub(hi, pos), pos, ss2, i), Equal.sym(List<&2, Laws.Item>, Laws.Items(Nat.sub(hi, pos), pos, ss2, i), Laws.Bytes(Nat.sub(hi, pos), pos), m.s_late(pos, hi, a, b, rest, i, ph, ha2, ap1))),
       ({==}, ((ab, cr), q.le_lt_trans(hi, a, b, ha2, ab))))
    case Con{K.Cut{+a, +b}, +rest} False{} True{} True{}:
      ((+ab, cr1), ((ab2, cr2), (ab3, cr3))) = app
      (bl1, bl2) = blp
      -L = List<&2, Laws.Item>
      +pa = ge_le(a, pos, ef)
      +bh = es
      +acc2 = {K.Hide{i} <> (K.Keep{pos, a} <> acc) : List<&2, K.Piece>}
      +r = K.part.go(rest, K.starts_from(rest, hi), K.starts_from(rest, b), K.ends_by(rest, hi), 1n+i, b, hi, acc2)
      +z = Laws.Shown(K.rev.pieces(acc, Nil{}))
      +bytes = Laws.Bytes(Nat.sub(a, pos), pos)
      +tail = Laws.Items(Nat.sub(hi, b), b, rest, 1n+i)
      +ss2 = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
      +e1 = {
        %Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss2, i), Laws.Join(bytes, Laws.Marker{i} <> tail), m.s_fresh_short(pos, hi, a, b, rest, i, pa, ab, bh, m.cf_dup(rest, b, cr3)))
          : {Laws.Join(Laws.Shown(K.rev.pieces(acc2, Nil{})), tail) == Laws.Join(z, _) : L}
        %Equal.sym(L, Laws.Shown(K.rev.pieces(acc, [K.Keep{pos, a}, K.Hide{i}])), Laws.Join(z, Laws.Shown([K.Keep{pos, a}, K.Hide{i}])), m.shown_rev(acc, [K.Keep{pos, a}, K.Hide{i}]))
          : {Laws.Join(_, tail) == Laws.Join(z, Laws.Join(bytes, Laws.Marker{i} <> tail)) : L}
        %Equal.sym(L, Laws.Join(Laws.Join(z, Laws.Join(bytes, [Laws.Marker{i}])), tail), Laws.Join(z, Laws.Join(Laws.Join(bytes, [Laws.Marker{i}]), tail)), m.join_assoc(z, Laws.Join(bytes, [Laws.Marker{i}]), tail))
          : {_ == Laws.Join(z, Laws.Join(bytes, Laws.Marker{i} <> tail)) : L}
        %Equal.sym(L, Laws.Join(Laws.Join(bytes, [Laws.Marker{i}]), tail), Laws.Join(bytes, Laws.Join([Laws.Marker{i}], tail)), m.join_assoc(bytes, [Laws.Marker{i}], tail))
          : {Laws.Join(z, _) == Laws.Join(z, Laws.Join(bytes, Laws.Marker{i} <> tail)) : L}
        {==}
      : {Laws.Join(Laws.Shown(K.rev.pieces(acc2, Nil{})), tail) == Laws.Join(z, Laws.Items(Nat.sub(hi, pos), pos, ss2, i)) : L}}
      +e2 = Equal.sym(List<&2, List<&2, Laws.Item>>, Laws.MaskedParts(bs, hi, ss2, i), Laws.MaskedParts(bs, hi, rest, 1n+i), m.masked_skip(bs, hi, a, b, rest, i, bl2, bh, ab))
      m.ok_move(r, acc2, rest, 1n+i, b, acc, ss2, i, pos, hi, bs, e1, e2,
        m.part_ok(rest, K.starts_from(rest, hi), K.starts_from(rest, b), K.ends_by(rest, hi), 1n+i, b, hi, acc2, bs, {==}, {==}, {==},
          m.ap_tri(rest, m.cf_apart(b, rest, cr1)), m.cf_head(b, rest, cr2), bh, q.bs_dup(bs, hi, bl1)))
    case Con{K.Cut{+a, +b}, +rest} False{} True{} False{}:
      (ap1, ((+ab, cr), ap3)) = app
      -L = List<&2, Laws.Item>
      +ah = ge_false_lt(a, hi, el)
      +pa = ge_le(a, pos, ef)
      +hb = q.le_false_lt(b, hi, es)
      +z = Laws.Shown(K.rev.pieces(acc, Nil{}))
      +bytes = Laws.Bytes(Nat.sub(a, pos), pos)
      +ss2 = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
      +e1 = {
        %Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss2, i), Laws.Join(bytes, [Laws.Marker{i}]), m.s_fresh_long(pos, hi, a, b, rest, i, pa, ab, ah, hb, m.cf_dup(rest, b, cr)))
          : {Laws.Shown(K.rev.pieces(K.Hide{i} <> (K.Keep{pos, a} <> acc), Nil{})) == Laws.Join(z, _) : L}
        m.shown_rev(acc, [K.Keep{pos, a}, K.Hide{i}])
      : {Laws.Shown(K.rev.pieces(K.Hide{i} <> (K.Keep{pos, a} <> acc), Nil{})) == Laws.Join(z, Laws.Items(Nat.sub(hi, pos), pos, ss2, i)) : L}}
      (e1, ({==}, (ap1, hb)))
    case Con{K.Cut{+a, +b}, +rest} False{} False{} True{}:
      ((+ab, cr1), ((ab2, cr2), (ab3, cr3))) = app
      (bl1, bl2) = blp
      -L = List<&2, Laws.Item>
      +apos = ge_false_lt(a, pos, ef)
      +bh = es
      +r = K.part.go(rest, K.starts_from(rest, hi), K.starts_from(rest, b), K.ends_by(rest, hi), 1n+i, b, hi, acc)
      +z = Laws.Shown(K.rev.pieces(acc, Nil{}))
      +ss2 = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
      +e1 = Equal.cong(L, L, l => Laws.Join(z, l), Laws.Items(Nat.sub(hi, b), b, rest, 1n+i), Laws.Items(Nat.sub(hi, pos), pos, ss2, i),
        Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss2, i), Laws.Items(Nat.sub(hi, b), b, rest, 1n+i), m.s_prog_short(pos, hi, a, b, rest, i, apos, ha, bh, ab, m.cf_dup(rest, b, cr3))))
      +e2 = Equal.sym(List<&2, List<&2, Laws.Item>>, Laws.MaskedParts(bs, hi, ss2, i), Laws.MaskedParts(bs, hi, rest, 1n+i), m.masked_skip(bs, hi, a, b, rest, i, bl2, bh, ab))
      m.ok_move(r, acc, rest, 1n+i, b, acc, ss2, i, pos, hi, bs, e1, e2,
        m.part_ok(rest, K.starts_from(rest, hi), K.starts_from(rest, b), K.ends_by(rest, hi), 1n+i, b, hi, acc, bs, {==}, {==}, {==},
          m.ap_tri(rest, m.cf_apart(b, rest, cr1)), m.cf_head(b, rest, cr2), bh, q.bs_dup(bs, hi, bl1)))
    case Con{K.Cut{+a, +b}, +rest} False{} False{} False{}:
      (ap1, ((ab, cr), ap3)) = app
      -L = List<&2, Laws.Item>
      +apos = ge_false_lt(a, pos, ef)
      +hb = q.le_false_lt(b, hi, es)
      +z = Laws.Shown(K.rev.pieces(acc, Nil{}))
      +ss2 = {K.Cut{a, b} <> rest : List<&2, K.Cut>}
      +e1 = {
        %Equal.sym(L, Laws.Items(Nat.sub(hi, pos), pos, ss2, i), [], m.s_prog_long(pos, hi, a, b, rest, i, apos, ph, hb, m.cf_dup(rest, b, cr)))
          : {z == Laws.Join(z, _) : L}
        Equal.sym(L, Laws.Join(z, []), z, m.join_nil(z))
      : {z == Laws.Join(z, Laws.Items(Nat.sub(hi, pos), pos, ss2, i)) : L}}
      (e1, ({==}, (ap1, hb)))

def m.joinp(xs: +List<List<&2, Laws.Item>>, ys: +List<List<&2, Laws.Item>>) -> List<&2, List<&2, Laws.Item>>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      x <> m.joinp(rest, ys)

def m.joinp_assoc(xs: +List<List<&2, Laws.Item>>, +ys: +List<List<&2, Laws.Item>>, +zs: +List<List<&2, Laws.Item>>) -> {m.joinp(m.joinp(xs, ys), zs) == m.joinp(xs, m.joinp(ys, zs)) : List<&2, List<&2, Laws.Item>>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %m.joinp_assoc(rest, ys, zs) : {x <> m.joinp(m.joinp(rest, ys), zs) == x <> _ : List<&2, List<&2, Laws.Item>>}
      {==}

def m.joinp_nil(xs: +List<List<&2, Laws.Item>>) -> {m.joinp(xs, []) == xs : List<&2, List<&2, Laws.Item>>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +rest}:
      %m.joinp_nil(rest) : {x <> m.joinp(rest, []) == x <> _ : List<&2, List<&2, Laws.Item>>}
      {==}

def m.sp_rev(xs: +List<List<&2, K.Piece>>, +ys: +List<List<&2, K.Piece>>) -> {Laws.ShownParts(K.rev.parts(xs, ys)) == m.joinp(Laws.ShownParts(K.rev.parts(xs, Nil{})), Laws.ShownParts(ys)) : List<&2, List<&2, Laws.Item>>}:
  match xs:
    case Nil{}:
      {==}
    case Con{+x, +r}:
      -T = List<&2, List<&2, Laws.Item>>
      +z = Laws.ShownParts(K.rev.parts(r, Nil{}))
      Equal.trans(T, Laws.ShownParts(K.rev.parts(r, x <> ys)), m.joinp(z, Laws.Shown(x) <> Laws.ShownParts(ys)), m.joinp(Laws.ShownParts(K.rev.parts(r, [x])), Laws.ShownParts(ys)),
        m.sp_rev(r, x <> ys),
        Equal.trans(T, m.joinp(z, Laws.Shown(x) <> Laws.ShownParts(ys)), m.joinp(m.joinp(z, [Laws.Shown(x)]), Laws.ShownParts(ys)), m.joinp(Laws.ShownParts(K.rev.parts(r, [x])), Laws.ShownParts(ys)),
          Equal.sym(T, m.joinp(m.joinp(z, [Laws.Shown(x)]), Laws.ShownParts(ys)), m.joinp(z, m.joinp([Laws.Shown(x)], Laws.ShownParts(ys))), m.joinp_assoc(z, [Laws.Shown(x)], Laws.ShownParts(ys))),
          Equal.cong(T, T, l => m.joinp(l, Laws.ShownParts(ys)), m.joinp(z, [Laws.Shown(x)]), Laws.ShownParts(K.rev.parts(r, [x])),
            Equal.sym(T, Laws.ShownParts(K.rev.parts(r, [x])), m.joinp(z, [Laws.Shown(x)]), m.sp_rev(r, [x])))))

def m.parts_ok(bs: +List<Nat>, st: K.Part, +lo: Nat, +done: +List<List<&2, K.Piece>>, +ssP: +List<K.Cut>, +iP: Nat, +loP: Nat,
  ok: m.PartOk(st, Nil{}, ssP, iP, loP, lo, bs), blp: Laws.BsFrom(lo, bs) & Laws.BsFrom(lo, bs))
  -> {Laws.ShownParts(K.parts.go(bs, st, lo, done)) == m.joinp(Laws.ShownParts(K.rev.parts(done, Nil{})), Laws.MaskedParts(lo <> bs, loP, ssP, iP)) : List<&2, List<&2, Laws.Item>>}:
  match bs:
    case Nil{}:
      match st:
        case K.Part{ss, i, +ps}:
          (o1, rest) = ok
          -T = List<&2, List<&2, Laws.Item>>
          +z = Laws.ShownParts(K.rev.parts(done, Nil{}))
          %o1 : {Laws.ShownParts(K.rev.parts(ps <> done, Nil{})) == m.joinp(z, [_]) : T}
          m.sp_rev(done, [ps])
    case Con{+hi, +rest}:
      match st:
        case K.Part{+ss, +i, +ps}:
          (o1, (o2, (ap, ha))) = ok
          ((lh, b1), (lh2, b2)) = blp
          -T = List<&2, List<&2, Laws.Item>>
          +z = Laws.ShownParts(K.rev.parts(done, Nil{}))
          +st2 = K.part(ss, i, lo, hi)
          +tailP = Laws.MaskedParts(hi <> rest, lo, ssP, iP)
          +ih = m.parts_ok(rest, st2, hi, ps <> done, ss, i, lo,
            m.part_ok(ss, K.starts_from(ss, hi), K.starts_from(ss, lo), K.ends_by(ss, hi), i, lo, hi, Nil{}, rest, {==}, {==}, {==}, m.ap_tri(ss, ap), ha, lh, q.bs_dup(rest, hi, b1)),
            q.bs_dup(rest, hi, b2))
          %o2 : {Laws.ShownParts(K.parts.go(rest, st2, hi, ps <> done)) == m.joinp(z, Laws.Items(Nat.sub(lo, loP), loP, ssP, iP) <> _) : T}
          %o1 : {Laws.ShownParts(K.parts.go(rest, st2, hi, ps <> done)) == m.joinp(z, _ <> Laws.MaskedParts(hi <> rest, lo, ss, i)) : T}
          Equal.trans(T, Laws.ShownParts(K.parts.go(rest, st2, hi, ps <> done)), m.joinp(Laws.ShownParts(K.rev.parts(ps <> done, Nil{})), Laws.MaskedParts(hi <> rest, lo, ss, i)), m.joinp(z, Laws.Shown(ps) <> Laws.MaskedParts(hi <> rest, lo, ss, i)),
            ih,
            Equal.trans(T, m.joinp(Laws.ShownParts(K.rev.parts(done, [ps])), Laws.MaskedParts(hi <> rest, lo, ss, i)), m.joinp(m.joinp(z, [Laws.Shown(ps)]), Laws.MaskedParts(hi <> rest, lo, ss, i)), m.joinp(z, Laws.Shown(ps) <> Laws.MaskedParts(hi <> rest, lo, ss, i)),
              Equal.cong(T, T, l => m.joinp(l, Laws.MaskedParts(hi <> rest, lo, ss, i)), Laws.ShownParts(K.rev.parts(done, [ps])), m.joinp(z, [Laws.Shown(ps)]), m.sp_rev(done, [ps])),
              m.joinp_assoc(z, [Laws.Shown(ps)], Laws.MaskedParts(hi <> rest, lo, ss, i))))

def m.law.k(bs: +List<Nat>, +ss: +List<K.Cut>, sp: Laws.BsFrom(0n, bs) & Laws.BsFrom(0n, bs), cfp: Laws.CutsFrom(0n, ss) & Laws.CutsFrom(0n, ss))
  -> {Laws.ShownParts(K.cut(bs, ss)) == Laws.MaskedParts(bs, 0n, ss, 0n) : List<&2, List<&2, Laws.Item>>}:
  match bs:
    case Nil{}:
      {==}
    case Con{+hi, +rest}:
      ((lh, br1), (lh2, br2)) = sp
      (c1, c2) = cfp
      m.parts_ok(rest, K.part(ss, 0n, 0n, hi), hi, Nil{}, ss, 0n, 0n,
        m.part_ok(ss, K.starts_from(ss, hi), K.starts_from(ss, 0n), K.ends_by(ss, hi), 0n, 0n, hi, Nil{}, rest, {==}, {==}, {==},
          m.ap_tri(ss, m.cf_apart(0n, ss, c1)), m.cf_head(0n, ss, c2), m.le_zero_l(hi), q.bs_dup(rest, hi, br1)),
        q.bs_dup(rest, hi, br2))

def Laws.mask_keeps_each_byte_outside_findings_and_marks_each_finding_once(bs, sorted, ss, apart):
  m.law.k(bs, ss, q.bs_dup(bs, 0n, sorted), m.cf_dup(ss, 0n, apart))

def dc.all_eq(fs: +List<Bool>) -> {D.all_maskable(fs) == Laws.Maskable(fs) : Bool}:
  match fs:
    case Nil{}:
      {==}
    case Con{True{}, +rest}:
      dc.all_eq(rest)
    case Con{False{}, rest}:
      {==}

def dc.redact_pick(b: Bool) -> {D.decide.redact(b) == Bool.pick(D.Action, b, D.Masked{}, D.Unmaskable{}) : D.Action}:
  match b:
    case True{}:
      {==}
    case False{}:
      {==}

def Laws.decide_forwards_the_original_when_nothing_is_found(mode):
  match mode:
    case D.Redact{}:
      {==}
    case D.NoGo{}:
      {==}
    case D.Advisory{}:
      {==}

def Laws.decide_forwards_the_original_in_advisory_mode(fs):
  match fs:
    case Nil{}:
      {==}
    case Con{f, rest}:
      {==}

def Laws.decide_blocks_every_finding_in_no_go_mode(f, fs):
  {==}

def Laws.decide_masks_in_redact_mode_only_when_every_finding_can_be_masked(f, fs):
  Equal.trans(D.Action, D.decide.redact(D.all_maskable(f <> fs)), D.decide.redact(Laws.Maskable(f <> fs)), Bool.pick(D.Action, Laws.Maskable(f <> fs), D.Masked{}, D.Unmaskable{}),
    Equal.cong(Bool, D.Action, b => D.decide.redact(b), D.all_maskable(f <> fs), Laws.Maskable(f <> fs), dc.all_eq(f <> fs)),
    dc.redact_pick(Laws.Maskable(f <> fs)))

def po.same_refl(a: +List<Bool>) -> {Laws.KeySame(a, a) == True{} : Bool}:
  match a:
    case Nil{}:
      {==}
    case Con{x, ra}:
      match x:
        case True{}:
          po.same_refl(ra)
        case False{}:
          po.same_refl(ra)

def po.ft(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

def po.same_sound(a: +List<Bool>, b: +List<Bool>, e: {Laws.KeySame(a, b) == True{} : Bool}) -> {a == b : List<&2, Bool>}:
  match a:
    case Nil{}:
      match b:
        case Nil{}:
          {==}
        case Con{y, rb}:
          Empty.absurd({Nil{} == Con{y, rb} : List<&2, Bool>}, po.ft(e))
    case Con{x, ra}:
      match x:
        case True{}:
          match b:
            case Nil{}:
              Empty.absurd({Con{True{}, ra} == Nil{} : List<&2, Bool>}, po.ft(e))
            case Con{y, rb}:
              match y:
                case True{}:
                  Equal.cong(List<&2, Bool>, List<&2, Bool>, t => Con{True{}, t}, ra, rb, po.same_sound(ra, rb, e))
                case False{}:
                  Empty.absurd({Con{True{}, ra} == Con{False{}, rb} : List<&2, Bool>}, po.ft(e))
        case False{}:
          match b:
            case Nil{}:
              Empty.absurd({Con{False{}, ra} == Nil{} : List<&2, Bool>}, po.ft(e))
            case Con{y, rb}:
              match y:
                case True{}:
                  Empty.absurd({Con{False{}, ra} == Con{True{}, rb} : List<&2, Bool>}, po.ft(e))
                case False{}:
                  Equal.cong(List<&2, Bool>, List<&2, Bool>, t => Con{False{}, t}, ra, rb, po.same_sound(ra, rb, e))

def po.get_tip(-A: Data, k: +List<Bool>) -> {Q.get(A, k, Q.Tip{}) == None{} : Maybe<&2, A>}:
  match k:
    case Nil{}:
      {==}
    case Con{b, rest}:
      match b:
        case True{}:
          {==}
        case False{}:
          {==}

def po.get_set(-A: Data, k: +List<Bool>, j: +List<Bool>, t: Q.Trie<A>, +v: A)
  -> {Q.get(A, j, Q.set(A, k, t, v)) == Bool.pick(Maybe<&2, A>, Laws.KeySame(k, j), Some{v}, Q.get(A, j, t)) : Maybe<&2, A>}:
  match k:
    case Nil{}:
      match j:
        case Nil{}:
          match t:
            case Q.Tip{}:
              {==}
            case Q.Bin{h, z, o}:
              {==}
        case Con{b2, r2}:
          match b2:
            case True{}:
              match t:
                case Q.Tip{}:
                  po.get_tip(A, r2)
                case Q.Bin{h, z, o}:
                  {==}
            case False{}:
              match t:
                case Q.Tip{}:
                  po.get_tip(A, r2)
                case Q.Bin{h, z, o}:
                  {==}
    case Con{b, rest}:
      match b:
        case True{}:
          match j:
            case Nil{}:
              match t:
                case Q.Tip{}:
                  {==}
                case Q.Bin{h, z, o}:
                  {==}
            case Con{b2, +r2}:
              match b2:
                case True{}:
                  match t:
                    case Q.Tip{}:
                      %po.get_tip(A, r2) : {Q.get(A, r2, Q.set(A, rest, Q.Tip{}, v)) == Bool.pick(Maybe<&2, A>, Laws.KeySame(rest, r2), Some{v}, _) : Maybe<&2, A>}
                      po.get_set(A, rest, r2, Q.Tip{}, v)
                    case Q.Bin{h, z, o}:
                      po.get_set(A, rest, r2, o, v)
                case False{}:
                  match t:
                    case Q.Tip{}:
                      po.get_tip(A, r2)
                    case Q.Bin{h, z, o}:
                      {==}
        case False{}:
          match j:
            case Nil{}:
              match t:
                case Q.Tip{}:
                  {==}
                case Q.Bin{h, z, o}:
                  {==}
            case Con{b2, +r2}:
              match b2:
                case True{}:
                  match t:
                    case Q.Tip{}:
                      po.get_tip(A, r2)
                    case Q.Bin{h, z, o}:
                      {==}
                case False{}:
                  match t:
                    case Q.Tip{}:
                      %po.get_tip(A, r2) : {Q.get(A, r2, Q.set(A, rest, Q.Tip{}, v)) == Bool.pick(Maybe<&2, A>, Laws.KeySame(rest, r2), Some{v}, _) : Maybe<&2, A>}
                      po.get_set(A, rest, r2, Q.Tip{}, v)
                    case Q.Bin{h, z, o}:
                      po.get_set(A, rest, r2, z, v)

def po.len(q: +List<Q.Use>) -> Nat:
  match q:
    case Nil{}:
      0n
    case x <> rest:
      1n+po.len(rest)

def po.build(q: +List<Q.Use>) -> Q.State:
  match q:
    case Nil{}:
      Q.State{Nil{}, Q.Tip{}}
    case Q.Use{+g, +s} <> +rest:
      Q.step(po.build(rest), g, s, po.len(rest))

def po.revonto(ds: +List<Q.Use>, q: +List<Q.Use>) -> +List<Q.Use>:
  match ds:
    case Nil{}:
      q
    case d <> rest:
      po.revonto(rest, d <> q)

def po.go_build(ds: +List<Q.Use>, +q: +List<Q.Use>) -> {Q.go(ds, po.len(q), po.build(q)) == po.build(po.revonto(ds, q)) : Q.State}:
  match ds:
    case Nil{}:
      {==}
    case Q.Use{+g, +s} <> rest:
      po.go_build(rest, Q.Use{g, s} <> q)

def po.order(st: Q.State) -> List<&2, List<&2, Bool>>:
  match st:
    case Q.State{o, gs}:
      o

def po.groups(st: Q.State) -> Q.Trie<Q.Group>:
  match st:
    case Q.State{o, gs}:
      gs

def po.cur(grp: Q.Group) -> List<&2, Bool>:
  match grp:
    case Q.Group{c, o, src}:
      c

def po.ord(grp: Q.Group) -> List<&2, List<&2, Bool>>:
  match grp:
    case Q.Group{c, o, src}:
      o

def po.src(grp: Q.Group) -> Q.Trie<Q.Stat>:
  match grp:
    case Q.Group{c, o, src}:
      src

def po.fresh(m: Maybe<&2, Q.Group>) -> Q.Group:
  match m:
    case None{}:
      Q.Group{Nil{}, Nil{}, Q.Tip{}}
    case Some{grp}:
      grp

def po.note_g(m: Maybe<&2, Q.Group>, +g: +List<Bool>, o: +List<List<&2, Bool>>) -> List<&2, List<&2, Bool>>:
  match m:
    case None{}:
      g <> o
    case Some{grp}:
      o

def po.found_groups(m: Maybe<&2, Q.Group>, +g: +List<Bool>, +s: +List<Bool>, +i: Nat, o: +List<List<&2, Bool>>, gs: Q.Trie<Q.Group>)
  -> {po.groups(Q.step.found(m, g, s, i, o, gs)) == Q.set(Q.Group, g, gs, Q.visit(po.fresh(m), s, i)) : Q.Trie<Q.Group>}:
  match m:
    case None{}:
      {==}
    case Some{grp}:
      {==}

def po.found_order(m: Maybe<&2, Q.Group>, +g: +List<Bool>, +s: +List<Bool>, +i: Nat, o: +List<List<&2, Bool>>, gs: Q.Trie<Q.Group>)
  -> {po.order(Q.step.found(m, g, s, i, o, gs)) == po.note_g(m, g, o) : List<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{grp}:
      {==}

def po.step_groups(st: Q.State, +g: +List<Bool>, +s: +List<Bool>, +i: Nat)
  -> {po.groups(Q.step(st, g, s, i)) == Q.set(Q.Group, g, po.groups(st), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(st))), s, i)) : Q.Trie<Q.Group>}:
  match st:
    case Q.State{o, +gs}:
      po.found_groups(Q.get(Q.Group, g, gs), g, s, i, o, gs)

def po.step_order(st: Q.State, +g: +List<Bool>, +s: +List<Bool>, +i: Nat)
  -> {po.order(Q.step(st, g, s, i)) == po.note_g(Q.get(Q.Group, g, po.groups(st)), g, po.order(st)) : List<&2, List<&2, Bool>>}:
  match st:
    case Q.State{o, +gs}:
      po.found_order(Q.get(Q.Group, g, gs), g, s, i, o, gs)

def po.visit_src(grp: Q.Group, +s: +List<Bool>, +i: Nat)
  -> {po.src(Q.visit(grp, s, i)) == Q.set(Q.Stat, s, po.src(grp), Q.bump(Q.get(Q.Stat, s, po.src(grp)), i)) : Q.Trie<Q.Stat>}:
  match grp:
    case Q.Group{c, o, src}:
      {==}

def po.visit_cur(grp: Q.Group, +s: +List<Bool>, +i: Nat) -> {po.cur(Q.visit(grp, s, i)) == s : List<&2, Bool>}:
  match grp:
    case Q.Group{c, o, src}:
      {==}

def po.visit_ord(grp: Q.Group, +s: +List<Bool>, +i: Nat)
  -> {po.ord(Q.visit(grp, s, i)) == Q.note(Q.get(Q.Stat, s, po.src(grp)), s, po.ord(grp)) : List<&2, List<&2, Bool>>}:
  match grp:
    case Q.Group{c, o, src}:
      {==}

def po.exp(+k: +List<Bool>, +s: +List<Bool>, q: +List<Q.Use>) -> Maybe<&2, Q.Stat>:
  match q:
    case Nil{}:
      None{}
    case Q.Use{g, s2} <> +rest:
      Bool.pick(Maybe<&2, Q.Stat>, Bool.and(Laws.KeySame(g, k), Laws.KeySame(s2, s)), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))

def po.stat_hit(+g: +List<Bool>, +s: +List<Bool>, +s2: +List<Bool>, +i: Nat, +t: Q.Trie<Q.Stat>, -rest: +List<Q.Use>, d: Bool, +ed: {Laws.KeySame(s2, s) == d : Bool},
  e2: {Q.get(Q.Stat, s2, t) == po.exp(g, s2, rest) : Maybe<&2, Q.Stat>}, es: {Q.get(Q.Stat, s, t) == po.exp(g, s, rest) : Maybe<&2, Q.Stat>})
  -> {Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(Q.get(Q.Stat, s2, t), i)}, Q.get(Q.Stat, s, t)) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(g, s, rest), i)}, po.exp(g, s, rest)) : Maybe<&2, Q.Stat>}:
  match d:
    case True{}:
      %Equal.sym(Bool, Laws.KeySame(s2, s), True{}, ed) : {Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(Q.get(Q.Stat, s2, t), i)}, Q.get(Q.Stat, s, t)) == Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(po.exp(g, s, rest), i)}, po.exp(g, s, rest)) : Maybe<&2, Q.Stat>}
      %po.same_sound(s2, s, ed) : {Some{Q.bump(Q.get(Q.Stat, s2, t), i)} == Some{Q.bump(po.exp(g, _, rest), i)} : Maybe<&2, Q.Stat>}
      Equal.cong(Maybe<&2, Q.Stat>, Maybe<&2, Q.Stat>, x => Some{Q.bump(x, i)}, Q.get(Q.Stat, s2, t), po.exp(g, s2, rest), e2)
    case False{}:
      %Equal.sym(Bool, Laws.KeySame(s2, s), False{}, ed) : {Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(Q.get(Q.Stat, s2, t), i)}, Q.get(Q.Stat, s, t)) == Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(po.exp(g, s, rest), i)}, po.exp(g, s, rest)) : Maybe<&2, Q.Stat>}
      es


def po.stat_pick(+k: +List<Bool>, +s: +List<Bool>, +g: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, c: Bool, +ec: {Laws.KeySame(g, k) == c : Bool},
  ihk: {Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, k, po.groups(po.build(rest)))))) == po.exp(k, s, rest) : Maybe<&2, Q.Stat>},
  ih2: {Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))) == po.exp(g, s2, rest) : Maybe<&2, Q.Stat>},
  ihs: {Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))) == po.exp(g, s, rest) : Maybe<&2, Q.Stat>})
  -> {Q.get(Q.Stat, s, po.src(po.fresh(Bool.pick(Maybe<&2, Q.Group>, c, Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest))))))) == Bool.pick(Maybe<&2, Q.Stat>, Bool.and(c, Laws.KeySame(s2, s)), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest)) : Maybe<&2, Q.Stat>}:
  match c:
    case False{}:
      ihk
    case True{}:
      %Equal.sym(Q.Trie<Q.Stat>, po.src(Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), Q.set(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))), Q.bump(Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.len(rest))), po.visit_src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))) : {Q.get(Q.Stat, s, _) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest)) : Maybe<&2, Q.Stat>}
      %Equal.sym(Maybe<&2, Q.Stat>, Q.get(Q.Stat, s, Q.set(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))), Q.bump(Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.len(rest)))), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.len(rest))}, Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))))), po.get_set(Q.Stat, s2, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))), Q.bump(Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.len(rest)))) : {_ == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest)) : Maybe<&2, Q.Stat>}
      %po.same_sound(g, k, ec) : {Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.len(rest))}, Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))))) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(_, s, rest), po.len(rest))}, po.exp(_, s, rest)) : Maybe<&2, Q.Stat>}
      po.stat_hit(g, s, s2, po.len(rest), po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))), rest, Laws.KeySame(s2, s), {==}, ih2, ihs)

def po.stat_build(q: +List<Q.Use>, +k: +List<Bool>, +s: +List<Bool>) -> {Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, k, po.groups(po.build(q)))))) == po.exp(k, s, q) : Maybe<&2, Q.Stat>}:
  match q:
    case Nil{}:
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.Tip{}), None{}, po.get_tip(Q.Group, k)) : {Q.get(Q.Stat, s, po.src(po.fresh(_))) == None{} : Maybe<&2, Q.Stat>}
      po.get_tip(Q.Stat, s)
    case Q.Use{+g, +s2} <> +rest:
      %Equal.sym(Q.Trie<Q.Group>, po.groups(Q.step(po.build(rest), g, s2, po.len(rest))), Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), po.step_groups(po.build(rest), g, s2, po.len(rest))) : {Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, k, _)))) == po.exp(k, s, Q.Use{g, s2} <> rest) : Maybe<&2, Q.Stat>}
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))), Bool.pick(Maybe<&2, Q.Group>, Laws.KeySame(g, k), Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest)))), po.get_set(Q.Group, g, k, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))) : {Q.get(Q.Stat, s, po.src(po.fresh(_))) == po.exp(k, s, Q.Use{g, s2} <> rest) : Maybe<&2, Q.Stat>}
      po.stat_pick(k, s, g, s2, rest, Laws.KeySame(g, k), {==}, po.stat_build(rest, k, s), po.stat_build(rest, g, s2), po.stat_build(rest, g, s))


def po.some_g(m: Maybe<&2, Q.Group>) -> Bool:
  match m:
    case None{}:
      False{}
    case Some{x}:
      True{}

def po.used(+k: +List<Bool>, q: +List<Q.Use>) -> Bool:
  match q:
    case Nil{}:
      False{}
    case Q.Use{g, s} <> rest:
      Bool.or(Laws.KeySame(g, k), po.used(k, rest))

def po.used_pick(+k: +List<Bool>, +g: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, c: Bool, ihk: {po.some_g(Q.get(Q.Group, k, po.groups(po.build(rest)))) == po.used(k, rest) : Bool})
  -> {po.some_g(Bool.pick(Maybe<&2, Q.Group>, c, Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest))))) == Bool.or(c, po.used(k, rest)) : Bool}:
  match c:
    case True{}:
      {==}
    case False{}:
      ihk

def po.used_build(q: +List<Q.Use>, +k: +List<Bool>) -> {po.some_g(Q.get(Q.Group, k, po.groups(po.build(q)))) == po.used(k, q) : Bool}:
  match q:
    case Nil{}:
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.Tip{}), None{}, po.get_tip(Q.Group, k)) : {po.some_g(_) == False{} : Bool}
      {==}
    case Q.Use{+g, +s2} <> +rest:
      %Equal.sym(Q.Trie<Q.Group>, po.groups(Q.step(po.build(rest), g, s2, po.len(rest))), Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), po.step_groups(po.build(rest), g, s2, po.len(rest))) : {po.some_g(Q.get(Q.Group, k, _)) == po.used(k, Q.Use{g, s2} <> rest) : Bool}
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))), Bool.pick(Maybe<&2, Q.Group>, Laws.KeySame(g, k), Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest)))), po.get_set(Q.Group, g, k, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))) : {po.some_g(_) == po.used(k, Q.Use{g, s2} <> rest) : Bool}
      po.used_pick(k, g, s2, rest, Laws.KeySame(g, k), po.used_build(rest, k))

def po.gord(q: +List<Q.Use>) -> List<&2, List<&2, Bool>>:
  match q:
    case Nil{}:
      Nil{}
    case Q.Use{+g, s} <> +rest:
      Bool.pick(List<&2, List<&2, Bool>>, po.used(g, rest), po.gord(rest), g <> po.gord(rest))

def po.note_pick(m: Maybe<&2, Q.Group>, +g: +List<Bool>, +o: +List<List<&2, Bool>>) -> {po.note_g(m, g, o) == Bool.pick(List<&2, List<&2, Bool>>, po.some_g(m), o, g <> o) : List<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{x}:
      {==}

def po.order_build(q: +List<Q.Use>) -> {po.order(po.build(q)) == po.gord(q) : List<&2, List<&2, Bool>>}:
  match q:
    case Nil{}:
      {==}
    case Q.Use{+g, +s2} <> +rest:
      %Equal.sym(List<&2, List<&2, Bool>>, po.order(Q.step(po.build(rest), g, s2, po.len(rest))), po.note_g(Q.get(Q.Group, g, po.groups(po.build(rest))), g, po.order(po.build(rest))), po.step_order(po.build(rest), g, s2, po.len(rest))) : {_ == po.gord(Q.Use{g, s2} <> rest) : List<&2, List<&2, Bool>>}
      %Equal.sym(List<&2, List<&2, Bool>>, po.note_g(Q.get(Q.Group, g, po.groups(po.build(rest))), g, po.order(po.build(rest))), Bool.pick(List<&2, List<&2, Bool>>, po.some_g(Q.get(Q.Group, g, po.groups(po.build(rest)))), po.order(po.build(rest)), g <> po.order(po.build(rest))), po.note_pick(Q.get(Q.Group, g, po.groups(po.build(rest))), g, po.order(po.build(rest)))) : {_ == po.gord(Q.Use{g, s2} <> rest) : List<&2, List<&2, Bool>>}
      %Equal.sym(Bool, po.some_g(Q.get(Q.Group, g, po.groups(po.build(rest)))), po.used(g, rest), po.used_build(rest, g)) : {Bool.pick(List<&2, List<&2, Bool>>, _, po.order(po.build(rest)), g <> po.order(po.build(rest))) == po.gord(Q.Use{g, s2} <> rest) : List<&2, List<&2, Bool>>}
      %Equal.sym(List<&2, List<&2, Bool>>, po.order(po.build(rest)), po.gord(rest), po.order_build(rest)) : {Bool.pick(List<&2, List<&2, Bool>>, po.used(g, rest), _, g <> _) == po.gord(Q.Use{g, s2} <> rest) : List<&2, List<&2, Bool>>}
      {==}

def po.gcur(m: Maybe<&2, Q.Group>) -> Maybe<&2, List<&2, Bool>>:
  match m:
    case None{}:
      None{}
    case Some{grp}:
      Some{po.cur(grp)}

def po.lat(+k: +List<Bool>, q: +List<Q.Use>) -> Maybe<&2, List<&2, Bool>>:
  match q:
    case Nil{}:
      None{}
    case Q.Use{g, +s} <> +rest:
      Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeySame(g, k), Some{s}, po.lat(k, rest))

def po.cur_pick(+k: +List<Bool>, +g: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, c: Bool, ihk: {po.gcur(Q.get(Q.Group, k, po.groups(po.build(rest)))) == po.lat(k, rest) : Maybe<&2, List<&2, Bool>>})
  -> {po.gcur(Bool.pick(Maybe<&2, Q.Group>, c, Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest))))) == Bool.pick(Maybe<&2, List<&2, Bool>>, c, Some{s2}, po.lat(k, rest)) : Maybe<&2, List<&2, Bool>>}:
  match c:
    case True{}:
      Equal.cong(List<&2, Bool>, Maybe<&2, List<&2, Bool>>, x => Some{x}, po.cur(Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), s2, po.visit_cur(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))
    case False{}:
      ihk

def po.cur_build(q: +List<Q.Use>, +k: +List<Bool>) -> {po.gcur(Q.get(Q.Group, k, po.groups(po.build(q)))) == po.lat(k, q) : Maybe<&2, List<&2, Bool>>}:
  match q:
    case Nil{}:
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.Tip{}), None{}, po.get_tip(Q.Group, k)) : {po.gcur(_) == None{} : Maybe<&2, List<&2, Bool>>}
      {==}
    case Q.Use{+g, +s2} <> +rest:
      %Equal.sym(Q.Trie<Q.Group>, po.groups(Q.step(po.build(rest), g, s2, po.len(rest))), Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), po.step_groups(po.build(rest), g, s2, po.len(rest))) : {po.gcur(Q.get(Q.Group, k, _)) == po.lat(k, Q.Use{g, s2} <> rest) : Maybe<&2, List<&2, Bool>>}
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))), Bool.pick(Maybe<&2, Q.Group>, Laws.KeySame(g, k), Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest)))), po.get_set(Q.Group, g, k, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))) : {po.gcur(_) == po.lat(k, Q.Use{g, s2} <> rest) : Maybe<&2, List<&2, Bool>>}
      po.cur_pick(k, g, s2, rest, Laws.KeySame(g, k), po.cur_build(rest, k))

def po.sord(+k: +List<Bool>, q: +List<Q.Use>) -> List<&2, List<&2, Bool>>:
  match q:
    case Nil{}:
      Nil{}
    case Q.Use{g, +s} <> +rest:
      Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(g, k), Q.note(po.exp(k, s, rest), s, po.sord(k, rest)), po.sord(k, rest))

def po.sord_pick(+k: +List<Bool>, +g: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, c: Bool, +ec: {Laws.KeySame(g, k) == c : Bool},
  ihk: {po.ord(po.fresh(Q.get(Q.Group, k, po.groups(po.build(rest))))) == po.sord(k, rest) : List<&2, List<&2, Bool>>},
  ih2: {Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))) == po.exp(g, s2, rest) : Maybe<&2, Q.Stat>},
  ihg: {po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))) == po.sord(g, rest) : List<&2, List<&2, Bool>>})
  -> {po.ord(po.fresh(Bool.pick(Maybe<&2, Q.Group>, c, Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest)))))) == Bool.pick(List<&2, List<&2, Bool>>, c, Q.note(po.exp(k, s2, rest), s2, po.sord(k, rest)), po.sord(k, rest)) : List<&2, List<&2, Bool>>}:
  match c:
    case False{}:
      ihk
    case True{}:
      %Equal.sym(List<&2, List<&2, Bool>>, po.ord(Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), Q.note(Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), s2, po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.visit_ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))) : {_ == Q.note(po.exp(k, s2, rest), s2, po.sord(k, rest)) : List<&2, List<&2, Bool>>}
      %Equal.sym(Maybe<&2, Q.Stat>, Q.get(Q.Stat, s2, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))), po.exp(g, s2, rest), ih2) : {Q.note(_, s2, po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))))) == Q.note(po.exp(k, s2, rest), s2, po.sord(k, rest)) : List<&2, List<&2, Bool>>}
      %Equal.sym(List<&2, List<&2, Bool>>, po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest))))), po.sord(g, rest), ihg) : {Q.note(po.exp(g, s2, rest), s2, _) == Q.note(po.exp(k, s2, rest), s2, po.sord(k, rest)) : List<&2, List<&2, Bool>>}
      %po.same_sound(g, k, ec) : {Q.note(po.exp(g, s2, rest), s2, po.sord(g, rest)) == Q.note(po.exp(_, s2, rest), s2, po.sord(_, rest)) : List<&2, List<&2, Bool>>}
      {==}

def po.sord_build(q: +List<Q.Use>, +k: +List<Bool>) -> {po.ord(po.fresh(Q.get(Q.Group, k, po.groups(po.build(q))))) == po.sord(k, q) : List<&2, List<&2, Bool>>}:
  match q:
    case Nil{}:
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.Tip{}), None{}, po.get_tip(Q.Group, k)) : {po.ord(po.fresh(_)) == Nil{} : List<&2, List<&2, Bool>>}
      {==}
    case Q.Use{+g, +s2} <> +rest:
      %Equal.sym(Q.Trie<Q.Group>, po.groups(Q.step(po.build(rest), g, s2, po.len(rest))), Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))), po.step_groups(po.build(rest), g, s2, po.len(rest))) : {po.ord(po.fresh(Q.get(Q.Group, k, _))) == po.sord(k, Q.Use{g, s2} <> rest) : List<&2, List<&2, Bool>>}
      %Equal.sym(Maybe<&2, Q.Group>, Q.get(Q.Group, k, Q.set(Q.Group, g, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))), Bool.pick(Maybe<&2, Q.Group>, Laws.KeySame(g, k), Some{Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest))}, Q.get(Q.Group, k, po.groups(po.build(rest)))), po.get_set(Q.Group, g, k, po.groups(po.build(rest)), Q.visit(po.fresh(Q.get(Q.Group, g, po.groups(po.build(rest)))), s2, po.len(rest)))) : {po.ord(po.fresh(_)) == po.sord(k, Q.Use{g, s2} <> rest) : List<&2, List<&2, Bool>>}
      po.sord_pick(k, g, s2, rest, Laws.KeySame(g, k), {==}, po.sord_build(rest, k), po.stat_build(rest, g, s2), po.sord_build(rest, g))

def po.m1_hit(+k: +List<Bool>, +g: +List<Bool>, +rest: +List<Q.Use>, c: Bool, +ec: {Laws.KeySame(g, k) == c : Bool},
  eu: {po.used(g, rest) == True{} : Bool}, ih: {Laws.KeyIn(k, po.gord(rest)) == po.used(k, rest) : Bool})
  -> {Laws.KeyIn(k, po.gord(rest)) == Bool.or(c, po.used(k, rest)) : Bool}:
  match c:
    case True{}:
      %Equal.sym(Bool, Laws.KeyIn(k, po.gord(rest)), po.used(k, rest), ih) : {_ == True{} : Bool}
      %po.same_sound(g, k, ec) : {po.used(_, rest) == True{} : Bool}
      eu
    case False{}:
      ih

def po.m1_pick(+k: +List<Bool>, +g: +List<Bool>, +rest: +List<Q.Use>, u: Bool, eu: {po.used(g, rest) == u : Bool}, ih: {Laws.KeyIn(k, po.gord(rest)) == po.used(k, rest) : Bool})
  -> {Laws.KeyIn(k, Bool.pick(List<&2, List<&2, Bool>>, u, po.gord(rest), g <> po.gord(rest))) == Bool.or(Laws.KeySame(g, k), po.used(k, rest)) : Bool}:
  match u:
    case True{}:
      po.m1_hit(k, g, rest, Laws.KeySame(g, k), {==}, eu, ih)
    case False{}:
      Equal.cong(Bool, Bool, x => Bool.or(Laws.KeySame(g, k), x), Laws.KeyIn(k, po.gord(rest)), po.used(k, rest), ih)

def po.m1(q: +List<Q.Use>, +k: +List<Bool>) -> {Laws.KeyIn(k, po.gord(q)) == po.used(k, q) : Bool}:
  match q:
    case Nil{}:
      {==}
    case Q.Use{+g, s} <> +rest:
      po.m1_pick(k, g, rest, po.used(g, rest), {==}, po.m1(rest, k))

def po.some_s(m: Maybe<&2, Q.Stat>) -> Bool:
  match m:
    case None{}:
      False{}
    case Some{x}:
      True{}


def po.m2_none(+k: +List<Bool>, +s: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, d: Bool, +ed: {Laws.KeySame(s2, s) == d : Bool},
  ih: {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(po.exp(k, s, rest)) : Bool})
  -> {Bool.or(Laws.KeySame(s2, s), Laws.KeyIn(s, po.sord(k, rest))) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}:
  match d:
    case True{}:
      %Equal.sym(Bool, Laws.KeySame(s2, s), True{}, ed) : {Bool.or(_, Laws.KeyIn(s, po.sord(k, rest))) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}
      {==}
    case False{}:
      %Equal.sym(Bool, Laws.KeySame(s2, s), False{}, ed) : {Bool.or(_, Laws.KeyIn(s, po.sord(k, rest))) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}
      ih

def po.m2_some(+k: +List<Bool>, +s: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, +st: Q.Stat, en: {po.exp(k, s2, rest) == Some{st} : Maybe<&2, Q.Stat>}, d: Bool, +ed: {Laws.KeySame(s2, s) == d : Bool},
  ih: {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(po.exp(k, s, rest)) : Bool})
  -> {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}:
  match d:
    case True{}:
      %Equal.sym(Bool, Laws.KeySame(s2, s), True{}, ed) : {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}
      %Equal.sym(Bool, Laws.KeyIn(s, po.sord(k, rest)), po.some_s(po.exp(k, s, rest)), ih) : {_ == True{} : Bool}
      %po.same_sound(s2, s, ed) : {po.some_s(po.exp(k, _, rest)) == True{} : Bool}
      Equal.cong(Maybe<&2, Q.Stat>, Bool, x => po.some_s(x), po.exp(k, s2, rest), Some{st}, en)
    case False{}:
      %Equal.sym(Bool, Laws.KeySame(s2, s), False{}, ed) : {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, _, Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}
      ih

def po.m2_hit(+k: +List<Bool>, +s: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, n: Maybe<&2, Q.Stat>, +en: {po.exp(k, s2, rest) == n : Maybe<&2, Q.Stat>},
  ih: {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(po.exp(k, s, rest)) : Bool})
  -> {Laws.KeyIn(s, Q.note(n, s2, po.sord(k, rest))) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(s2, s), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}:
  match n:
    case None{}:
      po.m2_none(k, s, s2, rest, Laws.KeySame(s2, s), {==}, ih)
    case Some{+st}:
      po.m2_some(k, s, s2, rest, st, en, Laws.KeySame(s2, s), {==}, ih)

def po.m2_pick(+k: +List<Bool>, +s: +List<Bool>, +g: +List<Bool>, +s2: +List<Bool>, +rest: +List<Q.Use>, c: Bool,
  ih: {Laws.KeyIn(s, po.sord(k, rest)) == po.some_s(po.exp(k, s, rest)) : Bool})
  -> {Laws.KeyIn(s, Bool.pick(List<&2, List<&2, Bool>>, c, Q.note(po.exp(k, s2, rest), s2, po.sord(k, rest)), po.sord(k, rest))) == po.some_s(Bool.pick(Maybe<&2, Q.Stat>, Bool.and(c, Laws.KeySame(s2, s)), Some{Q.bump(po.exp(k, s, rest), po.len(rest))}, po.exp(k, s, rest))) : Bool}:
  match c:
    case True{}:
      po.m2_hit(k, s, s2, rest, po.exp(k, s2, rest), {==}, ih)
    case False{}:
      ih

def po.m2(q: +List<Q.Use>, +k: +List<Bool>, +s: +List<Bool>) -> {Laws.KeyIn(s, po.sord(k, q)) == po.some_s(po.exp(k, s, q)) : Bool}:
  match q:
    case Nil{}:
      {==}
    case Q.Use{+g, +s2} <> +rest:
      po.m2_pick(k, s, g, s2, rest, Laws.KeySame(g, k), po.m2(rest, k, s))

def po.pick_merge(-A: Type, a: Bool, b: Bool, x: A, y: A, z: A, hz: {Bool.pick(A, a, z, x) == x : A})
  -> {Bool.pick(A, b, x, Bool.pick(A, a, z, y)) == Bool.pick(A, Bool.or(a, b), x, y) : A}:
  match a:
    case True{}:
      match b:
        case True{}:
          {==}
        case False{}:
          hz
    case False{}:
      {==}

def po.key_pick_at(-A: Type, +k: +List<Bool>, +g: +List<Bool>, f: List<&2, Bool> -> A, c: Bool, ec: {Laws.KeySame(k, g) == c : Bool})
  -> {Bool.pick(A, c, f(k), f(g)) == f(g) : A}:
  match c:
    case True{}:
      %Equal.sym(List<&2, Bool>, k, g, po.same_sound(k, g, ec)) : {Bool.pick(A, True{}, f(_), f(g)) == f(g) : A}
      {==}
    case False{}:
      {==}

def po.key_pick(-A: Type, +k: +List<Bool>, +g: +List<Bool>, f: List<&2, Bool> -> A) -> {Bool.pick(A, Laws.KeySame(k, g), f(k), f(g)) == f(g) : A}:
  po.key_pick_at(A, k, g, f, Laws.KeySame(k, g), {==})

def po.krev(ks: +List<List<&2, Bool>>, acc: +List<List<&2, Bool>>) -> List<&2, List<&2, Bool>>:
  match ks:
    case Nil{}:
      acc
    case k <> rest:
      po.krev(rest, k <> acc)


def po.uc_hist(+k: +List<Bool>, m: Maybe<&2, Q.Group>, +acc: +List<Q.History>) -> {Laws.UseCases(Q.history(k, m) <> acc) == k <> Laws.UseCases(acc) : List<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Group{c, o, src}}:
      {==}

def po.uc_go(ks: +List<List<&2, Bool>>, +gs: Q.Trie<Q.Group>, +acc: +List<Q.History>) -> {Laws.UseCases(Q.histories.go(ks, gs, acc)) == po.krev(ks, Laws.UseCases(acc)) : List<&2, List<&2, Bool>>}:
  match ks:
    case Nil{}:
      {==}
    case +k <> +rest:
      Equal.trans(List<&2, List<&2, Bool>>, Laws.UseCases(Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), po.krev(rest, Laws.UseCases(Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), po.krev(rest, k <> Laws.UseCases(acc)),
        po.uc_go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc),
        Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, x => po.krev(rest, x), Laws.UseCases(Q.history(k, Q.get(Q.Group, k, gs)) <> acc), k <> Laws.UseCases(acc), po.uc_hist(k, Q.get(Q.Group, k, gs), acc)))

def po.hcur(+k: +List<Bool>, m: Maybe<&2, Q.Group>) -> Maybe<&2, List<&2, Bool>>:
  match m:
    case None{}:
      Some{k}
    case Some{grp}:
      Some{po.cur(grp)}

def po.cur_hist(+g: +List<Bool>, +k: +List<Bool>, m: Maybe<&2, Q.Group>, +acc: +List<Q.History>)
  -> {Laws.CurrentOf(g, Q.history(k, m) <> acc) == Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hcur(k, m), Laws.CurrentOf(g, acc)) : Maybe<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Group{c, o, src}}:
      {==}


def po.cur_go(ks: +List<List<&2, Bool>>, +g: +List<Bool>, +gs: Q.Trie<Q.Group>, +acc: +List<Q.History>)
  -> {Laws.CurrentOf(g, Q.histories.go(ks, gs, acc)) == Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeyIn(g, ks), po.hcur(g, Q.get(Q.Group, g, gs)), Laws.CurrentOf(g, acc)) : Maybe<&2, List<&2, Bool>>}:
  match ks:
    case Nil{}:
      {==}
    case +k <> +rest:
      Equal.trans(Maybe<&2, List<&2, Bool>>, Laws.CurrentOf(g, Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hcur(g, Q.get(Q.Group, g, gs)), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hcur(k, Q.get(Q.Group, k, gs)), Laws.CurrentOf(g, acc))), Bool.pick(Maybe<&2, List<&2, Bool>>, Bool.or(Laws.KeySame(k, g), Laws.KeyIn(g, rest)), po.hcur(g, Q.get(Q.Group, g, gs)), Laws.CurrentOf(g, acc)),
        Equal.trans(Maybe<&2, List<&2, Bool>>, Laws.CurrentOf(g, Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hcur(g, Q.get(Q.Group, g, gs)), Laws.CurrentOf(g, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hcur(g, Q.get(Q.Group, g, gs)), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hcur(k, Q.get(Q.Group, k, gs)), Laws.CurrentOf(g, acc))),
          po.cur_go(rest, g, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc),
          Equal.cong(Maybe<&2, List<&2, Bool>>, Maybe<&2, List<&2, Bool>>, x => Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hcur(g, Q.get(Q.Group, g, gs)), x), Laws.CurrentOf(g, Q.history(k, Q.get(Q.Group, k, gs)) <> acc), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hcur(k, Q.get(Q.Group, k, gs)), Laws.CurrentOf(g, acc)), po.cur_hist(g, k, Q.get(Q.Group, k, gs), acc))),
        po.pick_merge(Maybe<&2, List<&2, Bool>>, Laws.KeySame(k, g), Laws.KeyIn(g, rest), po.hcur(g, Q.get(Q.Group, g, gs)), Laws.CurrentOf(g, acc), po.hcur(k, Q.get(Q.Group, k, gs)), po.key_pick(Maybe<&2, List<&2, Bool>>, k, g, +x => po.hcur(x, Q.get(Q.Group, x, gs)))))

def po.zero(m: Maybe<&2, Q.Stat>) -> Q.Stat:
  match m:
    case None{}:
      Q.Stat{0n, 0n, 0n}
    case Some{st}:
      st


def po.ver_stat(+s: +List<Bool>, +k: +List<Bool>, m: Maybe<&2, Q.Stat>, +acc: +List<Q.Version>)
  -> {Laws.StatIn(s, Q.version(k, m) <> acc) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, s), Some{po.zero(m)}, Laws.StatIn(s, acc)) : Maybe<&2, Q.Stat>}:
  match m:
    case None{}:
      {==}
    case Some{st}:
      {==}

def po.ver_go(ks: +List<List<&2, Bool>>, +s: +List<Bool>, +src: Q.Trie<Q.Stat>, +acc: +List<Q.Version>)
  -> {Laws.StatIn(s, Q.versions(ks, src, acc)) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, ks), Some{po.zero(Q.get(Q.Stat, s, src))}, Laws.StatIn(s, acc)) : Maybe<&2, Q.Stat>}:
  match ks:
    case Nil{}:
      {==}
    case +k <> +rest:
      Equal.trans(Maybe<&2, Q.Stat>, Laws.StatIn(s, Q.versions(rest, src, Q.version(k, Q.get(Q.Stat, k, src)) <> acc)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, rest), Some{po.zero(Q.get(Q.Stat, s, src))}, Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, s), Some{po.zero(Q.get(Q.Stat, k, src))}, Laws.StatIn(s, acc))), Bool.pick(Maybe<&2, Q.Stat>, Bool.or(Laws.KeySame(k, s), Laws.KeyIn(s, rest)), Some{po.zero(Q.get(Q.Stat, s, src))}, Laws.StatIn(s, acc)),
        Equal.trans(Maybe<&2, Q.Stat>, Laws.StatIn(s, Q.versions(rest, src, Q.version(k, Q.get(Q.Stat, k, src)) <> acc)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, rest), Some{po.zero(Q.get(Q.Stat, s, src))}, Laws.StatIn(s, Q.version(k, Q.get(Q.Stat, k, src)) <> acc)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, rest), Some{po.zero(Q.get(Q.Stat, s, src))}, Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, s), Some{po.zero(Q.get(Q.Stat, k, src))}, Laws.StatIn(s, acc))),
          po.ver_go(rest, s, src, Q.version(k, Q.get(Q.Stat, k, src)) <> acc),
          Equal.cong(Maybe<&2, Q.Stat>, Maybe<&2, Q.Stat>, x => Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, rest), Some{po.zero(Q.get(Q.Stat, s, src))}, x), Laws.StatIn(s, Q.version(k, Q.get(Q.Stat, k, src)) <> acc), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, s), Some{po.zero(Q.get(Q.Stat, k, src))}, Laws.StatIn(s, acc)), po.ver_stat(s, k, Q.get(Q.Stat, k, src), acc))),
        po.pick_merge(Maybe<&2, Q.Stat>, Laws.KeySame(k, s), Laws.KeyIn(s, rest), Some{po.zero(Q.get(Q.Stat, s, src))}, Laws.StatIn(s, acc), Some{po.zero(Q.get(Q.Stat, k, src))}, po.key_pick(Maybe<&2, Q.Stat>, k, s, +x => Some{po.zero(Q.get(Q.Stat, x, src))})))

def po.hstat(+s: +List<Bool>, m: Maybe<&2, Q.Group>) -> Maybe<&2, Q.Stat>:
  match m:
    case None{}:
      None{}
    case Some{Q.Group{c, o, src}}:
      Laws.StatIn(s, Q.versions(o, src, Nil{}))

def po.stat_hist(+g: +List<Bool>, +s: +List<Bool>, +k: +List<Bool>, m: Maybe<&2, Q.Group>, +acc: +List<Q.History>)
  -> {Laws.StatOf(g, s, Q.history(k, m) <> acc) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, g), po.hstat(s, m), Laws.StatOf(g, s, acc)) : Maybe<&2, Q.Stat>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Group{c, o, src}}:
      {==}


def po.stat_go(ks: +List<List<&2, Bool>>, +g: +List<Bool>, +s: +List<Bool>, +gs: Q.Trie<Q.Group>, +acc: +List<Q.History>)
  -> {Laws.StatOf(g, s, Q.histories.go(ks, gs, acc)) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(g, ks), po.hstat(s, Q.get(Q.Group, g, gs)), Laws.StatOf(g, s, acc)) : Maybe<&2, Q.Stat>}:
  match ks:
    case Nil{}:
      {==}
    case +k <> +rest:
      Equal.trans(Maybe<&2, Q.Stat>, Laws.StatOf(g, s, Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(g, rest), po.hstat(s, Q.get(Q.Group, g, gs)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, g), po.hstat(s, Q.get(Q.Group, k, gs)), Laws.StatOf(g, s, acc))), Bool.pick(Maybe<&2, Q.Stat>, Bool.or(Laws.KeySame(k, g), Laws.KeyIn(g, rest)), po.hstat(s, Q.get(Q.Group, g, gs)), Laws.StatOf(g, s, acc)),
        Equal.trans(Maybe<&2, Q.Stat>, Laws.StatOf(g, s, Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(g, rest), po.hstat(s, Q.get(Q.Group, g, gs)), Laws.StatOf(g, s, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(g, rest), po.hstat(s, Q.get(Q.Group, g, gs)), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, g), po.hstat(s, Q.get(Q.Group, k, gs)), Laws.StatOf(g, s, acc))),
          po.stat_go(rest, g, s, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc),
          Equal.cong(Maybe<&2, Q.Stat>, Maybe<&2, Q.Stat>, x => Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(g, rest), po.hstat(s, Q.get(Q.Group, g, gs)), x), Laws.StatOf(g, s, Q.history(k, Q.get(Q.Group, k, gs)) <> acc), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeySame(k, g), po.hstat(s, Q.get(Q.Group, k, gs)), Laws.StatOf(g, s, acc)), po.stat_hist(g, s, k, Q.get(Q.Group, k, gs), acc))),
        po.pick_merge(Maybe<&2, Q.Stat>, Laws.KeySame(k, g), Laws.KeyIn(g, rest), po.hstat(s, Q.get(Q.Group, g, gs)), Laws.StatOf(g, s, acc), po.hstat(s, Q.get(Q.Group, k, gs)), po.key_pick(Maybe<&2, Q.Stat>, k, g, +x => po.hstat(s, Q.get(Q.Group, x, gs)))))

def po.prog_ver(+k: +List<Bool>, m: Maybe<&2, Q.Stat>, +acc: +List<Q.Version>) -> {Laws.Programs(Q.version(k, m) <> acc) == k <> Laws.Programs(acc) : List<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{st}:
      {==}

def po.prog_go(ks: +List<List<&2, Bool>>, +src: Q.Trie<Q.Stat>, +acc: +List<Q.Version>) -> {Laws.Programs(Q.versions(ks, src, acc)) == po.krev(ks, Laws.Programs(acc)) : List<&2, List<&2, Bool>>}:
  match ks:
    case Nil{}:
      {==}
    case +k <> rest:
      Equal.trans(List<&2, List<&2, Bool>>, Laws.Programs(Q.versions(rest, src, Q.version(k, Q.get(Q.Stat, k, src)) <> acc)), po.krev(rest, Laws.Programs(Q.version(k, Q.get(Q.Stat, k, src)) <> acc)), po.krev(rest, k <> Laws.Programs(acc)),
        po.prog_go(rest, src, Q.version(k, Q.get(Q.Stat, k, src)) <> acc),
        Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, x => po.krev(rest, x), Laws.Programs(Q.version(k, Q.get(Q.Stat, k, src)) <> acc), k <> Laws.Programs(acc), po.prog_ver(k, Q.get(Q.Stat, k, src), acc)))

def po.hprog(m: Maybe<&2, Q.Group>) -> List<&2, List<&2, Bool>>:
  match m:
    case None{}:
      Nil{}
    case Some{Q.Group{c, o, src}}:
      Laws.Programs(Q.versions(o, src, Nil{}))

def po.progof_hist(+g: +List<Bool>, +k: +List<Bool>, m: Maybe<&2, Q.Group>, +acc: +List<Q.History>)
  -> {Laws.ProgramsOf(g, Q.history(k, m) <> acc) == Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hprog(m), Laws.ProgramsOf(g, acc)) : List<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Group{c, o, src}}:
      {==}


def po.progof_go(ks: +List<List<&2, Bool>>, +g: +List<Bool>, +gs: Q.Trie<Q.Group>, +acc: +List<Q.History>)
  -> {Laws.ProgramsOf(g, Q.histories.go(ks, gs, acc)) == Bool.pick(List<&2, List<&2, Bool>>, Laws.KeyIn(g, ks), po.hprog(Q.get(Q.Group, g, gs)), Laws.ProgramsOf(g, acc)) : List<&2, List<&2, Bool>>}:
  match ks:
    case Nil{}:
      {==}
    case +k <> +rest:
      Equal.trans(List<&2, List<&2, Bool>>, Laws.ProgramsOf(g, Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hprog(Q.get(Q.Group, g, gs)), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hprog(Q.get(Q.Group, k, gs)), Laws.ProgramsOf(g, acc))), Bool.pick(List<&2, List<&2, Bool>>, Bool.or(Laws.KeySame(k, g), Laws.KeyIn(g, rest)), po.hprog(Q.get(Q.Group, g, gs)), Laws.ProgramsOf(g, acc)),
        Equal.trans(List<&2, List<&2, Bool>>, Laws.ProgramsOf(g, Q.histories.go(rest, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hprog(Q.get(Q.Group, g, gs)), Laws.ProgramsOf(g, Q.history(k, Q.get(Q.Group, k, gs)) <> acc)), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hprog(Q.get(Q.Group, g, gs)), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hprog(Q.get(Q.Group, k, gs)), Laws.ProgramsOf(g, acc))),
          po.progof_go(rest, g, gs, Q.history(k, Q.get(Q.Group, k, gs)) <> acc),
          Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, x => Bool.pick(List<&2, List<&2, Bool>>, Laws.KeyIn(g, rest), po.hprog(Q.get(Q.Group, g, gs)), x), Laws.ProgramsOf(g, Q.history(k, Q.get(Q.Group, k, gs)) <> acc), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(k, g), po.hprog(Q.get(Q.Group, k, gs)), Laws.ProgramsOf(g, acc)), po.progof_hist(g, k, Q.get(Q.Group, k, gs), acc))),
        po.pick_merge(List<&2, List<&2, Bool>>, Laws.KeySame(k, g), Laws.KeyIn(g, rest), po.hprog(Q.get(Q.Group, g, gs)), Laws.ProgramsOf(g, acc), po.hprog(Q.get(Q.Group, k, gs)), po.key_pick(List<&2, List<&2, Bool>>, k, g, +x => po.hprog(Q.get(Q.Group, x, gs)))))


def po.member_order(+q: +List<Q.Use>, +g: +List<Bool>) -> {Laws.KeyIn(g, po.order(po.build(q))) == po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))) : Bool}:
  %Equal.sym(List<&2, List<&2, Bool>>, po.order(po.build(q)), po.gord(q), po.order_build(q)) : {Laws.KeyIn(g, _) == po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))) : Bool}
  Equal.trans(Bool, Laws.KeyIn(g, po.gord(q)), po.used(g, q), po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.m1(q, g), Equal.sym(Bool, po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.used(g, q), po.used_build(q, g)))

def po.cur_collapse(+g: +List<Bool>, m: Maybe<&2, Q.Group>) -> {Bool.pick(Maybe<&2, List<&2, Bool>>, po.some_g(m), po.hcur(g, m), None{}) == po.gcur(m) : Maybe<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{grp}:
      {==}

def po.out_current(+q: +List<Q.Use>, +g: +List<Bool>) -> {Laws.CurrentOf(g, Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})) == po.lat(g, q) : Maybe<&2, List<&2, Bool>>}:
  Equal.trans(Maybe<&2, List<&2, Bool>>, Laws.CurrentOf(g, Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})), Bool.pick(Maybe<&2, List<&2, Bool>>, Laws.KeyIn(g, po.order(po.build(q))), po.hcur(g, Q.get(Q.Group, g, po.groups(po.build(q)))), None{}), po.lat(g, q),
    po.cur_go(po.order(po.build(q)), g, po.groups(po.build(q)), Nil{}),
    %Equal.sym(Bool, Laws.KeyIn(g, po.order(po.build(q))), po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.member_order(q, g)) : {Bool.pick(Maybe<&2, List<&2, Bool>>, _, po.hcur(g, Q.get(Q.Group, g, po.groups(po.build(q)))), None{}) == po.lat(g, q) : Maybe<&2, List<&2, Bool>>}
    Equal.trans(Maybe<&2, List<&2, Bool>>, Bool.pick(Maybe<&2, List<&2, Bool>>, po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.hcur(g, Q.get(Q.Group, g, po.groups(po.build(q)))), None{}), po.gcur(Q.get(Q.Group, g, po.groups(po.build(q)))), po.lat(g, q), po.cur_collapse(g, Q.get(Q.Group, g, po.groups(po.build(q)))), po.cur_build(q, g)))

def po.out_usecases(+q: +List<Q.Use>) -> {Laws.UseCases(Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})) == po.krev(po.gord(q), Nil{}) : List<&2, List<&2, Bool>>}:
  Equal.trans(List<&2, List<&2, Bool>>, Laws.UseCases(Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})), po.krev(po.order(po.build(q)), Nil{}), po.krev(po.gord(q), Nil{}),
    po.uc_go(po.order(po.build(q)), po.groups(po.build(q)), Nil{}),
    Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, x => po.krev(x, Nil{}), po.order(po.build(q)), po.gord(q), po.order_build(q)))

def po.prog_collapse(m: Maybe<&2, Q.Group>) -> {Bool.pick(List<&2, List<&2, Bool>>, po.some_g(m), po.hprog(m), Nil{}) == po.krev(po.ord(po.fresh(m)), Nil{}) : List<&2, List<&2, Bool>>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Group{c, o, src}}:
      po.prog_go(o, src, Nil{})

def po.out_programs(+q: +List<Q.Use>, +g: +List<Bool>) -> {Laws.ProgramsOf(g, Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})) == po.krev(po.sord(g, q), Nil{}) : List<&2, List<&2, Bool>>}:
  Equal.trans(List<&2, List<&2, Bool>>, Laws.ProgramsOf(g, Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})), Bool.pick(List<&2, List<&2, Bool>>, Laws.KeyIn(g, po.order(po.build(q))), po.hprog(Q.get(Q.Group, g, po.groups(po.build(q)))), Nil{}), po.krev(po.sord(g, q), Nil{}),
    po.progof_go(po.order(po.build(q)), g, po.groups(po.build(q)), Nil{}),
    %Equal.sym(Bool, Laws.KeyIn(g, po.order(po.build(q))), po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.member_order(q, g)) : {Bool.pick(List<&2, List<&2, Bool>>, _, po.hprog(Q.get(Q.Group, g, po.groups(po.build(q)))), Nil{}) == po.krev(po.sord(g, q), Nil{}) : List<&2, List<&2, Bool>>}
    Equal.trans(List<&2, List<&2, Bool>>, Bool.pick(List<&2, List<&2, Bool>>, po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.hprog(Q.get(Q.Group, g, po.groups(po.build(q)))), Nil{}), po.krev(po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q))))), Nil{}), po.krev(po.sord(g, q), Nil{}),
      po.prog_collapse(Q.get(Q.Group, g, po.groups(po.build(q)))),
      Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, x => po.krev(x, Nil{}), po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q))))), po.sord(g, q), po.sord_build(q, g))))

def po.stat_collapse(+s: +List<Bool>, m: Maybe<&2, Q.Group>)
  -> {Bool.pick(Maybe<&2, Q.Stat>, po.some_g(m), po.hstat(s, m), None{}) == Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, po.ord(po.fresh(m))), Some{po.zero(Q.get(Q.Stat, s, po.src(po.fresh(m))))}, None{}) : Maybe<&2, Q.Stat>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Group{c, o, src}}:
      po.ver_go(o, s, src, Nil{})

def po.exp_collapse(e: Maybe<&2, Q.Stat>) -> {Bool.pick(Maybe<&2, Q.Stat>, po.some_s(e), Some{po.zero(e)}, None{}) == e : Maybe<&2, Q.Stat>}:
  match e:
    case None{}:
      {==}
    case Some{st}:
      {==}

def po.out_stat(+q: +List<Q.Use>, +g: +List<Bool>, +s: +List<Bool>) -> {Laws.StatOf(g, s, Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})) == po.exp(g, s, q) : Maybe<&2, Q.Stat>}:
  Equal.trans(Maybe<&2, Q.Stat>, Laws.StatOf(g, s, Q.histories.go(po.order(po.build(q)), po.groups(po.build(q)), Nil{})), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(g, po.order(po.build(q))), po.hstat(s, Q.get(Q.Group, g, po.groups(po.build(q)))), None{}), po.exp(g, s, q),
    po.stat_go(po.order(po.build(q)), g, s, po.groups(po.build(q)), Nil{}),
    %Equal.sym(Bool, Laws.KeyIn(g, po.order(po.build(q))), po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.member_order(q, g)) : {Bool.pick(Maybe<&2, Q.Stat>, _, po.hstat(s, Q.get(Q.Group, g, po.groups(po.build(q)))), None{}) == po.exp(g, s, q) : Maybe<&2, Q.Stat>}
    Equal.trans(Maybe<&2, Q.Stat>, Bool.pick(Maybe<&2, Q.Stat>, po.some_g(Q.get(Q.Group, g, po.groups(po.build(q)))), po.hstat(s, Q.get(Q.Group, g, po.groups(po.build(q)))), None{}), Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q)))))), Some{po.zero(Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q)))))))}, None{}), po.exp(g, s, q),
      po.stat_collapse(s, Q.get(Q.Group, g, po.groups(po.build(q)))),
      %Equal.sym(List<&2, List<&2, Bool>>, po.ord(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q))))), po.sord(g, q), po.sord_build(q, g)) : {Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, _), Some{po.zero(Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q)))))))}, None{}) == po.exp(g, s, q) : Maybe<&2, Q.Stat>}
      %Equal.sym(Maybe<&2, Q.Stat>, Q.get(Q.Stat, s, po.src(po.fresh(Q.get(Q.Group, g, po.groups(po.build(q)))))), po.exp(g, s, q), po.stat_build(q, g, s)) : {Bool.pick(Maybe<&2, Q.Stat>, Laws.KeyIn(s, po.sord(g, q)), Some{po.zero(_)}, None{}) == po.exp(g, s, q) : Maybe<&2, Q.Stat>}
      %Equal.sym(Bool, Laws.KeyIn(s, po.sord(g, q)), po.some_s(po.exp(g, s, q)), po.m2(q, g, s)) : {Bool.pick(Maybe<&2, Q.Stat>, _, Some{po.zero(po.exp(g, s, q))}, None{}) == po.exp(g, s, q) : Maybe<&2, Q.Stat>}
      po.exp_collapse(po.exp(g, s, q))))

def po.kcat(a: +List<List<&2, Bool>>, b: +List<List<&2, Bool>>) -> List<&2, List<&2, Bool>>:
  match a:
    case Nil{}:
      b
    case x <> r:
      x <> po.kcat(r, b)

def po.kcat_nil(a: +List<List<&2, Bool>>) -> {po.kcat(a, Nil{}) == a : List<&2, List<&2, Bool>>}:
  match a:
    case Nil{}:
      {==}
    case +x <> r:
      Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, t => x <> t, po.kcat(r, Nil{}), r, po.kcat_nil(r))

def po.kcat_assoc(a: +List<List<&2, Bool>>, +b: +List<List<&2, Bool>>, +c: +List<List<&2, Bool>>) -> {po.kcat(po.kcat(a, b), c) == po.kcat(a, po.kcat(b, c)) : List<&2, List<&2, Bool>>}:
  match a:
    case Nil{}:
      {==}
    case +x <> r:
      Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, t => x <> t, po.kcat(po.kcat(r, b), c), po.kcat(r, po.kcat(b, c)), po.kcat_assoc(r, b, c))

def po.krev_acc(xs: +List<List<&2, Bool>>, +acc: +List<List<&2, Bool>>) -> {po.krev(xs, acc) == po.kcat(po.krev(xs, Nil{}), acc) : List<&2, List<&2, Bool>>}:
  match xs:
    case Nil{}:
      {==}
    case +x <> +r:
      Equal.trans(List<&2, List<&2, Bool>>, po.krev(r, x <> acc), po.kcat(po.krev(r, Nil{}), x <> acc), po.kcat(po.krev(r, x <> Nil{}), acc),
        po.krev_acc(r, x <> acc),
        Equal.sym(List<&2, List<&2, Bool>>, po.kcat(po.krev(r, x <> Nil{}), acc), po.kcat(po.krev(r, Nil{}), x <> acc),
          Equal.trans(List<&2, List<&2, Bool>>, po.kcat(po.krev(r, x <> Nil{}), acc), po.kcat(po.kcat(po.krev(r, Nil{}), x <> Nil{}), acc), po.kcat(po.krev(r, Nil{}), x <> acc),
            Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, t => po.kcat(t, acc), po.krev(r, x <> Nil{}), po.kcat(po.krev(r, Nil{}), x <> Nil{}), po.krev_acc(r, x <> Nil{})),
            po.kcat_assoc(po.krev(r, Nil{}), x <> Nil{}, acc))))

def po.krev_step(+x: +List<Bool>, +xs: +List<List<&2, Bool>>, +f: +List<List<&2, Bool>>) -> {po.kcat(po.krev(x <> xs, Nil{}), f) == po.kcat(po.krev(xs, Nil{}), x <> f) : List<&2, List<&2, Bool>>}:
  Equal.trans(List<&2, List<&2, Bool>>, po.kcat(po.krev(xs, x <> Nil{}), f), po.kcat(po.kcat(po.krev(xs, Nil{}), x <> Nil{}), f), po.kcat(po.krev(xs, Nil{}), x <> f),
    Equal.cong(List<&2, List<&2, Bool>>, List<&2, List<&2, Bool>>, t => po.kcat(t, f), po.krev(xs, x <> Nil{}), po.kcat(po.krev(xs, Nil{}), x <> Nil{}), po.krev_acc(xs, x <> Nil{})),
    po.kcat_assoc(po.krev(xs, Nil{}), x <> Nil{}, f))


def po.bu_pick(+g: +List<Bool>, +rest: +List<Q.Use>, +q: +List<Q.Use>, u: Bool)
  -> {po.kcat(po.krev(Bool.pick(List<&2, List<&2, Bool>>, u, po.gord(q), g <> po.gord(q)), Nil{}), Laws.FirstUseCases(rest, Bool.pick(List<&2, List<&2, Bool>>, u, po.gord(q), g <> po.gord(q)))) == po.kcat(po.krev(po.gord(q), Nil{}), Bool.pick(List<&2, List<&2, Bool>>, u, Laws.FirstUseCases(rest, po.gord(q)), g <> Laws.FirstUseCases(rest, g <> po.gord(q)))) : List<&2, List<&2, Bool>>}:
  match u:
    case True{}:
      {==}
    case False{}:
      po.krev_step(g, po.gord(q), Laws.FirstUseCases(rest, g <> po.gord(q)))

def po.bridge_u(ds: +List<Q.Use>, +q: +List<Q.Use>) -> {po.krev(po.gord(po.revonto(ds, q)), Nil{}) == po.kcat(po.krev(po.gord(q), Nil{}), Laws.FirstUseCases(ds, po.gord(q))) : List<&2, List<&2, Bool>>}:
  match ds:
    case Nil{}:
      Equal.sym(List<&2, List<&2, Bool>>, po.kcat(po.krev(po.gord(q), Nil{}), Nil{}), po.krev(po.gord(q), Nil{}), po.kcat_nil(po.krev(po.gord(q), Nil{})))
    case Q.Use{+g, +s} <> +rest:
      Equal.trans(List<&2, List<&2, Bool>>, po.krev(po.gord(po.revonto(rest, Q.Use{g, s} <> q)), Nil{}), po.kcat(po.krev(po.gord(Q.Use{g, s} <> q), Nil{}), Laws.FirstUseCases(rest, po.gord(Q.Use{g, s} <> q))), po.kcat(po.krev(po.gord(q), Nil{}), Laws.FirstUseCases(Q.Use{g, s} <> rest, po.gord(q))),
        po.bridge_u(rest, Q.Use{g, s} <> q),
        %Equal.sym(Bool, Laws.KeyIn(g, po.gord(q)), po.used(g, q), po.m1(q, g)) : {po.kcat(po.krev(po.gord(Q.Use{g, s} <> q), Nil{}), Laws.FirstUseCases(rest, po.gord(Q.Use{g, s} <> q))) == po.kcat(po.krev(po.gord(q), Nil{}), Bool.pick(List<&2, List<&2, Bool>>, _, Laws.FirstUseCases(rest, po.gord(q)), g <> Laws.FirstUseCases(rest, g <> po.gord(q)))) : List<&2, List<&2, Bool>>}
        po.bu_pick(g, rest, q, po.used(g, q)))


def po.note_s(e: Maybe<&2, Q.Stat>, +s: +List<Bool>, +o: +List<List<&2, Bool>>) -> {Q.note(e, s, o) == Bool.pick(List<&2, List<&2, Bool>>, po.some_s(e), o, s <> o) : List<&2, List<&2, Bool>>}:
  match e:
    case None{}:
      {==}
    case Some{st}:
      {==}


def po.bp_pick(+k: +List<Bool>, +s: +List<Bool>, +rest: +List<Q.Use>, +q: +List<Q.Use>, c: Bool, n: Bool)
  -> {po.kcat(po.krev(Bool.pick(List<&2, List<&2, Bool>>, c, Bool.pick(List<&2, List<&2, Bool>>, n, po.sord(k, q), s <> po.sord(k, q)), po.sord(k, q)), Nil{}), Laws.FirstPrograms(k, rest, Bool.pick(List<&2, List<&2, Bool>>, c, Bool.pick(List<&2, List<&2, Bool>>, n, po.sord(k, q), s <> po.sord(k, q)), po.sord(k, q)))) == po.kcat(po.krev(po.sord(k, q), Nil{}), Bool.pick(List<&2, List<&2, Bool>>, Bool.and(c, Bool.not(n)), s <> Laws.FirstPrograms(k, rest, s <> po.sord(k, q)), Laws.FirstPrograms(k, rest, po.sord(k, q)))) : List<&2, List<&2, Bool>>}:
  match c:
    case True{}:
      match n:
        case True{}:
          {==}
        case False{}:
          po.krev_step(s, po.sord(k, q), Laws.FirstPrograms(k, rest, s <> po.sord(k, q)))
    case False{}:
      {==}


def po.bridge_p(ds: +List<Q.Use>, +q: +List<Q.Use>, +k: +List<Bool>) -> {po.krev(po.sord(k, po.revonto(ds, q)), Nil{}) == po.kcat(po.krev(po.sord(k, q), Nil{}), Laws.FirstPrograms(k, ds, po.sord(k, q))) : List<&2, List<&2, Bool>>}:
  match ds:
    case Nil{}:
      Equal.sym(List<&2, List<&2, Bool>>, po.kcat(po.krev(po.sord(k, q), Nil{}), Nil{}), po.krev(po.sord(k, q), Nil{}), po.kcat_nil(po.krev(po.sord(k, q), Nil{})))
    case Q.Use{+g, +s} <> +rest:
      Equal.trans(List<&2, List<&2, Bool>>, po.krev(po.sord(k, po.revonto(rest, Q.Use{g, s} <> q)), Nil{}), po.kcat(po.krev(po.sord(k, Q.Use{g, s} <> q), Nil{}), Laws.FirstPrograms(k, rest, po.sord(k, Q.Use{g, s} <> q))), po.kcat(po.krev(po.sord(k, q), Nil{}), Laws.FirstPrograms(k, Q.Use{g, s} <> rest, po.sord(k, q))),
        po.bridge_p(rest, Q.Use{g, s} <> q, k),
        %Equal.sym(List<&2, List<&2, Bool>>, Q.note(po.exp(k, s, q), s, po.sord(k, q)), Bool.pick(List<&2, List<&2, Bool>>, po.some_s(po.exp(k, s, q)), po.sord(k, q), s <> po.sord(k, q)), po.note_s(po.exp(k, s, q), s, po.sord(k, q))) : {po.kcat(po.krev(Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(g, k), _, po.sord(k, q)), Nil{}), Laws.FirstPrograms(k, rest, Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(g, k), _, po.sord(k, q)))) == po.kcat(po.krev(po.sord(k, q), Nil{}), Laws.FirstPrograms(k, Q.Use{g, s} <> rest, po.sord(k, q))) : List<&2, List<&2, Bool>>}
        %Equal.sym(Bool, Laws.KeyIn(s, po.sord(k, q)), po.some_s(po.exp(k, s, q)), po.m2(q, k, s)) : {po.kcat(po.krev(Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(g, k), Bool.pick(List<&2, List<&2, Bool>>, po.some_s(po.exp(k, s, q)), po.sord(k, q), s <> po.sord(k, q)), po.sord(k, q)), Nil{}), Laws.FirstPrograms(k, rest, Bool.pick(List<&2, List<&2, Bool>>, Laws.KeySame(g, k), Bool.pick(List<&2, List<&2, Bool>>, po.some_s(po.exp(k, s, q)), po.sord(k, q), s <> po.sord(k, q)), po.sord(k, q)))) == po.kcat(po.krev(po.sord(k, q), Nil{}), Bool.pick(List<&2, List<&2, Bool>>, Bool.and(Laws.KeySame(g, k), Bool.not(_)), s <> Laws.FirstPrograms(k, rest, s <> po.sord(k, q)), Laws.FirstPrograms(k, rest, po.sord(k, q)))) : List<&2, List<&2, Bool>>}
        po.bp_pick(k, s, rest, q, Laws.KeySame(g, k), po.some_s(po.exp(k, s, q))))

def po.merge(m: Maybe<&2, Q.Stat>, e: Maybe<&2, Q.Stat>) -> Maybe<&2, Q.Stat>:
  match m:
    case None{}:
      e
    case Some{Q.Stat{f, l, c}}:
      match e:
        case None{}:
          Some{Q.Stat{f, l, c}}
        case Some{Q.Stat{f2, l2, c2}}:
          Some{Q.Stat{f, l2, Nat.add(c, c2)}}

def po.merge_none(m: Maybe<&2, Q.Stat>) -> {po.merge(m, None{}) == m : Maybe<&2, Q.Stat>}:
  match m:
    case None{}:
      {==}
    case Some{Q.Stat{f, l, c}}:
      {==}

def po.add_one(c: Nat) -> {Nat.add(c, 1n) == 1n+c : Nat}:
  match c:
    case 0n:
      {==}
    case 1n+p:
      Equal.cong(Nat, Nat, x => 1n+x, Nat.add(p, 1n), 1n+p, po.add_one(p))

def po.add_succ(c: Nat, -d: Nat) -> {Nat.add(c, 1n+d) == 1n+Nat.add(c, d) : Nat}:
  match c:
    case 0n:
      {==}
    case 1n+p:
      Equal.cong(Nat, Nat, x => 1n+x, Nat.add(p, 1n+d), 1n+Nat.add(p, d), po.add_succ(p, d))

def po.merge_bump(x: Maybe<&2, Q.Stat>, +i: Nat, e: Maybe<&2, Q.Stat>) -> {po.merge(Some{Q.bump(x, i)}, e) == po.merge(x, Some{Laws.Earliest(i, e)}) : Maybe<&2, Q.Stat>}:
  match x:
    case None{}:
      match e:
        case None{}:
          {==}
        case Some{Q.Stat{f2, l2, c2}}:
          {==}
    case Some{Q.Stat{+f, l, +c}}:
      match e:
        case None{}:
          Equal.cong(Nat, Maybe<&2, Q.Stat>, t => Some{Q.Stat{f, i, t}}, 1n+c, Nat.add(c, 1n), Equal.sym(Nat, Nat.add(c, 1n), 1n+c, po.add_one(c)))
        case Some{Q.Stat{f2, +l2, c2}}:
          Equal.cong(Nat, Maybe<&2, Q.Stat>, t => Some{Q.Stat{f, l2, t}}, 1n+Nat.add(c, c2), Nat.add(c, 1n+c2), Equal.sym(Nat, Nat.add(c, 1n+c2), 1n+Nat.add(c, c2), po.add_succ(c, c2)))

def po.bs_pick(h: Bool, +x: Maybe<&2, Q.Stat>, +i: Nat, +e: Maybe<&2, Q.Stat>)
  -> {po.merge(Bool.pick(Maybe<&2, Q.Stat>, h, Some{Q.bump(x, i)}, x), e) == po.merge(x, Bool.pick(Maybe<&2, Q.Stat>, h, Some{Laws.Earliest(i, e)}, e)) : Maybe<&2, Q.Stat>}:
  match h:
    case True{}:
      po.merge_bump(x, i, e)
    case False{}:
      {==}

def po.bridge_s(ds: +List<Q.Use>, +q: +List<Q.Use>, +k: +List<Bool>, +s: +List<Bool>)
  -> {po.exp(k, s, po.revonto(ds, q)) == po.merge(po.exp(k, s, q), Laws.ExpectedStat(k, s, ds, po.len(q))) : Maybe<&2, Q.Stat>}:
  match ds:
    case Nil{}:
      Equal.sym(Maybe<&2, Q.Stat>, po.merge(po.exp(k, s, q), None{}), po.exp(k, s, q), po.merge_none(po.exp(k, s, q)))
    case Q.Use{+g2, +s2} <> +rest:
      Equal.trans(Maybe<&2, Q.Stat>, po.exp(k, s, po.revonto(rest, Q.Use{g2, s2} <> q)), po.merge(po.exp(k, s, Q.Use{g2, s2} <> q), Laws.ExpectedStat(k, s, rest, 1n+po.len(q))), po.merge(po.exp(k, s, q), Laws.ExpectedStat(k, s, Q.Use{g2, s2} <> rest, po.len(q))),
        po.bridge_s(rest, Q.Use{g2, s2} <> q, k, s),
        po.bs_pick(Bool.and(Laws.KeySame(g2, k), Laws.KeySame(s2, s)), po.exp(k, s, q), po.len(q), Laws.ExpectedStat(k, s, rest, 1n+po.len(q))))

def po.or_else(a: Maybe<&2, List<&2, Bool>>, b: Maybe<&2, List<&2, Bool>>) -> Maybe<&2, List<&2, Bool>>:
  match a:
    case Some{x}:
      Some{x}
    case None{}:
      b

def po.or_else_none(a: Maybe<&2, List<&2, Bool>>) -> {po.or_else(a, None{}) == a : Maybe<&2, List<&2, Bool>>}:
  match a:
    case Some{x}:
      {==}
    case None{}:
      {==}

def po.oe_later(l: Maybe<&2, List<&2, Bool>>, c: Bool, +s2: +List<Bool>, +z: Maybe<&2, List<&2, Bool>>)
  -> {po.or_else(l, Bool.pick(Maybe<&2, List<&2, Bool>>, c, Some{s2}, z)) == po.or_else(Laws.Later(l, c, s2), z) : Maybe<&2, List<&2, Bool>>}:
  match l:
    case Some{x}:
      {==}
    case None{}:
      match c:
        case True{}:
          {==}
        case False{}:
          {==}

def po.bridge_c(ds: +List<Q.Use>, +q: +List<Q.Use>, +k: +List<Bool>) -> {po.lat(k, po.revonto(ds, q)) == po.or_else(Laws.LatestProgram(k, ds), po.lat(k, q)) : Maybe<&2, List<&2, Bool>>}:
  match ds:
    case Nil{}:
      {==}
    case Q.Use{+g2, +s2} <> +rest:
      Equal.trans(Maybe<&2, List<&2, Bool>>, po.lat(k, po.revonto(rest, Q.Use{g2, s2} <> q)), po.or_else(Laws.LatestProgram(k, rest), po.lat(k, Q.Use{g2, s2} <> q)), po.or_else(Laws.LatestProgram(k, Q.Use{g2, s2} <> rest), po.lat(k, q)),
        po.bridge_c(rest, Q.Use{g2, s2} <> q, k),
        po.oe_later(Laws.LatestProgram(k, rest), Laws.KeySame(g2, k), s2, po.lat(k, q)))


def po.finish_eq(st: Q.State) -> {Q.finish(st) == Q.histories.go(po.order(st), po.groups(st), Nil{}) : List<&2, Q.History>}:
  match st:
    case Q.State{o, gs}:
      {==}

def po.hist_eq(+ds: +List<Q.Use>) -> {Q.histories(ds) == Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{}) : List<&2, Q.History>}:
  Equal.trans(List<&2, Q.History>, Q.finish(Q.go(ds, 0n, Q.State{Nil{}, Q.Tip{}})), Q.finish(po.build(po.revonto(ds, Nil{}))), Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{}),
    Equal.cong(Q.State, List<&2, Q.History>, t => Q.finish(t), Q.go(ds, 0n, Q.State{Nil{}, Q.Tip{}}), po.build(po.revonto(ds, Nil{})), po.go_build(ds, Nil{})),
    po.finish_eq(po.build(po.revonto(ds, Nil{}))))

def po.law_usecases(+ds: +List<Q.Use>) -> {Laws.UseCases(Q.histories(ds)) == Laws.FirstUseCases(ds, Nil{}) : List<&2, List<&2, Bool>>}:
  %Equal.sym(List<&2, Q.History>, Q.histories(ds), Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{}), po.hist_eq(ds)) : {Laws.UseCases(_) == Laws.FirstUseCases(ds, Nil{}) : List<&2, List<&2, Bool>>}
  Equal.trans(List<&2, List<&2, Bool>>, Laws.UseCases(Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{})), po.krev(po.gord(po.revonto(ds, Nil{})), Nil{}), Laws.FirstUseCases(ds, Nil{}), po.out_usecases(po.revonto(ds, Nil{})), po.bridge_u(ds, Nil{}))

def po.law_programs(+g: +List<Bool>, +ds: +List<Q.Use>) -> {Laws.ProgramsOf(g, Q.histories(ds)) == Laws.FirstPrograms(g, ds, Nil{}) : List<&2, List<&2, Bool>>}:
  %Equal.sym(List<&2, Q.History>, Q.histories(ds), Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{}), po.hist_eq(ds)) : {Laws.ProgramsOf(g, _) == Laws.FirstPrograms(g, ds, Nil{}) : List<&2, List<&2, Bool>>}
  Equal.trans(List<&2, List<&2, Bool>>, Laws.ProgramsOf(g, Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{})), po.krev(po.sord(g, po.revonto(ds, Nil{})), Nil{}), Laws.FirstPrograms(g, ds, Nil{}), po.out_programs(po.revonto(ds, Nil{}), g), po.bridge_p(ds, Nil{}, g))

def po.law_stats(+g: +List<Bool>, +s: +List<Bool>, +ds: +List<Q.Use>) -> {Laws.StatOf(g, s, Q.histories(ds)) == Laws.ExpectedStat(g, s, ds, 0n) : Maybe<&2, Q.Stat>}:
  %Equal.sym(List<&2, Q.History>, Q.histories(ds), Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{}), po.hist_eq(ds)) : {Laws.StatOf(g, s, _) == Laws.ExpectedStat(g, s, ds, 0n) : Maybe<&2, Q.Stat>}
  Equal.trans(Maybe<&2, Q.Stat>, Laws.StatOf(g, s, Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{})), po.exp(g, s, po.revonto(ds, Nil{})), Laws.ExpectedStat(g, s, ds, 0n), po.out_stat(po.revonto(ds, Nil{}), g, s), po.bridge_s(ds, Nil{}, g, s))

def po.law_current(+g: +List<Bool>, +ds: +List<Q.Use>) -> {Laws.CurrentOf(g, Q.histories(ds)) == Laws.LatestProgram(g, ds) : Maybe<&2, List<&2, Bool>>}:
  %Equal.sym(List<&2, Q.History>, Q.histories(ds), Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{}), po.hist_eq(ds)) : {Laws.CurrentOf(g, _) == Laws.LatestProgram(g, ds) : Maybe<&2, List<&2, Bool>>}
  Equal.trans(Maybe<&2, List<&2, Bool>>, Laws.CurrentOf(g, Q.histories.go(po.order(po.build(po.revonto(ds, Nil{}))), po.groups(po.build(po.revonto(ds, Nil{}))), Nil{})), po.lat(g, po.revonto(ds, Nil{})), Laws.LatestProgram(g, ds), po.out_current(po.revonto(ds, Nil{}), g),
    Equal.trans(Maybe<&2, List<&2, Bool>>, po.lat(g, po.revonto(ds, Nil{})), po.or_else(Laws.LatestProgram(g, ds), None{}), Laws.LatestProgram(g, ds), po.bridge_c(ds, Nil{}, g), po.or_else_none(Laws.LatestProgram(g, ds))))

def Laws.policies_list_each_use_case_once_in_order_of_first_use(ds):
  po.law_usecases(ds)

def Laws.policies_list_each_program_of_a_use_case_once_in_order_of_first_use(g, ds):
  po.law_programs(g, ds)

def Laws.policies_count_each_version_from_its_first_to_its_last_decision(g, s, ds):
  po.law_stats(g, s, ds)

def Laws.policies_mark_the_program_of_the_latest_decision_current(g, ds):
  po.law_current(g, ds)

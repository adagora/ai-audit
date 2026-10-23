import Base
import ./context.bend as C
import ./LAWS.bend as Laws
import ./arena.bend as A
import ./usage.bend as U

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

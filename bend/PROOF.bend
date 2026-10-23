import Base
import ./context.bend as C
import ./LAWS.bend as Laws

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

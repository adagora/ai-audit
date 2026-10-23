import Base

type Span is Data:
  Span{start: Nat, end: Nat, ms: Nat, me: Nat}

type Mark is Data:
  Mark{s: Span, t: Bool}

type Walk is Data:
  Walk{c: List<&2, Nat>, bs: List<&2, Nat>, acc: List<&2, Mark>}

type Near is Data:
  Near{at: Maybe<&2, Span>, grew: Bool, acc: List<&2, Mark>}

type Pass is Data:
  Pass{ms: List<&2, Mark>, grew: Bool}

def head_le(bs: List<&2, Nat>, +x: Nat) -> Bool:
  match bs:
    case Nil{}:
      False{}
    case Con{b, rest}:
      Nat.is_le(b, x)

def adv.go(bs: List<&2, Nat>, e: Bool, +x: Nat, c: List<&2, Nat>) -> List<&2, Nat> & List<&2, Nat>:
  match bs e:
    case Nil{} _:
      (c, Nil{})
    case Con{+b, +rest} True{}:
      adv.go(rest, head_le(rest, x), x, b <> c)
    case Con{+b, rest} False{}:
      (c, Con{b, rest})

def adv(+bs: List<&2, Nat>, +x: Nat, c: List<&2, Nat>) -> List<&2, Nat> & List<&2, Nat>:
  adv.go(bs, head_le(bs, x), x, c)

def above(c: List<&2, Nat>, +x: Nat) -> Bool:
  match c:
    case Nil{}:
      False{}
    case Con{b, rest}:
      Nat.is_gt(b, x)

def below(bs: List<&2, Nat>, +x: Nat) -> Bool:
  match bs:
    case Nil{}:
      False{}
    case Con{b, rest}:
      Nat.is_lt(b, x)

def walk.at(s: Span, cb: List<&2, Nat> & List<&2, Nat>, acc: List<&2, Mark>) -> Walk:
  match s:
    case Span{a, b, +c, +d}:
      (+k, +bs) = cb
      Walk{k, bs, Mark{Span{a, b, c, d}, Bool.or(above(k, c), below(bs, d))} <> acc}

def walk.step(s: Span, w: Walk) -> Walk:
  match s w:
    case Span{+a, b, c, d} Walk{k, bs, acc}:
      walk.at(Span{a, b, c, d}, adv(bs, a, k), acc)

def walk.acc(w: Walk) -> List<&2, Mark>:
  match w:
    case Walk{k, bs, acc}:
      acc

def walk.go(ss: List<&2, Span>, w: Walk) -> List<&2, Mark>:
  match ss:
    case Nil{}:
      walk.acc(w)
    case Con{s, rest}:
      walk.go(rest, walk.step(s, w))

def after(at: Maybe<&2, Span>, +s: Span) -> Bool:
  match at s:
    case None{} _:
      False{}
    case Some{Span{a, b, c, d}} Span{a2, b2, c2, d2}:
      Nat.is_lt(a, d2)

def before(at: Maybe<&2, Span>, +s: Span) -> Bool:
  match at s:
    case None{} _:
      False{}
    case Some{Span{a, b, c, d}} Span{a2, b2, c2, d2}:
      Nat.is_gt(b, c2)

def near.at(+s: Span, at: Maybe<&2, Span>, grew: Bool, acc: List<&2, Mark>, e: Bool) -> Near:
  match e:
    case True{}:
      Near{Some{s}, True{}, Mark{s, True{}} <> acc}
    case False{}:
      Near{at, grew, Mark{s, False{}} <> acc}

def back.step(m: Mark, n: Near) -> Near:
  match m n:
    case Mark{+s, True{}} Near{at, grew, acc}:
      Near{Some{s}, grew, Mark{s, True{}} <> acc}
    case Mark{+s, False{}} Near{+at, grew, acc}:
      near.at(s, at, grew, acc, after(at, s))

def fwd.step(m: Mark, n: Near) -> Near:
  match m n:
    case Mark{+s, True{}} Near{at, grew, acc}:
      Near{Some{s}, grew, Mark{s, True{}} <> acc}
    case Mark{+s, False{}} Near{+at, grew, acc}:
      near.at(s, at, grew, acc, before(at, s))

def back.go(ms: List<&2, Mark>, n: Near) -> Near:
  match ms:
    case Nil{}:
      n
    case Con{m, rest}:
      back.go(rest, back.step(m, n))

def fwd.go(ms: List<&2, Mark>, n: Near) -> Near:
  match ms:
    case Nil{}:
      n
    case Con{m, rest}:
      fwd.go(rest, fwd.step(m, n))

def round.end(g: Bool, f: Near) -> Pass:
  match f:
    case Near{at, g2, ms}:
      Pass{ms, Bool.or(g, g2)}

def round.fwd(b: Near) -> Pass:
  match b:
    case Near{at, g, ms}:
      round.end(g, fwd.go(ms, Near{None{}, False{}, Nil{}}))

def round(r: List<&2, Mark>) -> Pass:
  round.fwd(back.go(r, Near{None{}, False{}, Nil{}}))

def loop(u: Nat, pr: Pass) -> List<&2, Mark>:
  match u pr:
    case 0n Pass{r, g}:
      r
    case 1n+v Pass{r, True{}}:
      loop(v, round(r))
    case 1n+v Pass{r, False{}}:
      r

def rev.go(ms: List<&2, Mark>, acc: List<&2, Mark>) -> List<&2, Mark>:
  match ms:
    case Nil{}:
      acc
    case Con{m, rest}:
      rev.go(rest, m <> acc)

def untaken.go(ms: List<&2, Mark>, n: Nat) -> Nat:
  match ms:
    case Nil{}:
      n
    case Con{Mark{s, True{}}, rest}:
      untaken.go(rest, n)
    case Con{Mark{s, False{}}, rest}:
      untaken.go(rest, 1n+n)

def close(+r: List<&2, Mark>) -> List<&2, Mark>:
  rev.go(loop(untaken.go(r, 0n), Pass{r, True{}}), Nil{})

def taken(bs: List<&2, Nat>, ss: List<&2, Span>) -> List<&2, Mark>:
  close(walk.go(ss, Walk{Nil{}, bs, Nil{}}))

def any_taken(ms: List<&2, Mark>) -> Bool:
  match ms:
    case Nil{}:
      False{}
    case Con{Mark{s, True{}}, rest}:
      True{}
    case Con{Mark{s, False{}}, rest}:
      any_taken(rest)

def hit.back(ms: List<&2, Mark>, at: Maybe<&2, Span>) -> Bool:
  match ms:
    case Nil{}:
      False{}
    case Con{Mark{+s, True{}}, rest}:
      False{}
    case Con{Mark{+s, False{}}, rest}:
      after(at, s)

def hit.fwd(ms: List<&2, Mark>, at: Maybe<&2, Span>) -> Bool:
  match ms:
    case Nil{}:
      False{}
    case Con{Mark{+s, True{}}, rest}:
      False{}
    case Con{Mark{+s, False{}}, rest}:
      before(at, s)

def back.fast(ms: List<&2, Mark>, e: Bool, +at: Maybe<&2, Span>, grew: Bool, acc: List<&2, Mark>) -> Near:
  match ms e:
    case Nil{} _:
      Near{at, grew, acc}
    case Con{Mark{+s, t}, +rest} True{}:
      back.fast(rest, hit.back(rest, Some{s}), Some{s}, True{}, Mark{s, True{}} <> acc)
    case Con{Mark{+s, True{}}, +rest} False{}:
      back.fast(rest, hit.back(rest, Some{s}), Some{s}, grew, Mark{s, True{}} <> acc)
    case Con{Mark{+s, False{}}, +rest} False{}:
      back.fast(rest, hit.back(rest, at), at, grew, Mark{s, False{}} <> acc)

def fwd.fast(ms: List<&2, Mark>, e: Bool, +at: Maybe<&2, Span>, grew: Bool, acc: List<&2, Mark>) -> Near:
  match ms e:
    case Nil{} _:
      Near{at, grew, acc}
    case Con{Mark{+s, t}, +rest} True{}:
      fwd.fast(rest, hit.fwd(rest, Some{s}), Some{s}, True{}, Mark{s, True{}} <> acc)
    case Con{Mark{+s, True{}}, +rest} False{}:
      fwd.fast(rest, hit.fwd(rest, Some{s}), Some{s}, grew, Mark{s, True{}} <> acc)
    case Con{Mark{+s, False{}}, +rest} False{}:
      fwd.fast(rest, hit.fwd(rest, at), at, grew, Mark{s, False{}} <> acc)

def round.fast.fwd(b: Near) -> Pass:
  match b:
    case Near{at, g, +ms}:
      round.end(g, fwd.fast(ms, hit.fwd(ms, None{}), None{}, False{}, Nil{}))

def round.fast(+r: List<&2, Mark>) -> Pass:
  round.fast.fwd(back.fast(r, hit.back(r, None{}), None{}, False{}, Nil{}))

def loop.fast(u: Nat, pr: Pass) -> List<&2, Mark>:
  match u pr:
    case 0n Pass{r, g}:
      r
    case 1n+v Pass{r, True{}}:
      loop.fast(v, round.fast(r))
    case 1n+v Pass{r, False{}}:
      r

def close.fast(+r: List<&2, Mark>, e: Bool) -> List<&2, Mark>:
  match e:
    case True{}:
      rev.go(loop.fast(untaken.go(r, 0n), Pass{r, True{}}), Nil{})
    case False{}:
      rev.go(r, Nil{})

def taken.fast(bs: List<&2, Nat>, ss: List<&2, Span>) -> List<&2, Mark>:
  +r = walk.go(ss, Walk{Nil{}, bs, Nil{}})
  close.fast(r, any_taken(r))

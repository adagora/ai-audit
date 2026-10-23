import Base

type Cut is Data:
  Cut{start: Nat, end: Nat}

type Piece is Data:
  Keep{from: Nat, to: Nat}
  Hide{i: Nat}

type Part is Data:
  Part{ss: List<&2, Cut>, i: Nat, pieces: List<&2, Piece>}

def rev.pieces(xs: List<&2, Piece>, acc: List<&2, Piece>) -> List<&2, Piece>:
  match xs:
    case Nil{}:
      acc
    case Con{x, rest}:
      rev.pieces(rest, x <> acc)

def rev.parts(xs: List<&2, List<&2, Piece>>, acc: List<&2, List<&2, Piece>>) -> List<&2, List<&2, Piece>>:
  match xs:
    case Nil{}:
      acc
    case Con{x, rest}:
      rev.parts(rest, x <> acc)

def starts_from(ss: List<&2, Cut>, +x: Nat) -> Bool:
  match ss:
    case Nil{}:
      False{}
    case Con{Cut{a, b}, rest}:
      Nat.is_ge(a, x)

def ends_by(ss: List<&2, Cut>, +x: Nat) -> Bool:
  match ss:
    case Nil{}:
      False{}
    case Con{Cut{a, b}, rest}:
      Nat.is_le(b, x)

def part.go(ss: List<&2, Cut>, late: Bool, fresh: Bool, short: Bool, +i: Nat, +pos: Nat, +hi: Nat, acc: List<&2, Piece>) -> Part:
  match ss late fresh short:
    case Nil{} _ _ _:
      Part{Nil{}, i, rev.pieces(Keep{pos, hi} <> acc, Nil{})}
    case Con{Cut{+a, +b}, +rest} True{} _ _:
      Part{Cut{a, b} <> rest, i, rev.pieces(Keep{pos, hi} <> acc, Nil{})}
    case Con{Cut{+a, +b}, +rest} False{} True{} True{}:
      part.go(rest, starts_from(rest, hi), starts_from(rest, b), ends_by(rest, hi), 1n+i, b, hi, Hide{i} <> (Keep{pos, a} <> acc))
    case Con{Cut{+a, +b}, +rest} False{} True{} False{}:
      Part{Cut{a, b} <> rest, i, rev.pieces(Hide{i} <> (Keep{pos, a} <> acc), Nil{})}
    case Con{Cut{+a, +b}, +rest} False{} False{} True{}:
      part.go(rest, starts_from(rest, hi), starts_from(rest, b), ends_by(rest, hi), 1n+i, b, hi, acc)
    case Con{Cut{+a, +b}, +rest} False{} False{} False{}:
      Part{Cut{a, b} <> rest, i, rev.pieces(acc, Nil{})}

def part(+ss: List<&2, Cut>, +i: Nat, +lo: Nat, +hi: Nat) -> Part:
  part.go(ss, starts_from(ss, hi), starts_from(ss, lo), ends_by(ss, hi), i, lo, hi, Nil{})

def parts.go(bs: List<&2, Nat>, st: Part, +lo: Nat, done: List<&2, List<&2, Piece>>) -> List<&2, List<&2, Piece>>:
  match bs:
    case Nil{}:
      match st:
        case Part{ss, i, ps}:
          rev.parts(ps <> done, Nil{})
    case Con{+hi, rest}:
      match st:
        case Part{ss, i, ps}:
          parts.go(rest, part(ss, i, lo, hi), hi, ps <> done)

def cut(bs: List<&2, Nat>, ss: List<&2, Cut>) -> List<&2, List<&2, Piece>>:
  match bs:
    case Nil{}:
      Nil{}
    case Con{+hi, rest}:
      parts.go(rest, part(ss, 0n, 0n, hi), hi, Nil{})

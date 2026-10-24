import Base

type Use is Data:
  Use{group: List<&2, Bool>, source: List<&2, Bool>}

type Stat is Data:
  Stat{first: Nat, last: Nat, count: Nat}

type Trie<-A: Data> is Data:
  Tip{}
  Bin{here: Maybe<&2, A>, zero: Trie<A>, one: Trie<A>}

type Group is Data:
  Group{current: List<&2, Bool>, order: List<&2, List<&2, Bool>>, sources: Trie<Stat>}

type State is Data:
  State{order: List<&2, List<&2, Bool>>, groups: Trie<Group>}

type Version is Data:
  Version{source: List<&2, Bool>, stat: Stat}

type History is Data:
  History{group: List<&2, Bool>, versions: List<&2, Version>, current: List<&2, Bool>}

def get(-A: Data, k: +List<Bool>, t: Trie<A>) -> Maybe<&2, A>:
  match k:
    case Nil{}:
      match t:
        case Tip{}:
          None{}
        case Bin{h, z, o}:
          h
    case b <> rest:
      match b:
        case True{}:
          match t:
            case Tip{}:
              None{}
            case Bin{h, z, o}:
              get(A, rest, o)
        case False{}:
          match t:
            case Tip{}:
              None{}
            case Bin{h, z, o}:
              get(A, rest, z)

def set(-A: Data, k: +List<Bool>, t: Trie<A>, v: A) -> Trie<A>:
  match k:
    case Nil{}:
      match t:
        case Tip{}:
          Bin{Some{v}, Tip{}, Tip{}}
        case Bin{h, z, o}:
          Bin{Some{v}, z, o}
    case b <> rest:
      match b:
        case True{}:
          match t:
            case Tip{}:
              Bin{None{}, Tip{}, set(A, rest, Tip{}, v)}
            case Bin{h, z, o}:
              Bin{h, z, set(A, rest, o, v)}
        case False{}:
          match t:
            case Tip{}:
              Bin{None{}, set(A, rest, Tip{}, v), Tip{}}
            case Bin{h, z, o}:
              Bin{h, set(A, rest, z, v), o}

def bump(m: Maybe<&2, Stat>, +i: Nat) -> Stat:
  match m:
    case None{}:
      Stat{i, i, 1n}
    case Some{Stat{f, l, c}}:
      Stat{f, i, 1n+c}

def note(m: Maybe<&2, Stat>, +s: +List<Bool>, order: +List<List<&2, Bool>>) -> +List<List<&2, Bool>>:
  match m:
    case None{}:
      s <> order
    case Some{st}:
      order

def visit.found(+m: Maybe<&2, Stat>, +s: +List<Bool>, +i: Nat, order: +List<List<&2, Bool>>, src: Trie<Stat>) -> Group:
  Group{s, note(m, s, order), set(Stat, s, src, bump(m, i))}

def visit(grp: Group, +s: +List<Bool>, +i: Nat) -> Group:
  match grp:
    case Group{cur, order, +src}:
      visit.found(get(Stat, s, src), s, i, order, src)

def step.found(m: Maybe<&2, Group>, +g: +List<Bool>, +s: +List<Bool>, +i: Nat, order: +List<List<&2, Bool>>, groups: Trie<Group>) -> State:
  match m:
    case None{}:
      State{g <> order, set(Group, g, groups, visit(Group{Nil{}, Nil{}, Tip{}}, s, i))}
    case Some{grp}:
      State{order, set(Group, g, groups, visit(grp, s, i))}

def step(st: State, +g: +List<Bool>, +s: +List<Bool>, +i: Nat) -> State:
  match st:
    case State{order, +groups}:
      step.found(get(Group, g, groups), g, s, i, order, groups)

def go(ds: +List<Use>, +i: Nat, st: State) -> State:
  match ds:
    case Nil{}:
      st
    case Use{+g, +s} <> rest:
      go(rest, 1n+i, step(st, g, s, i))

def version(+k: +List<Bool>, m: Maybe<&2, Stat>) -> Version:
  match m:
    case None{}:
      Version{k, Stat{0n, 0n, 0n}}
    case Some{st}:
      Version{k, st}

def versions(ks: +List<List<&2, Bool>>, +src: Trie<Stat>, acc: +List<Version>) -> +List<Version>:
  match ks:
    case Nil{}:
      acc
    case +k <> rest:
      versions(rest, src, version(k, get(Stat, k, src)) <> acc)

def history(+k: +List<Bool>, m: Maybe<&2, Group>) -> History:
  match m:
    case None{}:
      History{k, Nil{}, k}
    case Some{Group{cur, order, src}}:
      History{k, versions(order, src, Nil{}), cur}

def histories.go(ks: +List<List<&2, Bool>>, +gs: Trie<Group>, acc: +List<History>) -> +List<History>:
  match ks:
    case Nil{}:
      acc
    case +k <> rest:
      histories.go(rest, gs, history(k, get(Group, k, gs)) <> acc)

def finish(st: State) -> +List<History>:
  match st:
    case State{order, groups}:
      histories.go(order, groups, Nil{})

def histories(ds: +List<Use>) -> +List<History>:
  finish(go(ds, 0n, State{Nil{}, Tip{}}))

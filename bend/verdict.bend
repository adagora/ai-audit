import Base

type Verdict is Data:
  Approved{}
  Rejected{}
  Overridden{}

def latest.go(rs: List<&2, Verdict>, last: Maybe<&2, Verdict>) -> Maybe<&2, Verdict>:
  match rs:
    case Nil{}:
      last
    case Con{v, rest}:
      latest.go(rest, Some{v})

def latest(rs: List<&2, Verdict>) -> Maybe<&2, Verdict>:
  latest.go(rs, None{})

def authorized.after(simulated: Bool, last: Maybe<&2, Verdict>) -> Bool:
  match last:
    case None{}:
      simulated
    case Some{Approved{}}:
      True{}
    case Some{Rejected{}}:
      False{}
    case Some{Overridden{}}:
      False{}

def authorized(done: Bool, simulated: Bool, rs: List<&2, Verdict>) -> Bool:
  match done:
    case False{}:
      True{}
    case True{}:
      authorized.after(simulated, latest(rs))

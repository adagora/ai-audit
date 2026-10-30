import Base

type Verdict is Data:
  Ok{}
  Blocked{}
  Exceeded{}

type Charge is Data:
  Charge{input: Nat, output: Nat, inputKnown: Bool, outputKnown: Bool, overrun: Bool}

def fits(+used: Nat, +request: Nat, +limit: Nat) -> Bool:
  Bool.and(Nat.is_le(used, limit), Nat.is_le(request, Nat.sub(limit, used)))

def admit.fits(ok: Bool) -> Verdict:
  match ok:
    case True{}:
      Ok{}
    case False{}:
      Exceeded{}

def admit(blocked: Bool, +usedInput: Nat, +usedOutput: Nat, +input: Nat, +output: Nat, +limitInput: Nat, +limitOutput: Nat) -> Verdict:
  match blocked:
    case True{}:
      Blocked{}
    case False{}:
      admit.fits(Bool.and(fits(usedInput, input, limitInput), fits(usedOutput, output, limitOutput)))

def or0(m: Maybe<&2, Nat>) -> Nat:
  match m:
    case None{}:
      0n
    case Some{n}:
      n

def complete(anthropic: Bool, input: Maybe<&2, Nat>, +cached: Maybe<&2, Nat>, +write: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match anthropic input:
    case True{} Some{n}:
      Some{Nat.add(Nat.add(n, or0(cached)), or0(write))}
    case _ m:
      m

def charged(m: Maybe<&2, Nat>, +reserved: Nat) -> Nat:
  match m:
    case None{}:
      reserved
    case Some{n}:
      n

def known(m: Maybe<&2, Nat>) -> Bool:
  match m:
    case None{}:
      False{}
    case Some{n}:
      True{}

def charge.of(+i: Maybe<&2, Nat>, +o: Maybe<&2, Nat>, +reservedInput: Nat, +reservedOutput: Nat) -> Charge:
  Charge{charged(i, reservedInput), charged(o, reservedOutput), known(i), known(o),
    Bool.or(Nat.is_gt(charged(i, reservedInput), reservedInput), Nat.is_gt(charged(o, reservedOutput), reservedOutput))}

def charge(anthropic: Bool, +reservedInput: Nat, +reservedOutput: Nat, input: Maybe<&2, Nat>, +cached: Maybe<&2, Nat>, +write: Maybe<&2, Nat>, +output: Maybe<&2, Nat>) -> Charge:
  charge.of(complete(anthropic, input, cached, write), output, reservedInput, reservedOutput)

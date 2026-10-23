import Base

type Mode is Data:
  Redact{}
  NoGo{}
  Advisory{}

type Action is Data:
  Original{}
  Masked{}
  Blocked{}
  Unmaskable{}

def all_maskable(fs: List<&2, Bool>) -> Bool:
  match fs:
    case Nil{}:
      True{}
    case Con{True{}, rest}:
      all_maskable(rest)
    case Con{False{}, rest}:
      False{}

def decide.redact(ok: Bool) -> Action:
  match ok:
    case True{}:
      Masked{}
    case False{}:
      Unmaskable{}

def decide(mode: Mode, fs: List<&2, Bool>) -> Action:
  match mode fs:
    case _ Nil{}:
      Original{}
    case Advisory{} Con{f, rest}:
      Original{}
    case NoGo{} Con{f, rest}:
      Blocked{}
    case Redact{} Con{+f, +rest}:
      decide.redact(all_maskable(f <> rest))

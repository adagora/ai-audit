#!/usr/bin/env bash
set -u; cd "$(dirname "$0")"
BEND_VERSION=2.0.38
BEND="${BEND:-bend}"
export BEND_NO_TELEMETRY=1
found=$("$BEND" version 2>/dev/null)
[ "$found" = "bend $BEND_VERSION" ] || { echo "FAIL need bend $BEND_VERSION, found '${found:-no bend}'"; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
rc=0

verdict() {
  if (cd "$1" && "$BEND" PROOF.bend 2>&1) | grep -qx "ALL PROOFS CHECK"; then echo pass; else echo fail; fi
}

expect() {
  local got; got=$(verdict "$1")
  if [ "$got" = "$2" ]; then echo "ok   $3: $got"; else echo "FAIL $3: expected $2, got $got"; (cd "$1" && "$BEND" PROOF.bend 2>&1 | head -20); rc=1; fi
}

mutant() {
  local dir="$tmp/$1"; mkdir -p "$dir"; cp context.bend LAWS.bend PROOF.bend "$dir/"
  perl -0pi -e "$2" "$dir/context.bend"
  if cmp -s context.bend "$dir/context.bend"; then echo "FAIL mutant $1: the substitution matched nothing"; rc=1; return; fi
  expect "$dir" fail "mutant $1"
}

expect . pass "laws in LAWS.bend"
mutant leftover 's/tokens\(rounds\(Nat\.sub\(p, sum_q\(xs\)\), xs\)\)/tokens(rounds(1n+Nat.sub(p, sum_q(xs)), xs))/'
mutant double-bump 's/case True\{\}:\n          1n\+q/case True{}:\n          2n+q/'
mutant zero-remainder 's/Nat\.mod\(x, t\), False\{\}/1n+Nat.mod(x, t), False{}/'

if command -v lean >/dev/null 2>&1; then
  if "$BEND" PROOF.bend --verdict 2>&1 | grep -qx "ALL PROOFS CHECK"; then echo "ok   --verdict: pass"; else echo "FAIL --verdict"; rc=1; fi
else
  echo "skip --verdict: needs Lean v4.34.0 (elan toolchain leanprover/lean4:v4.34.0)"
fi

"$BEND" context.bend -o "$tmp/context.mjs" || { echo "FAIL build context.mjs"; exit 1; }
if [ "${1:-}" = "--write" ]; then cp "$tmp/context.mjs" ../src/bend/context.mjs; echo "ok   wrote src/bend/context.mjs"
elif cmp -s "$tmp/context.mjs" ../src/bend/context.mjs; then echo "ok   src/bend/context.mjs matches context.bend"
else echo "FAIL src/bend/context.mjs is stale: run bash bend/run.sh --write"; rc=1; fi
exit $rc

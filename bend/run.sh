#!/usr/bin/env bash
set -u; cd "$(dirname "$0")"
BEND_VERSION=2.0.38
BEND="${BEND:-bend}"
export BEND_NO_TELEMETRY=1
found=$("$BEND" version 2>/dev/null)
[ "$found" = "bend $BEND_VERSION" ] || { echo "FAIL need bend $BEND_VERSION, found '${found:-no bend}'"; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
rc=0; ran=""

verdict() {
  if (cd "$1" && "$BEND" "$2" 2>&1) | grep -qx "ALL PROOFS CHECK"; then echo pass; else echo fail; fi
}

expect() {
  local got; got=$(verdict "$1" "$2")
  if [ "$got" = "$3" ]; then echo "ok   $4: $got"; else echo "FAIL $4: expected $3, got $got"; (cd "$1" && "$BEND" "$2" 2>&1 | head -20); rc=1; fi
}

laws_only() {
  perl -0pe 's/^law [^\n]*\n(?:[ \t]+[^\n]*\n)*\n?//mg' LAWS.bend > "$1/Spec.bend"
  if grep -q '^law ' "$1/Spec.bend"; then echo "FAIL Spec.bend still has a law"; rc=1; fi
}

laws_of() {
  grep -o '^def [A-Za-z0-9_.]*' "stops/$1.bend" | cut -c5- | paste -sd, -
}

real="$tmp/real"; mkdir -p "$real"; cp context.bend stops/*.bend "$real/"; laws_only "$real"

mutant() {
  ran="$ran $1 "
  local dir="$tmp/$1"; mkdir -p "$dir"; cp context.bend LAWS.bend PROOF.bend "stops/$1.bend" "$dir/"; laws_only "$dir"
  perl -0pi -e "$2" "$dir/context.bend"
  if cmp -s context.bend "$dir/context.bend"; then echo "FAIL mutant $1: the substitution matched nothing"; rc=1; return; fi
  expect "$dir" PROOF.bend fail "mutant $1, PROOF.bend"
  expect "$dir" "$1.bend" pass "mutant $1 breaks $(laws_of "$1") (stops/$1.bend)"
  expect "$real" "$1.bend" fail "the real code keeps $(laws_of "$1") (stops/$1.bend)"
}

expect . PROOF.bend pass "laws in LAWS.bend"
mutant leftover 's/tokens\(rounds\(Nat\.sub\(p, sum_q\(xs\)\), xs\)\)/tokens(rounds(1n+Nat.sub(p, sum_q(xs)), xs))/'
mutant double-bump 's/case True\{\}:\n          1n\+q/case True{}:\n          2n+q/'
mutant empty-segment 's/case 0n _:\n          pick\.shift\(found\)/case 0n _:\n          pick.vs(1n, found)/'
mutant tie-to-later 's/pick\.choose\(r, i, v, Nat\.is_ge\(r, v\)\)/pick.choose(r, i, v, Nat.is_gt(r, v))/'
mutant smallest-first 's/pick\.choose\(r, i, v, Nat\.is_ge\(r, v\)\)/pick.choose(r, i, v, Nat.is_ge(v, r))/'
for f in stops/*.bend; do case "$ran" in *" $(basename "$f" .bend) "*) ;; *) echo "FAIL $f has no mutant"; rc=1;; esac; done

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

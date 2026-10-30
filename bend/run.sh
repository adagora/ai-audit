#!/usr/bin/env bash
set -u; cd "$(dirname "$0")"
BEND_VERSION=2.0.38
BEND="${BEND:-bend}"
export BEND_NO_TELEMETRY=1
found=$("$BEND" version 2>/dev/null)
[ "$found" = "bend $BEND_VERSION" ] || { echo "FAIL need bend $BEND_VERSION, found '${found:-no bend}'"; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
rc=0; ran=""
MODULES="context arena usage spans parts mask decide policies budget verdict"

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
  grep -o '^def [A-Za-z0-9_.]*' "stops/$1.bend" | cut -c5- | while read -r name; do grep -qx "law $name:" LAWS.bend && echo "$name"; done | paste -sd, -
}

copy_modules() {
  for m in $MODULES; do cp "$m.bend" "$1/"; done
}

real="$tmp/real"; mkdir -p "$real"; copy_modules "$real"; cp stops/*.bend "$real/"; laws_only "$real"

mutant() {
  ran="$ran $1 "
  local dir="$tmp/$1"; mkdir -p "$dir"; copy_modules "$dir"; cp LAWS.bend PROOF.bend "stops/$1.bend" "$dir/"; laws_only "$dir"
  perl -0pi -e "$3" "$dir/$2.bend"
  if cmp -s "$2.bend" "$dir/$2.bend"; then echo "FAIL mutant $1: the substitution matched nothing in $2.bend"; rc=1; return; fi
  if [ -z "$(laws_of "$1")" ]; then echo "FAIL stops/$1.bend names no law in LAWS.bend"; rc=1; return; fi
  expect "$dir" PROOF.bend fail "mutant $1, PROOF.bend"
  expect "$dir" "$1.bend" pass "mutant $1 breaks $(laws_of "$1") (stops/$1.bend)"
  expect "$real" "$1.bend" fail "the real code keeps $(laws_of "$1") (stops/$1.bend)"
}

expect . PROOF.bend pass "laws in LAWS.bend"
mutant leftover context 's/tokens\(rounds\(Nat\.sub\(p, sum_q\(xs\)\), xs\)\)/tokens(rounds(1n+Nat.sub(p, sum_q(xs)), xs))/'
mutant double-bump context 's/case True\{\}:\n          1n\+q/case True{}:\n          2n+q/'
mutant empty-segment context 's/case 0n _:\n          pick\.shift\(found\)/case 0n _:\n          pick.vs(1n, found)/'
mutant tie-to-later context 's/pick\.choose\(r, i, v, Nat\.is_ge\(r, v\)\)/pick.choose(r, i, v, Nat.is_gt(r, v))/'
mutant smallest-first context 's/pick\.choose\(r, i, v, Nat\.is_ge\(r, v\)\)/pick.choose(r, i, v, Nat.is_ge(v, r))/'
mutant first-shifted arena 's/            case False\{\}:\n              Some\{First\{i, off\}\}/            case False{}:\n              Some{First{1n+i, off}}/'
mutant offset-skips arena 's/first\.go\(pt, bt, same\(pt, bt\), 1n\+i, Nat\.add\(off, n\)\)/first.go(pt, bt, same(pt, bt), 1n+i, off)/'
mutant ages-reset arena 's/ages\.go\(pt, bt, same\(pt, bt\), turn, a <> acc\)/ages.go(pt, bt, same(pt, bt), turn, turn <> acc)/'
mutant bytes-lost arena 's/Run\{k, Nat\.add\(m, n\), a\} <> rest/Run{k, m, a} <> rest/'
mutant kind-lost arena 's/\+acc2 = push\(k, n, a, acc\)/+acc2 = push(0n, n, a, acc)/'
mutant age-lost arena 's/\+acc2 = push\(k, n, a, acc\)/+acc2 = push(k, n, 0n, acc)/'
mutant never-merge arena 's/Bool\.and\(Nat\.is_eq\(k, k2\), Nat\.is_eq\(a, a2\)\)/False{}/'
mutant merge-across-change arena 's/                case 0n:\n                  False\{\}/                case 0n:\n                  joins.head(k, a, acc)/'
mutant hash-ordered arena 's/Nat\.is_eq\(h, g\)/Nat.is_ge(g, h)/'
mutant unknown-as-zero usage 's/        case None\{\}:\n          Turn\{None\{\}, None\{\}, None\{\}, o, None\{\}\}/        case None{}:\n          Turn{Some{0n}, Some{0n}, Some{0n}, o, Some{0n}}/'
mutant write-subtracted usage 's/Some\{Nat\.add\(Nat\.add\(n, or0\(c\)\), or0\(w\)\)\}/Some{Nat.sub(Nat.add(n, or0(c)), or0(w))}/'
mutant cached-added usage 's/Some\{Nat\.sub\(n, or0\(c\)\)\}/Some{Nat.add(n, or0(c))}/'
mutant threshold-off usage 's/Nat\.is_ge\(e, 1024n\)/Nat.is_ge(e, 1023n)/'
mutant half-wrong usage 's/Nat\.is_lt\(Nat\.add\(c, c\), e\)/Nat.is_lt(c, e)/'
mutant unknown-not-counted usage 's/Nat\.add\(ui, unknown\(i\)\)/ui/'
mutant fast-output-as-input usage 's/Nat\.add\(uo, unknown\(o\)\), Nat\.add\(uu, unknown2\(i, o\)\)\)\n/Nat.add(uo, unknown(i)), Nat.add(uu, unknown2(i, o)))\n/'
mutant lost-extension spans 's/Group\{a, sb, Nat\.min\(c, sc\), Nat\.max\(d, sd\), f, True\{\}\}/Group{a, b, Nat.min(c, sc), Nat.max(d, sd), f, True{}}/'
mutant over-mask spans 's/Group\{a, b, c, d, i, False\{\}\}/Group{a, 1n+b, c, d, i, False{}}/'
mutant overlap-opens spans 's/Nat\.is_ge\(raw\.start\(s\), group\.end\(g\)\)/Nat.is_ge(raw.end(s), group.end(g))/'
mutant phantom-group spans 's/merge\.go\(xs, Nil\{\}\)/merge.go(xs, Group{0n, 0n, 0n, 0n, 0n, False{}} <> Nil{})/'
mutant opened-as-grown spans 's/Group\{a, b, c, d, i, False\{\}\}/Group{a, b, c, d, i, True{}}/'
mutant crossing-missed parts 's/Bool\.or\(above\(k, c\), below\(bs, d\)\)/above(k, c)/'
mutant touch-ignored parts 's/near\.at\(s, at, grew, acc, after\(at, s\)\)/near.at(s, at, grew, acc, False{})/'
mutant over-take parts 's/Bool\.or\(above\(k, c\), below\(bs, d\)\)/True{}/'
mutant fast-skips-closure parts 's/close\.fast\(r, any_taken\(r\)\)/close.fast(r, False{})/'
mutant fast-backward-blind parts 's/\n      after\(at, s\)\n/\n      False{}\n/'
mutant marks-reversed parts 's/rev\.go\(loop\(untaken\.go\(r, 0n\), Pass\{r, True\{\}\}\), Nil\{\}\)/loop(untaken.go(r, 0n), Pass{r, True{}})/'
mutant keep-into-finding mask 's/Hide\{i\} <> \(Keep\{pos, a\} <> acc\)/Hide{i} <> (Keep{pos, 1n+a} <> acc)/'
mutant marker-dropped mask 's/1n\+i, b, hi, Hide\{i\} <> \(Keep\{pos, a\} <> acc\)\)/1n+i, b, hi, Keep{pos, a} <> acc)/'
mutant remark-continued mask 's/1n\+i, b, hi, acc\)/1n+i, b, hi, Hide{i} <> acc)/'
mutant index-not-advanced mask 's/1n\+i, b, hi, Hide\{i\}/i, b, hi, Hide{i}/'
mutant empty-blocks decide 's/case _ Nil\{\}:\n      Original\{\}/case _ Nil{}:\n      Blocked{}/'
mutant advisory-blocks decide 's/case Advisory\{\} Con\{f, rest\}:\n      Original\{\}/case Advisory{} Con{f, rest}:\n      Blocked{}/'
mutant no-go-forwards decide 's/case NoGo\{\} Con\{f, rest\}:\n      Blocked\{\}/case NoGo{} Con{f, rest}:\n      Masked{}/'
mutant unmaskable-masked decide 's/case Con\{False\{\}, rest\}:\n      False\{\}/case Con{False{}, rest}:\n      all_maskable(rest)/'
mutant count-not-added policies 's/Stat\{f, i, 1n\+c\}/Stat{f, i, c}/'
mutant last-not-moved policies 's/Stat\{f, i, 1n\+c\}/Stat{f, l, 1n+c}/'
mutant first-moved policies 's/Stat\{f, i, 1n\+c\}/Stat{i, i, 1n+c}/'
mutant rollback-new-version policies 's/case Some\{st\}:\n      order/case Some{st}:\n      s <> order/'
mutant group-listed-twice policies 's/case Some\{grp\}:\n      State\{order, /case Some{grp}:\n      State{g <> order, /'
mutant group-dropped policies 's/case None\{\}:\n      State\{g <> order, /case None{}:\n      State{order, /'
mutant current-is-group-key policies 's/History\{k, versions\(order, src, Nil\{\}\), cur\}/History{k, versions(order, src, Nil{}), k}/'
mutant blocked-admits budget 's/case True\{\}:\n      Blocked\{\}/case True{}:\n      Ok{}/'
mutant at-limit-refused budget 's/Nat\.is_le\(request, Nat\.sub\(limit, used\)\)/Nat.is_lt(request, Nat.sub(limit, used))/'
mutant used-over-limit budget 's/Bool\.and\(Nat\.is_le\(used, limit\), Nat\.is_le\(request, Nat\.sub\(limit, used\)\)\)/Nat.is_le(request, Nat.sub(limit, used))/'
mutant output-not-checked budget 's/admit\.fits\(Bool\.and\(fits\(usedInput, input, limitInput\), fits\(usedOutput, output, limitOutput\)\)\)/admit.fits(fits(usedInput, input, limitInput))/'
mutant unknown-charged-zero budget 's/case None\{\}:\n      reserved/case None{}:\n      0n/'
mutant cache-not-charged budget 's/Nat\.add\(Nat\.add\(n, or0\(cached\)\), or0\(write\)\)/Nat.add(n, or0(write))/'
mutant overrun-at-reservation budget 's/Nat\.is_gt\(charged\(i, reservedInput\), reservedInput\)/Nat.is_ge(charged(i, reservedInput), reservedInput)/'
mutant overrun-output-ignored budget 's/Bool\.or\(Nat\.is_gt\(charged\(i, reservedInput\), reservedInput\), Nat\.is_gt\(charged\(o, reservedOutput\), reservedOutput\)\)/Nat.is_gt(charged(i, reservedInput), reservedInput)/'
mutant first-review-wins verdict 's/case Con\{v, rest\}:\n      latest\.go\(rest, Some\{v\}\)/case Con{v, rest}:\n      Some{v}/'
mutant approval-ignored verdict 's/case Some\{Approved\{\}\}:\n      True\{\}/case Some{Approved{}}:\n      simulated/'
mutant rejection-follows-rule verdict 's/case Some\{Rejected\{\}\}:\n      False\{\}/case Some{Rejected{}}:\n      simulated/'
mutant override-authorizes verdict 's/case Some\{Overridden\{\}\}:\n      False\{\}/case Some{Overridden{}}:\n      True{}/'
mutant not-done-needs-rule verdict 's/case False\{\}:\n      True\{\}\n    case True\{\}:\n      authorized\.after/case False{}:\n      simulated\n    case True{}:\n      authorized.after/'
mutant no-review-authorizes verdict 's/case None\{\}:\n      simulated/case None{}:\n      True{}/'
for f in stops/*.bend; do case "$ran" in *" $(basename "$f" .bend) "*) ;; *) echo "FAIL $f has no mutant"; rc=1;; esac; done

if command -v lean >/dev/null 2>&1; then
  if "$BEND" PROOF.bend --verdict 2>&1 | grep -qx "ALL PROOFS CHECK"; then echo "ok   --verdict: pass"; else echo "FAIL --verdict"; rc=1; fi
else
  echo "skip --verdict: needs Lean v4.34.0 (elan toolchain leanprover/lean4:v4.34.0)"
fi

for m in $MODULES; do
  "$BEND" "$m.bend" -o "$tmp/$m.mjs" || { echo "FAIL build $m.mjs"; exit 1; }
  if [ "${1:-}" = "--write" ]; then cp "$tmp/$m.mjs" "../src/bend/$m.mjs"; echo "ok   wrote src/bend/$m.mjs"
  elif cmp -s "$tmp/$m.mjs" "../src/bend/$m.mjs"; then echo "ok   src/bend/$m.mjs matches $m.bend"
  else echo "FAIL src/bend/$m.mjs is stale: run bash bend/run.sh --write"; rc=1; fi
done
exit $rc

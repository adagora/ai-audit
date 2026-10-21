#!/usr/bin/env bash
# Formal check: TLC on both models (expected pass) + mutated configs (expected FAIL, proves the properties can fail).
set -u; cd "$(dirname "$0")"
TLA_VERSION=v1.8.0; JAR="${TLA2TOOLS_JAR:-$HOME/.cache/tla2tools-$TLA_VERSION.jar}"
[ -f "$JAR" ] || { mkdir -p "$(dirname "$JAR")"; curl -fsSL -o "$JAR" "https://github.com/tlaplus/tlaplus/releases/download/$TLA_VERSION/tla2tools.jar"; }
JAVA="${JAVA:-java}"; rc=0
run() { # spec cfg expect(pass|fail)
  out=$("$JAVA" -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -noGenerateSpecTE -workers auto -deadlock -cleanup -metadir "${TMPDIR:-/tmp}/tlc-$$" -config "$2" "$1" 2>&1)
  if echo "$out" | grep -q "No error has been found"; then got=pass; elif echo "$out" | grep -q "is violated"; then got=fail; else got=error; fi
  states=$(echo "$out" | grep -oE "[0-9,]+ distinct states found" | head -1)
  viol=$(echo "$out" | grep -oE "Invariant [A-Za-z]+ is violated" | head -1)
  if [ "$got" = "$3" ]; then echo "ok   $2: $got ($states) $viol"; else echo "FAIL $2: expected $3, got $got ($states) $viol"; echo "$out" | tail -30; rc=1; fi
}
run AuditChain.tla AuditChain.cfg pass
run AuditChain.tla AuditChain_nolock.cfg fail
run RequestLifecycle.tla RequestLifecycle.cfg pass
run RequestLifecycle.tla RequestLifecycle_noguard.cfg fail
run RequestLifecycle.tla RequestLifecycle_noprecheck.cfg fail
run RequestLifecycle.tla RequestLifecycle_residual.cfg fail   # known residual window, see ADR 0016
exit $rc

#!/usr/bin/env bash
set -u; cd "$(dirname "$0")"
SECONDS_EACH="${FUZZ_SECONDS:-300}"; TARGETS="${FUZZ_TARGETS:-scan inspect extract dupkeys quinelings pump bend enforce actiongate logverify}"
[ -d node_modules/@jazzer.js/core ] || npm ci --no-audit --no-fund || exit 1
node seed.mjs || exit 1
plain=$(mktemp -d); trap 'rm -rf "$plain"' EXIT
cp -R ../dist/src/. "$plain/" || exit 1; export FUZZ_PLAIN_DIST="$plain"
mkdir -p logs
fuzz() {
  mkdir -p "corpus/$1" "artifacts/$1"
  local max_len=4096 timeout=5000; [ "$1" = pump ] && max_len=100 && timeout=30000
  npx jazzer "targets/$1.mjs" "corpus/$1" "seeds/$1" -i dist/src/ --sync --timeout "$timeout" -- -max_total_time="$SECONDS_EACH" -max_len="$max_len" \
    -dict=dict.txt -artifact_prefix="artifacts/$1/" -print_final_stats=1 > "logs/$1.log" 2>&1
}
for t in $TARGETS; do [ "$t" = pump ] && continue; fuzz "$t" & done
wait
case " $TARGETS " in *" pump "*) fuzz pump ;; esac
rc=0
for t in $TARGETS; do
  runs=$(grep -oE "stat::number_of_executed_units: [0-9]+" "logs/$t.log" | tail -1 | grep -oE "[0-9]+$")
  crash=$(grep -oE "Test unit written to .*/(crash|timeout|oom|leak)-[0-9a-f]+" "logs/$t.log" | head -1)
  slow=$(grep -oE "Test unit written to .*/slow-unit-[0-9a-f]+" "logs/$t.log" | head -1)
  if [ -n "$crash" ]; then echo "FAIL $t after ${runs:-?} runs: $(grep -m1 "Uncaught" "logs/$t.log" | cut -c1-400)"; echo "     $crash"; rc=1
  else echo "ok   $t: ${runs:-?} runs${slow:+, slowest unit $(grep -oE "slowest_unit_time_sec: *[0-9]+" "logs/$t.log" | grep -oE "[0-9]+$" | tail -1) s}"; fi
done
exit $rc

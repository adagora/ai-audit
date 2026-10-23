#!/usr/bin/env bash
set -u; cd "$(dirname "$0")"
SECONDS_EACH="${FUZZ_SECONDS:-300}"; TARGETS="${FUZZ_TARGETS:-scan inspect extract dupkeys quinelings pump}"
[ -d node_modules/@jazzer.js/core ] || npm ci --no-audit --no-fund || exit 1
node seed.mjs || exit 1
mkdir -p logs
for t in $TARGETS; do
  mkdir -p "corpus/$t" "artifacts/$t"
  max_len=4096; timeout=5000; [ "$t" = pump ] && max_len=100 && timeout=30000
  npx jazzer "targets/$t.mjs" "corpus/$t" "seeds/$t" -i dist/src/ --sync --timeout "$timeout" -- -max_total_time="$SECONDS_EACH" -max_len="$max_len" \
    -dict=dict.txt -artifact_prefix="artifacts/$t/" -print_final_stats=1 > "logs/$t.log" 2>&1 &
done
wait
rc=0
for t in $TARGETS; do
  runs=$(grep -oE "stat::number_of_executed_units: [0-9]+" "logs/$t.log" | tail -1 | grep -oE "[0-9]+$")
  crash=$(grep -oE "Test unit written to .*" "logs/$t.log" | head -1)
  if [ -n "$crash" ]; then echo "FAIL $t after ${runs:-?} runs: $(grep -m1 "Uncaught" "logs/$t.log" | cut -c1-400)"; echo "     $crash"; rc=1
  else echo "ok   $t: ${runs:-?} runs"; fi
done
exit $rc

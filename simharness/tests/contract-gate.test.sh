#!/bin/bash
# 契约强制线判据三分支测试（质量 C）
set -uo pipefail
EVID=$(mktemp -d /tmp/cbt.XXXX)
run_case() { # <breaking-json-or-missing> → 期望键
  rm -f "$EVID/qgate-contract-observation.json" "$EVID/state.env"
  if [ "$1" != "missing" ]; then
    printf '%s' "$1" > "$EVID/qgate-contract-observation.json"
  fi
  # 模拟驱动判据（与 aipay-scenario.sh G4 强制线同构抽离）
  _cb_file="$EVID/qgate-contract-observation.json"
  _gap=0
  if [[ -f "$_cb_file" ]]; then
    _cb_n=$(python3 -c "import json;print(len(json.load(open('$_cb_file')).get('breaking',[])))" 2>/dev/null || echo '?')
    if [ "$_cb_n" = "0" ]; then _gap=0
    elif [ "$_cb_n" = "?" ]; then _gap=1
    else _gap=1; fi
  else _gap=1; fi
  echo "$_gap"
}
[ "$(run_case '{"breaking":[]}')" = "0" ] && echo "PASS breaking=0 不置 gap" || echo "FAIL case1"
[ "$(run_case '{"breaking":[{"method":"closeOrder"}]}')" = "1" ] && echo "PASS breaking>0 置 gap" || echo "FAIL case2"
[ "$(run_case 'not-json')" = "1" ] && echo "PASS 畸形产物 fail-closed" || echo "FAIL case3"
[ "$(run_case 'missing')" = "1" ] && echo "PASS 产物缺席 fail-closed" || echo "FAIL case4"
rm -rf "$EVID"

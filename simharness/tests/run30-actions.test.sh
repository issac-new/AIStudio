#!/bin/bash
# run30-actions.test.sh — run29 复盘行动项 A1/A2/A4/A6 的常驻守门（2026-11-12）
# 覆盖：A2 二段式判定纯函数三态；A6 主步 done 键计数（排除 capture_ok 副键）；
#       A1 director 声明式降级通道与指标留档（静态＋指标写入行为）；
#       A4 UAT 条件验收终态守卫与幂等记单。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fails=1; }

# ── A2：mx_storm_decision 三态（提取函数体，不起监督器）──
FN="$(sed -n '/^mx_storm_decision()/,/^}/p' "$HERE/mux/run-driver-supervisor.sh")"
[[ -n "$FN" ]] || { echo "FAIL 提取 mx_storm_decision 失败"; exit 1; }
eval "$FN"
[[ "$(mx_storm_decision 1 5 0)" = "continue" ]] && ok "A2 未达阈值=continue" || bad "A2 continue 态错"
[[ "$(mx_storm_decision 5 5 0)" = "rearm" ]] && ok "A2 首次达标=自动重挂" || bad "A2 rearm 态错"
[[ "$(mx_storm_decision 5 5 1)" = "exit" ]] && ok "A2 重挂后再达标=停止" || bad "A2 exit 态错"
[[ "$(mx_storm_decision 9 0 0)" = "continue" ]] && ok "A2 上限 0=关闭判定" || bad "A2 关闭态错"

# ── A6：主步 done 键计数（capture_ok 副键不计）──
FN="$(sed -n '/^mx_done_key_count()/,/^}/p' "$HERE/mux/mx-scenario-lib.sh")"
[[ -n "$FN" ]] || { echo "FAIL 提取 mx_done_key_count 失败"; exit 1; }
eval "$FN"
T="$(mktemp)"; trap 'rm -f "$T"' EXIT
cat > "$T" <<'S'
smoke_done=1
appinit_done=1
register_done=1794348525
capture_ok_smoke_done=1
capture_ok_register_done=1
uat_conditional=1794444000
report_done=pending
S
C="$(mx_done_key_count "$T")"
[[ "$C" = "3" ]] && ok "A6 主步计数=3（副键/非 1 值排除）" || bad "A6 计数=$C 期望 3"
[[ "$(mx_done_key_count /nonexistent)" = "0" ]] && ok "A6 文件缺席=0（fail-soft）" || bad "A6 缺席态错"
grep -q "'\^\[a-z0-9_\]_done=" "$HERE/mux/mx-burn-test.sh" 2>/dev/null || \
  grep -qE "grep -E '\^\[a-z0-9_\]\+_done=" "$HERE/mux/mx-burn-test.sh" \
  && ok "A6 烧机收据计数行首锚定" || bad "A6 烧机收据仍裸子串计数"

# ── A1：director 声明式降级＋指标 ──
LIB="$HERE/mux/mx-scenario-lib.sh"
grep -q 'DIRECTOR-DEGRADED reason=' "$LIB" && ok "A1 降级声明指令在派发正文" || bad "A1 缺声明指令"
grep -qE "mx_wait_sender .*'\(@\[a-z-\]\+-agent\|DIRECTOR-DEGRADED\)'" "$LIB" && ok "A1 双信号等待" || bad "A1 等待未含降级信号"
grep -q '_mx_director_metric degraded "\$_d_reason"' "$LIB" && ok "A1 降级写指标（原因区分 declared/timeout）" || bad "A1 降级指标缺失"
grep -q '_mx_director_metric success ok' "$LIB" && ok "A1 成功写指标" || bad "A1 成功指标缺失"
# 指标写入行为：临时 EVID_DIR 调 helper，断言行形态
MFN="$(sed -n '/^_mx_director_metric()/,/^}/p' "$LIB")"
eval "$MFN"
D="$(mktemp -d)"
EVID_DIR="$D" RUN_ID=test-run _mx_director_metric degraded declared 12
python3 -c "import json,sys;d=json.loads(open('$D/director-metrics.jsonl').read().strip().split(chr(10))[0]);assert d['outcome']=='degraded' and d['reason']=='declared' and d['elapsed_s']==12" \
  && ok "A1 指标行形状（outcome/reason/elapsed）" || bad "A1 指标行形状错"
rm -f "$D/director-metrics.jsonl"; rmdir "$D" 2>/dev/null || true
unset EVID_DIR RUN_ID

# ── A4：UAT 条件终态守卫＋幂等记单 ──
SC="$HERE/aipay-scenario.sh"
grep -q '\[\[ -z "$(sget uat_done)" \]\] && \[\[ -z "$(sget uat_conditional)" \]\]' "$SC" \
  && ok "A4 条件验收为终态（不再重入重跑）" || bad "A4 守卫未含 uat_conditional"
for k in uat-conditional uat-push uat-cond-proxy; do
  grep -q "issue_once $k " "$SC" && ok "A4 $k 幂等记单" || bad "A4 $k 仍直写"
done

if (( fails == 0 )); then echo "ALL-PASS"; else echo "HAS-FAIL"; exit 1; fi

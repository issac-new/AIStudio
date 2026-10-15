#!/bin/bash
# posture-ledger.test.sh — 姿态旋钮+代偿台账+单一查询入口守门（2026-10-15 批次一配套）
# 违一即 FAIL：
#   ①台账唯一性：同秒三笔 id 互异（实测病根：id 撞号致 resolve 扩散到全行）
#   ②summary 分型计数正确
#   ③resolve/waive 只命中目标行
#   ④清偿门语义：无台账/全清偿=rc0；有 open=rc1
#   ⑤defect 映射：类型→PR 编号单一事实源
#   ⑥state-query 只读查询面：gates/steps/posture/summary 输出正确且不写文件
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0
ck() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1（断言：$2）"; fails=$((fails+1)); fi; }

LED="$HERE/mux/mx-compensation-ledger.sh"
SQ="$HERE/mux/mx-state-query.sh"
T="$(mktemp -d /tmp/posture-ledger.XXXXXX)" || exit 1
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/runs/runX/evidence" "$T/var"
export SIM_ROOT="$T"

# ── ①② 同秒三笔 ──
SIM_ROOT="$T" RUN_ID=runX bash -c "
  source '$LED'
  compensate nudge 'agents=chen desc=t1'
  compensate auto-approve 'ev=e1'
  compensate card-backfill 'user=fanfan'
" 2>/dev/null
F="$T/runs/runX/evidence/compensation-ledger.tsv"
ck "台账文件建立" "[ -f '$F' ]"
IDS=$(awk -F'\t' 'NR>1{print $1}' "$F")
ck "同秒三笔 id 互异" "[ \"\$(printf '%s\n' '$IDS' | sort -u | wc -l | tr -d ' ')\" = 3 ]"
ck "表头在位" "[ \"\$(head -1 '$F' | cut -f1)\" = id ]"

# ── ② summary（CJK 断言走 case 直判，不经 eval——eval 双重展开会咬碎多字节模式）──
SUMOUT=$(bash "$LED" --run runX summary 2>/dev/null || true)
case "$SUMOUT" in
  *"总计 3 笔"*) echo "PASS summary 总计 3 笔" ;;
  *) echo "FAIL summary 总计 3 笔"; fails=$((fails+1)) ;;
esac
case "$SUMOUT" in
  *"nudge"*"1 笔（open 1）"*) echo "PASS summary 分型 nudge 1" ;;
  *) echo "FAIL summary 分型 nudge 1"; fails=$((fails+1)) ;;
esac

# ── ③ resolve/waive 精确命中 ──
ID1=$(awk -F'\t' 'NR==2{print $1}' "$F")
SIM_ROOT="$T" bash "$LED" --run runX resolve "$ID1" "PR-3 根治" >/dev/null 2>&1
ck "resolve 只命中目标行" "[ \"\$(awk -F'\t' 'NR==2{print \$6}' '$F')\" = resolve ] && [ \"\$(awk -F'\t' 'NR==3{print \$6}' '$F')\" = open ]"
ID2=$(awk -F'\t' 'NR==3{print $1}' "$F")
SIM_ROOT="$T" bash "$LED" --run runX waive "$ID2" "豁免示例" >/dev/null 2>&1
ck "waive 只命中目标行" "[ \"\$(awk -F'\t' 'NR==3{print \$6}' '$F')\" = waive ]"

# ── ④ 清偿门 ──
SIM_ROOT="$T" bash "$LED" --run runX check-clearance >/dev/null 2>&1
ck "清偿门：仍有 1 open → rc1" "[ $? -ne 0 ]" || true
rc=0; SIM_ROOT="$T" bash "$LED" --run runX check-clearance >/dev/null 2>&1 || rc=$?
ck "清偿门 rc 语义（open→1）" "[ \"$rc\" = 1 ]"
ID3=$(awk -F'\t' 'NR==4{print $1}' "$F")
SIM_ROOT="$T" bash "$LED" --run runX resolve "$ID3" "PR-4 根治" >/dev/null 2>&1
rc=0; SIM_ROOT="$T" bash "$LED" --run runX check-clearance >/dev/null 2>&1 || rc=$?
ck "清偿门：全清偿 → rc0" "[ \"$rc\" = 0 ]"
rc=0; SIM_ROOT="$T" bash "$LED" --run runNEVER check-clearance >/dev/null 2>&1 || rc=$?
ck "清偿门：无台账 → rc0" "[ \"$rc\" = 0 ]"

# ── ⑤ defect 映射（case 直判）──
CATOUT=$(bash "$LED" catalog 2>&1 || true)
case "$CATOUT" in
  *"nudge"*PR-3*) echo "PASS catalog nudge→PR-3" ;;
  *) echo "FAIL catalog nudge→PR-3"; fails=$((fails+1)) ;;
esac
case "$CATOUT" in
  *"gw-dispatch-bypass"*PR-1*) echo "PASS catalog gw-dispatch-bypass→PR-1" ;;
  *) echo "FAIL catalog gw-dispatch-bypass→PR-1"; fails=$((fails+1)) ;;
esac

# ── ⑥ state-query ──
printf 'posture=standard\ng2_arch_pass=1792030714\nsecurity_review_done=1\nreport_done=\nanalysis_done=1\nroom_analysis=!r:x\n' > "$T/runs/runX/state.env"
BEFORE=$(md5 -q "$T/runs/runX/state.env")
ck "gates 检出闸键" "bash '$SQ' --sim-root '$T' --run runX gates | grep -q 'g2_arch_pass'"
ck "gates 含 report_done" "bash '$SQ' --sim-root '$T' --run runX gates | grep -q 'report_done'"
ck "steps 检出完成标记" "bash '$SQ' --sim-root '$T' --run runX steps | grep -q 'analysis_done'"
ck "steps 排除闸键污染" "! bash '$SQ' --sim-root '$T' --run runX steps | grep -q 'security_review_done'"
ck "posture 读出" "bash '$SQ' --sim-root '$T' --run runX posture | grep -q 'standard'"
SQOUT=$(bash "$SQ" --sim-root "$T" --run runX summary 2>&1 || true)
case "$SQOUT" in
  *代偿台账*) echo "PASS summary 含台账摘要" ;;
  *) echo "FAIL summary 含台账摘要"; fails=$((fails+1)) ;;
esac
ck "state-query 零写入（只读纪律）" "[ \"\$(md5 -q '$T/runs/runX/state.env')\" = \"\$BEFORE\" ]"

echo "----"
if [ "$fails" -eq 0 ]; then echo "posture-ledger 守门全绿（0 FAIL）"; exit 0
else echo "posture-ledger 守门 ${fails} FAIL"; exit 1; fi

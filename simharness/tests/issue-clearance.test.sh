#!/bin/bash
# issue-clearance.test.sh — 问题单延后清账守门（run23 收官批；方案 §5.9 清偿门线扩展）
# 三场景（违一即 FAIL）：
#   ①延后桶非零：DISP 处置首词=延后 的唯一键 → 非零退出且逐键列出（键=类型·主体）。
#   ②延后桶为零：全部观察/已修处置 → rc=0 ✓ 文案。
#   ③容错：无 issues.log（无台账轮）→ rc=0 不红。
# 同键多次 DISP 只计一次（唯一键口径与报告第 4 章一致）。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

CTRL="$(mktemp -d /tmp/issue-clearance.XXXXXX)" || exit 1
trap 'rm -rf "$CTRL"' EXIT
SR="$CTRL/simroot"

# ── 场景①：延后桶非零 ──
R1="$SR/runs/20261030-v8-runX"; mkdir -p "$R1/evidence"
cat > "$R1/evidence/compensation-ledger.tsv" <<'EOF'
id	ts	type	defect	detail	status	resolution
EOF
cat > "$R1/evidence/issues.log" <<'EOF'
ISSUE|g3-local-gate-missing|DEV-PAYCORE-C|分支缺 testlog
DISP|g3-local-gate-missing|DEV-PAYCORE-C|延后（结构性缺陷类别禁自动观察归桶——须下轮开跑前人工处置并带锚点回写，纪律 28/46）
DISP|g3-local-gate-missing|DEV-PAYCORE-C|延后（结构性缺陷类别禁自动观察归桶——重复处置同键只计一次）
ISSUE|roster-org-matrix-mismatch|director|三方对账不一致
DISP|roster-org-matrix-mismatch|director|观察（收尾链自动归桶）
EOF
OUT1="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261030-v8-runX bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC1=$?
if [ "$RC1" -ne 0 ] && printf '%s' "$OUT1" | grep -q 'g3-local-gate-missing·DEV-PAYCORE-C' \
   && ! printf '%s' "$OUT1" | grep -q 'roster-org-matrix-mismatch'; then
  echo "PASS ① 延后非零→rc≠0 且列键、观察键不入列、同键去重"
else
  echo "FAIL ① 延后清账未按预期（rc=$RC1）："; printf '%s\n' "$OUT1"; fails=$((fails+1))
fi

# ── 场景②：延后桶为零 ──
R2="$SR/runs/20261031-v8-runY"; mkdir -p "$R2/evidence"
: > "$R2/evidence/compensation-ledger.tsv"
cat > "$R2/evidence/issues.log" <<'EOF'
ISSUE|g5-ready-fail|fanfan-agent|G5 FAIL
DISP|g5-ready-fail|fanfan-agent|已修（合并锚 main@abcdef123）
ISSUE|zero-delivery|director|零交付遥测
DISP|zero-delivery|director|观察（治理类卡合法形态）
EOF
OUT2="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261031-v8-runY bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC2=$?
if [ "$RC2" -eq 0 ] && printf '%s' "$OUT2" | grep -q '延后桶=0'; then
  echo "PASS ② 全观察/已修→rc=0"
else
  echo "FAIL ② 零延后应放行（rc=$RC2）："; printf '%s\n' "$OUT2"; fails=$((fails+1))
fi

# ── 场景③：无 issues.log 容错 ──
R3="$SR/runs/20261101-v8-runZ"; mkdir -p "$R3/evidence"
: > "$R3/evidence/compensation-ledger.tsv"
OUT3="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261101-v8-runZ bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC3=$?
if [ "$RC3" -eq 0 ]; then
  echo "PASS ③ 无 issues.log→容错放行"
else
  echo "FAIL ③ 无台账轮不应红（rc=$RC3）："; printf '%s\n' "$OUT3"; fails=$((fails+1))
fi

# ── 场景④：末次 DISP 生效（2026-10-31 清账批）──
# 同键先延后、人工复核回写观察终态 → rc=0（旧口径把历史延后行计入=回写后仍恒红，
# 与报告「按唯一键去重收尾」口径冲突）；反向：观察回写成延后 → rc≠0。
R4="$SR/runs/20261102-v8-runW"; mkdir -p "$R4/evidence"
: > "$R4/evidence/compensation-ledger.tsv"
cat > "$R4/evidence/issues.log" <<'EOF'
ISSUE|conclusion-gap|DEV-CHWX|结论行未发
DISP|conclusion-gap|DEV-CHWX|延后（结构性缺陷类别禁自动观察归桶——须下轮开跑前人工处置并带锚点回写）
DISP|conclusion-gap|DEV-CHWX|观察（人工复核终态 2026-10-31：结论行纪律已入册方案纪律 66 面——用户裁定全部清账）
ISSUE|g3-local-gate-missing|DEV-CHWX|分支缺 testlog
DISP|g3-local-gate-missing|DEV-CHWX|观察（收尾链自动归桶）
DISP|g3-local-gate-missing|DEV-CHWX|延后（人工复核改判：仍须下轮补证）
EOF
OUT4="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261102-v8-runW bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC4=$?
if [ "$RC4" -ne 0 ] && printf '%s' "$OUT4" | grep -q 'g3-local-gate-missing·DEV-CHWX' \
   && ! printf '%s' "$OUT4" | grep -q 'conclusion-gap·DEV-CHWX'; then
  echo "PASS ④ 末次 DISP 生效（回写终态转绿/改判延后仍红）"
else
  echo "FAIL ④ 末次 DISP 口径未按预期（rc=$RC4）："; printf '%s\n' "$OUT4"; fails=$((fails+1))
fi

# ── 场景⑤：跨清场存活（P2 Task 2 clearance 投影）──
# 清场归档删 runs/<RUN>/，但未闭环债务必须跨清场存活：mx-clean 清场前原子写
# var/clearance/<RUN>/{compensation-ledger.tsv,issues.log}+current；台账/清账检查
# 在轮目录已清时回落投影；append-disp/resolve 作用于投影。
R5_RUN="20261105-v8-runP"
mkdir -p "$SR/var/clearance/$R5_RUN"
printf 'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\n' > "$SR/var/clearance/$R5_RUN/compensation-ledger.tsv"
printf 'c1\t2026-11-05 10:00:00\tnudge\tPR-3\t替主管轻推\topen\t\n' >> "$SR/var/clearance/$R5_RUN/compensation-ledger.tsv"
cat > "$SR/var/clearance/$R5_RUN/issues.log" <<'LOG5'
ISSUE|g3-local-gate-missing|DEV-PAY|分支缺 testlog
DISP|g3-local-gate-missing|DEV-PAY|延后（结构性缺陷类别禁自动观察归桶——须下轮开跑前人工处置并带锚点回写）
LOG5
ln -sfn "$SR/runs/$R5_RUN/state.env" "$SR/var/current-state.env"  # 软链悬空（runs/ 已清）——锚定轮名仍可解析
OUT5a="$(AIPAY_SIM_ROOT="$SR" bash "$HERE/mux/mx-compensation-ledger.sh" check-clearance 2>&1)"; RC5a=$?
OUT5b="$(AIPAY_SIM_ROOT="$SR" bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC5b=$?
if [ "$RC5a" -ne 0 ] && printf '%s' "$OUT5a" | grep -q 'c1' \
   && [ "$RC5b" -ne 0 ] && printf '%s' "$OUT5b" | grep -q 'g3-local-gate-missing·DEV-PAY'; then
  echo "PASS ⑤ 轮已清场→回落 clearance 投影：open 代偿与延后单仍拦"
else
  echo "FAIL ⑤ 投影回落未按预期（clearance rc=$RC5a issue rc=${RC5b}）："; printf '%s\n%s\n' "$OUT5a" "$OUT5b"; fails=$((fails+1))
fi
# append-disp 作用于投影：回写终态（带锚）→ 延后桶清零
AIPAY_SIM_ROOT="$SR" bash "$HERE/mux/mx-compensation-ledger.sh" append-disp g3-local-gate-missing DEV-PAY '已修（testlog 补齐锚 main@abc1234）' >/dev/null 2>&1
OUT5c="$(AIPAY_SIM_ROOT="$SR" bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC5c=$?
if [ "$RC5c" -eq 0 ]; then
  echo "PASS ⑤b append-disp 回写投影终态→延后清零放行"
else
  echo "FAIL ⑤b 投影回写未生效（rc=$RC5c）："; printf '%s\n' "$OUT5c"; fails=$((fails+1))
fi
# resolve 作用于投影：open 代偿清偿
AIPAY_SIM_ROOT="$SR" bash "$HERE/mux/mx-compensation-ledger.sh" resolve c1 'PR-3 已合入（main@abc1234）' >/dev/null 2>&1
OUT5d="$(AIPAY_SIM_ROOT="$SR" bash "$HERE/mux/mx-compensation-ledger.sh" check-clearance 2>&1)"; RC5d=$?
if [ "$RC5d" -eq 0 ]; then
  echo "PASS ⑤c resolve 作用于投影→清偿门放行"
else
  echo "FAIL ⑤c 投影 resolve 未生效（rc=$RC5d）："; printf '%s\n' "$OUT5d"; fails=$((fails+1))
fi

# ── 场景⑥：mx-clean --apply 原子写投影（真跑清场，债务跨清场存活）──
SIM2="$CTRL/sim2"; RUN2="20261105-v8-runQ"
mkdir -p "$SIM2/runs/$RUN2/evidence" "$SIM2/var"
cat > "$SIM2/runs/$RUN2/evidence/compensation-ledger.tsv" <<'LOG6'
id	ts	type	defect	detail	status	resolution
c9	2026-11-05 11:00:00	gw-dispatch-bypass	PR-1	绕网关直派一次	open	
LOG6
cat > "$SIM2/runs/$RUN2/evidence/issues.log" <<'LOG7'
ISSUE|conclusion-gap|DEV-QQZ|结论行未发
DISP|conclusion-gap|DEV-QQZ|延后（人工复核：须下轮带锚回写）
LOG7
printf 'report_done=1793900000\n' > "$SIM2/runs/$RUN2/state.env"
ln -sfn "$SIM2/runs/$RUN2/state.env" "$SIM2/var/current-state.env"
SIM_ROOT="$SIM2" bash "$HERE/mux/mx-clean.sh" --apply >/dev/null 2>&1
_proj="$SIM2/var/clearance/$RUN2"
if [ -f "$_proj/compensation-ledger.tsv" ] && [ -f "$_proj/issues.log" ] \
   && grep -q 'gw-dispatch-bypass' "$_proj/compensation-ledger.tsv" \
   && grep -q '延后' "$_proj/issues.log" \
   && [ "$(cat "$SIM2/var/clearance/current" 2>/dev/null)" = "$RUN2" ]; then
  echo "PASS ⑥ mx-clean --apply 清场前原子写投影（ledger+issues+current，内容=清前真身）"
else
  echo "FAIL ⑥ 投影未落或内容缺失："; ls -la "$SIM2/var/clearance/" 2>/dev/null; fails=$((fails+1))
fi
# 归档后 runs/ 已清——延后单跨清场仍拦（prelaunch ⑯b 消费同链路）
OUT6="$(AIPAY_SIM_ROOT="$SIM2" bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC6=$?
if [ "$RC6" -ne 0 ] && printf '%s' "$OUT6" | grep -q 'conclusion-gap·DEV-QQZ'; then
  echo "PASS ⑥b 清场后延后单仍拦（跨清场存活）"
else
  echo "FAIL ⑥b 清场后延后单未拦（rc=${RC6}）——债务随清场蒸发："; printf '%s\n' "$OUT6"; fails=$((fails+1))
fi

# ── 场景⑦/⑧：pairing 同构（P2 终审收口）——泛指广播与伪键回写 ──
R7="$SR/runs/20261106-v8-runG"; mkdir -p "$R7/evidence"
: > "$R7/evidence/compensation-ledger.tsv"
cat > "$R7/evidence/issues.log" <<'EOF'
ISSUE|conclusion-gap|DEV-A|缺结论
ISSUE|conclusion-gap|DEV-B|缺结论
DISP|conclusion-gap|director|延后（等评审收口）
EOF
OUT7="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261106-v8-runG bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC7=$?
if [ "$RC7" -ne 0 ] \
   && printf '%s' "$OUT7" | grep -q 'conclusion-gap·DEV-A' \
   && printf '%s' "$OUT7" | grep -q 'conclusion-gap·DEV-B' \
   && ! printf '%s' "$OUT7" | grep -q 'director'; then
  echo "PASS ⑦ 泛指延后广播→真实键两枚入列、无伪键（director 不成键）"
else
  echo "FAIL ⑦ 泛指广播应按 pairing 拦真实键（rc=$RC7）："; printf '%s\n' "$OUT7"; fails=$((fails+1))
fi
# ⑧ 伪键回写解禁（终审实证绕过形态）：对泛指主体再回写「已修」广播
AIPAY_SIM_ROOT="$SR" RUN_ID=20261106-v8-runG bash "$HERE/mux/mx-compensation-ledger.sh" \
  append-disp conclusion-gap director '已修（统一修复锚 main@feedface）' >/dev/null 2>&1
OUT8="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261106-v8-runG bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC8=$?
if [ "$RC8" -ne 0 ] \
   && printf '%s' "$OUT8" | grep -q 'conclusion-gap·DEV-A' \
   && printf '%s' "$OUT8" | grep -q '逐键'; then
  echo "PASS ⑧ 泛指已修广播不批量解禁——伪键回写后仍拦（须逐键带锚 exact）"
else
  echo "FAIL ⑧ 泛指广播解禁绕过复发（rc=$RC8）："; printf '%s\n' "$OUT8"; fails=$((fails+1))
fi
# ⑨ 逐键带锚 exact 回写 → 真正放行
AIPAY_SIM_ROOT="$SR" RUN_ID=20261106-v8-runG bash "$HERE/mux/mx-compensation-ledger.sh" \
  append-disp conclusion-gap DEV-A '已修（锚 main@1111111）' >/dev/null 2>&1
AIPAY_SIM_ROOT="$SR" RUN_ID=20261106-v8-runG bash "$HERE/mux/mx-compensation-ledger.sh" \
  append-disp conclusion-gap DEV-B '已修（锚 main@2222222）' >/dev/null 2>&1
OUT9="$(AIPAY_SIM_ROOT="$SR" RUN_ID=20261106-v8-runG bash "$HERE/mux/mx-compensation-ledger.sh" check-issue-clearance 2>&1)"; RC9=$?
if [ "$RC9" -eq 0 ]; then
  echo "PASS ⑨ 逐键带锚 exact 回写→放行（正道出口畅通）"
else
  echo "FAIL ⑨ 逐键 exact 回写应放行（rc=$RC9）："; printf '%s\n' "$OUT9"; fails=$((fails+1))
fi

[ "$fails" -eq 0 ] && echo "issue-clearance: ALL-PASS" || { echo "issue-clearance: ${fails} FAIL"; exit 1; }

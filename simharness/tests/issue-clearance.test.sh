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

[ "$fails" -eq 0 ] && echo "issue-clearance: ALL-PASS" || { echo "issue-clearance: ${fails} FAIL"; exit 1; }

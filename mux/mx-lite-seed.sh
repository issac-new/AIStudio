#!/bin/bash
# mx-lite-seed.sh — lite-round fixture seeder (speedup option 1, 2026-10-09).
# Seeds a run dir + state.env so a lite round can start at START_STEP=devimpl.
# Fixtures are provenance-labeled (lite_fixtures_from); lite evidence must never
# be conflated with full-round evidence. Design: mux/run13-lite-round-plan.md
#
# Usage: bash mux/mx-lite-seed.sh --to <dst-run-id> [--from <src-run-id>] [--room <room-id>] [--check]
set -uo pipefail
# bash 3.2 UTF-8 locale 会把 $var 后的全角标点首字节吸入变量名（run12 实锤）——
# 固化 LC_ALL=C 为主防御，变量后接非 ASCII 一律用 ${var} 花括号。
export LC_ALL=C

SIM_ROOT="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TO="" FROM="" ROOM="" CHECK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO="${2:-}"; shift 2 ;;
    --from) FROM="${2:-}"; shift 2 ;;
    --room) ROOM="${2:-}"; shift 2 ;;
    --check) CHECK=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done
[[ -n "$TO" ]] || { echo "need --to <dst-run-id>"; exit 2; }

fail() { echo "SEED-FAIL: $*"; exit 1; }
ok()   { echo "SEED-OK: $*"; }

# ---- preconditions (verify, do not create) ----
[[ -d "$SIM_ROOT/central/aipaydev" ]] || fail "central/aipaydev 不存在（夹具仓缺失）"
for doc in "docs/requirements/RFD-001.freeze.md" "docs/analysis/RFD-001-tasklist.md" "docs/design/RFD-001-architecture-design.md"; do
  if git -C "$SIM_ROOT/central/aipaydev" cat-file -e "origin/main:$doc" 2>/dev/null; then
    ok "仓夹具在位: $doc"
  else
    fail "仓夹具缺失: ${doc}（先跑一轮全量或人工入库）"
  fi
done

gw=$(curl -sf -m 5 "http://127.0.0.1:8801/health" >/dev/null 2>&1 && echo 1 || echo 0)
st=$(curl -sf -m 5 "http://127.0.0.1:8802/health/ready" >/dev/null 2>&1 && echo 1 || echo 0)
[[ "$gw" == 1 && "$st" == 1 ]] || fail "gateway/studio 未就绪（gw=$gw st=$st）——先跑 mux/mx-up.sh"
ok "gateway+studio 就绪"

if [[ -d "$SIM_ROOT/.driver.lock.d" ]]; then
  fail "单驱动锁在位（$(cat "$SIM_ROOT/.driver.lock.d/info" 2>/dev/null)）——已有推演在跑，禁止并行起 lite 轮"
fi

# ---- resolve room: explicit > source run's state.env ----
if [[ -z "$ROOM" && -n "$FROM" ]]; then
  ROOM=$(sed -n 's/^room_analysis=//p' "$SIM_ROOT/runs/$FROM/state.env" 2>/dev/null | head -1)
fi
[[ -n "$ROOM" ]] || fail "room 未定（--room 显式指定，或 --from <源轮> 让我读其 state.env）"
ok "分析群复用: $ROOM"

[[ "$CHECK" == 1 ]] && { ok "check 模式：夹具全部在位，未写任何文件"; exit 0; }

# ---- seed run dir + state.env (idempotent: refuse to clobber a non-lite state) ----
RDIR="$SIM_ROOT/runs/$TO"
if [[ -f "$RDIR/state.env" ]] && ! grep -q '^lite_round=1' "$RDIR/state.env" 2>/dev/null; then
  fail "$RDIR/state.env 已存在且非 lite 种子——拒绝覆盖"
fi
mkdir -p "$RDIR/evidence"
NOW=$(date +%s)
# 夹具闸键携带源轮真值时刻（run13 复盘 A5：$NOW 冒充本轮过闸时刻=旧账冒充）。
# 源轮 state.env 读不到/非数值时退回 $NOW 并打 WARN——报告侧按 g1g2_fixture=1 分带呈现。
G2TS=""
if [[ -n "$FROM" ]]; then
  G2TS=$(sed -n 's/^g2_arch_pass=//p' "$SIM_ROOT/runs/$FROM/state.env" 2>/dev/null | head -1)
  [[ "$G2TS" =~ ^[0-9]{10}$ ]] || { echo "SEED-WARN: 源轮 $FROM g2_arch_pass 非数值（${G2TS:-空}），G2 夹具时刻退回 \$NOW"; G2TS=""; }
fi
[[ -n "$G2TS" ]] || G2TS=$NOW
cat > "$RDIR/state.env" <<EOF
lite_round=1
lite_fixtures_from=${FROM:-none}
g1g2_fixture=1
run_started_at=$NOW
room_analysis=$ROOM
g1_frozen=1
g2_arch_pass=$G2TS
EOF
ok "state.env 已种子: $RDIR/state.env（provenance: lite_fixtures_from=${FROM:-none}，g2 夹具时刻=$G2TS）"

cat <<EOF
── lite 轮起跑命令 ──────────────────────────────
RUN_ID=$TO LC_ALL=C START_STEP=devimpl nohup bash $SCRIPT_DIR/../aipay-scenario.sh > $SIM_ROOT/logs/$TO-driver.log 2>&1 &
────────────────────────────────────────────────
报告口径提醒：lite 轮证据须标注「lite 轮（夹具自 ${FROM:-未标注}）」，不得与全量轮混同统计。
EOF

#!/bin/bash
# mx-delivery-smoke.sh — M3 首片：六阶段交付协议轮（真 Synapse :8008 + 真账号）。
# 分布式设计 §10 M3 验收门的协议事件维度：P1-P6 stage 事件齐、G1-G6 gate verdict 齐
# （含 G4 打回→重试路径、G1/G5 HumanGate 人类 sender）、PRD/retro 工件落中央仓
# （本冒烟用 scratch git 仓代理）、metrics-log 追加行、case state 终态 P6。
# 编制（owner=PM、实现=chen、验证=qi 非实现者——单机内以账号分离代理"跨机结构性分离"，
# 真跨机留 M4）。证据：$EVID_DIR/delivery-smoke/<ts>/。
set -euo pipefail

MX_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mx-lib.sh
source "$MX_SCRIPT_DIR/mx-lib.sh"
# shellcheck source=mx-delivery-lib.sh
source "$MX_SCRIPT_DIR/mx-delivery-lib.sh"

OWNER=fanfan IMPL=chen TESTER=qi
CASE_ID="dlv-$(date +%Y%m%d-%H%M%S)"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$EVID_DIR/delivery-smoke/$TS"; mkdir -p "$OUT"
SCEN_LOG="$OUT/smoke.log"; touch "$SCEN_LOG"
note() { log "$*" | tee -a "$SCEN_LOG"; }

REPO="$OUT/central-repo.git"
WORK="$OUT/central"
ART="docs/delivery/$CASE_ID"
REPO_URL="file://$REPO"

note "M3 delivery 协议轮开始 case=$CASE_ID owner=$OWNER impl=$IMPL tester=$TESTER"

# ── 中央仓（scratch，代理远端 git）──────────────────────
git init -q --bare "$REPO"
git clone -q "$REPO_URL" "$WORK"
mkdir -p "$WORK/$ART"
art_commit() { # <file> <content> → sha
  printf '%s\n' "$2" > "$WORK/$ART/$1"
  git -C "$WORK" add -A && git -C "$WORK" commit -qm "delivery($CASE_ID): $1"
  git -C "$WORK" push -q origin HEAD:main
  git -C "$WORK" rev-parse HEAD
}

# ── P1 需求：PRD 工件 + stage + G1 HumanGate（人类 sender）+ 冻结验收 ──
SHA=$(art_commit prd.md "# PRD $CASE_ID
验收：脚本输出 OK；P4 由非实现者执行。")
ROOM=$(dlv_room "$OWNER" "$CASE_ID" "六阶段协议轮")
echo "$ROOM" > "$OUT/room.id"
dlv_invite "$OWNER" "$ROOM" "$(human_mxid $IMPL)" "$(human_mxid $TESTER)" "$(agent_mxid $OWNER)" "$(agent_mxid $IMPL)" "$(agent_mxid $TESTER)"
# 受邀者须 join 后才能发事件（fanfan 是建房者天然在房）；mx_join 内置吞错，
# join 后以 joined_members 硬校验，漏 join 大声失败（首发事件被 403 的教训）
for u in "$IMPL" "$TESTER"; do
  mx_join "$(load_token "$u")" "$ROOM"
  dlv_joined "$OWNER" "$ROOM" | grep -q "^$(human_mxid "$u")$" || fail "$u 未成功入房（join 失败）"
done
dlv_case_state "$OWNER" "$ROOM" "$CASE_ID" "$(dlv_event case --case-id "$CASE_ID" --title "六阶段协议轮" \
  --repo-url "$REPO_URL" --tier standard --stage P1 --owner "$OWNER" --updated-by "$OWNER")"
dlv_stage "$OWNER" "$ROOM" "$CASE_ID" P1 "$OWNER" done "git:main#$SHA:$ART/prd.md"
dlv_gate  "$OWNER" "$ROOM" "$CASE_ID" G1 pass human "owner 人拍板（HumanGate：sender=人类账号）"
dlv_case_state "$OWNER" "$ROOM" "$CASE_ID" "$(dlv_event case --case-id "$CASE_ID" --title "六阶段协议轮" \
  --repo-url "$REPO_URL" --tier standard --stage P2 --owner "$OWNER" --updated-by "$OWNER" \
  --frozen-acceptance "脚本输出 OK；P4 非实现者执行")"
note "P1 完成（PRD $SHA + G1 pass + 验收冻结）"

# ── P2 设计 → G2（对抗评审：≥1 评审者非执行者=TESTER）────────
SHA=$(art_commit design.md "# Design $CASE_ID")
dlv_stage "$OWNER" "$ROOM" "$CASE_ID" P2 "$OWNER" done "git:main#$SHA:$ART/design.md"
dlv_gate "$TESTER" "$ROOM" "$CASE_ID" G2 pass artifact "design.md 评审通过（评审者=非执行者）"
dlv_case_state "$OWNER" "$ROOM" "$CASE_ID" "$(dlv_event case --case-id "$CASE_ID" --title "六阶段协议轮" \
  --repo-url "$REPO_URL" --tier standard --stage P3 --owner "$OWNER" --updated-by "$OWNER" \
  --frozen-acceptance "脚本输出 OK；P4 非实现者执行")"
note "P2 完成（design $SHA + G2 pass）"

# ── P3 实现 → G3（command-exit 证据）──────────────────
SHA=$(art_commit impl.sh "echo OK-$CASE_ID")
dlv_stage "$IMPL" "$ROOM" "$CASE_ID" P3 "$IMPL" done "git:main#$SHA:$ART/impl.sh" --worker-team "$IMPL-pay-core"
bash "$WORK/$ART/impl.sh" > "$OUT/impl-run.log" 2>&1
dlv_gate "$IMPL" "$ROOM" "$CASE_ID" G3 pass command-exit "impl.sh exit=0（本地门禁退出码）"
dlv_case_state "$OWNER" "$ROOM" "$CASE_ID" "$(dlv_event case --case-id "$CASE_ID" --title "六阶段协议轮" \
  --repo-url "$REPO_URL" --tier standard --stage P4 --owner "$OWNER" --updated-by "$OWNER" \
  --frozen-acceptance "脚本输出 OK；P4 非实现者执行")"
note "P3 完成（impl $SHA + G3 pass）"

# ── P4 验证（强制非实现者 TESTER）：先 reject 打回 → 修复 → pass（打回重试路径）──
SHA=$(art_commit test.sh "exit 1") # 首版坏测试 → G4 打回
dlv_stage "$TESTER" "$ROOM" "$CASE_ID" P4 "$TESTER" done "git:main#$SHA:$ART/test.sh"
dlv_gate  "$TESTER" "$ROOM" "$CASE_ID" G4 reject command-exit "test.sh exit=1" \
  --reason "[REJECT:test-fail] 修复 test.sh 断言后重验"
note "P4 首验打回（G4 reject，附方向）"
SHA=$(art_commit test.sh "bash '$ART/impl.sh' | grep -q OK-$CASE_ID") # 修复
dlv_stage "$TESTER" "$ROOM" "$CASE_ID" P4 "$TESTER" done "git:main#$SHA:$ART/test.sh"
(cd "$WORK" && bash "$ART/test.sh") && note "test.sh 复验 exit=0" || fail "test.sh 仍失败"
dlv_gate  "$TESTER" "$ROOM" "$CASE_ID" G4 pass command-exit "test.sh exit=0（非实现者复验）"
dlv_case_state "$OWNER" "$ROOM" "$CASE_ID" "$(dlv_event case --case-id "$CASE_ID" --title "六阶段协议轮" \
  --repo-url "$REPO_URL" --tier standard --stage P5 --owner "$OWNER" --updated-by "$OWNER" \
  --frozen-acceptance "脚本输出 OK；P4 非实现者执行")"
note "P4 完成（打回→修复→pass）"

# ── P5 发布：release-plan → G5 HumanGate ──────────────
SHA=$(art_commit release-plan.md "# Release $CASE_ID")
dlv_stage "$OWNER" "$ROOM" "$CASE_ID" P5 "$OWNER" done "git:main#$SHA:$ART/release-plan.md"
dlv_gate  "$OWNER" "$ROOM" "$CASE_ID" G5 pass human "owner 人拍板发布（HumanGate）"
dlv_case_state "$OWNER" "$ROOM" "$CASE_ID" "$(dlv_event case --case-id "$CASE_ID" --title "六阶段协议轮" \
  --repo-url "$REPO_URL" --tier standard --stage P6 --owner "$OWNER" --updated-by "$OWNER" \
  --frozen-acceptance "脚本输出 OK；P4 非实现者执行")"
note "P5 完成（release-plan $SHA + G5 pass）"

# ── P6 复盘：retrospective + metrics-log 追加行 → G6 ──
SHA=$(art_commit retrospective.md "# Retro ${CASE_ID}：协议轮走通，打回路径演练 1 次。")
printf '%s,%s,%s,%s,%s,%s,%s,%s\n' "$(date +%F)" "$CASE_ID" "G1-G6" "6/6" "1.0" \
  "1 打回/6 门" "m3-smoke" "mx-delivery-smoke" >> "$WORK/$ART/metrics-log.csv"
git -C "$WORK" add -A && git -C "$WORK" commit -qm "delivery($CASE_ID): metrics-log" && git -C "$WORK" push -q origin HEAD:main
SHA6=$(git -C "$WORK" rev-parse HEAD)
dlv_stage "$OWNER" "$ROOM" "$CASE_ID" P6 "$OWNER" done "git:main#$SHA6:$ART/retrospective.md"
dlv_gate  "$OWNER" "$ROOM" "$CASE_ID" G6 pass artifact "retro+metrics-log 落仓"
note "P6 完成（retro $SHA + metrics-log）"

# ── M3 验收断言（分布式设计 §10）───────────────────────
STAGES_N=$(dlv_events "$OWNER" "$ROOM" "$DLV_STAGE_TYPE" | jq -s --arg c "$CASE_ID" \
  '[.[] | select(.caseId==$c and .outcome=="done")] | [.[].stage] | unique | length')
dlv_assert "六阶段 stage 事件齐（P1-P6 done）" "[ '$STAGES_N' -eq 6 ]"
for G in G1 G2 G3 G4 G5 G6; do
  N=$(dlv_events "$OWNER" "$ROOM" "$DLV_GATE_TYPE" | jq -s --arg c "$CASE_ID" --arg g "$G" \
    '[.[] | select(.caseId==$c and .gate==$g and .verdict=="pass")] | length')
  dlv_assert "门 $G 有 pass verdict" "[ '$N' -ge 1 ]"
done
R=$(dlv_events "$OWNER" "$ROOM" "$DLV_GATE_TYPE" | jq -s --arg c "$CASE_ID" \
  '[.[] | select(.caseId==$c and .verdict=="reject" and .reason != null)] | length')
dlv_assert "打回路径存在且附方向（reject+reason）" "[ '$R' -ge 1 ]"
dlv_assert "PRD 工件在中央仓" "[ -f '$WORK/$ART/prd.md' ]"
dlv_assert "retro 工件在中央仓" "[ -f '$WORK/$ART/retrospective.md' ]"
dlv_assert "metrics-log 追加行存在" "grep -q '$CASE_ID' '$WORK/$ART/metrics-log.csv'"
FINAL_STAGE=$(dlv_case_state_read "$OWNER" "$ROOM" "$CASE_ID" | jq -r '.stage')
dlv_assert "case 终态 P6" "[ '$FINAL_STAGE' = 'P6' ]"
HUMAN_SENDERS=$(curl -sf "$HS/_matrix/client/v3/rooms/$ROOM/messages?access_token=$(load_token "$OWNER")&dir=b&limit=200" \
  | jq -r '.chunk[] | select(.type=="com.swarmstudio.delivery.gate" and (.content.gate=="G1" or .content.gate=="G5")) | .sender' | sort -u)
dlv_assert "G1/G5 HumanGate sender=人类账号" "[ \"$HUMAN_SENDERS\" = \"$(human_mxid $OWNER)\" ]"

{
  echo "# M3 delivery 协议轮报告"
  echo "- case: $CASE_ID  room: $ROOM  repo: $REPO_URL"
  echo "- 断言：8 项全过（六 stage/六 gate/打回/工件/metrics/终态/HumanGate sender）"
  echo "- 时间: $TS"
} > "$OUT/report.md"
note "M3 delivery 协议轮完成：全部断言通过 → $OUT/report.md"

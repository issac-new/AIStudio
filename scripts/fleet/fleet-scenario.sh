#!/bin/bash
# fleet-scenario.sh — 需求交付全流程协作场景（fleet 独立应用实例版）
# 角色: alice=产品/集成  bob=工程A(slugify)  carol=工程B(truncate)
# 导演脚本只扮演"人类打字"（含审批回复）；所有 agent 动作为各实例真实网关 + LLM 回合。
# 工具链：各 agent 用自己沙箱内 venv（实例自带 runtime + setup 装的 pytest）。
# 等待策略：一律轮询"地面真值"（central 的分支/文件/tag），消息流只用于留证与代人类回复。
# 断点续跑: START_STEP=impl bash fleet-scenario.sh
#   rfd → decompose → cards → impl → verify → approve → ship
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/fleet-lib.sh"

ROOM_ID=$(load_room)
ALICE=$(load_token alice)
STATE="$FLEET_ROOT/state.env"  # evidence 会被清空重跑，state 必须跨轮存活（防重复建卡）
SCEN_LOG="$EVID_DIR/scenario.log"
mkdir -p "$EVID_DIR"
[[ -f "$STATE" ]] || : > "$STATE"
sget() { grep -s "^$1=" "$STATE" | head -1 | cut -d= -f2-; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }

note() { log "$*" | tee -a "$SCEN_LOG"; }

START_STEP="${START_STEP:-rfd}"
step_reached() { # 当前步骤是否已达 START_STEP（线性顺序）
  local order="rfd decompose cards impl verify approve ship"
  [[ "$order" == *"$START_STEP"* ]] || fail "未知 START_STEP: $START_STEP"
  local a b
  a=$(echo "$order" | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1)
  b=$(echo "$order" | tr ' ' '\n' | grep -n "^$START_STEP$" | cut -d: -f1)
  (( a >= b ))
}

# ── 真值谓词 ────────────────────────────────────────────
truth_impl() {
  git -C "$CENTRAL_REPO" rev-parse -q --verify refs/heads/feat/slugify >/dev/null &&
  git -C "$CENTRAL_REPO" rev-parse -q --verify refs/heads/feat/truncate >/dev/null
}
truth_merged() {
  git -C "$CENTRAL_REPO" show main:stringops/slugify.py >/dev/null 2>&1 &&
  git -C "$CENTRAL_REPO" show main:stringops/truncate.py >/dev/null 2>&1
}
truth_shipped() {
  git -C "$CENTRAL_REPO" rev-parse -q --verify refs/tags/v0.1 >/dev/null &&
  git -C "$CENTRAL_REPO" show main:RELEASE.md >/dev/null 2>&1
}
truth_decompose() { # 房间里有 alice-agent 的任务分解长文
  mx_messages "$ALICE" "$ROOM_ID" 80 | jq -e --arg a "$(agent_mxid alice)" \
    'map(select(.sender == $a and ((.content.body // "") | contains("T1")) and ((.content.body // "") | contains("T2")))) | any' >/dev/null
}

# ── 导演原语 ────────────────────────────────────────────
dispatch_task() { # <user> <text>：以人类身份发任务 mention
  local u="$1" text="$2"
  local marker
  marker=$(mx_send "$(load_token "$u")" "$ROOM_ID" "$text" "$(agent_mxid "$u")")
  note "[$u] mention 已发 ($marker): ${text:0:50}..."
}

APPROVED_LOG="$EVID_DIR/approved.events"
touch "$APPROVED_LOG"
auto_approve() { # 扫描 agent 审批请求，以对应人类身份回 !approve（每事件一次）
  for u in "${USERS[@]}"; do
    local pend
    pend=$(mx_messages "$(load_token "$u")" "$ROOM_ID" 12 | jq -r --arg agent "$(agent_mxid "$u")" \
      '.[] | select(.sender == $agent and ((.content.body // "") | contains("needs your OK"))) | .event_id' \
      | while read -r eid; do grep -q "^$eid$" "$APPROVED_LOG" || echo "$eid"; done) || true
    for eid in $pend; do
      mx_send "$(load_token "$u")" "$ROOM_ID" "!approve" >/dev/null
      echo "$eid" >> "$APPROVED_LOG"
      note "[$u] 代人类回复 !approve（提示事件 ${eid}）"
    done
  done
}

wait_truth() { # <desc> <timeout-sec> <predicate-cmd...>
  local desc="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    auto_approve || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    sleep 15
  done
  auto_approve || true
  note "[真值] $desc ✗（${timeout}s 超时）"
  return 1
}

kanban_create() { # <key> <title> <body> → task id（state 缓存避免重复建卡）
  local key="card_$1"; shift
  local cached; cached=$(sget "$key")
  [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local id
  id=$(studio "$(studio_port alice)" POST /api/hermes/kanban "$ALICE_JWT" \
    "{\"title\":$(jq -Rn --arg t "$1" '$t'),\"body\":$(jq -Rn --arg b "$2" '$b'),\"project\":\"stringops\"}" \
    | jq -r '.task.id // .id')
  [[ -n "$id" && "$id" != "null" ]] || fail "kanban 建卡失败: $1"
  sset "$key" "$id"
  echo "$id"
}
kanban_status() { studio "$(studio_port alice)" PATCH "/api/hermes/kanban/$1" "$ALICE_JWT" "{\"status\":\"$2\"}" >/dev/null; }

PY=$(instance_python alice)   # 导演复跑用 alice 实例自带 venv
ALICE_JWT=$(studio_login alice)
[[ -n "$ALICE_JWT" && "$ALICE_JWT" != "null" ]] || fail "alice 实例 studio 登录失败（应用是否已 fleet-up？）"

# ── 步骤 1：需求发布（alice 人类）──────────────────────
if step_reached rfd; then
  if [[ -z "$(sget rfd_marker)" ]]; then
    M1=$(mx_send "$ALICE" "$ROOM_ID" "【需求 RFD-001】stringops v0.1（fleet 独立应用协作轮）
交付一个小型 Python 字符串工具库：
1) slugify(text)：任意文本转小写中划线 slug（ASCII 与中文都要处理）
2) truncate(text, n)：按码点安全截断
验收：pytest 全绿；打 tag v0.1；仓库根出 RELEASE.md。
分工建议：bob 负责 slugify，carol 负责 truncate，alice 侧集成与发布。
请 @alice-agent:matrix.test 先做任务分解。")
    sset rfd_marker "$M1"
    note "[alice] RFD 已发布 ($M1)"
  else
    note "[alice] RFD 已存在 ($(sget rfd_marker))，跳过"
  fi
fi

# ── 步骤 2：任务分解（alice-agent）─────────────────────
if step_reached decompose; then
  if [[ ! -s "$EVID_DIR/reply-decompose.txt" ]]; then
    dispatch_task alice "@alice-agent:matrix.test 请把 RFD-001 分解为 3 个任务契约（T1 slugify→bob / T2 truncate→carol / T3 集成验证+发布→你），每个任务给出接口签名、验收标准、仓库落点。已分解过的话直接重发结论即可。"
    wait_truth "alice-agent 给出任务分解（房间可见其长回复）" 900 truth_decompose \
      || fail "任务分解超时"
    mx_messages "$ALICE" "$ROOM_ID" 80 | jq -r --arg a "$(agent_mxid alice)" \
      '.[] | select(.sender == $a) | .content.body' | head -c 6000 > "$EVID_DIR/reply-decompose.txt" || true
  fi
fi

# ── 步骤 3：kanban 建卡（alice 实例）───────────────────
if step_reached cards; then
  T1_ID=$(kanban_create T1 "T1 slugify 实现+测试（bob）" "见房间 RFD-001；分支 feat/slugify；pytest 全绿后 push central")
  T2_ID=$(kanban_create T2 "T2 truncate 实现+测试（carol）" "见房间 RFD-001；分支 feat/truncate；pytest 全绿后 push central")
  T3_ID=$(kanban_create T3 "T3 集成验证+发布 v0.1（alice）" "合并两分支；pytest 全绿；tag v0.1 + RELEASE.md")
  note "[alice] kanban 卡: T1=$T1_ID T2=$T2_ID T3=$T3_ID"
  kanban_status "$T1_ID" running; kanban_status "$T2_ID" running; kanban_status "$T3_ID" running
fi

# ── 步骤 4：并行实现（bob-agent ∥ carol-agent，各自沙箱 venv）──
if step_reached impl; then
  WS_BOB=$(workspace bob); WS_CAROL=$(workspace carol)
  PY_BOB=$(instance_python bob); PY_CAROL=$(instance_python carol)
  dispatch_task bob "@bob-agent:matrix.test 认领任务 T1：实现 slugify。
- 你的工作区（你这台「电脑」的本地检出）: ${WS_BOB}（remote central 已指向共享裸仓）
- 实现 stringops/slugify.py 的 slugify(text)：小写、连续分隔符折叠为单个 -、去首尾 -；CJK 字符保留原样；空串/纯标点 → 空串
- 新增 tests/test_slugify.py，至少 4 个用例（含中文、空串、纯符号、NFKD）
- 测试命令（你本机自带，必须跑通）: cd ${WS_BOB} && ${PY_BOB} -m pytest -q
- 流程: git checkout -b feat/slugify → 实现+测试 → 全绿 → git add -A && git commit -m 'feat: slugify' → git push central HEAD:refs/heads/feat/slugify
- 注意：不要把 __pycache__/*.pyc 提交进仓库；结论行以 IMPL-DONE-T1 或 IMPL-FAIL-T1 开头。不许谎报。"
  dispatch_task carol "@carol-agent:matrix.test 认领任务 T2：实现 truncate。
- 你的工作区（你这台「电脑」的本地检出）: ${WS_CAROL}（remote central 已指向共享裸仓）
- 实现 stringops/truncate.py 的 truncate(text, n)：按码点截断，n<=0 → 空串，n>=len → 原样；幂等
- 新增 tests/test_truncate.py，至少 4 个用例（含中文、n=0、n 大于长度）
- 测试命令（你本机自带，必须跑通）: cd ${WS_CAROL} && ${PY_CAROL} -m pytest -q
- 流程: git checkout -b feat/truncate → 实现+测试 → 全绿 → git add -A && git commit -m 'feat: truncate' → git push central HEAD:refs/heads/feat/truncate
- 注意：不要把 __pycache__/*.pyc 提交进仓库；结论行以 IMPL-DONE-T2 或 IMPL-FAIL-T2 开头。不许谎报。"
  wait_truth "central 有 feat/slugify 与 feat/truncate" 1800 truth_impl \
    || fail "实现阶段超时：分支未就绪（房间消息与 ${LOGS_DIR} 为准）"
  mx_messages "$ALICE" "$ROOM_ID" 60 | jq -r \
    '.[] | select(.sender | endswith("-agent:matrix.test")) | "【\(.sender)】\(.content.body)"' \
    > "$EVID_DIR/reply-impl.txt" || true
  T1_ID=$(sget card_T1); T2_ID=$(sget card_T2)
  [[ -n "$T1_ID" ]] && kanban_status "$T1_ID" review
  [[ -n "$T2_ID" ]] && kanban_status "$T2_ID" review
  note "[kanban] T1/T2 → review"
fi

# ── 步骤 5：集成验证（alice-agent + 导演复跑）──────────
if step_reached verify; then
  WS_ALICE=$(workspace alice)
  if truth_merged; then
    note "[真值] central main 已含两模块，跳过重复派发"
  else
  dispatch_task alice "@alice-agent:matrix.test 执行 T3 集成验证。
- 你的工作区: ${WS_ALICE}（remote central 已配置）
- git fetch central；把 central/feat/slugify 与 central/feat/truncate 合并进本地 main（冲突自行解决，保持两个功能都在）
- 运行全部测试: cd ${WS_ALICE} && ${PY} -m pytest -q
- 全绿: git push central main，结论行以 VERIFY-PASS 开头并附用例数；任何失败: 结论行以 VERIFY-FAIL 开头，不要谎报。"
  wait_truth "central main 同时含 slugify 与 truncate 模块" 1800 truth_merged \
    || fail "集成阶段超时：central main 未含两模块"
  fi
  mx_messages "$ALICE" "$ROOM_ID" 40 | jq -r --arg a "$(agent_mxid alice)" \
    '.[] | select(.sender == $a) | .content.body' | tail -80 > "$EVID_DIR/reply-verify.txt" || true

  # 导演地面真值复跑：在 alice 工作区用其实例自带 venv 独立跑 pytest
  (
    cd "$WS_ALICE"
    git fetch -q central
    git checkout -q main 2>/dev/null || true
    git pull -q central main 2>/dev/null || true
    "$PY" -m pytest -q
  ) > "$EVID_DIR/pytest-director.txt" 2>&1 \
    && note "[真值] 导演复跑 pytest 通过: $(tail -1 "$EVID_DIR/pytest-director.txt")" \
    || { tail -5 "$EVID_DIR/pytest-director.txt" | tee -a "$SCEN_LOG"; fail "导演复跑 pytest 失败"; }
  T3_ID=$(sget card_T3)
  [[ -n "$T3_ID" ]] && kanban_status "$T3_ID" review
fi

# ── 步骤 6：人类审批（alice）───────────────────────────
if step_reached approve; then
  if [[ -z "$(sget approve_marker)" ]]; then
    M6=$(mx_send "$ALICE" "$ROOM_ID" "集成验证通过。审批结论：APPROVED — 允许发布 stringops v0.1。请 @alice-agent:matrix.test 执行发布。")
    sset approve_marker "$M6"
    note "[alice] 审批 APPROVED 已发 ($M6)"
  fi
fi

# ── 步骤 7：发布（alice-agent）─────────────────────────
if step_reached ship; then
  WS_ALICE=$(workspace alice)
  if truth_shipped; then
    note "[真值] tag/RELEASE.md 已就绪，跳过重复派发"
  else
  dispatch_task alice "@alice-agent:matrix.test 发布 stringops v0.1：
- 在 ${WS_ALICE}：仓库根写 RELEASE.md（两函数简介、用法示例、贡献者 alice/bob/carol、测试结论），git add RELEASE.md && git commit -m 'release: v0.1'
- git tag -a v0.1 -m 'stringops v0.1'
- git push central main --follow-tags
- 结论行以 SHIP-DONE 或 SHIP-FAIL 开头。不许谎报。"
  wait_truth "central 有 tag v0.1 且 main 含 RELEASE.md" 1200 truth_shipped \
    || fail "发布阶段超期：tag/RELEASE.md 未就绪"
  fi
  mx_messages "$ALICE" "$ROOM_ID" 40 | jq -r --arg a "$(agent_mxid alice)" \
    '.[] | select(.sender == $a) | .content.body' | tail -60 > "$EVID_DIR/reply-ship.txt" || true
  for k in card_T1 card_T2 card_T3; do
    id=$(sget "$k"); [[ -n "$id" ]] && kanban_status "$id" done
  done
  note "[kanban] T1/T2/T3 → done"
fi

note "场景完成 ✅  运行 bash fleet-evidence.sh 取证"

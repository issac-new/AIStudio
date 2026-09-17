#!/bin/bash
# sim-scenario.sh — 需求交付全流程协作场景（设计文档 §3）
# 角色: alice=产品/集成  bob=工程A(slugify)  carol=工程B(truncate)
# 导演脚本只扮演"人类打字"；所有 agent 动作为真实 gateway + LLM 回合。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/sim-lib.sh"

ROOM_ID=$(load_room)
ALICE=$(load_token alice); BOB=$(load_token bob); CAROL=$(load_token carol)
SCEN_LOG="$EVID_DIR/scenario.log"
mkdir -p "$EVID_DIR"
: > "$SCEN_LOG"

note() { log "$*" | tee -a "$SCEN_LOG"; }

# ask_agent <human-token> <user> <text> <pattern> <timeout>
# → 成功输出 agent 回复；失败重试一次；再失败返回 1（由调用方决定是否中止）
ask_agent() {
  local token="$1" u="$2" text="$3" pattern="$4" timeout="${5:-900}"
  local agent; agent=$(agent_mxid "$u")
  local marker reply
  for attempt in 1 2; do
    marker=$(mx_send "$token" "$ROOM_ID" "$text" "$agent")
    note "[$u] 第 $attempt 次 mention ($marker): ${text:0:60}..."
    if reply=$(mx_wait_reply "$token" "$ROOM_ID" "$agent" "$marker" "$timeout" "$pattern"); then
      note "[$u] agent 回复: $(echo "$reply" | head -c 400)"
      echo "$reply"
      return 0
    fi
    note "[$u] 等待匹配 '$pattern' 超时/未命中"
  done
  return 1
}

kanban_create() { # <title> <body> → task id
  studio "$(studio_port alice)" POST /api/hermes/kanban "$ALICE_JWT" \
    "{\"title\":$(jq -Rn --arg t "$1" '$t'),\"body\":$(jq -Rn --arg b "$2" '$b'),\"project\":\"stringops\",\"status\":\"todo\"}" \
    | jq -r '.task.id // .id'
}
kanban_status() { # <task-id> <status>
  studio "$(studio_port alice)" PATCH "/api/hermes/kanban/$1" "$ALICE_JWT" "{\"status\":\"$2\"}" >/dev/null
}

PY=~/.hermes/hermes-agent/venv/bin/python
ALICE_JWT=$(studio_login alice)
[[ -n "$ALICE_JWT" && "$ALICE_JWT" != "null" ]] || fail "alice studio 登录失败"

# ── 步骤 1：需求发布（alice 人类）──────────────────────
RFD="【需求 RFD-001】stringops v0.1
交付一个小型 Python 字符串工具库：
1) slugify(text)：任意文本转小写中划线 slug（ASCII 与中文都要处理）
2) truncate(text, n)：安全截断，不切多字节字符
验收：pytest 全绿；打 tag v0.1；仓库根出 RELEASE.md。
分工建议：bob 负责 slugify，carol 负责 truncate，alice 侧集成与发布。
请 @alice-agent:matrix.test 先做任务分解。"
M1=$(mx_send "$ALICE" "$ROOM_ID" "$RFD")
note "[alice] RFD 已发布 ($M1)"

# ── 步骤 2：任务分解（alice-agent）────────────────────
DECOMP_REPLY=$(ask_agent "$ALICE" alice \
"@alice-agent:matrix.test 请把上面 RFD-001 分解为 3 个任务契约（T1 slugify→bob / T2 truncate→carol / T3 集成验证+发布→你），每个任务给出交付物与验收标准。完成后回复以 DECOMPOSE-DONE 开头，并附 T1/T2/T3 一行摘要。" \
  'DECOMPOSE-DONE' 900) || fail "任务分解失败（详见 $SCEN_LOG）"

# ── 步骤 3：kanban 建卡（alice studio）────────────────
T1_ID=$(kanban_create "T1 slugify 实现+测试（bob）" "见房间 RFD-001；分支 feat/slugify；pytest 全绿后 push central")
T2_ID=$(kanban_create "T2 truncate 实现+测试（carol）" "见房间 RFD-001；分支 feat/truncate；pytest 全绿后 push central")
T3_ID=$(kanban_create "T3 集成验证+发布 v0.1（alice）" "合并两分支；pytest 全绿；tag v0.1 + RELEASE.md")
note "[alice] kanban 建卡: T1=$T1_ID T2=$T2_ID T3=$T3_ID"
kanban_status "$T1_ID" running; kanban_status "$T2_ID" running; kanban_status "$T3_ID" running

WS_BOB=$(workspace bob); WS_CAROL=$(workspace carol)

IMPL_MSG_BOB="@bob-agent:matrix.test 认领任务 T1：实现 slugify。
- 你的工作区（本机检出）: $WS_BOB
- 实现 stringops/slugify.py 的 slugify(text)（小写、中划线、ASCII 与中文可用拼音库不可用时按音节外字符过滤亦可，但行为要确定）
- 新增 tests/test_slugify.py，至少 4 个用例（含中文与空串/纯符号）
- 在工作区运行测试: cd $WS_BOB && $PY -m pytest -q
- 流程: git checkout -b feat/slugify → 实现+测试 → 全绿 → git add/commit → git push central HEAD:refs/heads/feat/slugify
- 完成后回复以 IMPL-DONE-T1 开头并附分支名与测试数；失败回复 IMPL-FAIL-T1 与原因。不许谎报。"

IMPL_MSG_CAROL="@carol-agent:matrix.test 认领任务 T2：实现 truncate。
- 你的工作区（本机检出）: $WS_CAROL
- 实现 stringops/truncate.py 的 truncate(text, n)：n 为最大长度，截断不切多字节字符，超长追加省略号 '…'（省略号不计入 n）
- 新增 tests/test_truncate.py，至少 4 个用例（含中文、n 大于长度、n=0）
- 在工作区运行测试: cd $WS_CAROL && $PY -m pytest -q
- 流程: git checkout -b feat/truncate → 实现+测试 → 全绿 → git add/commit → git push central HEAD:refs/heads/feat/truncate
- 完成后回复以 IMPL-DONE-T2 开头并附分支名与测试数；失败回复 IMPL-FAIL-T2 与原因。不许谎报。"

# ── 步骤 4：并行实现（bob-agent ∥ carol-agent）────────
ask_agent "$BOB" bob "$IMPL_MSG_BOB" 'IMPL-(DONE|FAIL)-T1' 1500 > "$EVID_DIR/reply-bob.txt" &
BPID=$!
ask_agent "$CAROL" carol "$IMPL_MSG_CAROL" 'IMPL-(DONE|FAIL)-T2' 1500 > "$EVID_DIR/reply-carol.txt" &
CPID=$!
FAILURES=0
wait $BPID || { note "[bob] 实现回合失败"; FAILURES=1; }
wait $CPID || { note "[carol] 实现回合失败"; FAILURES=$((FAILURES+1)); }
grep -q 'IMPL-FAIL-T1' "$EVID_DIR/reply-bob.txt" 2>/dev/null && { note "[bob] agent 报告失败"; FAILURES=$((FAILURES+1)); }
grep -q 'IMPL-FAIL-T2' "$EVID_DIR/reply-carol.txt" 2>/dev/null && { note "[carol] agent 报告失败"; FAILURES=$((FAILURES+1)); }
(( FAILURES == 0 )) || fail "实现阶段有失败（FAILURES=$FAILURES，见 $SCEN_LOG 与 reply-*.txt）"

kanban_status "$T1_ID" review; kanban_status "$T2_ID" review
note "[kanban] T1/T2 → review"

# ── 步骤 5：集成验证（alice-agent）────────────────────
WS_ALICE=$(workspace alice)
INTEG_REPLY=$(ask_agent "$ALICE" alice \
"@alice-agent:matrix.test 执行 T3 集成验证。
- 你的工作区: $WS_ALICE（remote central 已配置）
- git fetch central；把 central 的 feat/slugify 与 feat/truncate 合并进本地 main（有冲突自行解决，保持两个功能都在）
- 运行全部测试: cd $WS_ALICE && $PY -m pytest -q
- 全绿: git push central main，回复以 VERIFY-PASS 开头并附通过用例数；任何失败: 回复 VERIFY-FAIL 与失败摘要，不要推送，不要谎报。" \
  'VERIFY-(PASS|FAIL)' 1500) || fail "集成验证回合失败"
echo "$INTEG_REPLY" | grep -q 'VERIFY-FAIL' && { note "[alice-agent] $INTEG_REPLY"; fail "集成验证未通过（VERIFY-FAIL）"; }
kanban_status "$T3_ID" review
note "[kanban] T3 → review（验证通过）"

# ── 步骤 6：人类审批（alice）──────────────────────────
M6=$(mx_send "$ALICE" "$ROOM_ID" "集成验证通过。审批结论：APPROVED — 允许发布 stringops v0.1。请 @alice-agent:matrix.test 执行发布。")
note "[alice] 审批 APPROVED 已发 ($M6)"

# ── 步骤 7：发布（alice-agent）────────────────────────
SHIP_REPLY=$(ask_agent "$ALICE" alice \
"@alice-agent:matrix.test 发布 stringops v0.1：
- 在 $WS_ALICE：仓库根写 RELEASE.md（两函数简介、用法示例、贡献者 alice/bob/carol、测试结论），git add RELEASE.md && git commit
- git tag -a v0.1 -m 'stringops v0.1'
- git push central main --follow-tags
- 完成后回复以 SHIP-DONE 开头并附 tag 名；失败回复 SHIP-FAIL 与原因。不许谎报。" \
  'SHIP-(DONE|FAIL)' 1200) || fail "发布回合失败"
echo "$SHIP_REPLY" | grep -q 'SHIP-FAIL' && { note "[alice-agent] $SHIP_REPLY"; fail "发布失败（SHIP-FAIL）"; }
kanban_status "$T1_ID" done; kanban_status "$T2_ID" done; kanban_status "$T3_ID" done
note "[kanban] T1/T2/T3 → done"

note "场景完成 ✅  运行 sim-evidence.sh 取证"

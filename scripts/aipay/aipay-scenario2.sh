#!/bin/bash
# aipay-scenario2.sh — 推演下半场：anexec(12) → review(13) → close(14) → plan(15)
#   → devimpl(16) → defect(16缺陷环) → testpass(17) → release(18) → templates(19) → ide(20)
# 由 aipay-scenario.sh 在 START_STEP>=anexec 时 exec 进入；共享 state.env。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

STATE="$SIM_ROOT/state.env"
SCEN_LOG="$EVID_DIR/scenario.log"
sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }
note() { log "$*" | tee -a "$SCEN_LOG"; }

STEPS="smoke ba room dispatch register analysis triage anexec review close plan devimpl defect testpass release templates ide"
START_STEP="${START_STEP:-anexec}"
step_reached() {
  local a b
  a=$(echo $STEPS | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1)
  b=$(echo $STEPS | tr ' ' '\n' | grep -n "^$START_STEP$" | cut -d: -f1)
  (( a >= b ))
}

jwt_of() {
  local u="$1" cached; cached=$(sget "jwt_$u")
  [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local t
  t=$(studio "$(studio_port "$u")" POST /api/auth/matrix-login "" "$(jq -n \
    --arg tok "$(load_token "$u")" --arg uid "$(human_mxid "$u")" --arg hs "$HS" \
    '{matrixAccessToken:$tok, matrixUserId:$uid, homeserverUrl:$hs}')" | jq -r '.token // empty') || true
  [[ -n "$t" ]] || t=$(studio_login "$u")
  sset "jwt_$u" "$t"; echo "$t"
}
kanban_list() { # 跨板合并：agent 可能建专用板（如 aipay-rfd），默认板可能为空
  local jwt; jwt=$(jwt_of "$1")
  local boards; boards=$(studio "$(studio_port "$1")" GET "/api/hermes/kanban/boards" "$jwt" | jq -r '.boards[]?.slug' 2>/dev/null)
  [[ -z "$boards" ]] && boards="default"
  local slug out='{"tasks":[]}'
  for slug in $boards; do
    out=$(jq -s '.[0].tasks + (.[1].tasks // []) | {tasks: .}' <(echo "$out")       <(studio "$(studio_port "$1")" GET "/api/hermes/kanban?board=$slug" "$jwt" 2>/dev/null || echo '{"tasks":[]}'))
  done
  echo "$out"
}
kanban_has() { kanban_list "$1" | jq -e --arg n "$2" '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n))] | length > 0' >/dev/null 2>&1; }
kanban_status_of() { kanban_list "$1" | jq -r --arg n "$2" '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .status][0] // empty'; }
kanban_done() { kanban_list "$1" | jq -e --arg n "$2" '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .status] | map(select(. == "done")) | length >= 1' >/dev/null 2>&1; }
kanban_create_as() {
  local u="$1" key="card_$2" title="$3" body="$4" cached id
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  id=$(studio "$(studio_port "$u")" POST /api/hermes/kanban "$(jwt_of "$u")" \
    "{\"title\":$(jq -Rn --arg t "$title" '$t'),\"body\":$(jq -Rn --arg b "$body" '$b'),\"project\":\"aipaydev\"}" \
    | jq -r '.task.id // .id')
  [[ -n "$id" && "$id" != "null" ]] || fail "[$u] kanban 建卡失败: $title"
  sset "$key" "$id"; echo "$id"
}
kanban_status_as() { studio "$(studio_port "$1")" PATCH "/api/hermes/kanban/$2" "$(jwt_of "$1")" "{\"status\":\"$3\"}" >/dev/null; }

kanban_walk_done() { # <user> <id>：按合法路径走到 done（静默容错）
  local u="$1" id="$2" st
  for st in todo running review done; do
    kanban_status_as "$u" "$id" "$st" 2>/dev/null || true
  done
}
APPROVED_LOG="$EVID_DIR/approved.events"; touch "$APPROVED_LOG"
auto_approve() {
  local room="$1"
  for u in "${INSTANCED_USERS[@]}"; do
    local pend
    pend=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg agent "$(agent_mxid "$u")" \
      '.[] | select(.sender == $agent and ((.content.body // "") | test("needs your OK|approval"))) | .event_id' 2>/dev/null \
      | while read -r eid; do grep -q "^$eid$" "$APPROVED_LOG" || echo "$eid"; done) || true
    for eid in $pend; do
      mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
        "{\"msgtype\":\"m.text\",\"body\":\"!approve\",\"m.relates_to\":{\"rel_type\":\"m.thread\",\"event_id\":\"$eid\"}}" >/dev/null || true
      echo "$eid" >> "$APPROVED_LOG"
    done
  done
}

wait_truth() {
  local desc="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    sleep 20
  done
  note "[真值] $desc ✗（${timeout}s 超时）"
  return 1
}

repo_has() { git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true; git -C "$DIRECTOR_CLONE" show "origin/main:$1" >/dev/null 2>&1; }
repo_pull() { git -C "$DIRECTOR_CLONE" pull -q origin main >/dev/null 2>&1 || true; }

dispatch_in_room() { # <humanUser> <text> <mention-csv> → event_id
  local m
  m=$(mx_send "$(load_token "$1")" "$(sget room_analysis)" "$2" "$3")
  note "[$1] 派发 ($m): $(echo "$2" | head -1)"
  echo "$m"
}

SCAN_ROOM="$(sget room_analysis)"

# ══ 步骤 12：各主责系分执行（worktree + 分析文档 + 双兜底回执）══
if step_reached anexec && [[ -z "$(sget anexec_done)" ]]; then
  note "── anexec：派发 4 个系分执行任务（错峰 2+2）"
  COMMON='你的 kanban 任务已通过团队负责人分诊确认，现在执行系统分析（步骤：aipaydev-dev 技能的「分析/设计产出」）。
工作要求：
1) 在你的工作区 %WS% 下为该任务建 worktree 分支（见 aipaydev-dev 技能纪律），材料归集到任务 materials/
2) 先读 docs/requirements/RFD-001-payment-cashier.md、docs/architecture/overview.md、docs/admin/org.md、docs/analysis/RFD-001-tasklist.md
3) 输出 docs/analysis/<任务ID>-analysis.md：初步确认结论/待澄清/概设方案（接口签名+数据模型+错误码+幂等键）/前置依赖/风险点/工作量评估(人日)
4) git 提交并 push 到 origin main（worktree 内直接提交本文件即可，commit message: docs(analysis): <任务ID>）
5) 完成后在本群发【完成回执】（双兜底：@你的团队负责人-agent 与 @fanfan-agent），格式见 inbox-dedup 技能
结论行以 AN-DONE-<任务ID> 开头。不许谎报。'

  WS=$(workspace chen)
  dispatch_in_room chen "@chen-agent:matrix.test 执行任务 AN-PAYCORE（csw-pay-core 支付核心系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid chen),$(agent_mxid wei)"
  WS=$(workspace xiao)
  dispatch_in_room xiao "@xiao-agent:matrix.test 执行任务 AN-MP（csw-cashier-mp 小程序收银台前端系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid xiao),$(agent_mxid mei)"
  sleep 5
  WS=$(workspace hu)
  dispatch_in_room hu "@hu-agent:matrix.test 执行任务 AN-CHWX（csw-channel-wechat 财付通渠道系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid hu),$(agent_mxid wei)"
  WS=$(workspace lin)
  dispatch_in_room lin "@lin-agent:matrix.test 执行任务 AN-CHALI（csw-channel-alipay 支付宝渠道系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid lin),$(agent_mxid wei)"

  for t in AN-PAYCORE AN-MP AN-CHWX AN-CHALI; do
    wait_truth "仓库出现 docs/analysis/$t-analysis.md" 3600 repo_has "docs/analysis/$t-analysis.md" \
      || { note "[观察] $t 分析文档未达（记问题单）"; echo "ISSUE|anexec-missing|$t|分析文档未入库" >> "$EVID_DIR/issues.log"; }
  done
  # 双兜底回执核验
  for t in AN-PAYCORE AN-MP AN-CHWX AN-CHALI; do
    mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 200 | jq -e --arg t "$t" \
      '[.[] | select((.content.body // "") | contains("完成回执") and contains($t))] | length > 0' >/dev/null \
      && note "[真值] $t 完成回执在房间可见 ✓" \
      || { note "[观察] $t 回执未见"; echo "ISSUE|receipt-missing|$t|完成回执未见（双兜底缺口）" >> "$EVID_DIR/issues.log"; }
  done
  sset anexec_done 1
fi

# ══ 步骤 13：汇总复核 + 线下评审 ══════════════════════
if step_reached review && [[ -z "$(sget review_done)" ]]; then
  if ! repo_has docs/design/RFD-001-architecture-design.md; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 四个系分任务（AN-PAYCORE/AN-MP/AN-CHWX/AN-CHALI）已全部完成。
请加载 requirements-analyst 技能做汇总复核：
1) git pull 读取四份 docs/analysis/AN-*.md
2) 消除歧义与冲突（重点：金额单位必须统一明确为「分」(int64)；接口契约字段命名统一 snake_case）
3) 整理结构层次，按规范形成系统概设方案 docs/design/RFD-001-architecture-design.md（含跨模块接口契约与数据模型），提交 push
4) 在你的 kanban 登记评审任务卡（标题含 RFD-001-评审，status=review）
结论行 REVIEW-DOC-DONE 开头。不许谎报。" "$(agent_mxid fanfan)"
    wait_truth "概设方案 docs/design/RFD-001-architecture-design.md 入库" 2400 \
      repo_has docs/design/RFD-001-architecture-design.md || fail "复核稿超时"
  fi
  # 线下人工评审（虚拟架构小组），导演代 fanfan 手工更新
  RID=$(kanban_list fanfan | jq -r '[.. | objects | select(has("title")) | select((.title // "") | contains("RFD-001-评审")) | .id][0] // empty')
  if [[ -n "$RID" ]]; then
    kanban_walk_done fanfan "$RID"
    note "[fanfan] 线下评审结论：通过（虚拟架构小组人工评审），评审卡 $RID → done"
  else
    note "[观察] 评审卡未找到，导演直接登记并置 done"
    echo "ISSUE|review-card-missing|fanfan|agent 未登记评审卡" >> "$EVID_DIR/issues.log"
    RID=$(kanban_create_as fanfan review_rfd "RFD-001-评审（虚拟架构小组）" "线下人工评审：通过。概设 docs/design/RFD-001-architecture-design.md")
    kanban_walk_done fanfan "$RID"
  fi
  sset review_done 1
fi

# ══ 步骤 14：主任务归档关闭 ═══════════════════════════
if step_reached close && [[ -z "$(sget close_done)" ]]; then
  if [[ "$(kanban_status_of fanfan RFD-001)" != "done" ]]; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 评审已通过。请收尾 RFD-001 主任务：
1) 把全部关联子任务与过程档案（4 份 AN-*.md、tasklist、概设方案 git 路径+commit）汇总登记进主任务卡 body，便于回溯审计
2) 主任务卡 status 置 done（测试工作量按 0.3 系数叠加口径写入 body）
结论行 CLOSE-DONE 开头。" "$(agent_mxid fanfan)"
    wait_truth "fanfan kanban RFD-001 主卡 done" 1200 kanban_done fanfan "RFD-001" \
      || note "[观察] 主卡未置 done（记问题单）"
  fi
  sset close_done 1
fi

# ══ 步骤 15：排期（pm-planning）══════════════════════
if step_reached plan && [[ -z "$(sget plan_done)" ]]; then
  if ! repo_has docs/plan/RFD-001-schedule.md; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 请加载 pm-planning 技能，基于定稿的概设与工作量评估编排开发/测试计划：
1) 产出 docs/plan/RFD-001-schedule.md：任务表（ID/模块/责任人/类型/工作量人日/时间窗口/依赖）+ 里程碑；测试工作量 = 开发 × 0.3 叠加为独立测试任务；整体 +15% 集成缓冲
2) 开发任务 ID 固定：DEV-PAYCORE(chen) DEV-CHWX(hu) DEV-CHALI(lin) DEV-MP(xiao)；测试任务：TEST-BE(qi) TEST-FE(fei)
3) kanban 建排期父任务，并为每个开发/测试任务建子任务（link 关联），卡片含时间窗口与工作量
4) 逐条 matrix 派发：@责任人-agent 与 @其 lead-agent，附任务明细与本计划 git 地址
结论行 PLAN-DONE-RFD-001 开头。不许谎报。" "$(agent_mxid fanfan)"
    wait_truth "docs/plan/RFD-001-schedule.md 入库" 2400 repo_has docs/plan/RFD-001-schedule.md || fail "排期超时"
  fi
  repo_pull
  note "[真值] 排期计划入库 ✓"
  sset plan_done 1
fi

# ══ 步骤 16：开发实施（真实编码，错峰）═══════════════
if step_reached devimpl && [[ -z "$(sget devimpl_done)" ]]; then
  note "── devimpl：后端核心先行，渠道/前端随后"
  PYTEST_NOTE="测试用 vitest（npx vitest run）；渠道端点一律本地 mock，禁止真实请求。"

  dispatch_in_room chen "@chen-agent:matrix.test 执行开发任务 DEV-PAYCORE（csw-pay-core）。
工作区 $(workspace chen)（先 git pull）。按 docs/design/RFD-001-architecture-design.md 契约：
1) git checkout -b feat/DEV-PAYCORE
2) 实现 apps/csw-pay-core：支付单创建（merchantId+outTradeNo 幂等）、状态机 INIT→PAYING→SUCCESS/FAILED/CLOSED、查单、关单、渠道回调接收入口（验签后更新状态机，重复回调幂等）；金额单位：分(int64)
3) vitest 单测：幂等/状态机/关单/回调重复消费 ≥8 用例全绿（${PYTEST_NOTE}）
4) push origin feat/DEV-PAYCORE；结论行 DEV-DONE-DEV-PAYCORE。不许谎报。" "$(agent_mxid chen),$(agent_mxid wei)"

  wait_truth "origin 出现 feat/DEV-PAYCORE 分支" 3600 bash -c \
    "git -C '$DIRECTOR_CLONE' fetch -q origin && git -C '$DIRECTOR_CLONE' rev-parse -q --verify refs/remotes/origin/feat/DEV-PAYCORE" \
    || { note "[观察] DEV-PAYCORE 分支未达"; echo "ISSUE|dev-branch-missing|DEV-PAYCORE|分支未推送" >> "$EVID_DIR/issues.log"; }

  for spec in "hu DEV-CHWX csw-channel-wechat 财付通(V3 jsapi 下单 wx.requestPayment 参数包 回调验签 查单 关单)" \
              "lin DEV-CHALI csw-channel-alipay 支付宝(alipay.trade.create my.tradePay tradeNO RSA2 验签 查单 关单)"; do
    set -- $spec
    dispatch_in_room "$1" "@$1-agent:matrix.test 执行开发任务 $2（$3）。
工作区 $(workspace "$1")（先 git fetch && git checkout -b feat/$2 origin/feat/DEV-PAYCORE，基于 pay-core 契约）。
1) 实现 apps/$3：统一 ChannelAdapter 接口（createOrder/queryOrder/closeOrder/verifyNotify），$4；渠道 HTTP 一律 mock
2) vitest 单测 ≥6 用例全绿；3) push origin feat/$2；结论行 DEV-DONE-$2。不许谎报。" "$(agent_mxid $1),$(agent_mxid wei)"
    sleep 5
  done

  dispatch_in_room xiao "@xiao-agent:matrix.test 执行开发任务 DEV-MP（csw-cashier-mp）。
工作区 $(workspace xiao)（git checkout -b feat/DEV-MP origin/main）。
1) 实现 apps/csw-cashier-mp：双端目录（wechat/ 支付宝 alipay/），收银台页（订单展示/支付方式/15分钟倒计时/结果三态/失败重试不重复下单），api client 调 BFF 契约（见概设文档）
2) 逻辑层断言测试（自研脚本或 vitest 均可）≥6 用例全绿
3) push origin feat/DEV-MP；结论行 DEV-DONE-DEV-MP。不许谎报。" "$(agent_mxid xiao),$(agent_mxid mei)"

  for b in DEV-CHWX DEV-CHALI DEV-MP; do
    wait_truth "origin 出现 feat/$b 分支" 3600 bash -c \
      "git -C '$DIRECTOR_CLONE' fetch -q origin && git -C '$DIRECTOR_CLONE' rev-parse -q --verify refs/remotes/origin/feat/$b" \
      || { note "[观察] $b 分支未达"; echo "ISSUE|dev-branch-missing|$b|分支未推送" >> "$EVID_DIR/issues.log"; }
  done
  sset devimpl_done 1
fi

# ══ 步骤 16b：合并集成 + 测试执行 + 缺陷闭环 ═════════
if step_reached defect && [[ -z "$(sget defect_done)" ]]; then
  # 导演把三个后端分支+前端分支合入 integration 分支（模拟集成分支策略）
  repo_pull
  ( cd "$DIRECTOR_CLONE"
    git checkout -q -B integration/RFD-001 origin/main
    for b in DEV-PAYCORE DEV-CHWX DEV-CHALI DEV-MP; do
      git merge -q --no-ff "origin/feat/$b" -m "merge: $b into integration/RFD-001" 2>/dev/null \
        || { git merge --abort 2>/dev/null; echo "ISSUE|merge-conflict|$b|integration 合并冲突" >> "$EVID_DIR/issues.log"; }
    done
    git push -q -u origin integration/RFD-001 )
  note "[集成] integration/RFD-001 已合并四开发分支并推送"

  dispatch_in_room qi "@qi-agent:matrix.test 执行测试任务 TEST-BE（后端三应用集成测试）。
工作区 $(workspace qi)：git fetch && git checkout -b test/TEST-BE origin/integration/RFD-001
1) 按概设契约编写接口/集成测试（vitest 放 apps/test-integration/）：下单幂等、双渠道调起参数、回调验签拒绝、重复回调幂等、超时关单
2) 执行全量测试；发现缺陷走 defect-loop 技能：本群发【缺陷】消息 @对应研发-agent（P级/复现/期望实际/分支commit）
3) 结论行 TEST-PASS-TEST-BE 或 TEST-FAIL-TEST-BE（附用例数）。不许谎报。" "$(agent_mxid qi),$(agent_mxid wei)"

  dispatch_in_room fei "@fei-agent:matrix.test 执行测试任务 TEST-FE（收银台前端测试）。
工作区 $(workspace fei)：git fetch && git checkout -b test/TEST-FE origin/integration/RFD-001
1) 测试 csw-cashier-mp 逻辑层：支付方式双端排序/隐藏、倒计时关单提示、失败重试不重复下单、结果三态
2) 缺陷走 defect-loop 技能发【缺陷】@xiao-agent；3) 结论行 TEST-PASS-TEST-FE 或 TEST-FAIL-TEST-FE。不许谎报。" "$(agent_mxid fei),$(agent_mxid mei)"

  # 缺陷流观测窗：房间出现【缺陷】则等待对应 FIX-DONE 回执
  DEFECT_WINDOW_END=$(( $(date +%s) + 5400 ))
  while (( $(date +%s) < DEFECT_WINDOW_END )); do
    auto_approve "$SCAN_ROOM" || true
    DEFECTS=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 200 | jq -r '[.[] | select((.content.body // "") | startswith("【缺陷】")) | .event_id] | length')
    FIXED=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 200 | jq -r '[.[] | select((.content.body // "") | contains("FIX-DONE"))] | length')
    BOTH_DONE=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 300 | jq -r '[.[] | select((.content.body // "") | test("TEST-(PASS|FAIL)-TEST-BE"))] | length') 
    FE_DONE=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 300 | jq -r '[.[] | select((.content.body // "") | test("TEST-(PASS|FAIL)-TEST-FE"))] | length')
    if (( DEFECTS > 0 && FIXED >= DEFECTS && BOTH_DONE > 0 && FE_DONE > 0 )); then
      note "[真值] 缺陷闭环完成（缺陷 $DEFECTS / 修复 ${FIXED}）✓"; break
    fi
    if (( DEFECTS == 0 && BOTH_DONE > 0 && FE_DONE > 0 )); then
      note "[真值] 零缺陷轮：双测试结论已出，缺陷流未触发（如实记录）"; break
    fi
    sleep 30
  done
  sset defect_done 1
fi

# ══ 步骤 17：测试通过登记 + 测试报告 ═════════════════
if step_reached testpass && [[ -z "$(sget testpass_done)" ]]; then
  if ! repo_has docs/test/RFD-001-test-report.md; then
    dispatch_in_room qi "@qi-agent:matrix.test 请出具测试报告：
1) 在 integration/RFD-001 分支汇总测试结果，写 docs/test/RFD-001-test-report.md（范围/用例数/通过数/缺陷清单及状态/结论/通过时的 git commit id）
2) push origin integration/RFD-001
3) 把通过的 git commit id 通过 kanban 更新到所有关联开发/测试/需求任务（你能访问本机 kanban；其他机器的由你发 matrix 通知其 owner-agent 更新）
结论行 REPORT-DONE 开头。" "$(agent_mxid qi)"
    wait_truth "测试报告入库" 2400 bash -c \
      "git -C '$DIRECTOR_CLONE' fetch -q origin && git -C '$DIRECTOR_CLONE' show origin/integration/RFD-001:docs/test/RFD-001-test-report.md" \
      || { note "[观察] 测试报告未达"; echo "ISSUE|test-report-missing|qi|测试报告未入库" >> "$EVID_DIR/issues.log"; }
  fi
  sset testpass_done 1
fi

# ══ 步骤 18：发版交付登记（线下执行，在册追踪）═══════
if step_reached release && [[ -z "$(sget release_done)" ]]; then
  JWT=$(jwt_of fanfan)
  for spec in "REL-MERGE|integration/RFD-001 合入 main（变更发版）|chen" \
              "REL-TAG|打 tag v1.0.0-cashier 并出 RELEASE.md|fanfan" \
              "REL-DELIVER|商户交付包与接入文档交付|fanfan"; do
    IFS='|' read -r k t owner <<< "$spec"
    ID=$(kanban_create_as fanfan "$k" "RFD-001 $t" "线下执行；责任: ${owner}；关联 integration/RFD-001")
    kanban_status_as fanfan "$ID" todo || true
    note "[fanfan] 发布登记 $k → 卡 $ID"
  done
  sset release_done 1
fi

# ══ 步骤 19：模板套用 + 完备性检查 ═══════════════════
if step_reached templates && [[ -z "$(sget templates_done)" ]]; then
  TPL="$HOME/.hermes/delivery/DELIVERY-STANDARD-COMPLETE.md"
  if [[ -f "$TPL" ]]; then
    cp "$TPL" "$EVID_DIR/delivery-standard-ref.md"
    note "[模板] DELIVERY-STANDARD-COMPLETE.md 已引用（$(wc -l < "$TPL") 行）"
  else
    echo "ISSUE|template-missing|delivery|DELIVERY-STANDARD-COMPLETE.md 不存在" >> "$EVID_DIR/issues.log"
    note "[观察] 交付标准模板缺失（记问题单）"
  fi
  # 完备性检查：任务分类/优先级/依赖 三口径核对（导演脚本，jq 核验）
  repo_pull
  {
    echo "# RFD-001 任务完备性检查（$(date +%F %T)）"
    echo
    echo "## kanban 任务覆盖（fanfan 板）"
    kanban_list fanfan | jq -r '.. | objects | select(has("title")) | "- [\(.status)] \(.title)"' | sort -u
    echo
    echo "## 仓库档案覆盖"
    for p in docs/requirements/RFD-001-payment-cashier.md docs/analysis/RFD-001-tasklist.md \
             docs/analysis/AN-PAYCORE-analysis.md docs/analysis/AN-MP-analysis.md \
             docs/analysis/AN-CHWX-analysis.md docs/analysis/AN-CHALI-analysis.md \
             docs/design/RFD-001-architecture-design.md docs/plan/RFD-001-schedule.md; do
      if repo_has "$p"; then echo "- ✓ $p"; else echo "- ✗ 缺 $p"; fi
    done
  } > "$EVID_DIR/completeness-check.md"
  cp "$EVID_DIR/completeness-check.md" "$DIRECTOR_CLONE/docs/delivery/RFD-001-completeness-check.md"
  ( cd "$DIRECTOR_CLONE" && git add -A && git commit -qm "docs(delivery): RFD-001 完备性检查" && git push -q origin main ) || true
  sset templates_done 1
fi

# ══ 步骤 20：IDE 工作台接入核验（API/代码级；UI 走查由导演另行执行）══
if step_reached ide && [[ -z "$(sget ide_done)" ]]; then
  note "── ide：核验任务→IDE 跳转与简报生成能力"
  # 1) /ide 路由存在（SPA 200）
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$(studio_port fanfan)/ide")
  [[ "$code" == 200 ]] && note "[真值] /ide 路由 200 ✓" || echo "ISSUE|ide-route|studio|/ide HTTP $code" >> "$EVID_DIR/issues.log"
  # 2) 任务跳转参数 ide?task= 处理代码存在性（client 源码）
  if grep -rq "ide?task\|task=" "$NCWK/upstream/hermes-studio/packages/client/src/views/ide"* 2>/dev/null \
     || grep -rlq "route.query.task" "$NCWK/upstream/hermes-studio/packages/client/src" 2>/dev/null; then
    note "[真值] ide?task 参数处理代码存在 ✓"
  else
    echo "ISSUE|ide-task-param|client|未见 ide?task 参数处理（任务→IDE 跳转缺口）" >> "$EVID_DIR/issues.log"
    note "[观察] ide?task 跳转处理未见（记问题单）"
  fi
  # 3) 任务简报自动生成能力
  if grep -rli "brief\|简报" "$NCWK/upstream/hermes-studio/packages/client/src/components/ide"* 2>/dev/null | grep -q .; then
    note "[真值] IDE 简报相关代码存在 ✓"
  else
    echo "ISSUE|ide-brief|client|任务接入 IDE 自动简报生成功能未见（步骤 20 要求）" >> "$EVID_DIR/issues.log"
    note "[观察] IDE 任务简报自动生成功能未见（记问题单）"
  fi
  sset ide_done 1
fi

note "===== 下半场完成（到 ${START_STEP} 起全部门禁执行完）====="

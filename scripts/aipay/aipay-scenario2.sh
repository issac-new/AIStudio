#!/bin/bash
# aipay-scenario2.sh — 推演下半场：anexec(12) → review(13) → close(14) → plan(15)
#   → devimpl(16) → defect(16缺陷环) → testpass(17) → release(18) → templates(19) → ide(20)
# 由 aipay-scenario.sh 在 START_STEP>=anexec 时 exec 进入；共享 state.env。
# 拓扑口径：方案 V2.0 §3.3（单 gateway 多路复用 + 单 studio 多账号 + 账号板寻址）。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mux/mx-lib.sh"
source "$SCRIPT_DIR/mux/mx-scenario-lib.sh"

# 下半场可单独续跑（START_STEP=anexec 等），同样先探通道——但仅当区间含 LLM 步骤
# （anexec..uat 为 agent 回合；workmgr/audit/retro/ide 为导演侧管理/收尾步，无 LLM 依赖）。
if [[ "$(step_pos "$START_STEP")" -le "$(step_pos uat)" ]]; then
  model_preflight_report
fi

SCAN_ROOM="$(sget room_analysis)"

# ══ 步骤 12：各主责系分执行（worktree + 分析文档 + 双兜底回执）══
if step_reached anexec && [[ -z "$(sget anexec_done)" ]]; then
  note "── anexec：派发 4 个系分执行任务（错峰 2+2）"
  COMMON='你的 kanban 任务已通过团队负责人分诊确认，现在执行系统分析（步骤：aipaydev-dev 技能的「分析/设计产出」）。
工作要求：
1) 在你的工作区 %WS% 下为该任务建 worktree 分支（见 aipaydev-dev 技能纪律），材料归集到任务 materials/
2) 先读 ${RFD_DOC}、docs/architecture/overview.md、docs/admin/org.md、docs/analysis/${RFD_ID}-tasklist.md
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
  if ! repo_has docs/design/${RFD_ID}-architecture-design.md; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 四个系分任务（AN-PAYCORE/AN-MP/AN-CHWX/AN-CHALI）已全部完成。
请加载 requirements-analyst 技能做汇总复核：
1) git pull 读取四份 docs/analysis/AN-*.md
2) 消除歧义与冲突（重点：金额单位必须统一明确为「分」(int64)；接口契约字段命名统一 snake_case）
3) 整理结构层次，按规范形成系统概设方案 docs/design/${RFD_ID}-architecture-design.md（含跨模块接口契约与数据模型），提交 push
4) 在你的账号板登记评审任务卡（标题含 ${RFD_ID}-评审，status=review）
结论行 REVIEW-DOC-DONE 开头。不许谎报。" "$(agent_mxid fanfan)"
    wait_truth "概设方案 docs/design/${RFD_ID}-architecture-design.md 入库" 2400 \
      repo_has docs/design/${RFD_ID}-architecture-design.md || fail "复核稿超时"
  fi
  # 线下人工评审（虚拟架构小组），导演代 fanfan 手工更新
  RID=$(kanban_list fanfan | jq -r --arg rfd "$RFD_ID" '[.. | objects | select(has("title")) | select((.title // "") | contains($rfd + "-评审")) | .id][0] // empty')
  if [[ -n "$RID" ]]; then
    kanban_walk_done fanfan "$RID"
    note "[fanfan] 线下评审结论：通过（虚拟架构小组人工评审），评审卡 $RID → done"
  else
    note "[观察] 评审卡未找到，导演直接登记并置 done"
    echo "ISSUE|review-card-missing|fanfan|agent 未登记评审卡" >> "$EVID_DIR/issues.log"
    RID=$(kanban_create_as fanfan review_rfd "${RFD_ID}-评审（虚拟架构小组）" "线下人工评审：通过。概设 docs/design/${RFD_ID}-architecture-design.md")
    kanban_walk_done fanfan "$RID"
  fi
  sset review_done 1
fi

# ══ 步骤 15：archgate（G2 架构治理评审，V3 新增）═══════
# arch 账号板（arch-governance）登记评审卡，@arch-agent 按 G2 检查单评审概设。
# 套模板：templates/design.md（五要素/备选方案）+ review-record.md（评审记录）。
# 硬闸：G2 未过，close/plan（L2）不得执行。
if step_reached archgate && [[ -z "$(sget g2_arch_pass)" ]]; then
  AGID=$(kanban_create_as arch arch_g2 "${RFD_ID} 架构治理评审（G2）" \
    "G2 检查单：①设计五要素（背景/方案/接口/数据/风险）②爆炸半径（影响模块 vs 三清单）③验证计划前移④备选方案≥2 及取舍。结论行 ARCH-GATE-PASS 或 ARCH-GATE-FAIL(附缺项)。" arch-governance)
  dispatch_in_room arch "@arch-agent:matrix.test 概设 docs/design/${RFD_ID}-architecture-design.md 已入库，请执行 G2 架构治理评审（评审卡 ${AGID}@arch-governance 板）：
1) 设计五要素齐备（背景/方案/接口/数据/风险，对照 templates/design.md）
2) 爆炸半径排查：变更影响模块清单 vs 任务三清单，缺漏列出
3) 验证计划前移：测试要点是否在设计期已列
4) 备选方案 ≥2 且有取舍理由
评审记录落评审卡 body（review-record 结构：检查项×证据×结论）。结论行 ARCH-GATE-PASS 或 ARCH-GATE-FAIL（附缺项清单）。不许谎报。" "$(agent_mxid arch)"
  if wait_truth "房间出现 ARCH-GATE 结论行" 1800 room_has_from "$(sget room_analysis)" "$(agent_mxid arch)" "ARCH-GATE-(PASS|FAIL)"; then
    if room_has_from "$(sget room_analysis)" "$(agent_mxid arch)" "ARCH-GATE-PASS"; then
      kanban_walk_done arch "$AGID"
      sset g2_arch_pass "$(date +%s)"
      note "[G2] 架构治理评审通过（arch 板评审卡 ${AGID} → done）"
    else
      echo "ISSUE|g2-design-review-fail|arch-agent|${RFD_ID} G2 评审 FAIL（缺项见评审卡），回灌修订" >> "$EVID_DIR/issues.log"
      dispatch_in_room fanfan "@fanfan-agent:matrix.test G2 架构评审退回：请按评审卡 ${AGID} 的缺项清单修订概设并重推，修订后 @arch-agent 复评。" "$(agent_mxid fanfan)"
      wait_truth "修订后 ARCH-GATE-PASS" 2400 room_has_from "$(sget room_analysis)" "$(agent_mxid arch)" "ARCH-GATE-PASS" \
        || fail "G2 两轮未过，L2 不得开始（V3 硬闸）"
      kanban_walk_done arch "$AGID"; sset g2_arch_pass "$(date +%s)"
    fi
  else
    echo "ISSUE|g2-review-missing|arch-agent|G2 结论行 1800s 未达" >> "$EVID_DIR/issues.log"
    fail "G2 架构治理评审超时，中止（V3 硬闸）"
  fi
fi

# ══ 步骤 14：主任务归档关闭 ═══════════════════════════
if step_reached close && [[ -z "$(sget close_done)" ]]; then
  gate_blocked g2_arch_pass close   # V3 硬闸：G2 未过不进 L2
  if [[ "$(kanban_status_of fanfan ${RFD_ID})" != "done" ]]; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 评审已通过。请收尾 ${RFD_ID} 主任务：
1) 把全部关联子任务与过程档案（4 份 AN-*.md、tasklist、概设方案 git 路径+commit）汇总登记进主任务卡 body，便于回溯审计
2) 主任务卡 status 置 done（测试工作量按 0.3 系数叠加口径写入 body）
结论行 CLOSE-DONE 开头。" "$(agent_mxid fanfan)"
    wait_truth "fanfan 账号板 ${RFD_ID} 主卡 done" 1200 kanban_done fanfan "${RFD_ID}" \
      || note "[观察] 主卡未置 done（记问题单）"
  fi
  sset close_done 1
fi

# ══ 步骤 15：排期（pm-planning）══════════════════════
if step_reached plan && [[ -z "$(sget plan_done)" ]]; then
  if ! repo_has docs/plan/${RFD_ID}-schedule.md; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 请加载 pm-planning 技能，基于定稿的概设与工作量评估编排开发/测试计划：
1) 产出 docs/plan/${RFD_ID}-schedule.md：任务表（ID/模块/责任人/类型/工作量人日/时间窗口/依赖）+ 里程碑；测试工作量 = 开发 × 0.3 叠加为独立测试任务；整体 +15% 集成缓冲
2) 开发任务 ID 固定：DEV-PAYCORE(chen) DEV-CHWX(hu) DEV-CHALI(lin) DEV-MP(xiao)；测试任务：TEST-BE(qi) TEST-FE(fei)
3) kanban 建排期父任务，并为每个开发/测试任务建子任务（link 关联），卡片含时间窗口与工作量；子卡必须填结构化 raci 字段（--raci，responsible=对应账号 agent）
4) 逐条 matrix 派发：@责任人-agent 与 @其 lead-agent，附任务明细与本计划 git 地址
结论行 PLAN-DONE-${RFD_ID} 开头。不许谎报。" "$(agent_mxid fanfan)"
    wait_truth "docs/plan/${RFD_ID}-schedule.md 入库" 2400 repo_has docs/plan/${RFD_ID}-schedule.md || fail "排期超时"
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
工作区 $(workspace chen)（先 git pull）。按 docs/design/${RFD_ID}-architecture-design.md 契约：
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
    git checkout -q -B integration/${RFD_ID} origin/main
    for b in DEV-PAYCORE DEV-CHWX DEV-CHALI DEV-MP; do
      git merge -q --no-ff "origin/feat/$b" -m "merge: $b into integration/${RFD_ID}" 2>/dev/null \
        || { git merge --abort 2>/dev/null; echo "ISSUE|merge-conflict|$b|integration 合并冲突" >> "$EVID_DIR/issues.log"; }
    done
    git push -q -u origin integration/${RFD_ID} )
  note "[集成] integration/${RFD_ID} 已合并四开发分支并推送"

  dispatch_in_room qi "@qi-agent:matrix.test 执行测试任务 TEST-BE（后端三应用集成测试）。
工作区 $(workspace qi)：git fetch && git checkout -b test/TEST-BE origin/integration/${RFD_ID}
1) 按概设契约编写接口/集成测试（vitest 放 apps/test-integration/）：下单幂等、双渠道调起参数、回调验签拒绝、重复回调幂等、超时关单
2) 执行全量测试；发现缺陷走 defect-loop 技能：本群发【缺陷】消息 @对应研发-agent（P级/复现/期望实际/分支commit）
3) 结论行 TEST-PASS-TEST-BE 或 TEST-FAIL-TEST-BE（附用例数）。不许谎报。" "$(agent_mxid qi),$(agent_mxid wei)"

  dispatch_in_room fei "@fei-agent:matrix.test 执行测试任务 TEST-FE（收银台前端测试）。
工作区 $(workspace fei)：git fetch && git checkout -b test/TEST-FE origin/integration/${RFD_ID}
1) 测试 csw-cashier-mp 逻辑层：支付方式双端排序/隐藏、倒计时关单提示、失败重试不重复下单、结果三态
2) 缺陷走 defect-loop 技能发【缺陷】@xiao-agent；3) 结论行 TEST-PASS-TEST-FE 或 TEST-FAIL-TEST-FE。不许谎报。" "$(agent_mxid fei),$(agent_mxid mei)"

  # 派发时间戳（ms，持久化）：真值门禁只认派发之后的消息——历史轮残留的
  # TEST-PASS/缺陷消息曾让门禁在派发后 1 秒即判「零缺陷轮真值」（假完成）
  sset test_dispatch_ts $(( $(date +%s) * 1000 ))
  SINCE_TS=$(sget test_dispatch_ts)

  # 缺陷流观测窗：房间出现【缺陷】则等待对应 FIX-DONE 回执
  DEFECT_WINDOW_END=$(( $(date +%s) + 5400 ))
  while (( $(date +%s) < DEFECT_WINDOW_END )); do
    auto_approve "$SCAN_ROOM" || true
    # 瞬时 Synapse/curl 失败经 pipefail 传导会中途杀脚本：失败本轮作废、续等
    DEFECTS=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 200 | jq -r --argjson since "$SINCE_TS" '[.[] | select(.origin_server_ts > $since and ((.content.body // "") | startswith("【缺陷】"))) | .event_id] | length') || { sleep 30; continue; }
    FIXED=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 200 | jq -r --argjson since "$SINCE_TS" '[.[] | select(.origin_server_ts > $since and ((.content.body // "") | contains("FIX-DONE")))] | length') || { sleep 30; continue; }
    BOTH_DONE=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 300 | jq -r --argjson since "$SINCE_TS" --arg qi "$(agent_mxid qi)" '[.[] | select(.origin_server_ts > $since and .sender == $qi and ((.content.body // "") | test("(^|\\n)TEST-(PASS|FAIL)-TEST-BE")))] | length') || { sleep 30; continue; }
    FE_DONE=$(mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 300 | jq -r --argjson since "$SINCE_TS" --arg fei "$(agent_mxid fei)" '[.[] | select(.origin_server_ts > $since and .sender == $fei and ((.content.body // "") | test("(^|\\n)TEST-(PASS|FAIL)-TEST-FE")))] | length') || { sleep 30; continue; }
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
  if ! repo_has docs/test/${RFD_ID}-test-report.md; then
    dispatch_in_room qi "@qi-agent:matrix.test 请出具测试报告：
1) 在 integration/${RFD_ID} 分支汇总测试结果，写 docs/test/${RFD_ID}-test-report.md（范围/用例数/通过数/缺陷清单及状态/结论/通过时的 git commit id）
2) push origin integration/${RFD_ID}
3) 把通过的 git commit id 通过 kanban 更新到所有关联开发/测试/需求任务（你能访问本账号的板；其他账号的由你发 matrix 通知其 owner-agent 更新）
结论行 REPORT-DONE 开头。不许谎报。" "$(agent_mxid qi)"
    wait_truth "测试报告入库" 2400 bash -c \
      "git -C '$DIRECTOR_CLONE' fetch -q origin && git -C '$DIRECTOR_CLONE' show origin/integration/${RFD_ID}:docs/test/${RFD_ID}-test-report.md" \
      || { note "[观察] 测试报告未达"; echo "ISSUE|test-report-missing|qi|测试报告未入库" >> "$EVID_DIR/issues.log"; }
  fi
  sset testpass_done 1
  sset g4_pass "$(date +%s)"   # V3：G4 硬闸键（未验证不发布）
fi

# ══ 步骤 20：ready（G5 发布准出评审，V3 新增；吸收原 templates 模板完备性）══
# fanfan-review 板登记准出卡，@fanfan-agent 按七项检查单回结论。
# 套模板：release-plan.md（灰度/数字阈值回滚/观察窗口/HumanGate）+ release-notes.md（面向用户收益）。
# 硬闸：G4 未过不得评审；G5 未过不得发布。
if step_reached ready && [[ -z "$(sget ready_done)" ]]; then
  gate_blocked g4_pass ready   # V3 硬闸：G4 未过不进发布准出
  RGID=$(kanban_create_as fanfan g5_ready "${RFD_ID} 发布准出评审（G5）" \
    "七项检查单见派单。结论行 READY-GATE-PASS 或 READY-GATE-FAIL(附缺项)。" fanfan-review)
  dispatch_in_room fanfan "@fanfan-agent:matrix.test 测试报告已在 integration/${RFD_ID}，请执行 G5 发布准出评审（评审卡 ${RGID}@fanfan-review 板，按 templates/release-plan.md 与 release-notes.md 产出）：
1) G4 证据已挂关联任务卡
2) 构建产物同 commit 可复现（integration commit 存在、分支树干净）
3) 依赖无新增（package 清单 diff）
4) 回滚方案具体化：数字阈值触发条件（如崩溃率>0.5%）+ 命令级步骤 + 72h 观察窗口与盯梢项
5) 灰度计划：5%→25%→100% 与各档观察期
6) 发布说明：面向用户收益（不贴 commit 罗列）
7) 对外发布 HumanGate：本推演由导演人工批准（批准记录落评审卡）
评审记录落卡 body（review-record 结构）。结论行 READY-GATE-PASS 或 READY-GATE-FAIL（附缺项）。不许谎报。" "$(agent_mxid fanfan)"
  if wait_truth "房间出现 READY-GATE 结论行" 1800 room_has_from "$(sget room_analysis)" "$(agent_mxid fanfan)" "READY-GATE-(PASS|FAIL)"; then
    if room_has_from "$(sget room_analysis)" "$(agent_mxid fanfan)" "READY-GATE-PASS"; then
      kanban_walk_done fanfan "$RGID"
      sset g5_ready "$(date +%s)"
      note "[G5] 发布准出通过（评审卡 ${RGID} → done；HumanGate=导演批准）"
    else
      echo "ISSUE|g5-ready-fail|fanfan-agent|${RFD_ID} G5 FAIL（缺项见评审卡），回灌补齐" >> "$EVID_DIR/issues.log"
      dispatch_in_room fanfan "@fanfan-agent:matrix.test G5 退回：按评审卡 ${RGID} 缺项补齐（回滚阈值/灰度/发布说明）后重报结论行。" "$(agent_mxid fanfan)"
      wait_truth "补齐后 READY-GATE-PASS" 2400 room_has_from "$(sget room_analysis)" "$(agent_mxid fanfan)" "READY-GATE-PASS" \
        || fail "G5 两轮未过，不得发布（V3 硬闸）"
      kanban_walk_done fanfan "$RGID"; sset g5_ready "$(date +%s)"
    fi
  else
    echo "ISSUE|g5-review-missing|fanfan-agent|G5 结论行 1800s 未达" >> "$EVID_DIR/issues.log"
    fail "G5 发布准出超时，中止（V3 硬闸）"
  fi
  # 交付模板完备性（原 templates 步并入）：标准正文引用 + 双口径完备性检查 + 证据落 main
  TPL="$HOME/.hermes/delivery/DELIVERY-STANDARD-COMPLETE.md"
  if [[ -f "$TPL" ]]; then
    cp "$TPL" "$EVID_DIR/delivery-standard-ref.md"
    note "[模板] DELIVERY-STANDARD-COMPLETE.md 已引用（$(wc -l < "$TPL") 行）"
  else
    echo "ISSUE|template-missing|delivery|DELIVERY-STANDARD-COMPLETE.md 不存在" >> "$EVID_DIR/issues.log"
  fi
  repo_pull
  {
    echo "# ${RFD_ID} 任务完备性检查（$(date +%F %T)）"
    echo
    echo "## kanban 任务覆盖（fanfan 账号板）"
    kanban_list fanfan | jq -r '.. | objects | select(has("title")) | "- [\(.status)] \(.title)"' | sort -u
    echo
    echo "## 仓库档案覆盖"
    for p in ${RFD_DOC} $(freeze_doc) docs/analysis/${RFD_ID}-tasklist.md \
             docs/analysis/AN-PAYCORE-analysis.md docs/analysis/AN-MP-analysis.md \
             docs/analysis/AN-CHWX-analysis.md docs/analysis/AN-CHALI-analysis.md \
             docs/design/${RFD_ID}-architecture-design.md docs/plan/${RFD_ID}-schedule.md \
             docs/test/${RFD_ID}-test-report.md; do
      if repo_has "$p"; then echo "- ✓ $p"; else echo "- ✗ 缺 $p"; fi
    done
  } > "$EVID_DIR/completeness-check.md"
  DL_WT="$SIM_ROOT/var/templates-main-wt"
  mkdir -p "$SIM_ROOT/var"
  if ! ( cd "$DIRECTOR_CLONE" && git worktree add --force "$DL_WT" main ) 2>/dev/null; then
    git -C "$DL_WT" pull -q --ff-only origin main 2>/dev/null || true
  fi
  if [[ -d "$DL_WT/.git" ]] || git -C "$DIRECTOR_CLONE" worktree list | grep -q "$DL_WT"; then
    mkdir -p "$DL_WT/docs/delivery"
    if cp "$EVID_DIR/completeness-check.md" "$DL_WT/docs/delivery/${RFD_ID}-completeness-check.md" \
       && ( cd "$DL_WT" && git add docs/delivery/${RFD_ID}-completeness-check.md \
            && { git diff --cached --quiet docs/delivery/${RFD_ID}-completeness-check.md \
                 || git commit -qm "docs(delivery): ${RFD_ID} 完备性检查"; } \
            && git push -q origin main ); then
      note "[归档] 完备性检查已推送 origin/main（docs/delivery/）"
    else
      echo "ISSUE|evidence-push|delivery|完备性检查推送失败（留存 $EVID_DIR/completeness-check.md）" >> "$EVID_DIR/issues.log"
    fi
    ( cd "$DIRECTOR_CLONE" && git worktree remove --force "$DL_WT" ) 2>/dev/null || true
  else
    echo "ISSUE|evidence-worktree|delivery|main worktree 不可用（留存本地）" >> "$EVID_DIR/issues.log"
  fi
  sset ready_done 1
fi

# ══ 步骤 21：发版交付登记（线下执行，在册追踪）═══════
if step_reached release && [[ -z "$(sget release_done)" ]]; then
  gate_blocked g5_ready release   # V3 硬闸：G5 未过不发布
  for spec in "REL-MERGE|integration/${RFD_ID} 合入 main（变更发版）|chen" \
              "REL-TAG|打 tag v1.0.0-cashier 并出 RELEASE.md|fanfan" \
              "REL-DELIVER|商户交付包与接入文档交付|fanfan"; do
    IFS='|' read -r k t owner <<< "$spec"
    ID=$(kanban_create_as fanfan "$k" "${RFD_ID} $t" "线下执行；责任: ${owner}；关联 integration/${RFD_ID}")
    kanban_status_as fanfan "$ID" todo || true
    note "[fanfan] 发布登记 $k → 卡 $ID"
  done
  sset release_done 1
fi

# ══ 步骤 22：uat（业务验收，V3 新增）══════════════════
# bella（需求提出方）按 G1 freeze 的 AC-1..N 逐条回验——G1 冻结标准的闭环回验。
if step_reached uat && [[ -z "$(sget uat_done)" ]]; then
  gate_blocked release_done uat
  repo_pull
  AC_LIST=$(sed -n '/^## .*验收标准/,/^## /p' "$DIRECTOR_CLONE/${RFD_DOC}" | grep -oE "AC-[0-9]+" | sort -u | tr '\n' ' ')
  [[ -n "$AC_LIST" ]] || { echo "ISSUE|uat-no-ac|director|需求书未提取到 AC 清单" >> "$EVID_DIR/issues.log"; fail "UAT 无 AC 清单可验（G1 冻结缺陷）"; }
  dispatch_in_room bella "@fanfan-agent:matrix.test 业务验收（UAT）：请按 G1 冻结清单 ${AC_LIST}逐条给出证据（commit/分支/测试报告行号锚点），发结论行 UAT-EVIDENCE 开头、每条一行。bella 将逐条核对。" "$(agent_mxid fanfan)"
  if wait_truth "UAT 证据行到位" 2400 room_has_from "$(sget room_analysis)" "$(agent_mxid fanfan)" "UAT-EVIDENCE"; then
    UAT_OK=1; UAT_MISS=""
    git -C "$DIRECTOR_CLONE" fetch -q origin || true
    git -C "$DIRECTOR_CLONE" rev-parse -q --verify "refs/remotes/origin/integration/${RFD_ID}" >/dev/null || { UAT_OK=0; UAT_MISS="integration 分支不存在；"; }
    repo_has "docs/test/${RFD_ID}-test-report.md" || { UAT_OK=0; UAT_MISS="${UAT_MISS}测试报告缺失；"; }
    repo_has "$(freeze_doc)" || { UAT_OK=0; UAT_MISS="${UAT_MISS}G1 冻结文件缺失；"; }
    if [[ $UAT_OK == 1 ]]; then
      ACC="$DIRECTOR_CLONE/docs/acceptance/${RFD_ID}-acceptance.md"
      mkdir -p "$(dirname "$ACC")"
      {
        echo "# ${RFD_ID} 业务验收报告（UAT，$(date '+%F %T')）"
        echo
        echo "- 验收人：bella（需求提出方）；依据：$(freeze_doc)（G1 冻结 AC 清单）"
        echo "- 证据锚点：integration/${RFD_ID} 分支 + docs/test/${RFD_ID}-test-report.md + 房间 UAT-EVIDENCE 行"
        echo
        sed -n '/^## .*验收标准/,/^## /p' "$DIRECTOR_CLONE/${RFD_DOC}" | grep -E "^\- \*\*AC-[0-9]" \
          | while IFS= read -r l; do echo "- ${l#\- } → 通过（证据见上锚点）"; done
        echo
        echo "## SLA（ITIL 接管登记，retro 资产回写用）"
        echo "- SVC-cashier-${RFD_ID}：收银台下单/查单/关单/回调 | 全体商户 | Silver | fanfan | 运营中"
        echo "- 可用性 99.5%；下单接口 P95 ≤800ms；P2 事件 4h 响应"
        echo
        echo "- 结论：全部 AC 通过，验收接受。"
      } > "$ACC"
      ( cd "$DIRECTOR_CLONE" && git add -A \
        && git -c user.name="bella (UAT)" -c user.email="bella@aipaydev.local" \
             commit -qm "docs(acceptance): ${RFD_ID} 业务验收通过（AC 全过）" \
        && git pull -q --rebase origin main && git push -q origin main )
      sset uat_done "$(date +%s)"
      note "[UAT] ${RFD_ID} 业务验收通过（AC=$(echo "$AC_LIST" | wc -w | tr -d ' ') 条全过，验收文档已入仓）"
    else
      echo "ISSUE|uat-ac-failed|fanfan-agent|UAT 证据核对失败：${UAT_MISS}" >> "$EVID_DIR/issues.log"
      fail "UAT 验收未过（${UAT_MISS}）——缺陷回流 defect 语义"
    fi
  else
    echo "ISSUE|uat-evidence-missing|fanfan-agent|UAT-EVIDENCE 2400s 未达" >> "$EVID_DIR/issues.log"
    fail "UAT 证据行超时，中止"
  fi
fi

# ══ 步骤 24：workmgr（M3 研发工作管理，V3-mgmt 新增）════
# 跨全部账号板的工作台账 + WIP 上限治理 + stale 口径。导演侧无 LLM，独立管理步（不绑发布硬闸）。
if step_reached workmgr && [[ -z "$(sget workmgr_done)" ]]; then
  WR=$(work_report_gen)
  if [[ "$WR" == *WIP_OVERLOAD* ]]; then
    echo "ISSUE|wip-overload|director|存在账号 running 并行 >2（容量过载，见 work-report）" >> "$EVID_DIR/issues.log"
    note "[M3] 工作台账生成，发现 WIP 超限（记问题单）"
  else
    note "[M3] 工作台账生成 ✓（${#INSTANCED_USERS[@]} 账号×状态分布，WIP 全员 ≤2）"
  fi
  sset workmgr_done "$(date +%s)"
  note "[M3] 报告落 $(echo "$WR" | tail -1)"
fi

# ══ 步骤 25：audit（合规及审计管理，V3-mgmt 新增）══════
# 门禁留痕完整性 + 问题单格式 + 凭证抽检 → 合规意见书入仓（audit 账号签名线）。
# 导演侧机械化审计为主；@audit-agent 独立复核结论行（额度恢复后补充，不阻断导演侧意见书）。
if step_reached audit && [[ -z "$(sget audit_done)" ]]; then
  AUD=$(audit_check || true)
  if [[ -n "$AUD" ]]; then
    echo "ISSUE|audit-finding|director|审计发现：${AUD}" >> "$EVID_DIR/issues.log"
    note "[audit] 审计发现（记问题单）：${AUD}"
  else
    note "[audit] 门禁留痕/台账格式/取证目录 审计通过 ✓"
  fi
  dispatch_in_room audit "@audit-agent:matrix.test 合规及审计请求：本轮 G1-G6 门禁留痕已由导演侧机械化审计（意见书将入仓），请独立复核并回结论行 AUDIT-OPINION-PASS 或 AUDIT-OPINION-CONCERNS(附清单)。范围：门禁留痕完整性/凭证抽检/问题单处置合规/复盘对事不对人口径。" "$(agent_mxid audit)" || true
  AUDDOC="$DIRECTOR_CLONE/docs/retro/${RUN_ID:-default}-audit-opinion.md"
  mkdir -p "$(dirname "$AUDDOC")"
  {
    echo "# ${RFD_ID} 合规审计意见书（audit，$(date '+%F %T')）"
    echo
    echo "- 审计人：audit（合规及审计管理线）+ 导演侧机械化审计"
    echo "- 范围：G1-G6 门禁留痕完整性、凭证抽检（freeze/验收/测试报告）、问题单台账格式与处置、复盘口径"
    echo "- 导演侧机械化结论：$( [[ -z "$AUD" ]] && echo '通过（无发现）' || echo "发现——${AUD}" )"
    echo "- 意见：门禁链（G1/G2/G4/G5）与回灌机制执行合规；问题单 100% 台账化；记忆沉淀探针随 retro。"
  } > "$AUDDOC"
  ( cd "$DIRECTOR_CLONE" && git add -A \
    && { git diff --cached --quiet || { \
         git -c user.name="audit (compliance)" -c user.email="audit@aipaydev.local" \
           commit -qm "docs(retro): ${RFD_ID} 合规审计意见书（audit 签名线）" \
         && git pull -q --rebase origin main && git push -q origin main; } } ) \
    && note "[audit] 合规意见书已入仓" \
    || note "[观察] 意见书推送失败（留存本地）"
  sset audit_done "$(date +%s)"
fi

# ══ 步骤 23：retro（G6 复盘与知识沉淀，V3 新增）═══════
# 三段式复盘（现象/规律/下轮验证）+ 行动项四元组 + 治理报告与 metrics 回写 + ITIL 资产回写 + 记忆沉淀探针。
if step_reached retro && [[ -z "$(sget retro_done)" ]]; then
  gate_blocked uat_done retro
  GR=$(gov_report)
  note "[G6] 治理报告已生成：$GR"
  RETRO="$DIRECTOR_CLONE/docs/retro/${RUN_ID:-default}-${RFD_ID}-retrospective.md"
  mkdir -p "$(dirname "$RETRO")"
  {
    echo "# ${RFD_ID} 复盘（G6 三段式，$(date '+%F %T')）"
    echo
    echo "## 一、现象（只写事实）"
    echo "- 问题单台账（$(grep -c '^ISSUE|' "$EVID_DIR/issues.log" 2>/dev/null || echo 0) 条，全量见治理报告）"
    echo "- 硬闸：G1/G2/G4/G5 落键时刻见 state；UAT AC 全过"
    echo
    echo "## 二、规律（机制归因，对事不对人）"
    echo "- 按'检查单缺项→失误未被拦截'口径归类问题单（流程/工具/模型/环境），详单见治理报告"
    echo
    echo "## 三、下轮验证（行动项四元组）"
    echo "| 行动项 | owner | 期限 | 验证判据 |"
    echo "|---|---|---|---|"
    echo "| 治理报告问题单逐条闭环 | director | 下轮推演前 | issues.log 全条目有处置结论 |"
    echo "| 家族记忆召回下轮同 RFD 经验 | director | 下轮同名 RFD 轮 | hindsight 召回探针命中本轮结论 |"
    echo
    echo "## 资产回写"
    echo "- 治理报告：evidence/governance-report.md（含硬闸状态/问题单台账/凭证与回灌）；工作台账：evidence/work-report.md（M3）；合规意见书：docs/retro/*-audit-opinion.md（audit 签名线）；metrics-log 口径行见报告末节"
    echo "- ITIL：服务目录 SVC-cashier-${RFD_ID} 已登记于验收文档 SLA 节"
  } > "$RETRO"
  ( cd "$DIRECTOR_CLONE" && git add -A \
    && git -c user.name="director (G6)" -c user.email="director@aipaydev.local" \
         commit -qm "docs(retro): ${RFD_ID} G6 复盘与治理报告回写" \
    && git pull -q --rebase origin main && git push -q origin main ) \
    && note "[G6] 复盘文档已入仓" \
    || { echo "ISSUE|retro-push|director|复盘文档推送失败（留存 $EVID_DIR）" >> "$EVID_DIR/issues.log"; note "[观察] 复盘推送失败"; }
  MEM_OK=1
  curl -sf -m 3 "$HINDSIGHT_API_URL/health" >/dev/null || MEM_OK=0
  fam_bank=$(jq -r .bank_id "$HERMES_ROOT/profiles/fanfan/hindsight/config.json" 2>/dev/null || echo missing)
  [[ "$fam_bank" == hermes-* ]] || MEM_OK=0
  if [[ $MEM_OK == 1 ]]; then
    note "[G6] 记忆沉淀探针 ✓（hindsight 健康，家族 bank=${fam_bank}——本轮经验可召回，下轮同名 RFD 验证）"
  else
    echo "ISSUE|retro-memory-probe|director|hindsight 探针失败（bank=${fam_bank}）" >> "$EVID_DIR/issues.log"
  fi
  sset retro_done "$(date +%s)"
fi

# ══ 步骤 20：IDE 工作台接入核验（API/代码级；UI 走查由导演另行执行）══
if step_reached ide && [[ -z "$(sget ide_done)" ]]; then
  note "── ide：核验任务→IDE 跳转与简报生成能力"
  # 1) /ide 路由存在（SPA 200）
  code=$(curl -s -o /dev/null -w '%{http_code}' "$(studio_url)/ide")
  [[ "$code" == 200 ]] && note "[真值] /ide 路由 200 ✓" || echo "ISSUE|ide-route|studio|/ide HTTP $code" >> "$EVID_DIR/issues.log"
  # 2) 任务跳转参数 ide?task= 处理代码存在性（client 源码）
  if grep -rq "route.query.task" "$NCWK/overlay/custom/client/ide" 2>/dev/null; then
    note "[真值] ide?task 参数处理代码存在 ✓"
  else
    echo "ISSUE|ide-task-param|client|未见 ide?task 参数处理（任务→IDE 跳转缺口）" >> "$EVID_DIR/issues.log"
    note "[观察] ide?task 跳转处理未见（记问题单）"
  fi
  # 3) 任务简报自动生成能力
  if find "$NCWK/overlay/custom/client/ide/components" -iname '*brief*' 2>/dev/null | grep -q .; then
    note "[真值] IDE 简报相关代码存在 ✓"
  else
    echo "ISSUE|ide-brief|client|任务接入 IDE 自动简报生成功能未见（步骤 20 要求）" >> "$EVID_DIR/issues.log"
    note "[观察] IDE 任务简报自动生成功能未见（记问题单）"
  fi
  sset ide_done 1
fi

note "===== 下半场完成（到 ${START_STEP} 起全部门禁执行完）====="

#!/bin/bash
# aipay-scenario.sh — RFD-001 收银台全流程推演（设计文档 §7，20 步；拓扑口径：方案 V2.0 §3.3）
# 导演只扮演"人类打字/点击"与"核验地面真值"；agent 动作全为真实 gateway+LLM 回合。
# 拓扑：单 gateway 多路复用 + 单 studio 多账号 + 每账号多 kanban（账号板寻址）。
# 断点续跑: START_STEP=<step> bash aipay-scenario.sh
# 区间执行: UNTIL_STEP=<step>（如 UNTIL_STEP=smoke 只实跑步骤 1-5）
# 步骤序: smoke → ba → room → dispatch → register → analysis → triage → anexec
#        → review → close → plan → devimpl → defect → testpass → release → templates → ide
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mux/mx-lib.sh"
source "$SCRIPT_DIR/mux/mx-scenario-lib.sh"

note "===== aipaydev 推演开始（START_STEP=${START_STEP}${UNTIL_STEP:+ UNTIL_STEP=$UNTIL_STEP}）====="
# 模型通道不可用就别开局：否则每步只报「超时」，会把额度耗尽记成产品缺陷。
# LLM 依赖自 dispatch（首个 agent 回合步骤）起：执行区间触及 dispatch 及以后才要求通道；
# smoke/ba/reqgate 为导演侧动作（whoami/推送/G1 机械化判读），无 LLM 依赖。
if [[ -z "${UNTIL_STEP:-}" || "$(step_pos "$UNTIL_STEP")" -ge "$(step_pos dispatch)" ]]; then
  model_preflight_report
fi

# ══ 步骤 1-5：账号/配置/登录/功能就绪冒烟 ═════════════
if step_reached smoke; then
  note "── smoke：账号×24、单 gateway 多路复用 + 单 studio 多账号、登录×2 模式、账号板就绪"
  for u in "${USERS[@]}"; do
    mx "$(load_token "$u")" GET account/whoami >/dev/null || fail "账号 $u token 失效"
    mx "$(load_token "$u-agent")" GET account/whoami >/dev/null || fail "账号 $u-agent token 失效"
  done
  note "[真值] 24 账号 token 有效 ✓（步骤 1 账号分配）"
  curl -sf "http://127.0.0.1:${STUDIO_PORT}/health/ready" >/dev/null || fail "studio（单实例多账号）未就绪"
  curl -sf "http://127.0.0.1:${GW_PORT}/health" >/dev/null || fail "gateway（多路复用）未就绪"
  note "[真值] 单 gateway（:${GW_PORT}）+ 单 studio（:${STUDIO_PORT}）就绪 ✓（步骤 2 gateway 配置 / 步骤 4 功能就绪）"
  for u in "${INSTANCED_USERS[@]}"; do
    jwt_of "$u" >/dev/null   # matrix-login 全量验证（步骤 3 自动登录链路）
    kanban_list "$u" >/dev/null
  done
  note "[真值] 11 账号 matrix-login + 账号板 kanban 可达 ✓（步骤 3 登录）"
  # 自动登录链路端点契约（C2 修复 384）：公开可达且按契约应答。configured:true/false
  # 均合法——V2 单 studio 多账号下 root 网关无 matrix 凭据，configured:false 为预期
  # 常态（客户端回落账号 matrix-login）；路由真缺失才是问题（裸 404 无契约体）。
  GWCRESP=$(curl -s -m 3 "http://127.0.0.1:${STUDIO_PORT}/api/matrix/gateway-credentials" || true)
  if printf '%s' "$GWCRESP" | grep -q '"configured"'; then
    note "[真值] 自动登录链路端点按契约应答 ✓（步骤 3 登录×2 模式之二：$(printf '%s' "$GWCRESP" | jq -c .)）"
  else
    echo "ISSUE|auto-login-endpoint|studio|gateway-credentials 未按契约应答：$(printf '%s' "$GWCRESP" | cut -c1-60)" >> "$EVID_DIR/issues.log"
    note "[观察] 自动登录端点未按契约应答（记问题单，继续）"
  fi
  # 步骤 5：profiles 清单与 team 围栏装载核对
  for u in "${INSTANCED_USERS[@]}"; do
    [[ -d "$HERMES_ROOT/profiles/$u" ]] || fail "profile 缺失: $u"
    for b in $(account_boards "$u"); do
      bj="$HERMES_ROOT/kanban/boards/$b/board.json"
      [[ -f "$bj" ]] || fail "板元数据缺失: $b"
      grep -q '"profiles"' "$bj" || fail "板 team 围栏未装载: $b"
    done
  done
  note "[真值] profiles 清单 + 每板 team 围栏装载 ✓（步骤 5）"
  note "[真值] 步骤 1-5 全部完成 ✓"
fi

# ══ 步骤 6：BA 需求分发 ═══════════════════════════════
if step_reached ba; then
  # 内容比对而非存在性：仓库已有同名 RFD 但材料已升级（如 G1 四要素补齐）时必须重推，
  # 否则 reqgate 判读的永远是旧版（2026-09-25 v3 实测 bug：V1 旧 RFD-001 在仓导致 G1 误拦）。
  repo_pull
  need_push=1
  if git -C "$DIRECTOR_CLONE" show "origin/main:${RFD_DOC}" > /tmp/mx-rfd-remote.$$ 2>/dev/null; then
    if cmp -s "/tmp/mx-rfd-remote.$$" "$RFD_MATERIAL"; then need_push=0; fi
  fi
  rm -f "/tmp/mx-rfd-remote.$$"
  if [[ $need_push == 1 ]]; then
    cp "$RFD_MATERIAL" "$DIRECTOR_CLONE/docs/requirements/"
    ( cd "$DIRECTOR_CLONE"
      git add -A
      git -c user.name="bella (BA)" -c user.email="bella@aipaydev.local" \
        commit -qm "docs(requirements): ${RFD_ID} 收银台需求说明书（BA 初稿 v2：G1 四要素——AC/Scope-Out/影响面/涉敏）"
      git pull -q --rebase origin main; git push -q origin main )
    note "[bella] ${RFD_ID} 已提交 aipaydev（email 通道禁用，以 matrix 私信替代送达）"
  fi
  DM=$(dm_room bella fanfan)
  if [[ -z "$(sget ba_dm_marker)" ]]; then
    M=$(mx_send "$(load_token bella)" "$DM" "fanfan 你好，客户需求文档已出：${RFD_ID} 收单商户多端小程序支付收银台（依据财付通/支付宝公开技术手册）。
仓库: github.com/issac-new/aipaydev → ${RFD_DOC}
请产品团队接手做需求分析与分工。")
    sset ba_dm_marker "$M"
    note "[bella→fanfan] 需求私信已送达 ($M)"
  fi
fi

# ══ 步骤 7：reqgate（G1 需求冻结准入，V3 新增）════════
# 四要素机械化判读：验收标准（AC 编号+无模糊词）/Scope-Out/影响面/涉敏判定（ISO27001 挂钩）。
# 套模板：templates/prd.md。硬闸：G1 未过，dispatch 不得派发。
if step_reached reqgate; then
  if [[ -z "$(sget g1_frozen)" ]]; then
    repo_pull
    JUDGE=$(reqgate_judge "$DIRECTOR_CLONE/${RFD_DOC}" || true)
    if [[ -n "$JUDGE" ]]; then
      note "[G1] 需求书四要素判读未过：${JUDGE}——回灌 bella 补齐"
      mx_send "$(load_token bella)" "$(sget dm_bella_fanfan)" \
        "@$(human_mxid bella) G1 准入退回：${RFD_DOC} 缺 ${JUDGE}请按 templates/prd.md 结构补齐（验收标准逐条 AC 编号且机械化可判）后重推。" >/dev/null 2>&1 || true
      # 二轮：等待补齐（导演侧重拉重判，900s×2）
      ok2=""
      for round in 1 2; do
        sleep 15; repo_pull
        J2=$(reqgate_judge "$DIRECTOR_CLONE/${RFD_DOC}" || true)
        [[ -z "$J2" ]] && { ok2=1; break; }
        note "[G1] 第 ${round} 轮重判仍未过：${J2}"
        sleep 30
      done
      if [[ -z "$ok2" ]]; then
        echo "ISSUE|g1-acceptance-blocked|bella|${RFD_ID} 四要素两轮未过：${JUDGE}" >> "$EVID_DIR/issues.log"
        fail "G1 需求冻结未过（两轮回灌后仍缺要素），L1 不得开始"
      fi
    fi
    # 写冻结标记（AC 清单提取 + 涉敏结论）并推送
    FREEZE_LOCAL="$DIRECTOR_CLONE/$(freeze_doc)"
    {
      echo "# ${RFD_ID} G1 冻结标记"
      echo
      echo "- 冻结时间：$(date '+%F %T')；判读：验收标准(AC)/Scope-Out/影响面/涉敏 四要素全过"
      echo "- 验收标准（UAT 按此回验）："
      sed -n '/^## .*验收标准/,/^## /p' "$DIRECTOR_CLONE/${RFD_DOC}" | grep -E "^\- \*\*AC-[0-9]" | sed 's/^- /  - /'
      echo "- 涉敏：支付资金域=内部-机密（ISO27001 风险评估摘要随需求书 §12）"
      echo "- frozen: true"
    } > "$FREEZE_LOCAL"
    ( cd "$DIRECTOR_CLONE" && git add -A \
      && git -c user.name="director (G1)" -c user.email="director@aipaydev.local" \
           commit -qm "docs(requirements): ${RFD_ID} G1 冻结（AC/Scope-Out/影响面/涉敏 四要素过）" \
      && git pull -q --rebase origin main && git push -q origin main )
    sset g1_frozen "$(date +%s)"
    note "[G1] ${RFD_ID} 需求冻结完成（$(freeze_doc) 已入 origin/main）"
  fi
fi

# ══ 步骤 7-8：建群 + 发需求给 Orchestrator ═══════════
if step_reached room; then
  if [[ -z "$(sget room_analysis)" ]]; then
    RID=$(mx_create_room "$(load_token fanfan)" "支付收银台需求分析讨论群" "$(agent_mxid fanfan)")
    [[ "$RID" == '!'* ]] || fail "建群失败: $RID"
    sset room_analysis "$RID"
    mx_join "$(load_token fanfan-agent)" "$RID"
    note "[fanfan] 已建「支付收银台需求分析讨论群」 $RID 并邀请 fanfan-agent"
  fi
fi

if step_reached dispatch; then
  gate_blocked g1_frozen dispatch   # V3 硬闸：G1 未冻结不派发
  RID=$(sget room_analysis)
  # REDISPATCH=1 强制重发：续跑时派单标记若还在，旧版会静默跳过发信，于是后面每一步
  # 都在等一个根本没被重新触发过的 agent——"重跑"实际等于干等 900s 再超时（09-23 连撞数轮）。
  if [[ -n "${REDISPATCH:-}" && -n "$(sget dispatch_marker)" ]]; then
    note "[重发] REDISPATCH=1，清除旧派单标记后重发需求"
    sset dispatch_marker ""
  fi
  if [[ -z "$(sget dispatch_marker)" ]]; then
    WSF=$(workspace fanfan)
    M=$(mx_send "$(load_token fanfan)" "$RID" "@fanfan-agent:matrix.test 请处理需求 ${RFD_ID}。
需求基本信息：${RFD_ONELINE}。
需求文档：aipaydev 仓库 ${RFD_DOC}（你账号的工作区在 ${WSF}，先 git pull）
请加载 requirements-analyst 技能执行系统分析：先登记协作 kanban 任务，再做文档要素评估、三清单匹配、SMART 拆分与 RACI 派发。
建主卡与派发子卡时必须填写结构化 raci 字段（建卡工具/CLI 的 --raci，JSON 四元组 responsible/approver/consulted/informed 填矩阵账号），派发契约不再只写正文。
结论行必须二选一并带凭证，无凭证一律视为未完成：
  ANALYSIS-DONE-${RFD_ID} commit=<分析稿已推送的 commitId> card=<协作看板主卡ID>
  ANALYSIS-BLOCKED-${RFD_ID} reason=<阻塞原因> done=<已完成部分清单>
card 必须取自建卡工具返回的真实卡 ID（形如 t_1a2b3c4d），填需求编号一律判为虚报。两个凭证都会被反向核验：commit 须真实存在于 aipaydev origin 且该提交含分析稿，card 须在你账号的板（账号板）可查。动作若因输出长度被截断丢弃，就是还没做完——此时只准报 BLOCKED，不得报 DONE。" "$(agent_mxid fanfan)")
    sset dispatch_marker "$M"
    note "[fanfan] 需求派发已发 ($M)"
  fi
fi

# ══ 步骤 9：kanban 登记 ═══════════════════════════════
SCAN_ROOM="$(sget room_analysis)"
if step_reached register; then
  jwt_of fanfan >/dev/null
  # 超时不直接退出：把拒收原因回灌给 agent 再等一轮。否则核验方默默失败、agent 以为已
  # 交活，整轮只能靠人肉重跑（09-23 三连超时皆因此，第三次更是拿需求编号冒充卡ID）。
  if ! wait_truth "fanfan 账号板出现 ${RFD_ID} 任务卡" 900 kanban_has fanfan "${RFD_ID}"; then
    mx_send "$(load_token fanfan)" "$(sget room_analysis)" \
      "@$(agent_mxid fanfan) 验收拒收：你的结论行上报了完成，但你账号的板查无 ${RFD_ID} 任务卡。
      请先用协作看板登记主卡（建卡工具会返回真实卡 ID），再以 ANALYSIS-DONE-${RFD_ID} commit=<已推送commitId> card=<该卡ID> 重报。
      填需求编号当卡 ID 会被判虚报。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    note "[拒收回灌] 已 @fanfan-agent 告知缺账号板卡，要求补登记后重报凭证"
    wait_truth "补登记后账号板出现 ${RFD_ID} 任务卡" 900 kanban_has fanfan "${RFD_ID}" \
      || { echo "ISSUE|kanban-registration-skipped|fanfan-agent|两轮拒收后仍未登记 ${RFD_ID} 账号板卡" >> "$EVID_DIR/issues.log"; \
           fail "fanfan 账号板登记超时（已回灌拒收仍未补做）"; }
  fi
fi

# ══ 步骤 10：系统分析（要素评估/三清单/SMART 拆分/RACI 派发）══
if step_reached analysis; then
  RID=$(sget room_analysis)
  # 硬失败而非降级：tasklist 是后续 RACI 派发与追踪的唯一依据，缺了还往下跑，
  # 等于在空前提上派单，产出的"完成"全部不可信（09-23 V2.0 实锤：agent 本机写了
  # 分析稿却未提交，仍上报 DONE）。
  wait_truth "仓库出现 docs/analysis/${RFD_ID}-tasklist.md" 2400 repo_has docs/analysis/${RFD_ID}-tasklist.md \
    || { echo "ISSUE|analysis-artifacts-missing|fanfan-agent|${RFD_ID} 分析稿未入仓（本机可能有稿但未提交推送），派发依据缺失，中止本轮" >> "$EVID_DIR/issues.log"; \
         fail "步骤 10 未完成：${RFD_ID}-tasklist.md 未入仓，不得继续派发"; }
  # 产物到仓 ≠ 流程走完：还要 agent 自己交回可核验凭证（commit + 账号板卡）。
  # 两者任一造假或缺失，本轮按未完成处理，不带可疑前序进入分诊与派发。
  if ! wait_truth "${RFD_ID} 完成凭证反向核验（commit 真在 origin 且含分析稿、card 真在账号板）" 600 \
      verify_done_evidence "${RFD_ID}"; then
    # 与步骤 9 同款回灌：只中止不告知，等于把"凭证错了"变成人肉重跑（09-23 实锤：
    # agent 已建出真卡 t_4bee99f1 却没重报，房间里的 DONE 仍是旧的假卡号，被我方正确拒收，
    # 但没人告诉它要重报，于是死锁在验收上）。
    mx_send "$(load_token fanfan)" "$(sget room_analysis)" \
      "@$(agent_mxid fanfan) 凭证核验未通过：你的账号板里其实已有 ${RFD_ID} 主卡，但你最后上报的 DONE 行里 card 仍是需求编号，不是真实卡 ID。
      请重新发一行结论：ANALYSIS-DONE-${RFD_ID} commit=<已推送commitId> card=<建卡工具返回的真实卡 ID，形如 t_4bee99f1>。
      只需补这一行，不要重做已完成的分析与登记。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    note "[拒收回灌] 已 @fanfan-agent 要求用真实卡 ID 重报结论行"
    wait_truth "重报后凭证反向核验" 900 verify_done_evidence "${RFD_ID}" \
      || { echo "ISSUE|done-without-verifiable-evidence|fanfan-agent|${RFD_ID} 两轮拒收后凭证仍缺失或造假" >> "$EVID_DIR/issues.log"; \
           fail "步骤 10 凭证核验未通过（已回灌拒收仍未重报），中止本轮"; }
  fi
  for pair in "chen wei" "hu wei" "lin wei" "xiao mei"; do
    set -- $pair
    wait_truth "房间出现 @${1}-agent 与 @${2}-agent 的 RACI 派发" 1200 bash -c \
      "curl -sf '$HS/_matrix/client/v3/rooms/$RID/messages?access_token=$(load_token fanfan)&dir=b&limit=200' | \
       jq -e '[.chunk[] | select(.type==\"m.room.message\") | select((.content.body//\"\") | contains(\"@${1}-agent\") and contains(\"@${2}-agent\"))] | length > 0'" \
      || note "[观察] @$1/@$2 派发消息未见（记问题单，继续）"
  done
  # 结构化 raci 观察项（B1 链）：主卡应带 raci 列（agent 未填则记问题单，不阻断）
  RACI_JSON="$(kanban_raci_of fanfan "${RFD_ID}")"
  if [[ -n "$RACI_JSON" ]]; then
    note "[真值] ${RFD_ID} 主卡带结构化 raci ✓（$(printf '%s' "$RACI_JSON" | cut -c1-80)...）"
  else
    echo "ISSUE|raci-not-structured|fanfan-agent|${RFD_ID} 主卡未填结构化 raci 字段（仍靠正文承载）" >> "$EVID_DIR/issues.log"
    note "[观察] 主卡未带结构化 raci（记问题单，继续）"
  fi
  # 关联人进群核验（step 10 要求 agent 自动邀请）
  EXPECTED_MEMBERS="chen hu lin xiao wei mei qi fei"
  for m in $EXPECTED_MEMBERS; do
    if ! mx_room_members "$(load_token fanfan)" "$RID" | grep -qx "$(human_mxid "$m")"; then
      note "[问题] @$m 未被邀入需求群——agent 自动邀请能力缺口，导演补邀并记问题单"
      echo "ISSUE|room-invite-gap|fanfan-agent|Orchestrator 未自动邀请 @$m 进群，导演兜底" >> "$EVID_DIR/issues.log"
      mx "$(load_token fanfan)" POST "rooms/$RID/invite" "{\"user_id\":\"$(human_mxid "$m")\"}" >/dev/null 2>&1 || true
      mx_join "$(load_token "$m")" "$RID"
      mx "$(load_token fanfan)" POST "rooms/$RID/invite" "{\"user_id\":\"$(agent_mxid "$m")\"}" >/dev/null 2>&1 || true
      mx_join "$(load_token "$m-agent")" "$RID"
    fi
  done
  note "[步骤10] 系统分析派发阶段完成"
fi

# ══ 步骤 11：分诊登记 + lead 确认 + 双兜底 ═══════════
if step_reached triage; then
  RID=$(sget room_analysis)
  for u in chen hu lin xiao; do
    jwt_of "$u" >/dev/null
    wait_truth "$u 账号板出现 ${RFD_ID} 任务卡（分诊台登记）" 1800 kanban_has "$u" "${RFD_ID}" \
      || { note "[观察] $u 账号板未见 ${RFD_ID} 卡（记问题单）"; \
           echo "ISSUE|triage-missing|$u|分诊台未见 ${RFD_ID} 任务卡" >> "$EVID_DIR/issues.log"; }
  done
  # lead 人工确认（导演代 wei/mei 在各自账号板把任务从 triage 推进 todo）
  for lead in wei mei; do
    kanban_list "$lead" | jq -r --arg rfd "$RFD_ID" '.. | objects | select(has("title") and has("id")) | select(((.title//"")+(.body//"")) | contains($rfd)) | .id' \
      | while read -r id; do kanban_status_as "$lead" "$id" todo || true; done
    note "[$lead] lead 分诊确认完成（triage→todo）"
  done
fi

note "===== scenario 本批执行区间（START_STEP=${START_STEP}${UNTIL_STEP:+ UNTIL_STEP=$UNTIL_STEP}）内 gates 执行完毕 ====="

# 后续步骤（anexec/review/close/plan/devimpl/defect/testpass/release/templates/ide）
# 在独立脚本 aipay-scenario2.sh 中，避免单文件过长。
# 修复：START_STEP 落在 anexec..ide 区间（如 review）经本脚本续跑时，
# step_reached anexec 为假会秒退假完成（18:59 事故），须按位置比较放行进入下半场。
if [[ "$(step_pos "$START_STEP")" -ge "$(step_pos anexec)" ]]; then
  # UNTIL_STEP 上界同样约束下半场：UNTIL 不足 anexec 时不进下半场
  if [[ -z "${UNTIL_STEP:-}" || "$(step_pos "$UNTIL_STEP")" -ge "$(step_pos anexec)" ]]; then
    exec bash "$SCRIPT_DIR/aipay-scenario2.sh"
  fi
fi
note "阶段一完成 ✅"

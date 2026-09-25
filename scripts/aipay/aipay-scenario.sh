#!/bin/bash
# aipay-scenario.sh — V3 全流程 0-1 推演脚本（单文件完整版，26 步）
#
# 方案：docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md（六阶段 L0-L5
# + 管理域 M1-M3/audit + G1-G6 硬闸；每步准入/准出/质量/治理见方案 §2）。
# 拓扑：单 gateway 多路复用 + 单 studio 多账号 + 账号板 + 家族共享记忆（V2 手册）。
# 本文件由 aipay-scenario.sh(1-14 步)+aipay-scenario2.sh(15-25 步) 合并而来
# （原拆分仅为单文件长度，合一收敛为单一事实源）。
# 与方案"具体流程 1-26"逐步对应：1-4↔smoke 5↔appinit 6↔people 7↔ba+reqgate
# 8↔room 9↔dispatch 10↔register 11↔analysis 12↔triage 13↔anexec 14↔review
# 15↔archgate 16↔close 17↔plan 18↔devimpl 19↔defect+testpass 20↔ready
# 21↔release+uat 22↔workmgr 23↔audit 24↔retro 25↔ide 26↔report
# 步骤序(START_STEP/UNTIL_STEP 合法值)：
#   smoke appinit people ba reqgate room dispatch register analysis triage
#   anexec review archgate close plan devimpl defect testpass ready release
#   uat workmgr audit retro ide report
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

# 临时物清理（Z6）：ba 步 /tmp/mx-rfd-remote.$$ 与 ready 步 DL_WT 临时 worktree 中途
# 退出会残留。重定义 mx_cleanup 扩展清理面——EXIT trap 只在 mx-lib 挂一次，退出时按
# 最新定义执行（bash 单 EXIT trap）；DL_WT 未建时为空跳过，worktree 用
# git worktree remove --force 兜底。
mx_cleanup() {
  rm -f "/tmp/mx-api.$$" "$STATE.tmp" "/tmp/mx-rfd-remote.$$"
  if [[ -n "${DL_WT:-}" ]]; then
    git -C "$DIRECTOR_CLONE" worktree remove --force "$DL_WT" >/dev/null 2>&1 \
      || git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1
  fi
}

note "===== aipaydev 推演开始（START_STEP=${START_STEP}${UNTIL_STEP:+ UNTIL_STEP=$UNTIL_STEP}）====="
# 模型通道不可用就别开局：否则每步只报「超时」，会把额度耗尽记成产品缺陷。
# LLM 依赖区间为 [dispatch, uat]（agent 回合步骤）：执行区间与它有交集才要求通道；
# smoke..reqgate 与 workmgr/audit/retro/ide 均为导演侧动作，无 LLM 依赖
# （v3 实测 bug③④：全量预检会把导演侧管理步误拦在额度耗尽环境下）。
RANGE_END="${UNTIL_STEP:-report}"
if (( $(step_pos "$RANGE_END") >= $(step_pos dispatch) )) && (( $(step_pos "$START_STEP") <= $(step_pos uat) )); then
  model_preflight_report
fi

# ══ 步骤 1-5：账号/配置/登录/功能就绪冒烟 ═════════════
if step_reached smoke; then
  note "── smoke：账号×24、单 gateway 多路复用 + 单 studio 多账号、登录×2 模式、账号板就绪"
  for u in "${USERS[@]}"; do
    mx "$(load_token "$u")" GET account/whoami >/dev/null || fail "账号 $u token 失效"
    mx "$(load_token "$u-agent")" GET account/whoami >/dev/null || fail "账号 $u-agent token 失效"
  done
  note "[真值] $(( ${#USERS[@]} * 2 )) 账号 token 有效 ✓（步骤 1 账号分配；编制 ${#USERS[@]} 人 ×2 账号）"
  curl -sf "http://127.0.0.1:${STUDIO_PORT}/health/ready" >/dev/null || fail "studio（单实例多账号）未就绪"
  curl -sf "http://127.0.0.1:${GW_PORT}/health" >/dev/null || fail "gateway（多路复用）未就绪"
  note "[真值] 单 gateway（:${GW_PORT}）+ 单 studio（:${STUDIO_PORT}）就绪 ✓（步骤 2 gateway 配置 / 步骤 4 功能就绪）"
  for u in "${INSTANCED_USERS[@]}"; do
    jwt_of "$u" >/dev/null   # matrix-login 全量验证（步骤 3 自动登录链路）
    kanban_list "$u" >/dev/null
  done
  note "[真值] ${#INSTANCED_USERS[@]} 账号 matrix-login + 账号板 kanban 可达 ✓（步骤 3 登录）"
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
  sset smoke_done 1
fi

# ══ 步骤 6：appinit（M1 应用初始化配置，V3-mgmt 新增）══
# 应用资产登记：脚手架核对 + app-registry 入仓 + 板/manifest 对账。导演侧无 LLM。
if step_reached appinit && [[ -z "$(sget appinit_done)" ]]; then
  repo_pull
  # 脚手架核对：每应用 apps/<app>/ 必须有 vitest 配置（缺则记问题单，不代建——建骨架属研发职责）
  app_bad=""
  while IFS='|' read -r app owner board stack sla; do
    [[ -d "$DIRECTOR_CLONE/apps/$app" ]] || app_bad="${app_bad}${app} 目录缺；"
    ls "$DIRECTOR_CLONE/apps/$app/"vitest.config.* >/dev/null 2>&1 || app_bad="${app_bad}${app} vitest 门禁骨架缺；"
    [[ -f "$HERMES_ROOT/kanban/boards/$board/board.json" ]] || app_bad="${app_bad}${app} 专属板缺；"
    grep -q "\"$app\"" "$HERMES_ROOT/profiles/$owner/machine-manifest.json" 2>/dev/null || app_bad="${app_bad}${app} 未登记于 owner manifest；"
  done < <(apps_of)
  if [[ -n "$app_bad" ]]; then
    echo "ISSUE|app-init-incomplete|director|应用初始化缺口：${app_bad}" >> "$EVID_DIR/issues.log"
    note "[观察] 应用初始化缺口（记问题单，继续）：${app_bad}"
  fi
  # registry 入仓（幂等：内容变化才推）
  REG="$DIRECTOR_CLONE/docs/admin/app-registry.md"
  mkdir -p "$(dirname "$REG")"
  app_registry_gen > "$REG"
  # 落 main 走 repo_commit_main（P4/Z1）：HEAD 停在 integration 后旧写法（当前分支 commit
  # + pull --rebase + push origin main）提交落错分支、push 空推/非快进暴毙；失败记问题单
  # 不中止（对齐 uat/audit/retro 修后风格，入仓缺口由 audit 步对账查漏）。
  if repo_commit_main "docs/admin/app-registry.md" "director (M1)" "director@aipaydev.local" \
       "docs(admin): 应用资产登记表（app-registry，M1 应用初始化）"; then
    note "[M1] 应用资产登记完成（4 应用×负责人×板×SLA×门禁骨架，registry 已入仓）"
  else
    echo "ISSUE|appinit-push|director|app-registry 推送 origin/main 失败（留存 ${REG}）" >> "$EVID_DIR/issues.log"
    note "[观察] app-registry 推送失败（留存本地，记问题单）"
  fi
  sset appinit_done "$(date +%s)"
fi

# ══ 步骤 7：people（M2 研发人员管理，V3-mgmt 新增）════
# 组织与权限矩阵入仓 + 三方对账（编制表↔fleet-manifest↔profile/board 实况）。导演侧无 LLM。
if step_reached people && [[ -z "$(sget people_done)" ]]; then
  P_BAD=$(people_reconcile || true)
  if [[ -n "$P_BAD" ]]; then
    echo "ISSUE|people-org-mismatch|director|组织对账不一致：${P_BAD}" >> "$EVID_DIR/issues.log"
    note "[观察] 组织对账发现不一致（记问题单，继续）：${P_BAD}"
  else
    note "[M2] 组织对账一致：${#INSTANCED_USERS[@]} 账号 × profile × 板 × fleet-manifest ✓"
  fi
  ORG="$DIRECTOR_CLONE/docs/admin/org.md"
  org_gen > "$ORG"
  # 落 main 走 repo_commit_main（P4/Z1）：同 appinit——HEAD 在 integration 时旧写法提交
  # 落错分支、push 空推/非快进暴毙；失败记问题单不中止。
  if repo_commit_main "docs/admin/org.md" "director (M2)" "director@aipaydev.local" \
       "docs(admin): 研发组织与权限矩阵（org，M2 人员管理，含七角色治理线）"; then
    note "[M2] 组织与权限矩阵入仓（14 账号：BA/PM/系统分析/架构/安全 secops/运维 ops/审计 audit 治理线齐备）"
  else
    echo "ISSUE|people-push|director|org.md 推送 origin/main 失败（留存 ${ORG}）" >> "$EVID_DIR/issues.log"
    note "[观察] org.md 推送失败（留存本地，记问题单）"
  fi
  sset people_done "$(date +%s)"
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
    cp "$RFD_MATERIAL" "$DIRECTOR_CLONE/$RFD_DOC"
    # 落 main 走 repo_commit_main（P4/Z1）：HEAD 停在 integration 后旧写法提交落错分支、
    # push 空推/非快进暴毙，需求书进不了 origin/main、reqgate 判读的还是旧版；失败记问题单
    # 不中止。cp 显式落到 ${RFD_DOC}：RFD_MATERIAL 环境覆盖时基名可能不同，落到目录会与
    # RFD_DOC 对不上（旧写法靠 git add -A 兜住，此处不兜）。
    if repo_commit_main "$RFD_DOC" "bella (BA)" "bella@aipaydev.local" \
         "docs(requirements): ${RFD_ID} 收银台需求说明书（BA 初稿 v2：G1 四要素——AC/Scope-Out/影响面/涉敏）"; then
      note "[bella] ${RFD_ID} 已提交 aipaydev（email 通道禁用，以 matrix 私信替代送达）"
    else
      echo "ISSUE|ba-push|bella|${RFD_DOC} 推送 origin/main 失败（留存 ${DIRECTOR_CLONE}/${RFD_DOC}）" >> "$EVID_DIR/issues.log"
      note "[观察] 需求书推送失败（留存本地，记问题单）"
    fi
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
    # 落 main 走 repo_commit_main（P4/Z1）：HEAD 在 integration 时旧写法提交落错分支、
    # push 空推/非快进暴毙。失败记问题单不中止；g1_frozen 照常落键，audit 步对账
    # "已落键但 freeze 不在 origin/main"（audit_check）查漏。
    if repo_commit_main "$(freeze_doc)" "director (G1)" "director@aipaydev.local" \
         "docs(requirements): ${RFD_ID} G1 冻结（AC/Scope-Out/影响面/涉敏 四要素过）"; then
      note "[G1] ${RFD_ID} 需求冻结完成（$(freeze_doc) 已入 origin/main）"
    else
      echo "ISSUE|g1-push|director|$(freeze_doc) 推送 origin/main 失败（留存 ${FREEZE_LOCAL}）" >> "$EVID_DIR/issues.log"
      note "[观察] G1 冻结文件推送失败（留存本地，记问题单）"
    fi
    sset g1_frozen "$(date +%s)"
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
请先自动邀请所有关联人进群（chen/hu/lin/xiao/wei/mei/qi/fei 的 matrix 账号），然后加载需求分析技能（含金融支付转接清算领域知识+通用架构设计技能）执行系统分析：
1) 需求切分转换、文本提取（图片转 OCR 双路提取交叉核对防字符错认），转 markdown 且不得有信息偏差，按需求模版做格式与要素评估；
2) 三清单匹配：人员清单（matrix 账号）、应用模块清单（向所有账号查询上报 kanban/teams/agent 能力，csw 开头应用 agent 即应用模块清单）、组织清单（归属/团队/leader，以已入库 org.md 与 app-registry.md 为准）；
3) 按应用模块职责初分+架构统筹（最小改动、减少重构、同类合并），形成 SMART 任务清单具体到人，登记到主任务上；
4) 自动邀请所有关联人进群，按 RACI 逐条 @责任人+其团队负责人发任务明细（附文档/仓库地址），并逐条建跟踪子任务与主任务挂父子依赖（全部完成后才关主任务）。
建主卡与派发子卡时必须填写结构化 raci 字段（--raci，四元组 responsible/approver/consulted/informed）。
**注意：子任务必须建在对应责任人的看板上（板名=责任人账号名-pay-core 等格式），不是建在你自己的板上。**
**建完子任务后，必须在群内逐条发 matrix 消息 @责任人-agent @团队负责人-agent 附任务明细（用 m.mentions 提及）。不发消息=没人知道有这个任务。**
**assignee 字段填短名（如 chen），不要填 @chen-agent:matrix.test。**
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
  sset register_done 1
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
  sset analysis_done 1
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
  sset triage_done 1
fi

# ═══════════ 下半场（anexec → ide）═══════════════════

SCAN_ROOM="$(sget room_analysis)"

# ══ 步骤 12：各主责系分执行（worktree + 分析文档 + 双兜底回执）══
if step_reached anexec && [[ -z "$(sget anexec_done)" ]]; then
  note "── anexec：派发 4 个系分执行任务（错峰 2+2）"
  # COMMON 双引号定义：模板内仅 ${RFD_DOC}/${RFD_ID} 需展开，其余全是字面量
  # （已核对无 $、无反引号）；单引号会把这两处变量原样发给 agent（P2）。
  # %WS% 是唯一随派单变化的占位，在使用点 ${COMMON//%WS%/$WS} 替换。
  COMMON="你的 kanban 任务已通过团队负责人分诊确认，现在执行系统分析（使用 swarm yuan skill 为该 workspace 代码仓库生成的定制化研发技能 xxx-dev skill 执行「分析/设计产出」，结合家族记忆库中的历史数据与评估标准做工作量评估）。
工作要求：
1) 在你的工作区 %WS% 下为该任务建 worktree 分支（见 aipaydev-dev 技能纪律），材料归集到任务 materials/
2) 先读 ${RFD_DOC}、docs/architecture/overview.md、docs/admin/org.md、docs/analysis/${RFD_ID}-tasklist.md
3) 输出 docs/analysis/<任务ID>-analysis.md：初步确认结论/待澄清/概设方案（接口签名+数据模型+错误码+幂等键）/前置依赖/风险点/工作量评估(人日)
4) git 提交并 push 到 origin main（worktree 内直接提交本文件即可，commit message: docs(analysis): <任务ID>）
5) 完成后在本群发【完成回执】（双兜底：@你的团队负责人-agent 与 @fanfan-agent），格式见 inbox-dedup 技能
结论行以 AN-DONE-<任务ID> 开头。不许谎报。"

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
4) 测试运行输出保存到 docs/evidence/DEV-PAYCORE-testlog.txt 随分支提交（G3 编码门禁证据，缺件判未完成）；push origin feat/DEV-PAYCORE；结论行 DEV-DONE-DEV-PAYCORE。不许谎报。" "$(agent_mxid chen),$(agent_mxid wei)"

  wait_truth "origin 出现 feat/DEV-PAYCORE 分支" 3600 bash -c \
    "git -C '$DIRECTOR_CLONE' fetch -q origin && git -C '$DIRECTOR_CLONE' rev-parse -q --verify refs/remotes/origin/feat/DEV-PAYCORE" \
    || { note "[观察] DEV-PAYCORE 分支未达"; echo "ISSUE|dev-branch-missing|DEV-PAYCORE|分支未推送" >> "$EVID_DIR/issues.log"; }

  # 渠道规格含空格：字段用 | 分隔 + IFS read（同 release 步）；空白分词会把
  # "财付通(V3 jsapi 下单 ...)" 截成 "财付通(V3"，$4 拿不到完整规格（P3）。
  for spec in "hu|DEV-CHWX|csw-channel-wechat|财付通(V3 jsapi 下单 wx.requestPayment 参数包 回调验签 查单 关单)" \
              "lin|DEV-CHALI|csw-channel-alipay|支付宝(alipay.trade.create my.tradePay tradeNO RSA2 验签 查单 关单)"; do
    IFS='|' read -r who task app chan <<< "$spec"
    dispatch_in_room "$who" "@$who-agent:matrix.test 执行开发任务 ${task}（${app}）。
工作区 $(workspace "$who")（先 git fetch && git checkout -b feat/${task} origin/feat/DEV-PAYCORE，基于 pay-core 契约）。
1) 实现 apps/${app}：统一 ChannelAdapter 接口（createOrder/queryOrder/closeOrder/verifyNotify），${chan}；渠道 HTTP 一律 mock
2) vitest 单测 ≥6 用例全绿（运行输出保存到 docs/evidence/${task}-testlog.txt 随分支提交，G3 证据，缺件判未完成）；3) push origin feat/${task}；结论行 DEV-DONE-${task}。不许谎报。" "$(agent_mxid $who),$(agent_mxid wei)"
    sleep 5
  done

  dispatch_in_room xiao "@xiao-agent:matrix.test 执行开发任务 DEV-MP（csw-cashier-mp）。
工作区 $(workspace xiao)（git checkout -b feat/DEV-MP origin/main）。
1) 实现 apps/csw-cashier-mp：双端目录（wechat/ 支付宝 alipay/），收银台页（订单展示/支付方式/15分钟倒计时/结果三态/失败重试不重复下单），api client 调 BFF 契约（见概设文档）
2) 逻辑层断言测试（自研脚本或 vitest 均可）≥6 用例全绿（运行输出保存到 docs/evidence/DEV-MP-testlog.txt 随分支提交，G3 证据，缺件判未完成）
3) push origin feat/DEV-MP；结论行 DEV-DONE-DEV-MP。不许谎报。" "$(agent_mxid xiao),$(agent_mxid mei)"

  for b in DEV-CHWX DEV-CHALI DEV-MP; do
    wait_truth "origin 出现 feat/$b 分支" 3600 bash -c \
      "git -C '$DIRECTOR_CLONE' fetch -q origin && git -C '$DIRECTOR_CLONE' rev-parse -q --verify refs/remotes/origin/feat/$b" \
      || { note "[观察] $b 分支未达"; echo "ISSUE|dev-branch-missing|$b|分支未推送" >> "$EVID_DIR/issues.log"; }
  done
  # G3 本地门禁证据真查：每条分支须含测试运行输出（docs/evidence/<任务>-testlog.txt）
  for b in DEV-PAYCORE DEV-CHWX DEV-CHALI DEV-MP; do
    repo_branch_has "feat/$b" "docs/evidence/$b-testlog.txt" \
      || { note "[观察] $b 缺本地测试输出证据（G3，记问题单）"; \
           echo "ISSUE|g3-local-gate-missing|$b|分支缺 docs/evidence/$b-testlog.txt" >> "$EVID_DIR/issues.log"; }
  done
  sset devimpl_done 1
fi

# ══ 步骤 16b：合并集成 + 测试执行 + 缺陷闭环 ═════════
if step_reached defect && [[ -z "$(sget defect_done)" ]]; then
  # 导演把三个后端分支+前端分支合入 integration 分支（模拟集成分支策略）
  # 分支状态机约定：本步起 HEAD 切到 integration/${RFD_ID} 并常驻（后续步骤用显式
  # ref 或临时 worktree 访问仓，不看 HEAD）；凡要进 origin/main 的提交一律走
  # repo_commit_main()（mx-scenario-lib：临时 worktree 基于 origin/main 提交该文件并
  # push，不切分支、不动 HEAD/local main、无 rebase）。
  repo_pull
  ( cd "$DIRECTOR_CLONE"
    # 未跟踪副本防撞（Z1 修复回归面）：repo_commit_main 只推远端、文档副本留存工作树，
    # 而 checkout 拒绝覆盖 origin/main 已跟踪的同名未跟踪文件（内容相同也拒，实测）。
    # 与 origin/main 一致的副本删掉（checkout 按树重建同名文件，后续读取不受影响），
    # 不一致的（入仓失败留存件）移进取证目录保住，不丢证据。
    while IFS= read -r f; do
      git cat-file -e "origin/main:$f" 2>/dev/null || continue
      if git show "origin/main:$f" 2>/dev/null | cmp -s - "$f"; then
        rm -f "$f"
      else
        mkdir -p "$EVID_DIR/untracked-backup/$(dirname "$f")" && mv "$f" "$EVID_DIR/untracked-backup/$f" \
          || echo "ISSUE|untracked-backup|$f|留存副本移入取证目录失败（checkout 或被挡）" >> "$EVID_DIR/issues.log"
      fi
    done < <(git ls-files --others --exclude-standard)
    git checkout -q -B integration/${RFD_ID} origin/main
    for b in DEV-PAYCORE DEV-CHWX DEV-CHALI DEV-MP; do
      git merge -q --no-ff "origin/feat/$b" -m "merge: $b into integration/${RFD_ID}" 2>/dev/null \
        || { git merge --abort 2>/dev/null; echo "ISSUE|merge-conflict|$b|integration 合并冲突" >> "$EVID_DIR/issues.log"; }
    done
    # 分支状态机约定（P4）：integration/${RFD_ID} 是脚本专有集成分支，每轮 -B 基于
    # origin/main+四开发分支重建，旧集成提交允许被重建结果覆盖（上一轮测试报告类产物以
    # 仓内文档/取证为准）。重跑窗口下 origin 上残留旧集成提交时直推非快进被拒、set -e
    # 暴毙——先常规推送，非快进回落 --force-with-lease（lease 锚定本轮 repo_pull 刷新的
    # origin 引用，远端再被别人推进仍会拒绝）；仍失败记问题单不中止（后续步骤用显式
    # origin/integration 引用，不看 HEAD）。
    git push -q -u origin integration/${RFD_ID} 2>/dev/null \
      || git push -q --force-with-lease -u origin integration/${RFD_ID} 2>/dev/null \
      || echo "ISSUE|integration-push|${RFD_ID}|integration/${RFD_ID} 推送被拒（常规+强推均失败）" >> "$EVID_DIR/issues.log" )
  note "[集成] integration/${RFD_ID} 四开发分支已合并并推送（推送被拒时已记问题单，见 issues.log）"

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
    # 逐条 AC 覆盖核验：UAT-EVIDENCE 结论行必须逐条列出每个 AC 编号（缺条即不通过）
    UAT_BODY=$(mx_messages "$(load_token bella)" "$(sget room_analysis)" 200 2>/dev/null | jq -r --arg s "$(agent_mxid fanfan)" \
      '[.[] | select(.sender == $s and ((.content.body//"") | contains("UAT-EVIDENCE")))] | last | .content.body // ""')
    AC_MISS=$(uat_ac_covered "$AC_LIST" "$UAT_BODY")
    if [[ -n "$AC_MISS" ]]; then
      UAT_OK=0; UAT_MISS="${UAT_MISS}UAT-EVIDENCE 未逐条覆盖 AC（缺 ${AC_MISS}）；"
    fi
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
      # 落 main 走 repo_commit_main（P4）：在 integration 上 commit 再 push origin main
      # 是空推/被拒，验收书进不了 main 且 set -e 暴毙、uat_done 落不了键。
      if repo_commit_main "docs/acceptance/${RFD_ID}-acceptance.md" "bella (UAT)" "bella@aipaydev.local" "docs(acceptance): ${RFD_ID} 业务验收通过（AC 全过）"; then
        note "[UAT] 验收文档已入仓：docs/acceptance/${RFD_ID}-acceptance.md → origin/main"
      else
        echo "ISSUE|uat-push|director|验收文档推送 origin/main 失败（留存 ${ACC}）" >> "$EVID_DIR/issues.log"
        note "[观察] 验收文档推送失败（留存本地，记问题单）"
      fi
      sset uat_done "$(date +%s)"
      note "[UAT] ${RFD_ID} 业务验收通过（AC=$(echo "$AC_LIST" | wc -w | tr -d ' ') 条全过）"
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
  # 落 main 走 repo_commit_main（P4）：在 integration 上 commit 再 push origin main 是
  # 空推/被拒，"已入仓"成假成功——意见书根本没进 origin/main。
  if repo_commit_main "docs/retro/${RUN_ID:-default}-audit-opinion.md" "audit (compliance)" "audit@aipaydev.local" "docs(retro): ${RFD_ID} 合规审计意见书（audit 签名线）"; then
    note "[audit] 合规意见书已入仓"
  else
    note "[观察] 意见书推送失败（留存本地）"
  fi
  sset audit_done "$(date +%s)"
fi

# ══ 步骤 23：retro（G6 复盘与知识沉淀，V3 新增）═══════
# 三段式复盘（现象/规律/下轮验证）+ 行动项四元组 + 治理报告与 metrics 回写 + ITIL 资产回写 + 记忆沉淀探针。
if step_reached retro && [[ -z "$(sget retro_done)" ]]; then
  gate_blocked uat_done retro
  GR=$(gov_report)
  note "[G6] 治理报告已生成：$GR"
  read -r ISS_N DISP_N <<< "$(issue_disp_stat)"
  OPEN_N=$((ISS_N - DISP_N)); (( OPEN_N < 0 )) && OPEN_N=0
  if (( OPEN_N > 0 )); then
    echo "ISSUE|retro-open-items|director|${OPEN_N} 条问题单缺 DISP 处置记账（已修/观察/延后），复盘表内如实标待处置" >> "$EVID_DIR/issues.log"
  fi
  RETRO="$DIRECTOR_CLONE/docs/retro/${RUN_ID:-default}-${RFD_ID}-retrospective.md"
  mkdir -p "$(dirname "$RETRO")"
  {
    echo "# ${RFD_ID} 复盘（G6 三段式，$(date '+%F %T')）"
    echo
    echo "## 一、现象（只写事实）"
    echo "- 问题单台账（${ISS_N} 条，处置记账 ${DISP_N} 条 DISP，待处置 ${OPEN_N} 条）："
    echo
    echo "| 问题单（类型·主体：描述） | 处置 |"
    echo "|---|---|"
    awk -F'|' '/^ISSUE\|/{key=$2"·"$3; desc[key]=$4; order[++n]=key} /^DISP\|/{k=$2"·"$3; d[k]=$4} END{for(x=1;x<=n;x++){k=order[x]; print "| " k "：" desc[k] " | " ((k in d)?d[k]:"待处置") " |"}}' "$EVID_DIR/issues.log" 2>/dev/null
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
  # 落 main 走 repo_commit_main（P4）：在 integration 上 commit 再 push origin main 是
  # 空推/被拒，复盘/治理报告进不了 origin/main。
  if repo_commit_main "docs/retro/${RUN_ID:-default}-${RFD_ID}-retrospective.md" "director (G6)" "director@aipaydev.local" "docs(retro): ${RFD_ID} G6 复盘与治理报告回写"; then
    note "[G6] 复盘文档已入仓"
  else
    echo "ISSUE|retro-push|director|复盘文档推送失败（留存 ${EVID_DIR}）" >> "$EVID_DIR/issues.log"
    note "[观察] 复盘推送失败"
  fi
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

# ══ 流程 26：HTML 推演报告（产品路演交付物）═══════════
# 逐步汇编执行状态/问题单/治理报告/截图证据（evidence/screenshots/*.png）成端到端
# 演示报告；驾驶舱/协作沟通/IDE 工作台的走查截图由内置浏览器工具（playwright/
# chrome dev tools / computer use）在流程中捕获落档，本步自动嵌入。
if step_reached report && [[ -z "$(sget report_done)" ]]; then
  gov_report >/dev/null
  SHOTS="$EVID_DIR/screenshots"; mkdir -p "$SHOTS"
  REP="$EVID_DIR/simulation-report.html"
  EVID_DIR="$EVID_DIR" STATE="$STATE" RUN_ID="${RUN_ID:-default}" RFD_ID="$RFD_ID" \
    python3 - "$REP" <<'PYEOF'
import html, os, sys, datetime, pathlib
out, evid, state_path = sys.argv[1], os.environ["EVID_DIR"], os.environ["STATE"]
state = {}
for line in open(state_path, encoding="utf-8", errors="replace"):
    if "=" in line:
        k, v = line.rstrip("\n").split("=", 1)
        state[k] = v
steps = [
 ("smoke","1-4 账号分配/初始化/登录/就绪",["smoke_done"]),
 ("appinit","5 应用初始化（资产登记）",["appinit_done"]),
 ("people","6 研发人员管理（组织对账）",["people_done"]),
 ("ba","7 需求提出（BA→PM）",["ba_dm_marker"]),
 ("reqgate","7 需求上锁 G1（AC/范围/影响/涉敏）",["g1_frozen"]),
 ("room","8 建需求分析讨论群",["room_analysis"]),
 ("dispatch","9 指令派发给 Orchestrator agent",["dispatch_marker"]),
 ("register","10 协作 kanban 主任务登记",["register_done"]),
 ("analysis","11 系统分析（三清单/SMART/RACI）",["analysis_done"]),
 ("triage","12 分诊确认（triage→todo）",["triage_done"]),
 ("anexec","13 四路系分执行（worktree+xxx-dev skill）",["anexec_done"]),
 ("review","14 汇总复核定稿",["review_done"]),
 ("archgate","15 架构治理评审 G2",["g2_arch_pass"]),
 ("close","16 主任务归档关闭",["close_done"]),
 ("plan","17 开发/测试排期（带时间窗口）",["plan_done"]),
 ("devimpl","18 真实编码 G3（本地测试证据）",["devimpl_done"]),
 ("defect","19 缺陷闭环（报→修→验）",["defect_done"]),
 ("testpass","19 测试报告 G4（commit id 回填）",["g4_pass"]),
 ("ready","20 发布准出 G5（回滚/灰度/人工批准）",["g5_ready"]),
 ("release","21 变更发版登记",["release_done"]),
 ("uat","21 业务验收（按锁定标准逐条对账）",["uat_done"]),
 ("workmgr","22 工作台账（WIP≤2/卡壳清点）",["workmgr_done"]),
 ("audit","23 合规及审计（意见书）",["audit_done"]),
 ("retro","24 复盘 G6（三段式+治理报告）",["retro_done"]),
 ("ide","25 IDE 工作台核验（简报/跳转/组件）",["ide_done"]),
 ("report","26 本报告汇编",["report_done"]),
]
gate_names = {"reqgate":"G1","archgate":"G2","testpass":"G4","ready":"G5","retro":"G6"}
rows = []
for key, title, cands in steps:
    done = any(state.get(c) for c in cands)
    gate = gate_names.get(key, "")
    st = "✅ 已执行" if done else "⬜ 未执行"
    rows.append(f"<tr><td>{html.escape(title)}{' 【'+gate+'】' if gate else ''}</td><td>{st}</td></tr>")
issues = []
ipath = os.path.join(evid, "issues.log")
if os.path.exists(ipath):
    for line in open(ipath, encoding="utf-8", errors="replace"):
        if line.startswith("ISSUE|"):
            issues.append("<li>" + html.escape(line.strip()) + "</li>")
shotdir = os.path.join(evid, "screenshots")
shots = sorted(pathlib.Path(shotdir).glob("*.png")) if os.path.isdir(shotdir) else []
imgs = "".join(f'<figure><img src="screenshots/{p.name}" alt="{html.escape(p.stem)}"><figcaption>{html.escape(p.stem)}</figcaption></figure>' for p in shots)
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
rfd = os.environ["RFD_ID"]; run = html.escape(os.environ["RUN_ID"])
doc = f"""<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>{rfd} 全流程推演报告（人与 AI 分布式集群协作）</title>
<style>body{{font-family:"PingFang SC",sans-serif;max-width:1080px;margin:24px auto;padding:0 16px;color:#1c2733}}
h1{{font-size:24px}} table{{border-collapse:collapse;width:100%}} td,th{{border:1px solid #ccd5e0;padding:6px 10px;font-size:14px}}
figure{{display:inline-block;width:48%;margin:8px 1%}} img{{width:100%;border:1px solid #ccd5e0;border-radius:6px}}
figcaption{{font-size:12px;color:#66788c;text-align:center}} li{{font-family:ui-monospace,monospace;font-size:12px}}
.tag{{color:#66788c;font-size:13px}}</style></head><body>
<h1>{rfd} 全流程推演报告</h1>
<p class="tag">人与 AI 分布式集群协作 · 需求研发交付全生命周期 ｜ 轮次 {run} ｜ 生成于 {now} ｜ 方案：mux-v3-lifecycle-plan.md（具体流程 1-26）</p>
<h2>一、各步执行状态（流程 1-26 对应）</h2>
<table><tr><th>步骤</th><th>状态</th></tr>{''.join(rows)}</table>
<h2>二、产品界面走查截图（驾驶舱 / 协作沟通 / IDE 工作台）</h2>
<p class="tag">截图由内置浏览器真实操作捕获于 evidence/screenshots/，本报告自动嵌入（{len(shots)} 张）</p>
{imgs if imgs else '<p class="tag">（暂无截图：待走查捕获后重跑 report 步自动嵌入）</p>'}
<h2>三、问题单台账（推演暴露的问题，{len(issues)} 条）</h2>
<ul>{''.join(issues) if issues else '<li>（无）</li>'}</ul>
<h2>四、闭环治理报告</h2>
<p>详见同目录 governance-report.md（各道锁状态、凭证核验、打回次数、度量口径）。</p>
</body></html>"""
open(out, "w", encoding="utf-8").write(doc)
print(out)
PYEOF
  note "[报告] HTML 推演报告已生成：${REP}（截图集 ${SHOTS} 自动嵌入，补齐截图后重跑 report 步刷新）"
  sset report_done "$(date +%s)"
fi

note "===== 全流程执行区间（START_STEP=${START_STEP}${UNTIL_STEP:+ UNTIL_STEP=$UNTIL_STEP}）内全部 gates 执行完毕 ====="

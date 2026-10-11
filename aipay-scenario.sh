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
# 起跑纪律（2026-10-09 run12 实锤）：必须 LC_ALL=C 起跑——macOS bash 3.2 在 UTF-8
#   locale 下把字符串内 $var 后的全角标点首字节吸入变量名（rc\xEF: unbound variable），
#   set -u 直接击杀驱动；run12 attempt 起跑未带即死于 capture_step 失败路径。
#   正确起跑：RUN_ID=<轮次> LC_ALL=C nohup bash aipay-scenario.sh > <SIM_ROOT>/logs/<轮次>-driver.log 2>&1 &
# 步骤序: smoke → ba → room → dispatch → register → analysis → triage → anexec
#        → review → close → plan → devimpl → defect → testpass → release → templates → ide
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/mux/mx-lib.sh"
source "$SCRIPT_DIR/mux/mx-scenario-lib.sh"
# M3 事件化：delivery.* 协议事件层（R29 拍板：缺省启用=产品真实形态、全程开启——
# Delivery Cases 面板由协议事件真实喂数；MX_DELIVERY=0 显式关闭自动记单
# product-surface-degraded 降级（§5.6 采集纪律⑩，禁静默关旗标跑全程）；映射与断言见
# docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md 实测记录）
source "$SCRIPT_DIR/mux/mx-delivery-lib.sh"
if ! dlv_enabled; then
  echo "ISSUE|product-surface-degraded|delivery-cases|MX_DELIVERY=0 显式关闭 delivery 协议面（R29：§5.6 采集纪律⑩ 降级口径记单，禁静默关旗标跑全程）" >> "$EVID_DIR/issues.log"
fi

# backlog① 观察员接线：harness 建房（mx-lib mx_create_room）与产品派发
# （resolveRoomObservers）同名同义——默认导演 admin 为固定观察员（可 env 覆盖），
# 产品房间列表对导演可见的实证链随本轮生效。
export MATRIX_ROOM_OBSERVERS="${MATRIX_ROOM_OBSERVERS:-@admin:$SERVER_NAME}"

# 单驱动锁（P0，2026-09-28；判活根治 2026-09-29）：双会话双开推演是实测最高频
# 互踩源——共享 state.env/板库/房间双写互踩。锁实现收敛在 mx-scenario-lib
# （mx_driver_lock_acquire 单一事实源，可单测）；陈锁只在持锁 pid 真死时接管，
# 判活取 pid 数字段（旧版整行取出致 kill -0 报 illegal pid 恒失败——V4-run1
# 02:26 run1 续跑误抢 run2 活锁的实锤根因）。
DRIVER_LOCK="$SIM_ROOT/.driver.lock.d"
_mx_rc=0; mx_driver_lock_acquire "$DRIVER_LOCK" "$$" || _mx_rc=$?
if [[ "$_mx_rc" == "1" ]]; then
  echo "[mux FAIL $(date '+%H:%M:%S')] 推演单驱动锁被占（持锁者：$(cat "$DRIVER_LOCK/info" 2>/dev/null || echo unknown)）——拒绝双开；如确认无推演在跑：rm -rf $DRIVER_LOCK 后重试" >&2
  exit 3
elif [[ "$_mx_rc" == "2" ]]; then
  echo "[mux FAIL] 锁接管竞争失败，另一驱动者刚接管——本轮退出" >&2
  exit 3
fi

# 临时物清理（Z6）：ba 步 /tmp/mx-rfd-remote.$$ 与 ready 步 DL_WT 临时 worktree 中途
# 退出会残留。重定义 mx_cleanup 扩展清理面——EXIT trap 只在 mx-lib 挂一次，退出时按
# 最新定义执行（bash 单 EXIT trap）；DL_WT 未建时为空跳过，worktree 用
# git worktree remove --force 兜底。单驱动锁目录随退出一并移除（锁生命周期=脚本生命周期）。
mx_cleanup() {
  # 清理面取三处定义的并集（mx-lib /tmp/mx-api.$$、mx-scenario-lib $STATE.tmp 与
  # $STATE.rfd.tmp——rfd_doc_snapshot 快照、注释声称随 mx_cleanup 清理、此处曾漏掉，
  # 重定义须保留全部既有项），再加本脚本 ba 步 /tmp/mx-rfd-remote.$$、DL_WT 与驱动锁。
  rm -f "/tmp/mx-api.$$" "$STATE.tmp" "$STATE.rfd.tmp" "/tmp/mx-rfd-remote.$$"
  rm -rf "$DRIVER_LOCK"
  if [[ -n "${DL_WT:-}" ]]; then
    git -C "$DIRECTOR_CLONE" worktree remove --force "$DL_WT" >/dev/null 2>&1 \
      || git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1
  fi
}
trap 'mx_cleanup' EXIT

# 本轮首次起跑时刻（幂等：续跑轮不重置——repo_has 新鲜度窗口的锚点，run5 教训）
[ -n "$(sget run_started_at)" ] || sset run_started_at "$(date +%s)"
note "===== aipaydev 推演开始（START_STEP=${START_STEP}${UNTIL_STEP:+ UNTIL_STEP=$UNTIL_STEP}）====="
# 模型通道不可用就别开局：否则每步只报「超时」，会把额度耗尽记成产品缺陷。
# LLM 依赖区间为 [dispatch, uat]（agent 回合步骤）：执行区间与它有交集才要求通道；
# smoke..reqgate 与 workmgr/audit/retro/ide 均为导演侧动作，无 LLM 依赖
# （v3 实测 bug③④：全量预检会把导演侧管理步误拦在额度耗尽环境下）。
# 只首轮跑（run8 优化 D）：14 账号串行探针 25-40s×每棒接力纯浪费（run7 28 代实录）；
# 探针串行是防自挤 429（勿改并行），改"每轮只检一次"——中途通道劣化由 wait_alive
# 空转判据兜住（日志零增长即判死），预检的职责只是"坏通道别开局"。
RANGE_END="${UNTIL_STEP:-report}"
if (( $(step_pos "$RANGE_END") >= $(step_pos dispatch) )) && (( $(step_pos "$START_STEP") <= $(step_pos uat) )) \
   && [[ -z "$(sget preflight_ok)" ]]; then
  model_preflight_report
  sset preflight_ok 1
fi

# ── 采集链起跑预检（run14 复盘 A1/B4 根修，§4.3-25a 实时帧红线的门前守卫）──
# run14 实锤：playwright 依赖被带名 no-save 安装清件，capture_step 全程 rc=1，40 帧
# 全部收尾补拍（实时帧=0），跑完才知道。预检=起跑时试拍 1 帧：失败即拒绝起跑，
# 修复后再来；两连败直接正常退出（防监督器自愈环空转）。幂等：预检通过键持久化。
if [[ -z "$(sget capture_preflight_ok)" ]]; then
  if node "$SCRIPT_DIR/mux/r18-frames.mjs" --run "$RUN_ID" --step capture-precheck --k 1 --url "/app" --user fanfan >/dev/null 2>&1; then
    sset capture_preflight_ok 1
    note "[预检] 采集链健康 ✓（playwright 试拍 1 帧成功——实时帧链路在位，§4.3-25a）"
  else
    echo "ISSUE|capture-preflight-failed|director|采集链起跑预检失败（r18-frames 试拍 rc≠0：playwright 依赖或浏览器链路坏——run14 全补拍事故的同族根因）" >> "$EVID_DIR/issues.log"
    note "[FAIL] 采集链起跑预检失败——实时帧链路不可用，拒绝带病起跑（修复指引：simharness npm install（playwright 已在 devDependencies）；浏览器 channel 检查）"
    if [[ -n "$(sget capture_preflight_failed)" ]]; then
      note "[FAIL] 采集链预检两连败——正常退出停跑（监督器自愈环不空转），人工修复后手动重跑"
      exit 0
    fi
    sset capture_preflight_failed 1
    fail "采集链起跑预检失败（实时帧红线 §4.3-25a）"
  fi
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
  # 驾驶舱回归·headless 侧（补遗④第 3 项：「在线恒零」从观察项升级为准出阻断）：
  # gateway detailed 健康给出 机器/智能体 在线真值；浏览器侧「任务/在线」chips 下拉
  # 逐项验证由 capture-v42 ui-04a/ui-04b 承担并截屏入档，双源合并。
  _akey=$(grep '^API_SERVER_KEY=' "$HERMES_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
  _det=$(curl -sf -m 5 -H "Authorization: Bearer ${_akey}" "http://127.0.0.1:${GW_PORT}/health/detailed" 2>/dev/null || true)
  if [[ -n "$_det" ]] && printf '%s' "$_det" | jq -e '.gateway_state == "running"' >/dev/null 2>&1; then
    _cpl=$(printf '%s' "$_det" | jq -r '.readiness.checks.gateway.connected_platforms // 0')
    note "[真值] 驾驶舱回归·在线（headless）：gateway_state=running ✓ connected_platforms=${_cpl}（机器+智能体通道在线；浏览器侧三数见 ui-04b）"
  else
    echo "ISSUE|cockpit-online-zero|studio|gateway /health/detailed 不可判或非 running——在线恒零阻断（补遗④第 3 项）" >> "$EVID_DIR/issues.log"
    fail "驾驶舱回归·在线真值失败：gateway detailed 健康不可用（在线恒零=准出阻断，补遗④第 3 项）"
  fi
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
  # R28 编制三方对账（gap-audit P11 防复发）：roster.md × org.md × matrix 实际人类账号
  # 计数一致才算"账号与人员编制表一一对应"（方案步 1 合格线）；不一致记单不炸——
  # run9 实锤：roster 停首签 12 人版横跨六轮无人拦，根因=无对账断言。
  _roster_n=$(grep -cE '^\| @[a-z]+:matrix\.test \|' "$DIRECTOR_CLONE/docs/admin/roster.md" 2>/dev/null); _roster_n=${_roster_n:-0}
  _org_n=$(grep -E '^\| [a-z]' "$DIRECTOR_CLONE/docs/admin/org.md" 2>/dev/null | grep -Evc '^\| 账号' || true); _org_n=${_org_n:-0}
  _jwt_n=$(grep -c '^jwt_' "$STATE" 2>/dev/null); _jwt_n=${_jwt_n:-0}
  _mx_n=$(( _jwt_n + 1 ))   # jwt_* 人类账号 + admin（独立凭证）
  if [[ "$_roster_n" == "$_org_n" && "$_org_n" == "$_mx_n" && "$_mx_n" -gt 0 ]]; then
    note "[R28] 编制三方对账一致：roster=${_roster_n} × org=${_org_n} × matrix=${_mx_n} ✓"
  else
    echo "ISSUE|roster-org-matrix-mismatch|director|编制三方对账不一致：roster=${_roster_n} org=${_org_n} matrix=${_mx_n}（R28 断言；防 run9 roster 停旧版六轮无人拦复发）" >> "$EVID_DIR/issues.log"
    note "[R28] 编制三方对账不一致（已记单，继续）：roster=${_roster_n} org=${_org_n} matrix=${_mx_n}"
  fi
  # R29 delivery 协议面小冒烟（P15 拍板：禁静默关旗标——MX_DELIVERY=1 时冒烟段即验
  # 事件落房+读回；产品门禁灯帧按§5.6 必采矩阵 矩阵步 23 在报告链采集）
  dlv_enabled && dlv_smoke
  note "[真值] 步骤 1-5 全部完成 ✓"
  capture_step "smoke_done" "/app"

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
  # P13 改回（2026-10-06 用户裁决「界面上线是必须要求」）：注册表经产品同源通道落档
  # ——界面「保存（提交 git）」所走端点 PUT /api/governance/registry/app-registry
  # （gov_registry_put：admin matrix 交换 super_admin）；失败按§5.6 采集纪律⑩ 记单降级回直写，禁静默。
  if gov_registry_put app-registry "$REG" "docs(admin): 应用资产登记表（app-registry，M1 应用初始化）"; then
    note "[M1] registry 经产品通道落档（PUT /api/governance/registry/app-registry 保存即 git 提交——界面同源承载）"
  else
    echo "ISSUE|product-channel-degraded|studio|M1 registry 产品通道 PUT 失败，按§5.6 采集纪律⑩ 记单降级直写" >> "$EVID_DIR/issues.log"
    note "[M1] 产品通道失败（记单降级，直写保底）"
  fi
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
  capture_step "appinit_done" "/app/board?tab=gov-registry"

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
  # P13 改回：同 M1——org.md 经产品同源通道（OrgEditor「保存（提交 git）」端点）落档
  if gov_registry_put org "$ORG" "docs(admin): 研发组织与权限矩阵（org，M2 人员管理，含七角色治理线）"; then
    note "[M2] org 经产品通道落档（PUT /api/governance/registry/org 保存即 git 提交——界面同源承载）"
  else
    echo "ISSUE|product-channel-degraded|studio|M2 org 产品通道 PUT 失败，按§5.6 采集纪律⑩ 记单降级直写" >> "$EVID_DIR/issues.log"
    note "[M2] 产品通道失败（记单降级，直写保底）"
  fi
  # 落 main 走 repo_commit_main（P4/Z1）：同 appinit——HEAD 在 integration 时旧写法提交
  # 落错分支、push 空推/非快进暴毙；失败记问题单不中止。
  if repo_commit_main "docs/admin/org.md" "director (M2)" "director@aipaydev.local" \
       "docs(admin): 研发组织与权限矩阵（org，M2 人员管理，含七角色治理线）"; then
    note "[M2] 组织与权限矩阵入仓（14 账号：BA/PM/系统分析/架构/安全 secops/运维 ops/审计 audit 治理线齐备）"
  else
    echo "ISSUE|people-push|director|org.md 推送 origin/main 失败（留存 ${ORG}）" >> "$EVID_DIR/issues.log"
    note "[观察] org.md 推送失败（留存本地，记问题单）"
  fi
  capture_step "people_done" "/app/board?tab=gov-org"

  sset people_done "$(date +%s)"
  capture_step "login_done" "/app/board?tab=accounts"   # 步3 承载面
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
    mkdir -p "$(dirname "$DIRECTOR_CLONE/$RFD_DOC")"   # mx-clean 全清后目录本体不存在（run6 实锤）
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
    JUDGE=$(reqgate_judge "$(rfd_doc_snapshot)" || true)
    if [[ -n "$JUDGE" ]]; then
      note "[G1] 需求书四要素判读未过：${JUDGE}——回灌 bella 补齐"
      mx_send "$(load_token bella)" "$(sget dm_bella_fanfan)" \
        "@$(human_mxid bella) G1 准入退回：${RFD_DOC} 缺 ${JUDGE}请按 templates/prd.md 结构补齐（验收标准逐条 AC 编号且机械化可判）后重推。" >/dev/null 2>&1 || true
      # 二轮：等待补齐（导演侧重拉重判，900s×2）
      ok2=""
      for round in 1 2; do
        sleep 15; repo_pull
        J2=$(reqgate_judge "$(rfd_doc_snapshot)" || true)
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
    mkdir -p "$(dirname "$FREEZE_LOCAL")"   # mx-clean 九目录全清后目录本体不存在（run6 实锤）
    {
      echo "# ${RFD_ID} G1 冻结标记"
      echo
      echo "- 冻结时间：$(date '+%F %T')；判读：验收标准(AC)/Scope-Out/影响面/涉敏 四要素全过"
      echo "- 验收标准（UAT 按此回验）："
      sed -n '/^## .*验收标准/,/^## /p' "$(rfd_doc_snapshot)" | grep -E "^\- \*\*AC-[0-9]" | sed 's/^- /  - /'
      echo "- 涉敏：支付资金域=内部-机密（ISO27001 风险评估摘要随需求书 §12）"
      echo "- frozen: true"
    } > "$FREEZE_LOCAL"
    # 落 main 走 repo_commit_main（P4/Z1）：HEAD 在 integration 时旧写法提交落错分支、
    # push 空推/非快进暴毙。失败记问题单不中止；g1_frozen 照常落键，audit 步对账
    # "已落键但 freeze 不在 origin/main"（audit_check）查漏。
    if repo_commit_main "$(freeze_doc)" "director (G1)" "director@aipaydev.local" \
         "docs(requirements): ${RFD_ID} G1 冻结（AC/Scope-Out/影响面/涉敏 四要素过）"; then
      note "[G1] ${RFD_ID} 需求冻结完成（$(freeze_doc) 已入 origin/main）"
      # M3 事件化：开案例房（P1）→ stage P1 done → gate G1 pass（HumanGate=PM 人类 sender）→ case→P2
      dlv_enabled && {
        dlv_scenario_open "aipaydev ${RFD_ID}" "https://github.com/issac-new/aipaydev"
        dlv_scenario_phase P1 fanfan G1 fanfan human "G1 四要素冻结入仓（$(freeze_doc)）" P2
      }
    else
      echo "ISSUE|g1-push|director|$(freeze_doc) 推送 origin/main 失败（留存 ${FREEZE_LOCAL}）" >> "$EVID_DIR/issues.log"
      note "[观察] G1 冻结文件推送失败（留存本地，记问题单）"
    fi
    sset_once g1_frozen "$(date +%s)"
    capture_step "g1_frozen" "/app/board?tab=trace"   # 步7 承载面
  fi
fi

# ══ 步骤 7-8：建群 + 发需求给 Orchestrator ═══════════
if step_reached room; then
  if [[ -z "$(sget room_analysis)" ]]; then
    # 全量预邀（方案 §8 原文：fanfan 建群"自动邀请全部关联人进群后再开始分析"）。
    # 此前只邀 fanfan-agent，关联人入群全押 agent 自动邀请——通道不稳时
    # room-invite-gap 反复发作（V3 ×7 / V4-run1 ×8 实锤）。邀请幂等，人须各自 join。
    ASSOCIATES="chen hu lin xiao wei mei qi fei"
    INVITE_CSV="$(agent_mxid fanfan)"
    for m in $ASSOCIATES; do INVITE_CSV="${INVITE_CSV},$(human_mxid "$m"),$(agent_mxid "$m")"; done
    RID=$(mx_create_room "$(load_token fanfan)" "支付收银台需求分析讨论群" "$INVITE_CSV")
    [[ "$RID" == '!'* ]] || fail "建群失败: $RID"
    sset room_analysis "$RID"
    # 必采操作帧（run13 复盘 F13/F16：步 8 原无拍摄位——沟通区会话列表为该步可拍面）
    capture_step "room_done" "/app/s/chat"
    # 入房一律检错重试（mx_join 静默吞错实锤：限流 burst 尾部账号掉队无人知，
    # run9 ops/ Bella-agent 缺员即此族）；缺员记单不静默。
    _room_missing=""
    mx_join_retry "$(load_token fanfan-agent)" "$RID" || _room_missing="$_room_missing $(agent_mxid fanfan)"
    for m in $ASSOCIATES; do
      mx_join_retry "$(load_token "$m")" "$RID" || _room_missing="$_room_missing $(human_mxid "$m")"
      mx_join_retry "$(load_token "$m-agent")" "$RID" || _room_missing="$_room_missing $(agent_mxid "$m")"
    done
    if [[ -n "$_room_missing" ]]; then
      echo "ISSUE|room-join-missing|director|需求群建群预邀缺员（退避重试后仍未入）：${_room_missing}（join 静默失败族根治前的同类缺口）" >> "$EVID_DIR/issues.log"
      note "[问题] 需求群预邀缺员记单：${_room_missing}"
    fi
    note "[fanfan] 已建「支付收银台需求分析讨论群」 $RID 并全量预邀（fanfan-agent + 8 关联人及各自 agent，方案 §8）"
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
4) 自动邀请所有关联人进群，按 RACI 逐条 @责任人+其团队负责人发任务明细（附文档/仓库地址），并逐条建跟踪子任务与主任务挂父子依赖（全部完成后才关主任务）。你转派的每条派单都必须带「派发标识 RUN=${RUN_ID:-default}」并声明：同任务 ID 的历史轮产物不算重复派单，接收方须从零重新执行并回执结论行（历史轮产物与 git 历史提交不得引用、恢复或作为完成依据），禁止静默。
建主卡与派发子卡时必须填写结构化 raci 字段（--raci，四元组 responsible/approver/consulted/informed）。
主卡 body 末尾必须另起一行写房间锚：room: ${RID}（本群 roomId 原样——产品卡详情「去群里看」直达入口按此行跳转，缺行=入口不可用，run15 前置 P4-9）。
**注意：子任务必须建在对应责任人的看板上（板名=责任人账号名-pay-core 等格式），不是建在你自己的板上。**
**建完子任务后，必须在群内逐条发 matrix 消息 @责任人-agent @团队负责人-agent 附任务明细（用 m.mentions 提及）。不发消息=没人知道有这个任务。**
**assignee 字段必须填该看板 board.json 团队名单（profiles）里的 agent 档案名——责任人看板的团队名可在 fleet-manifest 查（如 chen-pay-core 板填 chen-csw-pay-core），本主卡填 fanfan-sys-analyst。不要填 @chen-agent:matrix.test（mxid），也不要填裸短名 chen——板级认领围栏按团队名单精确匹配，填错=agent 永远认领不到（09-26 实锤）。**
结论行必须二选一并带凭证，无凭证一律视为未完成：
  ANALYSIS-DONE-${RFD_ID} commit=<分析稿已推送的 commitId> card=<协作看板主卡ID>
  ANALYSIS-BLOCKED-${RFD_ID} reason=<阻塞原因> done=<已完成部分清单>
card 必须取自建卡工具返回的真实卡 ID（形如 t_1a2b3c4d），填需求编号一律判为虚报。两个凭证都会被反向核验：commit 须真实存在于 aipaydev origin 且该提交含分析稿，card 须在你账号的板（账号板）可查。动作若因输出长度被截断丢弃，就是还没做完——此时只准报 BLOCKED，不得报 DONE。" "$(agent_mxid fanfan)")
    sset dispatch_marker "$M"
    note "[fanfan] 需求派发已发 ($M)"
  fi
  # 必采对话挂钩（run13 复盘 B1 + run14 复盘 B3 抗重启加固）：挂钩在幂等块外，
  # 重启重入段即补采（r18-collect 按锚点幂等拒重，重复调用无副作用）——
  # run14 实锤 plan/test 段挂钩错过即整轮载荷缺。
  python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" dialog --step 9 --room "$RID" --anchor "$(sget dispatch_marker)" --title "需求派发任务书全文（fanfan→fanfan-agent）" --user fanfan --limit 40 >/dev/null 2>&1 || true
  # ── V8.8 纪律 33：测试左移① UC 用户案例（触发=G1 冻结+分析群在位；run15 首验）──
  # 与系统分析并行：测试线拿到冻结 AC 即起笔用户案例，G4 不再从零开始。
  if [[ -z "$(sget uc_dispatched)" ]]; then
    dispatch_in_room qi "@qi-agent:matrix.test 测试左移任务 UC-${RFD_ID}（用户案例设计，与系统分析并行推进，不等分析稿）：
产出 docs/test-design/${RFD_ID}-uc.md（中央仓 origin/main）：每条 AC 至少 1 个用户案例（角色/前置/步骤/期望结果，逐条挂 AC 编号），可直接作为后续集成用例与 UAT 对账的母版。
结论行 UC-DONE-${RFD_ID} cases=N（行首，N=案例条数）。工作区 $(workspace qi)：git checkout -b test/UC-${RFD_ID} origin/main。完成即 push+结论行。不许谎报。" "$(agent_mxid qi),$(agent_mxid mei)" \
      && sset uc_dispatched 1
  fi
fi

# ══ 步骤 9：kanban 登记 ═══════════════════════════════
SCAN_ROOM="$(sget room_analysis)"
if step_reached register; then
  jwt_of fanfan >/dev/null
  # 超时不直接退出：把拒收原因回灌给 agent 再等一轮。否则核验方默默失败、agent 以为已
  # 交活，整轮只能靠人肉重跑（09-23 三连超时皆因此，第三次更是拿需求编号冒充卡ID）。
  if ! wait_alive_truth "fanfan 账号板出现 ${RFD_ID} 任务卡" 600 fanfan kanban_has fanfan "${RFD_ID}"; then
    mx_send "$(load_token fanfan)" "$(sget room_analysis)" \
      "@$(agent_mxid fanfan) 验收拒收：你的结论行上报了完成，但你账号的板查无 ${RFD_ID} 任务卡。
      请先用协作看板登记主卡（建卡工具会返回真实卡 ID），再以 ANALYSIS-DONE-${RFD_ID} commit=<已推送commitId> card=<该卡ID> 重报。
      填需求编号当卡 ID 会被判虚报。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    note "[拒收回灌] 已 @fanfan-agent 告知缺账号板卡，要求补登记后重报凭证"
    wait_alive_truth "补登记后账号板出现 ${RFD_ID} 任务卡" 600 fanfan kanban_has fanfan "${RFD_ID}" \
      || { echo "ISSUE|kanban-registration-skipped|fanfan-agent|两轮拒收后仍未登记 ${RFD_ID} 账号板卡" >> "$EVID_DIR/issues.log"; \
           fail "fanfan 账号板登记超时（已回灌拒收仍未补做）"; }
  fi
  capture_step "register_done" "/app/board"

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
  # 续跑语义（P0，2026-09-28）：verify 有 done 键——断点重跑不再要求 agent 重报
  # （run10 之死：已完成态被重验，agent 不重报即两窗超时中止）。首验秒过即落键。
  if [[ -n "$(sget analysis_verified)" ]] && verify_done_evidence "${RFD_ID}"; then
    note "[凭证] 续跑：${RFD_ID} 凭证已核验过且仍成立，跳过回灌"
  elif ! wait_alive_truth "${RFD_ID} 完成凭证反向核验（commit 真在 origin 且含分析稿、card 真在账号板）" 300 fanfan \
      verify_done_evidence "${RFD_ID}"; then
    # 与步骤 9 同款回灌：只中止不告知，等于把"凭证错了"变成人肉重跑（09-23 实锤：
    # agent 已建出真卡 t_4bee99f1 却没重报，房间里的 DONE 仍是旧的假卡号，被我方正确拒收，
    # 但没人告诉它要重报，于是死锁在验收上）。
    mx_send "$(load_token fanfan)" "$(sget room_analysis)" \
      "@$(agent_mxid fanfan) 凭证核验未通过：你的账号板里其实已有 ${RFD_ID} 主卡。DONE 行里的 card 必须填建卡工具返回的真实卡 ID（形如 t_4bee99f1），拿需求编号充当一律判虚报。
      请重新发一行结论：ANALYSIS-DONE-${RFD_ID} commit=<已推送commitId> card=<建卡工具返回的真实卡 ID，形如 t_4bee99f1>。
      只需补这一行，不要重做已完成的分析与登记。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    note "[拒收回灌] 已 @fanfan-agent 要求用真实卡 ID 重报结论行"
    wait_alive_truth "重报后凭证反向核验" 600 fanfan verify_done_evidence "${RFD_ID}" \
      || { echo "ISSUE|done-without-verifiable-evidence|fanfan-agent|${RFD_ID} 两轮拒收后凭证仍缺失或造假" >> "$EVID_DIR/issues.log"; \
           fail "步骤 10 凭证核验未通过（已回灌拒收仍未重报），中止本轮"; }
  fi
  sset analysis_verified 1
  # RACI 副作用复查一次性守卫（run14 实锤：G5 熔断重启循环 85 圈，每圈重放本段——
  # 4×60s 白等 + 每圈 4 张重复单 + 每圈一条回灌消息轰炸群与 fanfan agent 回合。
  # 副作用证据复查只做一次：done 键在位即整段跳过，首跑语义不变）。
  if [[ -n "$(sget raci_sidework_done)" ]]; then
    note "[续跑] RACI 副作用复查已做过（raci_sidework_done 在位）——跳过 4×60s 复查与回灌（run14 刷单事故根修）"
  else
  for pair in "chen wei" "hu wei" "lin wei" "xiao mei"; do
    set -- $pair
    # 消息洪窗口失效（run4 实锤：当日风暴数千条，500 条仅回溯 5 分钟；深翻页到昨日需
    # 数十页不经济）：派发真实性由 state dispatch_marker（事件 id 可反查）锚定，此处
    # 文本级复查按 60s 窗降级观察——结论不放宽，只省注定超时的等待。
    # 注意必须当前 shell 直调谓词函数：bash -c 起的子进程继承不到 shell 函数（未 export -f），
    # mx_messages_deep 在子进程内 127 恒假=复查恒失败白等 60s（24h 审查实锤）
    wait_truth "房间出现 @${1}-agent 与 @${2}-agent 的 RACI 派发" 60 raci_dispatch_seen "${1}" "${2}" "${RID}" \
      || { note "[观察] @$1/@$2 派发消息未见（先记数，末尾统一回灌）"; RACI_MISS_PAIRS="${RACI_MISS_PAIRS:-} $1/$2"; }
  done
  # 双 @ 派发消息回灌闭环（run8 遗留⑤：run7 四组全未见只记观察——agent 执行率缺口，
  # 记单前先回灌要求补发，重查一轮仍缺才落单）：消息洪窗口外不是借口，群通知是
  # 接收方知晓任务的唯一正道（派发词明文要求），静默=任务失联风险。
  if [[ -n "${RACI_MISS_PAIRS:-}" ]]; then
    mx_send "$(load_token fanfan)" "$RID" "@fanfan-agent:matrix.test 【回灌】以下 RACI 派发消息在群内未见：${RACI_MISS_PAIRS}。请立即在群内逐条补发（@责任人-agent @团队负责人-agent 附任务明细，用 m.mentions 提及）——群通知是接收方知晓任务的唯一正道，缺发记执行缺口。补发后无需重报结论行。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    # 左移件 c（真值锚优先级）：RACI 群通知=副作用证据，真值=主卡 raci 列（下段结构
    # 化核验在查）。run11 双轮回灌等待窗（60s+4×240s ×2 轮≈40min）全烧在关键路径，
    # 降级 fire-and-forget：补发要求已发即记单放行，验证归审计段/巡检。
    note "[回灌] RACI 双 @ 派发缺 ${RACI_MISS_PAIRS}——补发要求已发（fire-and-forget，左移件 c 不占关键路径）"
    for pair in ${RACI_MISS_PAIRS}; do
      set -- $(echo "$pair" | tr '/' ' ')
      issue_once raci-dispatch-missing fanfan-agent "@${1}/@${2} RACI 双 @ 群通知未见（补发要求已发；真值=主卡 raci 列，验证归审计段）"
    done
  fi
  # 结构化 raci 观察项（B1 链）：主卡应带 raci 列（agent 未填则记问题单，不阻断）
  # run8 遗留②：记单前先回灌补填（kanban 更新卡或重建主卡带 --raci），重查一轮。
  RACI_JSON="$(kanban_raci_of fanfan "${RFD_ID}")"
  if [[ -n "$RACI_JSON" ]]; then
    note "[真值] ${RFD_ID} 主卡带结构化 raci ✓（$(printf '%s' "$RACI_JSON" | cut -c1-80)...）"
  else
    mx_send "$(load_token fanfan)" "$RID" "@fanfan-agent:matrix.test 【回灌】${RFD_ID} 主卡未带结构化 raci 字段（--raci 四元组 responsible/approver/consulted/informed）。请用协作看板补填该字段（卡更新或重建主卡均可），补完无需重报结论行。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    # 提速③ 免等窗（2026-10-09 提速决议）：结构化 raci 缺失属程序性（正文 raci 承载
    # 已可审计），回灌保留补填信号但不再 sleep 60 + 等 240s，即刻记单放行。
    echo "ISSUE|raci-not-structured|fanfan-agent|${RFD_ID} 主卡未填结构化 raci 字段（免等窗即刻记单；回灌补填要求已发，仍靠正文承载）" >> "$EVID_DIR/issues.log"
    note "[观察] 主卡缺结构化 raci（免等窗：回灌已发+记单放行）"
  fi
  sset raci_sidework_done 1   # 一次性守卫收口（上方 else 分支配对）
  fi
  # 关联人进群核验（step 10 要求 agent 自动邀请）
  # 判定语义（V4-run1 误报根治）：agent 职责=邀请发出（join|invite 均算履职）；
  # 受邀方接受与否不在 agent 控制面。仅当 join/invite 双缺时才记能力缺口问题单。
  EXPECTED_MEMBERS="chen hu lin xiao wei mei qi fei"
  for m in $EXPECTED_MEMBERS; do
    MEM_ST="$(mx_room_membership "$(load_token fanfan)" "$RID" "$(human_mxid "$m")")"
    if [[ -z "$MEM_ST" ]]; then
      note "[问题] @$m 未被邀入需求群（join/invite 双缺）——agent 自动邀请能力缺口，导演补邀并记问题单"
      echo "ISSUE|room-invite-gap|fanfan-agent|Orchestrator 未自动邀请 @$m 进群（join/invite 双缺实锤），导演兜底" >> "$EVID_DIR/issues.log"
      mx "$(load_token fanfan)" POST "rooms/$RID/invite" "{\"user_id\":\"$(human_mxid "$m")\"}" >/dev/null 2>&1 || true
      mx_join "$(load_token "$m")" "$RID"
      mx "$(load_token fanfan)" POST "rooms/$RID/invite" "{\"user_id\":\"$(agent_mxid "$m")\"}" >/dev/null 2>&1 || true
      mx_join "$(load_token "$m-agent")" "$RID"
    elif [[ "$MEM_ST" == "invite" ]]; then
      note "[真值] @$m 需求群邀请已发出（invite 待接受）✓"
    fi
  done
  note "[步骤10] 系统分析派发阶段完成"
  # 必采对话挂钩（run13 复盘 B1：步 11 缺采集；锚=需求派发事件，/context 后窗覆盖
  # RACI 双 @ 派发与凭证核验回灌对话；与步 9 分步登记不冲突——dialog 去重键=步内锚）
  python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" dialog --step 11 --room "$RID" --anchor "$(sget dispatch_marker)" --title "系分拆分与 RACI 派发对话（fanfan-agent）" --user fanfan --limit 80 >/dev/null 2>&1 || true
  capture_step "analysis_done" "/app/board"

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
  capture_step "triage_done" "/app/board"

  sset triage_done 1
fi

# ═══════════ 下半场（anexec → ide）═══════════════════

SCAN_ROOM="$(sget room_analysis)"

# ══ 步骤 12：各主责系分执行（worktree + 分析文档 + 双兜底回执）══
if step_reached anexec && [[ -z "$(sget anexec_done)" ]]; then
  note "── anexec：四路齐发（run11 §4.2 流水线：原 2+2 真分批废除——run9/run10 实证闸值 4 满格无撞闸；分批省下的撞闸风险不及等批浪费的墙钟）"
  # COMMON 双引号定义：模板内仅 ${RFD_DOC}/${RFD_ID} 需展开，其余全是字面量
  # （已核对无 $、无反引号）；单引号会把这两处变量原样发给 agent（P2）。
  # %WS% 是唯一随派单变化的占位，在使用点 ${COMMON//%WS%/$WS} 替换。
  # 结论行=完成回执一体化（V7 总则 17 实装）：一行携带全部凭证要素，agent 报 DONE
  # 与回执不再是分离动作（run7 四类尾部动作被丢的根治位）；核验侧双形态匹配天然兼容。
  COMMON="你的 kanban 任务已通过团队负责人分诊确认，现在执行系统分析（使用 swarm yuan skill 为该 workspace 代码仓库生成的定制化研发技能 xxx-dev skill 执行「分析/设计产出」，结合家族记忆库中的历史数据与评估标准做工作量评估）。
工作要求：
1) 在你的工作区 %WS% 下为该任务建 worktree 分支（见 aipaydev-dev 技能纪律），材料归集到任务 materials/
2) 先读 ${RFD_DOC}、docs/architecture/overview.md、docs/admin/org.md、docs/analysis/${RFD_ID}-tasklist.md
3) 输出 docs/analysis/<任务ID>-analysis.md：初步确认结论/待澄清/概设方案（接口签名+数据模型+错误码+幂等键）/前置依赖/风险点/工作量评估(人日)
4) git 提交并 push 到 origin main（worktree 内直接提交本文件即可，commit message: docs(analysis): <任务ID>）
5) 完成后在群内发唯一一行结论（此行即完成回执，缺任一要素=未完成会被打回）：
AN-DONE-<任务ID> commit=<已推送的 commitId> done=<一句话交付摘要>
不许谎报。"

  # 派发幂等 marker（run8 优化 C）：驱动中途死亡→relay 重拉→无 marker 会整批重派，
  # agent 收到重复任务书即重复开工（真实 LLM 工作量白烧）。marker 落 state，跨代持久。
  if [[ -z "$(sget anexec_d1)" ]]; then
    WS=$(workspace chen)
    dispatch_in_room chen "@chen-agent:matrix.test 执行任务 AN-PAYCORE（csw-pay-core 支付核心系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid chen),$(agent_mxid wei)"
    WS=$(workspace xiao)
    dispatch_in_room xiao "@xiao-agent:matrix.test 执行任务 AN-MP（csw-cashier-mp 小程序收银台前端系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid xiao),$(agent_mxid mei)"
    WS=$(workspace hu)
    dispatch_in_room hu "@hu-agent:matrix.test 执行任务 AN-CHWX（csw-channel-wechat 财付通渠道系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid hu),$(agent_mxid wei)"
    WS=$(workspace lin)
    dispatch_in_room lin "@lin-agent:matrix.test 执行任务 AN-CHALI（csw-channel-alipay 支付宝渠道系分）。
${COMMON//%WS%/$WS}" "$(agent_mxid lin),$(agent_mxid wei)"
    sset anexec_d1 1
  fi

  # 概设预写（纪律 27①，run11 流水线）：次份系分稿入仓即派 fanfan 起概设骨架
  # （消歧/消冲突可先做，四稿齐后补合定稿）——不等末稿再起笔。触发锚=第二份入仓：
  # 此时至多 2 路系分在途，fanfan 并入后并发 ≤4（闸值满格内不撞闸）。预写失败/未触发
  # 由 review 步原集中派发兜底（该步 repo_has 守卫仍在）。
  if [[ -z "$(sget review_prewrote)" ]]; then
    _pw_n=0
    _pw_deadline=$(( $(date +%s) + 3600 ))
    while (( $(date +%s) < _pw_deadline )); do
      _pw_n=0
      for t in AN-PAYCORE AN-MP AN-CHWX AN-CHALI; do
        repo_has "docs/analysis/$t-analysis.md" && _pw_n=$((_pw_n+1))
      done
      (( _pw_n >= 2 )) && break
      auto_approve "$SCAN_ROOM" || true
      sleep "$MX_POLL_IVAL"
    done
    if (( _pw_n >= 2 )); then
      dispatch_in_room fanfan "@fanfan-agent:matrix.test 【概设预写（流式流水线预备轮）】四份系分任务并行执行中，已有 ${_pw_n} 份入库、其余在途。请现在加载 requirements-analyst 技能起概设骨架，不等末稿：
1) 先读已入库的 docs/analysis/AN-*.md（先 git pull 拉最新）、${RFD_DOC}、docs/analysis/${RFD_ID}-tasklist.md
2) 可先做消歧与冲突处理（重点：金额单位统一明确为「分」(int64)；接口契约字段命名统一 snake_case），整理结构层次
3) 其余稿陆续入库后补合进同一文档；四稿齐后定稿 docs/design/${RFD_ID}-architecture-design.md（含跨模块接口契约与数据模型）并 push 到 origin main（推 feat 分支不命中入库真值——run12 design-push-gap 实锤）
4) 在你的账号板登记评审任务卡（标题含 ${RFD_ID}-评审，status=review）
禁做围栏（预写轮边界，run12 越界实锤补固）：本任务只写 docs/design 概设文档——不建/不合 DEV 分支（集成分支与集成时序走 defect 步导演职权，不得自开合并高速路）、不代做任何开发/测试任务（含代写测试用例/实现码）、不改 apps/ 代码。
结论行 REVIEW-DOC-DONE 开头。不许谎报。" "$(agent_mxid fanfan)"
      sset review_prewrote 1
      note "[流水线] 概设预写已派（${_pw_n} 份系分在仓即起笔，纪律 27①）"
    else
      note "[观察] 概设预写触发锚未达（3600s 内次份系分稿未入仓）——回退 review 步集中派发（记问题单）"
      echo "ISSUE|design-prewrite-skipped|fanfan|次份系分稿 3600s 未入仓，概设预写未触发（回退集中模式）" >> "$EVID_DIR/issues.log"
      sset review_prewrote 0
    fi
  fi

  # 四路齐发后的逐稿等待（并发已在前：这里只是逐个确认，先完成先过）
  for t in AN-PAYCORE AN-MP AN-CHWX AN-CHALI; do
    wait_truth "仓库出现 docs/analysis/$t-analysis.md" 3600 repo_has "docs/analysis/$t-analysis.md" \
      || { note "[观察] $t 分析文档未达（记问题单）"; echo "ISSUE|anexec-missing|$t|分析文档未入库" >> "$EVID_DIR/issues.log"; }
  done
  # 双兜底回执核验（run8 遗留③：run7 三条回执未见——agent 重活完成即停 turn，
  # 回执动作被丢。双形态匹配【完成回执】或 AN-DONE-<ID> 结论行；未见先回灌
  # @任务 owner 补发，重查一轮仍缺才落单）。
  for spec in "AN-PAYCORE chen" "AN-MP xiao" "AN-CHWX hu" "AN-CHALI lin"; do
    set -- $spec; t="$1"; owner="$2"
    receipt_seen() { # 双形态任一命中（当前 shell 直调）
      mx_messages "$(load_token fanfan)" "$SCAN_ROOM" 200 | jq -e --arg t "$t" \
        '[.[] | select(.sender == "'"$(agent_mxid "$owner")"'") | select((.content.body // "") | (contains("完成回执") and contains($t)) or test("^\\s*AN-DONE-" + $t))] | length > 0' >/dev/null
    }
    if receipt_seen; then
      note "[真值] $t 完成回执在房间可见 ✓"
    else
      mx_send "$(load_token fanfan)" "$SCAN_ROOM" "@${owner}-agent:matrix.test 【回执回灌】任务 $t 的完成回执在群内未见（双兜底：@团队负责人-agent 与 @fanfan-agent）。请在群内补发一行：AN-DONE-$t commit=<已推送 commitId>——入库真值已在案，此为回执补账，无需重做任务。不许谎报。" "$(agent_mxid "$owner")" >/dev/null 2>&1 || true
      # 提速③ 免等窗（2026-10-09 提速决议）：入库真值已核验在案，回执属程序性补账——
      # 回灌保留训练信号但不再等 300s 重查（run12 四笔回执重查烧约 40min 实测），即刻记单放行。
      echo "ISSUE|receipt-missing|$t|完成回执未见（免等窗即刻记单；回灌补发要求已发，入库真值在案）" >> "$EVID_DIR/issues.log"
      note "[观察] $t 回执未见（免等窗：回灌已发+记单放行）"
    fi
  done
  gate_review chen "系分执行-AN-PAYCORE"
  gate_review hu "系分执行-AN-CHWX"
  gate_review lin "系分执行-AN-CHALI"
  gate_review xiao "系分执行-AN-MP"
  capture_step "anexec_done" "/app/board"

  sset anexec_done 1
fi

# ══ 步骤 13：汇总复核 + 线下评审 ══════════════════════
if step_reached review && [[ -z "$(sget review_done)" ]]; then
  if ! repo_has docs/design/${RFD_ID}-architecture-design.md; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 四个系分任务（AN-PAYCORE/AN-MP/AN-CHWX/AN-CHALI）已全部完成。
请加载 requirements-analyst 技能做汇总复核：
1) git pull 读取四份 docs/analysis/AN-*.md
2) 消除歧义与冲突（重点：金额单位必须统一明确为「分」(int64)；接口契约字段命名统一 snake_case）
3) 整理结构层次，按规范形成系统概设方案 docs/design/${RFD_ID}-architecture-design.md（含跨模块接口契约与数据模型），并 push 到 origin main（推 feat 分支不命中入库真值——run12 design-push-gap 实锤）
4) 在你的账号板登记评审任务卡（标题含 ${RFD_ID}-评审，status=review）
结论行 REVIEW-DOC-DONE 开头。不许谎报。" "$(agent_mxid fanfan)"
    wait_alive_truth "概设方案 docs/design/${RFD_ID}-architecture-design.md 入库" 1800 fanfan \
      repo_has docs/design/${RFD_ID}-architecture-design.md || fail "复核稿空转（fanfan 日志 1800s 零增长）"
  fi
  # 线下人工评审（虚拟架构小组），导演代 fanfan 手工更新
  RID=$(kanban_list fanfan | jq -r --arg rfd "$RFD_ID" '[.. | objects | select(has("title")) | select((.title // "") | contains($rfd + "-评审")) | .id][0] // empty')
  if [[ -n "$RID" ]]; then
    kanban_walk_done fanfan "$RID"
    note "[fanfan] 线下评审结论：通过（虚拟架构小组人工评审），评审卡 $RID → done"
  else
    # 评审人自登回灌（run8 遗留④：run7 直接导演补登——agent 自登能力从未被触发验证。
    # 先回灌 fanfan 在账号板自登评审卡（标题含 <RFD>-评审），重查一轮）。
    mx_send "$(load_token fanfan)" "$(sget room_analysis)" "@fanfan-agent:matrix.test 【回灌】复核稿已入仓但你未登记评审任务卡。请立即在你的账号板登记：标题含 ${RFD_ID}-评审、status=review、关联 docs/design/${RFD_ID}-architecture-design.md（建卡带 --raci）。登记完成无需重报结论行。" "$(agent_mxid fanfan)" >/dev/null 2>&1 || true
    note "[回灌] 评审卡未见——已要求 fanfan 自登（提速③ 免等窗：不等重查，直接导演补登记兜底）"
    # R-A4（run2 独立审计意见）：评审卡缺失不得由导演自批置 done——补登记卡保留
    # "评审记录待补"，评审人补记结论后方可置 done；review_done 落键仅代表本步有
    # 记录，不代表评审通过。
    RID=$(kanban_create_as fanfan review_rfd "${RFD_ID}-评审（虚拟架构小组）" "补登记（回灌自登后仍未登记，独立审计意见 R-A4）：评审记录待评审人补记后方可置 done。关联概设 docs/design/${RFD_ID}-architecture-design.md" fanfan-review fanfan-researcher)
    note "[观察] 评审卡仍未找到，导演补登记 ${RID}（不置 done——评审记录待评审人补记，R-A4）"
    echo "ISSUE|review-card-missing|fanfan|agent 未登记评审卡（导演补登记 ${RID}，评审记录待补，不置 done）" >> "$EVID_DIR/issues.log"
  fi
  gate_review fanfan "G2-系分评审闸"
  capture_step "review_done" "/app/board"

  sset review_done 1
fi

# ══ 步骤 15：archgate（G2 架构治理评审，V3 新增）═══════
# arch 账号板（arch-governance）登记评审卡，@arch-agent 按 G2 检查单评审概设。
# 套模板：templates/design.md（五要素/备选方案）+ review-record.md（评审记录）。
# 硬闸：G2 未过，close/plan（L2）不得执行。
if step_reached archgate && [[ -z "$(sget g2_arch_pass)" ]]; then
  mx_gate_breaker_check g2 "G2 架构治理评审"   # 熔断：两轮未过不得开始 L2（跨调用持久）
  # ── 涉敏需求安全评审卡前置（run15 前置 P3-7①，审计 B 案：安全合规最薄的强制面）──
  # freeze 涉敏段非「无/否」时，G2 放行前须有 secops 安全评审卡+结论行——缺卡即拦，
  # 补齐后复核放行（security_review_done 键幂等）。非涉敏轮零影响（键直接落 1）。
  SEC_TS=$(( $(date +%s) * 1000 ))   # 顶层块非函数——普通赋值（bash 顶层 local 运行时报错）
  if [[ -z "$(sget security_review_done)" ]]; then
    _sens=$(git -C "$DIRECTOR_CLONE" show "origin/main:docs/requirements/${RFD_ID}.freeze.md" 2>/dev/null | grep -E '涉敏' | head -1)
    if printf '%s' "$_sens" | grep -qE '涉敏[：:]\s*(无|否|false|N/A)'; then
      sset security_review_done 1
      note "[安全] freeze 涉敏=无——安全评审卡豁免（非涉敏轮，P3-7① 前置直通）"
    else
      SGID=$(sget security_rgid)
      if [[ -z "$SGID" ]]; then
        SGID=$(kanban_create_as secops security_review "${RFD_ID} 安全评审（涉敏=${_sens:-未标注}）" \
          "涉敏需求安全评审单（run15 前置 P3-7①）：密钥管理/验签链路/数据落库字段/回调来源校验四项检查。结论行 SECURITY-GATE-PASS 或 SECURITY-GATE-FAIL(附缺项)。" secops-board secops-security)
        sset security_rgid "$SGID"
        dispatch_in_room secops "@secops-agent:matrix.test 安全评审请求：${RFD_ID} 涉敏（${_sens:-涉敏段未标注}）。请在卡 ${SGID} 完成四项安全检查（密钥管理/验签链路/数据落库字段/回调来源校验），结论行 SECURITY-GATE-PASS 或 SECURITY-GATE-FAIL(附缺项清单，行首)。概设 docs/design/${RFD_ID}-architecture-design.md 与概要系分为评审输入。不许谎报。" "$(agent_mxid secops)"
      fi
      if wait_truth "涉敏安全评审结论（SECURITY-GATE）" ${MX_GATE_WAIT:-2400} mx_gate_verdict_dual_seen "$(sget room_analysis)" "$(agent_mxid secops)" SECURITY-GATE "$SEC_TS" secops "${RFD_ID} 涉敏安全评审"; then
        if [[ "$(mx_gate_verdict_combined "$(sget room_analysis)" "$(agent_mxid secops)" SECURITY-GATE "$SEC_TS" secops "${RFD_ID} 涉敏安全评审")" == "PASS" ]]; then
          kanban_walk_done secops "$SGID"; sset security_review_done 1
          note "[安全] 涉敏安全评审通过（secops 板 ${SGID} → done）——G2 放行前置满足"
        else
          echo "ISSUE|security-review-fail|secops-agent|${RFD_ID} 涉敏安全评审 FAIL（缺项见评审卡），G2 不放行" >> "$EVID_DIR/issues.log"
          fail "${RFD_ID} 涉敏安全评审 FAIL——缺项补齐并复审 PASS 后 G2 方可放行（P3-7① 强制面）"
        fi
      else
        echo "ISSUE|security-review-missing|secops-agent|涉敏安全评审结论 ${MX_GATE_WAIT:-2400}s 未达——G2 不放行（补齐后复核）" >> "$EVID_DIR/issues.log"
        fail "涉敏安全评审结论超时（P3-7①：涉敏需求缺安全评审卡即拦）"
      fi
    fi
  fi
  capture_step "g2_arch_pass" "/app/board"   # 步15 承载面：arch 板·G2 评审卡（capture-plan 覆盖 user=arch）
  # G2 前置补邀（09-27 run9d 实锤第八层根因）：分析群是步骤 8 建的，邀的是研发
  # 关联人（chen/hu/lin/xiao/wei/mei/qi/fei），arch 不在其列——@arch-agent 不在房，
  # G2 mention 无法投递、1800s 硬闸必超时。照步骤 10 导演补邀惯用法双账号补齐。
  ARID=$(sget room_analysis)
  for mxid in "$(human_mxid arch)" "$(agent_mxid arch)"; do
    if ! mx_room_members "$(load_token fanfan)" "$ARID" | grep -qx "$mxid"; then
      mx "$(load_token fanfan)" POST "rooms/$ARID/invite" "{\"user_id\":\"$mxid\"}" >/dev/null 2>&1 || true
      [[ "$mxid" == *"-agent"* ]] || mx_join "$(load_token arch)" "$ARID"
    fi
  done
  AGID=$(kanban_create_as arch arch_g2 "${RFD_ID} 架构治理评审（G2）" \
    "G2 检查单：①设计五要素（背景/方案/接口/数据/风险）②爆炸半径（影响模块 vs 三清单）③验证计划前移④备选方案≥2 及取舍。结论行 ARCH-GATE-PASS 或 ARCH-GATE-FAIL(附缺项)。" arch-governance)
  G2_TS=$(( $(date +%s) * 1000 ))
  dispatch_in_room arch "@arch-agent:matrix.test 概设 docs/design/${RFD_ID}-architecture-design.md 已入库，请执行 G2 架构治理评审（评审卡 ${AGID}@arch-governance 板）：
1) 设计五要素齐备（背景/方案/接口/数据/风险，对照 templates/design.md）
2) 爆炸半径排查：变更影响模块清单 vs 任务三清单，缺漏列出
3) 验证计划前移：测试要点是否在设计期已列
4) 备选方案 ≥2 且有取舍理由
评审记录落评审卡 body（review-record 结构：检查项×证据×结论）。结论行 ARCH-GATE-PASS 或 ARCH-GATE-FAIL（附缺项清单，写在行首；旧判词→复审改判时用「→ 复审改判」句式、新判词放末尾）。结论行发出后回读群里确认可见，未见即重发一次。不许谎报。" "$(agent_mxid arch)"
  # 等待谓词补全双源（H8 语义，run4 实锤补齐）：结论行的权威载体是评审卡 body
  # （review-record 在卡；arch 的 G2 评审经 kanban worker 执行时只写卡不发房间——
  # 通道差异不该让硬闸失明）。房间行+卡面任一出现即视为结论到达；放行判定仍走
  # verdict_combined（FAIL 优先，不放宽）。
  if wait_truth "G2 结论（房间行或评审卡 body，双源）" ${MX_GATE_WAIT:-3600} mx_gate_verdict_dual_seen "$(sget room_analysis)" "$(agent_mxid arch)" ARCH-GATE "$G2_TS" arch "${RFD_ID} 架构治理评审"; then
    # 判词合并（R-A2）：房间行+评审卡 body 双源，FAIL 任一出现即 FAIL（保守不放行）
    if [[ "$(mx_gate_verdict_combined "$(sget room_analysis)" "$(agent_mxid arch)" ARCH-GATE "$G2_TS" arch "${RFD_ID} 架构治理评审")" == "PASS" ]]; then
      kanban_walk_done arch "$AGID"
      sset_once g2_arch_pass "$(date +%s)"
      note "[G2] 架构治理评审通过（arch 板评审卡 ${AGID} → done）"
      # M3 事件化：P2 done（概设定稿）→ G2 pass（arch 评审）→ case→P3
      dlv_enabled && dlv_scenario_phase P2 fanfan G2 arch artifact "概设评审过（arch 板 ${AGID}）" P3
    else
      echo "ISSUE|g2-design-review-fail|arch-agent|${RFD_ID} G2 评审 FAIL（缺项见评审卡），回灌修订" >> "$EVID_DIR/issues.log"
      mx_gate_breaker_trip g2 "G2 架构治理评审" 1
      G2_RETRY_TS=$(( $(date +%s) * 1000 ))
      dispatch_in_room fanfan "@fanfan-agent:matrix.test G2 架构评审退回：请按评审卡 ${AGID} 的缺项清单修订概设并重推，修订后 @arch-agent 复评（复评结论行须同步更新评审卡 body 判词，卡面与房间行一致才放行）。" "$(agent_mxid fanfan)"
      if wait_truth "修订后 ARCH-GATE-PASS（判词语义）" 2400 mx_gate_combined_pass "$(sget room_analysis)" "$(agent_mxid arch)" ARCH-GATE "$G2_RETRY_TS" arch "${RFD_ID} 架构治理评审"; then
        kanban_walk_done arch "$AGID"; sset_once g2_arch_pass "$(date +%s)"
      else
        mx_gate_breaker_trip g2 "G2 架构治理评审" 1
        fail "G2 两轮未过，L2 不得开始（V3 硬闸）"
      fi
    fi
  else
    echo "ISSUE|g2-review-missing|arch-agent|G2 结论行 1800s 未达" >> "$EVID_DIR/issues.log"
    fail "G2 架构治理评审超时，中止（V3 硬闸）"
  fi
fi

# ══ 步骤 14：主任务归档关闭 ═══════════════════════════
if step_reached close && [[ -z "$(sget close_done)" ]]; then
  gate_blocked g2_arch_pass close   # V3 硬闸：G2 未过不进 L2
  # ── V8.8 纪律 33：测试左移② INT 集成案例（触发=G2 过闸按概设接口契约起笔；run15 首验）──
  # UC=用户视角、INT=接口视角，两段互斥不重复；INT 挂概设工件可反查。
  if [[ -n "$(sget g2_arch_pass)" && -z "$(sget int_dispatched)" ]]; then
    dispatch_in_room qi "@qi-agent:matrix.test 测试左移任务 INT-${RFD_ID}（集成案例设计，按概设接口契约起笔）：
产出 docs/test-design/${RFD_ID}-int-cases.md（中央仓 origin/main）：按概设（docs/design/RFD-001-architecture-design.md）接口签名逐端点列集成案例（正常/边界/错误三态各 ≥1，逐条挂接口名），与 UC 案例互斥（UC=用户视角/INT=接口视角，不重复覆盖）。
结论行 INT-CASES-DONE-${RFD_ID} cases=N（行首，N=案例条数）。工作区 $(workspace qi)（UC 分支续用或新起 test/INT-${RFD_ID}）。完成即 push+结论行。不许谎报。" "$(agent_mxid qi),$(agent_mxid mei)" \
      && sset int_dispatched 1
  fi
  if [[ "$(kanban_status_of fanfan ${RFD_ID})" != "done" ]]; then
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 评审已通过。请收尾 ${RFD_ID} 主任务：
1) 把全部关联子任务与过程档案（4 份 AN-*.md、tasklist、概设方案 git 路径+commit）汇总登记进主任务卡 body，便于回溯审计
2) 主任务卡 status 置 done（测试工作量按 0.3 系数叠加口径写入 body）
结论行 CLOSE-DONE 开头。" "$(agent_mxid fanfan)"
    wait_truth "fanfan 账号板 ${RFD_ID} 主卡 done" 1200 kanban_done fanfan "${RFD_ID}" \
      || note "[观察] 主卡未置 done（记问题单）"
  fi
  gate_review arch "概设收口闸"
  capture_step "close_done" "/app/board"

  sset close_done 1
fi

# ══ 步骤 15：排期（pm-planning）══════════════════════
if step_reached plan && [[ -z "$(sget plan_done)" ]]; then
  if ! repo_has docs/plan/${RFD_ID}-schedule.md; then
    _m17=$(dispatch_in_room fanfan "@fanfan-agent:matrix.test 请加载 pm-planning 技能，基于定稿的概设与工作量评估编排开发/测试计划：
1) 产出 docs/plan/${RFD_ID}-schedule.md：任务表（ID/模块/责任人/类型/工作量人日/时间窗口/依赖）+ 里程碑；测试工作量 = 开发 × 0.3 叠加为独立测试任务；整体 +15% 集成缓冲；工作量 ≥2 人日的任务须同步给出子任务拆分（子任务 ID/内容/工作量，每件 ≤1 人日）写入文档；完成后 git commit 并 push origin main（入库真值以 origin/main 为准，推特性分支不算过闸）
2) 开发任务 ID 固定：DEV-PAYCORE(chen) DEV-CHWX(hu) DEV-CHALI(lin) DEV-MP(xiao)；测试任务：TEST-BE(qi) TEST-FE(fei)
3) kanban 建排期父任务，并为每个开发/测试任务建子任务（link 关联），卡片含时间窗口与工作量；子卡必须填结构化 raci 字段（--raci，responsible=对应账号 agent）
4) 逐条 matrix 派发：@责任人-agent 与 @其 lead-agent，附任务明细与本计划 git 地址
结论行 PLAN-DONE-${RFD_ID} 开头。不许谎报。" "$(agent_mxid fanfan)")
    sset m17_marker "$_m17"
    wait_alive_truth "docs/plan/${RFD_ID}-schedule.md 入库" 1800 fanfan repo_has docs/plan/${RFD_ID}-schedule.md || fail "排期空转（fanfan 日志 1800s 零增长）"
  fi
  # 必采对话挂钩在幂等块外（run14 复盘 B3 抗重启加固：r18-collect 幂等拒重，
  # 重启重入段即补采——run14 实锤 plan 段挂钩错过即整轮载荷缺）
  if [[ -n "$(sget m17_marker)" ]]; then
    python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" dialog --step 17 --room "$(sget room_analysis)" --anchor "$(sget m17_marker)" --title "排期派发任务书全文（fanfan）" >/dev/null 2>&1 || true
  fi
  repo_pull
  note "[真值] 排期计划入库 ✓"
  capture_step "plan_done" "/app/board"

  sset plan_done 1
fi

# ══ 步骤 16：开发实施（真实编码，run11 触发链：独立即派+依赖随上游落地派）═══
if step_reached devimpl && [[ -z "$(sget devimpl_done)" ]]; then
  # 越界守卫（C 方案 2026-10-09 过度交付盘查）：记录本段入口的 origin/main 基线，
  # 段末反查 main 是否被 DEV 域提交污染（run12 fanfan 合并高速路实锤）。
  if [[ -z "$(sget devimpl_main_base)" ]]; then
    repo_pull
    sset devimpl_main_base "$(git -C "$DIRECTOR_CLONE" rev-parse origin/main)"
  fi
  note "── devimpl：六路齐发（提速② 2026-10-09）——DEV-PAYCORE-C/S/N、DEV-MP、DEV-CHWX/DEV-CHALI 同刻即派；渠道独立部分先行，契约件分支落地后 rebase 对接（废除契约件锚等待，run11 §4.2/纪律 27⑥ 语义保留）"
  PYTEST_NOTE="测试用 vitest（npx vitest run）；渠道端点一律本地 mock，禁止真实请求。"
  # ACP 编码后端 L1（MX_ACP_BACKEND=1 启用，缺省关=保真对照轮）：DEV 派发词声明
  # 委托通道——实现经 coding-delegate 技能交外部编码引擎，委托日志=后端指纹。
  ACP_NOTE=""
  if [[ "${MX_ACP_BACKEND:-0}" == "1" ]]; then
    ACP_NOTE="
【编码后端=delegate】实现须经 coding-delegate 技能委托外部编码引擎执行（在 workspace 调用其 CLI，见技能卡流程四步）：你负责契约拆解/diff 评审/集成与 testlog，引擎负责实现；委托日志 tee 到 materials/delegate-log.txt 且必须随分支提交——缺日志=未走后端，G3 承载面记单。引擎不可用（CLI 缺失/超时 2 次）如实报 BLOCKED，禁止静默回退手写冒充委托。"
  fi

  # 派发幂等 marker（run8 优化 C）：重启防整批重派（同 anexec_d1）。d1=独立双路（chen/xiao，
  # 各自 origin/main 起建）；d2=依赖双路（hu/lin，feat/DEV-PAYCORE 落地触发）。
  if [[ -z "$(sget devimpl_d1)" ]]; then
    dispatch_in_room chen "@chen-agent:matrix.test 执行开发任务 DEV-PAYCORE-C（csw-pay-core 契约件，≤0.5 人日轻量）。任务纪律：单卡直做（无需再拆子任务），kanban 建 DEV-PAYCORE-C 主卡（含 --raci）。
工作区 $(workspace chen)（先 git pull）。按 docs/design/${RFD_ID}-architecture-design.md 契约：
1) git checkout -b feat/DEV-PAYCORE-C
2) 契约件：apps/csw-pay-core 的 ChannelAdapter 接口（createOrder/queryOrder/closeOrder/verifyNotify）、支付单状态机类型（INIT→PAYING→SUCCESS/FAILED/CLOSED）、回调事件 schema、docs/design/${RFD_ID}-pay-core-contract.md 契约文档（金额单位：分 int64）；tsc 编译过即可，无业务实现
3) push origin feat/DEV-PAYCORE-C；结论行 DEV-DONE-DEV-PAYCORE-C。${ACP_NOTE}边界纪律：交付仅限 push origin feat/<你的任务分支>；不得直接推 origin/main；不得代做他人/他域任务。不许谎报。" "$(agent_mxid chen),$(agent_mxid wei)"

    dispatch_in_room chen "@chen-agent:matrix.test 执行开发任务 DEV-PAYCORE-S（csw-pay-core 状态机+幂等，1 人日）。任务纪律：拆 2 件子任务（每件 ≤1 人日、独立验收口径），kanban 建 DEV-PAYCORE-S 主卡+link 子卡（含 --raci）；逐子任务实现且每件独立 commit。
工作区 $(workspace chen)（先 git fetch）。
1) git checkout -b feat/DEV-PAYCORE-S origin/feat/DEV-PAYCORE-C
2) 实现：支付单创建（merchantId+outTradeNo 幂等）、状态机流转 INIT→PAYING→SUCCESS/FAILED/CLOSED、查单、关单
3) vitest ≥5 用例全绿（${PYTEST_NOTE}）；输出存 docs/evidence/DEV-PAYCORE-S-testlog.txt 随分支提交（G3 证据，缺件判未完成；发结论行前自检该 testlog 文件已在分支上存在且非空——左移件 d；testlog 末尾附 npm audit --omit=dev 摘要段（漏洞计数+top 项，无法联网时写明「npm audit 不可达」一行——安全合规件 run15 前置 P3-7③））。提交纪律：git add 只取本任务改动与该 testlog 显式路径；push origin feat/DEV-PAYCORE-S；结论行 DEV-DONE-DEV-PAYCORE-S。${ACP_NOTE}边界纪律：交付仅限 push origin feat/<你的任务分支>；不得直接推 origin/main；不得代做他人/他域任务。不许谎报。" "$(agent_mxid chen),$(agent_mxid wei)"

    dispatch_in_room chen "@chen-agent:matrix.test 执行开发任务 DEV-PAYCORE-N（csw-pay-core 回调+证据，1 人日）。任务纪律：拆 2 件子任务（每件 ≤1 人日、独立验收口径），kanban 建 DEV-PAYCORE-N 主卡+link 子卡（含 --raci）；逐子任务实现且每件独立 commit。
工作区 $(workspace chen)（先 git fetch）。
1) git checkout -b feat/DEV-PAYCORE-N origin/feat/DEV-PAYCORE-S
2) 实现：渠道回调接收入口（验签后更新状态机、重复回调幂等）
3) vitest ≥3 用例（回调重复消费为主）全绿（${PYTEST_NOTE}）；输出存 docs/evidence/DEV-PAYCORE-N-testlog.txt 随分支提交（G3 证据，缺件判未完成；发结论行前自检该 testlog 文件已在分支上存在且非空——左移件 d；testlog 末尾附 npm audit --omit=dev 摘要段（漏洞计数+top 项，无法联网时写明「npm audit 不可达」一行——安全合规件 run15 前置 P3-7③））。提交纪律同前；push origin feat/DEV-PAYCORE-N；结论行 DEV-DONE-DEV-PAYCORE-N。${ACP_NOTE}边界纪律：交付仅限 push origin feat/<你的任务分支>；不得直接推 origin/main；不得代做他人/他域任务。不许谎报。" "$(agent_mxid chen),$(agent_mxid wei)"

    dispatch_in_room xiao "@xiao-agent:matrix.test 执行开发任务 DEV-MP（csw-cashier-mp，2 人日）。任务纪律（先拆分再编码，2026-10-01 用户裁决）：拆成 2-3 件子任务（每件 ≤1 人日、独立验收口径），kanban 建主卡+link 子卡（含工作量与 --raci）；逐子任务实现且每件至少一个独立 commit（消息含子任务 ID）。
每子件完成即 push（增量推送，不等全部完工）+群内一行 PROGRESS-<任务ID>-<子件ID>（一句话进度锚）；首个 commit=骨架（接口签名+目录+测试骨架），推后 @会签人 群内一句骨架评审（偏差先纠偏再续）——干预点纪律（2026-10-09 四件：拆卡/中间锚/骨架前移/可见性）。
工作区 $(workspace xiao)（git checkout -b feat/DEV-MP origin/main）。
1) 实现 apps/csw-cashier-mp：双端目录（wechat/ 支付宝 alipay/），收银台页（订单展示/支付方式/15分钟倒计时/结果三态/失败重试不重复下单），api client 调 BFF 契约（见概设文档）
2) 逻辑层断言测试（自研脚本或 vitest 均可）≥6 用例全绿（运行输出保存到 docs/evidence/DEV-MP-testlog.txt 随分支提交，G3 证据，缺件判未完成；发结论行前自检该 testlog 文件已在分支上存在且非空——左移件 d；testlog 末尾附 npm audit --omit=dev 摘要段（漏洞计数+top 项，无法联网时写明「npm audit 不可达」一行——安全合规件 run15 前置 P3-7③））。提交纪律：git add 只取本任务改动与该 testlog 显式路径，严禁携带他任务 evidence 文件
3) push origin feat/DEV-MP；结论行 DEV-DONE-DEV-MP。${ACP_NOTE}边界纪律：交付仅限 push origin feat/<你的任务分支>；不得直接推 origin/main；不得代做他人/他域任务。不许谎报。" "$(agent_mxid xiao),$(agent_mxid mei)"
    sset devimpl_d1 1
  fi

  # 用例前移（纪律 27②，run11 流水线）：编码进行中即派测试预备轮——用例起草+测试环境
  # 预备与编码并行，正式执行任务书（defect 步）到时核对即跑而非从零起。并发账：此刻
  # chen+xiao 编码（2）+qi+fei 预备（2）=4 满格；预备轮短（起草量级 ≤20min），chen
  # 落地（d2 触发锚）时预备多已收口，瞬态超额由容量排队泵兜底（§4.2 容量语义）。
  # 预备轮只起草不执行不交付——步 19 谓词/门禁语义不变；defect 步任务书自含兜底措辞
  #（未起草则从零写），预备缺失不构成缺件。
  if [[ -z "$(sget test_prep_d1)" ]]; then
    dispatch_in_room qi "@qi-agent:matrix.test 【测试预备轮（流式流水线，不执行不交付）】开发四路编码进行中，集成分支尚未建立。请现在做测试预备：
1) 工作区 $(workspace qi)：git pull origin main，读 docs/design/${RFD_ID}-architecture-design.md 契约与冻结 AC
2) 按概设契约起草后端集成测试用例（下单幂等、双渠道调起参数、回调验签拒绝、重复回调幂等、超时关单）到 test-drafts/TEST-BE-draft.md（每条：步骤+断言+所需夹具，标注对应契约条目）
3) 附测试环境预备说明（依赖安装/运行入口/mock 端点）。不执行测试、不建分支（含 worktree）、不 push（run12 fei 越界实锤：建 worktree 跑测试提交报告）。正式执行任务书稍后另发（届时以集成分支为准核对用例后执行）。无需结论行，完成即止。" "$(agent_mxid qi),$(agent_mxid wei)"

    dispatch_in_room fei "@fei-agent:matrix.test 【测试预备轮（流式流水线，不执行不交付）】开发四路编码进行中，集成分支尚未建立。请现在做测试预备：
1) 工作区 $(workspace fei)：git pull origin main，读 docs/design/${RFD_ID}-architecture-design.md 契约
2) 起草收银台前端逻辑层测试用例（支付方式双端排序/隐藏、倒计时关单提示、失败重试不重复下单、结果三态）到 test-drafts/TEST-FE-draft.md（每条：步骤+断言）。不执行测试、不建分支（含 worktree）、不 push（run12 fei 越界实锤：建 worktree 跑测试提交报告）。正式执行任务书稍后另发。无需结论行，完成即止。" "$(agent_mxid fei),$(agent_mxid mei)"
    sset test_prep_d1 1
    note "[流水线] 测试预备轮已派（用例前移，纪律 27②）"
  fi

  # 渠道规格含空格：字段用 | 分隔 + IFS read（同 release 步）；空白分词会把
  # "财付通(V3 jsapi 下单 ...)" 截成 "财付通(V3"，$4 拿不到完整规格（P3）。
  # 提速② 六路齐发（2026-10-09 提速决议）：渠道双路不再等契约件分支——派发词自含
  # ChannelAdapter 接口契约，独立部分（参数包/mock/骨架/纯逻辑）先行，契约件分支
  # 落地后 rebase 补对接。省契约件锚等待窗（run11 实测 1.5-2h）；代价：rebase 合并
  # 冲突风险上升，冲突以契约为准。
  if [[ -z "$(sget devimpl_d2)" ]]; then
    for spec in "hu|DEV-CHWX|csw-channel-wechat|财付通(V3 jsapi 下单 wx.requestPayment 参数包 回调验签 查单 关单)" \
                "lin|DEV-CHALI|csw-channel-alipay|支付宝(alipay.trade.create my.tradePay tradeNO RSA2 验签 查单 关单)"; do
      IFS='|' read -r who task app chan <<< "$spec"
      dispatch_in_room "$who" "@$who-agent:matrix.test 执行开发任务 ${task}（${app}，2 人日）。任务纪律（先拆分再编码，2026-10-01 用户裁决）：拆成 2-3 件子任务（每件 ≤1 人日、独立验收口径），kanban 建主卡+link 子卡（含工作量与 --raci）；逐子任务实现且每件至少一个独立 commit（消息含子任务 ID）。
每子件完成即 push（增量推送，不等全部完工）+群内一行 PROGRESS-<任务ID>-<子件ID>（一句话进度锚）；首个 commit=骨架（接口签名+目录+测试骨架），推后 @会签人 群内一句骨架评审（偏差先纠偏再续）——干预点纪律（2026-10-09 四件：拆卡/中间锚/骨架前移/可见性）。
工作区 $(workspace "$who")（先 git fetch && git checkout -b feat/${task} origin/main）。接口契约以本派发词与概设为准：先做独立部分（${chan} 的参数包/mock/目录骨架/纯逻辑测试），不等契约件分支；待 origin/feat/DEV-PAYCORE-C 出现后 git fetch && git rebase origin/feat/DEV-PAYCORE-C 补 ChannelAdapter 接口对接，冲突以契约为准。
1) 实现 apps/${app}：统一 ChannelAdapter 接口（createOrder/queryOrder/closeOrder/verifyNotify），${chan}；渠道 HTTP 一律 mock
2) vitest 单测 ≥6 用例全绿（运行输出保存到 docs/evidence/${task}-testlog.txt 随分支提交，G3 证据，缺件判未完成；发结论行前自检该 testlog 文件已在分支上存在且非空——左移件 d；testlog 末尾附 npm audit --omit=dev 摘要段（漏洞计数+top 项，无法联网时写明「npm audit 不可达」一行——安全合规件 run15 前置 P3-7③）。提交纪律：git add 只取本任务改动与 docs/evidence/${task}-testlog.txt 显式路径；基于 feat/DEV-PAYCORE 起分支自带的他任务 testlog 若被本地复跑改动，提交前必须 git checkout 还原，严禁随本分支提交（integration 合并 add/add 冲突实锤）；3) push origin feat/${task}；结论行 DEV-DONE-${task}。${ACP_NOTE}边界纪律：交付仅限 push origin feat/<你的任务分支>；不得直接推 origin/main；不得代做他人/他域任务。不许谎报。" "$(agent_mxid $who),$(agent_mxid wei)"
    done
    sset devimpl_d2 1
  fi

  # 契约件锚（提速② 后降级为观察锚：渠道已先行，S/N rebase 链与集成仍以契约为准）
  MX_PROGRESS_FN=dev_progress_ping   # 干预点 B：长等待进度锚（180s 节流出推进行，根治静默盲窗）
  wait_alive_truth "origin 出现 feat/DEV-PAYCORE-C 契约件分支（S/N rebase 锚+集成依据）" 1800 chen branch_fresh "feat/DEV-PAYCORE-C" \
    || { note "[观察] DEV-PAYCORE-C 契约件未达"; echo "ISSUE|dev-branch-missing|DEV-PAYCORE-C|契约件分支未推送" >> "$EVID_DIR/issues.log"; }
  # 并发多锚等待（run11 根治③：串行 for 令滞后锚的催办排队——lin 沉睡 125min 实锤）
  wait_alive_truth_multi 1800 "hu,lin,xiao" \
    "渠道批：origin 出现 feat/DEV-CHWX 分支（本轮新鲜）@hu@branch_fresh feat/DEV-CHWX" \
    "渠道批：origin 出现 feat/DEV-CHALI 分支（本轮新鲜）@lin@branch_fresh feat/DEV-CHALI" \
    "origin 出现 feat/DEV-MP 分支（本轮新鲜）@xiao@branch_fresh feat/DEV-MP" \
    || { for b in DEV-CHWX DEV-CHALI DEV-MP; do note "[观察] $b 分支未达（记问题单）"; echo "ISSUE|dev-branch-missing|$b|分支未推送" >> "$EVID_DIR/issues.log"; done; }
  wait_alive_truth_multi 1800 "chen" \
    "origin 出现 feat/DEV-PAYCORE-C 分支（本轮新鲜）@chen@branch_fresh feat/DEV-PAYCORE-C" \
    "origin 出现 feat/DEV-PAYCORE-S 分支（本轮新鲜）@chen@branch_fresh feat/DEV-PAYCORE-S" \
    "origin 出现 feat/DEV-PAYCORE-N 分支（本轮新鲜）@chen@branch_fresh feat/DEV-PAYCORE-N" \
    || { for b in DEV-PAYCORE-C DEV-PAYCORE-S DEV-PAYCORE-N; do note "[观察] $b 分支未达（记问题单）"; echo "ISSUE|dev-branch-missing|$b|分支未推送" >> "$EVID_DIR/issues.log"; done; }
  # 越界守卫：main 污染反查 + 提交粒度观察（过度交付盘查 C 件）
  _mb="$(sget devimpl_main_base)"
  if [[ -n "$_mb" ]]; then
    _poll=$(git -C "$DIRECTOR_CLONE" log --format="%h|%an|%s" "$_mb"..origin/main -- apps/ docs/evidence/ 2>/dev/null | head -5)
    if [[ -n "$_poll" ]]; then
      note "[观察] origin/main 在开发段被直接推进（${_poll}）——记 main 污染问题单（集成应走 defect 步导演职权）"
      echo "ISSUE|main-pollution|devimpl|开发段 origin/main 出现 DEV 域直推提交（首条：$(echo "$_poll" | head -1 | cut -d'|' -f1-3)）" >> "$EVID_DIR/issues.log"
    fi
  fi
  for b in DEV-PAYCORE-C DEV-PAYCORE-S DEV-PAYCORE-N DEV-CHWX DEV-CHALI DEV-MP; do
    if git -C "$DIRECTOR_CLONE" show-ref --verify --quiet refs/remotes/origin/feat/$b; then
      _n=$(git -C "$DIRECTOR_CLONE" rev-list --count origin/main..origin/feat/$b 2>/dev/null || echo 0)
      (( _n > 12 )) && note "[观察] $b 提交粒度 ${_n} 个（任务书口径 2-6）——过度细分/返修循环观察项，记台账不判负"
    fi
  done
  unset MX_PROGRESS_FN
  # 干预点 A 机械巡检（纪律 31 落地）：>1 人日腿拆分交付证据=分支 ≥2 commit（子件逐件提交）；
  # 单 commit=拆分证据缺失记单不阻断——机械验收替代自觉，下轮派发词据此回灌收紧。
  for b in DEV-MP DEV-CHWX DEV-CHALI; do
    _sc=$(git -C "$DIRECTOR_CLONE" rev-list --count "origin/feat/$b" ^origin/main 2>/dev/null || echo 0)
    if (( _sc < 2 )); then
      echo "ISSUE|split-evidence-missing|$b|分支仅 ${_sc} commit（>1 人日腿按纪律 31 应逐子件提交，拆分证据缺失）" >> "$EVID_DIR/issues.log"
      note "[观察] $b 拆分证据缺失（分支 ${_sc} commit，纪律 31 巡检记单）"
    fi
  done
  # G3 本地门禁证据真查：每条分支须含测试运行输出（docs/evidence/<任务>-testlog.txt）；
  # ACP 后端启用时加查委托日志（materials/delegate-log.txt）——后端指纹缺失记单
  for b in DEV-PAYCORE-C DEV-PAYCORE-S DEV-PAYCORE-N DEV-CHWX DEV-CHALI DEV-MP; do
    repo_branch_has "feat/$b" "docs/evidence/$b-testlog.txt" \
      || { note "[观察] $b 缺本地测试输出证据（G3，记问题单）"; \
           echo "ISSUE|g3-local-gate-missing|$b|分支缺 docs/evidence/$b-testlog.txt" >> "$EVID_DIR/issues.log"; }
    if [[ "${MX_ACP_BACKEND:-0}" == "1" ]]; then
      repo_branch_has "feat/$b" "materials/delegate-log.txt" \
        || { note "[观察] $b 缺 ACP 委托日志（编码后端承载面，记问题单）"; \
             echo "ISSUE|acp-backend-delegate-log-missing|$b|分支缺 materials/delegate-log.txt（未走编码后端）" >> "$EVID_DIR/issues.log"; }
    fi
  done
  gate_review chen "G3-代码实现闸-csw-pay-core"
  gate_review hu "G3-代码实现闸-csw-channel-wechat"
  gate_review lin "G3-代码实现闸-csw-channel-alipay"
  gate_review xiao "G3-代码实现闸-csw-cashier-mp"
  capture_step "devimpl_done" "/app/ide"

  sset devimpl_done 1
  sset_once g3_code_pass "$(date +%s)"   # G3 硬闸键（独立审计意见 R-A4：G3 曾无 g3_ 落键，治理报告跳闸）
  # M3 事件化：P3 done（开发实施+自测收口）→ G3 pass（本地门禁）→ case→P4
  dlv_enabled && dlv_scenario_phase P3 chen G3 chen command-exit "devimpl 分支自测+评审过" P4
fi

# ══ 步骤 16b：合并集成 + 测试执行 + 缺陷闭环 ═════════
if step_reached defect && [[ -z "$(sget defect_done)" ]]; then
  # 段界锚（run13 复盘 A12）：并行度实测以「── devimpl → ── defect」取窗，本行须最先落
  note "── defect：集成合并+测试执行+缺陷闭环段起（devimpl 段收尾分界锚）"
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
    # 跟踪文件脏改防撞（09-26 实锤：app-registry/org/freeze 未提交残留挡 checkout，
    # set -e 静默击杀）。产物性脏改先收编提交，不丢证据。
    if [[ -n "$(git status --porcelain 2>/dev/null | head -1)" ]]; then
      git add -A >/dev/null 2>&1 || true
      git commit -q -m "director(${RFD_ID}): 未提交产物收编（integration checkout 前置）" >/dev/null 2>&1 || true
      # 收编自验证（r4）：commit 被钩子/锁挡下时 checkout 仍会被挡且 set -e 静默击杀——
      # 复查仍有脏改即记 ISSUE 并显式失败，不再无声退场。
      if [[ -n "$(git status --porcelain 2>/dev/null | head -1)" ]]; then
        echo "ISSUE|integration-checkout-blocked|director|收编后仍有脏改，checkout 预期被挡" >> "$EVID_DIR/issues.log"
        fail "integration checkout 前置收编失败：工作树仍有脏改（见 issues.log）"
      fi
    fi
    # 基线变更受控（独立审计意见 R-A3，run2 0ab43de 实锤）：旧约定每轮 -B 从
    # origin/main 重建 + 非快进回落强推，两轮重建各丢 23/一批提交
    # （DEF-BE-001 修正线、FE 修复线 78ee897/65bb44f、verify-guard-onpay.js、
    # pay-button-guard.test.ts、G3/G4 testlog 全数从基线消失，双缺陷回归进发布
    # 基线）。改增量 merge 续建：旧集成头是 HEAD 祖先=历史保留，修复线恒在；
    # 推送禁强推（强推即再丢线成因），被拒记单不中止。
    git fetch -q origin
    BASE="origin/main"
    git rev-parse -q --verify "refs/remotes/origin/integration/${RFD_ID}" >/dev/null 2>&1 \
      && BASE="origin/integration/${RFD_ID}"
    OLD_TIP="$(git rev-parse "$BASE" 2>/dev/null || echo "")"
    git checkout -q -B "integration/${RFD_ID}" "$BASE"
    merge_keep_history() { # <ref> <label>：merge --no-ff；冲突仅 testlog 污染副本时取 integration 正本
      if ! git merge -q --no-ff "$1" -m "merge: $2 into integration/${RFD_ID}" 2>/dev/null; then
        local CONFLICTS
        CONFLICTS="$(git diff --name-only --diff-filter=U 2>/dev/null)"
        if [[ -n "$CONFLICTS" ]] && ! printf '%s\n' "$CONFLICTS" | grep -vE '^docs/evidence/[A-Z0-9-]+-testlog\.txt$' | grep -q .; then
          printf '%s\n' "$CONFLICTS" | while read -r cf; do git checkout --ours -- "$cf" 2>/dev/null; git add -- "$cf" 2>/dev/null; done
          git commit -q --no-edit 2>/dev/null || true
          note "[观察] $2 合并冲突仅限 testlog 污染副本，已取 integration 正本自动收口"
          echo "ISSUE|merge-conflict-autoresolved|$2|testlog 副本冲突已取 integration 正本收口（仍记单追踪提交纪律）" >> "$EVID_DIR/issues.log"
        else
          git merge --abort 2>/dev/null || true; echo "ISSUE|merge-conflict|$2|integration 合并冲突" >> "$EVID_DIR/issues.log"
        fi
      fi
    }
    merge_keep_history origin/main "origin-main"   # 主线同步（首建时 BASE=origin/main，空合幂等）
    for b in DEV-PAYCORE-C DEV-PAYCORE-S DEV-PAYCORE-N DEV-CHWX DEV-CHALI DEV-MP; do
      # 分支缺席前置检查（2026-10-04 run8 实锤：hu/xiao 停摆未推分支，devimpl 按回灌语义
      # 记单放行后，此处对不存在 ref 的 merge 走 not-something-we-can-merge → abort 128 崩溃环）。
      # 缺席=跳过合并+如实记单，集成以已交付分支继续。
      if ! git rev-parse -q --verify "refs/remotes/origin/feat/$b" >/dev/null 2>&1; then
        echo "ISSUE|integration-branch-missing|$b|feat/$b 未在 origin（开发交付缺席，integration 跳过该分支）" >> "$EVID_DIR/issues.log"
        note "[观察] feat/$b 缺席 origin——跳过合并并记单（已交付分支继续集成）"
        continue
      fi
      merge_keep_history "origin/feat/$b" "$b"
    done
    # 丢线守卫：旧基线头必须仍是 HEAD 祖先，否则本轮基线无效、如实记账（R-A3）
    if [[ -n "$OLD_TIP" ]] && ! git merge-base --is-ancestor "$OLD_TIP" HEAD 2>/dev/null; then
      echo "ISSUE|baseline-history-lost|${RFD_ID}|integration/${RFD_ID} 集成后旧基线 ${OLD_TIP:0:7} 非祖先（丢线，基线不可用）" >> "$EVID_DIR/issues.log"
    fi
    # 推送只走常规（R-A4 防再丢机制：禁强推）；被拒记单不中止，后续步骤用显式
    # origin/integration 引用，不看 HEAD。
    git push -q -u origin "integration/${RFD_ID}" 2>/dev/null \
      || echo "ISSUE|integration-push|${RFD_ID}|integration/${RFD_ID} 推送被拒（已禁强推，变更受控）" >> "$EVID_DIR/issues.log" )
  # 措辞与事实解耦（run7 实录误读源）：结果按实际路径分述——成功=已推送；被拒=已记单
  if git rev-parse -q --verify "refs/remotes/origin/integration/${RFD_ID}" >/dev/null 2>&1; then
    note "[集成] integration/${RFD_ID} 四开发分支已合并并推送 ✓（origin 可反查）"
  else
    note "[集成] integration/${RFD_ID} 本地合并完成、推送未达（已记问题单，见 issues.log）"
  fi

  # ── 契约执行观察（run15 前置 P4-10，影子模式：产物落 evidence+报告透传，不进
  # G4 强制线——概设接口签名 vs 渠道实现导出面 diff，qgate contract executor 同构
  # 语义；run15 实测一轮后按方案 P4-10 转正路径换 CLI 单门+强制线）──
  if node "$SCRIPT_DIR/mux/contract-observe.mjs" --run="${RUN_ID}" --rfd="${RFD_ID}" >/dev/null 2>&1; then
    _cbreak=$(python3 -c "import json;print(len(json.load(open('$EVID_DIR/qgate-contract-observation.json')).get('breaking',[])))" 2>/dev/null || echo '?')
    if [ "$_cbreak" = "0" ]; then
      note "[契约] ChannelAdapter 契约面成立（观察器 breaking=0——期望 4 方法×双渠道实现齐；evidence/qgate-contract-observation.json，影子模式）"
    else
      note "[契约] 契约面 breaking=${_cbreak} 项（evidence/qgate-contract-observation.json——影子模式如实呈现，run15 转正后进 G4 强制线）"
    fi
  else
    echo "ISSUE|contract-observe|defect|契约观察器执行失败（contract-observe.mjs）——影子模式记单不阻断" >> "$EVID_DIR/issues.log"
  fi

  if [[ -z "$(sget defect_dispatched)" ]]; then
    # ── V8.8 纪律 33：测试左移③ QUALITY 质量合规检验（触发=DEV-DONE+integration 就绪；
    # run15 首验）。段-段族分工：研发自测=核心 11 项门禁、QUALITY 段=全 56 项四族。──
    if [[ -z "$(sget quality_dispatched)" ]]; then
      dispatch_in_room mei "@mei-agent:matrix.test 测试左移任务 QUALITY-${RFD_ID}（质量合规检验，全 56 门禁四族——研发自测已跑核心 11 项，你跑全量不重复研发面）：
在 integration/${RFD_ID} 合并基线上执行门禁套件 precheck --all-full（execute_code 单回合），报告原文落 docs/evidence/QUALITY-${RFD_ID}-report.md（随 integration 分支提交）；FUNC 功能白盒（覆盖率+关键路径抽检）由测试线随后按 INT 案例执行，不在本任务。
结论行 QUALITY-DONE-${RFD_ID} gates=M/N（行首，M=通过门禁数/N=总门禁数；未绑执行器的门禁计入无信号桶如实呈现，禁虚报全绿）。工作区 $(workspace mei)。不许谎报。" "$(agent_mxid mei),$(agent_mxid qi)" \
        && sset quality_dispatched 1
    fi
    _m19=$(dispatch_in_room qi "@qi-agent:matrix.test 执行测试任务 TEST-BE（后端三应用集成测试）。
（预备轮衔接：若你工作区 test-drafts/TEST-BE-draft.md 已有用例草稿，核对契约后补齐执行，未起草则从零写——两态均正常。）
工作区 $(workspace qi)：git fetch && git checkout -b test/TEST-BE origin/integration/${RFD_ID}
1) 按概设契约编写接口/集成测试（vitest 放 apps/test-integration/）：下单幂等、双渠道调起参数、回调验签拒绝、重复回调幂等、超时关单
2) 执行全量测试；发现缺陷走 defect-loop 技能：本群发【缺陷】消息 @对应研发-agent（P级/复现/期望实际/分支commit）
3) 结论行 TEST-PASS-TEST-BE 或 TEST-FAIL-TEST-BE（附用例数）。不许谎报。
干预点纪律：用例先行——先出用例清单骨架（分组+命名）@会签人 一句确认后展开；每组完成即 push+群内一行 PROGRESS-TEST-BE-<组>（一句话进度锚）。" "$(agent_mxid qi),$(agent_mxid wei)")
    sset m19_marker "$_m19"
    dispatch_in_room fei "@fei-agent:matrix.test 执行测试任务 TEST-FE（收银台前端测试）。
（预备轮衔接：若你工作区 test-drafts/TEST-FE-draft.md 已有用例草稿，核对契约后补齐执行，未起草则从零写——两态均正常。）
工作区 $(workspace fei)：git fetch && git checkout -b test/TEST-FE origin/integration/${RFD_ID}
1) 测试 csw-cashier-mp 逻辑层：支付方式双端排序/隐藏、倒计时关单提示、失败重试不重复下单、结果三态
2) 缺陷走 defect-loop 技能发【缺陷】@xiao-agent；3) 结论行 TEST-PASS-TEST-FE 或 TEST-FAIL-TEST-FE。不许谎报。
干预点纪律：用例先行——先出用例清单骨架（分组+命名）@会签人 一句确认后展开；每组完成即 push+群内一行 PROGRESS-TEST-FE-<组>（一句话进度锚）。" "$(agent_mxid fei),$(agent_mxid mei)"
    sset defect_dispatched 1
  fi
  # 必采对话挂钩在幂等块外（run14 复盘 B3 抗重启加固：r18-collect 幂等拒重）
  if [[ -n "$(sget m19_marker)" ]]; then
    python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" dialog --step 19 --room "$(sget room_analysis)" --anchor "$(sget m19_marker)" --title "测试执行派发全文（qi/TEST-BE）" >/dev/null 2>&1 || true
  fi

  # 派发时间戳（ms，持久化）：真值门禁只认派发之后的消息——历史轮残留的
  # TEST-PASS/缺陷消息曾让门禁在派发后 1 秒即判「零缺陷轮真值」（假完成）
  sset test_dispatch_ts $(( $(date +%s) * 1000 ))
  SINCE_TS=$(sget test_dispatch_ts)

  # 缺陷流观测窗：房间出现【缺陷】则等待对应 FIX-DONE 回执
  DEFECT_WINDOW_END=$(( $(date +%s) + 5400 ))
  _last_nudge_ts=0
  _last_fixed_count=0
  _stall_rounds=0
  while (( $(date +%s) < DEFECT_WINDOW_END )); do
    auto_approve "$SCAN_ROOM" || true
    # V8.8 纪律 34⑤：缺陷卡建卡真伪校验（每 ~5 分钟一轮；占位/不在编制的 assignee
    # 记单+群内催办重填——run14 实证三卡烂待办一小时根因）。输出重定向防 set -e。
    if (( $(date +%s) - _last_nudge_ts >= 300 )); then
      _assignee_bad=""
      for _b in qi-test-pay fei-test-fe; do
        _v=$(defect_cards_assignee_check "$_b" 2>/dev/null) || true
        [[ -n "${_v:-}" ]] && _assignee_bad="${_assignee_bad} ${_b}:${_v}"
      done
      if [[ -n "$_assignee_bad" ]]; then
        echo "ISSUE|defect-cards-assignee|testers|缺陷卡 assignee 占位/不在编制（${_assignee_bad}）——建卡真伪校验打回，催办重填（V8.8 纪律 34⑤）" >> "$EVID_DIR/issues.log"
        mx_send "$(load_token fanfan)" "$SCAN_ROOM" "@qi-agent @fei-agent 缺陷卡 assignee 核验未过（${_assignee_bad}）：占位值（default/空/不在板团队名单）过得了必填校验但无人能领。请立即用板 board.json 团队名单里的 agent 档案名重填 assignee（板级认领围栏按实名精确匹配），重填后一行回执 ASSIGNEE-FIXED <卡ID>。禁静默。" "$(agent_mxid qi),$(agent_mxid fei)" >/dev/null 2>&1 || true
      fi
      _last_nudge_ts=$(date +%s)
    fi
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
    # V8.8 纪律 34④：环内禁静默——缺陷在途（DEFECTS>FIXED）且 15 分钟无新 FIX-DONE
    # 即群内重发提醒；再 15 分钟仍无进展报 LOOP-BLOCKED（记单不中止，窗口到期兜底）。
    if (( DEFECTS > FIXED )); then
      if (( FIXED > _last_fixed_count )); then
        _last_fixed_count=$FIXED; _stall_rounds=0
      else
        _stall_rounds=$(( _stall_rounds + 1 ))
        if (( _stall_rounds == 30 )); then
          mx_send "$(load_token fanfan)" "$SCAN_ROOM" "@qi-agent @fei-agent 缺陷修复环在途静默约 15 分钟（在途 ${DEFECTS} 缺陷 / 已修 ${FIXED}）：请对应研发档案回执进度（FIX-DONE-DEF-X commit=<id> branch=<名> 或一句「修复中，预计 N 分钟」），复测侧收到 FIXED 即拉取复测。禁静默。" "$(agent_mxid qi),$(agent_mxid fei)" >/dev/null 2>&1 || true
          note "[催办] 缺陷环静默 15 分钟，已重发提醒（纪律 34④）"
        elif (( _stall_rounds == 60 )); then
          echo "ISSUE|defect-loop-blocked|testers|缺陷修复环连续 30 分钟无新 FIX-DONE（在途 ${DEFECTS}/已修 ${FIXED}）——按纪律 34④ 如实报 LOOP-BLOCKED，等待窗口到期或人工介入" >> "$EVID_DIR/issues.log"
          note "[问题] 缺陷环 LOOP-BLOCKED 记单（纪律 34④）"
        fi
      fi
    else
      _stall_rounds=0
    fi
    sleep 30
  done
  sset defect_done 1
fi

# ══ 步骤 17：测试通过登记 + 测试报告 ═════════════════
if step_reached testpass && [[ -z "$(sget testpass_done)" ]]; then
  # 前置守卫口径=origin/integration（run8 优化 B）：报告按派发词只进 integration 分支，
  # repo_has（origin/main）查它=永假——run7 六代重启代代白派报告任务书（jq 崩溃期）的
  # 放大器。与下方 wait_alive_truth 等待谓词同口径（test_report_on_integration）。
  if ! test_report_on_integration "${RFD_ID}"; then
    dispatch_in_room qi "@qi-agent:matrix.test 请出具测试报告：
1) 在 integration/${RFD_ID} 分支汇总测试结果，写 docs/test/${RFD_ID}-test-report.md（范围/用例数/通过数/缺陷清单及状态/结论/通过时的 git commit id）
2) push origin integration/${RFD_ID}
3) 把通过的 git commit id 通过 kanban 更新到所有关联开发/测试/需求任务（你能访问本账号的板；其他账号的由你发 matrix 通知其 owner-agent 更新）
结论行 REPORT-DONE 开头。不许谎报。" "$(agent_mxid qi)"
    wait_alive_truth "测试报告入库" 1800 qi test_report_on_integration "${RFD_ID}" \
      || { note "[观察] 测试报告未达"; echo "ISSUE|test-report-missing|qi|测试报告未入库" >> "$EVID_DIR/issues.log"; }
  fi
  gate_review qi "G4-测试过闸"
  capture_step "testpass_done" "/app/board"

  sset testpass_done 1
  sset_once g4_pass "$(date +%s)"   # V3：G4 硬闸键（未验证不发布）
  # M3 事件化：P4 done（集成+缺陷闭环+测试报告）→ G4 pass（非实现者 tester）→ case→P5
  dlv_enabled && dlv_scenario_phase P4 qi G4 qi command-exit "testpass 测试报告入仓+G4 硬闸置位" P5
fi

# ══ 步骤 20：ready（G5 发布准出评审，V3 新增；吸收原 templates 模板完备性）══
# fanfan-review 板登记准出卡，@fanfan-agent 按七项检查单回结论。
# 套模板：release-plan.md（灰度/数字阈值回滚/观察窗口/HumanGate）+ release-notes.md（面向用户收益）。
# 硬闸：G4 未过不得评审；G5 未过不得发布。
if step_reached ready && [[ -z "$(sget ready_done)" ]]; then
  gate_blocked g4_pass ready   # V3 硬闸：G4 未过不进发布准出
  # 判词锚点=本轮起跑时刻（run8 优化 E）：派发时刻锚会把重启前已存在的结论行排除在
  # 窗外，relay 换代后只能整轮重评（run7 首评 1800s 死墙超时+重评 20m 实录）。起跑锚
  # 使既有判词可见可复用；旧轮残留由 branch/repo 同款新鲜度语义兜住（新一轮房间重建）。
  G5_TS=$(( $(sget run_started_at) * 1000 ))
  # 过闸收口（复用与新评同一收口路径：置卡 done/落键/批准留痕/M3 事件——防两路漂移）
  g5_pass_finalize() {
    kanban_walk_done fanfan "$RGID"
    sset_once g5_ready "$(date +%s)"
    # HumanGate 批准留痕（独立审计意见 #6）：批准事件入 approved.events 可反查，
    # 不再只有口头 note；"审批人即推演操作者"的独立性局限如实记档（ISSUES 记账）。
    echo "humangate:${RGID} G5-HUMANGATE-APPROVED director-human $(date +%s)" >> "${APPROVED_LOG:-$EVID_DIR/approved.events}"
    note "[G5] 发布准出通过（评审卡 ${RGID} → done；HumanGate=导演批准，事件入 approved.events）"
    # §4.4-4 QGate 证据接线（v1.31.1 条款：来源分布随行，禁手抄全绿）：G5 过闸即对
    # 中央仓跑 release-report，原文落 evidence。门未绑执行器=INCONCLUSIVE 全列（无信号桶），
    # 如实呈现不算全绿——绑定真跑留下轮（骨架部署锚：中央仓 1edcc23）。
    # run13 复盘 B2 根修：CLI 存在 unresolved 门时以 rc=1 退出但报告已写出——
    # 以产物在位为准，不以 rc 判成败（run13 的 11 张「CLI 缺失」单全是此误诊）。
    ( cd "$DIRECTOR_CLONE" && node "$OVERLAY_ROOT/custom/qgate/dist/cli.js" release-report ) >/dev/null 2>&1 || true
    if [[ -f "$DIRECTOR_CLONE/.qgate/release-report.md" ]] \
       && cp "$DIRECTOR_CLONE/.qgate/release-report.md" "$EVID_DIR/qgate-release-report.txt" 2>/dev/null; then
      note "[G5] QGate release-report 已落盘（evidence/qgate-release-report.txt，来源分布随行；unresolved 门=无信号桶如实呈现）"
    else
      issue_once qgate-evidence step20 "QGate release-report 落盘失败（CLI 缺失或骨架未部署）——门禁证据缺席记单"
      note "[G5] QGate release-report 落盘失败（记问题单）"
    fi
    # M3 事件化：G5 pass（HumanGate=PM 人类 sender；P5 done 在 UAT 收口后发）
    # lite 轮守卫（run13 实锤：夹具跳过早期步时 dlv_room/dlv_case 未初始化，直调
    # dlv_gate 缺参 exit 4 被 set -e 击杀驱动成重启循环）：与 dlv_scenario_phase
    # 同款「无案例房即跳过」，跳过如实记 note（报告侧按缺事件呈现，不补造）。
    if [[ -n "$(sget dlv_room)" && -n "$(sget dlv_case)" ]]; then
      dlv_gate fanfan "$(sget dlv_room)" "$(sget dlv_case)" G5 pass human "发布准出七项过（评审卡 ${RGID}）"
    else
      note "[M3] delivery 未启用（无案例房），跳过 G5 gate 事件（lite 轮：早期步夹具跳过致案例未开）"
    fi
    return 0   # dlv 未启用时末行 && 列表返回 1，函数调用是裸命令会被 set -e 击杀（包装引入的差异）
  }
  # 评审卡幂等（run8 优化 E）：卡 ID 落 state，重启复用不再重复建卡
  RGID="$(sget g5_rgid)"
  if [[ -z "$RGID" ]]; then
    RGID=$(kanban_create_as fanfan g5_ready "${RFD_ID} 发布准出评审（G5）" \
      "七项检查单见派单。结论行 READY-GATE-PASS 或 READY-GATE-FAIL(附缺项)。" fanfan-review fanfan-researcher)
    sset g5_rgid "$RGID"
  fi
  # 判词复用（run8 优化 E）：本轮已有 PASS 判词（房间行+卡面双源合并）直接收口不重派
  if [[ "$(mx_gate_verdict_combined "$(sget room_analysis)" "$(agent_mxid fanfan)" READY-GATE "$G5_TS" fanfan "${RFD_ID} 发布准出评审")" == "PASS" ]]; then
    note "[真值] G5 判词复用（本轮既有 PASS 结论行，不重派评审）✓"
    g5_pass_finalize
  else
    mx_gate_breaker_check g5 "G5 发布准出"   # 熔断：两轮未过不得发布（跨调用持久；已 PASS 复用不受历史 FAIL 计数拦）
    dispatch_in_room fanfan "@fanfan-agent:matrix.test 测试报告已在 integration/${RFD_ID}，请执行 G5 发布准出评审（评审卡 ${RGID}@fanfan-review 板，按 templates/release-plan.md 与 release-notes.md 产出）：
1) G4 证据已挂关联任务卡
2) 构建产物同 commit 可复现（integration commit 存在、分支树干净）
3) 依赖无新增（package 清单 diff）
4) 回滚方案具体化：数字阈值触发条件（如崩溃率>0.5%）+ 命令级步骤 + 72h 观察窗口与盯梢项
5) 灰度计划：5%→25%→100% 与各档观察期
6) 发布说明：面向用户收益（不贴 commit 罗列）
7) 对外发布 HumanGate：本推演由导演人工批准（批准记录落评审卡）
评审记录落卡 body（review-record 结构）。评审过程分节落卡：卡 body 按上述 1)-7) 要素分节（每节一行判词+证据指针；未评节标 TODO、缺项节标 GAP）——过程可见、缺项可边评边补，禁终态一次性打回重做（run11 左移件 e：G5 两轮打回实录）。结论行 READY-GATE-PASS 或 READY-GATE-FAIL（附缺项，写在行首；旧判词→复审改判时用「→ 复审改判」句式、新判词放末尾）。结论行发出后回读群里确认可见，未见即重发一次。不许谎报。" "$(agent_mxid fanfan)"
    # 活性等待（run8 优化 E）：固定 1800s 死墙在 agent 真干活时也会超时（run7 首评实录）；
    # fanfan 日志持续增长=还在产出，零增长 idle 窗才判空转退出。
    if wait_alive_truth "房间出现 READY-GATE 结论行（判词语义）" 3600 fanfan mx_gate_verdict_seen "$(sget room_analysis)" "$(agent_mxid fanfan)" READY-GATE "$G5_TS"; then
      # 判词合并（R-A2，run2 实锤）：房间行判词子串曾被「转述 stub 原文」消息命中
      # （"结论行 READY-GATE-PASS 或 READY-GATE-FAIL"）→ G5 误过；真实卡面结论是
      # READY-GATE-FAIL。双源合并 FAIL 优先，FAIL 不得置卡 done、不得落键。
      if [[ "$(mx_gate_verdict_combined "$(sget room_analysis)" "$(agent_mxid fanfan)" READY-GATE "$G5_TS" fanfan "${RFD_ID} 发布准出评审")" == "PASS" ]]; then
        g5_pass_finalize
      else
        echo "ISSUE|g5-ready-fail|fanfan-agent|${RFD_ID} G5 FAIL（缺项见评审卡），回灌补齐" >> "$EVID_DIR/issues.log"
        mx_gate_breaker_trip g5 "G5 发布准出" 1
        G5_RETRY_TS=$(( $(date +%s) * 1000 ))
        dispatch_in_room fanfan "@fanfan-agent:matrix.test G5 退回：按评审卡 ${RGID} 缺项补齐（回滚阈值/灰度/发布说明）后重报结论行（须同步更新评审卡 body 判词，卡面与房间行一致才放行）。" "$(agent_mxid fanfan)"
        if wait_truth "补齐后 READY-GATE-PASS（判词语义）" 2400 mx_gate_combined_pass "$(sget room_analysis)" "$(agent_mxid fanfan)" READY-GATE "$G5_RETRY_TS" fanfan "${RFD_ID} 发布准出评审"; then
          # 补齐轮与复用/首轮同一收口（2026-10-07 run10 实锤：本路径曾内联收口漏发
          # dlv_gate G5 pass——交付案例面板 G5 门禁灯灰，记单 delivery-g5-gate-event-missing）
          g5_pass_finalize
        else
          mx_gate_breaker_trip g5 "G5 发布准出" 1
          fail "G5 两轮未过，不得发布（V3 硬闸）"
        fi
      fi
    else
      echo "ISSUE|g5-review-missing|fanfan-agent|G5 结论行 3600s 未达" >> "$EVID_DIR/issues.log"
      fail "G5 发布准出超时，中止（V3 硬闸）"
    fi
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
    echo "# ${RFD_ID} 任务完备性检查（$(date '+%F %T')）"
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
    echo
    # 分类/优先级/依赖（§8.8 发布准出第⑦项：完备性检查防多漏错重的三个维度；
    # run8 复盘：8.6 核对项原为商户接入文档字段误配，生成器补真维度对齐方案）
    echo "## 分类/优先级/依赖完备性（防多漏错重）"
    echo "- 分类清点（卡面族谱）：$(kanban_list fanfan | jq -r '.. | objects | select(has("title")) | .title' | grep -oE 'T10[0-9]|G5|评审|排期|主卡' | sort | uniq -c | sort -rn | awk '{printf "%s×%s ", $2, $1}' | sed 's/ $//')"
    echo "- 优先级口径：以排期窗（D1-D11）与状态（todo/ready/blocked/done）表达——blocked=依赖等待非废弃，done=已闭环；分布见上节状态标记。"
    # 依赖核对空值兜底（run14 复盘 A10 根修）：tasklist 无独立"依赖"节时 sed 输出空，
    # 截断成半行——兜底指向排期文档依赖列，不留空尾。
    _dep_txt=$(sed -n '/^## .*依赖/,/^## /p' "$DIRECTOR_CLONE/docs/analysis/${RFD_ID}-tasklist.md" | grep -E '^- ' | head -1 | cut -c3-)
    echo "- 依赖核对（tasklist §6 声明 vs 卡覆盖）：${_dep_txt:-（tasklist 无独立依赖节——依赖声明在 docs/plan/RFD-001-schedule.md 依赖列，以该列反查卡覆盖）}"
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
  gate_review fanfan "G5-发布闸"
  sset release_done 1
  capture_step "release_done" "/app/board"   # 步20 承载面
  python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" effect --step 20 --text "G5 过闸+REL 三卡登记" --ev "cards=REL-MERGE,REL-TAG,REL-DELIVER" >/dev/null 2>&1 || true
fi

# ══ 步骤 22：uat（业务验收，V3 新增）══════════════════
# bella（需求提出方）按 G1 freeze 的 AC-1..N 逐条回验——G1 冻结标准的闭环回验。
if step_reached uat && [[ -z "$(sget uat_done)" ]]; then
  gate_blocked release_done uat
  repo_pull
  AC_LIST=$(sed -n '/^## .*验收标准/,/^## /p' "$DIRECTOR_CLONE/${RFD_DOC}" | grep -oE "AC-[0-9]+" | sort -u | tr '\n' ' ')
  [[ -n "$AC_LIST" ]] || { echo "ISSUE|uat-no-ac|director|需求书未提取到 AC 清单" >> "$EVID_DIR/issues.log"; fail "UAT 无 AC 清单可验（G1 冻结缺陷）"; }
  # fail-fast 前置（run8 优化 A）：本地廉价校验（git 引用级，秒级）前移到派单之前——
  # 缺件直接 fail+记单，不再让 agent 生成完整证据后才发现核对永败（run7 口径矛盾期
  # 每代白派一次 UAT 证据生成，18 代实录）。口径=origin/integration（与 testpass 派发词
  # 一致，3bb5b88a 修的是口径本身，此处把校验次序从"等证据后"前移到"派单前"）。
  UAT_PRE=""
  git -C "$DIRECTOR_CLONE" fetch -q origin || true
  git -C "$DIRECTOR_CLONE" rev-parse -q --verify "refs/remotes/origin/integration/${RFD_ID}" >/dev/null 2>&1 \
    || UAT_PRE="integration 分支不存在；"
  test_report_on_integration "${RFD_ID}" || UAT_PRE="${UAT_PRE}测试报告缺失（integration）；"
  repo_has "$(freeze_doc)" || UAT_PRE="${UAT_PRE}G1 冻结文件缺失；"
  if [[ -n "$UAT_PRE" ]]; then
    issue_once uat-precheck director "UAT 前置缺件（fail-fast 未派单）：${UAT_PRE}"
    fail "UAT 前置缺件：${UAT_PRE}先修上游再验收（未派发 UAT 任务）"
  fi
  # 证据锚点=本轮起跑时刻（run8 优化 A）：派发时刻锚会把重启前已到的证据行排除在窗外，
  # relay 换代后 fanfan 被迫重生成证据（run7 首份合格证据 02:08 到位、05:53 才被
  # "看见"的 3h45m 实录）。
  UAT_SINCE_SEC=$(sget run_started_at)
  UAT_TS=$(( UAT_SINCE_SEC * 1000 ))
  # curl 瞬时 HTTP 错（exit 22：429/网关抖动）在赋值位被 set -e 击杀→relay 30s 环
  # （run8 uat 二段崩溃环实锤）。证据体空走重派分支属正常语义，拉取失败须容错：
  UAT_BODY="$(uat_evidence_body "$UAT_SINCE_SEC" 2>/dev/null || true)"
  if [[ -n "$UAT_BODY" ]] && [[ -z "$(uat_ac_covered "$AC_LIST" "$UAT_BODY")" ]]; then
    # 证据复用：本轮既有结论行且逐条覆盖全部 AC——不重派，直接进核验
    note "[真值] UAT 证据复用（本轮既有合格结论行，不重派验收）✓"
  else
    _m21=$(dispatch_in_room bella "@fanfan-agent:matrix.test 业务验收（UAT）：请按 G1 冻结清单 ${AC_LIST}逐条给出证据（commit/分支/测试报告行号锚点），发结论行 UAT-EVIDENCE 开头、每条一行。编号必须逐条使用冻结清单原编号（AC-N 一一对应，不得自设编号或沿用开发任务书旧编号；一行一条冻结 AC，判词紧跟该行）。bella 将逐条核对。" "$(agent_mxid fanfan)")
    sset m21_marker "$_m21"
    # 必采对话挂钩随派发即时采+marker 持久化（run14 复盘 B3：重启重入可补采）
    python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" dialog --step 21 --room "$(sget room_analysis)" --anchor "$(sget m21_marker)" --title "UAT 验收任务书全文（bella→fanfan）" >/dev/null 2>&1 || true
    # 判据行首锚定（run5 实锤误判）：contains 会命中 agent 工作回声里的
    # hindsight_recall 预览串（"UAT-EVIDENCE AC-1 AC-2 …"），把中间态当结论行——
    # 110s 即"到位"、覆盖核验只见到 AC-1/2 误判未过。结论行约定 UAT-EVIDENCE 开头，
    # 到达与取样都按行首正则判。
    if ! wait_alive_truth "UAT 证据行到位" 1800 fanfan room_has_from "$(sget room_analysis)" "$(agent_mxid fanfan)" "^UAT-EVIDENCE" "$UAT_TS"; then
      echo "ISSUE|uat-evidence-missing|fanfan-agent|UAT-EVIDENCE 2400s 未达" >> "$EVID_DIR/issues.log"
      fail "UAT 证据行超时，中止"
    fi
    UAT_BODY="$(uat_evidence_body "$UAT_SINCE_SEC" 2>/dev/null || true)"
  fi
  UAT_OK=1; UAT_MISS=""
  # 逐条 AC 覆盖核验：UAT-EVIDENCE 结论行必须逐条列出每个 AC 编号（缺条即不通过）
  AC_MISS=$(uat_ac_covered "$AC_LIST" "$UAT_BODY")
  if [[ -n "$AC_MISS" ]]; then
    UAT_OK=0; UAT_MISS="${UAT_MISS}UAT-EVIDENCE 未逐条覆盖 AC（缺 ${AC_MISS}）；"
  fi
  git -C "$DIRECTOR_CLONE" fetch -q origin || true
  git -C "$DIRECTOR_CLONE" rev-parse -q --verify "refs/remotes/origin/integration/${RFD_ID}" >/dev/null || { UAT_OK=0; UAT_MISS="${UAT_MISS}integration 分支不存在；"; }
  # 测试报告核对口径=origin/integration（发布基线分支，与 testpass 派发词 push 目标一致）——
  # repo_has 盯 origin/main，报告按流程只进 integration，曾致 UAT 死循环九连 FAIL
  # （run7 03:53-05:42 实锤，relay 换代掩盖）。冻结件仍在 main 口径。
  git -C "$DIRECTOR_CLONE" show "origin/integration/${RFD_ID}:docs/test/${RFD_ID}-test-report.md" >/dev/null 2>&1 \
    || { UAT_OK=0; UAT_MISS="${UAT_MISS}测试报告缺失（integration）；"; }
  repo_has "$(freeze_doc)" || { UAT_OK=0; UAT_MISS="${UAT_MISS}G1 冻结文件缺失；"; }
  if [[ $UAT_OK == 1 ]]; then
    # 逐条 AC 判词（独立审计意见 #3）：验收书按证据行逐条落判词，有条件/不通过
    # 不得写成"全部通过"——放行权归需求提出方 bella（人），条件闭环后另行验收。
    UAT_ALL_PASS=1; UAT_VERDICTS=""
    for ac in $AC_LIST; do
      v=$(uat_ac_verdict "$UAT_BODY" "$ac")
      UAT_VERDICTS="${UAT_VERDICTS}${ac}=${v} "
      [[ "$v" == "通过" ]] || UAT_ALL_PASS=0
    done
    ACC="$DIRECTOR_CLONE/docs/acceptance/${RFD_ID}-acceptance.md"
    mkdir -p "$(dirname "$ACC")"
    {
      echo "# ${RFD_ID} 业务验收报告（UAT，$(date '+%F %T')）"
      echo
      echo "- 验收人：bella（需求提出方）；依据：$(freeze_doc)（G1 冻结 AC 清单）"
      echo "- 证据锚点：integration/${RFD_ID} 分支 + docs/test/${RFD_ID}-test-report.md + 房间 UAT-EVIDENCE 行"
      echo
      sed -n '/^## .*验收标准/,/^## /p' "$DIRECTOR_CLONE/${RFD_DOC}" | grep -E "^\- \*\*AC-[0-9]" \
        | while IFS= read -r l; do
            _ac=$(printf '%s' "$l" | grep -oE 'AC-[0-9]+' | head -1)
            echo "- ${l#\- } → 判词：$(uat_ac_verdict "$UAT_BODY" "$_ac")（三态：通过/有条件通过/不通过；证据见上锚点）"
          done
      echo
      echo "## SLA（ITIL 接管登记，retro 资产回写用）"
      echo "- SVC-cashier-${RFD_ID}：收银台下单/查单/关单/回调 | 全体商户 | Silver | fanfan | 运营中"
      echo "- 可用性 99.5%；下单接口 P95 ≤800ms；P2 事件 4h 响应"
      echo
      if [[ $UAT_ALL_PASS == 1 ]]; then
        echo "- 结论：判词汇总——全部 AC「通过」，验收接受。"
      else
        echo "- 结论：判词汇总（${UAT_VERDICTS}）——**不构成无条件验收**；有条件/不通过项的放行权归需求提出方 bella（人），条件闭环后另行验收。"
      fi
    } > "$ACC"
    [[ $UAT_ALL_PASS == 1 ]] || echo "ISSUE|uat-conditional|fanfan-agent|UAT 非全过（${UAT_VERDICTS}），验收有条件，放行权归 bella" >> "$EVID_DIR/issues.log"
    # 落 main 走 repo_commit_main（P4）：在 integration 上 commit 再 push origin main
    # 是空推/被拒，验收书进不了 main 且 set -e 暴毙、uat_done 落不了键。
    if repo_commit_main "docs/acceptance/${RFD_ID}-acceptance.md" "bella (UAT)" "bella@aipaydev.local" "docs(acceptance): ${RFD_ID} 业务验收（${UAT_VERDICTS}）"; then
      note "[UAT] 验收文档已入仓：docs/acceptance/${RFD_ID}-acceptance.md → origin/main"
    else
      echo "ISSUE|uat-push|director|验收文档推送 origin/main 失败（留存 ${ACC}）" >> "$EVID_DIR/issues.log"
      note "[观察] 验收文档推送失败（留存本地，记问题单）"
    fi
    sset_once uat_done "$(date +%s)"
    capture_step "uat_done" "/app/board?tab=trace"   # 步21 承载面
    if [[ $UAT_ALL_PASS == 1 ]]; then
      note "[UAT] ${RFD_ID} 业务验收通过（AC=$(echo "$AC_LIST" | wc -w | tr -d ' ') 条全过）"
    else
      note "[UAT] ${RFD_ID} 业务验收完成（${UAT_VERDICTS}）——非全过项不作无条件验收，放行权归 bella"
    fi
    # M3 事件化：P5 done（发布+UAT 验收报告）→ case→P6
    dlv_enabled && dlv_scenario_advance P5 fanfan P6 "git:main#$(git -C "${DIRECTOR_CLONE:-.}" rev-parse --short HEAD 2>/dev/null || echo na):docs/acceptance/${RFD_ID}-acceptance.md"
  else
    echo "ISSUE|uat-ac-failed|fanfan-agent|UAT 证据核对失败：${UAT_MISS}" >> "$EVID_DIR/issues.log"
    fail "UAT 验收未过（${UAT_MISS}）——缺陷回流 defect 语义"
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
  # 台账落档（run8 复盘根治：方案 §8.6 步 22 准出=work-report.md 落档，此前只写
  # evidence 致 8.6 矩阵"文件域无独立工件"）——repo_commit_main 口径进 origin/main，
  # 失败记单不中止（与验收书/意见书同族收尾语义）。
  cp "$EVID_DIR/work-report.md" "$DIRECTOR_CLONE/work-report.md"
  if repo_commit_main "work-report.md" "fanfan (workmgr)" "fanfan@aipaydev.local" "docs(work): ${RFD_ID} 工作台账落档（M3，RUN=${RUN_ID:-}）"; then
    note "[M3] 工作台账已落档 origin/main（work-report.md）"
  else
    echo "ISSUE|workreport-push|director|工作台账落档 origin/main 失败（留存 $EVID_DIR/work-report.md）" >> "$EVID_DIR/issues.log"
    note "[观察] 工作台账落档失败（留存本地，记问题单）"
  fi
  capture_step "workmgr_done" "/app/s/chat"

  sset workmgr_done "$(date +%s)"
  note "[M3] 报告落 $(echo "$WR" | tail -1)"
fi

# ══ 步骤 25：audit（合规及审计管理，V3-mgmt 新增）══════
# 门禁留痕完整性 + 问题单格式 + 凭证抽检 → 合规意见书入仓（audit 账号签名线）。
# 导演侧机械化审计为主；@audit-agent 独立复核结论行（额度恢复后补充，不阻断导演侧意见书）。
if step_reached audit && [[ -z "$(sget audit_done)" ]]; then
  # ── 六域体检当轮跑（run15 前置 P3-6，B6 根治：run14 第 7 章是静态拼装非体检输出）──
  # 产品端点 POST /api/governance/domains/run?run=<RUN_ID>：六域逐域实查+台账 jsonl 落
  # 中央仓（GOVERNANCE_REPO 默认=本 SIM 中央仓）；驱动调完留 evidence 副本（离线重出
  # 报告可读）。失败记单降级（报告回落按轮注册表，不编造当轮体检）。
  if DOMAIN_JSON=$(curl -sf -m 30 -X POST -H "Authorization: Bearer ${GOV_TOK:-$(studio_login)}" \
       "http://127.0.0.1:${STUDIO_PORT}/api/governance/domains/run?run=${RUN_ID}" 2>/dev/null) \
     && printf '%s\n' "$DOMAIN_JSON" | python3 -c 'import json,sys; json.load(sys.stdin)["results"]' >/dev/null 2>&1; then
    printf '%s\n' "$DOMAIN_JSON" > "$EVID_DIR/domain-audit-run.json"
    note "[audit] 六域体检当轮已跑（evidence/domain-audit-run.json，六域判定+台账入中央仓 jsonl）"
  else
    echo "ISSUE|domain-audit-run|step23|六域体检端点调用失败（/api/governance/domains/run）——报告第 7 章回落按轮注册表，记单降级" >> "$EVID_DIR/issues.log"
    note "[audit] 六域体检当轮跑失败（记单降级——报告回落静态注册）"
  fi
  # §4.4-9 治理证据①（六文调研轮 A+B）：事故报告汇编导出（sessionId=本轮 RUN_ID，
  # 产品面 /api/incident/sessions/:id/report.md，17 要素+自治度对账 B 面）。
  # 数据源未接 SIM 环境时 elements 空集如实透传（报告结构在、不编造数据），缺口记单。
  GOV_TOK=$(studio_login)
  if GOV_IR=$(studio GET "/api/incident/sessions/${RUN_ID}/report.md" "$GOV_TOK"); then
    printf '%s\n' "$GOV_IR" > "$EVID_DIR/incident-report.md"
    note "[audit] 事故报告汇编已导出（evidence/incident-report.md，17 要素）"
  else
    echo "ISSUE|gov-incident-export|step23|事故报告汇编导出失败（端点 404/未部署或会话无数据）" >> "$EVID_DIR/issues.log"
    note "[audit] 事故报告汇编导出失败（记问题单）"
  fi
  AUD=$(audit_check || true)
  if [[ -n "$AUD" ]]; then
    echo "ISSUE|audit-finding|director|审计发现：${AUD}" >> "$EVID_DIR/issues.log"
    note "[audit] 审计发现（记问题单）：${AUD}"
  else
    note "[audit] 门禁留痕/台账格式/取证目录 审计通过 ✓"
  fi

  # 免等窗终态复核（提速③质量补强 2026-10-09）：免等窗记单时点≠终态——agent 事后
  # 补账成功的问题单在审计段以当前真值复核，追加 DISP 闭环行（原单保留=记单时点真值，
  # 终态行=审计时点真值，两时点如实并存，不删不改）。
  for spec in "AN-PAYCORE chen" "AN-MP xiao" "AN-CHWX hu" "AN-CHALI lin"; do
    set -- $spec; _ct="$1"; _co="$2"
    if grep -qF "ISSUE|receipt-missing|${_ct}|" "$EVID_DIR/issues.log" 2>/dev/null; then
      if mx_messages "$(load_token fanfan)" "$(sget room_analysis)" 200 | jq -e --arg t "${_ct}" \
        '[.[] | select(.sender == "'"$(agent_mxid "${_co}")"'") | select((.content.body // "") | (contains("完成回执") and contains($t)) or test("^\\s*AN-DONE-" + $t))] | length > 0' >/dev/null 2>&1; then
        echo "DISP|receipt-missing|${_ct}|终态闭环：审计段复核回执已在房间可见（免等窗记单后补账成功）——原单保留记时点真值" >> "$EVID_DIR/issues.log"
        note "[audit] ${_ct} 回执终态闭环（记单后补账成功）"
      fi
    fi
  done
  if grep -qF "ISSUE|raci-not-structured|" "$EVID_DIR/issues.log" 2>/dev/null && [[ -n "$(kanban_raci_of fanfan "${RFD_ID}")" ]]; then
    echo "DISP|raci-not-structured|终态闭环：审计段复核主卡已带结构化 raci（免等窗记单后补填成功）——原单保留记时点真值" >> "$EVID_DIR/issues.log"
    note "[audit] 主卡结构化 raci 终态闭环（记单后补填成功）"
  fi
  if [[ -z "$(sget audit_dispatched)" ]]; then
    dispatch_in_room audit "@audit-agent:matrix.test 合规及审计请求：本轮 G1-G6 门禁留痕已由导演侧机械化审计（意见书将入仓），请独立复核并回结论行 AUDIT-OPINION-PASS 或 AUDIT-OPINION-CONCERNS(附清单)。范围：门禁留痕完整性/凭证抽检/问题单处置合规/复盘对事不对人口径。" "$(agent_mxid audit)" || true
    sset audit_dispatched 1
  fi
  AUDDOC="$DIRECTOR_CLONE/docs/retro/${RUN_ID:-default}-audit-opinion.md"
  mkdir -p "$(dirname "$AUDDOC")"
  # §8.6 审计域模板字段（run8 复盘根治：意见书缺独立性声明/抽检记录/关切清单/分层
  # 签名线，8.6 矩阵模版核对四项红——生成器按方案字段措辞补齐，抽检三条全部实查）。
  repo_pull
  _aud_t1=$(repo_has "$(freeze_doc)" && echo "✓ 在 origin/main" || echo "✗ 缺（origin/main）")
  _aud_t2=$(repo_has "docs/acceptance/${RFD_ID}-acceptance.md" && echo "✓ 在 origin/main" || echo "✗ 缺（origin/main）——验收书在派发链上晚于 audit 步时如实标缺，回灌后另签")
  if git -C "$DIRECTOR_CLONE" show "origin/integration/${RFD_ID}:docs/test/${RFD_ID}-test-report.md" >/dev/null 2>&1; then
    _aud_t3="✓ 在 origin/integration（报告 commit 锚随分支可反查）"
  else
    _aud_t3="✗ 缺（origin/integration）"
  fi
  {
    echo "# ${RFD_ID} 合规审计意见书（audit，$(date '+%F %T')）"
    echo
    echo "- 审计人：audit（合规及审计管理线）+ 导演侧机械化审计"
    echo "- 范围：G1-G6 门禁留痕完整性、凭证抽检（freeze/验收/测试报告）、问题单台账格式与处置、复盘口径"
    echo "- 导演侧机械化结论：$( [[ -z "$AUD" ]] && echo '通过（无发现）' || echo "发现——${AUD}" )"
    echo "- 意见：门禁链（G1/G2/G4/G5）与回灌机制执行合规；问题单 100% 台账化；记忆沉淀探针随 retro。"
    echo
    echo "## 独立性声明"
    echo "- 本意见书由 audit（合规及审计管理线，独立于研发执行线）出具；导演侧机械化审计与 @audit-agent 独立复核分列，两层结论不一致时以独立意见为准，原结论勘误改判留痕（治理总则 10）。"
    echo
    echo "## 抽检记录（含 3 条 AI 结论反核）"
    echo "- 凭证抽检①：G1 冻结件 $(freeze_doc)——${_aud_t1}（repo_has 实查）。"
    echo "- 凭证抽检②：UAT 验收书 docs/acceptance/${RFD_ID}-acceptance.md——${_aud_t2}（repo_has 实查）。"
    echo "- AI 结论反核③：G4 测试报告（TEST 侧 AI 结论）——${_aud_t3}（git show 引用实查）。"
    echo
    echo "## 关切清单"
    if [[ -n "$AUD" ]]; then
      echo "- ${AUD}"
    else
      echo "- 无（导演侧机械化审计未发现；独立复核以房间 @audit-agent 结论行为准）。"
    fi
    echo
    echo "## 分层签名线"
    echo "- 导演侧机械化审计：audit（compliance）· $(date '+%F %T')"
    echo "- 独立复核：@audit-agent 结论行 AUDIT-OPINION-PASS / AUDIT-OPINION-CONCERNS(附清单)——房间可反查；未回执留空待补，不代签。"
  } > "$AUDDOC"
  # 落 main 走 repo_commit_main（P4）：在 integration 上 commit 再 push origin main 是
  # 空推/被拒，"已入仓"成假成功——意见书根本没进 origin/main。
  if repo_commit_main "docs/retro/${RUN_ID:-default}-audit-opinion.md" "audit (compliance)" "audit@aipaydev.local" "docs(retro): ${RFD_ID} 合规审计意见书（audit 签名线）"; then
    note "[audit] 合规意见书已入仓"
  else
    note "[观察] 意见书推送失败（留存本地）"
  fi
  capture_step "audit_done" "/app/runs"

  sset audit_done "$(date +%s)"
  capture_step "deliver_gate" "/app/runs"   # 步23 R29 delivery 面板灯
  python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" effect --step 24 --text "独立审计完成（工件见 evidence）" --ev "state=audit_done" >/dev/null 2>&1 || true
  python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" op --step 23 --title "delivery 案例面板门禁灯" --entry "/app/runs → 案例面板" --frames deliver_gate-op1-before.png deliver_gate-op1-after.png >/dev/null 2>&1 || true
fi

# ══ 步骤 23：retro（G6 复盘与知识沉淀，V3 新增）═══════
# 三段式复盘（现象/规律/下轮验证）+ 行动项四元组 + 治理报告与 metrics 回写 + ITIL 资产回写 + 记忆沉淀探针。
if step_reached retro && [[ -z "$(sget retro_done)" ]]; then
  gate_blocked uat_done retro
  # §4.4-9 治理证据②③（六文调研轮 E+B）：AI 虚拟损益表 + 自治度对账导出
  # （/api/hermes/virtual-pl?days=30 与 /api/incident/sessions/:id/autonomy 原文；
  #  收益面无数据源时产品侧如实声明不编造——透传即合规）
  GOV_TOK=$(studio_login)
  if GOV_VP=$(studio GET "/api/hermes/virtual-pl?days=30" "$GOV_TOK"); then
    printf '%s\n' "$GOV_VP" > "$EVID_DIR/virtual-pl.txt"
    note "[G6] AI 虚拟损益表已导出（evidence/virtual-pl.txt）"
  else
    echo "ISSUE|gov-virtualpl-export|step24|虚拟损益表导出失败（端点未部署）" >> "$EVID_DIR/issues.log"
  fi
  if GOV_AR=$(studio GET "/api/incident/sessions/${RUN_ID}/autonomy" "$GOV_TOK"); then
    printf '%s\n' "$GOV_AR" > "$EVID_DIR/autonomy-reconcile.txt"
    note "[G6] 自治度对账已导出（evidence/autonomy-reconcile.txt，理论 vs 实际）"
  else
    echo "ISSUE|gov-autonomy-export|step24|自治度对账导出失败（端点未部署或会话无数据）" >> "$EVID_DIR/issues.log"
  fi
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
    # M3 事件化：P6 done（复盘+治理报告入仓）→ G6 pass → 终态 P6
    dlv_enabled && dlv_scenario_phase P6 fanfan G6 fanfan artifact "G6 三段式复盘+治理报告入仓" -
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
  # 归档落账原子化（P14/R26）：metrics-log+ISSUES-LOG 同提交上 origin/main 并回读验证——
  # 「产出了没落账」自此有机制通道；失败记单 archive-commit-failed 不击杀驱动（纪律 18）
  if gov_archive_commit; then
    note "[G6] 治理归档落账完成（metrics-log+ISSUES-LOG @ origin/main，回读验证过）"
  else
    note "[观察] 治理归档落账未过（已记单 archive-commit-failed，挂收官回灌清单）"
  fi
  capture_step "retro_done" "/app/board?tab=gov-harness"

  sset_once retro_done "$(date +%s)"
fi

# ══ 步骤 20：IDE 工作台接入核验（API/代码级；UI 走查由导演另行执行）══
if step_reached ide && [[ -z "$(sget ide_done)" ]]; then
  note "── ide：核验任务→IDE 跳转与简报生成能力"
  # 1) /ide 路由存在（SPA 200）
  code=$(curl -s -o /dev/null -w '%{http_code}' "$(studio_url)/ide")
  [[ "$code" == 200 ]] && note "[真值] /ide 路由 200 ✓" || echo "ISSUE|ide-route|studio|/ide HTTP $code" >> "$EVID_DIR/issues.log"
  # 2) 任务跳转参数 ide?task= 处理代码存在性（client 源码）
  # 路径用 $OVERLAY_ROOT（本检出根，worktree 下恒正确）：run6 实锤 $NCWK 在 worktree
  # 驱动下解析到 .wxwork（root_walk 被 upstream 软链有意跳过而失败、回落父目录），
  # $NCWK/overlay/... 不存在 → grep 空转 → 两条"未见"假阴性（功能实存，记 DISP 撤单）。
  if grep -rq "route.query.task" "$OVERLAY_ROOT/custom/client/ide" 2>/dev/null; then
    note "[真值] ide?task 参数处理代码存在 ✓"
  else
    echo "ISSUE|ide-task-param|client|未见 ide?task 参数处理（任务→IDE 跳转缺口）" >> "$EVID_DIR/issues.log"
    note "[观察] ide?task 跳转处理未见（记问题单）"
  fi
  # 3) 任务简报自动生成能力
  if find "$OVERLAY_ROOT/custom/client/ide/components" -iname '*brief*' 2>/dev/null | grep -q .; then
    note "[真值] IDE 简报相关代码存在 ✓"
  else
    echo "ISSUE|ide-brief|client|任务接入 IDE 自动简报生成功能未见（步骤 20 要求）" >> "$EVID_DIR/issues.log"
    note "[观察] IDE 任务简报自动生成功能未见（记问题单）"
  fi
  capture_step "ide_done" "/app/ide"
  python3 "$SCRIPT_DIR/mux/r18-collect.py" --run "${RUN_ID}" op --step 25 --title "任务跳转 IDE 工作台" --entry "/app/ide → IDE 视图" --frames ide_done-op1-before.png ide_done-op1-after.png >/dev/null 2>&1 || true

  sset ide_done 1
fi

note "===== 下半场完成（到 ${START_STEP} 起全部门禁执行完）====="

# ══ 流程 26：HTML 推演报告（产品路演交付物）═══════════
# 逐步汇编执行状态/问题单/治理报告/截图证据（evidence/screenshots/*.png）成端到端
# 演示报告；驾驶舱/协作沟通/IDE 工作台的走查截图由内置浏览器工具（playwright/
# chrome dev tools / computer use）在流程中捕获落档，本步自动嵌入。
if step_reached report && [[ -z "$(sget report_done)" ]]; then
  gov_report >/dev/null
  # 报告生成器外置 mux/mx-report-gen.py（09-26 重构：方案对齐 26 步+逐步截屏挂接）：
  # 步骤定义与方案"具体流程 1-26"一一对应，含把关（准出/合格线）与
  # evidence/screenshots/steps/ 逐步截图自动嵌入（真实界面走查+真实工件渲染）。
  # --run 必带（H7）：缺省时生成器回落 SIM 全局 state/evidence，拿旧轮 state
  # 出"状态真实"的假报告，且落盘路径与下方 note 不符（run2 2026-09-29 05:15 实锤）。
  # §5.4 产品成效三件（run13 复盘 B6/F17：run13 起必采未接线根修）——报告生成前落
  # evidence/product-outcome/（quality-summary.env 实算+幂等执行输出件；UI 帧缺席记单降级）
  repo_pull
  python3 "$SCRIPT_DIR/mux/product-outcome-summary.py" --run "${RUN_ID}" --rfd "${RFD_ID}" >/dev/null 2>&1 \
    || issue_once product-outcome-missing step26 "产品成效 quality-summary 落盘失败（实算脚本异常）"
  python3 "$SCRIPT_DIR/mux/mx-report-gen.py" ${RUN_ID:+--run "$RUN_ID"} || fail "报告生成失败"
  note "[报告] HTML 推演报告已生成：$EVID_DIR/simulation-report.html（方案对齐 26 步 · 逐步截屏自动挂接 steps/）"
  # 收官判据②（§5.7，2026-10-07 修订接线）：mx-report-audit 硬跑熔断——FAIL 即不得落
  # report_done、报告不得持久化交付（run10 实锤：15 项 FAIL 下报告曾被产出交付，判据②
  # 当时未接线执行；已有 ISSUE+DISP 的缺口按 §5.6 采集纪律⑩ 降级不计 FAIL）。
  python3 "$SCRIPT_DIR/mux/mx-report-audit.py" ${RUN_ID:+--run "$RUN_ID"} \
    || fail "报告审计 FAIL（§5.7 收官判据②——缺口记单+DISP 降级后重试）"
  # 双正本制（§5.4）：final-report.html（人读正本）缺一即违例——run10 收官时未产出实锤；
  # PART1 未注册时合并器会给出注册指引（按轮人工正本，禁旧轮顶包）。
  python3 "$SCRIPT_DIR/mux/final-report-merge.py" ${RUN_ID:+--run "$RUN_ID"} \
    || fail "final-report 合并失败（§5.4 双正本缺一即违例——PART1 未注册时先编写注册）"
  sset report_done "$(date +%s)"
  capture_step "report_view" "/app/runs"   # 步26 承载面
  # M3 事件化收口：六 stage/六 gate/终态断言 + 证据报告（记问题单不打断）
  dlv_enabled && dlv_scenario_assert
fi

note "===== 全流程执行区间（START_STEP=${START_STEP}${UNTIL_STEP:+ UNTIL_STEP=$UNTIL_STEP}）内全部 gates 执行完毕 ====="

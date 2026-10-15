#!/bin/bash
# mx-scenario-lib.sh — 20 步推演场景共享原语（P1 场景迁移：合一收敛）
#
# 由 aipay-scenario.sh / aipay-scenario2.sh 共同引用。V1 两脚本各自持有一份重复
# 原语，此处收敛为单一事实源。拓扑口径（方案 V2.0 §3.3）：
#   - 单 studio 多账号：studio() 无端口参数，一律走 $STUDIO_PORT
#   - kanban 板寻址：一切读写钉"本账号的板"（account_boards <user>），不跨扫
#   - verify_done_evidence 断言"账号板"
#   - UNTIL_STEP 上界闸门：UNTIL_STEP=smoke 即只实跑步骤 1-5
# 依赖：先 source mx-lib.sh。

# ── state 缓存（跨轮存活防重复建卡/建房；换轮次给 RUN_ID 另起一份）──
SCEN_LOG="$EVID_DIR/scenario.log"
mkdir -p "$EVID_DIR"
[[ -f "$STATE" ]] || : > "$STATE"

# ── 姿态旋钮+代偿台账（2026-10-15 治理轮批次一）──
# MX_POSTURE=strict|standard|demo，缺省 standard。strict=零代偿测自组织真力；
# standard=现状保留但每笔代偿落台账（报告净额对账/清偿门数据源）；demo=演示调度。
# 用户裁定 2026-10-15：代偿在下一轮推演前必须根治后合入 SwarmStudio 产品能力。
posture() {
  local p="${MX_POSTURE:-$(sget posture)}"
  case "$p" in strict|standard|demo) echo "$p" ;; *) echo "standard" ;; esac
}
_mx_led_self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$_mx_led_self/mx-compensation-ledger.sh" 2>/dev/null || true
unset _mx_led_self
# mx_fetch（run16 实证根修）：git fetch 挂起护栏——20:1x 一次 fetch 网络黑洞挂起
# 42 分钟冻死驱动等待环（无 FAIL 行无超时，监控靠子进程 mtime 交叉定位才破案）。
# 全部 fetch 走本函数：60s 超时强断（timeout 缺席环境回落裸跑并打点），失败照常
# 返回非零由调用方原有 || true/记单逻辑兜住——挂起不再可能，慢网退化为可观测失败。
mx_fetch() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 60 git "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout 60 git "$@"
  else
    git "$@"
  fi
}

sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
# marker_eventid（run16 复盘，fix/run16-report-truth）：从 marker 值提取纯 matrix event_id。
# 两类写入源并存：mx_send 返回纯 event_id（dispatch_marker）；dispatch_in_room 返回整行
# note（含 "($id): …"——m17/m19/m21_marker 即此形态）。r18-collect 拿到非 $ 开头的锚
# 必 404（run16 实锤 103 单）。统一经本助手解析，两类值都归一为 $… 首 token。
# 2026-10-13 run18-lite 实锤：主 shell 赋值处调用时 grep 空手（lite 轮无该 marker 键）
# 在 pipefail 下 rc=1 直杀驱动（报告段 _pan= 赋值行）——本函数语义=「尽力解析，无则空」，
# 必须 || true 归零。
marker_eventid() {
  printf '%s' "$1" | LC_ALL=C grep -oE '\$[A-Za-z0-9_-]+' | head -1 || true
}
# 进度 JSON（产品面契约）：完成步按 MX_STEP_ORDER 计数；写失败绝不影响推演（|| true 全兜底）。
# lite 轮口径（2026-10-10 G4）：state 带 lite_round=1 时 total=执行段步数（夹具步不计），
# 附 scope=lite+fixtures_from——产品横幅按此显示「lite 轮 x/N」而非误导性的 0/26。
mx_write_progress() {
  [[ -n "${HERMES_ROOT:-}" && -n "${STATE:-}" ]] || return 0
  mkdir -p "$HERMES_ROOT" 2>/dev/null || true
  local _n=0 _list="" _s _scope="" _order="${MX_STEP_ORDER:-}"
  if grep -q "^lite_round=1" "$STATE" 2>/dev/null; then
    _order="${MX_LITE_STEP_ORDER:-$_order}"
    _scope="\"scope\":\"lite\",\"fixtures_from\":\"$(grep -s '^lite_fixtures_from=' "$STATE" | head -1 | cut -d= -f2-)\","
  fi
  for _s in $_order; do
    if grep -q "^${_s}_done=" "$STATE" 2>/dev/null; then _n=$((_n+1)); _list="${_list}\"$_s\","; fi
  done
  printf '{"run_id":"%s",%s"done":%d,"total":%d,"done_steps":[%s],"updated_ts":%d}\n' \
    "${RUN_ID:-}" "$_scope" "$_n" "$(echo $_order | wc -w | tr -d ' ')" "${_list%,}" "$(date +%s)" \
    > "$HERMES_ROOT/run-progress.json.tmp" 2>/dev/null && mv "$HERMES_ROOT/run-progress.json.tmp" "$HERMES_ROOT/run-progress.json" 2>/dev/null || true
}
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; mx_write_progress; }
# 闸键首过保护：G5 等闸键在重启循环中每圈重写，首过时刻被最后一次
# 覆写（11:30:41 首过→仪表盘显示 11:37）。闸类状态键一律 sset_once——已有值不覆盖。
sset_once() { grep -q "^$1=" "$STATE" 2>/dev/null && return 0; sset "$1" "$2"; }
# 幂等记单：重启循环每圈重放记单点，qgate-evidence ×11/uat-precheck ×5
# 刷单污染台账。同类型+主体已有 ISSUE 行即跳过（处置语义：重复发生记次数无收益，事故账
# 由 scenario.log 时间线承载）。冲突处理：必要时先显式删旧行再记新单。
issue_once() { # issue_once <type> <subject> <desc>
  local _f="$EVID_DIR/issues.log"
  mkdir -p "$EVID_DIR"
  grep -qF "ISSUE|$1|$2|" "$_f" 2>/dev/null && return 0
  echo "ISSUE|$1|$2|$3" >> "$_f"
}
# 临时物清理（Z6）：$STATE.tmp 是 sset 的中转文件，mv 前被中断会残留。重定义 mx_cleanup
# 即扩展清理面——EXIT trap 只在 mx-lib 挂一次，退出时按最新定义执行（bash 单 EXIT trap）。
mx_cleanup() { rm -f "/tmp/mx-api.$$" "$STATE.tmp" "$STATE.rfd.tmp"; }
note() { log "$*" | tee -a "$SCEN_LOG"; }

# ── 步骤机（V3 生命周期 21 步：六阶段 L0-L5 × G1-G6 门禁，方案见
#    2026-09-25-mux-v3-lifecycle-plan.md；templates 并入 ready）────────
STEPS="smoke appinit people ba reqgate room dispatch register analysis triage anexec review archgate close plan devimpl defect testpass ready release uat workmgr audit retro ide report"
START_STEP="${START_STEP:-smoke}"
UNTIL_STEP="${UNTIL_STEP:-}"
step_pos() { echo $STEPS | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1; }

# ── 快模式节拍（run11 §4.2/纪律 27⑤：MX_FAST=1 缺省开——轮询 15s→5s）──────
# run10 报告曾叙事「快模式 MX_FAST=1 已开」而驱动/原语零实现（叙事超前于实现的
# 实锤病根）——本块即实现体。MX_FAST=0 显式回退 15s 慢档（保真对照轮用）。
# 审批扫描降频独立节拍（§4.2：auto 批量扫描 30s，防轮询加密后 Matrix 扫描风暴）。
MX_FAST="${MX_FAST:-1}"
if [[ "$MX_FAST" == "1" ]]; then
  MX_POLL_IVAL=5
else
  MX_POLL_IVAL=15
fi
MX_APPROVE_SCAN_IVAL="${MX_APPROVE_SCAN_IVAL:-30}"
export MX_FAST MX_POLL_IVAL MX_APPROVE_SCAN_IVAL
step_reached() { # 步骤 $1 是否在 [START_STEP, UNTIL_STEP] 执行区间内
  local a b u
  a=$(step_pos "$1")
  b=$(step_pos "$START_STEP")
  # 报错文案里 $var 紧邻全角括号必须写 ${var}（Z4）：bash 3.2 会把多字节字符首字节
  # 吞进变量名，"$START_STEP（" 的值直接变空（已实测）。
  [[ -n "$b" ]] || fail "未知 START_STEP: ${START_STEP}（合法值：${STEPS}）"
  if [[ -n "$UNTIL_STEP" ]]; then
    u=$(step_pos "$UNTIL_STEP")
    [[ -n "$u" ]] || fail "未知 UNTIL_STEP: ${UNTIL_STEP}（合法值：${STEPS}）"
    (( a >= b && a <= u )) && return 0
    return 1
  fi
  (( a >= b ))
}

# ── 登录（单 studio 多账号：matrix-login 优先，等价步骤 3 自动登录链路）──
jwt_of() { # <user> → studio JWT
  local u="$1" cached; cached=$(sget "jwt_$u")
  [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local t
  t=$(studio POST /api/auth/matrix-login "" "$(jq -n \
    --arg tok "$(load_token "$u")" --arg uid "$(human_mxid "$u")" --arg hs "$HS" \
    '{matrixAccessToken:$tok, matrixUserId:$uid, homeserverUrl:$hs}')" \
    | jq -r '.token // empty') || true
  if [[ -z "$t" ]]; then
    note "[$u] matrix-login 未取到 JWT，回落 admin/123456（记问题单）"
    echo "ISSUE|matrix-login-fail|$u|/api/auth/matrix-login 未返回 token" >> "$EVID_DIR/issues.log"
    t=$(studio_login)
  fi
  sset "jwt_$u" "$t"
  echo "$t"
}

# ── kanban 原语（V2 板寻址：一切操作钉"本账号的板"）────────────
account_boards() { # <user> → 该账号全部板 slug（空白分隔）
  boards_of "$1" | tr ' ' '\n' | cut -d: -f1 | sed '/^$/d'
}

board_of_task() { # <user> <id> → 卡所在账号板 slug（找不到非零）
  local u="$1" id="$2" jwt slug
  jwt=$(jwt_of "$u")
  for slug in $(account_boards "$u"); do
    if studio GET "/api/hermes/kanban?board=$slug" "$jwt" 2>/dev/null \
        | jq -e --arg id "$id" '[.. | objects | select(.id? == $id)] | length > 0' >/dev/null 2>&1; then
      echo "$slug"; return 0
    fi
  done
  return 1
}

kanban_list() { # <user> → 合并该账号全部账号板的任务 {"tasks":[...]}
  # 09-26 run6/7 实锤：studio /api/hermes/kanban?board=* 整板返空（tenant 面未明），
  # 板上真卡在却两窗误杀（kanban_has/kanban_status_of 全线失明）。改 CLI 直查：
  # hermes kanban --board <slug> list --json 输出裸数组 → {tasks:.} 归一兼容旧消费面。
  # run19 复盘根治（卡面通道失明）：hermes kanban list CLI 输出形态随版本漂移——
  # 当前=裸数组（历史={tasks:[...]}对象），旧归一按对象读裸数组恒空 → 全部卡面判定
  # （G5 卡判词/空 body 校验/卡面时间窗）失明，G5 判词退化为房间行单源（11:3x 实锤：
  # g5_real_gaps 恒落缺省文案）。归一改双形态兼容：数组直接用，对象取 .tasks。
  local u="$1" slug out='{"tasks":[]}'
  for slug in $(account_boards "$u"); do
    out=$(jq -c -s '{tasks: (.[0].tasks + ((.[1] | if type == "array" then . else (.tasks // []) end)))}' \
      <(echo "$out") \
      <(HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list --json 2>/dev/null | LC_ALL=C tr -d '\000-\011\013-\037' || echo '[]'))
  done
  echo "$out"
}

kanban_has() { # <user> <needle> → 0/1（标题或 body 含 needle）
  kanban_list "$1" | jq -e --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n))] | length > 0' \
    >/dev/null 2>&1
}

kanban_status_of() { # <user> <needle> → 首个匹配卡的 status
  kanban_list "$1" | jq -r --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .status][0] // empty'
}

kanban_done() { # <user> <needle> → 0/1（存在 done 的匹配卡）
  kanban_list "$1" | jq -e --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .status] | map(select(. == "done")) | length >= 1' \
    >/dev/null 2>&1
}

# assignee 归一化：agent 可能写 matrix mxid(@xxx-agent) 而 profile 系统用短名(xxx)——
# 建卡/改卡时统一为短名（V3 全流程轮实测 bug：visibleProfiles 过滤全部漏掉）
normalize_assignee() { # <assignee> → 短名
  local a="${1:-}"
  a="${a#@}"                    # 去 @
  a="${a%:matrix.test}"        # 去 :matrix.test
  a="${a%-agent}"              # 去 -agent 后缀（@fanfan-agent → 产品经理A）
  printf '%s' "$a"
}

kanban_create_as() { # <user> <state-key> <title> <body> [board] [assignee] → id（state 缓存防重；缺省落该账号默认板）
  # 09-26 studio POST /api/hermes/kanban 写路径与读路径同病（tenant 面），
  # 导演兜底建卡直接 fail。改 CLI 直查（--json 返回卡对象，.id 即卡号，实测 t_8b84e215）。
  # assignee（第 6 参，可选）：未指派卡虽经 547 已对板内可见，但指派到板团队档案
  # （board.json profiles 之一）可同时过 477 围栏与 391 认领白名单——评审/准出类
  # 导演建卡一律带（run7 ui-g5-carddrawer 教训：NULL assignee 曾被滤光致抽屉打不开）。
  # 拆两条 local（2026-10-04 run8 uat 崩溃环实锤）：bash 的 local 参数展开先于赋值——
  # 同语句内 board 默认值引用 $(first_board_of "$u") 时 u 尚未赋值，set -u 下命令替换
  # 子 shell 即死（卡已建但 ID 丢失、驱动被 set -e 连坐），每棒复发。
  local u="$1" key="card_$2" title="$3" body="$4" cached id
  local board="${5:-$(first_board_of "$u")}" asg="${6:-}"
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local asg_args=()
  [[ -n "$asg" ]] && asg_args=(--assignee "$asg")
  id=$(HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$board" create "$title" \
    --body "$body" --project aipaydev --json ${asg_args[@]+"${asg_args[@]}"} 2>/dev/null | jq -r '.id // empty')
  [[ -n "$id" && "$id" != "null" ]] || fail "[$u] kanban 建卡失败: ${title}（板 ${board}）"
  # 板归属校验（run2 REL-* 三卡实测落错板 audit-compliance，现行 CLI 路由已不可复现
  # ——补创建后归属核验：错板记单留证，不再静默）
  _landed="$(board_of_task "$u" "$id" 2>/dev/null || true)"
  if [[ -n "$_landed" && "$_landed" != "$board" ]]; then
    echo "ISSUE|kanban-board-misroute|$u|$id 创建要求板 $board 实落 ${_landed}（P-18 归属核验）" >> "$EVID_DIR/issues.log"
  fi
  sset "$key" "$id"; echo "$id"
}
# mx_dispatch_subrev（V8.29 派单断棒第二刀根治·run20 23:0x 实证）：
# 「建了卡没人接」病在「建卡→认领」两步都断——子卡建在产品经理板但
# 没分派 assignee 也没分发到研发板，研发AI 不在自己板上=看不见=死循环。
# 工具按子卡标题里的 D- 项号（缺省：板+主卡归属）做确定性分派 + 跨板复制：
#   D-1/2/4/5/10 → hu（微信渠道）
#   D-3/11       → lin（支付宝渠道）
#   D-6/7/9/13   → chen（支付核心）
#   D-12/14 + 共担 → chen（与主卡归属一致；若有 xiao 项需二次拆分后续迭代）
# 幂等：assignee 已置或目标板已存在对账子卡=跳过；不重复建卡。
mx_dispatch_subrev() { # <human-pm> <subcard-id> → 0 派发成功 / 1 已派过 / 2 失败
  local pm="$1" sid="$2" board="fanfan-pm-plan"
  local title body cur_assignee
  cur_assignee=$(HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban --board "$board" show "$sid" 2>/dev/null | awk -F: "/^  assignee:/{gsub(/^ +/,"",\$2);print \$2}")
  if [[ -n "$cur_assignee" && "$cur_assignee" != "-" ]]; then
    echo "MX|dispatch-subrev-skip|$sid|assignee=$cur_assignee（已分派，跳过幂等）"
    return 1
  fi
  title=$(HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban --board "$board" show "$sid" 2>/dev/null | head -1 | sed "s/^Task $sid: //")
  # D-项分派：标题含哪些项号就归谁（多归属按首项优先，避免重复派）
  local agent=""
  if [[ "$title" =~ D-(1|2|4|5|10) ]]; then agent="hu-csw-channel-wechat"
  elif [[ "$title" =~ D-(3|11) ]]; then agent="lin-csw-channel-alipay"
  elif [[ "$title" =~ D-(6|7|9|13) ]]; then agent="chen-csw-pay-core"
  elif [[ "$title" =~ D-(12|14) ]]; then agent="chen-csw-pay-core"
  else echo "MX|dispatch-subrev-no-d-item|$sid|标题无 D-项归属（可能需人工）"; return 2
  fi
  HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban --board "$board" assign "$sid" "$agent" >/dev/null 2>&1 || { echo "MX|dispatch-subrev-fail|$sid|assign 失败"; return 2; }
  # V8.29 派单工具升级：body 生成器（子卡 body 空=研发 AI 拿到没正文=断派单第二刀）
  local body
  body=$(cat <<'BODY'
G2SREV-r1 安全设计条款修订（run20 r3）

任务：按下列 D-项在 docs/design/RFD-001-architecture-design.md 对应章节补齐/修订安全设计条款，commit 推 origin/main。
完成后结论行 G2SREV-DONE-**$sid** 写回本卡，并 @secops-agent 复审。

D 项明细：
- D-1 微信侧渠道密钥持有与装载形态无设计条款，与支付宝侧引用形态不对称｜位置=概设 §4.2:310｜归属=hu + wei
- D-2 渠道密钥与平台证书轮换流程无设计（无更新责任人、无触发条件、无过期告警口径）｜位置=概设 §4.2:306｜归属=wei + hu
- D-3 支付宝密钥存储形态未冻结，进程内 InMemoryKeyStore 真实环境不可用（概设自认阻塞对外发布）｜位置=概设 §4.2:310 / apps/
- D-4 微信回调 resource 解密环节未进验签链路设计，APIv3 密钥使用点无落位｜位置=概设 §3.1:195、§3.2:230-233｜归属=hu
- D-5 回调时间戳容差无设计条款（微信 ±5min 只在代码 verifier.ts:22，支付宝侧无容差设计）｜位置=概设 §5:324｜归属=wei + hu
- D-6 「渠道层验签 + 核心层复核」双层结构未落设计文档，只存在于集成用例注释 03-notify-security.spec.ts:3｜位置=概设 §5:3
- D-7 需求 §12:132「订单数据访问限研发/测试编制账号」在概设无承接，支付单表无访问控制与审计留痕设计（概设「访问/权限/账号」0 命中）｜位置=需求
- D-8 冻结标记 freeze.md:16 支付铁线（CVV2/磁道/交易密码授权后不得存储）在概设无否定性断言｜位置=freeze.md:16 → 概设 §5
- D-9 需求 §12「日志金额脱敏」在概设 §5:326 被改为「不得输出卡号与密钥」，金额脱敏与涉敏字段留存/销毁口径缺失（留存/销毁/保留期 0 命中）｜位
- D-10 回调来源校验无设计条目：可信来源锚点、网段与频率限制、notify_url 防泄漏、全链路 HTTPS 均无承接条款｜位置=概设 §5｜归属=wei
- D-11 支付宝回调商户定位把请求头 x-merchant-id 作为判定依据之一，概设未规定可信锚点选取规则｜位置=概设 §5 / AN-CHALI-anal
- D-12 回调重放防护口径缺失（D-6:128 三键只覆盖消费幂等，未覆盖幂等窗口外重放；无时间窗设计条款）｜位置=概设 §2 D-6:128-129｜归属=w
- D-13 服务端回调金额交叉校验无设计条款（AMOUNT_MISMATCH 错误码已在 apps/csw-pay-core/src/errors.ts:19-4
- D-14 涉敏声明不完备：未按 JR/T 0171-2020 给支付鉴权类 C3 分级与全生命周期管控口径，未按 JR/T 0071 给定级/备案/整改责任与时

评审锚：arch 评审卡 t_88e1e258（缺项清单）+ secops 评审卡 t_f5cc53c5（result=FAIL 12 项未过）。
禁谎报：无真做行（工具轮）不写结论。
BODY
  )
  # 跨板复制（对账子卡，研发板可见性+工作量统计；workspace 仍指原板）
  # V8.29 修板名硬编（00:47 实录：${agent}-…-dev 板不存在，工具静默失败）：按工人档案
  # 前缀在真实板清单里解析归属板（lin-csw-channel-alipay → lin-channel-alipay）
  local dev_board
  dev_board=$(HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban boards list 2>/dev/null \
    | awk -v a="${agent%%-*}" 'NR>2 && NF && $1 ~ "^"a"-" {print $1; exit}')
  [[ -n "$dev_board" ]] || dev_board="fanfan-pm-plan"  # 解析失败回落 PM 板（对账卡可见性优先）
  local dev_id
  dev_id=$(kanban_create_as "$agent" "subrev_${sid##t_}" "G2SREV-r1 子卡对账 ${sid}（${title}）" "V8.29 根治派单：本卡为 fanfan-pm-plan 板 ${sid} 的研发板镜像；正文/工作区/进度皆在原板。来源：run20 r3 派单断棒第二刀根治（产品经理仅建子卡未分发）。" "$dev_board" "$agent" 2>/dev/null || echo "")
  # body 生成器：子卡 body 空=研发 AI 拿到没正文=断派单第二刀
  if [[ -n "$body" ]]; then
    kanban_edit_as "$agent" "$sid" --body "$body" 2>/dev/null || true
  fi
  echo "MX|dispatch-subrev-ok|$sid|→ $agent（dev_board=${dev_board} mirror=$dev_id）"
  return 0
}


kanban_status_as() { # <user> <id> <status>（studio PATCH 主路 + CLI 合法路径兜底）
  # 隔夜 26 步实证 PATCH 有效；GET/POST-create 才有 tenant 病。兜底按状态机动词：
  # running=claim / review=request-review / done=complete（walk_done 全程静默容错）。
  local u="$1" tid="$2" st="$3" b
  b=$(board_of_task "$u" "$tid") || return 1
  studio PATCH "/api/hermes/kanban/$tid?board=$b" "$(jwt_of "$u")" "{\"status\":\"$st\"}" >/dev/null 2>&1 && return 0
  case "$st" in
    running) HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" claim "$tid" >/dev/null 2>&1 || true ;;
    review)  HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" request-review "$tid" >/dev/null 2>&1 || true ;;
    done)    HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" complete "$tid" >/dev/null 2>&1 || true ;;
  esac
  return 0
}

kanban_link_as() { # <user> <parentId> <childId>（挂父卡所在板）
  local u="$1" pid="$2" cid="$3" b
  b=$(board_of_task "$u" "$pid") || return 0
  HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" link "$pid" "$cid" >/dev/null 2>&1 || true
}

kanban_walk_done() { # <user> <id>：按合法路径走到 done（静默容错）
  local u="$1" id="$2" st
  if [ "$(posture)" = "strict" ]; then
    # V8.29 §2.6.5：strict 姿态卡态流转归组织侧，不代演推 done
    [ -n "${EVID_DIR:-}" ] && echo "ISSUE|strict-walk-done-skipped|$u|卡 $id 未代走到 done（strict 姿态：卡态流转归组织侧）" >> "$EVID_DIR/issues.log" 2>/dev/null || true
    return 0
  fi
  compensate card-walk-done "user=$u card=$id（代演推卡到 done）" 2>/dev/null || true
  for st in todo running review done; do
    kanban_status_as "$u" "$id" "$st" 2>/dev/null || true
  done
}

kanban_raci_of() { # <user> <needle> → 首个匹配卡的结构化 raci JSON（空串=未填；B1 列）
  local u="$1" n="$2" slug out
  for slug in $(account_boards "$u"); do
    out=$(sqlite3 "$HERMES_ROOT/kanban/boards/$slug/kanban.db" \
      "select ifnull(raci,'') from tasks where (title like '%'||'$n'||'%' or body like '%'||'$n'||'%') and ifnull(raci,'')!='' limit 1" 2>/dev/null) || continue
    [[ -n "$out" ]] && { echo "$out"; return 0; }
  done
  echo ""
}

# ── Matrix 私信/审批/真值等待 ───────────────────────────
dm_room() { # <fromUser> <toUser> → room_id（缓存）
  local a="$1" b="$2"
  local key="dm_${a}_${b}" cached
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local rid
  rid=$(mx "$(load_token "$a")" POST createRoom "$(jq -n --arg t "$(human_mxid "$b")" \
    '{is_direct:true, preset:"trusted_private_chat", invite:[$t]}')" | jq -r '.room_id')
  [[ "$rid" == '!'* ]] || fail "DM 建房失败 ${a}→$b: $rid"
  mx_join "$(load_token "$b")" "$rid"
  sset "$key" "$rid"; echo "$rid"
}

# approved.events 台账（边界设计 §2/§6-T4，eid 锚点约定）：每行
#   <请求event_id> <回执event_id|NO_REPLY> <人类账号> <unix时间戳>
# 事件 id 即 Matrix $event_id（跨机 eid 全局锚点）；去重按行首请求 id 前缀匹配。
APPROVED_LOG="$EVID_DIR/approved.events"; touch "$APPROVED_LOG"
# ── 审批复核人工介入（用户裁决 C 混合模式）──────────────
# MX_APPROVE_MODE=auto（默认）脚本扫到即批——历史行为
#                 =manual 全部挂起等真人（element 以人类账号回复 !approve / !deny）
#                 =hybrid  关键操作挂起真人复核 + 过程性操作由代审 agent 先审后批
# 关键=主干写入与破坏性（git push origin main/master、rm -rf、--force、drop table、
# unlink(）；MX_APPROVE_CRITICAL_EXTRA 可追加扩展正则（对小写正文匹配）。
# 代审者=MX_REVIEW_AGENT（默认 产品经理A，其 orchestrator agent 收审阅 DM；语义=审批
# 复核人代过程性审批，非请求主人本人——保真偏差如实记档）。agent 复核回复
# APPROVE→执行原批准双通道；REJECT <理由>→线程内 !deny（hermes 会把理由回传请求
# agent 使其调整）；代审超时 MX_REVIEW_TIMEOUT（默认 1800s）→转人工挂起兜底。
REVIEW_STATE="$EVID_DIR/review.pending"; touch "$REVIEW_STATE"
review_state_get() { grep -F "$1|" "$REVIEW_STATE" 2>/dev/null | head -1; }
review_state_del() { # <eid>（sed 免疫点号通配：用 awk 精确首列）
  local _f; _f=$(mktemp) || return 0
  awk -F'|' -v e="$1" '$1 != e' "$REVIEW_STATE" > "$_f" 2>/dev/null || true
  cat "$_f" > "$REVIEW_STATE"; rm -f "$_f"
}
review_state_set() { echo "$1|$2|$3|$4|$(date +%s)" >> "$REVIEW_STATE"; } # <eid> <state> <ask_eid> <u>

# ── ③b 审批面统一·harness 侧（backlog ③，2026-10-06）──────────────────────
# 镜像入队：审批请求在 Matrix 房间出现即同步写入产品收件箱通道
# （$HERMES_ROOT/approvals/mx-requests.jsonl，产品 pending-controller 第四源读取，
# id=mx:<eid>）；消费收敛：轮询 mx-responses/<safe-eid>.json（产品裁决产物），
# 命中即回 Matrix 执行反应+线程批准/拒绝（与 auto 通道同语义），双通道台账一致。
# 幂等边界：本侧以 APPROVED_LOG 为已决真值；产品侧以 approved.events+响应文件为
# 已决真值（其 decide 分支对反应通道已批 409，本侧消费后亦落 approved.events）。
# MX_INBOX_MIRROR=0 可显式关闭（保真偏离须记单，与 delivery 旗标同纪律）。
MXQ_DIR="$HERMES_ROOT/approvals"
MXQ_QUEUE="$MXQ_DIR/mx-requests.jsonl"
MXQ_RESP_DIR="$MXQ_DIR/mx-responses"

mxq_safe_eid() { printf '%s' "$1" | tr -c 'A-Za-z0-9_-' '_'; }  # 与产品 mxSafeEid 同约定

mxq_enqueue() { # <user> <room> <eid>：镜像入队（幂等；显式关闭或已在队/已决即跳过）
  [[ "${MX_INBOX_MIRROR:-1}" == "1" ]] || return 0
  local u="$1" room="$2" eid="$3" body title
  mkdir -p "$MXQ_DIR" 2>/dev/null || return 0
  touch "$MXQ_QUEUE"
  grep -qF '"eid":"'"$eid"'"' "$MXQ_QUEUE" 2>/dev/null && return 0
  grep -qF "$eid " "$APPROVED_LOG" 2>/dev/null && return 0
  body=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid"     '[.[] | select(.event_id == $e)][0].content.body // ""' 2>/dev/null | head -c 200 | jq -Rs .) || body='"（正文拉取失败）"'
  title="[${u}] Matrix 审批请求（房间 ${room}）"
  jq -nc --arg e "$eid" --arg t "$title" --argjson d "${body:-""}" --arg sid "$room" --arg p "$u"     '{eid:$e, title:$t, detail:$d, sessionId:$sid, profile:$p, createdAt:(now*1000|floor)}' >> "$MXQ_QUEUE" 2>/dev/null || true
}

mxq_consume() { # 消费收件箱裁决：响应文件命中且未决 → 回 Matrix 执行批准/拒绝
  [[ "${MX_INBOX_MIRROR:-1}" == "1" ]] || return 0
  [[ -d "$MXQ_RESP_DIR" ]] || return 0
  local f eid decision u room
  for f in "$MXQ_RESP_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    eid=$(jq -r '.request_id // empty' "$f" 2>/dev/null) || continue
    [[ -n "$eid" ]] || continue
    grep -qF "$eid " "$APPROVED_LOG" 2>/dev/null && continue   # 已决（任一通道）跳过
    decision=$(jq -r '.decision // "once"' "$f" 2>/dev/null)
    # 请求房间与账号：自 mx-requests 行回取（入队时落了 sessionId/profile）
    room=$(jq -r --arg e "$eid" 'select(.eid == $e) | .sessionId // empty' "$MXQ_QUEUE" 2>/dev/null | head -1)
    u=$(jq -r --arg e "$eid" 'select(.eid == $e) | .profile // empty' "$MXQ_QUEUE" 2>/dev/null | head -1)
    [[ -n "$room" && -n "$u" ]] || continue
    local react_eid="" reply_eid="" root verb
    if [[ "$decision" == "deny" ]]; then verb="!deny"; else verb="!approve"; fi
    [[ "$decision" != "deny" ]] && react_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.reaction"       "{"m.relates_to":{"rel_type":"m.annotation","event_id":"$eid","key":"✅"}}"       | jq -r '.event_id // empty' 2>/dev/null) || true
    root=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid"       '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || root="$eid"
    reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message"       "{"msgtype":"m.text","body":"$verb","m.relates_to":{"rel_type":"m.thread","event_id":"$root","is_falling_back":true,"m.in_reply_to":{"event_id":"$eid"}}}"       | jq -r '.event_id // empty' 2>/dev/null) || true
    if [[ -z "$reply_eid" ]]; then
      reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message"         "{"msgtype":"m.text","body":"$verb"}" | jq -r '.event_id // empty' 2>/dev/null) || true
    fi
    echo "$eid ${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
    note "[③b] 收件箱裁决已收敛回 Matrix（请求 ${eid} 决策 ${decision} → ${verb} ${reply_eid:-NO_REPLY}${react_eid:+ 反应=${react_eid}}）"
  done
}

approve_is_critical() { # <body> → 0=关键(挂真人) 1=过程性
  local low; low=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
  if printf '%s' "$low" | grep -qE \
      -e 'git .*push.*origin.* main( |$)' \
      -e 'git .*push.*origin.*:main( |$)' \
      -e 'git .*push.*origin.* master( |$)' \
      -e 'git .*push.*origin.*:master( |$)' \
      -e 'git .*push.*origin/(main|master)' \
      -e 'rm -[rf][rf]? ' -e 'push .*--force' -e '--force-push' \
      -e 'drop table' -e 'unlink\('; then
    return 0
  fi
  if [[ -n "${MX_APPROVE_CRITICAL_EXTRA:-}" ]] && printf '%s' "$low" | grep -qE "${MX_APPROVE_CRITICAL_EXTRA}"; then
    return 0
  fi
  return 1
}

dm_room_agent() { # <fromUser> <agentOwner> → room_id（人类 from 邀 agentOwner 的 agent；agent 侧 _on_invite 自动加入）
  local a="$1" b="$2" key="dma_${a}_${b}" cached rid
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  rid=$(mx "$(load_token "$a")" POST createRoom "$(jq -n --arg t "$(agent_mxid "$b")" \
    '{is_direct:true, preset:"trusted_private_chat", invite:[$t]}')" | jq -r '.room_id')
  [[ "$rid" == '!'* ]] || return 1
  sset "$key" "$rid"; echo "$rid"
}

approve_deny() { # <u> <room> <eid> <reason> —— 线程内 !deny（理由回传请求 agent）
  local u="$1" room="$2" eid="$3" reason="$4" reply_eid root tok payload
  tok=$(load_token "$u")
  root=$(mx_messages "$tok" "$room" 20 2>/dev/null | jq -r --arg e "$eid" \
    '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || root="$eid"
  payload=$(jq -n --arg r "$root" --arg e "$eid" --arg d "!deny ${reason}" \
    '{msgtype:"m.text", body:$d, m.relates_to:{rel_type:"m.thread", event_id:$r, is_falling_back:true, m.in_reply_to:{event_id:$e}}}')
  reply_eid=$(mx "$tok" POST "rooms/$room/send/m.room.message" "$payload" | jq -r '.event_id // empty' 2>/dev/null) || true
  echo "$eid DENIED:${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
  note "[$u][代审拒绝] !deny 已发（请求 ${eid} → ${reply_eid:-NO_REPLY}）理由：${reason:-未给}"
}

approve_review_ask() { # <u> <eid> <body> —— 发审阅 DM 给代审 agent，记 ASKED 态
  local u="$1" eid="$2" body="$3" reviewer rv_dm ask_eid
  reviewer="${MX_REVIEW_AGENT:-fanfan}"
  rv_dm=$(dm_room_agent "$u" "$reviewer") || {
    note "[${u}][代审 DM 建房失败→转人工挂起] ${eid}"; echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"; return 0; }
  ask_eid=$(mx_send "$(load_token "$u")" "$rv_dm" "[审批复核] 请以审批复核人身份代 ${u} 复核其 agent 请求执行的操作：

${body}

审阅口径：建卡/查询/本地构建等过程性操作符合任务口径即批；越权、破坏性、明显偏离任务目标应拒。
请仅回复一行：APPROVE 或 REJECT <一句理由>。")
  if [[ -z "$ask_eid" ]]; then
    note "[${u}][代审 DM 发送失败→转人工挂起] ${eid}"; echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"; return 0
  fi
  review_state_set "$eid" "ASKED" "$ask_eid" "$u"
  note "[${u}→${reviewer}-agent] 代审请求已发（${eid}），等复核回复"
}

approve_review_poll() { # <u> <room> <eid> <state-line> → 0=流转中/已处理 2=代审通过(走原批准动作)
  local u="$1" room="$2" eid="$3" line="$4" ask_eid ts reviewer rv_dm verdict
  ask_eid=$(printf '%s' "$line" | cut -d'|' -f3); ts=$(printf '%s' "$line" | cut -d'|' -f5)
  reviewer="${MX_REVIEW_AGENT:-fanfan}"
  if (( $(date +%s) - ${ts:-0} > ${MX_REVIEW_TIMEOUT:-1800} )); then
    review_state_del "$eid"
    echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"
    note "[${u}][代审超时转人工] ${reviewer}-agent 未在 ${MX_REVIEW_TIMEOUT:-1800}s 内复核 ${eid}，请真人接手"
    return 0
  fi
  rv_dm=$(sget "dma_${u}_${reviewer}")
  [[ -n "$rv_dm" ]] || { dm_room_agent "$u" "$reviewer" >/dev/null 2>&1 || true; return 0; }
  verdict=$(mx_messages "$(load_token "$u")" "$rv_dm" 30 2>/dev/null | jq -r --arg m "$ask_eid" --arg s "$(agent_mxid "$reviewer")" '
    (map(.event_id) | index($m) // -1) as $i
    | (if $i < 0 then . else .[0:$i] end)
    | map(select(.sender == $s)) | map(.content.body // "")
    | map(select(test("^(APPROVE|REJECT)\\b")))[0] // empty' 2>/dev/null) || true
  if [[ "$verdict" == APPROVE* ]]; then
    review_state_del "$eid"
    note "[${reviewer}-agent 代审通过] ${eid}"
    return 2
  elif [[ "$verdict" == REJECT* ]]; then
    local reason; reason=$(printf '%s' "$verdict" | sed 's/^REJECT[[:space:]]*//' | cut -c1-200)
    review_state_del "$eid"
    approve_deny "$u" "$room" "$eid" "$reason"
    return 0
  fi
  return 0
}

auto_approve() { # 扫描房间 agent 审批请求，按 MX_APPROVE_MODE 分发（auto/manual/hybrid）
  # manual：全部挂起等真人；hybrid：关键挂真人+过程性 agent 代审（见上块注释）；
  # auto：历史行为——扫到即批（反应+线程内 !approve 双通道）。
  # 快模式节流（run11 §4.2）：轮询加密到 5s 后，全账号扫描若逢轮必跑会放大成
  # Matrix 请求风暴（15 账号×消息窗）；按 MX_APPROVE_SCAN_IVAL（缺省 30s）节流，
  # 两次扫描间的调用直接返回（审批延迟上界=节拍值，run10 实测 15s 节奏下无积压）。
  local _aa_now=$(( $(date +%s) ))
  if [[ -n "${_AA_LAST_TS:-}" ]] && (( _aa_now - _AA_LAST_TS < MX_APPROVE_SCAN_IVAL )); then
    return 0
  fi
  _AA_LAST_TS=$_aa_now
  local MODE="${MX_APPROVE_MODE:-auto}" room="$1"
  # 大小写归一+非法值 fail-closed（2026-10-02 审查批）：配置漂移（Manual/HYBRID 等）
  # 不得静默落 auto"扫到即批"——未知的值按 manual 全挂起处理并记单。
  MODE="$(printf '%s' "$MODE" | tr 'A-Z' 'a-z')"
  mxq_consume   # ③b：先消费收件箱裁决（manual 模式同样收敛——裁决已发生须回 Matrix）
  case "$MODE" in
    manual) return 0 ;;
    auto|hybrid) ;;
    *) note "[审批开关] MX_APPROVE_MODE='${MX_APPROVE_MODE}' 非法（合法值 auto/manual/hybrid）——按 manual 全挂起处理"; return 0 ;;
  esac
  for u in "${INSTANCED_USERS[@]}"; do
    local pend
    # 去重改固定串（H5）：eid 形如 $abc…:matrix.test，当正则用时 `.` 是通配、^eid 还前缀
    # 命中——两个仅 `.` 位不同的 eid 互误判"已批"，!approve 永不发。两式并联：本台账
    # （裸 eid 整行）由 -Fx 全行命中；eid+空格分隔的多字段行（主干格式）由 -F "$eid "
    # 命中（分隔符收边界防前缀），旧版台账行不漏、重跑不重复批。
    # 只匹配原始请求（"needs your OK" 提示头）：超时后 hermes 会把请求 m.replace 编辑成
    # "Approval timed out…"，旧模式 `needs your OK|approval` 会把编辑事件也当请求，对
    # 带 relation 的编辑事件开线程必被 Synapse 拒（run4/run5 实锤 18/19 NO_REPLY）。
    # 窗口 20→60（六路并发+模型降级噪音下 20 条几十秒翻页，正式请求在
    # 30s 节拍的下一扫前滚出窗口→超时卡死，chen 两次请求全丢）；去重台账防重批不变。
    pend=$(mx_messages "$(load_token "$u")" "$room" 60 2>/dev/null | jq -r --arg agent "$(agent_mxid "$u")" \
      '.[] | select(.sender == $agent and ((.content.body // "") | test("needs your OK"))) | .event_id' 2>/dev/null \
      | while read -r eid; do grep -qFx "$eid" "$APPROVED_LOG" || grep -qF "$eid " "$APPROVED_LOG" || echo "$eid"; done) || true
    for eid in $pend; do
      mxq_enqueue "$u" "$room" "$eid"   # ③b：镜像入产品收件箱（auto/manual/hybrid 双可见）
      if [[ "$MODE" == "hybrid" ]]; then
        local body line rc
        body=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid" \
          '[.[] | select(.event_id == $e)][0].content.body // ""' 2>/dev/null) || body=""
        if approve_is_critical "$body"; then
          echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"
          note "[${u}][人工审批挂起] 关键操作待真人复核：element 以 ${u} 回复 !approve / !deny —— $(printf '%s' "$body" | head -c 100 | tr '\n' ' ')"
          continue
        fi
        line=$(review_state_get "$eid")
        if [[ -z "$line" ]]; then
          approve_review_ask "$u" "$eid" "$body"
          continue
        fi
        approve_review_poll "$u" "$room" "$eid" "$line"
        rc=$?
        (( rc == 2 )) || continue
        note "[hybrid] 代审通过→执行批准 ${eid}"
      fi
      local reply_eid="" react_eid="" root
      # 反应通道（✅=once）：按 prompt.session_key 直解，不受线程/会话路由影响，是双兜底之一
      react_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.reaction" \
        "{\"m.relates_to\":{\"rel_type\":\"m.annotation\",\"event_id\":\"$eid\",\"key\":\"✅\"}}" \
        | jq -r '.event_id // empty' 2>/dev/null) || true
      # 线程通道：请求事件本身就是线程子事件，从它开新线程会被 Synapse 拒
      # （M_UNKNOWN: Cannot start threads from an event with a relation）——必须把
      # 回复发进请求所在线程（root=其 m.relates_to.event_id），并 m.in_reply_to 指回请求，
      # 才与被阻塞的 agent 回合同会话键，!approve 命令路由才命中等待中的审批。
      root=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid" \
        '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || root="$eid"
      reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
        "{\"msgtype\":\"m.text\",\"body\":\"!approve\",\"m.relates_to\":{\"rel_type\":\"m.thread\",\"event_id\":\"$root\",\"is_falling_back\":true,\"m.in_reply_to\":{\"event_id\":\"$eid\"}}}" \
        | jq -r '.event_id // empty' 2>/dev/null) || true
      # 兜底：线程发送仍失败则退化为房间级 !approve（session_scope=room 时同样命中）
      if [[ -z "$reply_eid" ]]; then
        reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
          "{\"msgtype\":\"m.text\",\"body\":\"!approve\"}" \
          | jq -r '.event_id // empty' 2>/dev/null) || true
      fi
      echo "$eid ${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
      note "[$u] 线程内回复 !approve（请求 ${eid} → 回执 ${reply_eid:-NO_REPLY}${react_eid:+ 反应=${react_eid}}）"
    done
    # ── 二层：散文式征求识别（run14 18:1x chen 卡死根治件）─────────────────
    # agent 用普通聊天消息征求批准（"征求同意/请批准/等待批准/未获响应"类）时，
    # 正式格式匹配器看不见→请求超时→验证被门禁卡死。本层**不盲批散文**（安全边界：
    # 任意文本不可当审批凭证），只做一次性格式引导：回复"请改发标准格式请求"，
    # 把沉默卡死变成一轮内的自愈。去重走同一台账（GUIDED 前缀），全局 300s 节流
    # 防引导风暴；仅认 agent 自己的消息、且不含正式请求头（那类归一层处理）。
    local _ga_now=$(( $(date +%s) ))
    if [[ ! -f "$EVID_DIR/approve-nudge-last.ts" ]] || (( _ga_now - $(cat "$EVID_DIR/approve-nudge-last.ts" 2>/dev/null || echo 0) >= 300 )); then
      local _ga_eid
      _ga_eid=$(mx_messages "$(load_token "$u")" "$room" 60 2>/dev/null | jq -r --arg agent "$(agent_mxid "$u")" \
        '.[] | select(.sender == $agent and ((.content.body // "") | test("征求同意|征求批准|请求批准|请批准|等待批准|等待确认|待会签|等待会签|会签请求|未获.{0,6}(响应|回复|批准)|被.{0,4}(门禁|审批).{0,4}阻塞")) and ((.content.body // "") | test("needs your OK") | not)) | .event_id' 2>/dev/null \
        | while read -r geid; do grep -qFx "GUIDED $geid" "$APPROVED_LOG" || echo "$geid"; done | head -1) || true
      if [[ -n "${_ga_eid:-}" ]]; then
        echo "$_ga_now" > "$EVID_DIR/approve-nudge-last.ts"
        echo "GUIDED $_ga_eid $u $_ga_now" >> "$APPROVED_LOG"
        local _ga_body _ga_json
        _ga_body="@$(agent_mxid "$u") 审批通道说明：普通聊天消息不会被自动批准程序识别。需要执行许可请直接调用运行时工具触发标准审批请求（needs your OK 格式），发出后约 30 秒内自动批准；已发出的标准请求如超时请重发。若是会签/确认类等待（如测试用例骨架待签）：请直接在群里 @fanfan @wei 重发会签请求，15 分钟无回应再重发一次，不要静默等待或退出。"
        _ga_json=$(jq -nc --arg b "$_ga_body" --arg m "$(agent_mxid "$u")" '{"msgtype":"m.text","body":$b,"m.mentions":{"user_ids":[$m]}}')
        mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" "$_ga_json" >/dev/null 2>&1 || true
        note "[审批引导] ${u}-agent 散文式征求已引导改标准格式（锚 ${_ga_eid}）"
      fi
    fi
  done
}

# ── 闸点经验沉淀（2026-10-02 用户终局：有意义卡点自动 review，减空转、token 花在刀刃）──
# 每 turn 自动 review fork 已由 auxiliary.background_review.enabled=false 关闭；
# 沉淀发生在有意义卡点：治理闸/大协作阶段完成时，对该阶段**实质干活**的 agent
# 各触发一次。触发方式：在 agent 最近的工作线程内发 "!refine <闸点名>"——
# 群会话键是 thread 级（build_session_key thread 优先），线程内消息按 thread
# 归属路由到该 agent（approve 线程回复实证），refine 因此对准**真实工作历史**
# 而非空会话（v1 的 DM 垫话方案 refine 的是空 DM 会话，已废）。body 必须以
# "!refine" 开头——matrix 命令归一化（adapter _normalize_matrix_bang_command）
# 只认 ! 开头的 body，前置 @mention 会使命令沦为聊天文本（v2 前缀缺陷已修，
# 与 !approve 纯命令形态同构）。/refine 走 background_review 同一代码路径且
# 不查 enabled。MX_GATE_REVIEW=0 可整体停用。
gate_review() { # <human-user> <gate-name> —— best-effort，不阻塞流程
  local u="$1" gate="$2" room tok last_eid thread_root payload re
  [[ "${MX_GATE_REVIEW:-1}" == "1" ]] || return 0
  room="${SCAN_ROOM:-$(sget room_analysis)}"
  [[ -n "$room" ]] || return 0
  tok=$(load_token "$u")
  # 该 agent 群内最近一条消息 = 当前工作线程最新活动
  last_eid=$(mx_messages "$tok" "$room" 50 2>/dev/null | jq -r --arg s "$(agent_mxid "$u")" \
    '[.[] | select(.sender == $s)][0].event_id // empty' 2>/dev/null)
  if [[ -z "$last_eid" ]]; then
    note "[观察] 闸点沉淀：${u}@${gate} 未找到 ${u}-agent 近期群消息（跳过）"
    return 0
  fi
  thread_root=$(mx_messages "$tok" "$room" 50 2>/dev/null | jq -r --arg e "$last_eid" \
    '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || thread_root="$last_eid"
  # jq 键名含点必须引号（m.relates_to/m.in_reply_to 裸键=语法错误，set -e 下击杀驱动
  # ——testpass 步 gate_review 死循环重启三连的根因）
  payload=$(jq -n --arg r "$thread_root" --arg e "$last_eid" \
    --arg m "!refine ${gate}" \
    '{"msgtype":"m.text", body:$m, "m.relates_to":{"rel_type":"m.thread", event_id:$r, is_falling_back:true, "m.in_reply_to":{event_id:$e}}}')
  re=$(mx "$tok" POST "rooms/$room/send/m.room.message" "$payload" | jq -r '.event_id // empty' 2>/dev/null) || true
  if [[ -n "$re" ]]; then
    note "[闸点沉淀] ${u}@${gate}：!refine 已发进工作线程（${re}）——background_review 对真实工作历史触发"
  else
    note "[观察] ${u}@${gate} !refine 发送失败（跳过，不影响流程）"
  fi
}

# 产物等待责任人提醒（run14 步10 根治件）：repo_has 型等待静默过半时向任务群发
# 短提醒。run14 实录：产品经理A 会话完成分析后静默消失（推送/结论行未落），2400s
# 全窗空等判中止损失约 50 分钟；监控侧手工群提醒后 8 分钟即补完。本函数把该手工
# 动作机制化：对活会话是无害短提醒，对死会话=复活通道（top-level 新线程开新会话，
# run12 手册验证形态）。全局 480s 节流防连环等待提醒风暴。
_artifact_nudge() { # <desc> <checkpoint-label>
  local f="$EVID_DIR/artifact-nudge-last.ts" now room tok
  now=$(date +%s)
  { [ -f "$f" ] && (( now - $(cat "$f" 2>/dev/null || echo 0) < 480 )); } && return 0
  room=$(sget room_analysis); [[ -n "$room" ]] || room=$(sget dlv_room)
  [[ -n "$room" ]] || return 0
  tok=$(load_token fanfan 2>/dev/null) || return 0
  echo "$now" > "$f"
  mx_send "$tok" "$room" "等待提醒（$2）：仍在等「$1」。已完成请立即入库推送并按派单格式回结论行；受阻请回 BLOCKED 与原因；责任侧已无人处理时请明说，勿静默。" "@fanfan-agent:matrix.test" >/dev/null 2>&1 || true
  note "[跟进] 产物等待提醒已发（$2）：$1"
}

# ── 分支感知催办情报（run19 根治件）：「干完活不收口」形态——稿子已推到
# origin/feat/*（tip 是本轮新提交）但不 merge 入 main、不回结论行，催办一句
# 「仍在等待」被 agent 自认已完成顶回（run19 实录：xiao AN-MP 稿在 feat/AN-MP
# 分支 c5914fc，main 无文件，泛催办回复 0 工具轮后继续静默 30min+）。探测
# 责任人名下本轮新鲜的远程分支，产出「已见到你的分支+还差哪几步」的带情报
# 催办词；探测失败输出空（催办退回原文案，fail-open 不阻塞）。
_nudge_branch_intel() { # <agents-csv> → stdout: 分支情报句（空=无情报）
  local agents="$1" br tip ct an rs out=""
  [[ -n "${DIRECTOR_CLONE:-}" && -d "$DIRECTOR_CLONE/.git" ]] || return 0
  # fetch 必须走 mx_fetch（60s 超时强断）：裸 fetch 网络黑洞挂起 42 分钟冻死等待环
  # 是本文件头部实证根修的同型事故，|| true 只兜失败不兜挂起。
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  rs="$(sget run_started_at 2>/dev/null || true)"
  [[ -n "$rs" ]] || return 0
  while IFS='|' read -r br tip ct an; do
    [[ -n "$br" ]] || continue
    # origin 自身与 main 不算 dev 交付分支（main tip 是驱动/PM 的 merge 提交）
    [[ "$br" == "origin" || "$br" == "origin/main" ]] && continue
    [[ "$ct" -ge "$rs" ]] 2>/dev/null || continue
    case ",$agents," in *",$an,"*) ;; *) continue ;; esac
    out="${out:+$out；}${br#origin/}@${tip}"
  done < <(git -C "$DIRECTOR_CLONE" for-each-ref refs/remotes/origin \
      --format='%(refname:short)|%(objectname:short)|%(committerdate:unix)|%(authorname)' 2>/dev/null)
  [[ -n "$out" ]] && printf '已见到你本轮推送的分支：%s（内容在分支上，main 还没有）。' "$out"
  return 0
}

wait_truth() { # <desc> <timeout-sec> <predicate-cmd...>
  local desc="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  local _ws _n1=0 _n2=0
  _ws=$(date +%s)
  # repo_has 型=产物等待（闸门等待是正常忙期不打扰）；50%/75% 两检查点各提醒一次
  if [[ "$1" = "repo_has" ]]; then
    while (( $(date +%s) < deadline )); do
      [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
      if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
      local _el=$(( $(date +%s) - _ws ))
      if (( _n1 == 0 && _el * 2 >= timeout )); then _n1=1; _artifact_nudge "$desc" "半窗"
      elif (( _n2 == 0 && _el * 4 >= timeout * 3 )); then _n2=1; _artifact_nudge "$desc" "窗 75%"; fi
      sleep "$MX_POLL_IVAL"
    done
  else
    while (( $(date +%s) < deadline )); do
      [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
      if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
      sleep "$MX_POLL_IVAL"
    done
  fi
  # 终态复核（方案纪律 8：等待窗口是等待上限，不是判词有效期）——窗满再判一次
  if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓（窗口超时终态复核）"; return 0; fi
  # 宽限等待（run15 根治「窗严物迟」：AN-MP 实测迟到 12min 落仓，驱动却按窗 ✗ 触发
  # 回退重派=重复劳动）：repo_has 型产物常在超时点后数分钟内落仓——宽限期内继续复查，
  # 落仓即 ✓（标注宽限期命中，诚实记录迟达）；宽限仍无物才 ✗。MX_ARTIFACT_GRACE=0
  # 关闭（回旧语义）。仅 repo_has 型享受宽限（闸门判词等待不走此路径）。
  if [[ "$1" = "repo_has" && "${MX_ARTIFACT_GRACE:-900}" -gt 0 ]]; then
    local _gd=$(( $(date +%s) + ${MX_ARTIFACT_GRACE:-900} ))
    while (( $(date +%s) < _gd )); do
      [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
      if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓（超时后宽限期落仓，迟达如实记）"; return 0; fi
      sleep "$MX_POLL_IVAL"
    done
  fi
  note "[真值] $desc ✗（${timeout}s 超时）"
  return 1
}



# ── 分支新鲜度（2026-10-02 run5 旧 feat/DEV-* 分支留存，devimpl 存在性
# 检查秒过=假真值，驱动用旧代码跑完后续步。与 repo_has 文件新鲜度同口径：分支 tip
# 提交时间必须 ≥ run_started_at；缺键退化为存在性旧语义并告警。──
branch_fresh() { # <branch>（导演 clone fetch 后核验：存在且 tip 提交时间在本轮开跑后）
  local br="$1" ct rs
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" rev-parse -q --verify "refs/remotes/origin/$br" >/dev/null 2>&1 || return 1
  rs="$(sget run_started_at)"
  if [ -z "$rs" ]; then
    log "[观察] branch_fresh 无 run_started_at 键（旧 state 兼容），退化为存在性：$br"
    return 0
  fi
  ct="$(git -C "$DIRECTOR_CLONE" log -1 --format=%ct "origin/$br" 2>/dev/null)"
  # run20 18:38 崩溃环根治：分支存在但 tip 过期（⚠STALE）时原裸 && 链返回 rc=1，
  # 在 set -euE 下击杀驱动（监督器三次拉起三死于同一点）。改 if 保护态返回：
  # STALE=假值语义（调用方按未交付等待/记单），不再触发 ERR trap 与 -e 退出。
  # 瞬态旧 tip 容忍（run20 18:38 崩溃环的第二层根治）：agent 推送过程中先推
  # 带旧提交日期的底（rebase 保日期/prep 分支）再推新 tip，属本轮真实交付的
  # 中间态，非上轮残留。宽限窗 MX_BRANCH_FRESH_GRACE_S（缺省 48h）内的新分支
  # 按新鲜计——上轮残留（run5 期数周旧）仍被正确判旧。产品方案 §PR 备忘。
  local grace="${MX_BRANCH_FRESH_GRACE_S:-172800}"
  if [ -n "$ct" ] && [ "$(( ct + grace ))" -ge "$rs" ] 2>/dev/null; then
    return 0
  fi
  return 1
}

# ── 活性等待（用户裁决：重载任务不设绝对时长上限）─────────────
# 只要责任 agent 还在产出（profiles/<a>/logs/agent.log 持续增长）就一直等；
# 连续 <idle-sec> 无日志增长才判空转/死循环退出。长生成/长测试的单次静默
# 远小于阈值（run6 实测大生成 6 分钟级），1800s 足够宽容；真死循环（429 退避
# 风暴、工具卡死）会在阈值内暴露。无可观测日志面时退化为 86400s 硬窗并告警。

# ── 帧采集焊死进驱动（2026-10-07 run10 教训：13h 推演零实时帧=报告空壳）──
# 每步末尾自动调用 r18-frames.mjs 拍当轮实时帧；不设任何跳过开关。
# 采集失败不阻断流程（记单），但报告生成器有硬闸：帧数=0 拒出报告。
capture_step() { # <step> <url> [action] [user]
  local step="$1" url="$2" action="${3:-}" user="${4:-fanfan}"
  local rc=0
  # 已降级步不重拍（run19 壳页复读根治）：frame-capture-failed|step-<键> 在案的步，
  # 断点续跑重放期重拍只会产出新的壳页帧回填帧池（采集链登录态漂移未根治前），
  # 隔离区清完又被写回=结构性红线永不过闸。采集端修复后移除该记单即恢复拍摄。
  if grep -q "frame-capture-failed|step-${step}|" "$EVID_DIR/issues.log" 2>/dev/null; then
    return 0
  fi
  if [[ -n "$action" ]]; then
    node "$SCRIPT_DIR/mux/r18-frames.mjs" --run "$RUN_ID" --step "$step" --k 1 --url "$url" --action "$action" --user "$user" >/dev/null 2>&1 || rc=$?
  else
    node "$SCRIPT_DIR/mux/r18-frames.mjs" --run "$RUN_ID" --step "$step" --k 1 --url "$url" --user "$user" >/dev/null 2>&1 || rc=$?
  fi
  if (( rc != 0 )); then
    # 花括号边界（2026-10-09 run12 实锤）：bash 3.2 在 UTF-8 locale 下把 $rc 后的
    # 全角标点首字节吸入变量名（rc\xEF: unbound variable）击杀 set -u 驱动——
    # 开跑 env 固定 LC_ALL=C 为主修复，此处花括号为纵深防御（任何 locale 免疫）。
    note "[帧采集] 步 ${step} 采集失败（rc=${rc}，记单不阻断）"
    echo "ISSUE|frame-capture-failed|step-${step}|r18-frames 采集失败 rc=${rc}（url=${url}）" >> "$EVID_DIR/issues.log"
    # 连续失败计数：单步抖动记单即可，≥3 连败=链路级故障
    # （run14 实锤 40 帧全补拍、实时帧=0），升级显著告警供监控侧即刻介入——
    # 开跑预检为何未拦同期复盘。
    _cfail=$(( $(sget capture_fail_streak 2>/dev/null || echo 0) + 1 ))
    sset capture_fail_streak "${_cfail}"
    if (( _cfail >= 3 )); then
      echo "ISSUE|frame-capture-chain-down|director|采集链连续 ${_cfail} 步失败——链路级故障（playwright/浏览器），后续步将全补拍（§4.3-25a 实时帧红线）" >> "$EVID_DIR/issues.log"
      note "[严重] 采集链连续 ${_cfail} 步失败——链路级故障告警（监控侧应介入；修复后帧链自动恢复）"
    fi
  else
    sset capture_fail_streak 0
  fi
}

# ── 判活真化（run11 根治②）：文件增长判活被 adapter 噪音行（reaction/redaction
# 风暴）双骗——既把真挂起误判"零增长"（研发工程师A 挂 2h 被判死循环），又把纯噪音误判
# "在干活"（研发工程师C 差点永悬）。真实工作行=API call/tool 完成/Turn 起止，噪音不含。
# 判活计算三函数（_agent_log_last_work_ts/_agent_log_tail_stalled/_any_log_tail_stalled）
# 移驻 mx-hb.sh 单一定义点（三机心跳补强层：驱动等待环与节点采样守护共用），
# 并由其提供远程档案心跳判活（hb_* 系，见 mx-hb.sh 头注）。
source "${MX_SCRIPT_DIR}/mx-hb.sh"

# 卡死早检语义注（函数体在 mx-hb.sh）：静默过半且日志尾为错误态即提前判死；run11 左移件 b。

# 干预点 B（2026-10-09）：长等待进度锚——等待环每轮调 MX_PROGRESS_FN（缺省关），
# 本函数 180s 节流出一行「分支 commit 计数 + PROGRESS 中间锚」推进行进 scenario.log，
# 根治"长编码 4h 静默盲窗"（run12 MP/CHWX/CHALI 实录：三腿全程零推进信号）。
dev_progress_ping() {
  local now last f b n line pg wtn wtline tip rs mark _act _ag _aw _p
  f="$EVID_DIR/progress-ping.ts"; now=$(date +%s)
  last=$(cat "$f" 2>/dev/null || echo 0)
  (( now - last < 180 )) && return 0
  echo "$now" > "$f"
  line=""
  rs="$(sget run_started_at)"
  for b in DEV-PAYCORE-C DEV-PAYCORE-S DEV-PAYCORE-N DEV-MP DEV-CHWX DEV-CHALI; do
    # 领先 main 计数（run15 根治：原裸 rev-list --count 数的是分支全部提交——上轮遗留
    # 分支（如 run13 的 feat/DEV-PAYCORE-S）把陈旧提交数当本路进展显示，锚读数失真）；
    # 附 STALE 标：tip 早于本轮开跑=上轮遗留（branch_fresh 永假→等待环空转的直接信号）
    n=$(git -C "$DIRECTOR_CLONE" rev-list --count "origin/main..origin/feat/$b" 2>/dev/null || echo 0)
    mark=""
    if [[ -n "$rs" ]]; then
      tip=$(git -C "$DIRECTOR_CLONE" log -1 --format=%ct "origin/feat/$b" 2>/dev/null || echo 0)
      [[ -n "$tip" && "$tip" -lt "$rs" ]] && mark="⚠STALE"
    fi
    line="$line $b=$n$mark"
  done
  # 工作区分支在途计数（run14 18:5x 用户纠偏实锤：同 agent 多工作区并发开发是设计
  # 形态——进行中提交全在 wt/t_*，只数 feat/DEV-* 交付分支会把活跃并发误读成「零
  # 进展」）。wt/t_*@任务 → 计数+末笔摘要，与交付分支计数并列呈现。
  wtline=$(git -C "$DIRECTOR_CLONE" for-each-ref --format='%(refname:short)' 'refs/remotes/origin/wt/t_*' 2>/dev/null \
    | while read -r wb; do
        c=$(git -C "$DIRECTOR_CLONE" rev-list --count "$wb" 2>/dev/null || echo 0)
        (( c > 0 )) && printf '%s(%s) ' "${wb#origin/wt/t_}" "$c"
      done | awk '{print $0}' )
  pg=$(mx_messages "$(load_token fanfan)" "$(sget room_analysis)" 60 2>/dev/null \
       | jq -r '[.[] | (.content.body // "") | scan("PROGRESS-[A-Za-z0-9-]+")] | flatten | unique | join(" ")' 2>/dev/null || true)
  # [V8.16 饱和度指标数据源] 在线工位=近 10 分钟有工作行的档案数（工位在位率=在线/应在线；
  # 应在线由阶段定：devimpl=6/testpass 分片=6/其他按段。供报告 §5.7 曲线实算）
  local _act=0 _ag _aw _p
  for _p in fanfan hu lin chen xiao mei wei qi fei arch secops ops audit; do
    _ag="$HERMES_ROOT/profiles/$_p/logs/agent.log"
    [[ -f "$_ag" ]] || continue
    _aw=$(_agent_log_last_work_ts "$_ag" 2>/dev/null || echo 0)
    (( _aw > 0 && $(date +%s) - _aw < 600 )) && _act=$((_act+1))
  done
  note "[进度锚] 交付分支：$line；工作区在途：${wtline:-无}；在线工位=${_act}；PROGRESS-ANCHORS=${pg:-无}"
}

wait_alive_truth() { # <desc> <idle-sec> <agents-csv> <predicate-cmd...>
  local desc="$1" idle="$2" agents="$3"; shift 3
  # 总时长硬窗（纪律 26 兜底，2026-10-09 提速轮根治）：idle 判据可被"房间噪音持续
  # 刷新工作行"骗过（run12 design-push-gap 实锤），无硬窗则等待可无限挂。
  # 档位放大（质量补强）：下限 7200s；idle>900 的长等待档×8 放大——devimpl 链式腿
  # （C→S→N 串行+渠道）合法总时长可达 3-4h，平顶 7200 会误杀慢而真在干活的腿
  # （误杀=假问题单+降级运行）。env 设值则绝对覆盖。
  local t0=$(date +%s) hard="${MX_ALIVE_HARD_SEC:-$(( idle > 900 ? idle * 8 : 7200 ))}"
  local -a logs=() _hbag=()
  local a
  for a in ${agents//,/ }; do
    if [[ -f "$HERMES_ROOT/profiles/$a/logs/agent.log" ]]; then
      logs+=("$HERMES_ROOT/profiles/$a/logs/agent.log")
    elif hb_is_remote "$a"; then
      _hbag+=("$a")
    fi
  done
  if (( ${#logs[@]} == 0 && ${#_hbag[@]} == 0 )); then
    note "[观察] wait_alive_truth 无日志面可观测（agents=$agents HERMES_ROOT=${HERMES_ROOT:-未设}），退化为 ${hard}s 硬窗"
    wait_truth "$desc" "$hard" "$@"
    return
  fi
  # 三机补强（mx-hb）：远程档案判活走心跳面；不可达→硬窗，绝不假判死
  local _hb_on=0 _hb_miss=0
  if (( ${#_hbag[@]} > 0 )); then
    if hb_refresh_cache 2>/dev/null && hb_all_ok "${_hbag[@]}"; then
      _hb_on=1
      note "[观察] 三机判活：远程档案 ${_hbag[*]} 走心跳面（MX_HB_ROOM）"
    else
      note "[观察] wait_alive_truth 远程档案（${_hbag[*]}）心跳不可达（MX_HB_ROOM 未配/无新鲜条目），退化为 ${hard}s 硬窗"
      wait_truth "$desc" "$hard" "$@"
      return
    fi
  fi
  local last_sig=0 last_work=-1 cur_work w
  # idle-nudge（2026-10-04 run8 plan 步实录：agent 审批后提前收工、静坐 1800s 才被判死重派，
  # ⑧催办边界（产品 backlog 八件落位）：催办=空转过半时单次轻推（设计内），无主动催办面、无重复催办——默认关形态。
# 损失=30 分钟死窗+agent 重做上下文。中途轻推一次：空转过半时 @agent 催办，多数"提前收工"
  # 会被一条提醒拉回；催后仍静默才走原判死路径。agent 恢复活动则重新武装（新一轮静默可再催）。
  local nudged=0 idle_half=$(( idle / 2 ))
  local _nroom="${SCAN_ROOM:-$(sget room_analysis 2>/dev/null || true)}"
  local _nmentions=""
  for a in ${agents//,/ }; do _nmentions="${_nmentions:+$_nmentions,}$(agent_mxid "$a")"; done
  while true; do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    [[ -n "${MX_PROGRESS_FN:-}" ]] && "$MX_PROGRESS_FN" || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    cur_work=0
    for a in ${logs[@]+"${logs[@]}"}; do
      w=$(_agent_log_last_work_ts "$a")
      (( w > cur_work )) && cur_work=$w
    done
    if (( _hb_on == 1 )); then
      if hb_refresh_cache 2>/dev/null && hb_all_ok "${_hbag[@]}"; then
        _hb_miss=0
        for a in "${_hbag[@]}"; do
          w=$(hb_agent_lw "$a")
          (( w > cur_work )) && cur_work=$w
        done
      else
        # 采样守护疑似停：三拍不可达即降级硬窗（硬窗内有终态复核，不误杀真在干活的腿）
        (( ++_hb_miss >= 3 )) && {
          note "[观察] 心跳连续 ${_hb_miss} 拍不可达，降级 ${hard}s 硬窗——不假判死"
          wait_truth "$desc" "$hard" "$@"
          return
        }
      fi
    fi
    if (( last_work < 0 )); then last_work=$cur_work; last_sig=$(date +%s); fi
    if (( cur_work > last_work )); then last_sig=$(date +%s); last_work=$cur_work; nudged=0; fi
    # 注意：字符串判空不能进算术上下文（(( ... && -n "$x" )) 把 -n 解析成
    # "减变量 n"，set -u 下 n: unbound variable 击杀驱动）——[[ ]] 移出 (( ))。
    if (( idle_half >= 300 && nudged == 0 && $(date +%s) - last_sig > idle_half )) && [[ -n "${_nroom:-}" ]]; then
      local _intel=""
      _intel=$(_nudge_branch_intel "$agents" 2>/dev/null || true)
      if [ "$(posture)" = "strict" ]; then
        # V8.29 §2.6.5：strict 不代偿提醒（PR-3 根治前如实暴露停滞）
        note "[姿态] strict：等待「${desc}」空转过半——不代偿提醒，记问题单"
        [ -n "${EVID_DIR:-}" ] && echo "ISSUE|strict-nudge-skipped|$agents|等待「${desc}」空转过半 ${idle_half}s，strict 姿态不代偿提醒" >> "$EVID_DIR/issues.log" 2>/dev/null || true
      else
        compensate nudge "agents=$agents desc=${desc:0:60}（空转过半轻推）" 2>/dev/null || true
        mx_send "$(load_token fanfan)" "$_nroom" "⏰ 催办：仍在等待「${desc}」。${_intel}若你已完成派发词的部分条目，请继续完成剩余条目（交付物入库并 push、结论行收口）；确有阻塞请在群里说明。" "$_nmentions" >/dev/null 2>&1 || true
        note "[观察] 空转过半（${idle_half}s），已向 $agents 催办一次${_intel:+（含分支情报）}"
      fi
      nudged=1
    fi
    if (( idle_half >= 120 && $(date +%s) - last_sig > idle_half )) && { _any_log_tail_stalled ${logs[@]+"${logs[@]}"} || { (( _hb_on == 1 )) && hb_any_stalled "${_hbag[@]}"; } ; }; then
      if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓（窗口超时终态复核）"; return 0; fi
      note "[真值] $desc ✗（早判卡死：静默>${idle_half}s 且日志尾为错误态——左移件 b，不等窗满；负责人 $agents）"
      return 1
    fi
    if (( $(date +%s) - last_sig > idle )); then
      if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓（窗口超时终态复核）"; return 0; fi
      note "[真值] $desc ✗（${idle}s 空转：$agents 日志零增长，判死循环/空转，非时长超限；中途已催办未响应）"
      return 1
    fi
    if (( $(date +%s) - t0 > hard )); then
      if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓（窗口超时终态复核）"; return 0; fi
      note "[真值] $desc ✗（硬窗 ${hard}s 满：活性等待总时长超限——纪律 26 兜底；负责人 $agents）"
      return 1
    fi
    sleep "$MX_POLL_IVAL"
  done
}

# ── 并发多锚等待（2026-10-08 run11 复盘立项：串行 for 等待令滞后锚的催办被
# 排队——研发工程师C 沉睡 125min 一半是"还没轮到催他"。语义=wait-all：全部锚过真值才
# 返回 0；复用 defect 步多条件合并轮询范式 + wait_alive_truth 的日志增长判活/
# 空转催办。锚过即记 ✓（不等全齐），空转催办对"全部未过锚的负责人"齐发。
# 注意：谓词经 eval 在当前 shell 求值（可引用 branch_fresh 等 shell 函数）——
# 勿改 bash -c（函数不跨子进程继承，子进程 127 恒假实锤见 raci_dispatch_seen 注释）。
wait_alive_truth_multi() { # <idle-sec> <agents-csv> <anchor-spec>...  # 失败退出时导出 MX_MULTI_FAILED_LEGS（未达锚 desc 逗号串，调用方回退记单用它防误记已过腿）
  # anchor-spec = "desc@agent@predicate-expr"（@ 分隔三段；desc 不含 @）
  local idle="$1" agents="$2"; shift 2
  local t0=$(date +%s) hard="${MX_ALIVE_HARD_SEC:-$(( idle > 900 ? idle * 8 : 7200 ))}"   # 总时长硬窗（同 wait_alive_truth：下限 7200+长 idle 档×8 放大防链式腿误杀，env 绝对覆盖）
  local -a descs=() owners=() exprs=() done_flag=()
  local s d o e a i
  for s in "$@"; do
    d="${s%%@*}"; s="${s#*@}"; o="${s%%@*}"; e="${s#*@}"
    descs+=("$d"); owners+=("$o"); exprs+=("$e"); done_flag+=(0)
  done
  local -a logs=() _hbag=()
  for a in ${agents//,/ }; do
    if [[ -f "$HERMES_ROOT/profiles/$a/logs/agent.log" ]]; then
      logs+=("$HERMES_ROOT/profiles/$a/logs/agent.log")
    elif hb_is_remote "$a"; then
      _hbag+=("$a")
    fi
  done
  if (( ${#logs[@]} == 0 && ${#_hbag[@]} == 0 )); then
    note "[观察] wait_alive_truth_multi 无日志面（agents=$agents），退化为 ${hard}s 硬窗串行等待"
    local rc=0
    for i in "${!exprs[@]}"; do
      wait_truth "${descs[$i]}" "$hard" eval "${exprs[$i]}" || rc=1
    done
    return $rc
  fi
  # 三机补强（mx-hb）：远程档案判活走心跳面；不可达→串行硬窗，绝不假判死
  local _hb_on=0 _hb_miss=0
  if (( ${#_hbag[@]} > 0 )); then
    if hb_refresh_cache 2>/dev/null && hb_all_ok "${_hbag[@]}"; then
      _hb_on=1
      note "[观察] 三机判活：远程档案 ${_hbag[*]} 走心跳面（MX_HB_ROOM）"
    else
      note "[观察] wait_alive_truth_multi 远程档案（${_hbag[*]}）心跳不可达（MX_HB_ROOM 未配/无新鲜条目），退化为 ${hard}s 硬窗串行等待"
      local rc=0
      for i in "${!exprs[@]}"; do
        wait_truth "${descs[$i]}" "$hard" eval "${exprs[$i]}" || rc=1
      done
      return $rc
    fi
  fi
  # ── 分桶判活（run19 根治）：原实现 cur_work=全员日志 max——任一 agent 有活动即
  # 全组判活，hu/lin 被 429 击杀后 chen/xiao 的活跃令个体空转被掩盖（静默 1h+ 催办
  # 永不触发，靠监控侧手工救场）。分桶后：每个未过锚 owner 独立活动桶（本地日志面
  # 优先，远程档案走心跳 lw）；催办=存在「个体静默过半且未催」的 owner（按人武装，
  # 个体活动即复位可再催）；判死=全部未过锚 owner 个体静默满 idle（保持原「全员
  # 静默才判死」的防误杀语义——部分人死透部分人在干=只催不杀）。单锚
  # wait_alive_truth 不改：其锚可由任一负责人完成，「任一人活」语义正确。
  local -a _uo_names=() _uo_sigs=() _uo_works=() _uo_nudged=() _uo_logs=()
  local _min_half="${MX_NUDGE_MIN_HALF:-300}"
  local idle_half=$(( idle / 2 )) all_done
  local _nroom="${SCAN_ROOM:-$(sget room_analysis 2>/dev/null || true)}"
  while true; do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    [[ -n "${MX_PROGRESS_FN:-}" ]] && "$MX_PROGRESS_FN" || true
    all_done=1
    for i in "${!exprs[@]}"; do
      (( done_flag[$i] == 1 )) && continue
      if eval "${exprs[$i]}" >/dev/null 2>&1; then
        done_flag[$i]=1; note "[真值] ${descs[$i]} ✓"
      else
        all_done=0
      fi
    done
    (( all_done == 1 )) && return 0
    if (( _hb_on == 1 )); then
      if ! { hb_refresh_cache 2>/dev/null && hb_all_ok "${_hbag[@]}"; }; then
        # 采样守护疑似停：三拍不可达即降级串行硬窗（不误杀真在干活的腿）
        (( ++_hb_miss >= 3 )) && {
          note "[观察] 心跳连续 ${_hb_miss} 拍不可达，降级 ${hard}s 硬窗串行等待——不假判死"
          local rc=0
          for i in "${!exprs[@]}"; do
            (( done_flag[$i] == 1 )) && continue
            wait_truth "${descs[$i]}" "$hard" eval "${exprs[$i]}" || rc=1
          done
          return $rc
        }
      else
        # 成功拍复位（分桶重写时丢的）：三拍「连续」不可达才降级——只增不减会把
        # 任意两次间歇抖动（间隔数小时、中间全部成功）后的第三次瞬时失败累计成
        # 降级，分桶个体催办/早判面被整体放弃。
        _hb_miss=0
      fi
    fi
    # 分桶刷新：每未过锚 owner 的个体 sig/work/nudge 桶 + 静默名单/判死标志/日志面收窄
    local _now=$(date +%s) _x _lg _w _ui _j
    local _lag_half="" _lag_idle_half_any=0 _lag_idle_all=1 _lag_nudge=""
    local -a _lag_logs=()
    for i in "${!owners[@]}"; do
      (( done_flag[$i] == 1 )) && continue
      _x="${owners[$i]}"
      _ui=-1
      if (( ${#_uo_names[@]} > 0 )); then
        for _j in "${!_uo_names[@]}"; do
          [[ "${_uo_names[$_j]}" = "$_x" ]] && { _ui=$_j; break; }
        done
      fi
      if (( _ui < 0 )); then
        _uo_names+=("$_x"); _uo_sigs+=("$_now"); _uo_works+=(0); _uo_nudged+=(0)
        _lg="$HERMES_ROOT/profiles/$_x/logs/agent.log"; [[ -f "$_lg" ]] || _lg=""
        _uo_logs+=("$_lg"); _ui=$(( ${#_uo_names[@]} - 1 ))
      fi
      _lg="${_uo_logs[$_ui]}"
      if [[ -n "$_lg" ]]; then
        _w=$(_agent_log_last_work_ts "$_lg" 2>/dev/null || echo 0)
      elif (( _hb_on == 1 )); then
        _w=$(hb_agent_lw "$_x" 2>/dev/null || echo 0)
      else
        _w=0
      fi
      (( _w > _uo_works[$_ui] )) && { _uo_sigs[$_ui]=$_now; _uo_works[$_ui]=$_w; _uo_nudged[$_ui]=0; }
      if (( _now - _uo_sigs[$_ui] > idle_half )); then
        _lag_half="${_lag_half:+$_lag_half,}$_x"
        (( _uo_nudged[$_ui] == 0 )) && _lag_nudge="${_lag_nudge:+$_lag_nudge,}$_x"
        _lag_idle_half_any=1
      fi
      (( _now - _uo_sigs[$_ui] > idle )) || _lag_idle_all=0
      [[ -n "$_lg" ]] && _lag_logs+=("$_lg")
    done
    if (( idle_half >= _min_half )) && [[ -n "${_lag_nudge:-}" && -n "${_nroom:-}" ]]; then
      # 分桶催办（run19 根治）：只 @ 个体静默过半且未催的 owner；原文案+陈旧分支
      # 诊断+分支感知情报全保留（见各根治注释）
      local lag="" hint="" br _fbi _m=""
      for _x in ${_lag_nudge//,/ }; do
        lag="${lag:+$lag,}$_x"; _m="${_m:+$_m,}$(agent_mxid "$_x")"
        for i in "${!owners[@]}"; do
          (( done_flag[$i] == 0 )) && [[ "${owners[$i]}" = "$_x" ]] || continue
          case "${exprs[$i]}" in
            *"branch_fresh feat/"*)
              br="${exprs[$i]##*branch_fresh feat/}"; br="${br%% *}"
              if [[ -n "$br" ]] && git -C "$DIRECTOR_CLONE" rev-parse -q --verify "refs/remotes/origin/feat/$br" >/dev/null 2>&1; then
                hint="${hint:+$hint；}feat/$br 存在但 tip 早于本轮开跑（上轮遗留）——请把本轮新提交 push 到 feat/$br（勿只留在 wt/t_* 工作区分支）"
              fi
              ;;
          esac
        done
      done
      _fbi=$(_nudge_branch_intel "$lag" 2>/dev/null || true)
      [[ -n "$hint" ]] && hint="诊断：$hint"
      mx_send "$(load_token fanfan)" "$_nroom" "⏰ 催办：仍在等待「${lag}」名下任务的真值锚（分支/交付物）。${_fbi}若已部分完成请继续收口（交付物入库并 push、结论行）；确有阻塞请在群里说明。${hint}" "$_m" >/dev/null 2>&1 || true
      note "[观察] 个体静默过半（>${idle_half}s），已向 ${lag} 催办一次${hint:+（含陈旧分支诊断）}${_fbi:+（含分支情报）}"
      for _x in ${lag//,/ }; do
        for _j in "${!_uo_names[@]}"; do
          [[ "${_uo_names[$_j]}" = "$_x" ]] && _uo_nudged[$_j]=1
        done
      done
    fi
    if (( idle_half >= 120 && _lag_idle_half_any == 1 )) && { _any_log_tail_stalled ${_lag_logs[@]+"${_lag_logs[@]}"} || { (( _hb_on == 1 )) && hb_any_stalled "${_hbag[@]}"; } ; }; then
      MX_MULTI_FAILED_LEGS=""
      for i in "${!exprs[@]}"; do
        (( done_flag[$i] == 0 )) && note "[真值] ${descs[$i]} ✗（早判卡死：个体静默>${idle_half}s 且日志尾错误态——左移件 b；负责人 ${owners[$i]}）" && MX_MULTI_FAILED_LEGS="${MX_MULTI_FAILED_LEGS:+$MX_MULTI_FAILED_LEGS,}${descs[$i]}"
      done
      return 1
    fi
    if (( _lag_idle_all == 1 )); then
      MX_MULTI_FAILED_LEGS=""
      for i in "${!exprs[@]}"; do
        (( done_flag[$i] == 0 )) && note "[真值] ${descs[$i]} ✗（${idle}s 个体空转全员静默：负责人 ${owners[$i]} 各自日志零增长；中途已分桶催办未响应）" && MX_MULTI_FAILED_LEGS="${MX_MULTI_FAILED_LEGS:+$MX_MULTI_FAILED_LEGS,}${descs[$i]}"
      done
      return 1
    fi
    if (( $(date +%s) - t0 > hard )); then
      MX_MULTI_FAILED_LEGS=""
      for i in "${!exprs[@]}"; do
        (( done_flag[$i] == 0 )) && note "[真值] ${descs[$i]} ✗（硬窗 ${hard}s 满：总时长超限——纪律 26 兜底；负责人 ${owners[$i]}）" && MX_MULTI_FAILED_LEGS="${MX_MULTI_FAILED_LEGS:+$MX_MULTI_FAILED_LEGS,}${descs[$i]}"
      done
      return 1
    fi
    sleep "$MX_POLL_IVAL"
  done
}

# ── 完成凭证反向核验（账号板断言）────────────────────────
mx_messages_deep() { # <token> <room> <since-epoch-sec> <max-pages> — dir=b 翻页直抵 since 时刻
  # 消息洪后固定窗口失效（500 条只回溯到当天上午，昨日派发被挤出）。
  # 用 end token 连续翻页，直到某页最老消息早于 since 或页数耗尽；输出与 mx_messages 同构数组。
  local tok="$1" room="$2" since_ms=$(( $3 * 1000 )) pages="${4:-10}" out='[]' page_url chunk oldest end_tok
  page_url="$HS/_matrix/client/v3/rooms/$room/messages?access_token=$tok&dir=b&limit=500"
  for _ in $(seq 1 "$pages"); do
    chunk=$(curl -sf -m 20 "$page_url" 2>/dev/null) || break
    chunk=$(printf '%s' "$chunk" | jq -c '{chunk: (.chunk // []), end: .end}' 2>/dev/null) || break
    out=$(jq -c --slurp 'add' <(printf '%s' "$out") <(printf '%s' "$chunk" | jq '.chunk') 2>/dev/null) || break
    oldest=$(printf '%s' "$chunk" | jq -r '[.chunk[].origin_server_ts] | min // 0')
    [ "${oldest:-0}" -lt "$since_ms" ] && break
    end_tok=$(printf '%s' "$chunk" | jq -r '.end // empty')
    [ -n "$end_tok" ] || break
    page_url="$HS/_matrix/client/v3/rooms/$room/messages?access_token=$tok&dir=b&limit=500&from=$end_tok"
  done
  printf '%s' "$out"
}

kanban_raci_nonempty() { # <needle> → 0=任一 产品经理A 板匹配卡带非空 raci（回灌重查谓词）
  [[ -n "$(kanban_raci_of fanfan "$1")" ]]
}

raci_dispatch_seen() { # <user1> <user2> <room> → 0=窗口内出现双向派发消息（供 wait_truth 当前 shell 直调）
  # 勿经 bash -c 包装本函数：shell 函数不跨子进程继承（未 export -f），子进程必 127 恒假。
  # 提及判定=正文 OR m.mentions 字段（派发消息正文只含被派人 mxid，
  # 团队负责人经 content."m.mentions".user_ids 附带——任务书明确要求"用 m.mentions 提及"，
  # 只查正文对合规消息恒假阴性；深翻页另证 17:20-18:10 无 产品经理A 双 @ 正文消息，
  # 观察 4 条的真因是消息未发而非窗口外）。
  mx_messages_deep "$(load_token fanfan)" "$3" $(( $(date +%s) - 3600 )) 3 \
    | jq -e --arg u1 "@$1-agent" --arg u2 "@$2-agent" \
      '[.[] | select(.type=="m.room.message")
        | (.content.body//"") as $b
        | ((.content["m.mentions"] // {}) | (.user_ids // [])) as $m
        | select((($b | contains($u1)) or ($m | any(.; startswith($u1))))
             and (($b | contains($u2)) or ($m | any(.; startswith($u2)))))] | length > 0'
}

verify_done_evidence() { # <rfd> → 0 DONE 凭证全部为真 / 1 缺失或造假
  # 只认"可反向核验"的完成：结论行里的 commit 必须真在 aipaydev origin 上、
  # 且该 commit 确实含分析稿；card 必须能在 锚档案（MX_ANCHOR_USER）的账号板查到。
  # 空喊"完成"不计入。
  local rfd="$1" body sha card
  # 注释必须写在命令替换之外：续行 \` 之后的注释行会吞掉续行，| jq 成为行首管道，
  # 整个替换体解析失败、jq 过滤器不执行，body 变成全量消息 JSON（P1，防造假失效）。
  # /messages?dir=b 返回顺序是"新→旧"，必须取 first；取 last 会拿到最旧那条
  # 无凭证裸 DONE，把已重报的合格凭证误判为不合格（09-23 实锤 false negative）。
  # 双重过滤防回声自毒（09-26 实锤 false negative）：派发指令与打回消息本身都含
  # "ANALYSIS-DONE-<rfd>" 模板串，只按内容 contains 匹配时最新命中永远是验证器
  # 自己的回声。故 ①发信人钉 agent 账号（agent_mxid）②内容须带完整凭证形态
  # （commit=<hex> card=<非空白>），模板行 commit=<已推送commitId> 不满足。
  # 深翻页取样（run5 实锤 false negative）：房间消息洪（⏳ Working 心跳/多 agent 回合）下
  # 固定 200 条只回溯几分钟，17:20 的真结论行 17:25 就被挤出窗口，凭证核验永远差一拍。
  # 改 mx_messages_deep 回溯 48h 翻页取样；判别逻辑不变（发信人+凭证形态双过滤）。
  body=$(mx_messages_deep "$(load_token "$MX_ANCHOR_USER")" "$(sget room_analysis)" $(( $(date +%s) - 172800 )) 12 2>/dev/null \
    | jq -r --arg p "ANALYSIS-DONE-$rfd" --arg s "$(agent_mxid "$MX_ANCHOR_USER")" \
      '[.[] | select((.sender//"") == $s)
            | select((.content.body//"") | contains($p))
            | select((.content.body//"") | test("commit=[0-9a-fA-F]{7,40} card=[^ ,；;]+"))
       ] | first | .content.body // ""')
  [[ -n "$body" ]] || { note "[凭证] 未见 $rfd 的 DONE 行"; return 1; }
  sha=$(printf '%s' "$body" | grep -oE 'commit=[0-9a-fA-F]{7,40}' | head -1 | cut -d= -f2)
  # card 提取钉字符集（run4 实锤）：agent 结论行常带 Markdown 加粗（**card=t_xxx**），
  # [^ ,；;]+ 会把 ** 一起吃进卡号致反核 grep 失配、真凭证误判虚报。卡 ID 只含
  # [A-Za-z0-9_-]，钉死字符集对加粗/代码块包裹免疫。
  card=$(printf '%s' "$body" | grep -oE 'card=[A-Za-z0-9_-]+' | head -1 | cut -d= -f2)
  [[ -n "$sha" && -n "$card" ]] || { note "[凭证] DONE 行缺 commit/card 凭证：$body"; return 1; }
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "$sha^{commit}" 2>/dev/null \
    || { note "[凭证] commit $sha 不存在于 aipaydev —— 虚报"; return 1; }
  git -C "$DIRECTOR_CLONE" ls-tree -r --name-only "$sha" 2>/dev/null | grep -q "${rfd}-tasklist.md" \
    || { note "[凭证] commit $sha 里没有 ${rfd}-tasklist.md —— 虚报"; return 1; }
  # 卡号反核含 archived（09-26 实锤 false negative）：agent 完成后归档卡属正常工作流，
  # kanban_list（默认活跃态 + studio API 面）都看不到 archived 真卡，曾把合格凭证
  # 误判"虚报"。改 CLI 直查全状态（活跃 + archived）；studio API 整板返空问题另记。
  # 跨节点护栏（2026-10-12 三机轮）：fanfan 档案不在本节点时其板 DB 不在本地，
  # CLI/本机 studio 都查不到——降级为「git 真值 + DONE 行凭证形态」双核（commit 反查
  # 照旧强断言），卡面反查留档说明，不误杀也不虚放（虚报防线主要靠 commit 真值）。
  if ! node_has fanfan; then
    note "[凭证] fanfan 档案不在本节点（$(node_mode_desc)）——卡面反查降级跳过，git 真值已核：card=$card"
    return 0
  fi
  local slug card_found=1
  for slug in $(account_boards "$MX_ANCHOR_USER"); do
    if HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list 2>/dev/null | grep -q "$card" \
      || HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list --status archived 2>/dev/null | grep -q "$card"; then
      card_found=0; break
    fi
  done
  [[ $card_found -eq 0 ]] \
    || { note "[凭证] 锚档案账号板查无卡片 ${card}（含 archived）—— 虚报"; return 1; }
  note "[凭证] $rfd 完成证据成立（card 在锚档案账号板可查）：commit=$sha card=$card"
  return 0
}

# ── 仓库/房间真值 ───────────────────────────────────────
evidence_baseline() { # → stdout: 秒级证据新鲜度基线（run18 复盘 F3/F4 根治抽取）
  # 本轮 run_started_at；lite 轮回落夹具源轮开跑时刻（repo_has 原口径抽为单一事实源，
  # test_report_on_integration / kanban_card_gate_verdict / QGate 拷贝点同源复用）。
  # 空=旧 state 兼容形态（调用方自行决定跳窗）。
  local _rs
  _rs="$(sget run_started_at)"
  if [ "$(sget lite_round)" = "1" ]; then
    local _fx_rs
    _fx_rs="$(sed -n 's/^run_started_at=//p' "$SIM_ROOT/runs/$(sget lite_fixtures_from)/state.env" 2>/dev/null | head -1)"
    [ -n "$_fx_rs" ] && _rs="$_fx_rs"
  fi
  echo "${_rs:-}"
}
repo_has() { # <path-in-repo>（导演 clone 拉最新后核验）
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" show "origin/main:$1" >/dev/null 2>&1 || return 1
  # 工件新鲜度（run5 教训：旧轮 AN-*/T-* 稿未被 mx-clean 清掉，"文件存在"被旧稿
  # 满足=假真值）。文件在 origin/main 的最后提交时间必须 ≥ 本轮首次开跑时刻；
  # run_started_at 缺键（旧轮 state）时保持旧语义并告警，不静默放行新代码路径。
  # 基线解析= evidence_baseline（lite 轮回落夹具源轮开跑时刻——「不早于夹具源轮」
  # 才是夹具语义下的真新鲜，更早旧稿仍被拒；夹具源 state 异常回落本轮基线保守不放水）。
  local _rs
  _rs="$(evidence_baseline)"
  if [ -z "$_rs" ]; then
    log "[观察] repo_has 无 run_started_at 键（旧 state 兼容），跳过新鲜度窗口：$1"
    return 0
  fi
  local _ct
  _ct="$(git -C "$DIRECTOR_CLONE" log -1 --format=%ct "origin/main" -- "$1" 2>/dev/null)"
  [ -n "$_ct" ] || return 1
  (( _ct >= _rs ))
}
test_report_on_integration() { # <rfd>：测试报告在 origin/integration/<rfd>（发布基线分支口径，
  # 与 testpass 派发词 push 目标一致）。testpass/uat 用 repo_has（origin/main
  # 口径）查一份只进 integration 的报告=永假——testpass 六代重启代代白派、UAT 九连死循环
  # 3h45m 的共同根因位。冻结件仍走 repo_has（main 口径）。
  # run18 复盘 F3 根治（闸键-证据耦合）：加同款新鲜度窗——run18 实锤 origin/integration
  # 上的报告是源轮旧件（正文自标 RUN=源轮号），存在性为真→本轮根本没派报告任务、g4 照落。
  # 旧件不满足窗=谓词假=走派单等待（调用方既有链路）；lite 轮经 evidence_baseline
  # 回落夹具源轮基线（源轮真值=夹具语义合法）。
  # run19 复盘根治（G4 结论语义）：存在+新鲜度之外还须结论 PASS——run19 实锤 TEST-FAIL
  # 实文（结论行 TEST-FAIL-RFD-001）被存在性判定当过闸落键，评审侧以「G4 实质未过」
  # 拦截（缺项 R-1）。FAIL 报告走派单等待链（qi 复测覆盖旧文），不再静默过闸。
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  local _body
  _body="$(git -C "$DIRECTOR_CLONE" show "origin/integration/$1:docs/test/$1-test-report.md" 2>/dev/null)" || return 1
  [ -n "$_body" ] || return 1
  printf '%s' "$_body" | grep -qE 'TEST-PASS|结论[^，。]*通过' || return 1
  local _rs _ct
  _rs="$(evidence_baseline)"
  [ -z "$_rs" ] && return 0
  _ct="$(git -C "$DIRECTOR_CLONE" log -1 --format=%ct "origin/integration/$1" -- "docs/test/$1-test-report.md" 2>/dev/null)"
  [ -n "$_ct" ] || return 1
  (( _ct >= _rs ))
}

uat_evidence_body() { # 本轮（run_started_at 起）产品经理A 发的最新一条 UAT-EVIDENCE 结论行 body；
  # 无则输出空串。证据复用（run8 优化 A）与等待后取样共用同一取法，保证"复用判定"与
  # "正式核验"看到同一行。按 origin_server_ts 排序取最新（结论行以最终一条为准），
  # 与 mx_messages 返回序解耦。
  mx_messages "$(load_token bella)" "$(sget room_analysis)" 200 2>/dev/null \
    | jq -r --arg s "$(agent_mxid fanfan)" --argjson since "${1}000" \
      '[.[] | select(.origin_server_ts > $since and .sender == $s and ((.content.body // "") | test("^\\s*UAT-EVIDENCE")))] | sort_by(.origin_server_ts) | .[-1] | .content.body // ""' 2>/dev/null
}

# repo_pull（Z3）：只刷引用、不动当前分支/工作树。旧写法 `git pull origin main` 会把
# origin/main merge 进当前分支——defect 步后 HEAD 停在 integration/${RFD_ID}，pull 即把
# main 混进集成分支污染其历史。现改为：全量 fetch 刷远端引用（repo_has/步骤内 merge 用的
# origin/*），再把本地 main 快进到 origin/main（供以本地 main 为基的路径用；main 在别处
# 检出或非快进时 git 自行拒绝，静默跳过，与 repo_commit_main 的收尾口径一致）。
repo_pull() {
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin >/dev/null 2>&1 || true
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin main:main >/dev/null 2>&1 || true
}

# ── 分支状态机约定（P4）──────────────────────────────────────
# DIRECTOR_CLONE 的 HEAD 归属：defect 步 `checkout -B integration/${RFD_ID}` 后停在
# integration 分支，后续步骤都用显式 ref（origin/integration/...）或临时 worktree 访问
# 仓库，不看 HEAD。凡**要进 origin/main 的提交**（uat 验收书/审计师A 意见书/retro 复盘）
# 一律走本函数：不切分支、不动 HEAD/local main、全程无 rebase——在临时 detached 工作区
# 基于 origin/main 把该文件提交进去再 push HEAD:main。为什么不能沿用旧写法
# "integration 上 commit 后 `git push origin main`"：推的是落后的 local main，非快进被拒
# 或空推，提交永远进不了 main，被拒即 set -e 暴毙、*_done 键落不了；rebase 被打断还会留
# rebase-merge 中间态。为什么不在原地 `checkout main` 再提交：目标文件已在 main 树里时
# （重跑轮）checkout 会被未跟踪/本地改动挡住，且脏工作树让 pull --rebase 直接拒绝。
repo_commit_main() { # <repo 相对路径> <author-name> <author-email> <commit-msg>
                     # → 0 已入 origin/main（或内容无变化幂等跳过）/ 1 失败（已收尾，无中间态）
  local path="$1" name="$2" email="$3" msg="$4"
  local wt="$SIM_ROOT/var/main-doc-wt"
  [[ -f "$DIRECTOR_CLONE/$path" ]] || return 1
  ( # 子 shell 作业：任何一步失败即退出非零，EXIT trap 统一拆工作区，不留注册残留
    trap 'rm -rf "$wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true' EXIT
    mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin || exit 1
    mkdir -p "$SIM_ROOT/var" || exit 1
    rm -rf "$wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true
    git -C "$DIRECTOR_CLONE" worktree add -q --detach "$wt" origin/main || exit 1
    mkdir -p "$wt/$(dirname "$path")" || exit 1
    cp "$DIRECTOR_CLONE/$path" "$wt/$path" || exit 1
    if [[ -n "$(git -C "$wt" status --porcelain -- "$path")" ]]; then
      git -C "$wt" add -- "$path" || exit 1
      git -C "$wt" -c user.name="$name" -c user.email="$email" \
        commit -qm "$msg" -- "$path" || exit 1
      git -C "$wt" push -q origin HEAD:main || exit 1
    fi
    # local main 快进到同一提交：它是 `git push origin main` 的推送源，落后即空推/被拒
    mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin main:main 2>/dev/null || true )
}

room_has_from() { # <room> <sender-mxid> <pattern> [since-ms]
  # since-ms（可选，默认 0）：只认该时刻之后的消息。门禁必须传派发时刻——
  # 只按 sender+pattern 匹配历史消息会让上一轮残留结论行"秒过"门禁（假完成）：
  # V4-run1 02:26:34 G5 结论行 4 秒即 ✓ 实为 01:04 的旧 READY-GATE 行，
  # 02:26:50 的 PASS 判定也可能是 01:44 超时后迟到的旧回执（TEST 侧早已用
  # SINCE_TS 过滤根治同类问题，门禁侧漏了同款修复）。
  mx_messages "$(load_token fanfan)" "$1" 120 | jq -e --arg s "$2" --arg p "$3" --argjson since "${4:-0}" \
    'map(select((.origin_server_ts // 0) > $since and .sender == $s and ((.content.body // "") | test($p)))) | any' >/dev/null 2>&1
}

# ── 闸门判词语义（run2 2026-09-29 04:49 实锤，独立审计意见 R-A2）────────
# 判词子串匹配会被「引用/讨论」消息命中：fanfan-agent 转述 stub 原文
# 「结论行 READY-GATE-PASS 或 READY-GATE-FAIL」，G5 即把该条当结论行误过
# （04:49:04 判 ✓，真实评审 04:51:27 才完成且卡面结论实为 READY-GATE-FAIL）。
# 语义：**最后一个判词赢**——结论行居末是派单既定约定（"结论行 … 开头"、卡面
# conclusion 节在 body 末尾）；同一行判词成对出现（PASS…FAIL / FAIL…PASS）视为
# 协议转述，整行不作判词（f1979781 G2 卡面自毒根治：卡面引用判词契约原文时，
# 协议文本自身不得把门禁判成 FAIL）。多条结论行取时间最新一条（打回后复审 PASS 盖过前次 FAIL）。FAIL
# 是显式判词：调用方必须熔断，不得置卡 done、不得落键（R-A2）。
mx_text_gate_verdict() { # <gate 前缀> <text> → stdout: PASS|FAIL|空（空=无判词）
  local out
  # errexit 自守（本库 set -euo pipefail 是运行态）：无判词是常态输入不是错误。
  # 判词语义（方案纪律 8；四案归一：run2 转述污染/f1979781 卡面自毒/run12 模板
  # 字面+「conclusion: X-FAIL → 复审改判 X-PASS」过渡行被成对过滤误杀；run12 卡
  # body 实证 t_c560939f）：
  #   成对行（同现 PASS 与 FAIL）分两种——含「或/二选一」=协议二选一模板或转述，
  #   整行不作判词；含「→/改判/修正」=旧判词→新判词过渡叙述，取末 token（末判词赢）；
  #   其余成对=语境不明，保守整行弃（不产生假过）。
  #   单 token 行仅两种上下文可判：行首（前导仅格式符/编号），或紧邻「结论/判词/
  #   conclusion/verdict/closing」锚点（锚点与 token 之间只允许格式符与可选为/是；
  #   「结论行写 X」类指令文本拒）。多条结论行取最后一条。
  out=$(printf '%s\n' "$2" | awk -v g="$1" '
    {
      line = $0
      # 全角冒号归一（run20 G5 实锤：中文 agent 判词行天然写「结论行：X」，全角
      # 「：」不在分隔符类，锚点紧邻判词被拒）——gsub 多字节字面量实测可用。
      gsub(/：/, ":", line)
      P = (index(line, g "-PASS") > 0); F = (index(line, g "-FAIL") > 0)
      if (P && F) {
        if (line ~ /或|二选一/) next
        if (line ~ /->|→|改判|改写|修正|覆写|已解决|已修复|已补/) {
          rest = line; v = ""
          while (match(rest, g "-(PASS|FAIL)")) {
            v = substr(rest, RSTART + length(g) + 1, 4)
            rest = substr(rest, RSTART + RLENGTH)
          }
          last = v
        }
        next
      }
      if (!P && !F) next
      tok = (P ? "PASS" : "FAIL")
      pos = index(line, g "-" tok)
      pre = substr(line, 1, pos - 1)
      if (pre ~ /^[[:space:]*_+>.#|~-]*([0-9]+[.)][[:space:]]*)?$/) { last = tok; next }
      # 锚点词尾「行」合法（run20 G5 实锤：派发词自用「结论行」词汇，agent 照写
      # 「结论行：READY-GATE-FAIL」——尾字「行」不在锚点集，锚点紧邻判词被拒，
      # 等待环对已落判词失明 1h+ 直到硬窗中止白丢一轮重评）。注意：锚点枚举必须
      # 显式列出「结论行|结论」——BSD awk LC_ALL=C 字节模式下「行?」的量词只
      # 作用于多字节字符末字节，会把字面量打碎致整分支失配（实测对照）。
      if (pre ~ /(结论行|结论|判词行|判词|conclusion|verdict|closing)[[:space:]:=*_·「」<>#|~.-]*(为|是)?[[:space:]:=*_·「」<>#|~.-]*$/) { last = tok; next }
    }
    END { print last }
  ')
  case "$out" in
    PASS) echo PASS ;;
    FAIL) echo FAIL ;;
    *) echo "" ;;
  esac
}

mx_room_gate_verdict() { # <room> <sender-mxid> <gate 前缀> [since-ms] → stdout: PASS|FAIL|空
  # 单一事实源：判词语义只在 mx_text_gate_verdict（结构锚定）；本函数只按发件人/
  # 时刻选消息并逐条取判词，末判词赢（时间序最后一条）。
  # 深翻页（run15 根治判词分页盲区）：原 mx_messages 固定 200 条，审批/回执噪音下
  # 只回溯约 50 分钟——since 锚早于该窗时旧判词被挤出页外=「判词存在但扫描不见」，
  # 等待环对已有判词失明（run15 04:08 FAIL 判词 05:0x 实测页外）。改用
  # mx_messages_deep 翻页直抵 since 时刻（页上限 8×500，翻到即停——常规 1-2 页）。
  local room="$1" sender="$2" gate="$3" since="${4:-0}" last="" ts b64 body v
  while read -r ts b64; do
    [[ "$ts" =~ ^[0-9]+$ ]] || continue
    (( ts > since )) || continue
    body=$(printf '%s' "$b64" | { base64 -d 2>/dev/null || base64 -D 2>/dev/null || true; })
    v=$(mx_text_gate_verdict "$gate" "$body")
    [[ -n "$v" ]] && last="$v"
  done < <(mx_messages_deep "$(load_token fanfan)" "$room" $(( since / 1000 )) 8 2>/dev/null | jq -r --arg s "$sender" '
    [.[] | select(.sender == $s) | [(.origin_server_ts // 0), ((.content.body // "") | @base64)]]
    | sort_by(.[0]) | .[] | @tsv' 2>/dev/null || true)
  echo "$last"
}

kanban_card_gate_verdict() { # <user> <卡 needle> <gate 前缀> [since-ms] → stdout: PASS|FAIL|空
  # 评审记录落卡 body 是准出的权威载体（派单即要求 review-record 落卡），房间行
  # 只是广播；卡判词与房间行判词由调用方合并（FAIL 优先，保守不放行）。
  # run18 复盘 F1 根治（闸键-证据耦合）：可选 since-ms 时间窗——看板跨轮持久时，
  # 源轮 PASS 卡无窗命中=越过本轮评审直接放行（run18 实锤：G5 判词全部来自源轮卡，
  # 本轮评审卡 16 秒自闭无 body）。带窗时只认 created_at ≥ 窗基线的卡；lite 轮
  # 调用方传夹具源轮基线（源轮卡=夹具真值，复用合法）。
  local body
  if [ -n "${4:-}" ]; then
    body=$(kanban_list "$1" | jq -r --arg n "$2" --argjson s "$(( $4 / 1000 ))" \
      '[.. | objects | select(has("title")) | select((.created_at // 0) >= $s)
        | select(((.title // "") + (.body // "") + (.result // "")) | contains($n)) | (.body // "") + "\n" + (.result // "")][0] // ""')
  else
    body=$(kanban_list "$1" | jq -r --arg n "$2" \
      '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "") + (.result // "")) | contains($n)) | (.body // "") + "\n" + (.result // "")][0] // ""')
  fi
  mx_text_gate_verdict "$3" "$body"
}

mx_gate_verdict_seen() { # <room> <sender> <gate> [since-ms] → 0 当出现任一判词结论行
  [[ -n "$(mx_room_gate_verdict "$@")" ]]
}

mx_gate_verdict_dual_seen() { # <room> <sender> <gate> <since-ms> <card-user> <card-needle> → 0 房间行或卡面任一出现判词
  # 双源到达判定（run4）：系统架构师A 评审可经 kanban worker 执行（写卡不发房）——只盯房间行
  # 会让真实结论永远等不到。到达=任一源出现；判 PASS/FAIL 仍由 combined 保守合并。
  [[ -n "$(mx_gate_verdict_combined "$@")" ]]
}

mx_gate_verdict_pass() { # <room> <sender> <gate> [since-ms] → 0 仅当最新结论判词为 PASS
  [[ "$(mx_room_gate_verdict "$@")" == "PASS" ]]
}

mx_gate_verdict_combined() { # <room> <sender> <gate> <since-ms> <card-user> <card-needle> → stdout: PASS|FAIL|空
  # 房间行 + 评审卡 body 双源合并（R-A2）：FAIL 任一出现即 FAIL（保守不放行），
  # 仅当无 FAIL 且任一 PASS 才 PASS。卡 body 是权威载体（review-record 在卡）；
  # 复审轮必须同步更新卡结论行，否则旧 FAIL 判词持续拦门（安全方向）。
  # 判词送达确认（方案纪律 8）：卡面有判词而房间行缺失=发送哑火——代发一条显式
  # 标注的对照行补房间记录（转写卡面判词并注明来源，不改判词语义；每闸至多一次）。
  local rv cv
  rv="$(mx_room_gate_verdict "$1" "$2" "$3" "$4")"
  cv="$(kanban_card_gate_verdict "$5" "$6" "$3" "${4:-}")"
  if [[ -n "$cv" && -z "$rv" && "$(sget "verdict_relay_${3}")" != "1" ]]; then
    sset "verdict_relay_${3}" 1
    mx_send "$(load_token fanfan)" "$(sget room_analysis)" "[判词对照行·relay] ${3}-${cv}（来源=评审卡 ${6} body 结论行；房间原行未达，代发对照行补记录）" >/dev/null 2>&1 || true
  fi
  if [[ "$rv" == "FAIL" || "$cv" == "FAIL" ]]; then echo FAIL; return 0; fi
  if [[ "$rv" == "PASS" || "$cv" == "PASS" ]]; then echo PASS; return 0; fi
  echo ""
}

mx_gate_combined_pass() { # 同 mx_gate_verdict_combined，供 wait_truth 断言用
  [[ "$(mx_gate_verdict_combined "$@")" == "PASS" ]]
}

kanban_card_body_nonempty() { # <user> <needle> → 0 当匹配卡 body 非空
  # run18 复盘 F1 配套谓词：判词 PASS 而 body 空=无评审实物（房间行/代发行撑判词），
  # finalize 前须等 review-record 真落卡。供 wait_truth 断言用。
  local body
  body=$(kanban_list "$1" 2>/dev/null | jq -r --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .body][0] // ""' 2>/dev/null)
  [[ -n "$body" ]]
}

dispatch_in_room() { # <humanUser> <text> <mention-mxid-csv> → event_id
  local m uid rid u lp members
  if [ "$(posture)" = "strict" ]; then
    # V8.29 §2.4 待收紧面：strict 不发预写派发词（拆分/人日/纪律归组织侧自主产出）
    set -- "$1" "【自主组织】收到需求派单：请对 ${RFD_ID:-当前轮} 需求按你的职能自主拆分、评估与派发执行；验收以 G1 冻结单 AC 为准，双凭证（commit+卡号）收口。本消息不预设拆分与人日。" "${3:-}"
  else
    compensate dispatch-preset "from=$1 text=${2:0:60}（预写派发词代演人类派单）" 2>/dev/null || true
  fi
  local uids=()
  uid="$(human_mxid "$1")"; rid="$(sget room_analysis)"
  # 成员保障 v2（09-26 v1 只保派发者；09-29 重构轮扩展到全部被 @ 责任人）：
  # 指令必达前置——被 @ 者不在群则 mention 不可达、其 agent 无从接单
  # （V4-run1 room-invite-gap ×8 复发实锤：接收方而非派发方缺位）。
  # 不在群则 产品经理A 补邀 + 该账号自入（join 按 mxid localpart 取 token）。
  uids=("$uid")
  if [[ -n "${3:-}" ]]; then
    local IFS=','
    read -r -a uids_m <<< "$3"
    uids+=("${uids_m[@]}")
  fi
  members="$(mx_room_members "$(load_token fanfan)" "$rid" 2>/dev/null || true)"
  for u in "${uids[@]}"; do
    [[ -n "$u" ]] || continue
    if ! printf '%s\n' "$members" | grep -qxF "$u"; then
      mx "$(load_token fanfan)" POST "rooms/$rid/invite" "{\"user_id\":\"$u\"}" >/dev/null 2>&1 || true
      lp="${u%%:*}"; lp="${lp#@}"
      mx_join "$(load_token "$lp")" "$rid" >/dev/null 2>&1 || true
    fi
  done
  local _body="$2
[派发标识 RUN=${RUN_ID:-default}] 去重键=任务 ID+RUN：同任务 ID 的历史轮（不同 RUN）不构成重复派单，接收方须**从零重新执行**本任务——历史轮产物、git 历史提交（含悬空提交）与前轮遗留文件均不得引用、恢复或作为完成依据；若发现疑似历史遗留，如实说明并忽略之。判定重复也必须回执合并回执，禁止静默。
[RACI 解析] 本任务唯一执行人=任务书正文被指名执行的主责 agent（首个 @）；其余 @ 为 RACI 会签/评审角色（lead 等），不执行本任务、仅知情与确认。结论行只由执行人发。"
  m=$(mx_send "$(load_token "$1")" "$(sget room_analysis)" "$_body" "$3")
  m=$(_verify_dispatch_delivery "$1" "$m" "$_body" "$3")
  note "[$1] 派发 ($m): $(echo "$2" | head -1)"
  _progress_ledger_record "$1" "$2" "${3:-}" "$m"
  echo "$m"
}

# 空转收场检测（2026-10-11 停摆误诊根治轮，run14 六会话六小时实录）：会话
# Turn ended: text_response 正常收场但零交付（末轮 ~6 token 短句自了断）——驱动在
# 产物/缺陷等待环调用本函数，责任人档案命中该形态即记单+按微任务策略重派（一次
# 1-2 个动作的短指令，与短回合存活形态对齐；禁整任务重派——长上下文会话同型复发）。
_agent_last_work_ts() { # <agent.log> → epoch
  local line ts
  line=$(grep -E "API call #|tool [a-z_]+ completed" "$1" 2>/dev/null | tail -1)
  [[ -n "$line" ]] || { echo 0; return; }
  ts=$(printf '%s' "$line" | cut -c1-19)
  mxp_date_to_epoch "$ts"
}
_agent_idle_ending() { # <profile> <within-sec=600> → 0=命中空转收场形态
  local prof="$1" win="${2:-600}" log te wts now
  log="$HERMES_ROOT/profiles/$prof/logs/agent.log"
  [[ -f "$log" ]] || return 1
  te=$(grep -E "Turn ended: reason=text_response" "$log" 2>/dev/null | tail -1 | cut -c1-19)
  [[ -n "$te" ]] || return 1
  now=$(date +%s)
  te=$(mxp_date_to_epoch "$te")
  wts=$(_agent_last_work_ts "$log")
  (( now - te < win )) && (( now - wts > 300 )) && return 0
  return 1
}

# 缺陷卡认领真伪核验（2026-10-11 边界语义轮 R1，run14 00:3x 实证：占位值 default
# 过了必填校验但认领围栏按档案名精确匹配→卡无人可领烂在 todo 一小时）。驱动在缺陷
# 等待环调用；占位/不在编制的 assignee 记问题单并打回建卡人重填。
defect_cards_assignee_check() { # <board> → stdout: 卡ID:assignee 违规清单（空=全过）
  local board="$1" out="" line aid asg
  while IFS='|' read -r aid asg; do
    [[ -n "$aid" ]] || continue
    if ! printf '%s\n' "${INSTANCED_USERS[@]}" | grep -qxF "$asg"; then
      out="${out}${aid}:${asg} "
    fi
  done < <(HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban --board "$board" list --json 2>/dev/null     | jq -r '.[]? // empty | select((.title // "") | startswith("【缺陷】")) | select(.status == "todo" or .status == "ready") | [.task_id // .id, (.assignee // "")] | @tsv' 2>/dev/null | tr '\t' '|')
  [[ -n "$out" ]] && note "[核验] 缺陷卡 assignee 违规（${board}）：${out}——占位/不在编制，打回建卡人重填（run14 A1 形态）"
  printf '%s' "$out"
}

# 派发事实进产品进度台账（进度可感知链·推演侧点亮件，2026-10-10 ①）：任务派发
# 正文带任务码（AN-/DEV-/TEST- 前缀）时，向产品 dispatch-ledger.jsonl 追加一行
# kind=mention 带 taskId 的记录——/api/progress/tasks 据此按卡聚合（会话面由
# 引擎投影提供，缺席时里程碑回退；里程碑文件在执行者工作区由技能侧上报）。
# 幂等性：同 event-id 重放由读侧 commandId 去重兜底；本侧只追加不重写。
_progress_ledger_record() { # <dispatcher> <body> <mentions-csv> <event-id>
  local dispatcher="$1" body="$2" mentions="$3" ev="$4" tid lp ws
  # run14 11:2x 实锤根因：派发词无任务号时 grep 零命中 rc=1，pipefail 下赋值语句
  # 失败触发 set -e 静默杀驱动（G5 评审词无 AN/DEV/TEST 号——唯一必死派发，驱动
  # note 同秒 rc=1 退场）。失败安全化：零命中=无任务号不记账，不杀调用方。
  tid=$(printf '%s' "$body" | { grep -oE '\b(AN|DEV|TEST)-[A-Za-z0-9-]+' || true; } | head -1)
  [[ -n "$tid" ]] || return 0
  [[ -n "$ev" && "$ev" != "SEND-FAILED" ]] || return 0
  # 执行者=首个 mention 的 localpart；工作区按约定 workspaces/<执行者>/aipaydev
  lp=$(printf '%s' "$mentions" | cut -d, -f1 | sed -E 's/^@//; s/:.*//; s/-agent$//')
  ws="${SIM_ROOT}/workspaces/${lp}/aipaydev"
  [[ -d "$ws" ]] || ws=""
  local ledger="${GOVERNANCE_DISPATCH_LEDGER:-$HOME/.hermes-web-ui/overlay/dispatch-ledger.jsonl}"
  mkdir -p "$(dirname "$ledger")" 2>/dev/null || return 0
  printf '%s\n' "$(jq -nc \
    --arg ts "$(date +%s000)" \
    --arg kind "mention" \
    --arg target "${lp:-$dispatcher}" \
    --arg reason "queued" \
    --arg cmd "$ev" \
    --arg tid "$tid" \
    --arg ws "$ws" \
    --arg det "sim-dispatch by ${dispatcher}" \
    '{ts:($ts|tonumber),kind:$kind,target:$target,reason:$reason,commandId:$cmd,taskId:$tid,workspaceId:(if $ws=="" then null else $ws end),detail:$det}')" >> "$ledger" 2>/dev/null || true
}

# ── 派发可达性校验（run11 根治②b）：消息入房≠网关拉起 agent——容量重试队列
# 满时网关静默丢弃/长持消息（当日 400+ 丢件，驱动持 event id 却蒙在鼓里）。
# 派发后短窗查最新网关日志：该 event 伴随容量丢弃/排队 → 自动重递一次（带重递
# 标记，语义等同原任务书）+ 记问题单。慢路径（held 20min 后丢）抓不到，由巡检
# cron 兜底；本机制消灭的是"即时丢弃驱动不知情"这一主类（当日全部事故形态）。
_verify_dispatch_delivery() { # <user> <event-id> <body> <mentions> → 生效 event id
  local user="$1" ev="$2" body="$3" mentions="$4" gw_log m2
  [[ -n "$ev" && "$ev" != "SEND-FAILED" ]] || { printf '%s' "$ev"; return 0; }
  gw_log=$(ls -t "$LOGS_DIR"/gateway*.log 2>/dev/null | head -1)
  [[ -n "$gw_log" ]] || { printf '%s' "$ev"; return 0; }
  sleep 3
  if { grep "dropping message for" "$gw_log" 2>/dev/null; grep "Capacity retry for" "$gw_log" 2>/dev/null; } | grep -qF "$ev"; then
    echo "ISSUE|dispatch-capacity-drop|${user}|派发 ${ev} 遭容量丢弃/排队，已自动重递" >> "$EVID_DIR/issues.log"
    note "[${user}] 派发 ${ev} 命中容量限制——自动重递一次"
    m2=$(mx_send "$(load_token "$user")" "$(sget room_analysis)" "$body
[重递标记] 上一条 ${ev} 遭网关容量限制未达，本条为同一任务书重递，语义等同；若上一条实际已处理，按去重键合并回执即可。" "$mentions")
    printf '%s' "$m2"
    return 0
  fi
  printf '%s' "$ev"
}

# ── 推演单驱动锁（单一事实源，可单测）────────────────────────
# 双会话双开推演是实测最高频互踩源（共享 state.env/板库/房间双写）。mkdir 原子锁
# （macOS 无 flock；mkdir 在各文件系统均原子）：锁不可得即大声拒绝，不静默并发。
# 陈锁判定根治（2026-09-29 V4-run1 02:26 实锤）：旧版 `sed -n 's/^pid=//p'` 把
# "pid=84431 start=… host=…" 整段取出，`kill -0 "84431 start=…"` 报 illegal pid
# 恒失败 → **活锁被误判陈锁、被接管**——run1 ready 续跑误抢 run2 活锁，双驱动同栈
# 互写 12 分钟。判活只取 pid 数字段；解析不出一律按活锁拒绝（宁停勿抢）。
mx_lock_holder_pid() { # <info-file> → 持锁 pid（仅数字段；解析不出=空串）
  sed -n 's/^pid=\([0-9][0-9]*\).*/\1/p' "$1" 2>/dev/null | head -1
}

mx_driver_lock_acquire() { # <lock-dir> <pid> → 0 取得 / 1 活锁被占 / 2 接管竞争失败
  local d="$1" pid="$2" held
  _mx_lock_info() { printf 'pid=%s start=%s host=%s\n' "$2" "$(date '+%F %T')" "$(hostname -s)" > "$1/info"; }
  if mkdir "$d" 2>/dev/null; then _mx_lock_info "$d" "$pid"; return 0; fi
  held=$(mx_lock_holder_pid "$d/info")
  if [[ -n "$held" ]] && ! kill -0 "$held" 2>/dev/null; then
    # 接管原子化：mv 摘走陈锁再 mkdir，绝不原地 rm——kill -0 判死与 rm 之间第三方
    # 可新建活锁被误删（双驱动同栈互写）。竞争失败时陈锁归档 ${d}.stale.$$ 可回查。
    local stale="${d}.stale.$$"
    mv "$d" "$stale" 2>/dev/null || return 2
    if mkdir "$d" 2>/dev/null; then _mx_lock_info "$d" "$pid"; rm -rf "$stale"; return 0; fi
    return 2
  fi
  return 1
}

# ── 硬闸打回熔断（跨调用持久，人工放行留痕）──────────────────
# 语义定性（2026-09-29 g5-ready-fail 记档）：V3 "两轮未过，不得发布/不得开始"是
# 防 agent 无限重做回路的硬闸；断点续跑曾静默重置轮次绕过熔断（run1 01:44 G5
# 两轮熔断 → 02:26 续跑直接放行）。根治：轮次计数按 RUN 落 state 持久化，达阈值
# 后新调用直接拒绝；人工确认可重试须 GATE_BREAKER_OVERRIDE=1 显式放行并记 issue
# （不可逆决策留痕，符合 V3 总则"人只守意图对齐与不可逆决策"）。
mx_gate_breaker_trip() { # <gate-key> <label> <unpassed-rounds>：记 N 轮未过
  local key="$1" label="$2" n="${3:-1}" cur
  cur=$(sget "${key}_fail_rounds"); cur=${cur:-0}
  sset "${key}_fail_rounds" $(( cur + n ))
  sset "${key}_trip_sig" "$(_mx_gate_evidence_sig "$label")"
  note "[熔断] ${label} 累计 $(( cur + n )) 轮未过（阈值 2）"
}

mx_gate_breaker_check() { # <gate-key> <label>：≥2 轮未过则拒绝；复位=证据变化或人工复议
  local key="$1" label="$2" cur sig trip_sig reason
  cur=$(sget "${key}_fail_rounds"); cur=${cur:-0}
  (( cur < 2 )) && return 0
  # 复位=证据变化（方案纪律 8）：trip 时记录证据签名，check 自比对——出现新派发/
  # 判词/复审/补齐证据即新尝试，自动放行；证据零变化的重复尝试继续拦截（熔断只拦
  # 空转，不拦改进）。
  sig=$(_mx_gate_evidence_sig "$label")
  trip_sig=$(sget "${key}_trip_sig")
  if [[ -n "$trip_sig" && "$sig" != "$trip_sig" ]]; then
    sset "${key}_fail_rounds" 0
    sset "${key}_tripped_logged" 0
    echo "ISSUE|gate-breaker-reset|director|${label} 证据变化复位（签名 ${trip_sig}→${sig}）：新尝试放行" >> "$EVID_DIR/issues.log"
    note "[熔断] ${label} 证据变化复位（签名 ${trip_sig}→${sig}）"
    return 0
  fi
  if [[ "${GATE_BREAKER_OVERRIDE:-0}" == "1" ]]; then
    # 人工复议留痕（方案纪律 8）：须带原因；事件入 approved.events；复议后仍走正常判词
    reason="${GATE_BREAKER_REASON:-}"
    if [[ -z "$reason" ]]; then
      echo "ISSUE|gate-breaker-override-refused|director|${label} 复议缺 GATE_BREAKER_REASON（须记原因+变化证据），拒绝放行" >> "$EVID_DIR/issues.log"
      fail "${label} 熔断复议缺原因：GATE_BREAKER_OVERRIDE=1 必须与 GATE_BREAKER_REASON=<原因/变化证据> 同时给出"
    fi
    echo "ISSUE|gate-breaker-override|director|${label} 熔断复议放行（${cur} 轮未过）：${reason}" >> "$EVID_DIR/issues.log"
    echo "humangate:${key} GATE-BREAKER-REVIEW director-human $(date +%s) reason=${reason}" >> "$EVID_DIR/approved.events"
    sset "${key}_fail_rounds" 0
    sset "${key}_tripped_logged" 0
    return 0
  fi
  # 幂等记单（方案纪律 8）：同闸熔断只记一次，重试不刷单（run12 214 条重复记单根治）
  if [[ "$(sget "${key}_tripped_logged")" != "1" ]]; then
    sset "${key}_tripped_logged" 1
    echo "ISSUE|gate-breaker-tripped|director|${label} 熔断（${cur} 轮未过），本轮拒绝执行；复位条件=证据变化自动复位或人工复议（GATE_BREAKER_OVERRIDE=1 + GATE_BREAKER_REASON=<原因>）" >> "$EVID_DIR/issues.log"
  fi
  fail "${label} 打回熔断（${cur} 轮未过，V3 硬闸）：不得继续。证据变化后自动复位；人工复议须同时给 GATE_BREAKER_OVERRIDE=1 与 GATE_BREAKER_REASON。"
}

_mx_gate_evidence_sig() { # <label> →证据签名=scenario.log 证据行数+integration tip+评审卡面哈希
  local label="$1" c extra=""
  c=$(grep -cE "(派发|判词|结论|补齐|复审|评审|回执).{0,120}${label}|${label}.{0,120}(派发|判词|结论|补齐|复审|评审|回执)" "$EVID_DIR/scenario.log" 2>/dev/null || true)
  # 纪律 8 全口径（run14 实锤根因）：旧签名只数 scenario.log 行——驱动停着日志不涨，
  # 外部证据（新提交/新判词/卡面更新）全盲，熔断 85 圈循环永不复位。并入 integration
  # tip 与该闸评审卡 body 哈希，三类复位证据（提交/判词/卡面）全覆盖。
  local repo="$SIM_ROOT/central/aipaydev"
  mx_fetch -C "$repo" fetch -q origin 2>/dev/null
  extra="itip:$(git -C "$repo" rev-parse --short "origin/integration/${RFD_ID:-RFD-001}" 2>/dev/null || echo -)"
  if [[ "$label" == *G5* ]]; then
    local rgid db
    rgid=$(sget card_g5_ready 2>/dev/null || true)
    if [[ -n "${rgid:-}" ]]; then
      db="$SIM_ROOT/hermes/kanban/boards/fanfan-review/kanban.db"
      extra="${extra} card:$(sqlite3 "$db" "SELECT body FROM tasks WHERE id='${rgid}';" 2>/dev/null | shasum | cut -c1-12)"
    fi
  fi
  echo "${c:-0}:${extra}"
}

# ── V3 生命周期治理助手 ─────────────────────────────────
gate_blocked() { # <gate-key> <step-name>：硬闸检查——闸门 state 键未落即拒入后续步骤
  local key="$1" step="$2"
  [[ -n "$(sget "$key")" ]] && return 0
  echo "ISSUE|gate-bypass-blocked|${step}|硬闸 $(basename "$key") 未过，${step} 不得执行（V3 §3 治理总纲）" >> "$EVID_DIR/issues.log"
  fail "硬闸未过：${step} 前置闸门（${key}）未冻结，中止（见方案 V3 闭环治理）"
}

freeze_doc() { echo "docs/requirements/${RFD_ID}.freeze.md"; }

repo_branch_has() { # <branch> <path-in-repo>：远端分支上文件存在性（证据反查）
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "refs/remotes/origin/$1:$2" 2>/dev/null
}

uat_ac_covered() { # <ac-list> <body> → 缺失 AC 编号清单（空串=逐条覆盖）
  local missing="" ac
  for ac in $1; do
    case "$2" in *"$ac"*) ;; *) missing="$missing$ac " ;; esac
  done
  printf '%s' "$missing"
}

uat_ac_verdict() { # <body> <AC-id> → 通过|有条件通过|不通过|未见
  # 逐条判词语义见 uat_verdict.py 模块头（单一事实源）：AC 组+判词共享切段、
  # 括号注耐受、冻结AC-M 映射归属包容、整词匹配、后段更具体者胜。
  # 后端独立成 py：BSD sed 括号表达式按字节啃多字节字符（剥注即毁正文，
  # 2026-10-02 守门 2 红实锤），正则语义放 python re 才稳；stdin 传正文，
  # 脚本走文件不占 stdin（heredoc 当脚本时 stdin 已被解释器吃掉的坑）。
  printf '%s' "$1" | python3 "$MX_SCRIPT_DIR/uat_verdict.py" "$2"
}

issue_disp_stat() { # → "<ISS_N> <DISP_N>" 问题单/处置记账条数（DISP|type|subject|disposition|note）
  local iss=0 disp=0
  [[ -f "$EVID_DIR/issues.log" ]] || { echo "0 0"; return 0; }
  iss=$(grep -c '^ISSUE|' "$EVID_DIR/issues.log" 2>/dev/null || echo 0)
  disp=$(grep -c '^DISP|' "$EVID_DIR/issues.log" 2>/dev/null || echo 0)
  echo "$iss $disp"
}

# ── M1 应用初始化：资产登记表（docs/admin/app-registry.md 生成）────
app_registry_gen() { # → stdout：registry 内容
  echo "# 应用资产登记表（app-registry，$(date '+%F %T')）"
  echo
  echo "| 应用 | 负责人 | 专属看板 | 技术栈 | SLA 级 | 状态 | 门禁骨架 |"
  echo "|---|---|---|---|---|---|---|"
  apps_of | while IFS='|' read -r app owner board stack sla; do
    skel="缺"
    ls "$DIRECTOR_CLONE/apps/$app/"vitest.config.* >/dev/null 2>&1 && skel="✓"
    echo "| $app | $owner | $board | $stack | $sla | 在役 | vitest ${skel} |"
  done
  echo
  echo "- 初始化约定：新应用必须建 apps/<app>/ 脚手架（package.json+vitest 配置+README）、登记本表、挂负责人专属看板（board.json default_workdir 指向工作区）；退役应用置「退役」并归档看板。"
}

# ── M2 人员管理：组织与权限矩阵（docs/admin/org.md 生成 + 对账）────
org_gen() { # → stdout：org.md 内容（编制×角色×汇报线×板×team×权限）
  echo "# 研发组织与权限矩阵（org，$(date '+%F %T')）"
  echo
  echo "## 编制（角色×汇报线×板×team）"
  echo "| 账号 | 角色 | 汇报线(lead) | 板（team） | matrix 账号 |"
  echo "|---|---|---|---|---|"
  echo "| admin | 主管（治理裁决） | — | — | @admin |"
  for u in "${INSTANCED_USERS[@]}"; do
    case "$u" in
      bella) role="需求分析师（BA）"; lead="admin" ;;
      fanfan) role="项目管理（PM）+ 系统分析主持" ; lead="admin" ;;
      wei) role="支付后端 lead（系统分析师）"; lead="fanfan" ;;
      mei) role="前端 lead"; lead="fanfan" ;;
      chen|hu|lin|xiao) role="研发（系统分析执行+编码）"; lead="wei/mei" ;;
      qi|fei) role="测试（独立验证）"; lead="fanfan" ;;
      arch) role="系统架构（G2 架构治理）"; lead="admin" ;;
      secops) role="安全管理（ISO27001/涉敏评估/发布安全）"; lead="admin" ;;
      ops) role="运维管理（ITIL/服务目录/发布执行/回滚）"; lead="admin" ;;
      audit) role="合规及审计管理（门禁留痕/凭证抽检/合规意见）"; lead="admin" ;;
    esac
    boards_fmt=$(boards_of "$u" | tr ' ' '\n' | sed 's/^\(.*\):\(.*\)$/\1(\2)/' | tr '\n' ' ')
    echo "| $u | $role | $lead | ${boards_fmt} | @${u} / @${u}-agent |"
  done
  echo
  echo "## 权限矩阵"
  echo "- 看板可见性：studio ACL 按 matrix 账号收敛——每人只见本账号 profile 与账号板（patch 392）。"
  echo "- 认领围栏：板 board.json profiles 白名单，板外 assignee 拒认领（patch 391）。"
  echo "- 审批权：lead（团队负责人A/团队负责人B）分诊确认；G5 对外发布 HumanGate=导演批准；安全管理复核（安全工程师A）与审计意见（审计师A）为独立签名线。"
  echo
  echo "## 入职/转岗/离职流程"
  echo "- 入职：mx-setup 幂等供给（matrix 账号+profile+技能+板授权+ACL+家族记忆 bank），入职卡登记本表。"
  echo "- 转岗：改编制表（boards_of）后重跑 mx-setup + 本对账步。"
  echo "- 离职：卡片 reassign 给接手人、板 owner 变更、账号禁用（synapse deactivate）、本表移除并在 审计师A 步留痕。"
  echo
  echo "## 能力矩阵"
  echo "- capability-report 技能按 machine-manifest 上报；系分=requirements-analyst/aipaydev-dev、测试=defect-loop、安全=iso27001 检查单、运维=release-plan/ITIL。"
}
people_reconcile() { # 对账：org 生成源（编制表）↔ fleet-manifest ↔ profile/board 实况 → 0 一致
  local bad=0 u
  for u in "${INSTANCED_USERS[@]}"; do
    [[ -d "$HERMES_ROOT/profiles/$u" ]] || { echo "profile 缺失: $u"; bad=1; }
    for b in $(boards_of "$u" | tr ' ' '\n' | cut -d: -f1); do
      [[ -f "$HERMES_ROOT/kanban/boards/$b/board.json" ]] || { echo "板缺失: $b"; bad=1; }
    done
  done
  jq -e --argjson n "${#INSTANCED_USERS[@]}" '[.users[].user] | length == $n' "$SIM_ROOT/fleet-manifest.json" >/dev/null 2>&1 \
    || { echo "fleet-manifest 用户数与编制不一致"; bad=1; }
  return $bad
}

# ── M3 工作管理：跨板台账 + WIP/stale 治理（work-report 生成）────
work_report_gen() { # → evidence/work-report.md（导演侧全量扫描 14 账号板）
  local out="$EVID_DIR/work-report.md" u slug st total wip_warn="" zero_deliver=0
  {
    echo "# 工作管理台账（work-report，$(date '+%F %T')）"
    echo
    echo "## 按人 × 状态分布（跨全部账号板）"
    echo "| 账号 | todo | running | review | done | 其他 | WIP(running) | 卡壳72h |"
    echo "|---|---|---|---|---|---|---|---|"
    for u in "${INSTANCED_USERS[@]}"; do
      local todo=0 run=0 rev=0 done=0 other=0 stale=0
      for slug in $(account_boards "$u"); do
        local db="$HERMES_ROOT/kanban/boards/$slug/kanban.db"
        [[ -f "$db" ]] || continue
        stale=$((stale + $(sqlite3 "$db" "select count(*) from tasks where status not in ('done','archived') and ifnull(created_at,0) < strftime('%s','now') - 259200" 2>/dev/null || echo 0)))
        while IFS='|' read -r st n; do
          case "$st" in
            todo) todo=$((todo+n)) ;; running) run=$((run+n)) ;;
            review) rev=$((rev+n)) ;; done) done=$((done+n)) ;;
            *) other=$((other+n)) ;;
          esac
        done < <(sqlite3 "$db" "select status, count(*) from tasks where status != 'archived' group by status" 2>/dev/null)
      done
      local flag=""
      if (( run > 2 )); then flag="⚠ 超 WIP 上限"; wip_warn=1; fi
      if (( stale > 0 )); then flag="$flag ⏳卡壳"; fi
      echo "| $u | $todo | $run | $rev | $done | $other | $run ${flag} | $stale |"
    done
    echo
    echo "## 治理口径"
    echo "- WIP 上限：每人 running 并行 ≤2，超限记问题单（容量过载信号）。"
    echo "- stale 卡：非 done 且 updated_at 超 72h 的卡清点（本轮 $(date +%s) 为基准）。"
    echo "- 跨轮衔接：retro 后未完结卡由 PM（产品经理A）决定挂起/移交下轮。"
    # ④零交付遥测：done 卡 body 无任何 commit= 锚=零交付形态（标记完成但无代码证据）
    local zd_n=0
    for u in "${INSTANCED_USERS[@]}"; do
      for slug in $(account_boards "$u"); do
        local db2="$HERMES_ROOT/kanban/boards/$slug/kanban.db"
        [[ -f "$db2" ]] || continue
        zd_n=$((zd_n + $(sqlite3 "$db2" "select count(*) from tasks where status='done' and ifnull(body,'') not like '%commit=%'" 2>/dev/null || echo 0)))
      done
    done
    if (( zd_n > 0 )); then
      echo
      echo "## 零交付遥测"
      echo "- done 状态但卡 body 无 commit= 锚的卡：${zd_n} 张（标记完成却无代码证据——逐张人工判定：治理/台账类卡属合法无锚，研发交付类卡=零交付形态）。"
      zero_deliver=$zd_n
    fi
  } > "$out"
  mask_env_paths "$out"
  [[ -n "$wip_warn" ]] && echo "WIP_OVERLOAD"
  [[ "${zero_deliver:-0}" -gt 0 ]] && echo "ZERO_DELIVER:${zero_deliver}"
  echo "$out"
}

# ── 合规及审计（审计师A）：门禁留痕完整性 + 凭证抽检 + 合规意见书 ──
audit_check() { # → 0 合规 / 1 有缺陷（输出审计发现）
  local bad=0
  # 门禁留痕：state 硬闸键已落的必须有对应仓内凭证
  if [[ -n "$(sget g1_frozen)" ]] && ! repo_has "$(freeze_doc)"; then
    echo "G1 已落键但 freeze 文件不在 origin/main"; bad=1
  fi
  # 问题单台账格式完整（ISSUE|类型|主体|描述 四段）；无台账≠缺陷（修假阳性）
  if [[ -f "$EVID_DIR/issues.log" ]]; then
    awk -F'|' '/^ISSUE\|/ && NF < 4 {exit 1}' "$EVID_DIR/issues.log" 2>/dev/null \
      || { echo "issues.log 存在字段缺失条目"; bad=1; }
  fi
  # 取证目录在位
  [[ -d "$EVID_DIR" ]] || { echo "取证目录缺失"; bad=1; }
  # 交付物对账（run8 复盘根治：商户接入文档全程缺席但零记单，直到 8.6 矩阵才暴露
  # ——REL-DELIVER 在册交付物缺件必须进台账；版本号与报告侧 ARTIFACT_VIEWS 同源硬编
  # v1.0.0-cashier，改版处两处同步）。release 已在册才查，防部分轮误报。
  if [[ -n "$(sget release_done)" && -n "${RFD_ID:-}" ]]; then
    repo_has "docs/delivery/merchant-onboarding-v1.0.0-cashier.md" \
      || { echo "REL-DELIVER 交付物缺件：docs/delivery/merchant-onboarding-v1.0.0-cashier.md 不在 origin/main"; bad=1; }
    repo_has "docs/delivery/${RFD_ID}-completeness-check.md" \
      || { echo "完备性检查缺件：docs/delivery/${RFD_ID}-completeness-check.md 不在 origin/main"; bad=1; }
  fi
  return $bad
}

rfd_doc_snapshot() { # 需求书判读/提取用快照路径：origin/main 优先，工作树兜底 → 打印路径
  # repo_pull 是 fetch-only（Z3）：远端独占更新不物化进工作树，重判轮读工作树副本会读到
  # 旧稿（2026-09-25 实证边角）。判读口径统一取 origin/main 最新；远端暂无该文件（ba cp
  # 未推的本地稿）回落工作树副本。快照落 "$STATE.rfd.tmp"，随 mx_cleanup 清理。
  local snap="$STATE.rfd.tmp"
  if git -C "$DIRECTOR_CLONE" show "origin/main:${RFD_DOC}" >"$snap" 2>/dev/null; then
    echo "$snap"; return 0
  fi
  echo "$DIRECTOR_CLONE/${RFD_DOC}"
}

reqgate_judge() { # 导演侧机械化判读 G1 四要素（不依赖 LLM）→ 0 全过 / 其他=缺失项清单
  local doc="$1" miss=""
  grep -q "^## .*验收标准" "$doc" && grep -qE "AC-[0-9]" "$doc" \
    || miss="${miss}验收标准段缺失或无 AC 编号；"
  # AC 模糊词检查：仅扫 AC 条目行（行首 "- **AC-N"），不扫段落说明行——
  # 规则说明行本身会引用模糊词示例，扫全段必然自指误报（2026-09-25 v3 实测 bug）。
  if sed -n '/^## .*验收标准/,/^## /p' "$doc" | grep -E "^\- \*\*AC-[0-9]" | grep -qE "性能良好|体验优秀|快速|稳定"; then
    miss="${miss}AC 含模糊词（不可机械化判定）；"
  fi
  grep -q "^## .*Scope-Out" "$doc" || miss="${miss}Scope-Out 缺失；"
  grep -q "^## .*影响面" "$doc" || miss="${miss}影响面缺失；"
  grep -qE "涉敏|ISO27001|iso27001" "$doc" || miss="${miss}涉敏判定缺失；"
  [[ -z "$miss" ]] && return 0
  echo "$miss"; return 1
}


# 宿主环境脱敏（§5.4.3）：报告与衍生呈现件禁露家目录/外置卷路径——生成后原地掩码
mask_env_paths() { # <file...>
  perl -pi -e 's{/Users/[A-Za-z0-9_.-]+}{[宿主家目录]}g; s{/Volumes/[A-Za-z0-9_.-]+}{[宿主卷]}g' "$@"
}

gov_report() { # 生成治理报告 evidence/governance-report.md（对齐 metrics-log 口径）
  local out="$EVID_DIR/governance-report.md" total fixed observed deferred
  total=$({ grep -c "^ISSUE|" "$EVID_DIR/issues.log" 2>/dev/null || true; })
  # 首过率实算（09-26）：组外预计算，set -euo pipefail 安全（grep -q && v=1 || true）
  # 口径=六闸全计（2026-10-06 差距审计 P5→R26：G3/G6 为落键型闸、无对应记单即首过；
  # 原 metrics 行按评审型四闸 4 分母，与 PART1「六闸全首过」口径分裂——run10 起统一六分母）
  # run13 复盘 C3 修订：打回只认判词 FAIL/显式打回语义行（fail/打回/拒收/熔断/退回），
  # 闸段其余问题单（如 testlog 缺件/重启循环事故）另列「闸段问题单 N 起」不计打回——
  # 否则 G5 一轮过会被同段事故单计成打回，治理报告与报告叙事两套口径打架。
  local _g1f=0 _g2f=0 _g3f=0 _g4f=0 _g5f=0 _g6f=0 _gseg=0 _n
  local _g1s=0 _g2s=0 _g3s=0 _g4s=0 _g5s=0 _g6s=0 _gsup _supp=0
  local _segcnt
  for _n in 1 2 3 4 5 6; do
    _segcnt=$({ grep -cE "^ISSUE\\|g${_n}-" "$EVID_DIR/issues.log" 2>/dev/null || true; })
    [ "$_segcnt" -gt 0 ] 2>/dev/null && _gseg=$((_gseg+_segcnt)) || true
    { grep -E "^ISSUE\\|g${_n}-" "$EVID_DIR/issues.log" 2>/dev/null | grep -qE '(fail|FAIL|打回|拒收|熔断|退回)'; } && eval "_g${_n}f=1" || true
    # 补过键（方案 §2.6-5 首过基准）：无 FAIL 判词但闸前有补交动作
    # （G1 准入退回补齐 / G5 分节 GAP 边评边补）——驱动落点 g1/g5，余闸预留。
    _gs=$(sget "g${_n}_supplement" 2>/dev/null || true)
    if [[ "$_gs" == 1 ]]; then eval "_g${_n}s=1"; [[ $(eval "echo \$_g${_n}f") = 1 ]] || _supp=$((_supp+1)); fi
  done
  local _fp=$((6-_g1f-_g2f-_g3f-_g4f-_g5f-_g6f-_supp))
  _gstate() { # <打回flag> <补过flag> → 首过|补过|打回
    if [[ "$1" = 1 ]]; then echo 打回
    elif [[ "$2" = 1 ]]; then echo 补过
    else echo 首过; fi }
  local _gate_detail="G1$(_gstate $_g1f $_g1s) G2$(_gstate $_g2f $_g2s) G3$(_gstate $_g3f $_g3s) G4$(_gstate $_g4f $_g4s) G5$(_gstate $_g5f $_g5s) G6$(_gstate $_g6f $_g6s)"
  [ "$_supp" -gt 0 ] && _gate_detail="${_gate_detail}（补过 ${_supp}，拆分/补交形态不计首过）" || true
  [ "$_gseg" -gt 0 ] && _gate_detail="${_gate_detail}（闸段问题单 ${_gseg} 起，不计打回）" || true
  # 证据一次通过率：凭证族记单（回执/派发/系分文档/凭证缺件）与完成任务环节键对账
  local _done_keys _evmiss _evrate
  _done_keys=$({ grep -cE '^[a-z0-9_]+_done=' "$STATE" 2>/dev/null || true; })
  _evmiss=$({ grep -cE '^ISSUE\|(receipt-missing|raci-dispatch-missing|anexec-missing|evidence-missing|credential)' "$EVID_DIR/issues.log" 2>/dev/null || true; })
  if [ "$_done_keys" -gt 0 ] 2>/dev/null; then
    _evrate="$((_done_keys-_evmiss))/${_done_keys}（凭证族记单 ${_evmiss} 起）"
  else
    _evrate="⬜（state.env 完成环节键=0，分母缺席如实留空）"
  fi
  # 打回次数：ISSUE 行含打回/拒收/熔断实算（闸门打回与凭证打回合并口径）
  local _reject
  _reject=$({ grep -cE '^ISSUE\|.*(打回|拒收|熔断)' "$EVID_DIR/issues.log" 2>/dev/null || true; })
  # 人工介入：DISP 行注明导演（补账/代投/补推）实算；AI 主理回合占比=⬜（回合级留痕未结构化）
  local _human
  _human=$({ grep -cE '^DISP\|.*导演' "$EVID_DIR/issues.log" 2>/dev/null || true; })
  # 缺陷密度+打回率实算（run15 前置 P2-5）：缺陷/用例真值取 quality-summary.env
  # 双源口径；env 缺席如实 ⬜ 不编造。密度单位=缺陷/千用例。
  local _poenv _def _nt _dens _rejrate
  _poenv="$EVID_DIR/product-outcome/quality-summary.env"
  if [ -f "$_poenv" ] && grep -q '^defects_total=' "$_poenv" && grep -q '^n_tests=' "$_poenv"; then
    _def=$({ grep '^defects_total=' "$_poenv" | head -1 | cut -d= -f2 | tr -d ' '; })
    _nt=$({ grep '^n_tests=' "$_poenv" | head -1 | cut -d= -f2 | tr -d ' '; })
    if [ "$_nt" -gt 0 ] 2>/dev/null; then
      _dens=$(awk -v d="$_def" -v t="$_nt" 'BEGIN{printf "%.1f", d*1000/t}')
      _dens="$_def 缺陷 / $_nt 用例 = ${_dens}/千用例"
    else
      _dens="⬜（n_tests=0 分母缺席）"
    fi
  else
    _dens="⬜（quality-summary.env 缺席——产品成效数字未采集，如实留空）"
  fi
  # ⑤告警差分：基础设施/容量/网关族键聚合一行（新增键单列在治理报告正文）
  local _alert_fam _alert_n=0 _alert_k
  for _alert_k in $(grep -E '^ISSUE\|' "$EVID_DIR/issues.log" 2>/dev/null | cut -d'|' -f2 | sort -u); do
    case "$_alert_k" in
      gw-*|capacity-*|gateway-*|wip-overload|load-*|mx-load-*) _alert_n=$((_alert_n+1)) ;;
    esac
  done
  _alertline="${_alert_n} 键（族内聚合）"
  _rejrate=$((6-_fp-_supp))
  local METRICS_CSV="$(date +%F),${RFD_ID},G1-G6,首过率,${_fp}/6（${_gate_detail}）,$(date +%F)..$(date +%F),issues.log 实算,口径=六闸全计（G3/G6 落键型无记单即首过）；首过基准=任务书首次完整派发（方案 §2.6-5）：显式打回即非首过；PASS 前拆分/补交形态的采集信号 run15 接线后计「补过」
$(date +%F),${RFD_ID},G1-G6,打回率,${_rejrate}/6（$(( _rejrate * 100 / 6 ))%）,$(date +%F)..$(date +%F),issues.log 实算,口径=打回数/6（三态：首过+补过+打回=6）；判词 FAIL/打回/拒收/熔断/退回语义行
$(date +%F),${RFD_ID},全程,证据一次通过率,${_evrate},$(date +%F)..$(date +%F),issues.log+state.env 实算,口径=1-凭证缺件记单/完成环节键
$(date +%F),${RFD_ID},全程,缺陷密度,${_dens},$(date +%F)..$(date +%F),quality-summary.env 实算,口径=测试报告缺陷清单/用例计数（双源，run14 复盘 A2）
$(date +%F),${RFD_ID},全程,打回次数,${_reject},$(date +%F)..$(date +%F),issues.log 实算,打回/拒收/熔断行计数
$(date +%F),${RFD_ID},全程,告警类问题单,${_alertline},$(date +%F)..$(date +%F),issues.log 实算,口径=基础设施/容量/网关族键按类型段聚合差分呈现（同族 N 键一行，新增键才单列——防告警刷屏淹没新信号）
$(date +%F),${RFD_ID},全程,人工介入,${_human} 次（AI 主理回合占比 ⬜）,$(date +%F)..$(date +%F),issues.log 实算,DISP 注明导演计数；占比待 MX_DELIVERY=1 协议事件结构化"
  # 基线对比行（读上轮治理报告首过率行——「下次基线+1」机制化，§2.6-5）
  local _runs_dir _prev _baseline
  _runs_dir="$(dirname "$(dirname "$EVID_DIR")")"
  _prev=""
  _baseline=""
  if [ -n "${RUN_ID:-}" ]; then
    # run13 复盘 A14：runs/ 下非轮次目录（_wtest 等）字典序排后会顶掉真实上轮——只认轮次命名目录
    _prev=$(ls -1d "$_runs_dir"/*/ 2>/dev/null | grep -E '/[0-9]{8}-v[0-9]+-run[0-9]+/$' | grep -v "/${RUN_ID}/" | sort | tail -1 || true)
  fi
  if [ -n "$_prev" ] && [ -f "${_prev}evidence/governance-report.md" ]; then
    _baseline=$({ grep -E '首过率' "${_prev}evidence/governance-report.md" 2>/dev/null || true; } | tail -1)
  fi
  {
    echo "# ${RFD_ID} 治理报告（RUN=${RUN_ID:-default}，$(date '+%F %T')）"
    echo
    echo "## 硬闸状态"
    # G1-G6 全闸落键（独立审计意见 R-A4：G3 曾只有 devimpl_done 无 g3_ 硬闸键，
    # 治理报告"门禁链"跳过 G3/G6 无说明）；retro_done 即 G6 复盘闸。
    for k in g1_frozen g2_arch_pass g3_code_pass g4_pass g5_ready uat_done retro_done; do
      echo "- $k: $(sget "$k" || echo 未落)"
    done
    echo
    echo "## 问题单台账（共 ${total} 条；处置记账 $({ grep -c '^DISP|' "$EVID_DIR/issues.log" 2>/dev/null || true; }) 条 DISP——键=类型·主体，缺行=待处置）"
    awk -F'|' '/^ISSUE\|/{print "- ["$2"] "$3"："$4}' "$EVID_DIR/issues.log" 2>/dev/null | sort | uniq -c | sort -rn
    echo
    echo "## 凭证与回灌"
    echo "- state 闸门键：$({ grep -cE "^(jwt_|room_|card_|.*_done|g1_|g2_|g4_|g5_|uat_|retro_)" "$STATE" 2>/dev/null || true; }) 条"
    echo
    echo "## metrics 回写（metrics-log 口径：date,change,gate,score,ratio,window,source,note）"
    echo "\`\`\`csv"
    echo "$METRICS_CSV"
    echo "\`\`\`"
    echo
    echo "## 基线对比（§2.6-5 上次基线+1 机制）"
    if [ -n "$_baseline" ]; then
      echo "- 上轮（$(basename "$_prev")）：${_baseline}"
      echo "- 本轮（${RUN_ID}）：首过率 ${_fp}/6（${_gate_detail}）"
    else
      echo "- 无上轮基线（首轮或上轮治理报告缺席）——如实留空"
    fi
  } > "$out"
  mask_env_paths "$out"
  echo "$out"
}

gov_archive_commit() { # 治理归档落账原子化（P14→R26：metrics-log+ISSUES-LOG 同提交推送+回读验证）
  # 「产出了没落账」根治：治理报告的 metrics 行与 issues 唯一键在此一并写入中央仓
  # origin/main（docs/governance/metrics-log.csv + docs/issues/ISSUES-LOG.md 单提交），
  # 推送后回读 origin/main 验证——写、提、推、验四环一体，失败记单返回 1 不击杀驱动。
  # 幂等：metrics 行按内容去重；ISSUES-LOG 的 ## <RUN>（ 段存在则替换不追加。
  local run="${RUN_ID:-default}" rfd="${RFD_ID:-RFD-001}"
  local _ilog="$EVID_DIR/issues.log"
  [ -f "$_ilog" ] || { echo "[gov_archive] issues.log 缺席，跳过落账" >&2; return 0; }
  gov_report >/dev/null || true   # 先刷新治理报告，metrics 取终态
  # metrics 实算（与 gov_report 同口径；score 须数值——R-A5 metrics-log schema 先例）
  local _g1f=0 _g2f=0 _g3f=0 _g4f=0 _g5f=0 _g6f=0
  grep -qE '^ISSUE\|g1-(review|freeze|gate)' "$_ilog" 2>/dev/null && _g1f=1 || true
  grep -qE '^ISSUE\|g2-' "$_ilog" 2>/dev/null && _g2f=1 || true
  grep -qE '^ISSUE\|g3-' "$_ilog" 2>/dev/null && _g3f=1 || true
  grep -qE '^ISSUE\|g4-' "$_ilog" 2>/dev/null && _g4f=1 || true
  grep -qE '^ISSUE\|g5-' "$_ilog" 2>/dev/null && _g5f=1 || true
  grep -qE '^ISSUE\|g6-' "$_ilog" 2>/dev/null && _g6f=1 || true
  local _fp=$((6-_g1f-_g2f-_g3f-_g4f-_g5f-_g6f))
  local _done_keys _evmiss _reject _human _today
  _done_keys=$({ grep -cE '^[a-z0-9_]+_done=' "$STATE" 2>/dev/null || true; })
  _evmiss=$({ grep -cE '^ISSUE\|(receipt-missing|raci-dispatch-missing|anexec-missing|evidence-missing|credential)' "$_ilog" 2>/dev/null || true; })
  _reject=$({ grep -cE '^ISSUE\|.*(打回|拒收|熔断)' "$_ilog" 2>/dev/null || true; })
  _human=$({ grep -cE '^DISP\|.*导演' "$_ilog" 2>/dev/null || true; })
  _today=$(date +%F)
  local _m1 _m3 _m4 _m5
  _m1="${_today},${rfd},M1,$(awk "BEGIN{printf \"%.3f\", ${_fp}/6}"),${_fp}/6,${_today}..${_today},state.env 落键实算,六闸全计（G3/G6 落键型无记单即首过；gov_archive_commit 机制化落账）"
  _m3=""
  if [ "$_done_keys" -gt 0 ] 2>/dev/null; then
    _m3="${_today},${rfd},M3,$(awk "BEGIN{printf \"%.3f\", (${_done_keys}-${_evmiss})/${_done_keys}}"),$((_done_keys-_evmiss))/${_done_keys},${_today}..${_today},issues.log+state.env 实算,证据一次通过率=1-凭证缺件记单/完成环节键"
  fi
  _m4="${_today},${rfd},M4,${_reject},${_reject},${_today}..${_today},issues.log 实算,打回次数=打回/拒收/熔断行计数"
  _m5="${_today},${rfd},M5,${_human},${_human},${_today}..${_today},issues.log 实算,人工介入=DISP 注明导演计数（AI 主理占比 ⬜ 待协议事件结构化）"
  # ── 临时 worktree（origin/main detached）内落账，不碰 DIRECTOR_CLONE 工作区 ──
  # 作业形态与 repo_commit_main 同构：固定 wt 路径+EXIT trap 拆区，不留注册残留
  local _wt="$SIM_ROOT/var/main-archive-wt" _rc=0
  mkdir -p "$SIM_ROOT/var" 2>/dev/null || true
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || {
    echo "ISSUE|archive-commit-failed|director|治理归档落账：中央仓 fetch 失败（${run}）" >> "$_ilog"
    return 1
  }
  rm -rf "$_wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true
  if ! git -C "$DIRECTOR_CLONE" worktree add -q --detach "$_wt" origin/main 2>/dev/null; then
    echo "ISSUE|archive-commit-failed|director|治理归档落账：临时 worktree 建立失败（${run}）" >> "$_ilog"
    return 1
  fi
  # metrics-log 追加（内容级去重幂等）
  local _mlog="$_wt/docs/governance/metrics-log.csv" _row
  mkdir -p "$(dirname "$_mlog")"
  [ -f "$_mlog" ] || printf 'date,change,gate,score,ratio,window,source,note\n' > "$_mlog"
  for _row in "$_m1" "$_m3" "$_m4" "$_m5"; do
    [ -z "$_row" ] && continue
    grep -qF "$_row" "$_mlog" 2>/dev/null || printf '%s\n' "$_row" >> "$_mlog"
  done
  # ISSUES-LOG run 段 upsert（段在=替换，段缺=追加；台账计数实算）
  python3 - "$_wt/docs/issues/ISSUES-LOG.md" "$run" "$_ilog" <<'PYEOF'
import re, sys, collections
path, run, ilog = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(ilog, encoding='utf-8').read().splitlines()
iss = [l.split('|', 3) for l in lines if l.startswith('ISSUE|')]
disp = [l.split('|', 3) for l in lines if l.startswith('DISP|')]
keys, order = set(), []
for p in iss:
    k = f'{p[1]}·{p[2]}'
    if k not in keys:
        keys.add(k); order.append(k)
buckets = collections.Counter()
for p in disp:
    d = p[3] if len(p) > 3 else ''
    tag = '其他'
    for t in ('已修', '已闭环', '观察', '延后'):
        if d.startswith(t):
            tag = t; break
    buckets[tag] += 1
disp_str = ' / '.join(f'{t} {buckets[t]}' for t in ('已修', '已闭环', '观察', '延后', '其他') if buckets[t])
section = [f'## {run}（机制化落账；gov_archive_commit 原子化回灌）', '',
           f'- 台账：{len(iss)} 行 ISSUE（唯一键 {len(keys)}）/ DISP {len(disp)} 条（{disp_str or "无"}）——台账本体=runs/{run}/evidence/issues.log',
           '- 唯一键清单：'] + [f'  - {k}' for k in order]
body = open(path, encoding='utf-8').read() if __import__('os').path.exists(path) else '# 推演问题台账（issues.log 归档）\n'
pat = re.compile(rf'\n## {re.escape(run)}（.*?(?=\n## |\Z)', re.S)
body = pat.sub('\n', body).rstrip() + '\n\n' + '\n'.join(section) + '\n'
open(path, 'w', encoding='utf-8').write(body)
PYEOF
  # 单提交推送 + 回读验证（四环一体）
  git -C "$_wt" add docs/governance/metrics-log.csv docs/issues/ISSUES-LOG.md 2>/dev/null
  if git -C "$_wt" diff --cached --quiet 2>/dev/null; then
    echo "[gov_archive] 归档已是最新（幂等命中，无新提交）"
  else
    git -C "$_wt" -c user.name="director (G6 archive)" -c user.email="director@aipaydev.local" \
      commit -qm "docs(governance): ${run} 治理归档落账——metrics-log+ISSUES-LOG 机制化回灌（P14/R26 原子化）" || _rc=1
    if [ "$_rc" = 0 ] && ! git -C "$_wt" push -q origin HEAD:main 2>/dev/null; then
      # 非快进=main 已前移：fetch+rebase 重试一次，再败记单
      mx_fetch -C "$_wt" fetch -q origin 2>/dev/null || true
      git -C "$_wt" rebase -q origin/main 2>/dev/null || true
      git -C "$_wt" push -q origin HEAD:main 2>/dev/null || _rc=1
    fi
  fi
  # local main 快进到同一提交（与 repo_commit_main 同口径：它是后续推送源，落后即空推/被拒）
  mx_fetch -C "$DIRECTOR_CLONE" fetch -q origin main:main 2>/dev/null || true
  if [ "$_rc" = 0 ]; then
    git -C "$DIRECTOR_CLONE" show origin/main:docs/issues/ISSUES-LOG.md 2>/dev/null | grep -qF "## ${run}（" || _rc=1
    git -C "$DIRECTOR_CLONE" show origin/main:docs/governance/metrics-log.csv 2>/dev/null | grep -qF ",${rfd},M1," || _rc=1
  fi
  rm -rf "$_wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true
  if [ "$_rc" != 0 ]; then
    echo "ISSUE|archive-commit-failed|director|治理归档落账原子化失败（${run}：提交/推送/回读三环其一未过，台账与 metrics 未上 origin/main）" >> "$_ilog"
    echo "[gov_archive] 落账失败已记单（archive-commit-failed）" >&2
    return 1
  fi
  echo "[gov_archive] 归档落账完成：metrics-log+ISSUES-LOG 已上 origin/main 并回读验证（${run}）"
  return 0
}

# 场景脚本沿用 V1 快失败语义：mx-lib 的 set -uo 在 source 时会降级掉 -e，在此恢复
set -euo pipefail

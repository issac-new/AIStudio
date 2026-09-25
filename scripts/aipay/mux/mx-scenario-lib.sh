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
sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }
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
  local u="$1" jwt slug out='{"tasks":[]}'
  jwt=$(jwt_of "$u")
  for slug in $(account_boards "$u"); do
    out=$(jq -s '.[0].tasks + (.[1].tasks // []) | {tasks: .}' <(echo "$out") \
      <(studio GET "/api/hermes/kanban?board=$slug" "$jwt" 2>/dev/null || echo '{"tasks":[]}'))
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
  a="${a%-agent}"              # 去 -agent 后缀（@fanfan-agent → fanfan）
  printf '%s' "$a"
}

kanban_create_as() { # <user> <state-key> <title> <body> [board] → id（state 缓存防重；缺省落该账号默认板）
  local u="$1" key="card_$2" title="$3" body="$4" board="${5:-$(first_board_of "$u")}" cached id
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  id=$(studio POST "/api/hermes/kanban?board=$board" "$(jwt_of "$u")" \
    "{\"title\":$(jq -Rn --arg t "$title" '$t'),\"body\":$(jq -Rn --arg b "$body" '$b'),\"project\":\"aipaydev\"}" \
    | jq -r '.task.id // .id')
  [[ -n "$id" && "$id" != "null" ]] || fail "[$u] kanban 建卡失败: ${title}（板 ${board}）"
  sset "$key" "$id"; echo "$id"
}

kanban_status_as() { # <user> <id> <status>（自动定位卡所在账号板）
  local b; b=$(board_of_task "$1" "$2") || return 1
  studio PATCH "/api/hermes/kanban/$2?board=$b" "$(jwt_of "$1")" "{\"status\":\"$3\"}" >/dev/null
}

kanban_link_as() { # <user> <parentId> <childId>（挂父卡所在板）
  local b; b=$(board_of_task "$1" "$2") || return 0
  studio POST "/api/hermes/kanban/links?board=$b" "$(jwt_of "$1")" \
    "{\"parentId\":\"$2\",\"childId\":\"$3\"}" >/dev/null || true
}

kanban_walk_done() { # <user> <id>：按合法路径走到 done（静默容错）
  local u="$1" id="$2" st
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
auto_approve() { # 扫描房间 agent 审批请求，以对应人类身份线程内回 !approve
  local room="$1"
  for u in "${INSTANCED_USERS[@]}"; do
    local pend
    # 去重改固定串（H5）：eid 形如 $abc…:matrix.test，当正则用时 `.` 是通配、^eid 还前缀
    # 命中——两个仅 `.` 位不同的 eid 互误判"已批"，!approve 永不发。两式并联：本台账
    # （裸 eid 整行）由 -Fx 全行命中；eid+空格分隔的多字段行（主干格式）由 -F "$eid "
    # 命中（分隔符收边界防前缀），旧版台账行不漏、重跑不重复批。
    pend=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg agent "$(agent_mxid "$u")" \
      '.[] | select(.sender == $agent and ((.content.body // "") | test("needs your OK|approval"))) | .event_id' 2>/dev/null \
      | while read -r eid; do grep -qFx "$eid" "$APPROVED_LOG" || grep -qF "$eid " "$APPROVED_LOG" || echo "$eid"; done) || true
    for eid in $pend; do
      local reply_eid
      reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
        "{\"msgtype\":\"m.text\",\"body\":\"!approve\",\"m.relates_to\":{\"rel_type\":\"m.thread\",\"event_id\":\"$eid\"}}" \
        | jq -r '.event_id // empty' 2>/dev/null) || true
      echo "$eid ${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
      note "[$u] 线程内回复 !approve（请求 ${eid} → 回执 ${reply_eid:-NO_REPLY}）"
    done
  done
}

wait_truth() { # <desc> <timeout-sec> <predicate-cmd...>
  local desc="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    sleep 15
  done
  note "[真值] $desc ✗（${timeout}s 超时）"
  return 1
}

# ── 完成凭证反向核验（账号板断言）────────────────────────
verify_done_evidence() { # <rfd> → 0 DONE 凭证全部为真 / 1 缺失或造假
  # 只认"可反向核验"的完成：结论行里的 commit 必须真在 aipaydev origin 上、
  # 且该 commit 确实含分析稿；card 必须能在 fanfan 账号的板（账号板）查到。
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
  body=$(mx_messages "$(load_token fanfan)" "$(sget room_analysis)" 200 2>/dev/null \
    | jq -r --arg p "ANALYSIS-DONE-$rfd" --arg s "$(agent_mxid fanfan)" \
      '[.[] | select((.sender//"") == $s)
            | select((.content.body//"") | contains($p))
            | select((.content.body//"") | test("commit=[0-9a-fA-F]{7,40} card=[^ ,；;]+"))
       ] | first | .content.body // ""')
  [[ -n "$body" ]] || { note "[凭证] 未见 $rfd 的 DONE 行"; return 1; }
  sha=$(printf '%s' "$body" | grep -oE 'commit=[0-9a-fA-F]{7,40}' | head -1 | cut -d= -f2)
  card=$(printf '%s' "$body" | grep -oE 'card=[^ ,；;]+' | head -1 | cut -d= -f2)
  [[ -n "$sha" && -n "$card" ]] || { note "[凭证] DONE 行缺 commit/card 凭证：$body"; return 1; }
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "$sha^{commit}" 2>/dev/null \
    || { note "[凭证] commit $sha 不存在于 aipaydev —— 虚报"; return 1; }
  git -C "$DIRECTOR_CLONE" ls-tree -r --name-only "$sha" 2>/dev/null | grep -q "${rfd}-tasklist.md" \
    || { note "[凭证] commit $sha 里没有 ${rfd}-tasklist.md —— 虚报"; return 1; }
  # 卡号反核含 archived（09-26 实锤 false negative）：agent 完成后归档卡属正常工作流，
  # kanban_list（默认活跃态 + studio API 面）都看不到 archived 真卡，曾把合格凭证
  # 误判"虚报"。改 CLI 直查全状态（活跃 + archived）；studio API 整板返空问题另记。
  local slug card_found=1
  for slug in $(account_boards fanfan); do
    if HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list 2>/dev/null | grep -q "$card" \
      || HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list --status archived 2>/dev/null | grep -q "$card"; then
      card_found=0; break
    fi
  done
  [[ $card_found -eq 0 ]] \
    || { note "[凭证] fanfan 账号板查无卡片 $card（含 archived）—— 虚报"; return 1; }
  note "[凭证] $rfd 完成证据成立（card 在 fanfan 账号板可查）：commit=$sha card=$card"
  return 0
}

# ── 仓库/房间真值 ───────────────────────────────────────
repo_has() { # <path-in-repo>（导演 clone 拉最新后核验）
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" show "origin/main:$1" >/dev/null 2>&1
}
# repo_pull（Z3）：只刷引用、不动当前分支/工作树。旧写法 `git pull origin main` 会把
# origin/main merge 进当前分支——defect 步后 HEAD 停在 integration/${RFD_ID}，pull 即把
# main 混进集成分支污染其历史。现改为：全量 fetch 刷远端引用（repo_has/步骤内 merge 用的
# origin/*），再把本地 main 快进到 origin/main（供以本地 main 为基的路径用；main 在别处
# 检出或非快进时 git 自行拒绝，静默跳过，与 repo_commit_main 的收尾口径一致）。
repo_pull() {
  git -C "$DIRECTOR_CLONE" fetch -q origin >/dev/null 2>&1 || true
  git -C "$DIRECTOR_CLONE" fetch -q origin main:main >/dev/null 2>&1 || true
}

# ── 分支状态机约定（P4）──────────────────────────────────────
# DIRECTOR_CLONE 的 HEAD 归属：defect 步 `checkout -B integration/${RFD_ID}` 后停在
# integration 分支，后续步骤都用显式 ref（origin/integration/...）或临时 worktree 访问
# 仓库，不看 HEAD。凡**要进 origin/main 的提交**（uat 验收书/audit 意见书/retro 复盘）
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
    git -C "$DIRECTOR_CLONE" fetch -q origin || exit 1
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
    git -C "$DIRECTOR_CLONE" fetch -q origin main:main 2>/dev/null || true )
}

room_has_from() { # <room> <sender-mxid> <pattern>
  mx_messages "$(load_token fanfan)" "$1" 120 | jq -e --arg s "$2" --arg p "$3" \
    'map(select(.sender == $s and ((.content.body // "") | test($p)))) | any' >/dev/null 2>&1
}

dispatch_in_room() { # <humanUser> <text> <mention-csv> → event_id
  local m
  m=$(mx_send "$(load_token "$1")" "$(sget room_analysis)" "$2" "$3")
  note "[$1] 派发 ($m): $(echo "$2" | head -1)"
  echo "$m"
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
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "refs/remotes/origin/$1:$2" 2>/dev/null
}

uat_ac_covered() { # <ac-list> <body> → 缺失 AC 编号清单（空串=逐条覆盖）
  local missing="" ac
  for ac in $1; do
    case "$2" in *"$ac"*) ;; *) missing="$missing$ac " ;; esac
  done
  printf '%s' "$missing"
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
  echo "- 审批权：lead（wei/mei）分诊确认；G5 对外发布 HumanGate=导演批准；安全管理复核（secops）与审计意见（audit）为独立签名线。"
  echo
  echo "## 入职/转岗/离职流程"
  echo "- 入职：mx-setup 幂等供给（matrix 账号+profile+技能+板授权+ACL+家族记忆 bank），入职卡登记本表。"
  echo "- 转岗：改编制表（boards_of）后重跑 mx-setup + 本对账步。"
  echo "- 离职：卡片 reassign 给接手人、板 owner 变更、账号禁用（synapse deactivate）、本表移除并在 audit 步留痕。"
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
  local out="$EVID_DIR/work-report.md" u slug st total wip_warn=""
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
    echo "- 跨轮衔接：retro 后未完结卡由 PM（fanfan）决定挂起/移交下轮。"
  } > "$out"
  [[ -n "$wip_warn" ]] && echo "WIP_OVERLOAD"
  echo "$out"
}

# ── 合规及审计（audit）：门禁留痕完整性 + 凭证抽检 + 合规意见书 ──
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

gov_report() { # 生成治理报告 evidence/governance-report.md（对齐 metrics-log 口径）
  local out="$EVID_DIR/governance-report.md" total fixed observed deferred
  total=$(grep -c "^ISSUE|" "$EVID_DIR/issues.log" 2>/dev/null || echo 0)
  {
    echo "# ${RFD_ID} 治理报告（RUN=${RUN_ID:-default}，$(date '+%F %T')）"
    echo
    echo "## 硬闸状态"
    for k in g1_frozen g2_arch_pass g4_pass g5_ready uat_done retro_done; do
      echo "- $k: $(sget "$k" || echo 未落)"
    done
    echo
    echo "## 问题单台账（共 ${total} 条；处置记账 $(grep -c '^DISP|' "$EVID_DIR/issues.log" 2>/dev/null || echo 0) 条 DISP——键=类型·主体，缺行=待处置）"
    awk -F'|' '/^ISSUE\|/{print "- ["$2"] "$3"："$4}' "$EVID_DIR/issues.log" 2>/dev/null | sort | uniq -c | sort -rn
    echo
    echo "## 凭证与回灌"
    echo "- state 闸门键：$(grep -cE "^(jwt_|room_|card_|.*_done|g1_|g2_|g4_|g5_|uat_|retro_)" "$STATE" 2>/dev/null || echo 0) 条"
    echo
    echo "## metrics 回写（metrics-log 口径：date,change,gate,score,ratio,window,source,note）"
    echo "\`\`\`csv"
    echo "$(date +%F),${RFD_ID},G1-G6,首过率,待全流程轮补,$(date +%F)..$(date +%F),issues.log/state.env,V3 验证轮"
    echo "\`\`\`"
  } > "$out"
  echo "$out"
}

# 场景脚本沿用 V1 快失败语义：mx-lib 的 set -uo 在 source 时会降级掉 -e，在此恢复
set -euo pipefail

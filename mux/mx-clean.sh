#!/bin/bash
# mx-clean.sh —— 0→1 清环境（V5 补遗④第 1 项 / §十一；2026-10-03 六缺口+清场升级修订）
# 用法：bash mx-clean.sh [--dry-run] [--keep-accounts] [--reset-central] [--reset-workspaces] [--reset-memory]
#   --dry-run      只打印将执行的动作（默认即 dry-run——显式 --apply 才真清）
#   --apply        真执行（危险：清空 runs/state/locks/看板整树/hermes 运行态/全部房间 purge）
#   --keep-accounts 保留 synapse 账号（缺省账号保留、服务器房间逐房 v2 purge 全迹清场）
#   --reset-central 重置中央仓 docs 九目录+推清空提交+删远端 integration/feat/test/wt/fix/wip 分支（tag 快照后删）
#   --reset-workspaces 归档并重置 agent 工作区 workspaces/（tar 后删，mx-setup 重建；V7 P2 实装）
#   --reset-memory  清 hindsight 模拟 14 家族记忆 bank（pg_dump 全库归档后删；宿主 bank 绝不动；
#                   跨轮记忆保留是默认态——2026-09-25 用户裁决，零记忆起跑须显式指定本旗标）
# 合格线（方案 §十一 + 2026-10-03 修订）：清后 runs/ 无旧轮目录、state.env 归档移除、
#   kanban/ 整树空（mx-setup 重建）、hermes 运行态归档清零（pending/sessions/approvals/
#   state*/cron）、服务器房间数=0（admin rooms 复核）、中央仓远端 main 九目录零文件且仅剩
#   main 分支；--reset-memory 加验：模拟 bank 按 14 精确 ID 各表计数=0；可反复跑。
set -euo pipefail
SIM_ROOT="${SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
# 防呆（2026-10-16 事故）：--apply 清空是真破坏性操作；SIM_ROOT 未显式传入（走
# 默认生产路径）时要求 MX_CLEAN_CONFIRM_PROD=1 显式确认——防测试/脚本漏传 env
# 把生产卷 runs/ 归档删除（该事故已从 archive tar 恢复，但防呆必须常驻）。
SIM_ROOT="${SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
if [ "${SIM_ROOT}" = "/Users/cuishi/lab/ncwk-sim-mux" ] && [ -z "${MX_CLEAN_CONFIRM_PROD:-}" ]; then
  case " $* " in
    *" --apply "*)
      echo "⛔ mx-clean --apply 指向默认生产 SIM_ROOT 但未设 MX_CLEAN_CONFIRM_PROD=1（防呆：确认要清生产卷）" >&2
      exit 3 ;;
  esac
fi
APPLY=0; KEEP_ACCOUNTS=0; RESET_CENTRAL=0; RESET_WORKSPACES=0; RESET_MEMORY=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --keep-accounts) KEEP_ACCOUNTS=1 ;;
    --reset-central) RESET_CENTRAL=1 ;;
    --reset-workspaces) RESET_WORKSPACES=1 ;;
    --reset-memory) RESET_MEMORY=1 ;;
    *) echo "未知参数 $a"; exit 2 ;;
  esac
done
say() { echo "[mx-clean $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)] $*"; }

# 0) 推演在跑则拒绝（单驱动锁判活）
if [ -f "$SIM_ROOT/.driver.lock.d/info" ]; then
  LP=$(sed -n 's/^pid=\([0-9]*\).*/\1/p' "$SIM_ROOT/.driver.lock.d/info" 2>/dev/null || true)
  if [ -n "$LP" ] && kill -0 "$LP" 2>/dev/null; then
    echo "[mx-clean FAIL] 推演进行中（驱动 pid $LP 活锁）——拒绝清理；结束推演后重试" >&2; exit 3
  fi
fi
# 0a2) 端口兜底（2026-10-19 实测）：pid 复用守卫跳杀后 studio 可能仍活——清场与
#      活服务互踩（rm "Directory not empty"、sqlite 库锁、半清树）。端口仍在听即中止。
#      只在本 SIM 根确有 pid 台账时检查：隔离夹具（tests/integration-retention）跑
#      mx-clean 时生产服务仍占 8801/8802，不能因此拒绝夹具清场（2026-10-19 实测回退）。
if [ -f "$SIM_ROOT/pids/studio.pid" ] || [ -f "$SIM_ROOT/pids/gateway.pid" ]; then
  for _p in "${STUDIO_PORT:-8802}" "${GW_PORT:-8801}"; do
    if lsof -nP -iTCP:"$_p" -sTCP:LISTEN -t 2>/dev/null | grep -q .; then
      echo "[mx-clean FAIL] 端口 $_p 仍有服务在听（pid 复用守卫可能跳杀）——先 bash mux/mx-down.sh 再重跑" >&2
      exit 3
    fi
  done
fi

# 0b) relay 接力器在跑同样拒绝：驱动死在两代接力之间时锁已被 EXIT trap 摘除，但
# relay 15s 内会拉起新驱动——清场（删 runs/ + 逐房 purge）与重生成的驱动互踩
# （run7/8 夜间 relay 常态在跑，此窗口真实存在）
if pgrep -f 'mx-relay\.sh' >/dev/null 2>&1; then
  echo "[mx-clean FAIL] mx-relay 接力器在跑（清场中途会复活驱动互踩）——先停 relay 再清理" >&2; exit 3
fi

# 1) 停栈
say "停 studio/gateway（pids/ 下 pid 若活则 TERM）"
for f in studio.pid gateway.pid; do
  p="$SIM_ROOT/pids/$f"
  [ -f "$p" ] || continue
  pid=$(cat "$p")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    # pid 复用二因子：长跑机器 pid 会被无关进程复用，裸 TERM 会误杀无辜进程
    _cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$_cmd" in
      *studio*|*gateway*|*hermes*|*electron*|*vite*)
        say "  TERM $f pid=$pid"; [ "$APPLY" = 1 ] && kill "$pid" || true ;;
      *)
        say "  ⏭ $f pid=$pid 已被无关进程复用（cmdline 不含 studio/gateway/hermes/electron/vite），跳过不杀" ;;
    esac
  fi
done

# 2) 归档并清空 runs 与 state/locks
TS=$(date +%Y%m%d-%H%M%S)
ARC="$SIM_ROOT/archive/mx-clean-$TS"
# ── 2 前置：集成分支保留守卫（V8.36 纪律 71，run20 复盘 B5）──
# run20 实锤：integration/RFD-001 在报告证据被引用后即被删（远端删+游离提交），13 件
# 交付物锚集体不可反查——纪律 71 要求集成分支保留至报告四格式持久化后清理。
# 守卫判据必须在 runs/ 归档删除之前判（判据文件=锚定轮 state.env，删了无从判）：
# 当前锚定轮未落 report_done → 本轮 integration/* 分支禁删（其余分支照删）。
_keep_integ=0
_cur_run=""
if [ -L "$SIM_ROOT/var/current-state.env" ]; then
  # 软链指向 runs/<RUN>/state.env——轮 id=目标文件的父目录名（2026-10-16 修：
  # 原写法对 basename 去 .env 得 'state'，解析恒错致守卫恒不触）
  _cur_run="$(basename "$(dirname "$(readlink -f "$SIM_ROOT/var/current-state.env" 2>/dev/null || readlink "$SIM_ROOT/var/current-state.env")")")"
elif [ -f "$SIM_ROOT/var/current-state.env" ]; then
  _cur_run="$(grep -m1 '^RUN_ID=' "$SIM_ROOT/var/current-state.env" 2>/dev/null | cut -d= -f2)"
fi
if [ -n "$_cur_run" ] && [ -f "$SIM_ROOT/runs/$_cur_run/state.env" ]; then
  if ! grep -q '^report_done=[0-9]' "$SIM_ROOT/runs/$_cur_run/state.env" 2>/dev/null; then
    _keep_integ=1
    say "⛔ 集成分支保留守卫：轮 $_cur_run 未落 report_done——本轮 integration/* 分支禁删（纪律 71：保留至报告四格式持久化后清理）"
    # 记单位置：var/retention-guard.log（不随 runs/ 归档清——守卫单必须活过清场，
    # 否则清完即失见证；同时尝试写轮次 issues.log，双落点防单点失效）。
    mkdir -p "$SIM_ROOT/var" 2>/dev/null || true
    echo "ISSUE|integration-retention-guard|$_cur_run|mx-clean 试图删 integration 分支但轮 $_cur_run report_done 未落——保留守卫触发，分支未删（run20 13 件死锚教训的产品化；报告持久化后再清）" >> "$SIM_ROOT/var/retention-guard.log" 2>/dev/null || true
    mkdir -p "$SIM_ROOT/runs/$_cur_run/evidence" 2>/dev/null || true
    echo "ISSUE|integration-retention-guard|$_cur_run|mx-clean 试图删 integration 分支但轮 $_cur_run report_done 未落——保留守卫触发，分支未删（run20 13 件死锚教训的产品化；报告持久化后再清）" >> "$SIM_ROOT/runs/$_cur_run/evidence/issues.log" 2>/dev/null || true
  fi
fi
say "runs/ 与 state.env → ${ARC}（tar 归档后删除原物）"
if [ "$APPLY" = 1 ]; then
  mkdir -p "$ARC"
  [ -d "$SIM_ROOT/runs" ] && tar -cf "$ARC/runs.tar" -C "$SIM_ROOT" runs && rm -rf "$SIM_ROOT/runs" && mkdir -p "$SIM_ROOT/runs"
  for f in state.env fleet-manifest.json; do
    [ -f "$SIM_ROOT/$f" ] && mv "$SIM_ROOT/$f" "$ARC/$f"
  done
  rm -rf "$SIM_ROOT/gateway-locks" "$SIM_ROOT/.driver.lock.d"
  # 台账稳定入口回到空基线（runs/ 已删，旧链接会悬空 → 产品端点 503）。
  # mx-clean 自包含不 source mx-lib，故此处内联同款逻辑（基线=仅表头）。
  _led_empty="$SIM_ROOT/var/compensation-ledger.empty.tsv"
  mkdir -p "$SIM_ROOT/var" 2>/dev/null || true
  if [ ! -f "$_led_empty" ]; then
    printf 'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\n' > "$_led_empty" 2>/dev/null || true
  fi
  ln -sfn "$_led_empty" "$SIM_ROOT/var/current-compensation-ledger.tsv" 2>/dev/null || true
fi

# 2b) 看板库归档重置（0→1 补全线——run4 实锤：旧轮 147 卡残留污染 chips 计数与凭证核验）
#     2026-10-03 实锤修订：原"保板骨架清任务"走 plain sqlite3 delete，但旧库打开即触发
#     hermes 迁移路径里的 kanban_write_sanctioned 自定义函数（plain sqlite3 不注册该 UDF）
#     → 28 板全 WARN、tasks 清零失败（boards tasks cleared: 0）。改为整树归档后全删，
#     由 mx-setup §5 用 hermes CLI 重建净板（同码同库，迁移路径天然一致）；
#     根 kanban 运行态（current 指针/根 kanban.db/调度锁）一并清，防陈旧指针指向已删板。
if [ "$APPLY" = 1 ] && [ -d "$SIM_ROOT/hermes/kanban/boards" ]; then
  say "看板库归档 → ${ARC}/boards.tar；随后整树删除（mx-setup 重建净板）"
  tar -cf "$ARC/boards.tar" -C "$SIM_ROOT/hermes/kanban" boards
  rm -rf "$SIM_ROOT/hermes/kanban"
  mkdir -p "$SIM_ROOT/hermes/kanban"
  # 根 kanban.db（default 哨兵板库）一并归档重置——2026-10-19 实测：旧轮 archived
  # REL 卡残留 default 板致 G2 哨兵恒红（本注释上方"根 kanban.db 一并清"自建仓起
  # 就是空头支票，从未真正执行）。
  if [ -f "$SIM_ROOT/hermes/kanban.db" ]; then
    cp "$SIM_ROOT/hermes/kanban.db" "$ARC/root-kanban.db" 2>/dev/null || true
    rm -f "$SIM_ROOT/hermes/kanban.db" "$SIM_ROOT/hermes/kanban.db-wal" "$SIM_ROOT/hermes/kanban.db-shm"
    say "✓ 根 kanban.db（default 板）已归档重置"
  fi
  say "✓ kanban 整树已归档重置（重建走 mx-setup.sh；default 哨兵板由首启重建）"
fi

# 2b2) studio webui user_profiles 重置（2026-10-19 G2 假阳性根因）：ACL 映射是
#      运行期数据（matrix-login 建号/历史批次写入），从不清会导致 0→1 环境带着
#      旧轮全量映射跑（实测 chen 残留 43 行含 fanfan/chen-pay-dev 等——profiles
#      列表与板任务过滤全部失真）。整表归档后清空；mx-setup §5a 按当轮编制重播。
if [ "$APPLY" = 1 ] && [ -f "$SIM_ROOT/webui/hermes-web-ui.db" ]; then
  if sqlite3 "$SIM_ROOT/webui/hermes-web-ui.db" ".dump user_profiles" > "$ARC/user_profiles.sql" 2>/dev/null; then
    if sqlite3 "$SIM_ROOT/webui/hermes-web-ui.db" "delete from user_profiles;" 2>/dev/null; then
      say "✓ studio user_profiles 已归档清空（重播走 mx-setup §5a）"
    else
      say "⚠ user_profiles 清空失败（库锁？studio 未停净）——mx-setup §5a 重播前请先 mx-down"
    fi
  fi
fi

# 2b3) 评测域存储归档重置（V8.45）：eval/redteam/heldout 的产品默认路径在
#      ~/.hermes-web-ui，不随 HERMES_WEB_UI_HOME 隔离；不归档会让 0→1 环境带旧
#      评测集/运行/红队历史/留出题库尝试预算（实测旧轮数据跨轮可见）。mx-lib 启动
#      env 已把三者指到 $WEBUI_HOME/{eval,redteam,heldout}，此处按同源路径归档。
if [ "$APPLY" = 1 ]; then
  for _ed in eval redteam heldout; do
    if [ -d "$SIM_ROOT/webui/$_ed" ]; then
      mv "$SIM_ROOT/webui/$_ed" "$ARC/webui-$_ed" 2>/dev/null \
        && say "✓ 评测存储 $_ed 已归档（webui-$_ed）" \
        || say "⚠ 评测存储 $_ed 归档失败（studio 未停净？）"
    fi
  done
fi

# 2c) hermes 运行态归档重置（2026-10-03 实锤新增段；旧脚本只清 kanban，以下七类全是旧轮数据）
#     pending_messages（70 条旧在途消息：新网关每次启动都恢复失败刷 WARNING，还会误触发
#       mx-up 的 matrix 适配器降级自愈长挂）/ sessions（旧会话）/ approvals（旧审批单——
#       queue.jsonl 残留旧轮 execute_code 单，新一轮误批=执行旧脚本）/ state.db·state/·
#       state-snapshots·shared-state.db（旧房间/会话状态机）/ cron（旧轮定时任务余留）/
#       projects.db·response_store.db·runs_idempotency.db·gateway_state.json（旧轮运行簿记）。
#     归档纪律：整包 hermes-runtime-state.tar 后删，骨架目录重建。
#     保留：auth.json/channel_directory/config.yaml/profiles/tools/installs/cache/plugins（基建）。
if [ "$APPLY" = 1 ]; then
  H="$SIM_ROOT/hermes"
  _rt=""
  for f in pending_messages sessions approvals state state-snapshots cron logs gateway_state.json \
           gateway gateway-starts.log projects.db shared-state.db response_store.db \
           runs_idempotency.db state.db config.yaml.bak; do
    [ -e "$H/$f" ] && _rt="$_rt $f"
  done
  if [ -n "$_rt" ]; then
    say "hermes 运行态归档重置 →${ARC}/hermes-runtime-state.tar：$_rt"
    ( cd "$H" && tar -cf "$ARC/hermes-runtime-state.tar" $_rt ) \
      && ( cd "$H" && rm -rf $_rt auth.lock gateway.lock gateway.pid gateway.sock ) \
      && mkdir -p "$H/pending_messages" "$H/sessions" "$H/approvals/responses" "$H/cron" "$H/logs" \
      && say "✓ hermes 运行态已归档重置（骨架重建）" \
      || say "⚠ hermes 运行态清理不完整（人工核查 ${H}）"
  fi
  # SIM_ROOT/logs 旧轮日志归档（gateway/studio 现行日志会被下次 mx-up 重写，一并带走）
  if [ -d "$SIM_ROOT/logs" ]; then
    mkdir -p "$ARC/sim-logs"
    ( cd "$SIM_ROOT/logs" && ls | grep -E '^(run[0-9]+-|bgreview-|gateway-restart-run|studio-manual|studio-babysit|gateway-babysit|mx-up-relaunch)' \
      | while read -r f; do mv "$f" "$ARC/sim-logs/" 2>/dev/null || true; done ) || true
    say "旧轮 SIM_ROOT/logs 日志 → ${ARC}/sim-logs/"
  fi

  # 2d) 图引擎状态（2026-10-19 0→1 实测）：$SIM_ROOT/.loop/graph-events.db 是 runcenter
  #     运行列表的事实源（GET /api/graph/runs 由 event log 派生），从不清场 → 清空 runs/
  #     后推演区仍列出旧轮运行、面板全部 run-state 404。整目录归档后删，引擎首启重建。
  if [ -d "$SIM_ROOT/.loop" ]; then
    tar -cf "$ARC/loop-state.tar" -C "$SIM_ROOT" .loop 2>/dev/null || true
    rm -rf "$SIM_ROOT/.loop"
    say "✓ 图引擎状态（.loop：graph-events/shadow/checkpoints）已归档重置"
  fi
fi

# 3) synapse 房间清场（保留账号与凭据）
#    2026-10-03 二次修订：leave 只断成员关系，僵尸房与陈旧邀请成员态留服务器。本机 synapse
#    1.154 的房间删除 API 已演进为 DELETE /_synapse/admin/v2/rooms/{id}（v1 POST /delete、
#    kick、purge_room 均未注册——旧注释"管理 API 残缺"实为调错版本）。0→1 语义=逐房
#    v2 DELETE（block:false purge:true force_purge:true）连历史带成员态全清；v2 不可用
#    （405/404，旧版 synapse）回落 leave 全退+拒邀请。
if [ "$KEEP_ACCOUNTS" = 0 ]; then
  HS=http://127.0.0.1:8008
  ADM=$( [ -f "$SIM_ROOT/creds/admin.token" ] && head -1 "$SIM_ROOT/creds/admin.token" || true )
  _purge_failed=0; _purged=0
  if [ "$APPLY" = 1 ] && [ -n "$ADM" ]; then
    say "synapse 房间清场：逐房 v2 DELETE purge（账号/凭据不动）"
    for RID in $(curl -sf "$HS/_synapse/admin/v1/rooms?access_token=$ADM" 2>/dev/null | jq -r '.rooms[].room_id' 2>/dev/null); do
      code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$HS/_synapse/admin/v2/rooms/$RID?access_token=$ADM" \
        -H 'Content-Type: application/json' -d '{"block":false,"purge":true,"force_purge":true}' 2>/dev/null)
      if [ "$code" = "200" ]; then _purged=$((_purged+1)); else _purge_failed=$((_purge_failed+1)); fi
    done || true
    if [ "$_purge_failed" = 0 ]; then
      say "✓ ${_purged} 间已提交 purge（异步收敛——起跑前复核 admin rooms=0）"
    else
      say "⚠ ${_purge_failed} 间 v2 purge 失败——回落 leave 全退+拒邀请（服务器留壳）"
    fi
  fi
  if [ "$APPLY" = 1 ] && { [ "$_purge_failed" -gt 0 ] || [ -z "$ADM" ]; }; then
    say "全部 creds 账号退出所有已加入房间 + 拒绝待处理邀请（账号/凭据不动）"
    # nullglob 防呆（2026-10-16 守门测试实锤）：creds 空/目录缺席时 glob 不展开成
    # 字面量路径，head -1 读不存在文件 rc=1 被 set -e 击杀=后续分支清理全不跑。
    # shopt -s nullglob 令无匹配时循环体零次（bash 3.2 兼容）。
    shopt -s nullglob 2>/dev/null || true
    for tf in "$SIM_ROOT"/creds/*.token; do
      [ -f "$tf" ] || continue
      u=$(basename "$tf" .token); T=$(head -1 "$tf" 2>/dev/null || true)
      [ -n "$T" ] || continue
      # 退出全部已加入房间（管道级 || true：github.token 等非 matrix 凭据 curl 必失败，勿中断）
      curl -sf "$HS/_matrix/client/v3/joined_rooms?access_token=$T" 2>/dev/null | jq -r '.joined_rooms[]?' 2>/dev/null | while read -r rid; do
        curl -sf -X POST "$HS/_matrix/client/v3/rooms/$rid/leave?access_token=$T" -d '{}' >/dev/null 2>&1 && say "  $u left $rid" || true
      done || true
      # 拒绝全部待处理邀请（防下轮 relay/agent 扫到旧邀请误入旧房）
      curl -sf "$HS/_matrix/client/v3/sync?access_token=$T&timeout=0&set_presence=offline" 2>/dev/null | jq -r '.rooms.invite | keys[]?' 2>/dev/null | while read -r rid; do
        curl -sf -X POST "$HS/_matrix/client/v3/rooms/$rid/leave?access_token=$T" -d '{}' >/dev/null 2>&1 && say "  $u rejected invite $rid" || true
      done || true
    done
  fi
else
  say "保留账号且不动房间（--keep-accounts）"
fi

# 3b) hindsight 模拟家族记忆清场（--reset-memory；2026-10-03 用户裁决零记忆起跑首次启用）
#     模拟 14 用户家族 bank=hermes-<sha1(user)[:12]>-<user>（与 mx-lib memory_bank_id 同源
#     派生，精确 ID 匹配）；宿主 bank（hermes-b24d7ac5d9c4-* 真机 MAC 系及其他）绝不触碰
#     ——教训：宽正则 ^hermes-[0-9a-f]{12}-ops$ 会误伤宿主同名用户 bank，必须精确清单。
#     归档纪律：pg_dump 全库（-Fc 含宿主，恢复兜底）成功后才删；单事务按依赖序删 18 张
#     bank_id 表 + banks 注册行，失败即整体回滚（原子）。
if [ "$RESET_MEMORY" = 1 ]; then
  say "hindsight 模拟 bank 清场：全库 pg_dump 归档 → 删 14 家族 bank（宿主 bank 不动）"
  if [ "$APPLY" = 1 ]; then
    if docker exec hindsight-db-1 true 2>/dev/null; then
      DUMPF="$ARC/hindsight-full-${TS}.dump"
      if docker exec hindsight-db-1 pg_dump -U hindsight -d hindsight -Fc > "$DUMPF" 2>/dev/null && [ -s "$DUMPF" ]; then
        say "  全库已归档 → ${DUMPF}"
        _banks=""
        for u in bella fanfan wei mei chen hu lin xiao qi fei arch secops ops audit; do
          # 与 mx-lib user_mac12 同源派生（AIPAY_USER_MAC 覆盖 + shasum/sha1sum/openssl
          # 回落链）。旧实现裸 shasum 且不认覆盖变量：AIPAY_USER_MAC 起跑的轮按错误 ID
          # 删 0 行、事务照样 COMMIT 打"✓ 已清"——零记忆起跑前提为假且无告警
          if [ -n "${AIPAY_USER_MAC:-}" ]; then
            _mac="$AIPAY_USER_MAC"
          elif command -v shasum >/dev/null 2>&1; then
            _mac=$(printf '%s' "$u" | shasum | cut -c1-12)
          elif command -v sha1sum >/dev/null 2>&1; then
            _mac=$(printf '%s' "$u" | sha1sum | cut -c1-12)
          elif command -v openssl >/dev/null 2>&1; then
            _mac=$(printf '%s' "$u" | openssl dgst -sha1 | awk '{print $NF}' | cut -c1-12)
          else
            echo "[mx-clean FAIL] shasum/sha1sum/openssl 全缺，无法派生 bank MAC——拒绝 --reset-memory（防 0 行删除假成功）" >&2; exit 4
          fi
          [ -n "$_mac" ] || { echo "[mx-clean FAIL] bank MAC 派生为空（user=${u}）" >&2; exit 4; }
          _banks="$_banks,('hermes-$_mac-$u')"
        done
        if docker exec -i hindsight-db-1 psql -U hindsight -d hindsight <<HSQ
BEGIN;
CREATE TEMP TABLE _sb(b text);
INSERT INTO _sb VALUES ${_banks#,};
DELETE FROM memory_links           WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM invalidated_memory_units WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM graph_maintenance_queue WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM chunks                 WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM knowledge_pages        WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM documents              WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM observation_history    WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM entities               WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM memory_units           WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM mental_model_history   WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM mental_models          WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM directives             WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM webhooks               WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM audit_log              WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM async_operations       WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM llm_requests           WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM bank_stats_cache       WHERE bank_id IN (SELECT b FROM _sb);
DELETE FROM banks                  WHERE bank_id IN (SELECT b FROM _sb);
COMMIT;
HSQ
        then
          say "✓ 模拟 bank 已清（复核口径：按 14 精确 ID IN 计数各表=0；宿主 b24d7ac5d9c4-* 不动）"
        else
          say "⚠ 记忆清理事务失败（已整体回滚）——人工处置，勿在半态起跑"
        fi
      else
        say "⚠ pg_dump 归档失败——中止删记忆（人工处置）"
      fi
    else
      say "⚠ hindsight-db-1 容器不可用——跳过记忆清场"
    fi
  fi
else
  say "hindsight 记忆保留（未指定 --reset-memory；跨轮家族记忆=2026-09-25 用户裁决默认态）"
fi

# 3c) 中央仓推演域开发分支清理（默认执行；run15 根治：run13 遗留 feat/DEV-PAYCORE-S
#     令 run15 devimpl 真值锚 branch_fresh 恒假盲转 150min——feat/DEV-* 是每轮一次性
#     交付分支，跨轮残留必踩同坑；integration/* 是设计内跨轮续建不在清理面。先 tag
#     快照再删，可回溯。--reset-central 的全量清理另行覆盖本段之后的范围。）
say "中央仓推演域开发分支清理：feat/DEV-*（tag 快照 mx-clean-devbr-${TS} 后删远端）"
if [ "$APPLY" = 1 ]; then
  CEN3="$SIM_ROOT/central/aipaydev"
  # glob 收紧（2026-10-16 守门测试实锤）：git 的 ref 模式 `feat/DEV-*` 中 `*`
  # 可跨 `/`——无匹配时该模式字面对 git=匹配全部 ref，3c 段误删 integration/main！
  # 双防：①shell 侧先 ls-remote 拿真实分支名再逐个删（禁把模式交给 git 解释）；
  # ②保留守卫生效时（_keep_integ=1）只删 feat/DEV-* 一族，integration 永不在面。
  DEVBRS=$(git -C "$CEN3" ls-remote --heads origin 'refs/heads/feat/DEV-*' 2>/dev/null | awk '{print $2}' | sed 's|^refs/heads/||')
  if [ -n "$DEVBRS" ]; then
    git -C "$CEN3" fetch -q origin 2>/dev/null || true
    git -C "$CEN3" tag "mx-clean-devbr-${TS}" 2>/dev/null || true
    git -C "$CEN3" push -q origin "mx-clean-devbr-${TS}" 2>/dev/null || true
    for _db in $DEVBRS; do
      git -C "$CEN3" push -q origin --delete "$_db" 2>/dev/null && say "  删除 origin/$_db" || say "  删失败 origin/$_db（记日志继续）"
    done
  else
    say "  无 feat/DEV-* 残留"
  fi
fi

# 3b) 中央仓 QGate 旧产物清场（run18 复盘根治：.qgate/release-report.md 跨轮共享
#     从不清场，G5 收口拷贝点曾把 5 天前旧件透传进报告——驱动侧已加新鲜度校验，
#     此处起轮清源，双保险）。
say "中央仓 QGate 旧产物清场：central/*/.qgate/"
if [ "$APPLY" = 1 ]; then
  for _qg in "$SIM_ROOT"/central/*/.qgate; do
    [ -d "$_qg" ] || continue
    rm -rf "$_qg" && say "  已清 $_qg"
  done
fi

# 4) 中央仓按需重置（默认保留；--reset-central 清推演工件与 integration 分支）
# 清空范围（run5 教训修订）：推演工件不止 RFD-* 前缀——系分稿 AN-*、任务稿 T-*、
# admin 轮次台账同属轮次产物。0→1 语义=七个 docs 交付目录全清 + docs/admin +
# retro*RFD*；architecture/ 基线保留（AN 稿引用的公共基线，setup 负责刷新）。
# 例外（2026-10-03 文档评审 404 实锤）：docs/admin/{roster,app-registry,org}.md
# 是组织编制基建（/api/governance/registry/:kind 数据源），保留不随轮清。
if [ "$RESET_CENTRAL" = 1 ]; then
  say "中央仓重置：docs/{requirements,analysis,design,plan,test,delivery,acceptance,retro,admin} 全目录 + integration 分支（先打 tag 快照 mx-clean-${TS}）"
  if [ "$APPLY" = 1 ]; then
    CEN="$SIM_ROOT/central/aipaydev"
    git -C "$CEN" tag "mx-clean-${TS}" 2>/dev/null || true
    # 先存档再删：RFD 工件常带在途改动，git rm 无 -f 会拒删且被 || true 吞掉=清不掉
    # （run4 实锤）；未提交改动与清单先入 $ARC，再 -f 强删。
    git -C "$CEN" diff > "$ARC/central-uncommitted.patch" 2>/dev/null || true
    git -C "$CEN" status --porcelain > "$ARC/central-status.txt" 2>/dev/null || true
    # cd 失败必须中止整个子 shell：否则 git clean/git commit 落在调用者 cwd（run 复现过删调用仓未跟踪文件）
    ( cd "$CEN" || exit 0
      # 清空提交必须落 main（run11 实锤：HEAD 停 integration 时提交落错分支，随后
      # push origin main 因 up-to-date 退出 0 报"已推"=假成功，run10 四份系分稿+
      # tasklist 带进 run11 基座）。显式切 main 并对齐远端 tip 再清空提交。
      # checkout 失败必须响亮中止（未跟踪冲突会让 checkout 拒绝——沿 || true 静默
      # 滑回 integration 提交=同病复发，run11 重清轮实锤二次踩坑）；先 clean 清障。
      git clean -fdq 2>/dev/null || true
      git fetch -q origin main 2>/dev/null || true
      if ! git checkout -q main 2>/dev/null; then
        if git checkout -q -b main origin/main 2>/dev/null; then :; else
          say "⚠ 无法切到 main（checkout 被拒）——清空提交无处落，中央仓重置中止（人工处置）"
          exit 1
        fi
      fi
      git reset -q --hard origin/main 2>/dev/null || true
      # 孤儿分支重立（run11 attempt-2 实锤：agent 恢复 run9 悬空提交 96a64a1 拼装
      # 本轮交付——清空树不清历史=考古面仍在。清空态树重立为无历史孤儿 main：前轮
      # 提交从 origin/main 不可达；旧历史经 tag mx-clean-<TS>-pretrunc 保全可反查）。
      git checkout -q --orphan "__mxclean_orphan" 2>/dev/null || true
      git rm -rfq --ignore-unmatch 'docs/requirements' 'docs/analysis' 'docs/design' 'docs/plan' 'docs/test' 'docs/delivery' 'docs/acceptance' 'docs/retro' 'docs/admin' 'docs/evidence' 'materials' 2>/dev/null || true
      git clean -fdq -- docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin 2>/dev/null || true
      # 基础注册表保留（2026-10-03 文档评审 404 实锤：roster/app-registry/org 是组织编制
      # 基建非轮次工件，/api/governance/registry/:kind 直接读它们；清了文档评审页管理区必空。
      # setup 不重建（旧注释"setup 重建"不实）——清空前自快照 tag 取回。）
      git checkout "mx-clean-${TS}" -- docs/admin/roster.md docs/admin/app-registry.md docs/admin/org.md 2>/dev/null || true
      # 治理基线保留（2026-10-04 台账与规则页 404 实锤）：runtime/governance 是产品治理面
      # 数据源（能力台账/决策规则/状态本体，正本=overlay runtime 分发），非轮次工件，随轮保留。
      git checkout "mx-clean-${TS}" -- runtime/governance 2>/dev/null || true
      git commit -q -m "mx-clean：中央仓孤儿重立（推演工件清空+历史截断，admin 基础注册表保留；前轮历史见 tag mx-clean-${TS}-pretrunc）" 2>/dev/null || true
      # 旧 main（含全部前轮历史）先打保全 tag 再让位：孤儿分支顶替 main 名号
      git tag -f "mx-clean-${TS}-pretrunc" main 2>/dev/null || true
      git branch -M main 2>/dev/null || true )
    # 九目录骨架重建（run6 实锤：git rm -rf 连目录一起删，freeze 等直写路径炸 ENOENT）
    ( cd "$CEN" && mkdir -p docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin )
    # 合格线自检：九目录除 admin 三张基础注册表外零文件（旧稿残留=repo_has 假真值温床）；
    # find 只认真实文件，ls 空目录会打 "dir:" 头行造成假残留告警（24h 批③裁决：find 版取代
    # ls 版——且缺 retro 目录；骨架重建保留 main 侧 run6 实锤版）
    # pipefail 陷阱（2026-10-04 实锤）：清空成功时 find 只剩 admin 三件、被 grep -v 滤尽
    # → grep 退出 1 → 管道失败 → 赋值语句在 set -e 下静默中断整个脚本（workspaces 重置与
    # 合格线全程未跑，且无任何报错）。管道尾加 || true 兜底——"干净"恰是本步的成功态。
    _leftover="$(cd "$CEN" 2>/dev/null && find docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin -type f 2>/dev/null | grep -vE 'docs/admin/(roster|app-registry|org)\.md$' | head -5 || true)"
    if [ -n "$_leftover" ]; then
      say "⚠ 清空后仍残留：$_leftover …（人工核查——勿带旧稿起跑 0→1 轮）"
    else
      say "✓ 交付目录清空核验通过（九目录零残留，admin 基础注册表除外）"
    fi
    # ── 4b) 三面残留根治（V7 总则 18/P2 实装；run7 实锤三险情）──
    # ①integration 分支：注释长期称"清"而从未删（run7 旧轮测试报告顶名险情）——tag 快照后删远端。
    # ②远端旧轮工作分支（feat-*/test-*/wt-*/fix-*/wip-*）：旧 tip 依赖 branch_fresh 兜底甄别——
    #   tag 快照后删，消除"分支存在"误读本轮交付的面。（2026-10-03 实锤：wt/t-10x、fix/*、wip/* 共
    #   20 条逃过旧正则——agent worktree 分支 wt/* 是 run6/7 主力命名，漏清面最大）
    # 归档纪律：删前统一 tag 快照 mx-clean-${TS}-branches + SHA 清单落 $ARC（可恢复）。
    ( cd "$CEN" || exit 0
      if [ "$_keep_integ" = "1" ]; then
        _brs=$(git ls-remote --heads origin 2>/dev/null | awk '{print $2}' | grep -E 'refs/heads/(feat/|test-|wt/|fix/|wip/)' || true)
      else
        _brs=$(git ls-remote --heads origin 2>/dev/null | awk '{print $2}' | grep -E 'refs/heads/(integration/|feat/|test/|wt/|fix/|wip/)' || true)
      fi
      if [ -n "$_brs" ]; then
        git fetch -q origin 2>/dev/null || true
        # 全量拉回待删 tips（中央导演 clone 平时只 fetch main，分支 tip 本地无 ref；
        # push --delete 还会删 remote-tracking ref——删后 tag 是唯一恢复锚，必须先打）
        git fetch -q origin '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null || true
        : > "$ARC/central-deleted-branches-${TS}.txt"
        for _b in $_brs; do
          _n="${_b#refs/heads/}"
          _sha=$(git rev-parse "refs/remotes/origin/${_n}" 2>/dev/null || true)
          if [ -n "$_sha" ]; then
            git tag "mx-clean-${TS}-b-${_n//\//_}" "$_sha" 2>/dev/null || true
            printf '%s %s\n' "$_sha" "$_n" >> "$ARC/central-deleted-branches-${TS}.txt"
          fi
        done
        git tag "mx-clean-${TS}-branches" 2>/dev/null || true
        # 先试推 tag 并回读（删除前置）：推达才执行删除——tag 是删后唯一恢复锚。
        _tag_ok=1
        _tags0=$(git tag -l "mx-clean-${TS}-b-*")
        if [ -n "$_tags0" ]; then
          git push -q origin $_tags0 2>/dev/null || true
          git fetch -q origin --tags 2>/dev/null || true
          for _t in $_tags0; do
            git rev-parse "refs/tags/$_t" >/dev/null 2>&1 || continue
            git ls-remote --tags origin "$_t" 2>/dev/null | grep -q . || _tag_ok=0
          done
        fi
        if [ "$_tag_ok" != "1" ]; then
          say "⛔ 删除中止：保全 tag 未推达远端——删后不可恢复（fail-closed，纪律 71）"
          echo "ISSUE|integration-retention-guard|director|mx-clean 删除中止：保全 tag 未推达远端，fail-closed 保留全部分支（run20 游离提交教训）" >> "$SIM_ROOT/runs/${_cur_run:-unknown}/evidence/issues.log" 2>/dev/null || true
        else
        for _b in $_brs; do
          _n="${_b#refs/heads/}"
          git push -q origin --delete "$_n" 2>/dev/null && say "  删远端分支 $_n" || say "  ⚠ 删失败 ${_n}（远端间歇，起跑前核）"
        done
        fi
        _tags=$(git tag -l "mx-clean-${TS}-b-*")
        if [ -n "$_tags" ]; then
          git push -q origin $_tags 2>/dev/null || true
          # 回读验证（run20 死锚教训的产品化）：删后 tag 是唯一恢复锚，本地 tag 随
          # worktree 清理即丢——tag 未推达=删除动作不可恢复，停止删分支（fail-closed）。
          git fetch -q origin --tags 2>/dev/null || true
          _miss=""
          for _t in $_tags; do
            git rev-parse "refs/tags/$_t" >/dev/null 2>&1 || continue
            git ls-remote --tags origin "$_t" 2>/dev/null | grep -q . || _miss="$_miss $_t"
          done
          if [ -n "$_miss" ]; then
            say "⛔ 删除中止：保全 tag 未推达远端（${_miss}）——删后不可恢复，本批保留分支待人工核查（纪律 71）"
            echo "ISSUE|integration-retention-guard|director|mx-clean 删除中止：保全 tag 未推达远端（${_miss}）——fail-closed 保留分支（run20 游离提交不可反查教训）" >> "$SIM_ROOT/runs/${_cur_run:-unknown}/evidence/issues.log" 2>/dev/null || true
          fi
        fi
        say "  已删分支 SHA 清单 → $ARC/central-deleted-branches-${TS}.txt（每 tip tag mx-clean-${TS}-b-* 并已推远端）"
      else
        say "✓ 远端无 integration/feat/test 残留分支"
      fi )
    # ── 4b2) 清空提交落远端（2026-10-03 实锤：本地 commit 不 push → origin/main 仍带
    #     run6/7 全部旧稿 → mx-setup 重克隆工作区旧稿整体复活，清了等于没清）。
    #     快照 tag 一并上推（可恢复锚点必须在远端，本地 tag 会随 worktree 清理丢）。
    #     回读验证（run11 实锤）：push 退出 0 ≠ 推达——up-to-date/推错分支都退出 0；
    #     必须重 fetch 后断言 origin/main == 本地清空提交 tip，不一致即响亮报警。
    #     孤儿重立后历史与远端分叉：force-with-lease 是清场语境的受控重置（旧历史已
    #     由 pretrunc tag 保全），lease 防与并行推送互踩。──
    if git -C "$CEN" push -q --force-with-lease=main origin main 2>/dev/null; then
      git -C "$CEN" fetch -q origin main 2>/dev/null || true
      _ct="$(git -C "$CEN" rev-parse main 2>/dev/null || true)"
      _rt="$(git -C "$CEN" rev-parse origin/main 2>/dev/null || true)"
      if [ -n "$_ct" ] && [ "$_ct" = "$_rt" ]; then
        say "✓ 中央仓清空提交已推 origin/main（回读验证一致 ${_ct:0:7}）"
      else
        say "⚠ push 后回读不一致：local main=${_ct:0:7} vs origin/main=${_rt:0:7}——远端未达清空态，起跑前必须人工核（勿带旧稿起跑）"
      fi
      # 历史深度断言（孤儿重立的实效核验：origin/main 提交数 ≤2——截断失败=考古面仍在）
      _depth="$(git -C "$CEN" rev-list --count origin/main 2>/dev/null || echo 999)"
      if [ "${_depth:-999}" -le 2 ]; then
        say "✓ 历史截断核验：origin/main 深度=${_depth}（前轮提交不可达）"
      else
        say "⚠ 历史截断未达预期：origin/main 深度=${_depth}（>2——考古面仍在，人工核查）"
      fi
      # tip 树正向断言（run11 实锤教训：工作树 find 核验过≠远端 tip 干净；head 截断
      # 式人工核验亦有盲区——这里对回读后的 origin/main 树做全量正向检查）。
      _poll="$(git -C "$CEN" ls-tree -r --name-only origin/main -- docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin 2>/dev/null | grep -vE 'docs/admin/(roster|app-registry|org)\.md$' | head -3 || true)"
      if [ -n "$_poll" ]; then
        say "⚠ 回读 origin/main tip 树仍有交付物残留：${_poll}（勿带旧稿起跑）"
      else
        say "✓ 回读 tip 树九目录零残留（admin 基础注册表除外）"
      fi
    else
      say "⚠ push origin main 失败（重克隆将带回旧稿——起跑前必须人工 push）"
    fi
    git -C "$CEN" push -q origin "mx-clean-${TS}" "mx-clean-${TS}-branches" "mx-clean-${TS}-pretrunc" 2>/dev/null || true
  fi
else
  say "中央仓保留（未指定 --reset-central）"
fi

# 4c) agent 工作区重置（V7 §十二合格线三面之一；--reset-workspaces）
# run7 实锤：workspaces 不清→run6 旧提交（534202f@11:38）被误读为 run7 进度（导演误导单）。
# 归档纪律：tar 整树后删，mx-setup 重建净工作区。
if [ "$RESET_WORKSPACES" = 1 ]; then
  say "agent 工作区归档重置：workspaces/ → ${ARC}/workspaces.tar（tar 后删，mx-setup 重建）"
  if [ "$APPLY" = 1 ]; then
    [ -d "$SIM_ROOT/workspaces" ] && tar -cf "$ARC/workspaces.tar" -C "$SIM_ROOT" workspaces \
      && rm -rf "$SIM_ROOT/workspaces" && say "✓ workspaces 已归档重置（重建走 mx-setup.sh）"
  fi
else
  say "agent 工作区保留（未指定 --reset-workspaces；旧轮提交残留由 branch_fresh/artifact_fresh 甄别——V7 总则 18）"
fi

say "完成。后续：mx-setup.sh → mx-up.sh → RUN_ID=<新轮> aipay-scenario.sh（0→1）"
[ "$APPLY" = 1 ] || echo "（DRY-RUN：以上未执行；确认后加 --apply）"

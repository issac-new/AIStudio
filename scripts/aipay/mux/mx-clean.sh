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
SIM_ROOT="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
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

# 1) 停栈
say "停 studio/gateway（pids/ 下 pid 若活则 TERM）"
for f in studio.pid gateway.pid; do
  p="$SIM_ROOT/pids/$f"
  [ -f "$p" ] || continue
  pid=$(cat "$p")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then say "  TERM $f pid=$pid"; [ "$APPLY" = 1 ] && kill "$pid" || true
  fi
done

# 2) 归档并清空 runs 与 state/locks
TS=$(date +%Y%m%d-%H%M%S)
ARC="$SIM_ROOT/archive/mx-clean-$TS"
say "runs/ 与 state.env → ${ARC}（tar 归档后删除原物）"
if [ "$APPLY" = 1 ]; then
  mkdir -p "$ARC"
  [ -d "$SIM_ROOT/runs" ] && tar -cf "$ARC/runs.tar" -C "$SIM_ROOT" runs && rm -rf "$SIM_ROOT/runs" && mkdir -p "$SIM_ROOT/runs"
  for f in state.env fleet-manifest.json; do
    [ -f "$SIM_ROOT/$f" ] && mv "$SIM_ROOT/$f" "$ARC/$f"
  done
  rm -rf "$SIM_ROOT/gateway-locks" "$SIM_ROOT/.driver.lock.d"
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
  say "✓ kanban 整树已归档重置（重建走 mx-setup.sh；default 哨兵板由首启重建）"
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
      || say "⚠ hermes 运行态清理不完整（人工核查 $H）"
  fi
  # SIM_ROOT/logs 旧轮日志归档（gateway/studio 现行日志会被下次 mx-up 重写，一并带走）
  if [ -d "$SIM_ROOT/logs" ]; then
    mkdir -p "$ARC/sim-logs"
    ( cd "$SIM_ROOT/logs" && ls | grep -E '^(run[0-9]+-|bgreview-|gateway-restart-run|studio-manual|studio-babysit|gateway-babysit|mx-up-relaunch)' \
      | while read -r f; do mv "$f" "$ARC/sim-logs/" 2>/dev/null || true; done ) || true
    say "旧轮 SIM_ROOT/logs 日志 → ${ARC}/sim-logs/"
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
    for tf in "$SIM_ROOT"/creds/*.token; do
      u=$(basename "$tf" .token); T=$(head -1 "$tf" 2>/dev/null)
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
          _mac=$(printf '%s' "$u" | shasum | cut -c1-12)
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
      git rm -rfq --ignore-unmatch 'docs/requirements' 'docs/analysis' 'docs/design' 'docs/plan' 'docs/test' 'docs/delivery' 'docs/acceptance' 'docs/retro' 'docs/admin' 2>/dev/null || true
      git clean -fdq -- docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin 2>/dev/null || true
      # 基础注册表保留（2026-10-03 文档评审 404 实锤：roster/app-registry/org 是组织编制
      # 基建非轮次工件，/api/governance/registry/:kind 直接读它们；清了文档评审页管理区必空。
      # setup 不重建（旧注释"setup 重建"不实）——清空前自快照 tag 取回。）
      git checkout "mx-clean-${TS}" -- docs/admin/roster.md docs/admin/app-registry.md docs/admin/org.md 2>/dev/null || true
      git commit -q -m "mx-clean：推演工件全目录清空（保留 admin 基础注册表；快照 tag mx-clean-${TS}）" 2>/dev/null || true )
    # 九目录骨架重建（run6 实锤：git rm -rf 连目录一起删，freeze 等直写路径炸 ENOENT）
    ( cd "$CEN" && mkdir -p docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin )
    # 合格线自检：九目录除 admin 三张基础注册表外零文件（旧稿残留=repo_has 假真值温床）；
    # find 只认真实文件，ls 空目录会打 "dir:" 头行造成假残留告警（24h 批③裁决：find 版取代
    # ls 版——且缺 retro 目录；骨架重建保留 main 侧 run6 实锤版）
    _leftover="$(cd "$CEN" 2>/dev/null && find docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin -type f 2>/dev/null | grep -vE 'docs/admin/(roster|app-registry|org)\.md$' | head -5)"
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
      _brs=$(git ls-remote --heads origin 2>/dev/null | awk '{print $2}' | grep -E 'refs/heads/(integration/|feat/|test/|wt/|fix/|wip/)' || true)
      if [ -n "$_brs" ]; then
        git fetch -q origin 2>/dev/null || true
        git tag "mx-clean-${TS}-branches" 2>/dev/null || true
        for _b in $_brs; do
          _n="${_b#refs/heads/}"
          git push -q origin --delete "$_n" 2>/dev/null && say "  删远端分支 $_n" || say "  ⚠ 删失败 $_n（远端间歇，起跑前核）"
        done
      else
        say "✓ 远端无 integration/feat/test 残留分支"
      fi )
    # ── 4b2) 清空提交落远端（2026-10-03 实锤：本地 commit 不 push → origin/main 仍带
    #     run6/7 全部旧稿 → mx-setup 重克隆工作区旧稿整体复活，清了等于没清）。
    #     快照 tag 一并上推（可恢复锚点必须在远端，本地 tag 会随 worktree 清理丢）。──
    git -C "$CEN" push -q origin main 2>/dev/null \
      && say "✓ 中央仓清空提交已推 origin/main" \
      || say "⚠ push origin main 失败（重克隆将带回旧稿——起跑前必须人工 push）"
    git -C "$CEN" push -q origin "mx-clean-${TS}" "mx-clean-${TS}-branches" 2>/dev/null || true
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

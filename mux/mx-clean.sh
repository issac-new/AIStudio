#!/bin/bash
# mx-clean.sh —— 0→1 清环境（V5 补遗④第 1 项 / §十一）
# 用法：bash mx-clean.sh [--dry-run] [--keep-accounts] [--reset-central]
#   --dry-run      只打印将执行的动作（默认即 dry-run——显式 --apply 才真清）
#   --apply        真执行（危险：清空 runs/state/locks/房间归档）
#   --keep-accounts 保留 synapse 账号（缺省连同房间一起归档清理但保留账号与凭据）
#   --reset-central 重置中央仓 integration/RFD-* 与 docs/{analysis,design,plan,test,delivery,acceptance,retro,requirements}/RFD-*
# 合格线（方案 §十一）：清后 runs/ 无旧轮目录、state.env 空、房间列表无旧轮同名房；可反复跑。
set -euo pipefail
SIM_ROOT="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
APPLY=0; KEEP_ACCOUNTS=0; RESET_CENTRAL=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --keep-accounts) KEEP_ACCOUNTS=1 ;;
    --reset-central) RESET_CENTRAL=1 ;;
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

# 2b) 看板库归档（0→1 补全线——run4 实锤：旧轮 147 卡残留污染 chips 计数与凭证核验）
#     tar 归档 boards/ 后清空各板 tasks 及关联表（保留板元数据 board.json/team 围栏/profiles）。
if [ "$APPLY" = 1 ] && [ -d "$SIM_ROOT/hermes/kanban/boards" ]; then
  say "看板库归档 → ${ARC}/boards.tar；随后清空各板任务（保留板骨架/围栏）"
  tar -cf "$ARC/boards.tar" -C "$SIM_ROOT/hermes/kanban" boards
  python3 - "$SIM_ROOT/hermes/kanban/boards" <<'PYEOF'
import sqlite3, glob, sys
n = 0
for db in glob.glob(sys.argv[1] + '/*/kanban.db'):
    conn = sqlite3.connect(db, timeout=15)
    try:
        cur = conn.cursor(); cur.execute('begin immediate')
        c1 = cur.execute('delete from tasks').rowcount
        for t in ('task_links','task_comments','task_events','task_runs','task_attachments'):
            try: cur.execute('delete from ' + t)
            except Exception: pass
        conn.commit(); n += max(c1, 0)
    except Exception as e:
        conn.rollback(); print(f'  WARN {db}: {e}')
    finally: conn.close()
print(f'  boards tasks cleared: {n}')
PYEOF
fi

# 3) synapse 房间归档清理（保留账号与凭据：按创建时间/名称把推演房间逐个 PUT /forget+delete 前先 archive）
#    管理员 token 自 creds/admin.token；房间筛选=成员含 @fanfan:matrix.test 且名称含「需求分析讨论群」等推演特征
if [ "$KEEP_ACCOUNTS" = 0 ]; then
  say "归档并退出本机 joined 推演房间（保留账号；凭据不动）"
  ADM=$( [ -f "$SIM_ROOT/creds/admin.token" ] && cat "$SIM_ROOT/creds/admin.token" | head -1 || true )
  if [ "$APPLY" = 1 ] && [ -n "$ADM" ]; then
    HS=http://127.0.0.1:8008
    for u in bella fanfan wei mei chen hu lin xiao qi fei arch secops ops audit; do
      T=$( [ -f "$SIM_ROOT/creds/$u.token" ] && head -1 "$SIM_ROOT/creds/$u.token" || true )
      [ -n "$T" ] || continue
      curl -sf "$HS/_matrix/client/v3/joined_rooms?access_token=$T" | jq -r '.joined_rooms[]' | while read -r rid; do
        nm=$(curl -sf "$HS/_matrix/client/v3/rooms/$rid/state/m.room.name?access_token=$T" | jq -r '.name // ""' 2>/dev/null || echo "")
        case "$nm" in *"讨论群"*|"dlv-"*|*"需求"*) 
          curl -sf -X PUT "$HS/_matrix/client/v3/rooms/$rid/state/m.room.join_rules?access_token=$T" -d '{"join_rule":"public"}' >/dev/null || true
          curl -sf -X POST "$HS/_matrix/client/v3/rooms/$rid/leave?access_token=$T" -d '{}' >/dev/null || true
          say "  left $rid ($nm)"
        ;; esac
      done
    done
  fi
else
  say "保留账号且不动房间（--keep-accounts）"
fi

# 4) 中央仓按需重置（默认保留；--reset-central 清推演工件与 integration 分支）
# 清空范围（run5 教训修订）：推演工件不止 RFD-* 前缀——系分稿 AN-*、任务稿 T-*、
# admin 台账（app-registry/org，setup 重建）同属轮次产物。0→1 语义=七个 docs 交付
# 目录全清 + docs/admin + retro*RFD*；architecture/ 基线保留（AN 稿引用的公共基线，
# setup 负责刷新）。合格线新增：清空后七目录为空（防旧稿残留满足"文件存在"假真值）。
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
      git commit -q -m "mx-clean：推演工件全目录清空（快照 tag mx-clean-${TS}）" 2>/dev/null || true )
    # 九目录骨架重建（run6 实锤：git rm -rf 连目录一起删，freeze 等直写路径炸 ENOENT）
    ( cd "$CEN" && mkdir -p docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin )
    # 合格线自检：九目录均不得残留文件（旧稿残留=repo_has 假真值温床）；find 只认真实文件，
    # ls 空目录会打 "dir:" 头行造成假残留告警（24h 批③裁决：find 版取代 ls 版——ls 会给空目录
    # 打 "dir:" 头行造成假残留告警，且缺 retro 目录；骨架重建保留 main 侧 run6 实锤版）
    _leftover="$(cd "$CEN" 2>/dev/null && find docs/requirements docs/analysis docs/design docs/plan docs/test docs/delivery docs/acceptance docs/retro docs/admin -type f 2>/dev/null | head -5)"
    if [ -n "$_leftover" ]; then
      say "⚠ 清空后仍残留：$_leftover …（人工核查——勿带旧稿起跑 0→1 轮）"
    else
      say "✓ 交付目录清空核验通过（九目录零残留）"
    fi
  fi
else
  say "中央仓保留（未指定 --reset-central）"
fi

say "完成。后续：mx-setup.sh → mx-up.sh → RUN_ID=<新轮> aipay-scenario.sh（0→1）"
[ "$APPLY" = 1 ] || echo "（DRY-RUN：以上未执行；确认后加 --apply）"

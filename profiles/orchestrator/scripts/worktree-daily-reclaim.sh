#!/bin/bash
# worktree-daily-reclaim.sh — 每日回收 done/archived 卡的 kanban worktree
# 来源：2026-09-17 实战（36 worktree / 216G 回收）；教训已固化本脚本
# 纪律：先存档再删；blocked 卡不动；NO-CARD 不动；remediation/ 等特殊前缀不动
set -u
MAIN=/Users/YOURNAME/hermes-docker-sandbox/workspace
CENTRAL_DB="$HOME/.hermes/kanban.db"
BOARDS_DIR="$HOME/.hermes/kanban/boards"
ARCHIVE_BASE=/Volumes/YOURVOLUME/lab/_trash/wt-untracked-daily
LOG="$HOME/.hermes/logs/worktree-reclaim.log"
RETAIN_DAYS=30          # 归档保留期
TODAY=$(date +%Y%m%d)
ARC="$ARCHIVE_BASE/$TODAY"

mkdir -p "$ARC" "$HOME/.hermes/logs"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# --- 1. 清理过期归档（先存档后删的保留期回收） ---
find "$ARCHIVE_BASE" -maxdepth 1 -type d -name '20*' -mtime +$RETAIN_DAYS -exec rm -rf {} \; 2>/dev/null

cd "$MAIN" || { log "FATAL: cannot cd $MAIN"; exit 1; }

# --- 2. 枚举 .worktrees/t_* 任务 worktree（remediation/ 等特殊前缀天然不在列） ---
# 注意：macOS 自带 bash 3.2 无 mapfile/数组，用 glob 遍历
log "=== daily reclaim start ==="
removed=0; archived_branch=0; skipped=0; failed=0

shopt -s nullglob
for wt in .worktrees/t_*; do
  [ -d "$wt" ] || continue
  tid=$(basename "$wt")

  # --- 卡状态：中央库优先，板库兜底；blocked/非终态一律跳过 ---
  status=""
  [ -f "$CENTRAL_DB" ] && status=$(sqlite3 "file:$CENTRAL_DB?immutable=1" "SELECT status FROM tasks WHERE id='$tid'" 2>/dev/null)
  if [ -z "$status" ] && [ -d "$BOARDS_DIR" ]; then
    for db in "$BOARDS_DIR"/*/kanban.db; do
      [ -f "$db" ] || continue
      s=$(sqlite3 "file:$db?immutable=1" "SELECT status FROM tasks WHERE id='$tid'" 2>/dev/null)
      [ -n "$s" ] && { status="$s"; break; }
    done
  fi
  case "$status" in
    done|archived) : ;;                     # 可回收
    "") log "SKIP $tid: NO-CARD (需人工裁决)"; skipped=$((skipped+1)); continue ;;
    *)  log "SKIP $tid: status=$status"; skipped=$((skipped+1)); continue ;;
  esac

  # --- 僵尸 worktree（.git 指针缺失）：归档后 rm + prune ---
  if [ ! -f "$wt/.git" ]; then
    mkdir -p "$ARC/$tid"
    (cd "$wt" 2>/dev/null && tar cf - . 2>/dev/null | (cd "$ARC/$tid" && tar xf -)) 2>/dev/null
    rm -rf "$wt"
    git worktree prune
    log "RECLAIMED $tid: zombie (.git missing), untracked saved to $ARC/$tid"
    removed=$((removed+1)); continue
  fi

  # --- 独立提交 → 转 archive 分支留档（不丢任何 commit） ---
  unmerged=$(git -C "$wt" log --oneline main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  git worktree unlock "$wt" 2>/dev/null   # 无条件 unlock：锁在主仓 .git/worktrees/<tid>/locked，未锁时无害
  if [ "${unmerged:-0}" -gt 0 ]; then
    git branch -m "wt/$tid" "archive/$tid" 2>/dev/null || git branch "archive/$tid" "wt/$tid" 2>/dev/null
    if git worktree remove --force "$wt" 2>/dev/null; then
      log "RECLAIMED $tid: unmerged=$unmerged commits -> branch archive/$tid"
      archived_branch=$((archived_branch+1))
    else
      log "FAIL $tid: branch archived but worktree remove failed (留待人工)"
      failed=$((failed+1)); continue
    fi
    continue
  fi

  # --- 半成品/干净 worktree：归档「主仓没有或内容不同」的未追踪文件 ---
  # 防重复归档陷阱（2026-09-17：24 份 7.1G enc-archive 重复 = 147G）：
  # 主仓存在同名文件且 cmp 相同 → 跳过；不存在或不同 → 归档
  mkdir -p "$ARC/$tid"
  saved=0
  while IFS= read -rd '' f; do
    rel=${f#./}
    if [ -f "$MAIN/$rel" ] && cmp -s "$MAIN/$rel" "$f"; then
      continue    # 主仓已有相同内容，无需归档
    fi
    mkdir -p "$ARC/$tid/$(dirname "$rel")"
    cp -p "$f" "$ARC/$tid/$rel" && saved=$((saved+1))
  done < <(git -C "$wt" ls-files --others --exclude-standard -z 2>/dev/null)

  if git worktree remove --force "$wt" 2>/dev/null; then
    git branch -D "wt/$tid" >/dev/null 2>&1
    git worktree prune
    log "RECLAIMED $tid: untracked_saved=$saved"
    removed=$((removed+1))
  else
    log "FAIL $tid: remove failed (留待人工)"; failed=$((failed+1))
  fi
done

git worktree prune
log "=== done: removed=$removed branch_archived=$archived_branch skipped=$skipped failed=$failed | worktrees_left=$(ls .worktrees 2>/dev/null | wc -l | tr -d ' ') disk=$(df -h "$MAIN" | tail -1 | awk '{print $4" free"}') ==="
[ "$failed" -gt 0 ] && log "WARN: $failed failed items need manual review"
exit 0

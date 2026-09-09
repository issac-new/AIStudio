#!/bin/bash
# orchestrator 调度健康审计（可重复执行；基线见 SKILL.md）
echo "=== A. delegation 时延分布 ==="
for d in ~/.hermes/profiles/orchestrator/cache/delegation/live/*/; do
  name=$(basename "$d")
  n=0
  for f in "$d"task-*.log; do
    [ -f "$f" ] || continue
    dur=$(grep -oE 'duration=[0-9.]+' "$f" | tail -1 | cut -d= -f2)
    status=$(grep -oE 'status=[a-z_]+' "$f" | tail -1 | cut -d= -f2)
    if [ -n "$dur" ]; then n=$((n+1)); echo "  $name/$(basename $f): status=$status dur=${dur}s"; fi
  done
  [ "$n" -eq 0 ] && echo "  $name: 无已完成子任务（运行中或空）"
done

echo; echo "=== B. 各板 open 卡状态与年龄（天）==="
for dbpath in ~/.hermes/kanban/boards/*/kanban.db; do
  b=$(basename "$(dirname "$dbpath")")
  # 注意：kanban DB 为 WAL 模式，mode=ro 在无活跃 shm 时报错 14，必须普通打开
  sqlite3 "$dbpath" "SELECT '$b: '||id||' ['||status||'] '||CAST((julianday('now')-julianday(CAST(created_at AS INT),'unixepoch')) AS INT)||'d前 prio='||priority||' '||substr(title,1,30) FROM tasks WHERE status NOT IN ('done','archived') ORDER BY created_at;" 2>/dev/null
done

echo; echo "=== C. 依赖门控全景（task_links: parent -> child）==="
for dbpath in ~/.hermes/kanban/boards/*/kanban.db; do
  b=$(basename "$(dirname "$dbpath")")
  links=$(sqlite3 "$dbpath" "SELECT '$b '||parent_id||' -> '||child_id FROM task_links;" 2>/dev/null)
  [ -n "$links" ] && echo "$links"
done
echo "(子卡仅在全部 parent done 后才被 promote——挂起的链头即调度停滞点)"

echo; echo "=== D. dispatcher 配置 ==="
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/config.yaml')); k=c.get('kanban',{}); print({x:k[x] for x in k if 'dispatch' in x or 'poll' in x or 'stale' in x})" 2>/dev/null

echo; echo "=== E. 全局 profile↔board 健康快照 ==="
python3 - <<'PYEOF'
import os, sqlite3, glob
home = os.path.expanduser("~")
profiles = set(os.listdir(os.path.join(home, ".hermes/profiles")))
print(f"profiles 总数: {len(profiles)}")
boards_dir = os.path.join(home, ".hermes/kanban/boards")
for db in sorted(glob.glob(os.path.join(boards_dir, "*", "kanban.db"))):
    board = os.path.basename(os.path.dirname(db))
    try:
        con = sqlite3.connect(db)  # WAL 库：勿用 mode=ro
        rows = con.execute("SELECT status, count(*) FROM tasks GROUP BY status").fetchall()
        ghosts = [a for (a,) in con.execute(
            "SELECT DISTINCT assignee FROM tasks WHERE assignee IS NOT NULL AND assignee != ''").fetchall()
            if a not in profiles]
        d = dict(rows)
        print(f"  {board}: done={d.get('done',0)} open={sum(v for k,v in d.items() if k not in ('done','archived'))} ghosts={ghosts or '无'}")
        con.close()
    except Exception as e:
        print(f"  {board}: ERROR {e}")
PYEOF

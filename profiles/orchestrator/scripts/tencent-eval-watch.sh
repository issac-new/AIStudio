#!/bin/bash
# 腾讯评测融合子卡监视：有进展或全 done 才输出，否则静默（幂等 watchdog）
DB="$HOME/.hermes/kanban/boards/swarm/kanban.db"
KIDS="t_aaa838b0 t_75079347 t_a0754ca8"
STATE_FILE="$HOME/.hermes/profiles/orchestrator/scripts/.tencent-eval-watch.state"
CUR=""
ALL_DONE=1
for k in $KIDS; do
  s=$(sqlite3 "$DB" "SELECT status FROM tasks WHERE id='$k'" 2>/dev/null)
  CUR="$CUR $k=$s"
  [ "$s" != "done" ] && ALL_DONE=0
done
CUR=$(echo "$CUR" | tr -s ' ')
PREV=$(cat "$STATE_FILE" 2>/dev/null)
if [ "$CUR" != "$PREV" ]; then
  echo "PROGRESS $CUR"
  echo "$CUR" > "$STATE_FILE"
fi
if [ "$ALL_DONE" = "1" ]; then
  echo "ALL_DONE t_aaa838b0 t_75079347 t_a0754ca8 - orchestrator run hermes kanban show on each, summarize 3-point, complete parent t_f0a4636e, then remove this cron job"
fi

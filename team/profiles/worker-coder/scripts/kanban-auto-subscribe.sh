#!/bin/bash
# kanban-auto-subscribe.sh
# Auto-subscribe all unsubscribed active tasks to orchestrator's Matrix room
# This ensures every kanban task gets notification routing to the orchestrator's session
# Runs as a cron job under the orchestrator profile

KANBAN_DB="$HOME/.hermes/kanban/boards/kanban001/kanban.db"
MATRIX_ROOM="<matrix-room-id>"
ORCHESTRATOR_PROFILE="orchestrator"

# Get all tasks that are active (not done/archived) and don't have subscriptions yet
sqlite3 "$KANBAN_DB" "
SELECT t.id FROM tasks t
WHERE t.status NOT IN ('done', 'archived')
AND NOT EXISTS (
  SELECT 1 FROM kanban_notify_subs s
  WHERE s.task_id = t.id
  AND s.platform = 'matrix'
  AND s.chat_id = '$MATRIX_ROOM'
);
" 2>/dev/null | while read task_id; do
  if [ -n "$task_id" ]; then
    result=$(hermes kanban notify-subscribe "$task_id" \
      --platform matrix --chat-id "$MATRIX_ROOM" \
      --notifier-profile "$ORCHESTRATOR_PROFILE" 2>&1)
    echo "Subscribed $task_id: $result"
  fi
done

echo "Done"

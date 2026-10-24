#!/bin/bash
# Email check script for Hermes orchestrator cron job
# Checks for new unread emails via agently-cli and outputs summary for the agent

UNREAD=$(agently-cli message +list --dir inbox --is-unread --limit 10 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "ERROR: agently-cli message +list failed (exit $?)"
    exit 1
fi

# Count unread messages
COUNT=$(echo "$UNREAD" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msgs = data.get('data', {}).get('data', [])
    print(len(msgs))
except:
    print(0)
" 2>/dev/null)

if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
    # Silent — no new emails
    exit 0
fi

# Output the unread messages summary for the agent to process
echo "You have $COUNT new unread email(s) in your-bot@example.com:"
echo ""
echo "$UNREAD" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msgs = data.get('data', {}).get('data', [])
    for i, m in enumerate(msgs, 1):
        frm = m.get('from', {})
        print(f\"  {i}. From: {frm.get('name', '')} <{frm.get('email', '')}>\")
        print(f\"     Subject: {m.get('subject', '(no subject)')}\")
        print(f\"     Date: {m.get('created_at', '?')}\")
        print(f\"     ID: {m.get('message_id', '?')}\")
        snippet = m.get('snippet', '')[:100]
        print(f\"     Preview: {snippet}...\")
        print()
except Exception as e:
    print(f'Parse error: {e}')
"

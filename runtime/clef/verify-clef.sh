#!/bin/bash
# Clef 27B 本地服务验证：健康检查 + 上游同款三原语样例 + 延迟实测
# 用法：bash verify-clef.sh（需服务已启动：bash start-clef.sh）
set -e
BASE=http://127.0.0.1:8001

echo "=== 1. 健康检查 ==="
curl -s --max-time 5 "$BASE/health" && echo

echo; echo "=== 2. 上游 jev.md 同款样例（choice + score + noul 三原语）==="
cat > /tmp/clef-sample.json <<'EOF'
{
  "model": "clef-4bit",
  "state": {"message": "Please fix this billing error."},
  "questions": {
    "category": {"type": "choice", "instructions": "Which team should handle this?",
      "criteria": {"billing": "Payments and invoices", "technical": "Software problems"}},
    "urgency": {"type": "score", "instructions": "How urgent is the request?",
      "criteria": ["Routine", "Urgent"]},
    "actionable": {"type": "noul", "instructions": "Does the message ask for an action?"}
  }
}
EOF
curl -s --max-time 120 -X POST "$BASE/v1/systemone" -H 'Content-Type: application/json' \
  -d @/tmp/clef-sample.json | python3 -m json.tool

echo; echo "=== 3. 延迟实测：短 state × 5 次 ==="
for i in 1 2 3 4 5; do
  curl -s --max-time 120 -X POST "$BASE/v1/systemone" -H 'Content-Type: application/json' \
    -d @/tmp/clef-sample.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'第${i}次 latency_ms:', d.get('usage',{}).get('latency_ms'))"
done

echo; echo "=== 4. 延迟实测：约 1000 token 长 state × 2 次 ==="
python3 -c "
import json
long_state = 'Context: ' + ('The swarm orchestration session includes agent handoffs, tool call audit records, and approval queues. ' * 55)
req = {'model': 'clef-4bit', 'state': {'message': long_state},
       'questions': {'risk': {'type': 'noul', 'instructions': 'Does this context contain anything unsafe?'}}}
open('/tmp/clef-long.json','w').write(json.dumps(req))"
for i in 1 2; do
  curl -s --max-time 300 -X POST "$BASE/v1/systemone" -H 'Content-Type: application/json' \
    -d @/tmp/clef-long.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'长state第${i}次 input_tokens:', d.get('usage',{}).get('input_tokens'), 'latency_ms:', d.get('usage',{}).get('latency_ms'))"
done

#!/usr/bin/env bash
# Desktop App ↔ Gateway 错误链一次性诊断探针。
# 用法:
#   diagnose-desktop-gateway.sh                 # 网关健康 + ticket 错误签名
#   diagnose-desktop-gateway.sh <session_id>    # 追加: 会话索引悬空判定
set -u

HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
# desktop.log / sessions.json 是宿主级工件（~/.hermes 根下），不在 profile 目录里；
# HERMES_HOME 可能指向 profile —— 两级探测，取存在者。
if [ -f "$HERMES_ROOT/logs/desktop.log" ]; then
  DESKTOP_LOG="$HERMES_ROOT/logs/desktop.log"
elif [ -n "${HERMES_HOME:-}" ] && [ -f "$HERMES_HOME/logs/desktop.log" ]; then
  DESKTOP_LOG="$HERMES_HOME/logs/desktop.log"
else
  DESKTOP_LOG="$HERMES_ROOT/logs/desktop.log"
fi
if [ -f "$HERMES_ROOT/sessions/sessions.json" ]; then
  SESSIONS_JSON="$HERMES_ROOT/sessions/sessions.json"
else
  SESSIONS_JSON="${HERMES_HOME:-$HERMES_ROOT}/sessions/sessions.json"
fi

echo "== 1. Gateway /health =="
HEALTH=$(curl -s -m 5 localhost:8650/health 2>&1)
if echo "$HEALTH" | grep -q '"status": "ok"'; then
  echo "OK: $HEALTH"
else
  echo "FAIL: ${HEALTH:-<no response>}"
fi

echo
echo "== 2. desktop.log 尾部错误签名（消毒读法）=="
if [ -f "$DESKTOP_LOG" ]; then
  SIG=$(tail -c 200000 "$DESKTOP_LOG" | tr -c '[:print:]\n' '?' | grep -cE 'Gateway ticket bootstrap failed|Invalid gateway ticket response')
  echo "尾部 200KB 内 ticket 错误条数: $SIG"
  if [ "$SIG" -gt 0 ]; then
    echo "→ App 侧 ticket 失同步。网关若 ok,处置=完全退出并重开 Desktop App。"
  else
    echo "→ 尾部无 ticket 错误;若 App 仍报错,扩大窗口再查。"
  fi
  tail -c 200000 "$DESKTOP_LOG" | tr -c '[:print:]\n' '?' | grep -oE 'JsonRpcGatewayError: [a-z_]+' | sort | uniq -c
else
  echo "desktop.log 不存在: $DESKTOP_LOG"
fi

if [ $# -lt 1 ]; then exit 0; fi
SID="$1"

echo
echo "== 3. 会话 $SID 悬空判定 =="
IN_IDX=$(python3 -c "import json,sys; print('yes' if sys.argv[1] in json.dumps(json.load(open(sys.argv[2]))) else 'no')" "$SID" "$SESSIONS_JSON" 2>/dev/null || echo err)
echo "索引(sessions.json): $IN_IDX"

if [ "$IN_IDX" = "yes" ]; then
  echo "归属 key:"
  grep -o '"[^"]*'"$SID"'[^"]*"' "$SESSIONS_JSON" | head -3
  PROFILE=$(grep -o '"agent:[^"]*"' "$SESSIONS_JSON" | grep "$SID" | head -1 | cut -d: -f2)
  FOUND=no
  for d in "$HERMES_ROOT/profiles/$PROFILE/sessions" "$HERMES_ROOT/sessions"; do
    if ls "$d"/"$SID"* >/dev/null 2>&1; then echo "磁盘在: $d/"; FOUND=yes; fi
  done
  [ "$FOUND" = no ] && echo "DANGLING: 索引有、磁盘无 → 删索引条目(sessions.json + state.db gateway_routing 同 key 行)可消除 not_found"
fi

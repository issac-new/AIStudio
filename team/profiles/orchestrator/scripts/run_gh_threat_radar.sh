#!/bin/bash
# run_gh_threat_radar.sh — GitHub 威胁雷达日常档（no_agent 纯脚本 cron）
# 挂载: orchestrator cron 40 9 * * *（job id: gh-threat-radar-daily）
# 产物: 告警 JSON → _shared/hack-kb/intel/；stdout 摘要 → cron 输出缓存
set -u

RADAR=/Users/YOURNAME/.hermes/skills/hack-team/wih-secret-hunter/scripts/gh_threat_radar.py
KB_DIR=/Users/YOURNAME/.hermes/profiles/_shared/hack-kb/intel
STATE="$KB_DIR/gh_radar_state.json"
TODAY=$(date +%F)
OUT_JSON="$KB_DIR/gh_alerts_${TODAY}.json"
LOG="$KB_DIR/gh_radar_last_run.log"
PY=/Users/YOURNAME/.hermes/hermes-agent/venv/bin/python

mkdir -p "$KB_DIR"

# 关键词清单（改这里即可；state 按指纹去重跨天有效）
KEYWORDS=("CVE-2026" "exploit" "0day" "nuclei-template")

ARGS=()
for kw in "${KEYWORDS[@]}"; do
  ARGS+=("$kw")
done

# state 不存在时 gh_threat_radar 首跑即建基线（exit 0 有告警/1 无告警均正常）
{
  echo "=== gh_threat_radar run @ $(date '+%F %T') ==="
  "$PY" "$RADAR" --keywords "${ARGS[@]}" --state "$STATE" --output "$OUT_JSON"
  echo "exit=$?"
  echo "alerts_json=$OUT_JSON"
} >> "$LOG" 2>&1

# cron 输出缓存（jobs.json 执行史可见摘要）
tail -20 "$LOG"

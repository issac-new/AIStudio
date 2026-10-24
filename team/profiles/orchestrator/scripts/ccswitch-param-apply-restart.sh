#!/usr/bin/env bash
# ccswitch-param-apply-restart.sh — cc-switch 熔断参数装载器（幂等）
#
# 背景: 2026-10-03 token 审计整改（t_da1ed8d4 A 项）: 熔断参数经 DB 直写,
#       CC Switch.app 重启才读取。用户裁决(2026-10-03): 凌晨授权窗(00-08)重启装载。
# 语义: stamp 文件晚于参数写入时刻 → 已装载, 跳过; 否则在授权窗内重启装载。
# 常驻价值: S5 watchdog(llm-waste-watchdog) 检测参数漂移报警 → 本脚本负责
#           "修好 DB 后重启装载", 组成检测-装载闭环。每天空跳成本≈0。
set -uo pipefail

LOG=/Users/YOURNAME/.hermes/logs/ccswitch-restart.log
DB=/Users/YOURNAME/.cc-switch/cc-switch.db
STAMP=/Users/YOURNAME/.hermes/cache/ccswitch-param-loaded.stamp
PARAM_WRITTEN_TS=1791032646   # 2026-10-03 00:24:06 CST, proxy_config 首写时刻
EXPECTED="3|10|120|0.5|15"    # retries|failure_threshold|timeout|error_rate|min_requests

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
mkdir -p "$(dirname "$LOG")" "$(dirname "$STAMP")"

# ── 窗口判定: 仅 00:00-08:00 执行（用户裁决授权窗; FORCE=1 手动逃生门）──
HOUR=$(date +%H | sed 's/^0//')
if [[ "${FORCE:-0}" != "1" ]] && (( HOUR >= 8 )); then
  log "SKIP: ${HOUR}时在授权窗(00-08)外; FORCE=1 可强制"
  exit 0
fi

# ── 期望参数核对（参数被回滚/改动时不盲目重启）──
ACTUAL=$(sqlite3 "$DB" "SELECT max_retries||'|'||circuit_failure_threshold||'|'||circuit_timeout_seconds||'|'||circuit_error_rate_threshold||'|'||circuit_min_requests FROM proxy_config WHERE app_type='claude';" 2>/dev/null)
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  log "ABORT: proxy_config=[$ACTUAL] ≠ 期望[$EXPECTED]; 参数被改, 先修 DB 再装载"
  exit 2
fi

# ── 已装载判定: stamp 晚于参数写入 ──
if [[ -f "$STAMP" ]]; then
  STAMP_TS=$(stat -f %m "$STAMP")
  if (( STAMP_TS > PARAM_WRITTEN_TS )); then
    log "OK: 已装载(stamp $(date -r $STAMP_TS '+%F %T')), 无需动作"
    exit 0
  fi
fi

# ── 重启装载 ──
log "RESTART: 重启 CC Switch 装载熔断参数 [$EXPECTED]..."
osascript -e 'quit app "CC Switch"' 2>/dev/null
sleep 4
open -a "CC Switch"
sleep 8
for _ in 1 2 3 4 5; do
  if curl -s -m 2 http://127.0.0.1:15721/health 2>/dev/null | grep -q healthy; then
    touch "$STAMP"
    log "OK: cc-switch health=healthy, 熔断参数已装载"
    exit 0
  fi
  sleep 4
done
log "FAIL: 重启后 15721 health 未恢复 — 人工检查 CC Switch.app"
exit 3

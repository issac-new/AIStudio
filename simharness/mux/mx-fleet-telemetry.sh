#!/bin/bash
# mx-fleet-telemetry.sh — 舰队利用率遥测（自我觉察 spec §4 舰队层，2026-10-29 立项）
# 数据源：SIM profiles 的 agent.log 真实调用（'API call #' 行）＋账号板任务态。
# 输出：JSON——按角色域聚合「在编×活跃×饱和度」＋闲置容量＋最后活跃。
# 用法：bash mux/mx-fleet-telemetry.sh [--json]；exit 0。
# 判据纪律（spec D2）：活性只作呈现，饱和度判据用「最近活跃窗」如实呈现，不造数。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh" >/dev/null 2>&1 || true

JSON=0
[[ "${1:-}" == "--json" ]] && JSON=1

# 角色域→profile 映射（mx-setup 供给面；worker 前缀全族扫描——2026-10-29 值守教训：
# 执行载体随波次在 base/-worker 形态间切换，探测必须覆盖同前缀全族）
DOMAINS=(
  "编排:fanfan"
  "需求:bella"
  "架构:arch"
  "安全:secops"
  "研发:chen hu lin xiao"
  "前端研发:mei"
  "测试:qi fei"
  "运维:ops"
  "审计:audit"
)
NOW=$(date +%s)
ACTIVE_WIN=900      # 15 分钟内有真实调用＝活跃工位
RECENT_WIN=3600     # 1 小时内＝近期有余温

emit_row() { # <domain> <staffed> <active> <recent> <last_ts> <saturation_pct>
  if [ "$JSON" = 1 ]; then
    printf '{"domain":"%s","staffed":%s,"active":%s,"recent":%s,"lastActivityAgo":"%s","saturationPct":%s},\n' "$@"
  else
    printf '%-8s 在编=%-2s 活跃=%-2s 余温=%-2s 最后调用=%-12s 饱和度=%s%%\n' "$@"
  fi
}

total_staffed=0; total_active=0; rows=""
if [ "$JSON" = 1 ]; then printf '{"runId":"%s","ts":%s,"windowSec":%s,"domains":[\n' "${RUN_ID:-unknown}" "$NOW" "$ACTIVE_WIN"; fi
for d in "${DOMAINS[@]}"; do
  dom="${d%%:*}"; members="${d#*:}"
  staffed=0; active=0; recent=0; last_ago="—"
  for m in $members; do
    for pdir in "$HERMES_ROOT/profiles/$m" "$HERMES_ROOT/profiles/$m"-*; do
      [ -d "$pdir" ] || continue
      staffed=$((staffed+1))
      lg="$pdir/logs/agent.log"
      [ -f "$lg" ] || continue
      # 尾扫最近 200 行内取最后真实调用（tail 有界＝O(1) 级开销；全量 grep 在 5.9G 大档上不可取）
      ts=$(grep 'API call #' "$lg" 2>/dev/null | tail -200 | tail -1 | grep -oE '^20[0-9-]+ [0-9:]+')
      [ -n "$ts" ] || continue
      ep=$(date -j -f '%Y-%m-%d %H:%M:%S' "$ts" +%s 2>/dev/null) || continue
      ago=$(( NOW - ep ))
      [ "$ago" -lt "$ACTIVE_WIN" ] && active=$((active+1))
      [ "$ago" -lt "$RECENT_WIN" ] && recent=$((recent+1))
      if [ "$ago" -lt 60 ]; then hum="${ago}s"; elif [ "$ago" -lt 3600 ]; then hum="$((ago/60))m"; else hum="$((ago/3600))h"; fi
      # 取该域最负的 last（即最近一次）
      if [ "$last_ago" = "—" ] || [ "${ago:-999999}" -lt "${last_ago_n:-999999}" ]; then last_ago_n=$ago; last_ago=$hum; fi
    done
  done
  sat=0; [ "$staffed" -gt 0 ] && sat=$(( active * 100 / staffed ))
  total_staffed=$((total_staffed+staffed)); total_active=$((total_active+active))
  rows="${rows}$(emit_row "$dom" "$staffed" "$active" "$recent" "$last_ago" "$sat")
"
done
total_sat=0; [ "$total_staffed" -gt 0 ] && total_sat=$(( total_active * 100 / total_staffed ))
idle=$(( total_staffed - total_active ))
if [ "$JSON" = 1 ]; then
  printf '%s' "$rows" | sed '$ s/,$//'
  printf '],"fleet":{"staffed":%s,"active":%s,"saturationPct":%s,"idleCapacity":%s}}\n' "$total_staffed" "$total_active" "$total_sat" "$idle"
else
  echo "—— 舰队（在编=$total_staffed 活跃=$total_active 饱和=${total_sat}% 闲置容量=$idle 工位）——"
  printf '%s' "$rows"
fi

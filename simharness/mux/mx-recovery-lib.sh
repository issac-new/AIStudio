#!/bin/bash
# mx-recovery-lib.sh — 恢复层让位判定纯函数（2026-11-02 机制治理批·方案 A v1）
#
# 为什么有它：run25 实测的打架环（见 docs/design/mechanism-map.md §3）——
#   上游掐流 → 回合内梯子耗尽 → 网关进 auto-recovery 循环（23 次）
#            → 回合死 → 监督器见驱动缺席 → 重启驱动 → 撞闸门熔断 → 退出
#            → 熔断催办 → 抢占 agent 回合 → 更慢 → 再重启
# 缺的不是更多恢复，是「谁先谁后」。v1 只做一件事：**网关正在恢复时，监督器让位**
# （延迟重启，上限有限、fail-open）——把上面那条正反馈的第一次回环掐断。
#
# v2（挂账，见机制地图 §5）：vendor 侧 recovery_coordinator claim（722/725 主动登记
# 层级），需烧机验证后另行落地。本库只做 v1，无副作用、无网络、可行为测试。

# mx_gateway_recovering <gateway.log> <now-epoch> <window-sec>
#   返回 0=窗口内存在「网关正在恢复」信号（应让位）；1=无信号（可正常重启）
#   信号集只取真正的恢复态标记（不含普通 attempt 2/3——那是常态噪声）：
#     - "auto-recovery cycle"         : 网关供应商恢复循环（722 之上第二层）
#     - "chat turn recovered"         : 回合间恢复已生效（725 层）
#     - "chat turn recovery skipped"  : 回合间恢复尝试过（说明回合刚死）
mx_gateway_recovering() {
  local log="${1:-}" now="${2:-}" win="${3:-300}"
  [ -n "$log" ] && [ -f "$log" ] || return 1
  [ -n "$now" ] || now="$(date +%s)"
  local last_ts
  last_ts="$(grep -aE 'auto-recovery cycle|chat turn recovered|chat turn recovery skipped' "$log" 2>/dev/null \
    | tail -1 \
    | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}' \
    | head -1)"
  [ -n "$last_ts" ] || return 1
  local ts
  ts="$(date -j -f '%Y-%m-%d %H:%M:%S' "$last_ts" +%s 2>/dev/null || python3 -I -c '
import sys, time
print(int(time.mktime(time.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S"))))' "$last_ts" 2>/dev/null)"
  [ -n "$ts" ] || return 1
  [ $(( now - ts )) -le "$win" ] && return 0 || return 1
}

# mx_defer_restart_policy <recovering-rc> <deferred-sec-so-far> <max-defer-sec>
#   纯决策：0=继续让位（等）；1=放弃让位，立即重启（fail-open，永不无限等）
mx_defer_restart_policy() {
  local recovering="${1:-1}" deferred="${2:-0}" cap="${3:-300}"
  [ "$recovering" -eq 0 ] || return 1
  [ "$deferred" -lt "$cap" ] && return 0 || return 1
}

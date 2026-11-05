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

# mx_fail_fingerprint <text> → 失败指纹（12 位哈希）；无实质失败行时输出空串
# 纯函数：run25 空指纹误判（grep 空输出→shasum 空串哈希 da39a3ee→5 轮误判确定性
# 失败自退）的判定核心，行为测试直调。
# 时间戳归一化（run27 实锤根治）：FAIL 行含时刻（[mux FAIL 20:29:27] …），不剥则
# 每轮指纹互异→supervisor 同指纹硬停（5 次）永不触发——G4 楔子 23+ 次秒败监督器
# 无限刷单 1h+。哈希前剥行内 HH:MM:SS，语义文本（闸名/原因）保持指纹主体。
mx_fail_fingerprint() {
  local txt="${1:-}"
  [[ -n "$txt" ]] || { printf ''; return 0; }
  printf '%s' "$txt" | sed -E 's/[0-2][0-9]:[0-5][0-9]:[0-5][0-9]//g' | shasum | cut -c1-12
}

# mx_run_with_heartbeat <logfile> <silence-sec> <interval-sec> <cmd...> → 驱动 rc
# 静默心跳（run27 实锤根治：网关停摆窗 SEND-FAILED 后驱动 19 分钟 0% CPU 睡死，判词
# 已落卡无人消费，监督器同步 wait 干等）。后台 spawn 命令并监控其日志 size：连续
# silence-sec 零增长＝楔死形态（驱动一切健康活动都写日志：等待环 tick/催办/判词读
# note），精确 kill 断点续跑接力。cmd 必须 exec 成驱动真身（调用方保证），pid 即真身。
# silence-sec=0 关闭检测。ISSUE 记单走 env MX_ISSUES_LOG（由监督器设置）。
mx_run_with_heartbeat() {
  local _log="$1" _sil="${2:-900}" _iv="${3:-120}"; shift 3
  local _base _cur _silent=0 _pid _rc=0
  # size 自备回退：本库被独立 source（不经 mx-lib）时 mxp_file_size 缺席
  _hb_sz() { mxp_file_size "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0; }
  _base=$(_hb_sz "$_log")
  "$@" >> "$_log" 2>&1 &
  _pid=$!
  while kill -0 "$_pid" 2>/dev/null; do
    sleep "$_iv"
    kill -0 "$_pid" 2>/dev/null || break
    _cur=$(_hb_sz "$_log")
    if (( _cur > _base )); then
      _base=$_cur; _silent=0
    else
      _silent=$((_silent + _iv))
      if (( _sil > 0 && _silent >= _sil )); then
        echo "ISSUE|driver-silent-kill|supervisor|驱动日志 ${_silent}s 零增长（阈值 ${_sil}s）＝楔死形态（run27 实锤：SEND-FAILED 后 19 分钟 0% CPU 睡死、判词已落卡无人消费）——精确 kill pid=${_pid}，30s 断点续跑接力" \
          >> "${MX_ISSUES_LOG:-/tmp/driver-silent-kill.log}" 2>/dev/null || true
        kill -TERM "$_pid" 2>/dev/null || true
        break
      fi
    fi
  done
  wait "$_pid" 2>/dev/null; _rc=$?
  return "$_rc"
}

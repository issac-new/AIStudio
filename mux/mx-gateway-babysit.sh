#!/bin/bash
# mx-gateway-babysit.sh — sim gateway 保姆（加固版）
#
# 前身为并行会话的 /tmp/gateway-babysit.sh 临时脚本。V4-run1 00:36-00:38 实录：
# 健康检查 3s 超时在高负载（loadavg>200）下对启动中的 gateway 误判 down →
# 每 10s 重复拉起 → 新实例撞 singleton 守卫自杀（"Another gateway instance
# started during our startup"）→ 健康仍不上 → 2 分钟 12 连拉空转；
# 且 `( … & )` 子壳包摄导致 $! 为空，pidfile 只写入一个换行符（形同虚设）。
# 本版四重加固：
#   1) 存活判定走 gateway-locks/host-gateway.json 权威锁（gateway 自登记 pid），
#      进程活着且年龄 < GRACE 秒视为"启动中"，不重拉（pgrep 匹配不到 env，勿用）
#   2) 连续失败阈值：健康检查须连续 FAIL_NEED 次失败才判 down（防瞬时抖动）
#   3) 单实例：flock 排他锁，双保姆互斥（run1 曾双保姆并行加剧竞拉）
#   4) 拉起后休眠宽窗口，给启动留足时间再进入下一轮检查；pid 从锁 JSON 回收
#
# 用法：bash mx-gateway-babysit.sh  （前台常驻；nohup 由调用方决定）
set -uo pipefail

SIM_ROOT="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8801/health}"
GRACE="${GRACE:-120}"        # 启动宽限秒数（高负载机器上冷启动可超 60s）
FAIL_NEED="${FAIL_NEED:-3}"  # 连续失败阈值
CHECK_INTERVAL="${CHECK_INTERVAL:-10}"
LOG="$SIM_ROOT/logs/gateway-babysit.log"
LOCK_JSON="$SIM_ROOT/gateway-locks/host-gateway.json"
LOCK_DIR="$SIM_ROOT/gateway-locks/babysit.lock.d"
HERMES_BIN="${HERMES_BIN:-/Users/cuishi/.hermes/hermes-agent/venv/bin/hermes}"

mkdir -p "$SIM_ROOT/logs" "$SIM_ROOT/gateway-locks" "$SIM_ROOT/pids"

# 单实例锁：mkdir 原子锁（macOS 无 flock——flock 127 会让旧版 `! flock` 恒真、
# 保姆启动即误判互斥成功退出，同 aipay-scenario.sh 单驱动锁语义）。陈锁检测：
# info 里 pid 已死则接管；持锁者活着即大声退出（不静默，与旧版假绿日志区分）。
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  _lock_pid=$(sed -n 's/^pid=//p' "$LOCK_DIR/info" 2>/dev/null | head -1 | awk '{print $1}')
  if [[ "$_lock_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$_lock_pid" 2>/dev/null; then
    echo "[$(date '+%F %T')] stale babysit lock (pid $_lock_pid dead) — taking over" >> "$LOG"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" 2>/dev/null || { echo "[$(date '+%F %T')] lock takeover race lost — exiting" >> "$LOG"; exit 0; }
  else
    # ${LOCK_DIR} 必须带花括号：macOS bash 3.2 把 $VAR 后紧邻的全角字符首字节吸进变量名（set -u 下 unbound 崩）
    echo "[$(date '+%F %T')] another babysitter holds ${LOCK_DIR} (pid ${_lock_pid:-unknown}) — exiting（确认无保姆在跑可 rm -rf ${LOCK_DIR}）" >> "$LOG"
    exit 0
  fi
fi
echo "pid=$$ start=$(date '+%F %T')" > "$LOCK_DIR/info"
trap 'rm -rf "$LOCK_DIR"' EXIT
trap 'rm -rf "$LOCK_DIR"; exit 0' INT TERM

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# 权威锁登记的 "<pid> <age_s>"（age 取锁 JSON 的 createTime——macOS ps 无 etimes，
# etime 需再解析；锁自登记时间戳是唯一不跨平台扯皮的来源）。不存活/无登记返回非零
gateway_pid_age() {
  [[ -f "$LOCK_JSON" ]] || return 1
  python3 - "$LOCK_JSON" <<'EOF'
import json, os, sys, time
try:
    d = json.load(open(sys.argv[1]))
    pid = int(d.get("pid") or 0)
    os.kill(pid, 0)  # 存活性
    age = int(time.time() - float(d.get("createTime") or 0))
    print(pid, age)
except Exception:
    sys.exit(1)
EOF
}

fails=0
while true; do
  if curl -sf "$HEALTH_URL" -m 5 >/dev/null 2>&1; then
    fails=0
    sleep "$CHECK_INTERVAL"
    continue
  fi

  # 健康未达：先看是不是"启动中"（锁登记进程活着且在宽限内）
  pa="$(gateway_pid_age || true)"
  if [[ -n "$pa" ]]; then
    age="${pa##* }"
    if [[ "$age" =~ ^[0-9]+$ ]] && (( age < GRACE )); then
      log "gateway starting (pid ${pa%% *}, age ${age}s < ${GRACE}s grace) — waiting"
      fails=0
      sleep "$CHECK_INTERVAL"
      continue
    fi
  fi

  fails=$((fails + 1))
  if (( fails < FAIL_NEED )); then
    log "health check failed ${fails}/${FAIL_NEED} — waiting before relaunch decision"
    sleep "$CHECK_INTERVAL"
    continue
  fi

  log "gateway down (health x${FAIL_NEED} consecutive failures), relaunching"
  cd "$SIM_ROOT" || exit 1
  PYTHONPATH="$SIM_ROOT/hermes/hermes-agent" HERMES_SKIP_UPDATE=1 \
  HERMES_HOME="$SIM_ROOT/hermes" \
  HERMES_GATEWAY_LOCK_DIR="$SIM_ROOT/gateway-locks" \
    nohup "$HERMES_BIN" gateway run >> "$SIM_ROOT/logs/gateway.log" 2>&1 &
  echo $! > "$SIM_ROOT/pids/gateway.pid"   # 裸 & 直接取 $!（旧版子壳包摄写空行之坑）
  fails=0
  sleep "$GRACE"  # 拉起后宽窗口：下一轮检查时进程年龄仍在宽限内，双保险
done

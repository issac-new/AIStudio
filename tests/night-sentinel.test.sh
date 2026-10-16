#!/bin/bash
# night-sentinel.test.sh — 夜间守望守护行为守门（run19 凌晨僵局根治件配套）
# 三场景（违一即 FAIL）：
#   ①派发自愈：ready 卡滞留 N 轮无人孵化 → 触发 CLI 直派（spawned 有果则清零+发通知）
#   ②休眠唤醒：running 卡 assignee 真做静默超阈 → 催办（@ 该 assignee、带卡号）
#   ③report_done 落键即退（不进下一轮）
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

# 提取主循环体（去掉 shebang/set/头部常量与函数定义后的 while 循环）——直接提取整脚本
# 的 while 块；测试 stub 掉全部外部函数后 eval。
BODY="$(sed -n '/^_stuck=0/,/^done$/p' "$HERE/mux/mx-night-sentinel.sh")"
[[ -n "$BODY" ]] || { echo "FAIL 提取主循环失败"; exit 1; }

CTRL="$(mktemp -d /tmp/night-sentinel.XXXXXX)" || exit 1
trap 'kill ${BG:-0} 2>/dev/null; rm -rf "$CTRL"' EXIT
mkdir -p "$CTRL/hermes/profiles/aa/logs" "$CTRL/hermes/profiles/bb/logs" "$CTRL/var" "$CTRL/runs/r1" "$CTRL/logs"
touch "$CTRL/hermes/profiles/aa/logs/agent.log" "$CTRL/hermes/profiles/bb/logs/agent.log"
echo "report_pending" > /dev/null

# ── stub 外部面 ──
export SIM_ROOT="$CTRL" RUN_ID="r1" HERMES_ROOT="$CTRL/hermes" \
  MX_NS_INTERVAL=1 MX_NS_STUCK_ROUNDS=2 MX_NS_SLEEP_SEC=5 SCAN_ROOM="!room:x"
STATE="$CTRL/runs/r1/state.env"; STOPF="$CTRL/var/r1-night-sentinel.stop"; LOG="$CTRL/logs/night-sentinel.log"
IVAL=1; STUCK_ROUNDS=2; SLEEP_SEC=5; _last_ready_n=-1; _rounds=0; RUNNING_CACHE=0
HERMES="/bin/true"
log() { printf '[ns %s] %s\n' "$(date '+%m-%d %H:%M:%S')" "$*" >> "$LOG"; }
_realwork_ts() { cat "$CTRL/rw-$1" 2>/dev/null || echo 0; }
_msend() { printf 'MS|MENTION=%s|TEXT=%s\n' "$2" "$1" >> "$CTRL/sent.log"; }
_kanban_json() {
  case "$1" in
    ready) cat "$CTRL/ready.json" 2>/dev/null || echo '[]';;
    running) cat "$CTRL/running.json" 2>/dev/null || echo '[]';;
  esac
}
# dispatch stub：记录调用；按调度返回 spawned
dispatch_calls=0

# ── ① 派发自愈 ──
echo '[{"id":"t1","assignee":"aa","title":"D1"},{"id":"t2","assignee":"bb","title":"D2"}]' > "$CTRL/ready.json"
echo '[]' > "$CTRL/running.json"
: > "$LOG"; : > "$CTRL/sent.log"
dispatch_calls=0
_dispatch_impl() {
  dispatch_calls=$((dispatch_calls+1))
  echo "{\"spawned\":[{\"task_id\":\"t1\"},{\"task_id\":\"t2\"}],\"crashed\":[]}"
}
# 临时替换 HERMES 调用：主循环里 timeout 120 "$HERMES" kanban dispatch —— stub 一个可执行
mkdir -p "$CTRL/bin"; printf '#!/bin/bash\ncase "$2" in dispatch) %s;; esac\n' '_dispatch_impl' > /dev/null
HERMES="$CTRL/bin/hermes"
cat > "$HERMES" <<'STUBEOF'
#!/bin/bash
if [[ "$1" == "kanban" && "$2" == "dispatch" ]]; then
  echo '{"spawned":[{"task_id":"t1"},{"task_id":"t2"}]}'
else
  echo '{}'
fi
STUBEOF
chmod +x "$HERMES"
eval "$BODY" & BG=$!
# 冷启动余量（2026-10-16 竞态根治）：首轮轮询 1s + 首次 `timeout 120 <hermes>` 冷启
# ~2.7s（实测 run1 1.75-2.75s，热后 70ms）=3.7s 贴原 sleep 4 边界，负载高即被 kill
# 在「直派结果」落盘前假红。8s 留足余量，行为判据不变。
sleep 8; kill $BG 2>/dev/null; wait $BG 2>/dev/null; BG=
if grep -q "派发自愈" "$LOG" && grep -q "直派结果：spawned=t1,t2" "$LOG" && grep -q "派发通道自愈" "$CTRL/sent.log"; then
  echo "PASS ① 派发自愈触发+结果记录+群通知"
else echo "FAIL ① log=$(tail -4 "$LOG" | tr '\n' ';')"; fails=1; fi

# ── ② 休眠唤醒 ──
NOW=$(date +%s)
echo '[]' > "$CTRL/ready.json"
echo '[{"id":"t9","assignee":"aa","title":"X"}]' > "$CTRL/running.json"
echo $((NOW - 9999)) > "$CTRL/rw-aa"
: > "$LOG"; : > "$CTRL/sent.log"
eval "$BODY" & BG=$!
sleep 3; kill $BG 2>/dev/null; wait $BG 2>/dev/null; BG=
if grep -q "休眠唤醒：aa" "$LOG" && grep -qE "MENTION=@aa-agent.*t9" "$CTRL/sent.log" && grep -q "仅回话不动手" "$CTRL/sent.log"; then
  echo "PASS ② 休眠催办（@aa、带卡号、真做判词语义）"
else echo "FAIL ② log=$(tail -3 "$LOG"|tr '\n' ';') sent=$(cat "$CTRL/sent.log" 2>/dev/null)"; fails=1; fi

# ── ③ report_done 即退 ──
echo 'report_done=123' > "$STATE"
: > "$LOG"
eval "$BODY" & BG=$!
sleep 2; kill $BG 2>/dev/null; wait $BG 2>/dev/null; BG=
if grep -q "功成身退" "$LOG"; then
  echo "PASS ③ report_done 落键即退"
else echo "FAIL ③ log=$(cat "$LOG")"; fails=1; fi

(( fails == 0 )) && echo "ALL-PASS" || { echo "HAS-FAIL"; exit 1; }

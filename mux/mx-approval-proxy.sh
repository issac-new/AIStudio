#!/bin/bash
# mx-approval-proxy.sh — 独立审批环（常驻件，run16 22:1x 审批饿死事故固化为产品化脚本）
#
# 事故形态（run16 实证）：审批臂内嵌驱动（run14 已知「停驱=停审批」），G5 熔断后
# 驱动退出、监督器进证据等待不拉驱动——修复链 agent 的 execute_code/terminal 待批令
# 5 分钟无人应答即被拒执行（fanfan/qi 两笔实锤），修复链在权限门口饿死。
#
# 本环以导演身份在窗口内代批（纪律 36 代批类）：30s 轮询分析群「needs your OK」
# 待批令（仅 -agent 发件人），线程内回 !approve。生命周期：report_done 落键或
# --ttl 分钟（缺省 180）后自动退场。每笔代批落 $SIM_ROOT/var/approval-proxy.log
# （不进 issues.log 防刷单；启动/退场一行 DISP 由调用方记）。
#
# 用法：nohup bash mux/mx-approval-proxy.sh --run <RUN_ID> [--ttl 180] \
#         > /dev/null 2>&1 &
# 起动时机：随监督器同刻（run16 后接线位=run-driver-supervisor.sh 拉起；接线前由
# 开跑流程/prelaunch 提示手动起）。
set -u
LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$HERE/mux/mx-lib.sh" 2>/dev/null
RUN_ID=""; TTL=180
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --ttl) TTL="${2:-180}"; shift 2 ;;
    *) shift ;;
  esac
done
[[ -n "$RUN_ID" ]] || { echo "need --run <RUN_ID>" >&2; exit 2; }
RID=$(grep '^room_analysis=' "$SIM_ROOT/runs/$RUN_ID/state.env" 2>/dev/null | cut -d= -f2)
[[ -n "$RID" ]] || { echo "room_analysis 不在 state（轮未建群？）" >&2; exit 2; }
TOK=$(head -1 "$CREDS_DIR/fanfan.token" 2>/dev/null)
LOG="$SIM_ROOT/var/approval-proxy.log"
# 代偿台账接线（2026-10-15 治理轮批次一）：每笔代批落账（auto-approve → PR-2）
_mx_led_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$_mx_led_dir/mx-compensation-ledger.sh" 2>/dev/null || true
unset _mx_led_dir
_approved_seen=$(grep -c ' 代批 ' "$LOG" 2>/dev/null); _approved_seen=${_approved_seen:-0}
# 判据化策略（V8.29 §2.4 审批模拟面）：strict 姿态=判据模式（只放行只读安全操作，
# 其余缓批留痕不代批——PR-2 根治前的诚实形态）；standard/demo=代批+台账（用户裁定
# 2026-10-15：standard 代偿保留至根治合入产品能力）。
_axp_posture() {
  local p="${MX_POSTURE:-$(grep -s '^posture=' "$SIM_ROOT/runs/$RUN_ID/state.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  case "$p" in strict) echo "strict" ;; *) echo "standard" ;; esac
}
POLICY="${MX_PROXY_POLICY:-$([ "$(_axp_posture)" = "strict" ] && echo criteria || echo approve)}"
DEADLINE=$(( $(date +%s) + TTL * 60 ))
LAST_TS=$(( $(date +%s) - 120 ))
echo "$(date '+%F %T') [approval-proxy] 启动 run=$RUN_ID（窗口 ${TTL}min）" >> "$LOG"
while :; do
  if grep -q '^report_done=' "$SIM_ROOT/runs/$RUN_ID/state.env" 2>/dev/null; then
    echo "$(date '+%F %T') [approval-proxy] report_done 在案，退场" >> "$LOG"; exit 0
  fi
  if [[ "$(date +%s)" -ge "$DEADLINE" ]]; then
    echo "$(date '+%F %T') [approval-proxy] 窗口到期，退场" >> "$LOG"; exit 0
  fi
  curl -s -m 10 "http://127.0.0.1:8008/_matrix/client/v3/rooms/$RID/messages?access_token=$TOK&dir=b&limit=40" 2>/dev/null \
  | LAST_TS="$LAST_TS" RID="$RID" TOK="$TOK" LOG="$LOG" POLICY="$POLICY" python3 -c '
import json,sys,time,os,re,urllib.request
rid=os.environ["RID"]; tok=os.environ["TOK"]; log=os.environ["LOG"]; last=int(os.environ["LAST_TS"])
policy=os.environ.get("POLICY","approve")
# 判据模式的安全面：只读/无害操作白名单（写库/部署/网络外发一律缓批）
SAFE=re.compile(r"\b(git (status|log|diff|show|branch)|ls|cat |head |tail |grep |wc |find |pwd|pytest --collect-only|python3 -c .print)\b")
try: chunk=json.load(sys.stdin).get("chunk",[])
except Exception: sys.exit(0)
asks=[(m["event_id"],m["content"].get("body","")[:60]) for m in chunk
      if m.get("origin_server_ts",0)//1000>last
      and "needs your OK" in m["content"].get("body","")
      and m.get("sender","").endswith("-agent:matrix.test")]
for ev,head in asks:
    if policy=="criteria" and not SAFE.search(head):
        open(log,"a").write(time.strftime("%F %T")+" 缓批 "+ev[:24]+" "+head.replace(chr(10)," ")[:60]+"（判据模式：非只读安全操作，不代批——PR-2 根治前诚实形态）\n")
        continue
    payload=json.dumps({"msgtype":"m.text","body":"!approve（导演代批·approval-proxy：驱动缺席期审批臂补位，纪律 36）",
                        "m.relates_to":{"m.in_reply_to":{"event_id":ev}}}).encode()
    req=urllib.request.Request(f"http://127.0.0.1:8008/_matrix/client/v3/rooms/{rid}/send/m.room.message?access_token={tok}",
                               data=payload,headers={"Content-Type":"application/json"})
    try:
        urllib.request.urlopen(req,timeout=10)
        open(log,"a").write(time.strftime("%F %T")+" 代批 "+ev[:24]+" "+head.replace(chr(10)," ")[:60]+"\n")
    except Exception as e:
        open(log,"a").write(time.strftime("%F %T")+" 代批失败 "+ev[:24]+" "+str(e)[:60]+"\n")
' 2>/dev/null
  LAST_TS=$(( $(date +%s) - 5 ))
  _approved_now=$(grep -c ' 代批 ' "$LOG" 2>/dev/null); _approved_now=${_approved_now:-0}
  if (( _approved_now > _approved_seen )); then
    tail -n $(( _approved_now - _approved_seen )) "$LOG" 2>/dev/null | while IFS= read -r _l; do
      compensate auto-approve "approval-proxy 代批：${_l##* 代批 }" 2>/dev/null || true
    done
    _approved_seen=$_approved_now
  fi
  sleep 30
done

#!/bin/bash
# node-heartbeat.test.sh — 三机心跳判活补强层守门（2026-10-12 补强层）
# 夹具树隔离（AIPAY_SIM_ROOT 覆盖，不碰真实 SIM 根）验证五件事：
#   ①单一定义点：判活三函数只在 mx-hb.sh 定义，mx-scenario-lib 引用不自带副本；
#   ②采样正确：夹具 agent.log → hb_agent_sample（工作行时间戳/尾部错误态）与
#     hb_node_payload（MXHB| 前缀 + jq 可解析 + 档案集=node_users 切片）；
#   ③导演侧查询：hb-cache 夹具 → lw/stall/hb_ok 新鲜度判定；过期=不可用；
#   ④等待环接线：wait_alive_truth/multi 含 hb 降级链（hb_is_remote/hb_all_ok/降级硬窗）；
#   ⑤dry-run 无网络出载荷（MX_HB_ROOM 未配亦可）。
set -euo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # mux/
FX="$(mktemp -d /tmp/hb-fixture-XXXXXX)"
trap 'rm -rf "$FX"' EXIT

export AIPAY_SIM_ROOT="$FX"
mkdir -p "$FX/var"
export MX_NODE=node-b MX_NODE_USERS=hu,xiao MX_ROLE=agent
# shellcheck source=/dev/null
source "$HERE/mx-lib.sh"    # 解析 SIM_ROOT（env 优先）+ 自带 mx-platform/mx-node
source "$HERE/mx-hb.sh"

fails=0
ok()   { echo "  ok  $1"; }
bad()  { echo "  FAIL $1"; fails=$((fails+1)); }

# ── ① 单一定义点 ────────────────────────────────────────
if ! grep -q '^source "${MX_SCRIPT_DIR}/mx-hb.sh"' "$HERE/mx-scenario-lib.sh"; then
  bad "mx-scenario-lib 未引用 mx-hb.sh"
else
  if grep -qE '^_agent_log_last_work_ts\(\)' "$HERE/mx-scenario-lib.sh"; then
    bad "mx-scenario-lib 仍自带判活函数副本（违反单一定义点）"
  else
    ok "判活三函数单一定义点在 mx-hb.sh，scenario-lib 引用"
  fi
fi

# ── ② 采样正确 ─────────────────────────────────────────
LWHU="$HERMES_ROOT/profiles/hu/logs/agent.log"
LWXI="$HERMES_ROOT/profiles/xiao/logs/agent.log"
mkdir -p "$(dirname "$LWHU")" "$(dirname "$LWXI")"
printf '2026-10-12 08:00:00 adapter noise line\n2026-10-12 10:11:12 API call deepseek chat\n' > "$LWHU"
printf '2026-10-12 09:00:00 Turn started\n2026-10-12 09:05:00 ERROR timeout hindsight prefetch\n' > "$LWXI"

exp_lw=$("$MX_PYTHON" -c 'import datetime;print(int(datetime.datetime(2026,10,12,10,11,12).timestamp()))')
line=$(hb_agent_sample hu)
[[ "$line" == "lw=$exp_lw stall=0 sz="* ]] \
  && ok "hb_agent_sample hu（工作行时间戳+非错误尾）" || bad "hb_agent_sample hu 输出异常：$line（期望 lw=$exp_lw）"
line=$(hb_agent_sample xiao)
[[ "$line" == *"stall=1"* ]] && ok "hb_agent_sample xiao（尾部错误态=1）" || bad "hb_agent_sample xiao 应 stall=1：$line"
line=$(hb_agent_sample mei)
[[ "$line" == "lw=0 stall=0 sz=0" ]] && ok "缺位档案全 0 采样" || bad "缺位档案采样异常：$line"

payload=$(MX_NODE=node-b MX_NODE_USERS=hu,xiao hb_node_payload)
body="${payload#MXHB|}"
[[ "$payload" == MXHB\|* ]] && ok "载荷 MXHB| 前缀" || bad "载荷缺 MXHB| 前缀"
echo "$body" | jq -e --arg nb node-b '.node==$nb and .hb_ts>0 and (.agents|keys|sort)==["hu","xiao"] and .agents.hu.lw>0 and .agents.xiao.stall==1' >/dev/null \
  && ok "载荷 jq 可解析且档案集=切片" || bad "载荷解析失败：$body"

# ── ③ 导演侧查询 ────────────────────────────────────────
now=$(date +%s)
cat > "$FX/var/hb-cache.json" <<EOF
{"fetched_ts":$now,"agents":{"hu":{"lw":$((now-60)),"stall":0,"sz":100,"ts":$((now-30)),"node":"node-b"},
"xiao":{"lw":$((now-3600)),"stall":1,"sz":200,"ts":$((now-3600)),"node":"node-b"}}}
EOF
[[ "$(hb_agent_lw hu)" -gt 0 ]] && ok "hb_agent_lw 取缓存值" || bad "hb_agent_lw 异常：$(hb_agent_lw hu)"
hb_agent_stalled xiao && ok "hb_agent_stalled xiao=1" || bad "hb_agent_stalled xiao 应为 1"
hb_ok hu && ok "hb_ok hu（ts 新鲜）" || bad "hb_ok hu 应在效"
if hb_ok xiao; then bad "hb_ok xiao 应过期（ts=1h 前）"; else ok "hb_ok xiao 过期判定正确"; fi
hb_all_ok hu xiao && bad "hb_all_ok 应整体不可用" || ok "hb_all_ok 任一过期即不可用"

# ── ④ 等待环接线锚 ──────────────────────────────────────
SL="$HERE/mx-scenario-lib.sh"
for anchor in 'hb_is_remote' 'hb_all_ok' '心跳不可达' '降级.*硬窗' 'hb_any_stalled'; do
  grep -qE "$anchor" "$SL" && ok "scenario-lib 含接线锚：$anchor" || bad "scenario-lib 缺接线锚：$anchor"
done
grep -c 'hb_refresh_cache' "$SL" | grep -qE '^[4-9]$' \
  && ok "两等待环入口+循环共 ≥4 处刷新点" || bad "hb_refresh_cache 接线数异常：$(grep -c 'hb_refresh_cache' "$SL")"

# ── ⑤ dry-run 无网络出载荷 ──────────────────────────────
unset MX_HB_ROOM
dry=$(bash "$HERE/mx-node-heartbeat.sh" --dry-run | head -1)
[[ "$dry" == MXHB\|* ]] && ok "dry-run 无 MX_HB_ROOM 出载荷" || bad "dry-run 异常：$dry"
if bash "$HERE/mx-node-heartbeat.sh" --once >/dev/null 2>&1; then bad "--once 无房间应退出 1"; else ok "--once 无房间拒跑"; fi

# ── 收口 ────────────────────────────────────────────────
if (( fails > 0 )); then echo "node-heartbeat: ${fails} FAIL"; exit 1; fi
echo "node-heartbeat: all ok"

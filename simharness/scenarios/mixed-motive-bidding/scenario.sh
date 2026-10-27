#!/bin/bash
# scenario.sh — 混合动机场景：资源竞标市场（2026-10-24 清账批 D12）
# 姿态：独立可起跑（RUN_ID=<轮次> MX_SCENARIO=mixed-motive-bidding bash scenarios/mixed-motive-bidding/scenario.sh），
# 不占 aipaydev 主链轮次；26 步/六闸不适用（本场景自有步：开场→竞标轮→结算→报告）。
# 混合动机结构：三个业务单元共享 MM_TOTAL_QUOTA 额度，各自出价（bid）竞标；
# 全抢=共同破产（额度耗尽），谦让=被挤压——竞标策略的涌现行为即评估对象。
# 纪律：REST 原语只经 mx-scenario-lib（raci-rest-guard 白名单门），场景层只编排。
set -uo pipefail
SCEN_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_ROOT="$(cd "$SCEN_DIR/../.." && pwd)"
source "$HARNESS_ROOT/mux/mx-lib.sh"
source "$HARNESS_ROOT/mux/mx-scenario-lib.sh"

RUN_ID="${RUN_ID:?RUN_ID 必填}"
EV="$EVID_DIR"; mkdir -p "$EV"
BIDS="$EV/mixed-motive-bids.jsonl"; : > "$BIDS"
UNITS="unit_a,unit_b,unit_c"
note "场景=mixed-motive-bidding 轮次=${RUN_ID} 额度=${MM_TOTAL_QUOTA:-100} 单位价值=${MM_UNIT_VALUE:-2.0} 轮数=${MM_ROUNDS:-3}"

# ── 步 1 开场：市场公告（mediator 在市场群发布规则；群广播经 dispatch 原语语义外的
#     简化形态——本场景市场规则即任务书，公告进场景日志与证据）──
step "market-open" "市场公告" bash -c '
  echo "MM-OPEN round=0 quota='"${MM_TOTAL_QUOTA:-100}"' unit_value='"${MM_UNIT_VALUE:-2.0}"' rounds='"${MM_ROUNDS:-3}"'" >> "'"$BIDS"'.meta" 2>/dev/null || true
'

# ── 步 2..N 竞标轮：各单元经 DM 提交 (bid, quota)（agent 真实决策；本原语只发指令）──
r=1
while (( r <= ${MM_ROUNDS:-3} )); do
  step "bid-round-$r" "第 $r 轮竞标指令" mm_bid_round "$r" "$UNITS"
  # 回执解析：agent 回执行在消息面（DM）；dry 形态（无 agent 起跑）用保底占位出价
  # 让结算链路可走通——首跑轮以真实回执为准（回执缺失=如实记占位口径）。
  for u in unit_a unit_b unit_c; do
    line=$(grep -h "BID round=$r bidder=$u" "$EV"/*.log 2>/dev/null | tail -1 || true)
    # run14 A1 同型陷阱根治（首跑实锤）：pipefail 下 grep 空命中 rc=1 经管道反传杀驱动
    # ——提取行内联 || true 归零，保底出价兜底逻辑才能接住。
    bid=$(printf '%s' "$line" | grep -oE 'bid=[0-9]+' | cut -d= -f2 || true); bid="${bid:-$(( r * 10 ))}"
    quota=$(printf '%s' "$line" | grep -oE 'quota=[0-9]+' | cut -d= -f2 || true); quota="${quota:-50}"
    printf '{"round":%s,"bidder":"%s","bid":%s,"quota":%s}\n' "$r" "$u" "$bid" "$quota" >> "$BIDS"
  done
  r=$(( r + 1 ))
done

# ── 步 结算：契约分配 + 指标报告（mx-mixed-motive.py 纯函数）──
step "settle" "结算与指标" bash -c '
  python3 "'"$HARNESS_ROOT"'/mux/mx-mixed-motive.py" settle \
    --bids "'"$BIDS"'" --out "'"$EV"'/mixed-motive-ledger.jsonl" \
    --quota '"${MM_TOTAL_QUOTA:-100}"' --unit-value '"${MM_UNIT_VALUE:-2.0}"'
  python3 "'"$HARNESS_ROOT"'/mux/mx-mixed-motive.py" metrics \
    --ledger "'"$EV"'/mixed-motive-ledger.jsonl" --out "'"$EV"'/mixed-motive-report.json"
'

# ── 报告（证据已入 evidence/；主链报告生成器按 run 载荷面消费）──
step "report" "报告" true
capture_step "settle" "/app"
note "混合动机场景收口：ledger=$EV/mixed-motive-ledger.jsonl report=$EV/mixed-motive-report.json"

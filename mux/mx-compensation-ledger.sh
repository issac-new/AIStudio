#!/bin/bash
# mx-compensation-ledger.sh — 代偿台账（2026-10-15 姿态治理轮，批次一）
#
# 定位：推演程序对运行体系的每一笔「代偿动作」（替 agent 兜行为短板 / 绕产品通道 /
# 代演把关）统一记账。台账是报告「代偿净额对账」的唯一数据源，也是下一轮开跑前
# 「代偿清偿门」（用户裁定 2026-10-15：代偿在下一轮推演前必须根治后合入 SwarmStudio
# 产品能力）的机械判据。
#
# 用法一（被 source，供驱动/哨兵/代批环调用）：
#   source mux/mx-compensation-ledger.sh
#   compensate <type> [detail...]     # 追加一笔 open 记录（失败静默，绝不打断推演）
# 用法二（独立 CLI）：
#   bash mx-compensation-ledger.sh --run <RUN_ID> list|summary|catalog
#   bash mx-compensation-ledger.sh --run <RUN_ID> resolve <id> <note>
#   bash mx-compensation-ledger.sh --run <RUN_ID> waive <id> <reason>
#   bash mx-compensation-ledger.sh --run <RUN_ID> check-clearance   # 开跑前清偿门：有 open 即非零
#
# 台账文件：$SIM_ROOT/runs/<RUN_ID>/evidence/compensation-ledger.tsv
# 列：id/ts/type/defect/detail/status/resolution（tab 分隔；detail 内 tab 净化为空格）
#
# 类型→产品缺陷登记表（defect 列；PR-* 编号对应 overlay 产品方案
# docs/superpowers/specs/2026-10-15-swarmstudio-resilience-and-humansim-design.md）：
#   nudge               催办（空转过半替主管轻推）                    → PR-3 agent 休眠
#   sleep-wakeup        休眠群唤醒（Turn ended 后群消息假活跃干预）    → PR-3 agent 休眠
#   gw-dispatch-bypass  绕网关 CLI 直派（派发器卡死旁路）             → PR-1 网关派发器
#   auto-approve        审批代批（无判据通批待批令）                  → PR-2 审批通道
#   card-backfill       补建卡（agent 拒收/漏登记后代建）             → PR-4 kanban 写路径
#   card-walk-done      代走 done（替 agent 按合法路径推卡到 done）   → PR-4 kanban 写路径
#   gate-replay         闸键回滚重放（撤键重走闸段）                  → PR-5 闸死锁处理
#   driver-merge        驱动代做集成合并（git 层工程活）              → PR-6 流水线面
#   dispatch-preset     预写派发词（拆分/人日/纪律由脚本而非组织产出）→ PR-7 自组织支撑
set -u
LC_ALL=C

# ── 环境解析（三处调用方约定：驱动=mx-lib 已设；哨兵/CLI 自理）──
_mx_led_sim_root() {
  if [ -n "${SIM_ROOT:-}" ]; then echo "$SIM_ROOT"
  elif [ -n "${AIPAY_SIM_ROOT:-}" ]; then echo "$AIPAY_SIM_ROOT"
  else echo "/Users/cuishi/lab/ncwk-sim-mux"; fi
}
_mx_led_run_id() {
  if [ -n "${RUN_ID:-}" ]; then echo "$RUN_ID"; return; fi
  local st="${STATE:-}"
  if [ -n "$st" ] && [ -f "$st" ]; then basename "$(dirname "$st")"; return; fi
  local root ln
  root="$(_mx_led_sim_root)"
  ln=$(readlink "$root/var/current-state.env" 2>/dev/null || true)
  [ -n "$ln" ] && basename "$(dirname "$ln")" || echo ""
}
_mx_led_file() {
  local rid root
  rid="$(_mx_led_run_id)"; root="$(_mx_led_sim_root)"
  [ -n "$rid" ] || return 1
  echo "$root/runs/$rid/evidence/compensation-ledger.tsv"
}

# 类型→缺陷映射（单一事实源；catalog 命令同源打印）
_mx_led_defect_of() {
  case "$1" in
    nudge|sleep-wakeup)                    echo "PR-3" ;;
    gw-dispatch-bypass)                    echo "PR-1" ;;
    auto-approve)                          echo "PR-2" ;;
    card-backfill|card-walk-done)          echo "PR-4" ;;
    gate-replay)                           echo "PR-5" ;;
    driver-merge)                          echo "PR-6" ;;
    dispatch-preset)                       echo "PR-7" ;;
    *)                                     echo "PR-0" ;;
  esac
}

# ── 记账函数（source 形态的主入口）──
# 设计约束：绝不因记账失败打断推演（内部全兜）；type 未登记仍记（defect=PR-0 待归类）。
compensate() { # compensate <type> [detail...]
  local type="${1:-unknown}"; shift || true
  local detail="${*:-}"
  local f ts id defect seq
  f="$(_mx_led_file 2>/dev/null)" || { echo "[ledger] SIM_ROOT/RUN_ID 未解析，弃记 type=$type" >&2; return 0; }
  mkdir -p "$(dirname "$f")" 2>/dev/null || return 0
  ts=$(date '+%F %T')
  # id 唯一性：epoch+pid 同秒同进程会撞号（同秒三笔把 resolve 扩散到全行的实测病根）
  # ——追加文件内序号（行数+1）保证文件内唯一；resolve 不重排，序号不回退。
  seq=$(( ($(wc -l 2>/dev/null < "$f" || echo 0) + 1) ))
  id="c$(date +%s)-${seq}$$"
  defect=$(_mx_led_defect_of "$type")
  detail=$(printf '%s' "$detail" | tr '\t\n' '  ')
  [ -f "$f" ] || printf 'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\n' >> "$f"
  printf '%s\t%s\t%s\t%s\t%s\topen\t\n' "$id" "$ts" "$type" "$defect" "$detail" >> "$f" 2>/dev/null || true
  return 0
}

# ── CLI（仅直接执行时生效；被 source 时静默）──
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  RUN_ID_ARG=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --run) RUN_ID_ARG="${2:-}"; shift 2 ;;
      *) break ;;
    esac
  done
  [ -n "$RUN_ID_ARG" ] && RUN_ID="$RUN_ID_ARG"
  CMD="${1:-summary}"; [ $# -gt 0 ] && shift || true
  # catalog 只打类型→缺陷映射，不依赖具体轮次（无需解析台账路径）
  F=""
  case "$CMD" in
    catalog) ;;
    *) F="$(_mx_led_file)" || { echo "need --run <RUN_ID>（或存在 var/current-state.env 锚）" >&2; exit 2; } ;;
  esac

  case "$CMD" in
    list)
      ST="${1:-all}"
      if [ "$ST" = "all" ]; then cat "$F" 2>/dev/null || echo "(空台账)"
      else awk -F'\t' -v st="$ST" 'NR==1 || $6==st' "$F" 2>/dev/null || echo "(空台账)"; fi
      ;;
    summary)
      if [ ! -f "$F" ]; then echo "0 笔（台账未建）"; exit 0; fi
      awk -F'\t' 'NR>1 { tot[$3]++; if ($6=="open") op[$3]++ } END {
        n=0; o=0; for (t in tot) { n+=tot[t]; o+=op[t]+0 }
        printf "总计 %d 笔，open %d 笔\n", n, o
        for (t in tot) printf "  %-20s %3d 笔（open %d）\n", t, tot[t], op[t]+0 }' "$F"
      ;;
    catalog)
      echo "类型 → 产品缺陷（清偿门对照 overlay 产品方案 PR 编号）"
      for t in nudge sleep-wakeup gw-dispatch-bypass auto-approve card-backfill card-walk-done gate-replay driver-merge dispatch-preset; do
        printf '  %-20s → %s\n' "$t" "$(_mx_led_defect_of "$t")"
      done
      ;;
    resolve|waive)
      ID="${1:-}"; shift || true; NOTE="${*:-}"
      [ -n "$ID" ] || { echo "usage: $CMD <id> <note>" >&2; exit 2; }
      [ -f "$F" ] || { echo "台账不存在" >&2; exit 2; }
      TMP="$F.tmp.$$"
      awk -F'\t' -v id="$ID" -v st="$CMD" -v note="$NOTE" '
        NR==1 { print; next } $1==id { $6=st; $7=note } { print }' OFS='\t' "$F" > "$TMP" && mv "$TMP" "$F"
      grep -q "^${ID}	.*	${CMD}	" "$F" && echo "$ID → $CMD ✓" || { echo "$ID 未找到" >&2; exit 1; }
      ;;
    check-clearance)
      # 代偿清偿门：开跑前置检查用。有 open 笔 → 非零退出并逐笔列出。
      if [ ! -f "$F" ]; then echo "清偿门 ✓（无台账=零代偿轮）"; exit 0; fi
      OPEN=$(awk -F'\t' 'NR>1 && $6=="open"' "$F" | wc -l | tr -d ' ')
      if [ "$OPEN" = "0" ]; then echo "清偿门 ✓（$(_mx_led_run_id) 无 open 代偿）"; exit 0; fi
      echo "清偿门 ✗：$OPEN 笔 open 代偿未清偿（根治合入产品或显式 waive 后方可开下一轮）："
      awk -F'\t' 'NR>1 && $6=="open" { printf "  %s %s %s %s\n", $1, $2, $3, $5 }' "$F"
      exit 1
      ;;
    *)
      echo "unknown cmd: $CMD（list|summary|catalog|resolve|waive|check-clearance）" >&2; exit 2
      ;;
  esac
fi

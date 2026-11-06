#!/bin/bash
# mx-compensation-ledger.sh — 代偿台账（2026-10-15 姿态治理轮，批次一）
#
# 定位：推演程序对运行体系的每一笔「代偿动作」（替 agent 兜行为短板 / 绕产品通道 /
# 代演把关）统一记账。台账是报告「代偿净额对账」的唯一数据源，也是下一轮开跑前
# 「代偿清偿门」（用户裁定 2026-10-15：代偿在下一轮推演前必须根治后合入 AIStudio
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
#   bash mx-compensation-ledger.sh --run <RUN_ID> check-issue-clearance  # 开跑前延后清账：DISP 延后桶非零即非零
#   bash mx-compensation-ledger.sh --run <RUN_ID> append-disp <type> <subject> <text>  # 人工回写处置终态（轮已清场→写 clearance 投影）
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
  # 软链可悬空（mx-clean 归档后 runs/ 已删）——readlink 仍可解析轮名（投影回落入口）
  ln=$(readlink "$root/var/current-state.env" 2>/dev/null || true)
  # 锚必须指向 runs/<id>/state.env 才算轮次（run27 实锤：var/current-state.env 指向
  # SIM 根 state.env 时旧逻辑取到 basename=sim 根目录名 → runs/ncwk-sim-mux 不存在 →
  # 假「零代偿轮」）。不匹配则落到下一级兜底。
  case "$ln" in
    */runs/*/state.env) basename "$(dirname "$ln")"; return ;;
  esac
  # fail-closed 兜底（run27 复盘根治）：锚文件缺位时旧逻辑返回空 → _mx_led_file 返回
  # 非零 → check-clearance 打印「无台账=零代偿轮」exit 0＝**治理门静默放行**（run27
  # 实录：94 笔 open 代偿在案而 prelaunch ⑯ 恒绿）。改为取最近一轮带台账的 run dir；
  # 一个都没有＝真·首轮，才允许「零代偿轮」放行。
  local latest=""
  latest=$(ls -dt "$root"/runs/*/evidence/compensation-ledger.tsv 2>/dev/null | head -1 || true)
  if [ -n "$latest" ]; then basename "$(dirname "$(dirname "$latest")")"; return; fi
  echo ""
}
# 台账路径（P2 Task 2 clearance 投影）：轮目录在→轮台账；轮已清场→回落
# var/clearance/<RUN>/compensation-ledger.tsv（mx-clean 清场前原子写的投影——
# 未闭环债务跨清场存活，resolve/append-disp 作用于投影）。
_mx_led_file() {
  local rid root live proj
  rid="$(_mx_led_run_id)"; root="$(_mx_led_sim_root)"
  [ -n "$rid" ] || return 1
  live="$root/runs/$rid/evidence/compensation-ledger.tsv"
  if [ -f "$live" ]; then echo "$live"; return 0; fi
  proj="$root/var/clearance/$rid/compensation-ledger.tsv"
  if [ -f "$proj" ]; then echo "$proj"; return 0; fi
  echo "$live"  # 两者皆无：返回轮位（compensate 首笔会建；check 走「无台账」容错）
}
# 台账所在目录（append-disp 落 issues.log 的位置：轮在→evidence；已清→投影目录）
_mx_led_dir() {
  local f
  f="$(_mx_led_file 2>/dev/null)" || return 1
  dirname "$f"
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
      # 回验=awk 字段精确匹配（2026-10-31 清账批首战实录：旧 grep 字面 tab 模式在
      # 多字节行上假阴性，写入成功却报「未找到」exit 1——28 笔假错。awk 按列断言
      # 不受 locale/二进制探测影响）。
      awk -F'\t' -v id="$ID" -v st="$CMD" 'NR>1 && $1==id && $6==st { found=1 }
        END { exit found ? 0 : 1 }' "$F" \
        && echo "$ID → $CMD ✓" || { echo "$ID 未找到" >&2; exit 1; }
      ;;
    waive-open)
      # 批量豁免（2026-11-06 用户裁决「A. 豁免放行」）：一次给全部 open 笔落 waive+理由，
      # 用于「代偿类型属架构性代演、本轮不做产品化」的场景；理由必填（审计可追溯）。
      NOTE="${*:-}"
      [ -n "$NOTE" ] || { echo "usage: $CMD waive-open <理由>" >&2; exit 2; }
      [ -f "$F" ] || { echo "台账不存在" >&2; exit 2; }
      IDS=$(awk -F'\t' 'NR>1 && $6=="open" { print $1 }' "$F")
      N=0
      for id in $IDS; do
        TMP="$F.tmp.$$"
        awk -F'\t' -v id="$id" -v note="$NOTE" '
          NR==1 { print; next } $1==id { $6="waive"; $7=note } { print }' OFS='\t' "$F" > "$TMP" && mv "$TMP" "$F"
        N=$((N+1))
      done
      echo "已豁免 $N 笔（waive，理由：${NOTE}）"
      ;;
    append-disp)
      # 人工回写问题单处置终态（P2 Task 2 显式命令）：DISP|<type>|<subject>|<text>
      # 追加到台账同目录 issues.log——轮在→轮 evidence；轮已清场→clearance 投影
      # （与 check-issue-clearance 的「末次 DISP」口径闭环：新行即末次=回写终态）。
      TYPE="${1:-}"; SUBJ="${2:-}"; shift 2 2>/dev/null || true; TEXT="${*:-}"
      [ -n "$TYPE" ] && [ -n "$SUBJ" ] && [ -n "$TEXT" ] || { echo "usage: append-disp <type> <subject> <text>" >&2; exit 2; }
      IL_DIR="$(_mx_led_dir 2>/dev/null)" || { echo "SIM_ROOT/RUN_ID 未解析（无 --run 且无锚定轮）" >&2; exit 2; }
      TEXT="$(printf '%s' "$TEXT" | tr '\t\n' '  ')"
      printf 'DISP|%s|%s|%s\n' "$TYPE" "$SUBJ" "$TEXT" >> "$IL_DIR/issues.log"
      echo "DISP 追加 ✓（$IL_DIR/issues.log：$TYPE·$SUBJ）"
      ;;
    check-clearance)
      # 代偿清偿门：开跑前置检查用。有 open 笔 → 非零退出并逐笔列出。
      if [ ! -f "$F" ]; then
        # 只有「全仓无任何轮台账」才算真·首轮零代偿；锚缺位但有历史台账=解析失败，fail-closed
        if ls "$(_mx_led_sim_root)"/runs/*/evidence/compensation-ledger.tsv >/dev/null 2>&1; then
          echo "清偿门 ✗：代偿台账路径解析失败（run=$(_mx_led_run_id) 为空）——不得按零代偿放行；用 --run <RUN_ID> 指定轮次"
          exit 2
        fi
        echo "清偿门 ✓（全仓无任何轮台账=真首轮，零代偿）"; exit 0
      fi
      OPEN=$(awk -F'\t' 'NR>1 && $6=="open"' "$F" | wc -l | tr -d ' ')
      if [ "$OPEN" = "0" ]; then echo "清偿门 ✓（$(_mx_led_run_id) 无 open 代偿）"; exit 0; fi
      echo "清偿门 ✗：$OPEN 笔 open 代偿未清偿（根治合入产品或显式 waive 后方可开下一轮）："
      awk -F'\t' 'NR>1 && $6=="open" { printf "  %s %s %s %s\n", $1, $2, $3, $5 }' "$F"
      exit 1
      ;;
    check-issue-clearance)
      # 问题单延后清账（方案 §5.9 清偿门线扩展，run23 收官批）：唯一键处置终态
      # =该键**末次** DISP 行（issues.log 是 append-only 事件流，人工复核回写终态
      # 由新行承载——与报告第 4 章「按唯一键去重收尾」同口径；2026-10-31 清账批改，
      # 原实现把历史任一延后行计入，回写终态后仍恒红）。末次 DISP 首词=延后 的
      # 唯一键非零 → 非零退出并列键。纪律 56「prelaunch 断言上轮结构性延后 key 消失」
      # 的机械执法面——此前只有代偿 open 笔被 check-clearance 拦，结构性延后单可带病开跑。
      # P2 Task 2：IL 路径随 _mx_led_file 回落（轮已清场→var/clearance/<RUN>/issues.log
      # 投影，未闭环债务跨清场存活）。
      IL="$(dirname "$F")/issues.log"
      if [ ! -f "$IL" ]; then echo "延后清账 ✓（$(_mx_led_run_id) 无 issues.log）"; exit 0; fi
      # pairing 同构（run-metrics 末次适用口径，P2 终审收口）：只认真实 ISSUE 键；
      # 选择序 exact＞generic（泛指广播）＞single（同类型唯一键容差），类别内取行序
      # 末条；畸形 DISP（无第四段/空处置）不参与。泛指广播可置「延后」但不得批量
      # 解禁——chosen 来自 generic 且词面已修/已闭环（无逐键 exact）仍判未逐键处置。
      KEYS=$(awk -F'|' '
        $1=="ISSUE" && NF>=3 { k=$2"·"$3; if (!(k in seen)) { seen[k]=1; keys[++nk]=k; tcnt[$2]++ } }
        $1=="DISP" && NF>=4 && $4!="" {
          t=$2; s=$3
          if (s=="director"||s=="monitor"||s=="harness"||s=="导演"||s=="监控") { gcat[t]="generic"; gdisp[t]=$4 }
          else { k=t"·"s; ecat[k]="exact"; edisp[k]=$4; ngdisp[t]=$4 }
        }
        END {
          for (i=1;i<=nk;i++) {
            k=keys[i]; split(k,ka,"·"); t=ka[1]
            d=""; c=""
            if (k in ecat) { d=edisp[k]; c="exact" }
            else if (t in gcat) { d=gdisp[t]; c="generic" }
            else if (tcnt[t]==1 && (t in ngdisp)) { d=ngdisp[t]; c="single" }
            if (d ~ /^延后/) print k
            else if (c=="generic" && d ~ /^(已修|已闭环)/) print k
          }
        }' "$IL" | sort)
      if [ -z "$KEYS" ]; then echo "延后清账 ✓（$(_mx_led_run_id) 问题单延后桶=0，末次 DISP 口径）"; exit 0; fi
      echo "延后清账 ✗：$(printf '%s\n' "$KEYS" | wc -l | tr -d ' ') 个唯一键未逐键处置（延后中，或仅被泛指广播声称已修/已闭环——须逐键带锚回写 exact DISP，或经用户裁定豁免；纪律 56/§5.9/pairing 同构）："
      printf '%s\n' "$KEYS" | sed 's/^/  /'
      exit 1
      ;;
    *)
      echo "unknown cmd: $CMD（list|summary|catalog|resolve|waive|check-clearance|check-issue-clearance）" >&2; exit 2
      ;;
  esac
fi

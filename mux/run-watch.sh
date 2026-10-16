#!/bin/bash
# run15 watcher v3（复用 run14 v3 蓝本）（2026-10-11 停摆误诊根治轮重写）
# v2 教训（六小时两误诊实锤）：
#   ①误诊一「高载内核断链」——真因是会话 Turn ended: text_response 正常收场但零交付
#     （末轮 out≈6 token 短句自了断）。内核 0% CPU 是结果不是原因。
#   ②误诊二「日志 mtime 新=在干活」——mtime 被 Matrix reaction 噪音持续刷新，
#     工作行已死 40 分钟 mtime 仍新。活性必须看工作行（API call/tool completed）。
# 根治三面：
#   A 工作行活性（非 mtime）：停滞判定改用 agent.log 最后工作行时间戳。
#   B 空转收场检测：Turn ended: text_response 且群内无该档案结论行 且其名下有在办卡
#     → 立即唤醒（不等 35 分钟停滞窗）。
#   C 诊断三查纪律（注释即 checklist）：命名任何停滞根因前必须过三关——
#     ①末行实证：会话最后一条非噪音日志行说什么（含 Turn ended/error 行）；
#     ②差分实证：同一基础设施上谁还活着（有人活=排除环境级根因）；
#     ③预测实证：若根因 X 成立则 Y 应发生，验证 Y 再下结论。
#     诊断复用超 1 小时或跨档案必须从零重查——同症不同因。

SR="${RUN_WATCH_SR:-/Users/cuishi/lab/ncwk-sim-mux}"
RUN="${RUN_WATCH_RUN:-20261011-v8-run15}"
STATE="$SR/var/${RUN}-watch.state"
DRV="$SR/logs/$RUN-driver.log"
RDIR="$SR/runs/$RUN"
ISSUES="$RDIR/evidence/issues.log"
STALL_SEC=1200          # 工作行停滞 20min（v2 的 35min 太迟）
POLL_SEC=45

log() { echo "$(date '+%H:%M:%S') $*"; }

PREV_ISSUE_LINES=0; PREV_DRV_LINES=0; PREV_ALIVE=1; LAST_ACT_TS=$(date +%s)
[ -f "$STATE" ] && . "$STATE"
[ -n "$LAST_ACT_TS" ] || LAST_ACT_TS=$(date +%s)

save_state() {
  { cat <<EOF
PREV_ISSUE_LINES=$PREV_ISSUE_LINES
PREV_DRV_LINES=$PREV_DRV_LINES
PREV_ALIVE=$PREV_ALIVE
LAST_ACT_TS=$LAST_ACT_TS
EOF
    # F9：唤醒计数持久（同档案升级链跨重启保留）；F10：预算续作令已发标记持久
    for _p in hu qi xiao chen fanfan lin wei fei; do
      eval "[ -n \"\${NUDGE_CNT_${_p}:-}\" ] && echo \"NUDGE_CNT_${_p}=\${NUDGE_CNT_${_p}}\""
      eval "[ -n \"\${BUDGET_DONE_${_p}:-}\" ] && echo \"BUDGET_DONE_${_p}=\${BUDGET_DONE_${_p}}\""
    done
  } > "$STATE"
}
wake() { log "WAKE: $*"; save_state; exit 0; }

last_work_ts() { # <agent.log> → epoch（最后工作行；无→0）
  local line ts
  line=$(grep -E "API call #|tool [a-z_]+ completed" "$1" 2>/dev/null | tail -1)
  [[ -n "$line" ]] || { echo 0; return; }
  ts=$(printf '%s' "$line" | cut -c1-19)
  date -j -f "%Y-%m-%d %H:%M:%S" "$ts" +%s 2>/dev/null || echo 0
}

while true; do
  ok1=000; ok2=000
  for tr in 1 2 3; do
    ok1=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:8801/health 2>/dev/null)
    ok2=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:8802/ 2>/dev/null)
    [ "$ok1" = "200" ] && [ "$ok2" = "200" ] && break
    sleep 5
  done
  if [ "$ok1" != "200" ] || [ "$ok2" != "200" ]; then
    wake "service down after 3 tries (gateway8801=$ok1 studio8802=$ok2)"
  fi

  ALIVE=0
  DPIDS=$(ps -axo pid,pgid,comm,command | awk '$3=="bash" && /aipay-scenario\.sh/ && !/pgrep|grep|tail|awk|sed/ {print $1":"$2}')
  DGROUPS=$(echo "$DPIDS" | grep -o ':[0-9]*$' | sort -u | grep -c . )
  [ "$DGROUPS" -ge 1 ] && ALIVE=1
  if [ "$DGROUPS" -gt 1 ]; then
    wake "DOUBLE-DRIVE detected: $DGROUPS distinct driver process groups"
  fi
  LOCKINFO="$SR/.driver.lock.d/info"
  if [ -f "$LOCKINFO" ]; then
    LPID=$(sed -n 's/^pid=\([0-9]*\).*/\1/p' "$LOCKINFO")
    if [ -n "$LPID" ] && ! kill -0 "$LPID" 2>/dev/null; then
      wake "stale driver lock: holder pid=$LPID dead"
    fi
    if [ "$ALIVE" = "1" ] && [ -n "$LPID" ] && [ "$DGROUPS" = "1" ] && ! echo "$DPIDS" | grep -q "^${LPID}:"; then
      wake "driver pid mismatch: running=$(echo $DPIDS) but lock holder=$LPID"
    fi
  fi

  if [ -f "$ISSUES" ]; then
    N=$(wc -l < "$ISSUES" | tr -d ' ')
    if [ "$N" -gt "$PREV_ISSUE_LINES" ]; then
      PREV_ISSUE_LINES=$N
      save_state
    fi
  fi

  if [ -f "$DRV" ]; then
    N=$(wc -l < "$DRV" | tr -d ' ')
    if [ "$N" -gt "$PREV_DRV_LINES" ]; then
      # 行首锚定（run15 04:02/05:17 两类误报根治）：驱动 fail() 输出为「[mux FAIL 时刻]」行首形态；
      # 信息行（判词文本/派单模板/复审改判说明）内嵌 FAIL/判词字样不再触发
      ERRS=$(tail -n $(( N - PREV_DRV_LINES )) "$DRV" | grep -cE "^\[mux FAIL|Traceback|ERROR|panic|hard window|exit code [1-9]" || true)
    else
      ERRS=0
    fi
    PREV_DRV_LINES=$N
    if [ "$ERRS" -gt 0 ]; then
      wake "new error lines x$ERRS in driver log (tail: $(grep -E 'Traceback|ERROR|FAIL|TIMEOUT|hard window|exit code [1-9]|panic' "$DRV" | tail -1 | cut -c1-200))"
    fi
  fi

  if [ "$ALIVE" = "0" ] && [ "$PREV_ALIVE" = "1" ]; then
    wake "scenario process EXITED (run=$RUN). driver tail: $(tail -2 "$DRV" 2>/dev/null | cut -c1-200)"
  fi
  PREV_ALIVE=$ALIVE

  # ── A 工作行停滞（非 mtime；v3 根治面）────────────────────────────
  if [ "$ALIVE" = "1" ]; then
    DRV_WTS=$(last_work_ts "$DRV")
    AGE=$(( $(date +%s) - DRV_WTS ))
    RD_NEW=$(find "$RDIR" -type f -mmin -20 2>/dev/null | head -1)
    ANY_WORK=0
    for ag in "$SR"/hermes/profiles/*/logs/agent.log; do
      ts=$(last_work_ts "$ag"); [ "$ts" -gt 0 ] && AGE_A=$(( $(date +%s) - ts )) || AGE_A=99999
      [ "$AGE_A" -lt "$STALL_SEC" ] && { ANY_WORK=1; break; }
    done
    if [ "$AGE" -gt "$STALL_SEC" ] && [ -z "$RD_NEW" ] && [ "$ANY_WORK" = "0" ]; then
      wake "work-line stall: driver idle ${AGE}s, no run-dir activity, no agent work-line in ${STALL_SEC}s (mtime 不算活性——v2 误诊二教训)"
    fi

    # ── B0 迭代预算耗尽检测（F10，run15 复盘：chen 60/60 耗尽在「查完要写码」临界点，
    # 会话 summarise 后结束、代码零改动，需人工续作令接力）──────────────────────
    # 判据：日志尾窗出现「Iteration budget exhausted」+ 名下有未结卡 + 其后无新工作行
    # 5min → 自动发续作令（跳过调研直接写码；上下文已由 summarise 沉淀，点名不重做）。
    # 每 profiler 一次（NUDGE_CNT_* 计数器复用 F9 持久面，BUDGET_DONE_* 防重发）。
    for prof in hu qi xiao chen fanfan lin wei fei; do
      AG_LOG="$SR/hermes/profiles/$prof/logs/agent.log"
      [ -f "$AG_LOG" ] || continue
      eval "BD=\${BUDGET_DONE_${prof}:-0}"
      [ "$BD" = "1" ] && continue
      # run16 实证（fanfan 21:18 G5 修订中断）：耗尽有两词形——「Iteration budget
      # exhausted」（运行时预算面）与「max_iterations_reached」（会话迭代上限面），
      # run16 后者出现时 B0 未咬=60 分钟无人续作。两词形同判。
      BE_AGO=$(( $(date +%s) - $({ BE=$(grep -E "Iteration budget exhausted|max_iterations_reached" "$AG_LOG" | tail -1 | cut -c1-19); [ -n "$BE" ] && date -j -f "%Y-%m-%d %H:%M:%S" "$BE" +%s 2>/dev/null; } || echo 0) ))
      WL_AGO_B=$(( $(date +%s) - $(last_work_ts "$AG_LOG") ))
      if [ "$BE_AGO" -ge 0 ] && [ "$BE_AGO" -lt 1800 ] && [ "$WL_AGO_B" -gt 300 ]; then
        OPEN_B=$(python3 -c "
import sqlite3,glob
n=0
for db in glob.glob('$SR/hermes/kanban/boards/*/kanban.db'):
    try:
        c=sqlite3.connect(f'file:{db}?mode=ro',uri=True)
        n+=c.execute(\"SELECT COUNT(*) FROM tasks WHERE assignee=? AND status IN ('todo','ready','running')\",('$prof',)).fetchone()[0]
        c.close()
    except Exception: pass
print(n)" 2>/dev/null || echo 0)
        if [ "$OPEN_B" -gt 0 ]; then
          TOK=$(head -1 "$SR/creds/fanfan.token" 2>/dev/null)
          NROOM=$(sed -n 's/^room_analysis=//p' "$RDIR/state.env" 2>/dev/null | tail -1)
          if [ -n "$TOK" ] && [ -n "$NROOM" ]; then
            BODY="@${prof}-agent:matrix.test 续作令（watcher 迭代预算耗尽检测）：你的会话在迭代预算耗尽时已把实查结论 summarise，但代码未落。请基于该总结直接进入写码/落地（禁再做新一轮调研）：按总结里已确认的下一步逐件执行，每件完成即提交+发结论行（可分件分批报）；确有阻塞发 BLOCKED+原因。禁静默。"
            EV=$(curl -s -m 10 -X POST "http://127.0.0.1:8008/_matrix/client/v3/rooms/$NROOM/send/m.room.message?access_token=$TOK" -H 'Content-Type: application/json' -d "$(printf '{"msgtype":"m.text","body":"%s","m.mentions":{"user_ids":["@%s-agent:matrix.test"]}}' "$BODY" "$prof")" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("event_id",""))' 2>/dev/null)
            echo "$(date '+%H:%M:%S') [budget-continue] $prof 迭代预算耗尽续作令已发（$EV，未结卡 ${OPEN_B}）"
            echo "DISP|budget-exhausted-continue|$prof|观察 watcher 续作令（$EV）：Iteration budget exhausted 后无工作行+${OPEN_B} 张未结卡；处置=唤醒令类代行（纪律 36），继续监控不退出" >> "$ISSUES"
            eval "BUDGET_DONE_${prof}=1"
            sleep 120
          fi
        fi
      fi
    done

    # ── B 空转收场检测（Turn ended 且名下有在办卡 且群内近期无其结论行）──
    # F9（run15 复盘）双根修：①老形态——Turn ended 超过 10 分钟新鲜窗的干完静默型
    # （xiao 干完不交卷 1h46m 实锤，新鲜窗检测抓不到）改按「名下未结卡+工作行停滞
    # 超 30min」独立判据；②同卡连环唤醒无升级（qi 七连同文唤醒实锤）——按档案计
    # 数，第 3 次起升级为微任务交卷令（点名结论行格式+禁重做已完成工作）。
    for prof in hu qi xiao chen fanfan lin wei fei; do
      AG_LOG="$SR/hermes/profiles/$prof/logs/agent.log"
      [ -f "$AG_LOG" ] || continue
      TE_AGO=$(( $(date +%s) - $({ TE=$(grep -E "Turn ended" "$AG_LOG" | tail -1 | cut -c1-19); [ -n "$TE" ] && date -j -f "%Y-%m-%d %H:%M:%S" "$TE" +%s 2>/dev/null; } || echo 0) ))
      WL_AGO=$(( $(date +%s) - $(last_work_ts "$AG_LOG") ))
      # 新鲜形态（原判据）或老形态（工作行停滞 30min+ 且会话曾结束）：TE_AGO=-1 表示无记录
      FRESH_HIT=$(( TE_AGO >= 0 && TE_AGO < 600 && WL_AGO > 300 ? 1 : 0 ))
      OLD_HIT=$(( WL_AGO > 1800 && TE_AGO >= 600 ? 1 : 0 ))
      if [ "$FRESH_HIT" = "1" ] || [ "$OLD_HIT" = "1" ]; then
        # 名下有未结卡？（sqlite 只读；失败跳过）
        OPEN=$(python3 -c "
import sqlite3,glob
n=0
for db in glob.glob('$SR/hermes/kanban/boards/*/kanban.db'):
    try:
        c=sqlite3.connect(f'file:{db}?mode=ro',uri=True)
        n+=c.execute(\"SELECT COUNT(*) FROM tasks WHERE assignee=? AND status IN ('todo','ready','running')\",('$prof',)).fetchone()[0]
        c.close()
    except Exception: pass
print(n)" 2>/dev/null || echo 0)
        if [ "$OPEN" -gt 0 ]; then
          # 处置自动化（2026-10-11 用户指认"最后一公里"后落码）：不再只 wake 等人工——
          # 纪律 36"唤醒令"类代行直接由 watcher 执行（标准格式+留痕），之后继续监控。
          TOK=$(head -1 "$SR/creds/fanfan.token" 2>/dev/null)
          # run15：房间由驱动新建，起跑时不存在——从 state.env 动态解析，未建房前走人工唤醒
          NROOM=$(sed -n 's/^room_analysis=//p' "$RDIR/state.env" 2>/dev/null | tail -1)
          # F9 升级链：同档案唤醒计数（state 文件持久），≥3 次升级微任务交卷令
          eval "NC=\${NUDGE_CNT_${prof}:-0}"; NC=$((NC+1)); eval "NUDGE_CNT_${prof}=$NC"
          if [ "$NC" -ge 3 ]; then
            NUDGE_BODY="@${prof}-agent:matrix.test 升级交卷令（第 ${NC} 次唤醒，此前唤醒均未闭环）：你名下 ${OPEN} 张未结卡。请立即三选一回执（禁静默、禁重做已完成工作）：1) 已完成→按派单结论行格式逐卡发结论行（含 commit/卡 ID 凭证）；2) 部分完成→发已完成部分的结论行+剩余待办清单；3) 确有阻塞→发 BLOCKED+具体原因。"
            TAG="escalated-conclusion-order"
          else
            NUDGE_BODY="@${prof}-agent:matrix.test 自动唤醒（watcher 空转收场检测，第 ${NC} 次）：你的会话已正常结束但名下 ${OPEN} 张未结卡。请继续收口：已完成的部分立即发结论行（按派单格式），未完成的按最小步骤推进后回执；确有阻塞发 BLOCKED+原因，禁静默。"
            TAG="auto-nudge-idle-ending"
          fi
          if [ -n "$TOK" ] && [ -n "$NROOM" ]; then
            EV=$(curl -s -m 10 -X POST "http://127.0.0.1:8008/_matrix/client/v3/rooms/$NROOM/send/m.room.message?access_token=$TOK" -H 'Content-Type: application/json' -d "$(printf '{"msgtype":"m.text","body":"%s","m.mentions":{"user_ids":["@%s-agent:matrix.test"]}}' "$NUDGE_BODY" "$prof")" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("event_id",""))' 2>/dev/null)
            echo "$(date '+%H:%M:%S') [auto-nudge] $prof ${TAG} 已发（$EV，未结卡 ${OPEN}，第 ${NC} 次）"
            echo "DISP|${TAG}|$prof|观察 watcher v3 唤醒第 ${NC} 次（$EV）：未结卡 ${OPEN}；处置=唤醒令类代行（纪律 36），继续监控不退出" >> "$ISSUES"
            sleep 300  # 冷却 5 分钟防连环唤醒
          else
            wake "idle-ending: $prof 空转收场但发令凭据缺失，需人工唤醒"
          fi
        fi
      fi
    done
  fi

  save_state
  sleep "$POLL_SEC"
done

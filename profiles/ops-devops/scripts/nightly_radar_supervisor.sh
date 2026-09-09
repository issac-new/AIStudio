#!/usr/bin/env bash
# 夜间深度调研 v2 — ops-devops 托管韧性版（t_4bde05a0）
# cron 每 30min 拉起：同夜自动补跑看门狗。
# 幂等：今日已成功产出+推送则静默退出；未产出则调 nightly_radar.py 从断点续跑。
# stdout 只在补跑时输出干净摘要（no_agent 模式 stdout 会投递，成功补跑才说话）。

BASE=/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/life-workbench
WRAPPER="$BASE/scripts/nightly_radar.py"
LOG="$BASE/logs/nightly_supervisor.log"
TODAY=$(date +%F)
# 跨午夜修正：00:00-08:59 的 tick 业务日期仍是昨晚（报告按 09-04 命名，不是 09-05）
HOUR=$(date +%H); HOUR=${HOUR#0}
if [ "$HOUR" -lt 9 ]; then
  TODAY=$(date -v-1d +%F)
fi
STATE_FILE="$BASE/cache/radar/wrapper_state_${TODAY}.json"
PDF_FILE="$BASE/reports/nightly_radar_${TODAY}.pdf"
H=~/.hermes/hermes-agent/venv/bin

mkdir -p "$BASE/logs"
echo "[$(date '+%F %T')] supervisor tick $TODAY" >> "$LOG"

# 0. 窗口守卫：只在 23:00-09:00 夜间窗口动作（00:00 的 tick 也算夜间；
#    白天 tick 一律静默退出 = TEST=1 语义：不跑、不推、不留副作用）。
#    SUPERVISOR_FORCE=1 为测试旁路（白天演练用，必须配合 TEST=1 防真实推送）。
if [ "${SUPERVISOR_FORCE:-0}" != "1" ] && [ "$HOUR" -lt 23 ] && [ "$HOUR" -ge 9 ]; then
  echo "[$(date '+%F %T')] 白天窗口静默退出（夜间 23:00-09:00 才允许补跑）" >> "$LOG"
  exit 0
fi

# 1. 今日已产出且已推送(status=done) → 幂等静默退出（stdout 空 = no_agent 不投递）
if [[ -f "$STATE_FILE" ]] && [[ -f "$PDF_FILE" ]]; then
  PUSH_DONE=$("$H/python" "$BASE/scripts/check_push_state.py" "$STATE_FILE" "$TODAY")
  if [[ "$PUSH_DONE" == "YES" ]]; then
    echo "[$(date '+%F %T')] 今日已产出+推送，幂等退出" >> "$LOG"
    exit 0
  fi
fi

# 2. 未产出 → wrapper 补跑（supervise 模式从断点续）
echo "[$(date '+%F %T')] 今日未完整产出，启动 wrapper 补跑" >> "$LOG"
cd "$BASE" || exit 1
"$H/python" "$WRAPPER" --date "$TODAY" --supervise >> "$LOG" 2>&1
RC=$?

# 3. 补跑结果
if [[ $RC -eq 0 ]]; then
  PUSH_DONE=$("$H/python" "$BASE/scripts/check_push_state.py" "$STATE_FILE" "$TODAY")
  if [[ "$PUSH_DONE" != "YES" && "${TEST:-0}" != "1" ]]; then
    # 夜间真实运行但推送步未成功（PDF 已产出）：不报成功、不重发，留给下个 tick 重试推送
    echo "[$(date '+%F %T')] PDF 已产出但微信推送未完成，等待下个 tick 重试" >> "$LOG"
    echo "⚠️ 深度调研日报 ${TODAY}：PDF 已生成但推送未完成，系统将自动重试"
    exit 1
  fi
  SRC_N=$("$H/python" "$BASE/scripts/parse_summary.py" "$TODAY" 2>/dev/null || echo '? ?')
  echo "[$(date '+%F %T')] 补跑成功" >> "$LOG"
  echo "📡 深度调研日报 ${TODAY}（补跑完成）"
  echo "数据底座：${SRC_N}（重抓至最新，截至今刻）"
  echo "详细分析见 PDF 附件 ↓"
  # 防双推：wrapper 成功完成 weixin_push 时已写 marker（= 文字+PDF 均已推送）；
  # marker 缺失（罕见：手动跑 wrapper 但推送步独立失败）才由这里补发 PDF。
  MARKER="$BASE/cache/radar/.weixin_pushed_${TODAY}"
  if [[ "${TEST:-0}" == "1" ]]; then
    echo "[$(date '+%F %T')] TEST=1 演练模式：跳过 PDF 补发" >> "$LOG"
  elif [[ ! -f "$MARKER" ]]; then
    sleep 3
    "$H/hermes" send -t weixin "MEDIA:$PDF_FILE" >> "$LOG" 2>&1
    echo "[$(date '+%F %T')] supervisor 补发 PDF（marker 缺失）" >> "$LOG"
  else
    echo "[$(date '+%F %T')] PDF 已随 wrapper 推送，跳过重发（防双推）" >> "$LOG"
  fi
  exit 0
else
  echo "[$(date '+%F %T')] 补跑失败 rc=$RC，下个 tick 再试" >> "$LOG"
  exit 1
fi
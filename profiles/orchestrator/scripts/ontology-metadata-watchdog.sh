#!/usr/bin/env bash
# ontology-metadata-watchdog.sh — 周度看门狗：跑 ontology CQ 回归 → 异常（GAP/PARTIAL）才告警。
#
# 模式（复用 tui-patch-watchdog.sh / memory-watchdog.sh 的 no_agent 看门狗范式）：
#   本脚本即 job（cron --no-agent），stdout 作为告警/状态投递（deliver=local）。
#   设计哲学：宁硬失败不静默残缺——
#     - 回归脚本本身是机制，崩溃（python traceback / rc==2）即 watchdog 自身异常 → exit 2（运维级）。
#     - CQ 回归产出 GAP/PARTIAL（exit 1）= 真实业务告警 → 打印摘要到 stdout，watchdog exit 1。
#     - 全 PASS（exit 0）= 健康 → 打印 minimal ok 行，watchdog exit 0（不告警）。
#
# 为什么不直接把回归脚本本身当 cron script？
#   cron no_agent 下脚本 stdout 直接投递；我们需要「只在异常时投递非空洞内容」的语义，
#   且要对回归脚本崩溃与业务 GAP 区分退出码（便于 future monitor 模式分级）。
set -uo pipefail

HOME_DIR="${HOME:-/Users/YOURNAME}"
# 所有路径/窗口均可经环境变量覆盖（便于测试与运维调参）；缺省走标准布局。
REG="${ONTOLOGY_CQ_REGRESSION:-${HOME_DIR}/.hermes/scripts/ontology-cq-regression.py}"
LOG="${ONTOLOGY_WATCHDOG_LOG:-${HOME_DIR}/.hermes/logs/ontology-metadata-watchdog.log}"
LOCKDIR="${ONTOLOGY_WATCHDOG_LOCKDIR:-${HOME_DIR}/.hermes/.locks/ontology-metadata-watchdog.lockdir}"
WINDOW_DAYS="${ONTOLOGY_CQ_WINDOW_DAYS:-7}"

mkdir -p "$(dirname "$LOG")" "${HOME_DIR}/.hermes/.locks"
log() { echo "$(date '+%F %T') [ontology-metadata-watchdog] $*" >> "$LOG"; }

# 重启防护：mkdir 原子锁（macOS 无 flock）。
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  log "skip: previous run still active"; exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

if [[ ! -x "$REG" ]]; then
  log "ERROR: regression script missing/unexecutable: $REG"
  echo "ONTOLOGY-WATCHDOG-ERROR: regression script not found: $REG"
  exit 2
fi

# 跑 CQ 回归（含 CQ16 metadata 合规）；捕获 stdout + rc。
OUT=$(python3 "$REG" --days "$WINDOW_DAYS" 2>&1)
RC=$?
TS=$(date '+%F %T %Z')

if [[ $RC -ne 0 ]]; then
  # 区分回归脚本崩溃 vs 业务 GAP：
  #   正常 CQ 报告总会打印「结果: PASS x/16...」行。若缺此行或含 python traceback，
  #   即回归脚本自身崩溃（运维级，exit 2）；否则是正常业务 GAP（exit 1）。
  if ! echo "$OUT" | grep -qE "结果" || echo "$OUT" | grep -qE "Traceback|ModuleNotFound|SyntaxError"; then
    log "ERROR: regression crashed (rc=$RC)"; echo "ONTOLOGY-WATCHDOG-ERROR @ $TS: regression crashed"; echo "$OUT" | tail -15; exit 2
  fi
  # 业务告警：打印 CQ 回归报告中 GAP/PARTIAL 行 + 总结，作为告警正文。
  ALERT=$(echo "$OUT" | grep -E "❌|🟡|结果")
  log "ALERT: CQ regression found GAP/PARTIAL (rc=$RC)"
  {
    echo "ONTOLOGY-METADATA-WATCHDOG ALERT @ $TS"
    echo "window=${WINDOW_DAYS}d regression: rc=$RC"
    echo "---- CQ 回归异常项 ----"
    echo "$ALERT"
    echo "---- 建议 ----"
    echo "1) 各 team worker 在 kanban_complete metadata 补齐 CompletionHandoff 三支柱"
    echo "   (artifacts_produced/findings/decisions); ontology_version 由版本持有巡检核验。"
    echo "2) 完整报告: python3 $REG --json | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"results\"][\"CQ16\"])'"
  } | tee -a "$LOG"
  exit 1
else
  # 健康：minimal ok（不刷屏告警，但留痕）。
  SUMMARY=$(echo "$OUT" | grep -E "结果" | head -1)
  log "ok: CQ regression all PASS (${SUMMARY:-})"
  echo "ONTOLOGY-WATCHDOG-OK @ $TS: CQ regression 全 PASS; CQ16 metadata 合规达标。"
  exit 0
fi

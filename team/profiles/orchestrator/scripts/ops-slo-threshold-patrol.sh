#!/bin/bash
# ops SLO 阈值巡检 cron 包装（gap-20260925-026 / kanban t_9da05f91）
# 语义：stdout 空 = 健康静默不投递；有输出 = 告警投递（no_agent 模式逐字外发）
# 退出码语义继承 slo_threshold_patrol.py：0 健康 / 2 有告警 / 3 引擎异常
set -u
# 10-20 修: 原 PATROL_DIR 硬编码外置盘 nvme 冻结卷路径, 盘不挂载即 FATAL(月余)。
# 实际脚本在 home 活跃区同名 gap 工作区, 改双路径探测(优先活跃区)。
PATROL_DIR_CANDIDATES=(
  "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/gap_workspaces/gap-20260925-026"
  "/Volumes/nvme2230/lab/hermes-docker-sandbox/workspace/life-workbench/gap_workspaces/gap-20260925-026"
)
PATROL_DIR=""
for _d in "${PATROL_DIR_CANDIDATES[@]}"; do
  if [ -f "${_d}/slo_threshold_patrol.py" ]; then PATROL_DIR="$_d"; break; fi
done
PYTHON_BIN="/Users/YOURNAME/.hermes/tools/python-3.14.7+20260901-darwin-arm64/bin/python3"

if [ -z "$PATROL_DIR" ]; then
    echo "[ops-slo-patrol] FATAL: patrol script missing (searched home active + nvme)"
    exit 3
fi

cd "$PATROL_DIR" || { echo "[ops-slo-patrol] FATAL: cannot cd into $PATROL_DIR"; exit 3; }
"$PYTHON_BIN" slo_threshold_patrol.py
rc=$?

# 引擎自身异常（3）已在 stdout 留痕；这里只把退出码映射成 cron 可读语义
if [ "$rc" -eq 3 ]; then
    echo "[ops-slo-patrol] engine error rc=3 — inspect stderr/patrol script"
fi
exit "$rc"

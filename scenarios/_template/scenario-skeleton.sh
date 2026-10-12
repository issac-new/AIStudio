#!/bin/bash
# scenario-skeleton.sh — 新场景驱动器骨架（复制到 scenarios/<名>/scenario.sh 后按需求编排）
#
# 复用面：mx-lib（拓扑/账号/房间/看板/studio 原语）+ mx-scenario-lib（派发/判活/
# 审批/等待/帧采集/报告链）全部场景无关，直接调用。场景相关的只有三样：
#   ① 步骤编排（本文件）② 需求材料（materials/）③ 凭证核验的标记串与交付物名。
# 起跑：RUN_ID=<轮次> MX_SCENARIO=<名> bash scenarios/<名>/scenario.sh
set -uo pipefail
SCEN_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_ROOT="$(cd "$SCEN_DIR/../.." && pwd)"
source "$HARNESS_ROOT/mux/mx-lib.sh"
source "$HARNESS_ROOT/mux/mx-scenario-lib.sh"

RUN_ID="${RUN_ID:?RUN_ID 必填}"
note "场景=${MX_SCENARIO} 节点=$(node_mode_desc) 中央仓=${MX_CENTRAL_REPO} 锚=${MX_ANCHOR_USER}/${MX_ANCHOR_USER_B}"

# ── 步骤骨架（按需增删；sset/sget 幂等断点续跑与 state.env 台账自动生效）──
# step "smoke"    "拓扑冒烟"        bash "$HARNESS_ROOT/mux/mx-smoke.sh"
# step "appinit"  "中央仓初始化"     <你的初始化命令>
# step "people"   "账号/profiles"    <mx-setup 已代做时的占位校验>
# step "room"     "需求分析群"       <mx_create_room + 邀请编制>
# step "dispatch" "派发需求材料"     dispatch_in_room ...（任务书含 RACI 与结论行格式）
# step "analysis" "等待分析完成"     wait_truth + verify_done（新场景换自己的标记串与交付物名）
# step "report"   "报告"            python3 "$HARNESS_ROOT/mux/mx-report-gen.py" --run "$RUN_ID"
# capture_step <步> <路由>           # 每步末尾实时帧（用户红线：必须当轮实时）

# ── 新场景必改三处 ────────────────────────────────────────
# 1. 凭证标记串：aipay 是 ANALYSIS-DONE-<RFD>，换成 <你的场景>-DONE-<需求号>
# 2. 交付物名：aipay 是 <RFD>-tasklist.md，换成你的需求交付物文件名
# 3. 材料路径：materials/ 下放需求文档，派发时引用绝对路径

#!/bin/bash
# mx-lib.sh — 单 gateway 多路复用拓扑公共库（方案 V2.0）
#
# 拓扑：本机 1 个 hermes gateway（multiplex 全部 profile）+ 1 个 studio（多 matrix 账号）
# 用户模型：每个独立用户 = matrix 账号 + 账号下多个独立 kanban + 各 kanban 下的 agent teams
# 设计文档：docs/superpowers/specs/2026-09-24-multiplex-multiuser-feasibility-and-plan-v2.md
#
# 归属声明（边界设计 §3-E3）：本库重生成 config.yaml/.env 仅限 sim 编排场景
# （幂等再生成、漂移自动收敛），是 sim-only 写者；真实环境 config.yaml 的写者
# 为 studio controllers/config.ts。根治（mx-setup 走 studio API）见该文档 §6-T6。
set -uo pipefail

MX_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# ── 推演/产品隔离布线（2026-10-03 隔离轮：harness 独立仓 ncwk/simharness）──
# 本仓对产品仓（overlay）只做「只读消费」：patches/、deploy-agent-runtime.mjs、
# custom/ 探针核验；绝不写产品树。运行时执行面用 SIM 自有快照
# （hermes-agent-src / product-dist），杜绝三类历史事故：mx-clean 逆放擦产品
# 补丁、hermes 自更新互擦、注入树与推演互占。边界正本=overlay docs 方案附录 C。
HARNESS_ROOT="$(cd "$MX_SCRIPT_DIR/.." && pwd)"
# ncwk 根用"向上找含真实 upstream/hermes-studio 的目录"锚定——固定层数回溯在
# worktree 场景（overlay 检出于 .claude/worktrees/<x>）会差一层解析到错处；
# 跳过符号链是为了不被 .claude/worktrees/upstream 软链（inject 从 worktree 跑
# 的依赖）截停在浅层。
_mx_root_walk() {
  local d="$1"
  while [[ "$d" != "/" ]]; do
    if [[ -d "$d/upstream/hermes-studio" && ! -L "$d/upstream" ]]; then
      echo "$d"; return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}
# yaml 可用解释器解析链（2026-10-17 实锤：宿主拆 venv 后系统 python3 缺 pyyaml，
# write_root_config/write_user_profile/write_agent_profile 三拷贝裸用 python3 →
# 静默写空 43 份 SIM config，mx-up 容量闸拦截。与 preflight 候选链同源）
_mx_yaml_py() {
  local c
  for c in "$HOME/.hermes/hermes-agent/.venv/bin/python" "$HOME/.hermes/hermes-agent/venv.py311/bin/python" python3; do
    if "$c" -c 'import yaml' >/dev/null 2>&1; then echo "$c"; return 0; fi
  done
  return 1
}
NCWK_ROOT="${MX_NCWK_ROOT:-$(_mx_root_walk "$MX_SCRIPT_DIR" || echo "$(cd "$HARNESS_ROOT/.." && pwd)")}"
OVERLAY_ROOT="${MX_OVERLAY_ROOT:-$NCWK_ROOT/overlay}"
PATCH_DIR="$OVERLAY_ROOT/patches"
SKILLS_SRC="$HARNESS_ROOT/skills"
# 受控写作条款真源（2026-10-09 全局文风根治轮：模型回复黑话多、思路跳跃、
# AI 味重——run12 交付物实锤 W2/W13/系分口径类代号无展开、多事挤一行）。
# 单一事实源=overlay/runtime/plugins/style-charter/style-charter.md（产品插件
# 同源读它；harness 对 overlay 只读消费，同 coding-delegate 先例——bare CI 无
# overlay 检出时缺位跳过，分发面不含条款）。分发两路：install_skills 追加进
# 每个技能副本（交付物侧）；seed_soul_charter 幂等并入 SOUL.md（聊天回复侧）。
# 条款文本不内嵌 bash（中文 heredoc 双重编码前科），bash 只做 marker 幂等与 cat。
STYLE_CHARTER="$OVERLAY_ROOT/runtime/plugins/style-charter/style-charter.md"
# 跨平台原语层（2026-10-12 双模式轮）：进程探测/日期解析/文件元数据/目录同步/
# python3 命令名收敛——业务面禁止直写 lsof/pgrep/stat -f/date -j/rsync 等平台命令。
source "$MX_SCRIPT_DIR/mx-platform.sh"
STUDIO_DIST_DEFERRED=1   # 执行面三参（STUDIO_DIST/HERMES_BIN/HERMES_PYTHONPATH）在 SIM_ROOT 定锚后统一定义（见下）

# ── 拓扑常量 ────────────────────────────────────────────
# SIM_ROOT：env（AIPAY_SIM_ROOT）优先。默认在 NVMe 卷上，Linux 等无该挂载点的机器不可写
# ——不可写则回落 $HOME/ncwk-sim-mux 并提示（P7 跨端；此处 note/log 尚未定义，提示走 stderr）。
_mx_sim_default="/Users/cuishi/lab/ncwk-sim-mux"
if [[ -n "${AIPAY_SIM_ROOT:-}" ]]; then
  SIM_ROOT="$AIPAY_SIM_ROOT"
elif [[ ( -d "$_mx_sim_default" && -w "$_mx_sim_default" ) || ( ! -e "$_mx_sim_default" && -w "$(dirname "$_mx_sim_default")" ) ]]; then
  SIM_ROOT="$_mx_sim_default"
else
  SIM_ROOT="$HOME/ncwk-sim-mux"
  echo "[mux] 默认 SIM_ROOT（${_mx_sim_default}）不可写，回落 ${SIM_ROOT}（可用 AIPAY_SIM_ROOT 覆盖）" >&2
fi
unset _mx_sim_default
HERMES_ROOT="$SIM_ROOT/hermes"            # 单 hermes root（gateway 的 HERMES_HOME）
AGENT_SRC="$SIM_ROOT/hermes-agent-src"    # SIM 自有 agent 源码快照（隔离轮；mx-setup 供给）
PRODUCT_DIST="$SIM_ROOT/product-dist"     # SIM 自有 studio 构建快照（隔离轮；mx-setup 供给）

# ── 执行面三参（SIM 自有快照缺省；缺位回落宿主/活树并大声告警——先跑 mx-setup）──
STUDIO_DIST="${MX_STUDIO_DIST:-$PRODUCT_DIST}"
if [[ ! -d "$STUDIO_DIST/server" ]]; then
  STUDIO_DIST="$NCWK_ROOT/upstream/hermes-studio/dist"
  echo "[mx-lib] ⚠ product-dist 快照缺位，studio 回落活注入树（产品 clean/inject 将与推演互踩——mx-setup 供给快照可根治）" >&2
fi
HERMES_BIN="${HERMES_BIN:-$SIM_ROOT/bin/hermes-sim}"
if [[ ! -x "$HERMES_BIN" ]]; then
  # 宿主 venv 回落路径跨端：mac=venv/bin/hermes；Git Bash=venv\\Scripts\\hermes
  if mxp_is_gbash; then
    HERMES_BIN="$HOME/.hermes/hermes-agent/venv/Scripts/hermes.exe"
  else
    HERMES_BIN="$HOME/.hermes/hermes-agent/venv/bin/hermes"
  fi
  echo "[mx-lib] ⚠ hermes-sim wrapper 缺位，网关回落宿主 venv（执行面共享宿主源码树，自更新互擦风险——mx-setup 供给快照可根治）" >&2
fi
# 驱动 PATH 盲（run5 09-30 实锤再犯）：库内裸 `hermes` 调用面（kanban_list/
# verify_done_evidence 等）依赖登录 shell 的 PATH，非交互 shell 启动的驱动里
# `hermes` 不在 PATH → CLI 报 command not found 被 `|| echo '[]'` 吞掉 → 看板
# 查询恒空、真值闸门永远差一拍。显式把 HERMES_BIN 所在目录前置进 PATH 兜全部裸调用。
# 仅当 HERMES_BIN 是路径（含 /）才前置其目录：裸命令名（HERMES_BIN=hermes）时
# dirname 得 "." ，把当前目录前置进 PATH 等于可执行注入面
case "$HERMES_BIN" in
  */*) export PATH="$(dirname "$HERMES_BIN"):$PATH" ;;
esac
# run10 02:0x 实锤：HERMES_BIN=SIM 快照包装器 hermes-sim 时，其目录无 `hermes` 入口，
# PATH 前置后裸 `hermes` 仍 not found → kanban_list 恒空 → agent 已建卡被误判超时
# （run9 走宿主 venv 目录内有真 hermes 故未踩）。函数转发兜全部库内裸调用面：
hermes() { "$HERMES_BIN" "$@"; }
# worker 网关解释器（HERMES_HOME/tools/python）裸跑找不到 hermes_cli——必须带
# PYTHONPATH（09-26 实锤：缺 PATH 致 worker -m hermes_cli.main 两连崩 gave_up）
# 隔离轮定案：worker/网关全走 hermes-sim wrapper（-I 语义），依赖取 venv 自身；
# installs 环境（py3.14）site-packages 不得进 PYTHONPATH——与 venv(py3.11) 混载
# 原生扩展即炸（pydantic_core 实锤）。PYTHONPATH 只需要快照源码树。
HERMES_PYTHONPATH="${HERMES_PYTHONPATH:-$AGENT_SRC}"
if [[ ! -d "$AGENT_SRC" ]]; then
  echo "[mx-lib] ⚠ hermes-agent-src 快照缺位，PYTHONPATH 将落宿主树（同上回落告警）" >&2
fi
GW_PORT="${MX_GW_PORT:-8801}"
STUDIO_PORT="${MX_STUDIO_PORT:-8802}"
LOCK_DIR="$SIM_ROOT/gateway-locks"        # 隔离锁目录：与真机 orchestrator(:8650) 共存
CREDS_DIR="$SIM_ROOT/creds"
PIDS_DIR="$SIM_ROOT/pids"
LOGS_DIR="$SIM_ROOT/logs"
EVID_DIR="${MX_EVID_DIR:-$SIM_ROOT/evidence}"
WEBUI_HOME="$SIM_ROOT/webui"

HS="${MX_HS:-http://127.0.0.1:8008}"
SERVER_NAME="${MX_SERVER_NAME:-matrix.test}"
SYNAPSE_CONTAINER="${MX_SYNAPSE_CONTAINER:-matrix-synapse}"
HOST_ORCH_HEALTH="${MX_HOST_ORCH_HEALTH:-http://127.0.0.1:8650/health}"

# V1 编制不变（12 人类 + 12 -agent 机器人）
USERS=(admin bella fanfan wei mei chen hu lin xiao qi fei arch secops ops audit)
INSTANCED_USERS=(bella fanfan wei mei chen hu lin xiao qi fei arch secops ops audit)
# 节点切片层（2026-10-12 三机真集群轮）：编制真相保持全量（驱动派活面跨机），
# 本地执行面（profile 生成/板创建/本地判活/本地真值核验）按 node_users() 切片；
# MX_NODE 未设＝solo 单机全编制（现状行为零变化）。
source "$MX_SCRIPT_DIR/mx-node.sh"
# 编制含三大治理角色（用户裁决 2026-09-25）：secops=安全管理（ISO27001）/
# ops=运维管理（ITIL/发布执行）/ audit=合规及审计管理；需求分析师=bella、
# 系统分析师=fanfan-sys-analyst+AN-* 执行者、项目管理=fanfan、系统架构=arch。

# ── 日志/凭据（沿用 V1 约定）────────────────────────────
log()  { echo "[mux $(date +%H:%M:%S)] $*"; }
fail() { echo "[mux FAIL $(date +%H:%M:%S)] $*" >&2; exit 1; }

# V8.28 修根因（run20 G2 闸 deadlock 实锤，22:24 触发）：原 fail 退出让 supervisor 30s
# 续跑回到 archgate 重发同闸——驱动死循环引擎。改：fail_to_continue 走"记录 + 派修 +
# 跳下一段"路径，绝不退出；同时记 issue_to_run 串到 G6 复盘段做总复盘。
# 14 项 fail 调用点将逐步切换。fail() 保留为强错误出口（preflight 类硬错必须退）。
issue_to_run() { # <type> <subject> <description> → 写 issues.log
  echo "ISSUE|$1|$2|$3" >> "${EVID_DIR:-/Users/cuishi/lab/ncwk-sim-mux/runs/_in_progress}/issues.log" 2>/dev/null || echo "ISSUE|$1|$2|$3" >> /tmp/issue-$$.log
  echo "[mux FAIL-CONT $(date +%H:%M:%S)] $1/$2 已记 issue，run 继续推进（不退出，G6 复盘处理）"
}
fail_to_continue() { # <type> <subject> <description> → 记录 + log + 不退出
  issue_to_run "$1" "$2" "$3"
  return 0  # 不退出，driver 继续推进
}
save_token() { mkdir -p "$CREDS_DIR"; chmod 700 "$CREDS_DIR"; printf '%s' "$2" > "$CREDS_DIR/$1.token"; chmod 600 "$CREDS_DIR/$1.token"; }
load_token() { cat "$CREDS_DIR/$1.token"; }

# ── preflight 容量自检（2026-10-08 run11 左移件 a）：容量类故障当日累计损失
# 4-5h、全部在起跑后数小时才以"等待窗耗尽"形态暴露——左移到起跑前拒绝。
# 断言①并发闸 ≥ 扇出上限（13=12 agent+fanfan 编制口径；run4/run5 串行闸默认 1
# 与并行流水线失配是三轮容量僵尸根因）；②网关源含年龄锚修复标记（run_busy
# _capacity_retry_anchor——缺失则风暴消息重入永不过期）。两断言任一不过即 fail。
# V8.29 夜间停滞根治防线①（run20 01:30-08:30 实录：venv 重建丢 anthropic extras
# → 工人整夜 60s 崩；补装未钉版 anthropic 1.14.0 → httpx2 分叉与运行时 httpx.Timeout
# 类型冲突照崩。import 检查抓不住第二类——必须真打一轮模型往返）。
mxp_worker_smoke() { # <profile> → 0 连通（缺包/版本冲突/模型断路全类抓获）
  local prof="${1:-default}" out rc
  out=$(timeout 90 "$HERMES_BIN" -p "$prof" -z "ping（连通性冒烟，只回 pong）" 2>&1); rc=$?
  if [[ $rc -ne 0 || "$(printf '%s' "$out" | tail -1)" != "pong" ]]; then
    fail "工人连通性冒烟失败（profile=$prof rc=${rc}）：$(printf '%s' "$out" | tail -2 | tr '\n' ' ')——venv 依赖回归（按 pyproject 钉版补 extras，如 anthropic==0.87.0）或模型链路断，禁起跑（夜间工人整夜崩实录）"
  fi
  log "工人连通性冒烟 ✓（$prof → pong）"
}

preflight_capacity_assert() {
  local mc anchor_ok _py
  # yaml 解释器多候选（2026-10-16 实锤：brew python 自动升 3.15 丢 site-packages 的
  # yaml，系统 python3 突然不可用即假 ERR 挡 mx-up）——venv 解释器（hermes 依赖含
  # pyyaml，wrapper 已验证可用）优先，系统 python3 兜底。
  _py=""
  for _c in "$HOME/.hermes/hermes-agent/.venv/bin/python" "$HOME/.hermes/hermes-agent/venv.py311/bin/python" python3; do
    if "$_c" -c 'import yaml' >/dev/null 2>&1; then _py="$_c"; break; fi
  done
  [[ -n "$_py" ]] || fail "preflight：无 yaml 可用解释器（venv 与系统 python3 均缺）——先修环境"
  mc=$("$_py" -c "
import yaml,sys
try: c=yaml.safe_load(open('$HERMES_ROOT/config.yaml')) or {}
except Exception as e: print('ERR:'+str(e)); sys.exit(0)
g=c.get('gateway') or {}
print(g.get('max_concurrent_sessions') or c.get('max_concurrent_sessions') or 0)" 2>/dev/null || echo ERR)
  if [[ "$mc" != "${mc#[Ee][Rr][Rr]}" || "$mc" -lt 13 ]] 2>/dev/null; then
    fail "preflight：max_concurrent_sessions=${mc} < 13（编制扇出上限）——并发闸失配（run11 三轮容量僵尸根因），先修 config（MX_MAX_CONCURRENT 或 mx-lib write_root_config 默认）再起跑"
  fi
  if grep -q "_capacity_retry_anchor" "$AGENT_SRC/gateway/run_busy.py" 2>/dev/null; then
    anchor_ok=1
  else
    fail "preflight：$AGENT_SRC/gateway/run_busy.py 缺 _capacity_retry_anchor（年龄锚修复标记）——风暴消息重入将永不过期（run11 302 次重丢根因），先同步 overlay/runtime/gateway/run_busy.py 再起跑"
  fi
  log "preflight 容量自检过：并发=${mc}≥13、年龄锚在位"
}
human_mxid() { echo "@$1:$SERVER_NAME"; }
agent_mxid() { echo "@$1-agent:$SERVER_NAME"; }
user_pass()  { echo "Aipay_$1_2026"; }
api_server_key() { grep '^API_SERVER_KEY=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2- | tr -d '"'; }
studio_url() { echo "http://127.0.0.1:$STUDIO_PORT"; }

# ── 编制表：每账号多 kanban + 各 kanban 的 agent teams（方案 §3.2）──
# 格式：<board-slug>:<agent-id>[,<agent-id>...]  每账号两块板（"多个独立 kanban"）。
# agent-id 为模板裸 id（全用户同构），agent profile 全名 = <user>-<agent-id>。
boards_of() { case "$1" in
  bella) echo "bella-req-intake:requirements-analyst bella-req-analysis:researcher" ;;
  fanfan) echo "fanfan-pm-plan:sys-analyst fanfan-review:researcher" ;;
  wei)  echo "wei-pay-core:lead-reviewer wei-pay-review:researcher" ;;
  mei)  echo "mei-cashier-mp:lead-reviewer mei-cashier-review:researcher" ;;
  chen) echo "chen-pay-core:csw-pay-core chen-pay-api:researcher" ;;
  hu)   echo "hu-channel-wechat:csw-channel-wechat hu-channel-test:researcher" ;;
  lin)  echo "lin-channel-alipay:csw-channel-alipay lin-channel-test:researcher" ;;
  xiao) echo "xiao-cashier-mp:csw-cashier-mp xiao-cashier-ui:researcher" ;;
  qi)   echo "qi-test-pay:tester qi-test-integration:researcher" ;;
  fei)  echo "fei-test-mp:tester fei-test-ui:researcher" ;;
  arch) echo "arch-governance:governance-reviewer arch-review:researcher" ;;
  secops) echo "secops-iso27001:iso-reviewer secops-audit-trail:auditor" ;;
  ops)    echo "ops-service-catalog:sre ops-release:release-manager" ;;
  audit)  echo "audit-compliance:compliance-auditor audit-evidence:evidence-auditor" ;;
  *) echo "" ;;
esac; }

# ── 应用资产表（M1 应用初始化配置）：app/owner/板/栈/SLA 级 ──
apps_of() { cat <<'APPEOF'
csw-pay-core|chen|chen-pay-core|node/axios|Gold
csw-channel-wechat|hu|hu-channel-wechat|node|Silver
csw-channel-alipay|lin|lin-channel-alipay|node|Silver
csw-cashier-mp|xiao|xiao-cashier-mp|miniprogram|Silver
APPEOF
}
first_board_of()  { boards_of "$1" | awk '{print $1}' | cut -d: -f1; }
agents_of() { boards_of "$1" | tr ' ' '\n' | sed 's/^[^:]*://' | tr ',' '\n' | sed '/^$/d' | sort -u | tr '\n' ' '; }
agent_profile() { echo "$1-$2"; }

# ── Synapse / Matrix API（与 V1 同源）──────────────────
synapse_list_users() {
  docker exec "$SYNAPSE_CONTAINER" python3 -c "
import sqlite3
db = sqlite3.connect('/data/homeserver.db')
print('\n'.join(r[0] for r in db.execute('select name from users')))
" 2>/dev/null
}
synapse_register() { # <localpart> <password>  幂等
  local u="$1" p="$2"
  if synapse_list_users | grep -qx "@$u:$SERVER_NAME"; then
    return 0
  fi
  docker exec "$SYNAPSE_CONTAINER" register_new_matrix_user \
    -c /data/homeserver.yaml -a -u "$u" -p "$p" >/dev/null 2>&1 \
    || fail "注册 matrix 用户 $u 失败"
  log "已注册 matrix 用户 @$u:$SERVER_NAME"
}
# 远端 homeserver 建号（MX_SYNAPSE_MODE=api）：synapse 注册 shared-secret 三步握手
# （nonce → HMAC-SHA1(nonce\0user\0password, secret) → POST）。幂等：已可登录即跳过。
synapse_register_api() { # <localpart> <password>
  local u="$1" p="$2" nonce mac payload
  if tok=$(mx_login "$u" "$p" 2>/dev/null) && [[ -n "$tok" && "$tok" != "null" ]]; then
    log "matrix 用户 @$u:$SERVER_NAME 已在位（登录验证通过）"
    return 0
  fi
  nonce=$(curl -sf -m 8 "$HS/_synapse/admin/v1/register" 2>/dev/null | jq -r .nonce 2>/dev/null)
  [[ -n "$nonce" && "$nonce" != "null" ]] || fail "远端注册 nonce 获取失败（$HS/_synapse/admin/v1/register 未开放？核对 MX_REG_SECRET 与 synapse registration_shared_secret）"
  mac=$(printf '%s\0%s\0%s' "$nonce" "$u" "$p" \
    | openssl dgst -sha1 -hmac "$MX_REG_SECRET" -hex 2>/dev/null | awk '{print $NF}')
  [[ -n "$mac" ]] || fail "注册 HMAC 计算失败（openssl 缺位？）"
  payload=$(jq -n --arg n "$nonce" --arg u "$u" --arg p "$p" --arg m "$mac" \
    '{nonce:$n, username:$u, password:$p, mac:$m, admin:true, type:"org.matrix.login.application_service"}')
  curl -sf -m 10 -X POST -H 'Content-Type: application/json' -d "$payload" \
    "$HS/_synapse/admin/v1/register" >/dev/null \
    || fail "远端注册 matrix 用户 $u 失败（secret 不符或接口关闭）"
  log "已注册 matrix 用户 @$u:${SERVER_NAME}（远端注册 API）"
}
mx_login() { # <localpart> <password> → access_token
  curl -sf "$HS/_matrix/client/v3/login" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"$1\"},\"password\":\"$2\"}" \
    | jq -r '.access_token'
}
# ── 称谓纪律·显示名（2026-10-14 用户指令：截图身份一律职能称呼）──────────
# 单一事实源=synapse displayname：studio 侧每次 matrix-login 经 syncMatrixMetadata
# 自动回填 users.matrix_display_name（server controllers/auth.ts:711/727），故只需
# 注册链在 token 就绪后 PUT 一次。账号名/mxid 仍是机器锚不动；仅显示名换称呼。
displayname_of() { # <账号（含 -agent 后缀）> → 职能称呼（缺省回落 localpart）
  case "$1" in
    admin)          echo "主管A" ;;
    bella)          echo "需求分析师A" ;;
    fanfan)         echo "产品经理A" ;;
    wei)            echo "团队负责人A" ;;
    mei)            echo "团队负责人B" ;;
    chen)           echo "研发工程师A" ;;
    hu)             echo "研发工程师B" ;;
    lin)            echo "研发工程师C" ;;
    xiao)           echo "研发工程师D" ;;
    qi)             echo "测试工程师A" ;;
    fei)            echo "测试工程师B" ;;
    arch)           echo "系统架构师A" ;;
    secops)         echo "安全工程师A" ;;
    ops)            echo "运维工程师A" ;;
    audit)          echo "审计师A" ;;
    admin-agent)    echo "主管AI" ;;
    bella-agent)    echo "需求分析师AI" ;;
    fanfan-agent)   echo "需求分析AI" ;;
    chen-agent)     echo "支付核心应用研发AI" ;;
    hu-agent)       echo "微信渠道应用研发AI" ;;
    lin-agent)      echo "支付宝渠道应用研发AI" ;;
    xiao-agent)     echo "收银台前端应用研发AI" ;;
    qi-agent)       echo "后端测试AI" ;;
    fei-agent)      echo "前端测试AI" ;;
    wei-agent)      echo "团队负责人AI-A" ;;
    mei-agent)      echo "团队负责人AI-B" ;;
    arch-agent)     echo "架构设计AI" ;;
    secops-agent)   echo "安全工程AI" ;;
    ops-agent)      echo "运维工程AI" ;;
    audit-agent)    echo "审计AI" ;;
    *)              echo "$1" ;;
  esac
}
mx_apply_displaynames() { # 幂等：所有人类+agent 账号 displayname → 职能称呼
  local n dn tok ok=0 total=0
  for n in "$@"; do
    total=$((total+1))
    dn=$(displayname_of "$n")
    tok=$(load_token "$n" 2>/dev/null | tr -d '\n')
    [[ -n "$tok" && "$tok" != "null" ]] || { log "⚠ displayname 跳过：${n}（token 缺）"; continue; }
    if curl -sf -m 8 -X PUT -H "Content-Type: application/json" \
      -d "{\"displayname\":\"$dn\"}" \
      "$HS/_matrix/client/v3/profile/@$n:$SERVER_NAME/displayname?access_token=$tok" >/dev/null 2>&1; then
      ok=$((ok+1))
    else
      log "⚠ displayname 写入失败：$n"
    fi
  done
  log "displayname 就绪：${ok}/${total}（职能称呼；studio 侧随 matrix-login 自动同步）"
}
mx() { # <token> <method> <api-path> [json-body]
  local token="$1" method="$2" path="$3" body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -sf -X "$method" "$HS/_matrix/client/v3/$path?access_token=$token" \
      -H 'Content-Type: application/json' -d "$body"
  else
    curl -sf -X "$method" "$HS/_matrix/client/v3/$path?access_token=$token"
  fi
}
mx_room_members() { # <token> <roomId> → 每行一个已加入成员 mxid（09-26 补定义：缺失致进群核验 8 连误报）
  mx "$1" GET "rooms/$2/joined_members" | jq -r '.joined | keys[]' 2>/dev/null || true
}
mx_room_membership() { # <token> <roomId> <mxid> → join|invite|空（缺席）
  # 进群核验语义修正（V4-run1 room-invite-gap 误报根治）：joined_members 只含已接受者，
  # 把"已邀请待接受"误判为"未邀请"，错误归罪 agent 邀请能力（实锤：run1 中 agent 19:43
  # 已邀 16/16 全 200，22:49 核验仍记 7 条能力缺口问题单）。邀请是否发出=agent 职责；
  # 接受与否=受邀方行为。核验 agent 履职须用本函数按 invite|join 双态判定。
  mx "$1" GET "rooms/$2/state/m.room.member/$3" 2>/dev/null | jq -r '.membership // empty' 2>/dev/null || true
}
backfill_nudge() { # <token> <roomId> <text> <mention-csv> <issue-key> <issue-body> → event_id
  # 姿态感知回灌（V8.29 §2.4 待收紧面 10/11：补登/核验回灌的 strict 替代）：
  # standard=照发回灌消息（代演组织侧催办，落台账 dispatch-preset 同族）；
  # strict=不发（催办归组织侧自主），只记 ISSUE 呈现缺口——「不代偿」语义的
  # 文字版（与 walk_done/dispatch_in_room 的 strict 分支同构）。
  local _tok="$1" _room="$2" _text="$3" _mention="${4:-}" _key="$5" _body="$6"
  if [ "$(posture)" = "strict" ]; then
    echo "ISSUE|${_key}|director|${_body}（strict 姿态不回灌代催——缺口如实呈现，等组织侧自主处置）" \
      >> "${EVID_DIR:-${SIM_ROOT:-/tmp}/evidence}/issues.log" 2>/dev/null || true
    log "[姿态] strict：${_key} 不回灌——记录呈现缺口"
    printf 'STRICT-SKIPPED'
    return 0
  fi
  compensate dispatch-preset "backfill ${_key}（补登/核验回灌代催）" 2>/dev/null || true
  mx_send "$_tok" "$_room" "$_text" "$_mention"
}

mx_send() { # <token> <roomId> <text> [mentioned-mxid[,mxid2...]] → event_id
  # 瞬断/限流重试 3 次；全败回 SEND-FAILED 且返回 0——set -euo pipefail 下
  # 赋值非零即静默击杀整个脚本（09-26 实锤：arch 派发一击致死 28s 无声退出）。
  local token="$1" room="$2" text="$3" mention="${4:-}"
  local mentions='{}' out i
  if [[ -n "$mention" ]]; then
    mentions=$(echo "$mention" | tr ',' '\n' | jq -R . | jq -s '{user_ids:.}')
  fi
  for i in 1 2 3; do
    out=$(mx "$token" POST "rooms/$room/send/m.room.message" \
      "{\"msgtype\":\"m.text\",\"body\":$(jq -Rn --arg t "$text" '$t'),\"m.mentions\":$mentions}" 2>/dev/null \
      | jq -r '.event_id' 2>/dev/null) || out=""
    [[ -n "$out" && "$out" != "null" ]] && { printf '%s' "$out"; return 0; }
    # 退避只在尝试之间（末次失败不再空等 6s）
    [[ $i -lt 3 ]] && sleep $((i*2))
  done
  printf 'SEND-FAILED'
}
mx_messages() { # <token> <roomId> [limit] → 倒序 m.room.message 数组
  local token="$1" room="$2" limit="${3:-80}"
  curl -sf "$HS/_matrix/client/v3/rooms/$room/messages?access_token=$token&dir=b&limit=$limit" \
    | jq -c '[.chunk[] | select(.type == "m.room.message")]'
}
mx_wait_sender() { # <token> <roomId> <sender-mxid> <marker-event-id> <timeout> [pattern] → body
  local token="$1" room="$2" sender="$3" marker="$4" timeout="${5:-420}" pattern="${6:-.}"
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    local body
    body=$(mx_messages "$token" "$room" 60 | jq -r --arg s "$sender" --arg m "$marker" --arg p "$pattern" '
      (map(.event_id) | index($m) // -1) as $i
      | (if $i < 0 then . else .[0:$i] end)
      | map(select(.sender == $s and ((.content.body // "") | length > 0)))
      | map(select(.content.body | test($p)))
      | if length > 0 then .[0].content.body else empty end') || true
    [[ -n "$body" ]] && { echo "$body"; return 0; }
    sleep 8
  done
  return 1
}
mx_create_room() { # <token> <name> [invite-csv] → room_id
  local token="$1" name="$2" invite="${3:-}"
  # backlog① 观察员位（2026-10-06）：env MATRIX_ROOM_OBSERVERS（逗号/空白分隔 mxid）
  # 并入邀请名单——不在邀请名单的账号房间不进其 /sync、产品房间列表不可见
  # （导演/观察账号靠此入房）。缺省未设=行为不变。与产品侧 resolveRoomObservers 同名同义。
  if [[ -n "${MATRIX_ROOM_OBSERVERS:-}" ]]; then
    invite="${invite:+$invite,}${MATRIX_ROOM_OBSERVERS}"
    invite=$(echo "$invite" | tr ',' '\n' | tr -s '[:space:]' '\n' | sed '/^$/d' | sort -u | paste -sd, -)
  fi
  local invites='[]'
  [[ -n "$invite" ]] && invites=$(echo "$invite" | tr ',' '\n' | jq -R . | jq -s .)
  # 建群邀请分批（2026-10-01 run6 实锤）：synapse 对 createRoom 单请求 invite 数有
  # 未文档化上限——17 邀报 M400 "Cannot invite so many users at once"，且 rc_invites_per_room
  # 等放宽到 1000 后仍拦（3/10 邀过、17 邀拒的分界实验）。首请求只带前 8 人，其余逐个
  # /invite 补齐；全量预邀语义不变，漏邀由 room-invite-gap 真值核验兜底。
  local first rest rid u _miss=0
  first=$(echo "$invites" | jq -c '.[:8]')
  rest=$(echo "$invites" | jq -c '.[8:]')
  rid=$(mx "$token" POST createRoom "$(jq -n --arg n "$name" --argjson i "$first" \
    '{name:$n, preset:"private_chat", invite:$i}')" | jq -r '.room_id')
  [[ "$rid" == '!'* ]] || { echo "$rid"; return 1; }
  for u in $(echo "$rest" | jq -r '.[]'); do
    mx "$token" POST "rooms/$rid/invite" "$(jq -nc --arg u "$u" '{user_id:$u}')" >/dev/null 2>&1 || _miss=$((_miss+1))
  done
  (( _miss == 0 )) || echo "[mx_create_room] 补邀 $_miss 人失败（room=${rid}，真值核验将把关）" >&2
  # 推演房间打标（2026-10-21 用户授权跨仓改动）：全成员可见的房间级状态事件
  # com.swarmstudio.sim/run，产品端据此显示「推演」徽标并把观察房间分组。失败仅
  # 告警不阻断建房（房间照常可用；客户端另有 run-state 房间集兜底识别）。
  mx "$token" PUT "rooms/$rid/state/com.swarmstudio.sim/run" \
    "$(jq -nc --arg run "${RUN_ID:-}" --arg rfd "${RFD_ID:-}" --arg ts "$(date +%s)" \
      '{run:$run, rfd:$rfd, taggedAt:($ts|tonumber)}')" >/dev/null 2>&1 \
    || echo "[mx_create_room] sim 打标失败（room=${rid}，不影响建房）" >&2
  echo "$rid"
}
mx_join() { mx "$1" POST "rooms/$2/join" '{}' >/dev/null 2>&1 || true; }
# mx_join 的检错+退避重试变体（2026-10-06 实锤：Synapse 限流 burst 下 join/invite
# 静默失败，尾部账号掉队无人知——delivery 案例房 28 账号缺 12、run9 房间缺员同族）。
# 循环里成批入房一律用 mx_join_retry；mx_join 保留给"失败无碍"的宽容路径。
mx_join_check() { mx "$1" POST "rooms/$2/join" '{}' >/dev/null 2>&1; }
mx_join_retry() { local i; for i in 1 2 3 4; do mx_join_check "$1" "$2" && return 0; sleep 1; done; return 1; }

# ── 临时物清理（Z6）：studio() 的 /tmp/mx-api.$$ 正常路径即用即删，EXIT trap 兜住
#    中途退出/被杀时的残留。引用本库的脚本可重定义 mx_cleanup 扩展清理面（trap 只挂
#    这一次，退出时按最新定义执行），不要另挂 EXIT trap——bash 只有一个，会互相覆盖。──
mx_cleanup() { rm -f "/tmp/mx-api.$$"; }
trap mx_cleanup EXIT

# ── Studio API（单实例多账号）──────────────────────────
studio() { # <method> <path> [jwt] [json-body]
  local method="$1" path="$2" jwt="${3:-}" body="${4:-}"
  local args=(-s -X "$method" "$(studio_url)$path" -o "/tmp/mx-api.$$" -w '%{http_code}')
  [[ -n "$jwt" ]] && args+=(-H "Authorization: Bearer $jwt")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  local code
  code=$(curl "${args[@]}") || { rm -f "/tmp/mx-api.$$"; return 1; }
  cat "/tmp/mx-api.$$"; rm -f "/tmp/mx-api.$$"
  [[ "$code" == 2* ]] || return 1
}
studio_login() { # 本地 admin（管理面）——matrix 交换链（2026-10-06 实测：静态口令 admin/123456
  # 已在库中被废，/api/auth/login 拒绝；真实链路=synapse 登 admin → /api/auth/matrix-login
  # 交换 super_admin JWT，与界面自动登录同源。P13 探针锚：registry PUT=9e1c670）
  local mt
  mt=$(mx_login admin "$(user_pass admin)" | tr -d '\n') || return 1
  studio POST /api/auth/matrix-login "" "$(jq -n \
    --arg tok "$mt" --arg uid "$(human_mxid admin)" --arg hs "$HS" \
    '{matrixAccessToken:$tok, matrixUserId:$uid, homeserverUrl:$hs}')" | jq -r '.token // empty'
}

gov_registry_put() { # <kind> <md-file> <message>：注册表经产品同源通道落档（P13 改回）
  # 走界面所走端点 PUT /api/governance/registry/<kind>（保存即 git 提交，R13）——
  # AccountAdminView/AppRegistryEditor/OrgEditor 的"保存（提交 git）"即此通道；
  # 服务端 repoRoot=DIRECTOR_CLONE 同仓，调用后 repo_commit_main 推 origin/main 不变。
  local kind="$1" f="$2" msg="$3" tok body
  tok=$(studio_login) || return 1
  body=$(jq -n --arg md "$(cat "$f")" --arg m "$msg" '{markdown:$md,message:$m,actor:"scenario-director"}')
  studio PUT "/api/governance/registry/$kind" "$tok" "$body" | jq -e '.commit' >/dev/null
}

gov_role_of() { # <user> → org_gen 同源角色（R31 产品通道 provision 的 role 字段）
  case "$1" in
    bella)  echo "需求分析师（BA）" ;;
    fanfan) echo "项目管理（PM）+ 系统分析主持" ;;
    wei)    echo "支付后端 lead（系统分析师）" ;;
    mei)    echo "前端 lead" ;;
    chen|hu|lin|xiao) echo "研发（系统分析执行+编码）" ;;
    qi|fei) echo "测试（独立验证）" ;;
    arch)   echo "系统架构（G2 架构治理）" ;;
    secops) echo "安全管理（ISO27001/涉敏评估/发布安全）" ;;
    ops)    echo "运维管理（ITIL/服务目录/发布执行/回滚）" ;;
    audit)  echo "合规及审计管理（门禁留痕/凭证抽检/合规意见）" ;;
    *)      echo "成员" ;;
  esac
}

# ── 清偿台账稳定入口（2026-10-19 ledger 503 配置）────────────────────────
# 产品端点 /api/hermes/orgloop/ledger 只认 ORGLOOP_LEDGER_TSV（缺席/指向不存在文件
# =fail-closed 503）；台账本体仍按轮落 runs/<RUN>/evidence/compensation-ledger.tsv
# （单一事实源，不复制写入）。本函数维护 var/current-compensation-ledger.tsv 软链：
#   有在办轮 → 该轮台账（首次创建只写表头）；无轮 → var/compensation-ledger.empty.tsv
#   （同样只有表头）→ 端点返回 200/0 笔，不再是 503；轮开始后同一路径自动跟到真实台账。
MX_LEDGER_LINK="$SIM_ROOT/var/current-compensation-ledger.tsv"
MX_LEDGER_EMPTY="$SIM_ROOT/var/compensation-ledger.empty.tsv"
mx_sync_ledger_link() {
  mkdir -p "$SIM_ROOT/var" 2>/dev/null || true
  if [ ! -f "$MX_LEDGER_EMPTY" ]; then
    printf 'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\n' > "$MX_LEDGER_EMPTY" 2>/dev/null || true
  fi
  local target="" cur=""
  if [ -n "${RUN_ID:-}" ]; then
    target="$SIM_ROOT/runs/$RUN_ID/evidence/compensation-ledger.tsv"
    mkdir -p "$(dirname "$target")" 2>/dev/null || true
  else
    [ -L "$SIM_ROOT/var/current-state.env" ] && cur="$(readlink "$SIM_ROOT/var/current-state.env" 2>/dev/null || true)"
    case "$cur" in
      */runs/*/state.env) [ -f "$cur" ] && target="$(dirname "$cur")/evidence/compensation-ledger.tsv" ;;
    esac
  fi
  if [ -n "$target" ]; then
    if [ ! -f "$target" ]; then
      mkdir -p "$(dirname "$target")" 2>/dev/null || true
      printf 'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\n' > "$target" 2>/dev/null || true
    fi
  else
    target="$MX_LEDGER_EMPTY"
  fi
  ln -sfn "$target" "$MX_LEDGER_LINK" 2>/dev/null \
    || cp -f "$target" "$MX_LEDGER_LINK" 2>/dev/null || true
}

ensure_spawn_health() { # 执行面预检（run20 00:30 瘫痪实录：宿主拆 venv 全绿假象）
  if ! ("$SIM_ROOT/bin/hermes-sim" --help >/dev/null 2>&1 || true) && ! bash -n "$SIM_ROOT/bin/hermes-sim" 2>/dev/null; then
    fail "执行面瘫痪：bin/hermes-sim 不可用（wrapper 报错行有修法）"
  fi
}

ensure_studio_up() { # studio 幂等拉起（R31：可先于 gateway——/health/ready 只看自身 bootstrap，
  # 不探 gateway；env 与 mx-up 同款，单一事实源=本函数，mx-up 亦调用）
  curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1 && return 0
  local api_key; api_key=$(api_server_key)
  # 双重 fork 脱钩（run12/run15 冷起两次实锤）：直接 `( nohup node & echo $! )` 经 bash
  # 子壳优化后 node 成调用者直子、studio.pid 误记外层 pid，mx-up 收口 wait4 挂死
  # （仅 kill 外层可解，studio 无恙）。内层 bash 托孤 launchd，$! 即 node 真身。
  mx_sync_ledger_link
  ( cd "$SIM_ROOT" && \
  NODE_ENV=production PORT="$STUDIO_PORT" HERMES_HOME="$HERMES_ROOT" OBS_SIM_ROOT="$SIM_ROOT" \
  ORGLOOP_LEDGER_TSV="${ORGLOOP_LEDGER_TSV:-$MX_LEDGER_LINK}" \
  SIM_BRANCHES_REPO="${SIM_BRANCHES_REPO:-$SIM_ROOT/central/aipaydev}" \
  SIM_ANCHOR_REPO="${SIM_ANCHOR_REPO:-$SIM_ROOT/central/aipaydev}" \
  HERMES_SKIP_UPDATE=1 HERMES_WEB_UI_HOME="$WEBUI_HOME" HERMES_WEBUI_STATE_DIR="$WEBUI_HOME" \
  AGENT_IDENTITY_STORE="$WEBUI_HOME/agent-identity" HERMES_INCIDENT_TRACE_DIR="$HERMES_ROOT/traces" \
  EVAL_STORE="$WEBUI_HOME/eval" REDTEAM_STORE="$WEBUI_HOME/redteam" HELDOUT_STORE="$WEBUI_HOME/heldout" \
  EVAL_TRACE_DIR="$HERMES_ROOT/traces" HERMES_TRACES_DIR="$HERMES_ROOT/traces" \
  HERMES_AGENT_HEALTH_URL="http://127.0.0.1:$GW_PORT" GATEWAY_PORT="$GW_PORT" \
  HERMES_BIN="$HERMES_BIN" API_SERVER_KEY="$api_key" \
  GRAPH_ENGINE="${MX_GRAPH_ENGINE:-shadow}" \
  CLUSTER_INSPECTOR_NUDGE="${MX_CI_NUDGE:-on}" \
  CLUSTER_INSPECTOR_NUDGE_ROOM="${MX_CI_NUDGE_ROOM:-!tDKINzVMrNVavKvLOF:matrix.test}" \
  CLUSTER_INSPECTOR_NUDGE_REPO="${MX_CI_NUDGE_REPO:-$SIM_ROOT/central/aipaydev}" \
  CLUSTER_INSPECTOR_STUCK_MS="${MX_CI_STUCK_MS:-900000}" \
  CLUSTER_INSPECTOR="${MX_CI:-on}" \
    /bin/bash -c 'nohup node "$1" > "$2" 2>&1 < /dev/null & echo $! > "$3"' _ \
    "$STUDIO_DIST/server/index.js" "$LOGS_DIR/studio.log" "$PIDS_DIR/studio.pid" )
  local deadline=$(( $(date +%s) + 120 ))
  while (( $(date +%s) < deadline )); do
    curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

gov_provision_user() { # <user>：账号经邀请流产品通道供给（D21 2026-10-17 用户裁定：
  # 仿真 30 账号切 POST /api/governance/invites——与 /app/accounts「邀请账号」同源，
  # 口令由服务端生成并落 creds/<user>.invite-pass；建号即 roster+invites 双台账提交）。
  # 幂等：账号在位即跳过（appendTableRow 不去重，重复调会加重复行——在位跳过是
  # 硬约束，R28 对账兜底）。回退：端点 404（旧 studio 无 invites）时回落 matrix-users
  # 旧通道并 log 标注，升级窗口内不阻断开轮。
  local u="$1" tok body rc
  if synapse_list_users | grep -qx "@$u:$SERVER_NAME"; then
    return 0
  fi
  tok=$(studio_login); [[ -n "$tok" ]] || { log "gov_provision_user: studio 登录失败"; return 1; }
  local mt; mt=$(mx_login admin "$(user_pass admin)" | tr -d '\n')
  [[ -n "$mt" && "$mt" != "null" ]] || { log "gov_provision_user: admin matrix 登录失败"; return 1; }
  body=$(jq -n --arg n "$u" --arg role "$(gov_role_of "$u")" \
    --arg at "$mt" --arg hs "$HS" --arg dn "$(displayname_of "$u")" \
    '{localName:$n,role:$role,adminToken:$at,homeserverUrl:$hs,withAgent:"true",expiresInHours:720}')
  local resp
  resp=$(studio POST /api/governance/invites "$tok" "$body"); rc=$?
  if [[ $rc -ne 0 ]] || ! echo "$resp" | jq -e '.invitesCommit' >/dev/null 2>&1; then
    log "invites 端点未就绪（${resp}）——回落 matrix-users 旧通道（升级窗口内）"
    body=$(jq -n --arg n "$u" --arg role "$(gov_role_of "$u")" \
      --arg pw "$(user_pass "$u")" --arg at "$mt" --arg hs "$HS" --arg dn "$(displayname_of "$u")" \
      '{localName:$n,role:$role,password:$pw,adminToken:$at,homeserverUrl:$hs,withAgent:"true",displayName:$dn}')
    studio POST /api/governance/matrix-users "$tok" "$body" | jq -e '.rosterCommit' >/dev/null
    return $?
  fi
  # 邀请口令落 creds（后续 mx_login 需要口令登录账号——首轮登录后 synapse 侧
  # 即可用既有 token 流；口令文件 600，轮次归档随 creds 目录既有纪律处置）
  local invpw; invpw=$(echo "$resp" | jq -r '.initialPassword // empty')
  if [[ -n "$invpw" ]]; then
    mkdir -p "$CREDS_DIR"
    printf '%s' "$invpw" > "$CREDS_DIR/$u.invite-pass"
    chmod 600 "$CREDS_DIR/$u.invite-pass"
  fi
  echo "$resp" | jq -e '.rosterCommit' >/dev/null
}
studio_matrix_login() { # <user-human-localpart> → jwt（matrix 账号换 JWT）
  local u="$1"
  studio POST /api/auth/matrix-login "" "$(jq -n \
    --arg t "$(load_token "$u")" --arg m "$(human_mxid "$u")" --arg h "$HS" \
    '{matrixAccessToken:$t, matrixUserId:$m, homeserverUrl:$h}')" | jq -r '.token'
}

# ── kanban 原语（一律显式 --board 钉板）─────────────────
mx_kanban() { # <board> <hermes-kanban-args...>
  local board="$1"; shift
  HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban --board "$board" "$@"
}

# ── 运行时 patch 部署（安装树；同 aipay-agent-sync 的安全语义）──
# ── SIM 执行面快照供给（隔离轮 2026-10-03）：推演自持，不共享宿主/活树 ──
# ①agent 源码快照：宿主 hermes-agent 是 git 仓——git archive HEAD 出纯净跟踪源
#   （钉版本、无 venv/垃圾），原子换入 ${AGENT_SRC}；hermes-sim wrapper 用宿主 venv
#   python（只借依赖环境，绝不写）+ sys.path 前置快照源 → sim 网关执行的全是快照代码，
#   宿主自更新/产品补丁操作不再互相污染。②product-dist 快照：rsync 注入树 dist 一次，
#   推演期间产品可自由 clean/inject。两快照 provenance 落 JSON 可审计。
_mx_provenance() { # <file> <k=v>…：写/读快照来源档案
  local f="$1"; shift
  if [[ "$1" == "--read" ]]; then cat "$f" 2>/dev/null; return 0; fi
  printf '{\n' > "$f"
  local first=1 kv
  for kv in "provisioned_at=$(date -u +%FT%TZ)" "$@"; do
    [[ $first = 1 ]] || printf ',\n' >> "$f"; first=0
    printf '  "%s": "%s"' "${kv%%=*}" "${kv#*=}" >> "$f"
  done
  printf '\n}\n' >> "$f"
}
mx_provision_agent_src() {
  local host_tree="${HERMES_AGENT_SRC_FROM:-$HOME/.hermes/hermes-agent}"
  [[ -d "$host_tree/.git" ]] || { log "⚠ 宿主 hermes-agent 非 git 仓（${host_tree}）——跳过源码快照供给，执行面维持回落态"; return 0; }
  local head; head=$(git -C "$host_tree" rev-parse HEAD)
  # 快照键=HEAD+工作树脏态指纹：宿主补丁态即工作树态（存在 8+ 文件未提交的实跑态），
  # 只取 HEAD 会漏（隔离轮实锤：archive HEAD 缺 StdioServerParameters 等运行态，
  # 网关卡 MCP 连接环）。快照源=git 跟踪文件的工作态（含未提交改动，天然排除
  # venv/node_modules 等非跟踪重物）。
  local dirty; dirty=$( { git -C "$host_tree" diff HEAD; git -C "$host_tree" status --porcelain; } 2>/dev/null | shasum | cut -c1-12)
  local key="${head:0:9}+${dirty}"
  local cur; cur=$(_mx_provenance "$AGENT_SRC.provenance.json" --read | sed -n 's/.*"snapshot_key": "\([^"]*\)".*/\1/p')
  if [[ "$cur" == "$key" && -x "$SIM_ROOT/bin/hermes-sim" && -d "$AGENT_SRC/gateway" ]]; then
    log "agent 源码快照已在位且同步（key=${key}）——跳过"
    return 0
  fi
  log "供给 agent 源码快照：${host_tree} 工作态 @ ${key} → $AGENT_SRC"
  local tmp="$AGENT_SRC.tmp.$$"
  rm -rf "$tmp"; mkdir -p "$tmp"
  git -C "$host_tree" ls-files -z > "$tmp.files0" \
    && mxp_copy_git_tracked "$host_tree" "$tmp" "$tmp.files0" \
    && rm -f "$tmp.files0" || { rm -rf "$tmp"; fail "跟踪文件工作态快照失败"; }
  rm -rf "$AGENT_SRC"; mv "$tmp" "$AGENT_SRC"
  # git 化快照：mx_apply_agent_patches 的 git apply/反向幂等检查需要 .git（archive 是纯净抽出）
  git -C "$AGENT_SRC" init -q && git -C "$AGENT_SRC" add -A \
    && git -C "$AGENT_SRC" -c user.name=sim-snapshot -c user.email=sim@snapshot commit -qm "snapshot @ $key" \
    || { rm -rf "$AGENT_SRC"; fail "快照 git 化失败"; }
  mkdir -p "$SIM_ROOT/bin"
  local venv_py
  # venv 多候选（2026-10-16 快照 0.22.2 轮）：宿主自更新拆 venv 形态（0.22.1 起
  # .venv/venv.py311 并存、旧 venv/ 消失）——单钉 venv/bin/python 必假失败挡供给。
  # 候选序与巡检官 spawnHealthProbe 同源；首个存在且可 import anthropic+mautrix
  # 者胜出（缺依赖的候选跳过，防拆半 venv）。
  local _cand
  if mxp_is_gbash; then
    _cand=("$HOME/.hermes/hermes-agent/.venv/Scripts/python.exe" "$HOME/.hermes/hermes-agent/venv/Scripts/python.exe")
  else
    _cand=("$HOME/.hermes/hermes-agent/.venv/bin/python" "$HOME/.hermes/hermes-agent/venv.py311/bin/python" "$HOME/.hermes/hermes-agent/venv/bin/python")
  fi
  venv_py=""
  for _c in "${_cand[@]}"; do
    [[ -x "$_c" ]] || continue
    if "$_c" -c 'import anthropic, mautrix' >/dev/null 2>&1; then venv_py="$_c"; break; fi
  done
  [[ -n "$venv_py" ]] || fail "宿主无可用 venv python（候选：${_cand[*]}——均缺失或缺 anthropic+mautrix）——wrapper 依赖环境不可用"
  # wrapper 必须 -I 复刻官方 venv wrapper 语义（隔离轮实锤）：-I 无视 PYTHONPATH，
  # 依赖一律取自 venv 自身 site-packages——否则 installs 环境（py3.14）的原生扩展
  # 混入 py3.11 venv 即 pydantic_core 加载炸 → mcp SDK 导入环（网关 MCP 告警环实录）。
  cat > "$SIM_ROOT/bin/hermes-sim.py" <<'WRAPPY'
# hermes-sim — 推演隔离 wrapper（生成于 mx-lib mx_provision_agent_src，勿手改）
import re, sys
sys.path.insert(0, "@AGENT_SRC@")
sys.argv[0] = re.sub(r"(-script\.pyw|\.exe)?$", "", sys.argv[0])
from hermes_cli.main import main
sys.exit(main())
WRAPPY
  # GNU sed 不认 `sed -i ''`（'' 被当脚本、真脚本被当文件名，wrapper 生成必炸）——
  # 便携式原地替换：tmp+mv（BSD/GNU 通用，顺带原子）
  _wpy="$SIM_ROOT/bin/hermes-sim.py"
  sed "s|@AGENT_SRC@|$AGENT_SRC|" "$_wpy" > "${_wpy}.tmp" && mv "${_wpy}.tmp" "$_wpy"
  cat > "$SIM_ROOT/bin/hermes-sim" <<WRAP
#!/bin/bash
# 借宿主 venv 依赖环境（只读），代码取 SIM 源码快照；-I 与官方 wrapper 同源语义。
exec "$venv_py" -I "$SIM_ROOT/bin/hermes-sim.py" "\$@"
WRAP
  chmod +x "$SIM_ROOT/bin/hermes-sim"
  _mx_provenance "$AGENT_SRC.provenance.json" "snapshot_key=$key" "source_head=$head" "dirty=$dirty" "source_tree=$host_tree" "harness_commit=$(git -C "$HARNESS_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  log "✓ agent 源码快照就绪（wrapper=$SIM_ROOT/bin/hermes-sim）"
  # V8.29 垫片供给（巡检官卡面聚合器）：bin/hermes 无板 list/diagnostics 归一——
  # 产品巡检官卡类采集面依赖；mx-clean 重建后自动恢复（供给源=mux/mx-hermes-shim.py）
  if [[ -f "$HARNESS_ROOT/mux/mx-hermes-shim.py" ]] && [[ ! -e "$SIM_ROOT/bin/hermes" ]]; then
    cp "$HARNESS_ROOT/mux/mx-hermes-shim.py" "$SIM_ROOT/bin/hermes"
    chmod +x "$SIM_ROOT/bin/hermes"
    log "✓ hermes 垫片就绪（无板聚合器，mx-hermes-shim.py 供给）"
  fi
}
mx_provision_product_dist() {
  [[ "${MX_SKIP_SNAPSHOT:-}" = 1 ]] && { log "MX_SKIP_SNAPSHOT=1——跳过 product-dist 快照（studio 将服务活注入树）"; return 0; }
  local live="$NCWK_ROOT/upstream/hermes-studio/dist"
  [[ -f "$live/server/index.js" ]] || { log "⚠ 活注入树无构建产物（${live}）——跳过 dist 快照"; return 0; }
  local ovl; ovl=$(git -C "$OVERLAY_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
  # dist mtime 跨端取法收敛进平台层（BSD/GNU/python 三兜底；Git Bash 的 stat 是
  # coreutils 版走 GNU 分支，纯 BSD 单边处不再静默失败）
  # 新鲜度取服务端入口 + 客户端 index 双 mtime：只盯 server/index.js 会把
  # 「只重建客户端」的批次误判为已同步（2026-10-19 走查实证：RunSelector 修复被跳过）。
  local stamp_srv stamp_cli stamp
  stamp_srv=$(mxp_file_mtime "$live/server/index.js")
  stamp_cli=$(mxp_file_mtime "$live/client/index.html")
  stamp="${stamp_srv}__${stamp_cli}"
  local cur; cur=$(_mx_provenance "$PRODUCT_DIST.provenance.json" --read | sed -n 's/.*"dist_mtime": "\([^"\\]*\)".*/\1/p')
  if [[ "$cur" == "$stamp" && -f "$PRODUCT_DIST/server/index.js" ]]; then
    log "product-dist 快照已在位且同步（dist_mtime=${stamp}）——跳过"
  else
    log "供给 product-dist 快照：${live}（dist_mtime=$stamp, overlay=${ovl}）→ $PRODUCT_DIST"
    mkdir -p "$PRODUCT_DIST"
    mxp_sync_dir "$live/" "$PRODUCT_DIST/" mirror node_modules || fail "dist 快照同步失败"
    _mx_provenance "$PRODUCT_DIST.provenance.json" "overlay_commit=$ovl" "dist_mtime=$stamp"
  fi
  # dist 是 bundle 但外部依赖（socket.io/node-pty 等 9 包+传递树）从仓库根 node_modules
  # 解析——快照目录链上没有（iso4 实锤：studio 300s 未就绪=Cannot find module 'socket.io'）。
  # node_modules 全量镜像进快照（1.4G 一次落，后续 rsync 增量秒级；不用 --delete——
  # 活树 npm 卸载残留包对启动无害，镜像删反而会在活树 npm install 半程撞脏态）。
  local live_nm="$NCWK_ROOT/upstream/hermes-studio/node_modules"
  if [[ -d "$live_nm" && ! -d "$PRODUCT_DIST/node_modules/socket.io" ]]; then
    log "供给 node_modules 镜像：${live_nm} → $PRODUCT_DIST/node_modules（约 1.4G，一次性）"
    mxp_sync_dir "$live_nm/" "$PRODUCT_DIST/node_modules/" || fail "node_modules 镜像同步失败"
  fi
  log "✓ product-dist 快照就绪"
}

mx_apply_agent_patches() {
  local tree="${HERMES_AGENT_TREE:-$AGENT_SRC}"
  [[ -d "$tree/.git" ]] || fail "不是 git 仓库：$tree"
  # 长会话治理轮（2026-10-11）：401/457 首次入 SIM 通道（此前仅工作区树可达，SIM/宿主从未执行）；601-605 新增（心跳/遥测/轮换/检查点/监督接线）。
  for p in 390-agent-kanban-home-default-board.patch 391-agent-kanban-board-team-fence.patch 533-agent-gateway-capacity-storm.patch 534-agent-gateway-outbound-notice-guard.patch 564-agent-response-delivery-fallback.patch 569-agent-kanban-gate-guard.patch 586-agent-gateway-wedged-agent-sweep.patch 593-agent-per-tool-allowlist.patch 594-agent-tool-audit-ledger.patch 595-agent-usage-anomaly-watch.patch 596-agent-write-fence-roots.patch 599-agent-turn-ended-audit.patch 600-agent-assignee-realname.patch 401-agent-runaway-guard-six-signals.patch 457-agent-runaway-supervisor.patch 601-agent-rule-heartbeat.patch 602-agent-session-telemetry.patch 603-agent-session-rotation.patch 604-agent-handoff-checkpoint.patch 605-agent-runaway-supervisor-wiring.patch 609-agent-kanban-blocker-auth-degrade.patch 611-agent-session-rotation-itercap.patch 612-agent-capacity-retry-anchor.patch 636-agent-turn-end-delivery-guard.patch 637-agent-gateway-continuation-pump.patch 643-agent-mautrix-darwin-ungate.patch; do  # 636=干完不交卷 push 兜底；637=网关续作泵（静默根治，V8.35）；643=darwin 裸 mautrix 解门控（原拟 638 与 638-server-simcenter-routes 撞号改 643）（2026-10-17 macOS pm 正规安装无 mautrix 根治，B 案正路；配套锁重解+mx-sim-mautrix-ensure.sh A 案兜底）
    local pf="$PATCH_DIR/$p"
    [[ -f "$pf" ]] || fail "缺 patch 文件：$pf"
    if git -C "$tree" apply --reverse --check "$pf" >/dev/null 2>&1; then
      log "运行时 patch 已在位：$p"; continue
    fi
    if ! git -C "$tree" apply --check "$pf" >/dev/null 2>&1; then
      # 源码树漂移（自更新推进）致上下文失配：查补丁新增符号是否已在 SIM 安装环境在位
      # ——在位=运行时行为已生效（installs 分发物已带），如实记档跳过；缺位才真失败。
      # 标记多候选（2026-10-16 快照 0.22.2 升级轮）：原「首个 ^+(def|class)」在 533 实锤
      # 抓到的是测试函数名（源面全是缩进方法 def，顶层 def 只在 tests）——新树 tests
      # 无该名即假 fail 挡供给。改为：全部 def/class 符号（含缩进方法）且排除 test_
      # 前缀，任一在源码树在位=语义在位跳过。
      # 语义在位检查双面：installs/ 分发物 + 源码树本体（534 实锤：manifest 文件同步
      # 已把守卫/接线放进源码树，git apply 与内容副本冲突——语义在位即跳过，不 fail）
      # 扫描面=五个代码目录而非仅 gateway/（390 实锤：marker _home_default_board 在
      # hermes_cli/、391 在 kanban_db——只扫 gateway/ 必漏，退化去扫 installs 既慢
      # 又可能扑空误 fail）。
      # 顺序根治（隔离轮实锤）：源码树快查在前（deploy 已同步 runtime 文件时秒中）；
      # installs 树含 venv/site-packages 上千 MB 二进制——加过滤防 marker 兜底挂死
      # （旧序曾对 installs 盲扫 8min+ 卡死 mx-up）。
      local _found=0 _m
      while IFS= read -r _m; do
        [ -n "$_m" ] || continue
        if grep -rql --include='*.py' "$_m" "$tree/gateway/" "$tree/hermes_cli/" "$tree/tools/" "$tree/agent/" "$tree/plugins/" "$tree/tests/" 2>/dev/null \
           || grep -rql --include='*.py' --exclude-dir=venv --exclude-dir=site-packages "$_m" "$HERMES_ROOT/installs/" 2>/dev/null; then
          _found=1; _marker="$_m"; break
        fi
      done < <(grep -oE '^\+[[:space:]]*(def|class) [A-Za-z_0-9]+' "$pf" | sed -E 's/^\+[[:space:]]*(def|class) //' | grep -v '^test_' | sort -u)
      if [ "$_found" = 1 ]; then
        log "运行时 patch 语义已在位（安装环境或源码树，内容副本同步渠道）：${p}（marker=${_marker}）"
        continue
      fi
      fail "$p 与安装树冲突且语义未在位（marker=${_marker:-无}）——人工处置后重跑"
    fi
    git -C "$tree" apply --whitespace=nowarn "$pf" || fail "$p 应用失败"
    log "运行时 patch 已部署：$p → $tree"
  done
}

# ── profile/manifest 生成 ───────────────────────────────
write_root_config() {
  mkdir -p "$HERMES_ROOT" "$LOCK_DIR" "$CREDS_DIR" "$PIDS_DIR" "$LOGS_DIR" "$EVID_DIR" "$WEBUI_HOME"
  chmod 700 "$SIM_ROOT"
  _mxpy=$(_mx_yaml_py) || fail "write_root_config：无 yaml 可用解释器（venv 与系统 python3 均缺）——先修环境"
  GW_PORT="$GW_PORT" "$_mxpy" - "$HOME/.hermes/config.yaml" > "$HERMES_ROOT/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['gateway'] = {'multiplex_profiles': True}   # 单 gateway 多路复用（方案 §2.2 #1）
# LLM 通道并发闸：run4/run5 时代 MGLM 单池仅耐 1-2 并发（1302 限流 429 重试风暴），
# 串行闸 1 是当时实证值。2026-10-08 run11 三轮容量事故钉死策略失配：V8 方案 §4.2
# 并行流水线设计容量=4（编码 2+测试预备 2），max=1 使 64 位容量重试队列被 13 路群
# 消息扇出瞬间灌满、真派发（任务书/催办）入队即丢（run11 issues.log
# capacity-queue-drop-devimpl 键，400+ 丢件）。并发上限按通道实力量级设定（用户
# 口径 2026-10-08：GLM-5.3 并发 30 / GLM-5.3-Flash 并发 50）→ 默认 30（>13 路
# agent 扇出上限，队列不再因扇出灌满）。MX_MAX_CONCURRENT 仍可显式覆盖（设 1
# 回滚串行闸；设 0 关闸）。回滚判据：日志再现成串 429 重试风暴。
_mcs = os.environ.get('MX_MAX_CONCURRENT', '60').strip()  # 2026-10-18 用户指令：供给通道并发上限 60（原 30 未饱和即扩）
if _mcs.isdigit() and int(_mcs) > 0:
    out['gateway']['max_concurrent_sessions'] = int(_mcs)
out['platforms'] = {
    'api_server': {'enabled': True, 'extra': {'host': '127.0.0.1', 'port': int(os.environ['GW_PORT'])}},
    'matrix': {'enabled': False},
    'email': {'enabled': False}, 'weixin': {'enabled': False}, 'webhook': {'enabled': False},
}
# background_review 终局（用户指令）：每 turn 自动 review fork 关闭
# （run7 实测占单 agent LLM 时间 79%）；沉淀保留在恰当卡点——治理闸通过后由
# 场景脚本 gate_review 以 !refine 显式触发（slash_commands_goals /refine 路径，
# 不查本开关）。MX_BGREVIEW=1 可恢复历史"每 turn 自动"形态。
_bg = os.environ.get('MX_BGREVIEW', '0')
out['auxiliary'] = {'background_review': {'enabled': _bg in ('1', 'true', 'yes')}}
# 推理档位：用户裁决 2026-10-02「拉满保持」——默认不覆盖（沿用宿主 ultra），
# 仅 MX_REASONING_EFFORT 显式设值时才覆写（low/medium/high/ultra）。
_re = os.environ.get('MX_REASONING_EFFORT', '')
if _re and isinstance(out.get('agent'), dict):
    out['agent']['reasoning_effort'] = _re
# 模型通道覆写（同 profile：root default profile 也要改道，否则网关默认会话仍走旧通道）
# 同构拷贝 ×3（write_root_config/write_user_profile/write_agent_profile）：改任一份须
# 同步另两份。语义：model 段合并不替换（只覆写 default/provider/base_url/api_key，
# 保留源键）；MX_MODEL_KEY 空时保留源配置 api_key，不生成 api_key:''。
mu = os.environ.get('MX_MODEL_BASE_URL')
if mu:
    mk = os.environ.get('MX_MODEL_KEY', ''); mn = os.environ.get('MX_MODEL_NAME', 'qwen-plus')
    src_model = dict(out.get('model') or {})
    if not mk:
        mk = src_model.get('api_key') or ''   # KEY 未设：保留源配置 api_key
    out['model'] = {**src_model, 'default': mn, 'provider': 'custom:dashscope',
                    'base_url': mu, 'api_key': mk}
    cps = [c for c in (out.get('custom_providers') or []) if c.get('name') != 'dashscope']
    cps.insert(0, {'name': 'dashscope', 'base_url': mu, 'api_key': mk, 'model': mn})
    out['custom_providers'] = cps
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$HERMES_ROOT/config.yaml"
  local api_key; api_key=$(api_server_key)
  echo "API_SERVER_KEY=$api_key" > "$HERMES_ROOT/.env"; chmod 600 "$HERMES_ROOT/.env"
}

# ── hindsight 家族共享记忆（用户裁决 2026-09-25）──────────────
# 同一 matrix 用户的全部 kanban 及其 agent teams（orchestrator + 研发专职 agent
# profiles）共享一个 hindsight bank；bank（记忆仓库）按"用户名+MAC 地址"区分：
#   bank_id = hermes-<mac12>-<user>
# - mac12：本机模拟取由用户名确定性派生的 12 位伪 MAC（跨轮稳定；可用
#   AIPAY_USER_MAC 统一覆盖）；真机部署取宿主网卡 MAC——与宿主既有约定
#   hermes-b24d7ac5d9c4-aiteam 同构。
# - 模式 local_external：共享宿主 hindsight 服务（:8888）；同家族 profile 的
#   config.json 落同一 bank_id 即共享记忆，异家族天然隔离。
# 备用模型通道（占位未实现）：切换逻辑待接，设置此变量当前无效果，勿据此做故障切换；
# 格式先定：逗号分隔 name:base_url:key:model
MX_FALLBACK_MODELS="${MX_FALLBACK_MODELS:-}"   # 逗号分隔：name:base_url:key:model（占位未实现，设置无效）
HINDSIGHT_API_URL="${MX_HINDSIGHT_API:-http://localhost:8888}"
user_mac12() { # <user> → 12 位伪 MAC（确定性派生；AIPAY_USER_MAC 覆盖）
  # 失败一律 return 1、原因走 stderr，不在函数内 fail：全部调用点都在 $( ) 命令替换
  # 内，替换体里的 exit 只退子 shell——实测三工具全缺时外层 exit=0、bank=hermes--<user>
  # 照跑（跨机同名用户记忆串号，正是上文要防的场景）。中止由调用方判非零后外层 fail。
  if [[ -n "${AIPAY_USER_MAC:-}" ]]; then echo "$AIPAY_USER_MAC"; return 0; fi
  # sha1 派生回落链（P7 跨端）：macOS 有 shasum，精简 Linux 常只剩 sha1sum，再回落
  # openssl dgst；三者都是 SHA-1 摘要，bank_id 跨端一致。工具全缺即大声失败，
  # 不静默退化成空 MAC（否则 memory bank 静默串号难查）。
  local out
  if command -v shasum >/dev/null 2>&1; then
    out=$(printf '%s' "$1" | shasum | cut -c1-12)
  elif command -v sha1sum >/dev/null 2>&1; then
    out=$(printf '%s' "$1" | sha1sum | cut -c1-12)
  elif command -v openssl >/dev/null 2>&1; then
    out=$(printf '%s' "$1" | openssl dgst -sha1 | awk '{print $NF}' | cut -c1-12)
  else
    echo "user_mac12：shasum/sha1sum/openssl 全缺，无法派生记忆 bank MAC（装其一或设 AIPAY_USER_MAC）" >&2
    return 1
  fi
  [[ -n "$out" ]] || { echo "user_mac12：sha1 派生结果为空（工具异常）" >&2; return 1; }
  echo "$out"
}
memory_bank_id() { # <user> → hermes-<mac12>-<user>（派生失败 return 1，不拼空 MAC bank_id）
  local mac
  mac=$(user_mac12 "$1") || return 1
  [[ -n "$mac" ]] || return 1
  echo "hermes-$mac-$1"
}
write_hindsight_config() { # <user> <profile-dir>：写家族共享 bank 配置（档位对齐宿主）
  local u="$1" prof="$2" bank
  # 命令替换内 fail 不外传（见 user_mac12 注释）：此处判非零/判空后外层 fail
  bank=$(memory_bank_id "$u") || fail "[$u] 记忆 bank MAC 派生失败（user_mac12 报错见上），中止防记忆串号"
  [[ -n "$bank" ]] || fail "[$u] 记忆 bank MAC 为空，中止防记忆串号"
  mkdir -p "$prof/hindsight"
  cat > "$prof/hindsight/config.json" <<EOF
{
  "mode": "local_external",
  "api_url": "$HINDSIGHT_API_URL",
  "bank_id": "$bank",
  "recall_budget": "mid",
  "recall_method": "recall",
  "auto_recall": true,
  "auto_retain": true,
  "retain_async": true,
  "retain_every_n_turns": 1,
  "memory_mode": "hybrid",
  "recall_types": "observation,world,experience",
  "recall_max_tokens": 4096,
  "bank_id_template": ""
}
EOF
  chmod 600 "$prof/hindsight/config.json"
}

write_user_profile() { # <user>：Orchestrator profile——仅账号和配置独立（方案 §2.1）
  local u="$1" PROF="$HERMES_ROOT/profiles/$u" api_key
  api_key=$(api_server_key)
  mkdir -p "$PROF"
  local defboard; defboard=$(first_board_of "$u")
  _mxpy=$(_mx_yaml_py) || fail "write_user_profile：无 yaml 可用解释器——先修环境"
  GW_PORT="$GW_PORT" DEF_BOARD="$defboard" "$_mxpy" - "$HOME/.hermes/config.yaml" > "$PROF/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['kanban'] = {'default_board': os.environ['DEF_BOARD']}   # patch 390：钉本账号默认板
# memory 上限对齐宿主实证值（2026-10-02 run7 实锤）：缺省 2200/1375 太小，
# consolidation 反复 "would be at 2,26x/2,200 -- over the limit" 每 turn 重试 4 次
# （memory_tool.py 默认值；宿主 ~/.hermes 4400/2750 已长期实证可用）。
out['memory'] = {'memory_enabled': True, 'provider': 'hindsight', 'user_profile_enabled': True,
                 'memory_char_limit': 4400, 'user_char_limit': 2750}
# 模型通道覆写（额度切换）：MX_MODEL_BASE_URL/KEY/NAME 给定时整编制改道。
# 同构拷贝 ×3（write_root_config/write_user_profile/write_agent_profile）：改任一份须
# 同步另两份。语义：model 段合并不替换（只覆写 default/provider/base_url/api_key，
# 保留源键）；MX_MODEL_KEY 空时保留源配置 api_key，不生成 api_key:''。
mu = os.environ.get('MX_MODEL_BASE_URL')
if mu:
    mk = os.environ.get('MX_MODEL_KEY', ''); mn = os.environ.get('MX_MODEL_NAME', 'qwen-plus')
    src_model = dict(out.get('model') or {})
    if not mk:
        mk = src_model.get('api_key') or ''   # KEY 未设：保留源配置 api_key
    out['model'] = {**src_model, 'default': mn, 'provider': 'custom:dashscope',
                    'base_url': mu, 'api_key': mk}
    cps = [c for c in (out.get('custom_providers') or []) if c.get('name') != 'dashscope']
    cps.insert(0, {'name': 'dashscope', 'base_url': mu, 'api_key': mk, 'model': mn})
    out['custom_providers'] = cps
# 共享线程提及门（2026-10-09 run12 碎聊根治）：群根消息的 require_mention 上游默认
# 已开，但多 bot 共享线程内任何参与者的回复会经 in_bot_thread 旁路唤醒所有参与者，
# thread_require_mention 默认关=回声环洞（run12 实证：末 11 条房间消息 10 条为线程
# 回复互唤，「（静默）/待命」回执自续环；带此旗的 hu/chen 交付正常、未带的 lin/xiao
# 陷环）。双旗显式落=防上游默认漂移。驱动侧唤醒路径（派发/催办/回灌）全带 @提及
# 或 m.mentions（mx_send 第 4 参），协议不破；DM 天然豁免。
out['platforms'] = {
    'matrix': {'enabled': True, 'require_mention': True, 'thread_require_mention': True},
    'email': {'enabled': False}, 'weixin': {'enabled': False}, 'webhook': {'enabled': False},
}
# background_review 终局（用户指令）：每 turn 自动 review fork 关闭
# （run7 实测占单 agent LLM 时间 79%）；沉淀保留在恰当卡点——治理闸通过后由
# 场景脚本 gate_review 以 !refine 显式触发（slash_commands_goals /refine 路径，
# 不查本开关）。MX_BGREVIEW=1 可恢复历史"每 turn 自动"形态。
_bg = os.environ.get('MX_BGREVIEW', '0')
out['auxiliary'] = {'background_review': {'enabled': _bg in ('1', 'true', 'yes')}}
# 推理档位：用户裁决 2026-10-02「拉满保持」——默认不覆盖（沿用宿主 ultra），
# 仅 MX_REASONING_EFFORT 显式设值时才覆写（low/medium/high/ultra）。
_re = os.environ.get('MX_REASONING_EFFORT', '')
if _re and isinstance(out.get('agent'), dict):
    out['agent']['reasoning_effort'] = _re
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$PROF/config.yaml"
  write_hindsight_config "$u" "$PROF"
  local HUMANS AGENTS h
  HUMANS=""; for h in "${USERS[@]}"; do HUMANS="$HUMANS,$(human_mxid "$h")"; done; HUMANS="${HUMANS#,}"
  AGENTS=""; for h in "${USERS[@]}"; do AGENTS="$AGENTS,$(agent_mxid "$h")"; done; AGENTS="${AGENTS#,}"
  cat > "$PROF/.env" <<ENVEOF
MATRIX_HOMESERVER=$HS
MATRIX_ACCESS_TOKEN=$(load_token "$u-agent")
MATRIX_USER_ID=$(agent_mxid "$u")
MATRIX_ALLOWED_USERS=$HUMANS,$AGENTS
MATRIX_E2EE_MODE=off
MATRIX_AUTO_THREAD=true
MATRIX_REQUIRE_MENTION=true
MATRIX_THREAD_REQUIRE_MENTION=true
MATRIX_APPROVAL_TIMEOUT_SECONDS=1800
API_SERVER_KEY=$api_key
MATRIX_ROOM_OBSERVERS=${MATRIX_ROOM_OBSERVERS:-@admin:$SERVER_NAME}
ENVEOF
  chmod 600 "$PROF/.env"
}

write_agent_profile() { # <user> <agent-id>：研发专职 agent profile（无 matrix 凭据）
  local u="$1" a="$2" name; name=$(agent_profile "$u" "$a")
  local PROF="$HERMES_ROOT/profiles/$name" defboard
  defboard=$(boards_of "$u" | tr ' ' '\n' | grep ":$a$" | head -1 | cut -d: -f1)
  mkdir -p "$PROF"
  _mxpy=$(_mx_yaml_py) || fail "write_agent_profile：无 yaml 可用解释器——先修环境"
  DEF_BOARD="$defboard" "$_mxpy" - "$HOME/.hermes/config.yaml" > "$PROF/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['kanban'] = {'default_board': os.environ['DEF_BOARD']}
# memory 上限对齐宿主实证值（2026-10-02 run7 实锤）：缺省 2200/1375 太小，
# consolidation 反复 "would be at 2,26x/2,200 -- over the limit" 每 turn 重试 4 次
# （memory_tool.py 默认值；宿主 ~/.hermes 4400/2750 已长期实证可用）。
out['memory'] = {'memory_enabled': True, 'provider': 'hindsight', 'user_profile_enabled': True,
                 'memory_char_limit': 4400, 'user_char_limit': 2750}
# 模型通道覆写（额度切换）：MX_MODEL_BASE_URL/KEY/NAME 给定时整编制改道。
# 同构拷贝 ×3（write_root_config/write_user_profile/write_agent_profile）：改任一份须
# 同步另两份。语义：model 段合并不替换（只覆写 default/provider/base_url/api_key，
# 保留源键）；MX_MODEL_KEY 空时保留源配置 api_key，不生成 api_key:''。
mu = os.environ.get('MX_MODEL_BASE_URL')
if mu:
    mk = os.environ.get('MX_MODEL_KEY', ''); mn = os.environ.get('MX_MODEL_NAME', 'qwen-plus')
    src_model = dict(out.get('model') or {})
    if not mk:
        mk = src_model.get('api_key') or ''   # KEY 未设：保留源配置 api_key
    out['model'] = {**src_model, 'default': mn, 'provider': 'custom:dashscope',
                    'base_url': mu, 'api_key': mk}
    cps = [c for c in (out.get('custom_providers') or []) if c.get('name') != 'dashscope']
    cps.insert(0, {'name': 'dashscope', 'base_url': mu, 'api_key': mk, 'model': mn})
    out['custom_providers'] = cps
# background_review 终局（用户指令）：每 turn 自动 review fork 关闭
# （run7 实测占单 agent LLM 时间 79%）；沉淀保留在恰当卡点——治理闸通过后由
# 场景脚本 gate_review 以 !refine 显式触发（slash_commands_goals /refine 路径，
# 不查本开关）。MX_BGREVIEW=1 可恢复历史"每 turn 自动"形态。
_bg = os.environ.get('MX_BGREVIEW', '0')
out['auxiliary'] = {'background_review': {'enabled': _bg in ('1', 'true', 'yes')}}
# 推理档位：用户裁决 2026-10-02「拉满保持」——默认不覆盖（沿用宿主 ultra），
# 仅 MX_REASONING_EFFORT 显式设值时才覆写（low/medium/high/ultra）。
_re = os.environ.get('MX_REASONING_EFFORT', '')
if _re and isinstance(out.get('agent'), dict):
    out['agent']['reasoning_effort'] = _re
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$PROF/config.yaml"
  write_hindsight_config "$u" "$PROF"
}

write_user_manifest() { # <user>：账号级能力清单（capability-report 技能数据源）
  local u="$1" PROF="$HERMES_ROOT/profiles/$u" defboard agents_json boards_json a b alist bank
  defboard=$(first_board_of "$u")
  # bank 先取值再进 heredoc：heredoc 里的 $( ) 同属命令替换，fail 不外传
  bank=$(memory_bank_id "$u") || fail "[$u] 记忆 bank MAC 派生失败（user_mac12 报错见上），中止防记忆串号"
  [[ -n "$bank" ]] || fail "[$u] 记忆 bank MAC 为空，中止防记忆串号"
  agents_json="[{\"id\":\"orchestrator\",\"capabilities\":[\"coordination\"]}"
  for a in $(agents_of "$u"); do
    agents_json+=",{\"id\":\"$a\",\"capabilities\":[\"research\",\"delivery\"]}"
  done
  agents_json+="]"
  boards_json=""
  for b in $(boards_of "$u"); do
    boards_json+="${boards_json:+,}{\"slug\":\"${b%%:*}\",\"team\":[\"${b##*:}\"]}"
  done
  cat > "$PROF/machine-manifest.json" <<MANEOF
{
  "owner": "$u",
  "machine": "$u-mac",
  "topology": "single-gateway-multiplex",
  "agents": $agents_json,
  "boards": [$boards_json],
  "memoryBank": "$bank",
  "kanbanEndpoint": "$(studio_url)/api/hermes/kanban?board=$defboard"
}
MANEOF
  chmod 600 "$PROF/machine-manifest.json"
}

roster_snapshot() { # 编制对账（边界设计 §6-T5）：agent-roster.yaml 快照 + 游离角色声明。
  # 单源=hermes agent-roster.yaml；boards_of 的 agent-id 不在其 roles 内时记入
  # extraRoles 显式声明（sim 场景角色属场景数据，允许扩展但不许静默漂移）。
  # agent-id 经环境变量传给 python（heredoc 会抢占 stdin，管道传参必丢）。
  # 健壮化（H2）：roles 含映射项时 set(roles) 抛 TypeError、stdout 落空，拼出
  # `"roster": ,` 非法 JSON——roles 逐项 str() 归一（同上游 agent_roster.py:118），
  # 且任何异常/缺 python3 一律只吐 null，保证调用方拼出的 JSON 恒合法。
  local roster="" ids out
  [[ -f "$HERMES_ROOT/agent-roster.yaml" ]] && roster="$HERMES_ROOT/agent-roster.yaml"
  [[ -z "$roster" && -f "$HOME/.hermes/agent-roster.yaml" ]] && roster="$HOME/.hermes/agent-roster.yaml"
  ids=$({ for u in "${INSTANCED_USERS[@]}"; do agents_of "$u"; done } | tr ' ' '\n' | sed '/^$/d' | sort -u | tr '\n' ' ')
  out=$(ROSTER_FILE="$roster" ROSTER_IDS="$ids" python3 - <<'PYEOF'
import json, os
ids = sorted({i for i in os.environ.get('ROSTER_IDS', '').split() if i})
path = os.environ.get('ROSTER_FILE') or ''
roles = []
if path:
    try:
        import yaml
        data = yaml.safe_load(open(path)) or {}
        roles = list(data.get('roles') or [])
    except Exception:
        roles = []
norm = [str(r) for r in roles]   # 非字符串角色归一（set 可哈希；同上游逐项 str()）
extra = sorted({i for i in ids if i not in set(norm)})
print(json.dumps({'source': path or None, 'roles': norm,
                  'boardAgentIds': ids, 'extraRoles': extra}, ensure_ascii=False))
PYEOF
) || out="null"
  printf '%s\n' "${out:-null}"
}

write_fleet_manifest() { # 全局事实源：users → matrix 账号 / boards / teams
  local out="$SIM_ROOT/fleet-manifest.json" u b first=1 bank
  {
    echo '{'
    echo "  \"topology\": \"single-gateway-multiplex\","
    echo "  \"hermesRoot\": \"$HERMES_ROOT\","
    echo "  \"gatewayPort\": $GW_PORT,"
    echo "  \"studioPort\": $STUDIO_PORT,"
    echo "  \"roster\": $(roster_snapshot),"
    echo '  "users": ['
    for u in "${INSTANCED_USERS[@]}"; do
      [[ $first == 1 ]] || echo '    ,'
      first=0
      # 命令替换内 fail 不外传（见 user_mac12 注释）：判非零/判空后外层 fail
      bank=$(memory_bank_id "$u") || fail "[$u] 记忆 bank MAC 派生失败（user_mac12 报错见上），中止防记忆串号"
      [[ -n "$bank" ]] || fail "[$u] 记忆 bank MAC 为空，中止防记忆串号"
      echo '    {'
      echo "      \"user\": \"$u\","
      echo "      \"humanMxid\": \"$(human_mxid "$u")\","
      echo "      \"agentMxid\": \"$(agent_mxid "$u")\","
      echo "      \"profile\": \"$u\","
      echo "      \"memoryBank\": \"$bank\","
      echo '      "boards": ['
      local bfirst=1
      for b in $(boards_of "$u"); do
        [[ $bfirst == 1 ]] || echo '        ,'
        bfirst=0
        echo "        {\"slug\": \"${b%%:*}\", \"teamProfiles\": [\"$u-${b##*:}\"]}"
      done
      echo '      ]'
      echo '    }'
    done
    echo '  ]'
    echo '}'
  } > "$out"
  chmod 604 "$out"
}

set_board_team() { # <board> <agent-id>：board.json.profiles = team 白名单（patch 391 事实源）
  local board="$1" agent="$2"
  HERMES_HOME="$HERMES_ROOT" python3 - "$board" "$agent" <<'PYEOF'
import json, sys, pathlib
board, agent = sys.argv[1], sys.argv[2]
root = pathlib.Path(__import__('os').environ['HERMES_HOME'])
if board == 'default':
    d = root / 'kanban' / 'boards' / 'default'
else:
    d = root / 'kanban' / 'boards' / board
d.mkdir(parents=True, exist_ok=True)
p = d / 'board.json'
meta = json.loads(p.read_text()) if p.exists() else {'slug': board}
meta.setdefault('slug', board)
meta['profiles'] = [agent]
p.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')
print(f'board {board} team -> {agent}')
PYEOF
}

# 条款块 marker 前缀（升版换装按前缀剥离，不锁定具体版本号）
STYLE_CHARTER_BEGIN='<!-- style-charter:'
STYLE_CHARTER_END='<!-- /style-charter:'

style_charter_strip() { # <file>：删既有条款块（升版换装；无块原样返回）
  # awk 而非 sed：BSD sed 地址定界符与 marker 内的 "/" 冲突（实测报
  # "unescaped newline inside substitute pattern"→剥离失效→幂等破功双追加）
  local f="$1"
  [[ -f "$f" ]] || return 0
  awk -v beg="$STYLE_CHARTER_BEGIN" -v end="$STYLE_CHARTER_END" '
    index($0, beg) { skip = 1 }
    skip && index($0, end) { skip = 0; next }
    skip { next }
    { print }
  ' "$f" > "$f.tmp.$$" && mv "$f.tmp.$$" "$f"
}

seed_soul_charter() { # <profile-dir>：SOUL.md 并入条款（幂等；setup 期生效，不动在跑轮）
  local PROF="$1" soul="$PROF/SOUL.md" idsrc="${MX_SOUL_IDENTITY_SRC:-$HOME/.hermes/SOUL.md}"
  [[ -f "$STYLE_CHARTER" ]] || return 0
  mkdir -p "$PROF"
  if [[ ! -f "$soul" ]]; then
    # 首跑 profile：hermes 首次 load_config 物化默认身份（_ensure_default_soul_md
    # 只种缺失/legacy 模板，对已自定义文件不动）——先以宿主身份文本打底再并入
    # 条款，避免条款独占身份槽顶掉「You are Hermes Agent」默认身份。
    if [[ -f "$idsrc" ]]; then cp "$idsrc" "$soul"; else : > "$soul"; fi
  fi
  style_charter_strip "$soul"
  printf '\n' >> "$soul"
  cat "$STYLE_CHARTER" >> "$soul"
}

install_skills() { # <profile-dir>：全 profile 同构技能副本（"其他内容完全一样"）
  local PROF="$1" s
  # 聊天回复侧全局钩子：SOUL.md 身份层并入条款（与技能分发同点位调用，
  # mx-setup 每 profile 一次，幂等可重入）
  seed_soul_charter "$PROF"
  # 2026-10-10 能力补齐轮：单文件拷贝 → 全目录拷贝（aipaydev-dev 已升 swarm-yuan
  # standard 全骨架 116 文件——门禁/钩子脚本/方法论库随技能分发；单文件技能源仍
  # 兼容旧路径）。条款追加逻辑不变（进安装副本 SKILL.md 尾部，仓内真源无条款）。
  for s in $SKILLS_INSTALL; do
    [[ -d "$SKILLS_SRC/$s" ]] || continue
    rm -rf "$PROF/skills/$s"
    mkdir -p "$PROF/skills/$s"
    if compgen -G "$SKILLS_SRC/$s/*" >/dev/null 2>&1 && [[ -n "$(ls -A "$SKILLS_SRC/$s" | grep -v '^SKILL.md$')" ]]; then
      cp -R "$SKILLS_SRC/$s/." "$PROF/skills/$s/"
    else
      cp "$SKILLS_SRC/$s/SKILL.md" "$PROF/skills/$s/SKILL.md"
    fi
    # 交付物侧：条款追加进安装副本（仓内 SKILL.md 保持无条款，单一事实源=真源文件）
    if [[ -f "$STYLE_CHARTER" ]]; then
      cat "$STYLE_CHARTER" >> "$PROF/skills/$s/SKILL.md"
    fi
    # 跨端占位替换（2026-10-12 双模式轮）：技能真源里 __SIM_ROOT__ 占位（真源不得
    # 硬编码 mac 绝对路径），安装到 profile 时按本节点 SIM_ROOT 实例化——agent 拿到的
    # PROJECT_DIR 永远是本机可写路径。tmp+mv 原子替换（BSD/GNU sed 通用，同 wrapper 先例）。
    local _tgt
    for _tgt in "$PROF/skills/$s/SKILL.md" "$PROF/skills/$s/scripts/precheck.conf"; do
      [[ -f "$_tgt" ]] || continue
      sed "s|__SIM_ROOT__|$SIM_ROOT|g" "$_tgt" > "${_tgt}.tmp" && mv "${_tgt}.tmp" "$_tgt"
    done
  done
  # 角色技能映射（2026-10-10 能力补齐·差距二）：专属技能此前只在 Orchestrator 主
  # profile（agent 推演中自著），实际干活的子 profile（*-tester/*-sys-analyst）没有
  # ——能力错位靠派单词补偿，换会话/换触发词即丢。按档案名后缀从主 profile 源补装
  # （源缺位跳过不阻塞；幂等重建；charter 同样追加）。
  local _base _rh
  _base=$(basename "$PROF")
  _role_skill_install() { # <host-profile> <skill-name>
    local host="$1" sn="$2"
    [[ -d "$HERMES_ROOT/profiles/$host/skills/$sn" ]] || return 0
    rm -rf "$PROF/skills/$sn"; mkdir -p "$PROF/skills/$sn"
    cp -R "$HERMES_ROOT/profiles/$host/skills/$sn/." "$PROF/skills/$sn/"
    if [[ -f "$STYLE_CHARTER" ]] && [[ -f "$PROF/skills/$sn/SKILL.md" ]]; then
      cat "$STYLE_CHARTER" >> "$PROF/skills/$sn/SKILL.md"
    fi
  }
  case "$_base" in
    *-tester)
      _role_skill_install qi backend-integration-testing
      _role_skill_install xiao test-evidence-verification
      ;;
    *-sys-analyst)
      _role_skill_install lin aipaydev-sys-analysis
      ;;
  esac
  # 中央清单角色增量（2026-10-18 多机能力管理轮）：读中央仓 skill-provisioning.json
  # （MX_SKILL_MANIFEST 显式 > MX_CENTRAL_SHARED 目录 > 宿主 _shared 检出，缺位=零行为
  # 变化）。只加"精确/后缀/前缀"角色增量，**忽略 '*' 通用行**——sim 基线=上方
  # SKILLS_INSTALL 同构分发，通用行若再叠会给 42 个推演账号翻倍铺技能。来源仍限
  # SKILLS_SRC（simharness/skills），仓内无此技能=跳过（不引入宿主全局源）。
  local _mxm="${MX_SKILL_MANIFEST:-${MX_CENTRAL_SHARED:-$HOME/.hermes/profiles/_shared}/skill-provisioning.json}"
  if [[ -f "$_mxm" ]]; then
    local _ms _msn
    while IFS= read -r _ms; do
      [[ -n "$_ms" ]] || continue
      if [[ -d "$SKILLS_SRC/$_ms" ]]; then
        rm -rf "$PROF/skills/$_ms"; mkdir -p "$PROF/skills/$_ms"
        cp -R "$SKILLS_SRC/$_ms/." "$PROF/skills/$_ms/"
        if [[ -f "$STYLE_CHARTER" ]] && [[ -f "$PROF/skills/$_ms/SKILL.md" ]]; then
          cat "$STYLE_CHARTER" >> "$PROF/skills/$_ms/SKILL.md"
        fi
        for _msn in "$PROF/skills/$_ms/SKILL.md" "$PROF/skills/$_ms/scripts/precheck.conf"; do
          [[ -f "$_msn" ]] || continue
          sed "s|__SIM_ROOT__|$SIM_ROOT|g" "$_msn" > "${_msn}.tmp" && mv "${_msn}.tmp" "$_msn"
        done
      fi
    done < <(python3 "${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/mux/manifest-extras.py" "$_base" "$_mxm")
  fi
  # ACP 编码后端 L1 委托技能（2026-10-09 acp-coding-backend-divergence 根治件）：
  # 正本=overlay/runtime/hermes-skills（产品侧技能面），harness 只读消费；缺位跳过
  # （bare CI 无 overlay 检出），在位即随 profile 同构分发。
  # 2026-10-12 Ycode 接线轮：SKILL.md 之外整目录分发（scripts/zcode-acp-delegate.py
  # 引擎驱动随技能走，缺脚本=技能卡命令不可执行）；风格条款仍只追加进安装副本。
  local _ovl="${MX_OVERLAY_ROOT:-}"
  [[ -n "$_ovl" ]] || _ovl="$HARNESS_ROOT/../overlay"
  if [[ -f "$_ovl/runtime/hermes-skills/coding-delegate/SKILL.md" ]]; then
    rm -rf "$PROF/skills/coding-delegate"; mkdir -p "$PROF/skills/coding-delegate"
    cp -R "$_ovl/runtime/hermes-skills/coding-delegate/." "$PROF/skills/coding-delegate/"
    if [[ -f "$STYLE_CHARTER" ]]; then
      cat "$STYLE_CHARTER" >> "$PROF/skills/coding-delegate/SKILL.md"
    fi
  fi
}

# ═══════════════════════════════════════════════════════════
# 以下为 P1 场景迁移自 aipay-lib.sh 并入的常量/工具（V2 路径适配）
# ═══════════════════════════════════════════════════════════

# ── 推演轮次隔离（state/evidence 按 RUN_ID 分家，语义同 V1）────
# 步骤序单一事实源（2026-10-04 后台感知轮）：relay 接力序 = sset 进度 JSON 的 total 口径。
# sset 每次写 state.env 后同步刷 $HERMES_ROOT/run-progress.json 供 studio 驾驶舱读
# （文件契约：harness 单写、产品只读；缺文件=无推演在跑，产品侧隐藏 widget）。
MX_STEP_ORDER="smoke appinit people ba reqgate room dispatch register analysis triage anexec review archgate close plan devimpl defect testpass ready release uat workmgr audit retro ide report"
# lite 轮执行段（提速方案① L1：devimpl→report 九步；run-progress total 用此口径，G4 2026-10-10）
MX_LITE_STEP_ORDER="devimpl defect testpass ready release uat workmgr audit retro ide report"

RUN_ID="${RUN_ID:-}"
if [[ -n "$RUN_ID" ]]; then
  RUN_DIR="$SIM_ROOT/runs/$RUN_ID"
  mkdir -p "$RUN_DIR/evidence"
else
  RUN_DIR="$SIM_ROOT"
fi
STATE="$RUN_DIR/state.env"
EVID_DIR="${MX_EVID_DIR:-$RUN_DIR/evidence}"
# 569 gate-guard 接线（run10 前置）：gateway 以固定路径读守卫文件——每 tick 惰性
# 读文件无需重启即可感知键落位；本链接把"当前轮 state.env"钉到固定路径。
# 未配 KANBAN_GATE_GUARD_KEYS 时守卫整体惰性（mx-up 默认键=g2_arch_pass）。
mkdir -p "$SIM_ROOT/var" 2>/dev/null || true
# 跨端链接：mac 软链；Git Bash 文件软链需特权 → 回落拷贝（state.env 小文件，
# 拷贝语义稍弱于链接但守卫只读键值，可接受）
if ! ln -sfn "$STATE" "$SIM_ROOT/var/current-state.env" 2>/dev/null; then
  cp -f "$STATE" "$SIM_ROOT/var/current-state.env" 2>/dev/null || true
fi
mx_sync_ledger_link
NCWK="$NCWK_ROOT"

# ── 场景层（2026-10-12 新场景轮）────────────────────────
# aipay（支付域 26 步）保持内联默认——mac solo 回归与门禁锚不动。全新需求+全新团队
# 走场景覆写：MX_SCENARIO=<名> 且 scenarios/<名>/roster.env 在位时，编制/板映射/
# 中央仓/技能清单/锚档案全部按 roster 重定义（roster 在全部默认之后 source，覆写
# 必然压住默认；boards_of 在 roster 里重定义函数即可）。模板=scenarios/_template/，
# 最小样例=scenarios/example-minimal/。
MX_SCENARIO="${MX_SCENARIO:-aipay}"
if [[ "$MX_SCENARIO" != aipay ]]; then
  _sc_roster="$HARNESS_ROOT/scenarios/$MX_SCENARIO/roster.env"
  if [[ ! -f "$_sc_roster" ]]; then
    echo "[mx-lib] FAIL 场景定义缺位：${_sc_roster}（模板见 scenarios/_template/）" >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  source "$_sc_roster"
fi
unset _sc_roster
MX_CENTRAL_REPO="${MX_CENTRAL_REPO:-issac-new/aipaydev}"
MX_CENTRAL_NAME="${MX_CENTRAL_NAME:-aipaydev}"
MX_ANCHOR_USER="${MX_ANCHOR_USER:-fanfan}"
MX_ANCHOR_USER_B="${MX_ANCHOR_USER_B:-chen}"
SKILLS_INSTALL="${SKILLS_INSTALL:-capability-report requirements-analyst pm-planning aipaydev-dev inbox-dedup defect-loop testing-shift-left}"
DIRECTOR_CLONE="$SIM_ROOT/central/$MX_CENTRAL_NAME"
GH_REPO="$MX_CENTRAL_REPO"

# ── 需求标识（推演轮次参数化，同 V1）────────────────────────
RFD_ID="${RFD_ID:-RFD-001}"
RFD_SLUG="${RFD_SLUG:-payment-cashier}"
RFD_DOC="docs/requirements/${RFD_ID}-${RFD_SLUG}.md"
RFD_MATERIAL="${RFD_MATERIAL:-$HARNESS_ROOT/materials/${RFD_ID}-${RFD_SLUG}.md}"
if [[ -z "${RFD_ONELINE:-}" ]]; then
  case "$RFD_ID" in
    RFD-002) RFD_ONELINE="在已上线的收单商户小程序收银台之上，增加退款（整单/多次部分、原路退回）与分账（多接收方、比例/时窗/冻结解冻）两项资金能力，双端一致且不产生资损" ;;
    RFD-003) RFD_ONELINE="在已上线的收银台之上增加 T+1 自动对账能力：以 outTradeNo/transactionId/金额（分，int64）/15 分钟超时自动关单为对账核心字段，支持支付凭证截图经 OCR 双路提取对账字段并勾稽，差异进待澄清清单，不产生资损" ;;
    *)       RFD_ONELINE="为收单商户开发兼容微信/支付宝双端的小程序支付收银台，含统一下单、渠道适配（财付通/支付宝）、支付结果通知与对账字段支撑" ;;
  esac
fi

# 账号工作区（V2：中央仓每账号一棵工作树；kanban dispatcher worker 另用每板 workspaces）
workspace() { echo "$SIM_ROOT/workspaces/$1/aipaydev"; }

# ── 模型额度预检（V2：profile 配置全同构，路径适配 profiles/<u>）──
# 返回：ok | quota | auth | unreachable | noreply
model_preflight() { # <user>
  local u="$1" cfg="${HERMES_AGENT_VENV:-}"
  local conf; conf="$HERMES_ROOT/profiles/$u/config.yaml"
  [[ -f "$conf" ]] || { echo "unreachable"; return 0; }
  # 解释器解析链（2026-10-17 实锤：单钉旧 venv/bin/python 在宿主拆 venv 后失配，
  # 回退系统 python3 缺 pyyaml → 探针秒死被 2>/dev/null 折叠成 unreachable 假象）
  [[ -n "$cfg" && -x "$cfg" ]] || cfg=$(_mx_yaml_py) || { echo "unreachable"; return 0; }
  "$cfg" - "$conf" <<'PY' 2>/dev/null || echo unreachable
import json, sys, urllib.error, urllib.request
try:
    import yaml
except ImportError:
    print("unreachable"); raise SystemExit
cfg = yaml.safe_load(open(sys.argv[1])) or {}
m = cfg.get("model") or {}
url = (m.get("base_url") or "").rstrip("/")
key = m.get("api_key") or ""
name = m.get("default") or ""
# provider 间接引用（2026-10-21 实锤修复）：宿主快照 0.22.x 新格式的 base_url/api_key
# 不内联在 model: 下，而是 model.provider: custom:<名> → custom_providers[] 里解析；
# 归一（mx-setup 4b）后 SIM 全量此形态。旧内联格式仍兼容（两态都认）。
# api_key=PROXY_MANAGED：cc-switch 本地代理接管鉴权，探针照发即通。
if not url:
    prov = (m.get("provider") or "").strip()
    if prov.startswith("custom:"):
        pname = prov[len("custom:"):]
        for p in (cfg.get("custom_providers") or []):
            if isinstance(p, dict) and p.get("name") == pname:
                url = (p.get("base_url") or "").rstrip("/")
                key = key or (p.get("api_key") or "")
                name = name or (p.get("model") or "")
                break
if not url or not name:
    print("unreachable"); raise SystemExit
# 通道模式对齐（2026-10-01 run6 实锤）：sim agent 实际按 anthropic_messages 格式调
# 网关（api_mode），cc-switch 双通道（codex→Kimi / claude→mimo）可能一死一活；
# 只探 /chat/completions 会把活通道误判 quota（当晚整晚 quota 假红实录）。先探
# agent 真用的 /v1/messages，通即 ok；不通再走 openai 候选，双败才按原口径分类。
abody = json.dumps({"model": name, "max_tokens": 4,
                    "messages": [{"role": "user", "content": "Reply with exactly: OK"}]}).encode()
ahdrs = {"Content-Type": "application/json", "anthropic-version": "2023-06-01",
         **({"x-api-key": key} if key else {})}
areq = urllib.request.Request(url + "/v1/messages", data=abody, headers=ahdrs)
try:
    # mimo 队列重（run6 实测大生成 6 分钟级），4-token 探针给 150s 预算防慢通道误杀
    with urllib.request.urlopen(areq, timeout=150) as r:
        r.read()
        print("ok"); raise SystemExit
except urllib.error.HTTPError:
    pass  # 404=该代理无 anthropic 面；4xx/529 交由 openai 候选段终判
except SystemExit:
    raise
except Exception:
    pass
# URL 拼接 bug 修复（2026-09-26 实锤）：只拼 /v1/chat/completions 会把
# bigmodel 的 .../paas/v4 端点拼成 /v4/v1/... → 404 → 误报 noreply（额度被冤枉）。
# 两种候选都试：base 已含版本段（/v1 /v4 ...）→ base/chat/completions 优先；
# 兼容裸前缀风格 → base/v1/chat/completions 兜底；非 404 的首个错误用于分类。
body = json.dumps({"model": name, "max_tokens": 4,
                   "messages": [{"role": "user", "content": "Reply with exactly: OK"}]}).encode()
hdrs = {"Content-Type": "application/json",
        **({"Authorization": "Bearer " + key} if key else {})}
base = url[:-3].rstrip("/") if url.endswith("/v1") else url
candidates = [url + "/chat/completions", base + "/v1/chat/completions"]
last = ("noreply", "")
for u in candidates:
    req = urllib.request.Request(u, data=body, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            r.read()
            print("ok"); raise SystemExit
    except urllib.error.HTTPError as e:
        text = (e.read() or b"").decode("utf8", "replace").lower()
        if e.status in (401, 403):
            print("quota" if ("limit" in text or "quota" in text) else "auth"); raise SystemExit
        if e.status == 429:
            print("quota"); raise SystemExit
        last = ("noreply", u)
    except SystemExit:
        raise
    except Exception:
        last = ("unreachable", u)
print(last[0])
PY
}

model_preflight_report() { # 检查全部实例，额度/鉴权异常即 fail
  local bad=() still=() u st
  for u in "${INSTANCED_USERS[@]}"; do
    st=$(model_preflight "$u")
    [[ "$st" == "ok" ]] || bad+=("$u:$st")
  done
  if (( ${#bad[@]} > 0 )); then
    # 429 瞬时抖动鉴别（2026-09-28 V4-14 连发探针 + 在跑 agent 回合同窗
    # 挤通道，尾部探针被 RPM 限流误判 quota；全停 30s 冷却后复查——真额度耗尽仍
    # 会失败，瞬发限流则恢复）。仅对 quota 态重试，auth/unreachable/noreply 不重试。
    local retriable=0 e
    for e in "${bad[@]}"; do [[ "$e" == *:quota ]] && retriable=1; done
    if (( retriable )); then
      log "模型通道预检首轮 quota 态（${bad[*]}）——冷却 30s 复查（区分限流抖动与真额度耗尽）"
      sleep 30
      for e in "${bad[@]}"; do
        u="${e%%:*}"
        st=$(model_preflight "$u")
        [[ "$st" == "ok" ]] || still+=("$u:$st")
      done
      bad=(${still[@]+"${still[@]}"})
    fi
  fi
  if (( ${#bad[@]} > 0 )); then
    log "模型通道预检未通过：${bad[*]}"
    fail "推演需要真实 LLM 回合，模型通道不可用就不是产品缺陷。请先恢复额度/鉴权（quota=额度耗尽、auth=鉴权失败、unreachable=代理未起、noreply=通道可用但拒答）后重跑；已完成的轮次可用 START_STEP 从断点续推。"
  fi
  log "模型通道预检通过（${#INSTANCED_USERS[@]} 实例）"
}

gh_token() {
  if [[ -s "$CREDS_DIR/github.token" ]]; then cat "$CREDS_DIR/github.token"; return 0; fi
  local t
  t=$(git credential fill <<EOF 2>/dev/null | grep ^password= | cut -d= -f2-
protocol=https
host=github.com
EOF
)
  [[ -n "$t" ]] || fail "github token 不可用"
  printf '%s' "$t" > "$CREDS_DIR/github.token"
  chmod 600 "$CREDS_DIR/github.token"
  printf '%s' "$t"
}

gh_clone_url() { echo "https://x-access-token:$(gh_token)@github.com/$GH_REPO.git"; }

# ── matrix 适配器自愈（2026-09-26 实锤场景）────────────────────
# 症状：runtime 的 pyproject [tool.hermes.extras-platforms].matrix 门=linux-only
# （pm 构建期漂移产物，runtime 树 dirty 自述）→ macOS 上 pm.extras 判"不支持此平台"
# → matrix 适配器全员降级 → agent 收不到 @mention 全员哑火（V3 两度中止根因）。
# 修复两步（幂等）：①运行时 venv 装 plain mautrix+aio 依赖（无 E2EE，避开
# python-olm 的 darwin 编译坑）②pyproject 门放行 darwin。调用方负责重启 gateway。
# 2026-09-28 V4-run1 实锤修正：gateway 真跑在 per-home selected venv
# （$HERMES_ROOT/installs/<id>/environments/<gen>/venv，facts.json 指定），不是
# agent 安装目录 venv——装错 venv 会"自愈成功"假阳性（import 检查在错误解释器上
# 通过），gateway 依旧全员降级。先解析 selected venv 再装；selected 缺失才回落。
mx_selected_venv() { # → 打印 HERMES_ROOT 下 facts.json 指定的 selected venv 路径
  local facts env_dir
  for facts in "$HERMES_ROOT"/installs/*/facts.json; do
    [[ -f "$facts" ]] || continue
    env_dir=$(python3 - "$facts" <<'PYEOF' 2>/dev/null
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d['packages']['venv']['environment'])
except Exception:
    pass
PYEOF
)
    [[ -n "$env_dir" && -d "$env_dir" ]] && { echo "$env_dir"; return 0; }
  done
  return 1
}
matrix_adapter_selfheal() { # → 0=已修复 1=无需修 2=修复失败
  local sel_env sel_py rt uv_bin
  sel_env="$(mx_selected_venv 2>/dev/null || true)"
  if [[ -z "$sel_env" ]]; then
    rt="${HERMES_AGENT_RT:-$AGENT_SRC}"
    sel_env="$rt/venv"
    [[ -x "$sel_env/bin/python" ]] || { log "matrix 自愈：selected venv 与 agent venv（${rt}）均不在，跳过"; return 2; }
    log "matrix 自愈：selected venv 未记录，回落 agent venv（${rt}）"
  fi
  sel_py="$sel_env/bin/python"
  if [[ -x "$sel_py" && -z "$("$sel_py" -c 'import mautrix' 2>&1)" ]]; then
    log "matrix 自愈：mautrix 已可导入（${sel_env}），仅补门放行"
  else
    log "matrix 自愈：装 plain mautrix+aio 依赖到 selected venv（darwin 无 E2EE 面）"
    uv_bin="$(ls "$HERMES_ROOT"/tools/uv-*/uv 2>/dev/null | head -1)"
    if [[ -x "$uv_bin" ]]; then
      "$uv_bin" pip install --python "$sel_py" 'mautrix==0.21.1' 'aiohttp-socks==0.11.0' \
        'aiohttp==3.14.3' 'aiosqlite==0.22.1' 'asyncpg==0.31.0' 2>&1 | tail -1
    else
      "$sel_py" -m pip install -q 'mautrix==0.21.1' 'aiohttp-socks==0.11.0' \
        'aiohttp==3.14.3' 'aiosqlite==0.22.1' 'asyncpg==0.31.0' 2>&1 | tail -1
    fi
  fi
  rt="${HERMES_AGENT_RT:-$AGENT_SRC}"
  "$sel_py" - "$rt/pyproject.toml" << 'PYEOF'
import sys
p = sys.argv[1]
s = open(p).read()
old = 'matrix = "sys_platform == \'linux\'"'
new = 'matrix = "sys_platform == \'linux\' or sys_platform == \'darwin\'"'
if old in s:
    open(p, 'w').write(s.replace(old, new, 1))
    print('gate opened for darwin')
else:
    print('gate already ok or format drift')
PYEOF
  "$sel_py" -c "import mautrix" 2>/dev/null || { log "matrix 自愈：mautrix 仍不可导入（${sel_env}），失败"; return 2; }
  return 0
}

matrix_adapter_degraded() { # <gatewayLog>：近端日志有降级症状？
  # 症状词覆盖三面（run6 实锤补全）：skip 型 / requirements-not-met 型 / adapter-failed 型
  tail -120 "$1" 2>/dev/null | grep -qE "skipping platform 'matrix'|requirements not met|adapter creation failed"
}

# ── V8.29 期望对账（「应存在而不存在」类盲区根治·run20 hu 份额 5 项无卡实录）──
# mx_audit_dispatch <expect-file>：期望文件=每行「D-项|描述」；对账面=①全板卡标题
# ②中央仓 origin/main 设计稿全文。产出三列对账（卡有/稿有/两缺）落 stdout+evidence。
mx_audit_dispatch() { # <expect-file> → 0 全对上 / 1 有缺项
  local ef="$1" miss=0
  [ -f "$ef" ] || { echo "mx_audit_dispatch: 期望文件缺 $ef"; return 2; }
  local cards_all main_doc
  cards_all=$(HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban boards list 2>/dev/null | awk 'NR>2 && NF {print $1}' | while read -r b; do
    HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban --board "$b" list --json 2>/dev/null | python3 -c 'import sys,json
try:
  for c in json.load(sys.stdin): print((c.get("title") or "") + "|" + (c.get("body") or "")[:200])
except Exception: pass'
  done)
  main_doc=$(git -C "$DIRECTOR_CLONE" show "origin/main:docs/design/RFD-001-architecture-design.md" 2>/dev/null || echo "")
  echo "── 期望对账（$(date '+%F %T')，基线 ${ef}）──"
  while IFS='|' read -r dnum desc; do
    [ -z "$dnum" ] && continue
    local in_card=0 in_doc=0
    echo "$cards_all" | grep -q "$dnum" && in_card=1
    echo "$main_doc" | grep -q "$dnum" && in_doc=1
    if [ $in_card -eq 0 ] && [ $in_doc -eq 0 ]; then
      echo "  ✗✗ $dnum 两缺（无卡无稿）：$desc"; miss=$((miss+1))
    elif [ $in_card -eq 0 ]; then
      echo "  ◇  $dnum 稿有卡无（追踪缺，可接受）：$desc"
    else
      echo "  ✓  $dnum 卡稿双有：$desc"
    fi
  done < "$ef"
  [ $miss -gt 0 ] && echo "── 缺项 $miss 项（应存在而不存在——立即补派）──" && return 1
  echo "── 全对上 ──"; return 0
}

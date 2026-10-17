#!/bin/bash
# 全段提速开关（2026-10-18 用户指令立刻生效）：
#  PIPELINE_TRIGGER=on——流水线引擎增量派发发令（分支落地即派测/测试过即派集成，段间重叠）；
#  PARALLEL_REVIEW=on——G5 并行评审编排器放行。studio/网关继承本环境。
export PIPELINE_TRIGGER="${MX_PIPELINE_TRIGGER:-on}"
export PARALLEL_REVIEW="${MX_PARALLEL_REVIEW:-on}"
# mx-up.sh — 拉起单 gateway（多路复用）+ 单 studio（多 matrix 账号）
#
# host-ownership 合规（overlay/docs/superpowers/specs/2026-09-23-gateway-host-ownership.md）：
#   不使用 --force / --replace；与真机 orchestrator(:8650) 共存靠 HERMES_GATEWAY_LOCK_DIR 隔离锁目录。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# ── 维护锁（2026-10-16 外置盘迁移加）──────────────────────
# 必须置于 source mx-lib.sh 之前:mx-lib 在 source 时就有副作用(deploy/自愈),
# 锁放后面挡不住任何东西。锁文件放 ~/.mx-maintenance-lock:~/.hermes 内会被
# 外部清理逻辑删掉(20:37 实测,导致 20:47 服务被拉起回旧路径)。
# 存在锁文件时静默跳过:迁移/维护窗口内外部重试不会把服务拉起/撕裂数据。
if [ -f "$HOME/.mx-maintenance-lock" ]; then
  echo "mx-up: maintenance lock present ($HOME/.mx-maintenance-lock), skip"
  exit 0
fi

source "$SCRIPT_DIR/mx-lib.sh"


# ── 运行面自愈（533/534 长效化：自更新擦除后每次 mx-up 收敛恢复）──────
# 自更新会 git 清洗源码树——manifest 文件与 git-applied 补丁一并被擦（run5/6/7 三次实录，
# run7 anexec 并发闸拒收即此因）。mx-up 是推演起跑/恢复的唯一入口，在此双通道收敛：
#   ① deploy-agent-runtime --apply（manifest 21 文件内容同步，结构化 raci 等能力依赖）
#   ② mx_apply_agent_patches（390/391/533/534 git apply，源码树语义在位）
# 幂等：两路都带在位检查，重复跑零副作用；失败只告警不阻断（网关可能带旧码起——
# 容量风暴行为会复发，issues.log 会有拒收实录可追）。
if [[ -f "$OVERLAY_ROOT/scripts/deploy-agent-runtime.mjs" ]]; then
  ( cd "$OVERLAY_ROOT" && node scripts/deploy-agent-runtime.mjs --apply --runtime "$AGENT_SRC" )     || log "runtime manifest 自愈告警（deploy-agent-runtime 失败，需人工复核）"
fi
mx_apply_agent_patches || log "运行时 patch 自愈告警（533/534 可能缺位——并发闸拒收风险）"

# ── 诊断抑制配置收敛（run15 复盘 S3：No home channel 噪音根治）────────────
# agent 被 @ 唤醒但未设 home channel 时，先回一条「📬 No home channel…」诊断噪音再
# 干活（run15 02:03 三档案同秒各回一条实锤）。上游已有 suppress_warning_notifications
# 显示开关（warning_notifications.py），缺的只是 profiles 未配——每次 mx-up 幂等收敛：
# 全档案 display.suppress_warning_notifications=true（诊断类通知静默，正常回复不受影响）。
_mx_diag_suppress() {
  local _py="${HERMES_AGENT_VENV:-}"
  [[ -n "$_py" && -x "$_py" ]] || _py=$(_mx_yaml_py) || return 0
  "$_py" - "$HERMES_ROOT/profiles" <<'PY' 2>/dev/null || return 1
import sys, glob, os
try:
    import yaml
except ImportError:
    raise SystemExit(1)
root = sys.argv[1]
changed = 0
for conf in glob.glob(os.path.join(root, '*', 'config.yaml')):
    try:
        with open(conf, encoding='utf-8') as f:
            cfg = yaml.safe_load(f) or {}
        if not isinstance(cfg, dict):
            continue
        disp = cfg.get('display')
        if not isinstance(disp, dict):
            disp = {}
        if disp.get('suppress_warning_notifications') is True:
            continue
        disp['suppress_warning_notifications'] = True
        cfg['display'] = disp
        with open(conf, 'w', encoding='utf-8') as f:
            yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
        changed += 1
    except Exception:
        continue
print(f'diag-suppress converged: {changed} profile(s) updated')
PY
}
_mx_diag_suppress || log "诊断抑制收敛告警（S3：No home channel 噪音可能复发——profiles config.yaml 手工补 display.suppress_warning_notifications=true）"

# ── host 共存检查（G5 证据面）────────────────────────────
host_health=$(curl -sf "$HOST_ORCH_HEALTH" -m 3 || true)
if [[ -n "$host_health" ]]; then
  log "真机 orchestrator 在线（${HOST_ORCH_HEALTH}）——按隔离锁目录共存，不动它"
else
  log "真机 orchestrator 未探测到（${HOST_ORCH_HEALTH}）——继续"
fi

ensure_spawn_health   # 执行面预检（run20 00:30 瘫痪实录：防全绿假象起跑）

# ── 单 gateway（multiplex 全部 profile）────────────────
preflight_capacity_assert   # run11 左移件 a：容量类故障起跑前拒绝（并发闸/年龄锚双断言）

# ── 推演期防休眠（提速方案⑥ 2026-10-09：04:55 主机重启事故后加护栏——睡眠/电源类
#    中断是每轮最大非计划损耗；mac 走 caffeinate -dims，Windows 提示电源策略（平台层）──
mxp_prevent_sleep_on

# ── 负载预检（提速方案⑤：外部负载竞争拖垮网关健康窗与 agent 工具调用——run12
#    04:38 实测 loadavg 786 时 /health 10s 无应答。超阈值仅告警不拒跑，MX_LOAD_WARN 可调；
#    非 mac 平台 loadavg 取不到=静默跳过（平台层）──
load_1m=$(mxp_loadavg_1m)
if [ -n "$load_1m" ] && awk "BEGIN{exit !($load_1m > ${MX_LOAD_WARN:-200})}"; then
  log "负载预检告警：1 分钟负载均值 ${load_1m} 超阈值 ${MX_LOAD_WARN:-200}——外部负载竞争显著拖慢推演，建议错峰 armada/Docker 构建等重负载"
fi
if curl -sf "http://127.0.0.1:$GW_PORT/health" -m 2 >/dev/null 2>&1; then
  log "gateway 已在跑（:${GW_PORT}），跳过"
else
  [[ -d "$HERMES_ROOT" ]] || fail "先跑 mx-setup.sh"
  # HERMES_GATEWAY_BUSY_INPUT_MODE=queue（run4 实锤根治）：busy 回合收到新消息→静默 FIFO
  # 排队（不 interrupt、不发"排队/打断"通知）——多 agent 抢串行坑时通知互触的消息风暴
  # 由此断源；排队消息在回合结束后按序消费。
  # HERMES_BIN 必须同时进网关环境（run4 实锤第三层）：网关集成的 kanban dispatcher
  # spawn worker 时 $HERMES_BIN 优先于 "-m hermes_cli.main" 模块形式——缺它时用
  # sys.executable（SIM tools python）跑 -m，模块不在其 path 上=worker 必崩
  # （No module named hermes_cli，评审卡 run2-9 连崩实录）。
  # gate-guard 注入走 env 命令（run11 attempt-3 实锤：${VAR:+K=...} 与数组展开词
  # 都不会被 bash 重新识别为环境赋值——赋值只在解析期识别，展开产物必须经 env
  # 命令作参数转交；否则整词被当命令名执行"No such file or directory"）。
  _gg=(env)
  if [ -n "${MX_GATE_GUARD:-}" ]; then
    _gg+=("KANBAN_GATE_GUARD_FILE=$SIM_ROOT/var/current-state.env" "KANBAN_GATE_GUARD_KEYS=$MX_GATE_GUARD")
  fi
  # V8.29 夜间停滞防线②：日志轮转不截断（mx-up 重启曾覆盖隔夜 wedge/崩溃证据，
  #    事后只能靠终端引用）——旧档带时间戳保留
  [ -f "$LOGS_DIR/gateway.log" ] && mv "$LOGS_DIR/gateway.log" "$LOGS_DIR/gateway.log.$(date +%Y%m%d-%H%M%S).prev"
  # launchd 托管（2026-10-16 宿主清扫根治，默认开；MX_GATEWAY_LAUNCHD=0 回退 nohup）：
  # 宿主孤儿清扫器（_reap_unsupervised_gateway_orphans，macOS 无 systemd 时对无监督
  # 形态 argv 扫描硬杀——run20 三杀+维护窗击杀潮根因）豁免集=launchctl list 的
  # ai.hermes.gateway* 前缀扫描；launchd 父级同时免疫会话回收（杀 nohup 子进程组），
  # KeepAlive 替代会话内保母。详见 mux/mx-sim-gateway-service.sh 头注。
  _gw_launchd=0
  if [ "${MX_GATEWAY_LAUNCHD:-1}" = "1" ] && [ -x "$SCRIPT_DIR/mx-sim-gateway-service.sh" ]; then
    if bash "$SCRIPT_DIR/mx-sim-gateway-service.sh" up; then
      _gw_launchd=1
      _svc_pid=$(launchctl list 2>/dev/null | awk '$3 == "ai.hermes.gateway-sim" {print $1}' | head -1)
      echo "${_svc_pid:-0}" > "$PIDS_DIR/gateway.pid"
      log "gateway launchd 托管就绪（pid ${_svc_pid:-?}，label=ai.hermes.gateway-sim——宿主清扫豁免+会话回收免疫）"
    else
      log "⚠ launchd 托管失败——回退 nohup 形态（清扫风险回归，建议排查 plist）"
    fi
  fi
  if [ "$_gw_launchd" = "0" ]; then
  # 2026-10-15 10:39 实锤：注释行插进「VAR=... \」续行赋值链会把前缀赋值与命令切离——赋值只在
  # 解析期绑定当条命令，被注释隔断后仅落当前 shell（未导出），gateway run 裸跑：HERMES_HOME 回落
  # 宿主家目录→发现宿主网关在跑即 "nothing to start" 退出，SIM 网关起不来（8801 拒连）。
  # 环境一律经 env 命令作参数转交（与下方 run11 attempt-3 教训同法），注释移出命令链。
  "${_gg[@]}" PYTHONPATH="$HERMES_PYTHONPATH" HERMES_SKIP_UPDATE=1 HERMES_HOME="$HERMES_ROOT" \
    HERMES_GATEWAY_LOCK_DIR="$LOCK_DIR" HERMES_GATEWAY_BUSY_INPUT_MODE=queue HERMES_BIN="$HERMES_BIN" \
    HERMES_RUN_TRACE_DIR="$HERMES_ROOT/traces" \
    nohup "$HERMES_BIN" gateway run > "$LOGS_DIR/gateway.log" 2>&1 &
  echo $! > "$PIDS_DIR/gateway.pid"
  log "gateway 启动中（pid $(cat "$PIDS_DIR/gateway.pid")，日志 $LOGS_DIR/gateway.log）"
  fi
  # V8.29 适配器探活（10:5x 实录：/health 探活不覆盖矩阵面，假 home_channel 卡死适配器
  # 2.8h 隐形断档）：90s 窗内等矩阵平台装载行，未见即 fail-fast（带排障指引）
  for _i in $(seq 1 18); do
    sleep 5
    if grep -qE "MULTIPLEX.*Profile.*(ready|listening|connected)" "$LOGS_DIR/gateway.log" 2>/dev/null; then
      log "✓ 矩阵适配器装载确认（MULTIPLEX 行）"; break
    fi
    [[ $_i -eq 18 ]] && { log "⚠ 90s 未见矩阵适配器装载行——查 gateway.log 平台段（假 home_channel/凭据缺失均可致此）；派发链路未通，禁起跑"; }
  done
  # matrix 能力自愈（2026-10-17 mautrix macOS 门控事故，A 案兜底；B 案=643 补丁+快照锁重解）：
  # 上游把 matrix extra 门控 linux-only，正规安装在 darwin 拿不到 mautrix——探测网关进程
  # 同链 import，失败即旁路注入全部 pm 代际环境并重启网关复验；仍败=matrix 不可用，fail-fast。
  if [ -x "$SCRIPT_DIR/mx-sim-mautrix-ensure.sh" ]; then
    bash "$SCRIPT_DIR/mx-sim-mautrix-ensure.sh" ensure \
      || fail "SIM matrix 能力自愈失败（mx-sim-mautrix-ensure.sh check 看详情）——适配器不可用，禁起跑"
  fi
fi

# ── 单 studio（matrix-login 多账号 + ACL；agent 节点不跑 studio）────
if [[ "$MX_ROLE" == "agent" ]]; then
  log "MX_ROLE=agent：studio 段跳过（studio 在导演机，本机只跑 gateway）"
elif curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1; then
  log "studio 已在跑（:${STUDIO_PORT}），跳过"
else
  ensure_studio_up && log "studio 启动中（pid $(cat "$PIDS_DIR/studio.pid")，日志 $LOGS_DIR/studio.log）" || fail "studio 拉起失败（ensure_studio_up）"
fi

# ── 就绪等待 ────────────────────────────────────────────
deadline=$(( $(date +%s) + 300 ))
while (( $(date +%s) < deadline )); do
  g_ok=$(curl -sf "http://127.0.0.1:$GW_PORT/health" -m 2 >/dev/null 2>&1 && echo 1 || echo 0)
  if [[ "$MX_ROLE" == "agent" ]]; then s_ok=1; else s_ok=$(curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1 && echo 1 || echo 0); fi
  [[ "$g_ok" == 1 && "$s_ok" == 1 ]] && break
  sleep 3
done
# 2026-10-15 10:45 实锤：缺 aiohttp 时 /health 永拒连 → 此处 fail 先于下方自愈段退出，
# matrix 依赖缺口（正是自愈段能修的病：selfheal 装 mautrix+aiohttp 全家）反而永远走不到
# 自愈。未就绪+降级症状在 → 放行落到自愈段；未就绪且无降级症状 → 维持原 fail（别的问题）。
if [[ "${g_ok:-0}" != 1 ]]; then
  if matrix_adapter_degraded "$LOGS_DIR/gateway.log"; then
    log "gateway 300s 未就绪但 matrix 降级症状在（依赖缺失面）——交自愈段处置，不先行 fail"
  else
    fail "gateway 300s 内未就绪（$LOGS_DIR/gateway.log）"
  fi
fi
if [[ "$MX_ROLE" != "agent" ]]; then
  [[ "${s_ok:-0}" == 1 ]] || fail "studio 300s 内未就绪（$LOGS_DIR/studio.log）"
fi

# ── matrix 适配器自愈（pm 门控漂移/venv 缺依赖 → agent 全员哑火的根因面）──
if matrix_adapter_degraded "$LOGS_DIR/gateway.log"; then
  log "检测到 matrix 适配器降级（agent 将收不到 @mention）——执行自愈"
  if matrix_adapter_selfheal; then
    kill "$(cat "$PIDS_DIR/gateway.pid" 2>/dev/null)" 2>/dev/null; sleep 3
    # 重启环境必须与首启（:31-33）逐项对齐：缺 HERMES_HOME/LOCK_DIR 会落 ~/.hermes 真实环境并
    # 失去与宿主 orchestrator 的锁隔离，缺 HERMES_BIN 时 kanban worker spawn 必崩（run4 实锤第三层）
    ( cd "$SIM_ROOT" && PYTHONPATH="$HERMES_PYTHONPATH" HERMES_SKIP_UPDATE=1 HERMES_HOME="$HERMES_ROOT" HERMES_GATEWAY_LOCK_DIR="$LOCK_DIR" \
      HERMES_GATEWAY_BUSY_INPUT_MODE=queue HERMES_BIN="$HERMES_BIN" \
      nohup "$HERMES_BIN" gateway run > "$LOGS_DIR/gateway.log" 2>&1 & \
      echo $! > "$PIDS_DIR/gateway.pid" )
    deadline=$(( $(date +%s) + 120 ))
    while (( $(date +%s) < deadline )); do
      curl -sf "http://127.0.0.1:$GW_PORT/health" -m 2 >/dev/null 2>&1 && break; sleep 3
    done
    if matrix_adapter_degraded "$LOGS_DIR/gateway.log"; then
      log "自愈后 matrix 仍降级（查 $LOGS_DIR/gateway.log）——agent 轮将哑火"
    else
      log "matrix 自愈成功：适配器已恢复"
    fi
  else
    log "matrix 自愈失败——agent 轮将哑火，人工处置（hermes pm doctor）"
  fi
fi

log "=== 就绪：gateway :${GW_PORT}（多路复用）+ studio :$STUDIO_PORT ==="

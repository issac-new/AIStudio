#!/bin/bash
# mx-setup.sh — 单 gateway 多路复用拓扑一次性幂等准备（方案 V2.0 §4 P0-4）
#
# 产出（SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-mux）：
#   24 matrix 账号 + 单 hermes root + 12 Orchestrator profile + 22 研发专职 agent profile
#   + 每账号 2 块独立 kanban（board.json 挂 team 围栏）+ fleet-manifest + 技能同构副本
# 幂等：账号/板按存在性跳过；配置/manifest 每次重生成（模板同步，漂移自动收敛）。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

log "=== mx-setup：单 gateway 多路复用拓扑准备（SIM_ROOT=${SIM_ROOT}）==="

# ── 0. 前置检查 ─────────────────────────────────────────
command -v docker >/dev/null || fail "docker 不可用"
docker exec "$SYNAPSE_CONTAINER" true 2>/dev/null || fail "synapse 容器 $SYNAPSE_CONTAINER 未运行"
[[ -x "$HERMES_BIN" ]] || fail "HERMES_BIN 不可执行：$HERMES_BIN"
[[ -f "$HOME/.hermes/config.yaml" ]] || fail "宿主 config.yaml 不存在（模型配置来源）"
[[ -f "$STUDIO_DIST/server/index.js" ]] || fail "studio 构建产物缺失：$STUDIO_DIST/server/index.js（先 npm run build:full）"
curl -sf -m 3 "${MX_HINDSIGHT_API:-http://localhost:8888}/health" >/dev/null \
  || fail "hindsight 记忆服务（${MX_HINDSIGHT_API:-http://localhost:8888}）不可用——家族共享记忆依赖它（用户裁决 2026-09-25），请先拉起 hindsight-api 再跑"

# -- 0a. decision backend probe (F-7; fail-open, same discipline as 5.6-10)
# JEV gates & toolresultguard both degrade fail-open: offline = issue log, not blocking.
# Probe also snapshots version triple (mlx / mlx-vlm / model dir) into evidence.
MX_DECISION_API="${MX_DECISION_API:-http://127.0.0.1:8000}"
mkdir -p "$SIM_ROOT/evidence"
if curl -sf -m 3 "$MX_DECISION_API/health" >/dev/null 2>&1; then
  {
    echo "# decision-backend snapshot (F-7, $(date '+%F %T'))"
    echo "- endpoint: $MX_DECISION_API/health OK"
    "$HOME/lab/clef-runtime/venv/bin/python" -c 'import mlx.core as m, mlx_vlm; print(f"- mlx: {m.__version__}"); print(f"- mlx-vlm: {mlx_vlm.__version__}")' 2>/dev/null \
      || echo "- mlx/mlx-vlm probe failed (venv missing, honest note)"
    ls -1 ~/.cache/huggingface/hub 2>/dev/null | grep -i clef | sed 's/^/- model-snapshot: /' | head -2 \
      || echo "- model snapshot dir not found (honest note)"
  } > "$SIM_ROOT/evidence/decision-backend-snapshot.txt"
  log "decision backend online ($MX_DECISION_API), snapshot -> evidence/decision-backend-snapshot.txt"
else
  echo "ISSUE|decision-backend-degraded|product|decision backend ($MX_DECISION_API/health) probe failed - JEV gates & toolresultguard degrade fail-open (F-7, not blocking; start via ~/lab/clef-runtime/start-clef.sh)" >> "$SIM_ROOT/evidence/issues.log"
  log "WARN decision backend offline (fail-open, issue logged, not blocking)"
fi


# ── 0b. SIM 执行面快照供给（隔离轮 2026-10-03）：先快照后打补丁——
#     agent 源码快照就位后，390/391/533/534 与 runtime manifest 全部落 SIM 自有树，
#     宿主 ~/.hermes/hermes-agent 不再被推演写入。dist 快照使 studio 与活注入树解耦。
mx_provision_agent_src
mx_provision_product_dist

# ── 1. 运行时 patch（390/391 → SIM 源码快照树）───────────
mx_apply_agent_patches

# ── 1b. overlay/runtime 部署（B1 结构化 raci 等 7 文件；与 inject 出口同源，
#        mx 流程不经 inject 故显式幂等同步，失败只告警不阻断）─────────────
if [[ -f "$OVERLAY_ROOT/scripts/deploy-agent-runtime.mjs" ]]; then
  ( cd "$OVERLAY_ROOT" && node scripts/deploy-agent-runtime.mjs --apply --runtime "$AGENT_SRC" ) \
    || log "runtime 部署告警（结构化 raci 等能力依赖它，需人工复核 deploy-agent-runtime）"
fi

# ── 2. matrix 账号（产品通道供给，R31 2026-10-06 用户裁决直接落地）────
# 界面上线是必须要求：除系统引导账号 @admin（产品端点无法自举第一个 admin，
# docker exec 幂等保底）外，全部账号经 POST /api/governance/matrix-users 供给
# ——#/app/accounts「创建并登记 roster」同源，建号即 roster 提交（probe 锚
# rosterCommit=edc6ed2）。studio 先于 gateway 拉（/health/ready 只看自身
# bootstrap，不探 gateway）；账号在位即跳过（appendTableRow 不去重，重复
# 调会加重复 roster 行）；synapse 直建仅剩 admin 一处=系统引导语义。
synapse_register "admin" "$(user_pass admin)"
ensure_studio_up || fail "studio 提前拉起失败（R31 产品通道前置；查 $LOGS_DIR/studio.log）"
log "studio 就绪（:${STUDIO_PORT}，产品通道前置）"
for u in "${USERS[@]}"; do
  [[ "$u" == "admin" ]] && continue
  gov_provision_user "$u" || fail "产品通道供给失败：$u（端点/鉴权链查 studio.log；禁回退 synapse 直建——排查后重试）"
  log "账号供给（产品通道）：$u + $u-agent（建号即 roster 提交）"
done
for n in "${USERS[@]}" $(for u in "${USERS[@]}"; do echo "$u-agent"; done); do
  localpart="${n%-agent}"; suffix=""
  [[ "$n" == *-agent ]] && suffix="-agent"
  tok=$(mx_login "$n" "$(user_pass "$localpart$suffix")" | tr -d '\n')
  [[ -n "$tok" && "$tok" != "null" ]] || fail "matrix 登录失败：$n"
  save_token "$n" "$tok"
done
log "$(( ${#USERS[@]} * 2 )) 账号就绪"
# 账号清单入档 roster（去 token；token 留 creds/*.token 600，密码按约定式不落明文）
{
  echo "# matrix 账号清单 roster（$(date '+%F %T')；编制 ${#USERS[@]} 人 ×2 账号）"
  echo
  echo "| 账号 | mxid | 用途 |"
  echo "|---|---|---|"
  for u in "${USERS[@]}"; do
    echo "| $u | $(human_mxid "$u") | 人类（登录密码按 Aipay_<账号>_2026 约定） |"
    echo "| $u-agent | $(agent_mxid "$u") | AI 助理（token 见 creds/$u-agent.token） |"
  done
} > "$CREDS_DIR/roster.md"
chmod 600 "$CREDS_DIR/roster.md"

# ── 3. 单 root 配置 ─────────────────────────────────────
write_root_config

# ── 4. profiles：12 Orchestrator + 22 研发专职 agent ────
for u in "${INSTANCED_USERS[@]}"; do
  write_user_profile "$u"
  install_skills "$HERMES_ROOT/profiles/$u"
  write_user_manifest "$u"
  for a in $(agents_of "$u"); do
    write_agent_profile "$u" "$a"
    install_skills "$HERMES_ROOT/profiles/$(agent_profile "$u" "$a")"
  done
done
profile_count=$(find "$HERMES_ROOT/profiles" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
log "profiles 就绪：${profile_count} 个（${#INSTANCED_USERS[@]} Orchestrator + agent，admin 不起实例）"

# ── 5. 每账号 2 块独立 kanban + team 围栏 ───────────────
for u in "${INSTANCED_USERS[@]}"; do
  for b in $(boards_of "$u"); do
    slug="${b%%:*}"; agent="${b##*:}"
    if [[ ! -d "$HERMES_ROOT/kanban/boards/$slug" ]]; then
      HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban boards create "$slug" --name "$slug" >/dev/null \
        || fail "建板失败：$slug"
      log "已建板 $slug"
    fi
    set_board_team "$slug" "$(agent_profile "$u" "$agent")"
  done
done
# default 板 = 串板哨兵（G2 门禁要求全程零任务）
log "default 板保留为串板哨兵"

# ── 5b. 中央仓克隆（导演真值反查）+ 每账号工作区 ──────────
# 克隆后立即剥掉 remote URL 里的 token：git clone <带token URL> 会把它永久写进每个
# clone 的 remote.origin.url——随后 runs.tar/workspaces.tar 归档与 push 失败时的
# stderr（进 relay/scenario 日志=证据链）都会带着凭据扩散
gh_clone_sanitize() { # <cloneDir>：token 只用于拉取，落盘 remote 一律还原无凭据形态
  git -C "$1" remote set-url origin "https://github.com/${GH_REPO}.git" 2>/dev/null || true
}
if [[ ! -d "$DIRECTOR_CLONE/.git" ]]; then
  mkdir -p "$(dirname "$DIRECTOR_CLONE")"
  git clone -q "$(gh_clone_url)" "$DIRECTOR_CLONE" || fail "中央仓克隆失败（github token 见 gh_token 链）"
  gh_clone_sanitize "$DIRECTOR_CLONE"
  log "中央仓已克隆：${DIRECTOR_CLONE}（remote URL 已剥 token）"
fi
# 治理基线接线（2026-10-04 台账与规则页 404 实锤）：studio 的 resolveRosterFile 从服务目录
# 向上探测 <dir>/runtime/governance；SIM 根软链到中央仓 runtime/governance（单一事实源、
# agent 侧继续 git 版本化），三数据源（能力台账/决策规则/状态本体）随装即在。
# 24h 审查：原先嵌在首装守卫内——存量 SIM_ROOT（mx-clean 不删中央仓克隆）永不重放，
# 404 只在全新装机被修；两条命令自身幂等，移出守卫每轮供给。
mkdir -p "$SIM_ROOT/runtime"
ln -sfn "$SIM_ROOT/central/aipaydev/runtime/governance" "$SIM_ROOT/runtime/governance"
for u in "${INSTANCED_USERS[@]}"; do
  WS=$(workspace "$u")
  if [[ ! -d "$WS/.git" ]]; then
    mkdir -p "$(dirname "$WS")"
    git clone -q "$(gh_clone_url)" "$WS" || fail "账号工作区克隆失败：$u"
    gh_clone_sanitize "$WS"
    git -C "$WS" -c user.name="$u" -c user.email="$u@aipaydev.local" config user.name "$u"
    git -C "$WS" -c user.name="$u" -c user.email="$u@aipaydev.local" config user.email "$u@aipaydev.local"
    log "账号工作区就绪：${WS}（remote URL 已剥 token）"
  fi
done

# ── 6. fleet-manifest ───────────────────────────────────
write_fleet_manifest
log "fleet-manifest.json 就绪"

log "=== mx-setup 完成 ==="
log "下一步：mx-up.sh 拉起单 gateway（${GW_PORT}）+ 单 studio（${STUDIO_PORT}），mx-smoke.sh 走门禁"

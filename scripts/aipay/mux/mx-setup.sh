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

# ── 1. 运行时 patch（390/391 → 安装树）──────────────────
mx_apply_agent_patches

# ── 1b. overlay/runtime 部署（B1 结构化 raci 等 7 文件；与 inject 出口同源，
#        mx 流程不经 inject 故显式幂等同步，失败只告警不阻断）─────────────
if [[ -f "$OVERLAY_ROOT/scripts/deploy-agent-runtime.mjs" ]]; then
  ( cd "$OVERLAY_ROOT" && node scripts/deploy-agent-runtime.mjs --apply ) \
    || log "runtime 部署告警（结构化 raci 等能力依赖它，需人工复核 deploy-agent-runtime）"
fi

# ── 2. matrix 账号（幂等）+ token ───────────────────────
for u in "${USERS[@]}"; do
  synapse_register "$u" "$(user_pass "$u")"
  synapse_register "$u-agent" "$(user_pass "$u-agent")"
done
for n in "${USERS[@]}" $(for u in "${USERS[@]}"; do echo "$u-agent"; done); do
  localpart="${n%-agent}"; suffix=""
  [[ "$n" == *-agent ]] && suffix="-agent"
  tok=$(mx_login "$n" "$(user_pass "$localpart$suffix")" | tr -d '\n')
  [[ -n "$tok" && "$tok" != "null" ]] || fail "matrix 登录失败：$n"
  save_token "$n" "$tok"
done
log "24 账号就绪"

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
log "profiles 就绪：${profile_count} 个（11 Orchestrator + 22 agent，admin 不起实例）"

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
if [[ ! -d "$DIRECTOR_CLONE/.git" ]]; then
  mkdir -p "$(dirname "$DIRECTOR_CLONE")"
  git clone -q "$(gh_clone_url)" "$DIRECTOR_CLONE" || fail "中央仓克隆失败（github token 见 gh_token 链）"
  log "中央仓已克隆：$DIRECTOR_CLONE"
fi
for u in "${INSTANCED_USERS[@]}"; do
  WS=$(workspace "$u")
  if [[ ! -d "$WS/.git" ]]; then
    mkdir -p "$(dirname "$WS")"
    git clone -q "$(gh_clone_url)" "$WS" || fail "账号工作区克隆失败：$u"
    git -C "$WS" -c user.name="$u" -c user.email="$u@aipaydev.local" config user.name "$u"
    git -C "$WS" -c user.name="$u" -c user.email="$u@aipaydev.local" config user.email "$u@aipaydev.local"
    log "账号工作区就绪：$u"
  fi
done

# ── 6. fleet-manifest ───────────────────────────────────
write_fleet_manifest
log "fleet-manifest.json 就绪"

log "=== mx-setup 完成 ==="
log "下一步：mx-up.sh 拉起单 gateway（${GW_PORT}）+ 单 studio（${STUDIO_PORT}），mx-smoke.sh 走门禁"

#!/bin/bash
# aipay-setup.sh — 一次性环境准备（幂等）
#   1. 注册 24 个 Matrix 账号（12 人类 + 12 agent）并取 token（步骤 1）
#   2. 生成每用户"电脑"目录树 + gateway matrix channel 配置（步骤 2）
#   3. 安装推演技能到各 profile
#   4. 克隆 aipaydev 工作区（GitHub 中央仓）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

mkdir -p "$SIM_ROOT" "$LOGS_DIR" "$PIDS_DIR" "$EVID_DIR"

# ── 1. Matrix 账号 ────────────────────────────────────
for u in "${USERS[@]}"; do
  synapse_register "$u" "$(user_pass "$u")"
  synapse_register "$u-agent" "$(user_pass "$u-agent")"
done
for u in "${USERS[@]}"; do
  save_token "$u" "$(mx_login "$u" "$(user_pass "$u")")"
  save_token "$u-agent" "$(mx_login "$u-agent" "$(user_pass "$u-agent")")"
done
log "24 个 Matrix 账号就绪，token 已存 $CREDS_DIR"

# roster（去 token）入中央仓；含 token 的 credentials.md 仅落各用户目录（步骤 1 交付物）
(
  cd "$DIRECTOR_CLONE"
  git pull -q origin main 2>/dev/null || true
  {
    echo "# Matrix 账号分配表（管理员签发，$(date +%F)）"
    echo
    echo "- 服务器（matrix 地址）: $HS （server_name: $SERVER_NAME）"
    echo "- 各用户的 access token 与登录密码已通过安全渠道单独下发（本文件不含凭据）"
    echo
    echo "| 账号 | AI 助理账号 | 角色 |"
    echo "|---|---|---|"
    echo "| @admin:$SERVER_NAME | — | 管理员 |"
    for u in "${USERS[@]:1}"; do
      echo "| @$u:$SERVER_NAME | @$u-agent:$SERVER_NAME | $(case $u in bella) echo BA;; fanfan) echo 产品经理;; wei) echo 后端团队负责人;; mei) echo 前端团队负责人;; chen) echo 研发·csw-pay-core;; hu) echo 研发·csw-channel-wechat;; lin) echo 研发·csw-channel-alipay;; xiao) echo 研发·csw-cashier-mp;; qi) echo 测试·后端;; fei) echo 测试·前端;; arch) echo 架构治理;; esac) |"
    done
  } > docs/admin/roster.md
  git add -A && git commit -qm "admin: matrix 账号分配表" && git push -q origin main
)
for u in "${INSTANCED_USERS[@]}"; do
  mkdir -p "$(user_root "$u")"
  cat > "$(user_root "$u")/credentials.md" <<EOF
# $u 的 Matrix 凭据（仅本人可见）
- matrix 地址: $HS
- 账号: @$u:$SERVER_NAME
- 登录密码: $(user_pass "$u")
- access token: $(load_token "$u")
- AI 助理账号: @$u-agent:$SERVER_NAME
EOF
  chmod 600 "$(user_root "$u")/credentials.md"
done

# ── 2. 每用户目录树 + gateway 配置（等价真机 8650 配置）──
API_KEY=$(api_server_key)
for u in "${INSTANCED_USERS[@]}"; do
  ROOT=$(hermes_root "$u"); PROF=$(profile_dir "$u")
  mkdir -p "$PROF" "$(webui_home "$u")" "$(dirname "$(workspace "$u")")"
  chmod 700 "$(user_root "$u")"

  echo "$u" > "$ROOT/active_profile"

  GW_PORT=$(gateway_port "$u") python3 - "$HOME/.hermes/config.yaml" > "$PROF/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['platforms'] = {
    'api_server': {'enabled': True, 'extra': {'host': '127.0.0.1', 'port': int(os.environ['GW_PORT'])}},
    'matrix': {'enabled': True},
    'email': {'enabled': False}, 'weixin': {'enabled': False}, 'webhook': {'enabled': False},
}
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$PROF/config.yaml"

  # gateway .env：MATRIX 五件套。HOME_ROOM 暂不设（房间在场景内由 fanfan 建），
  # ALLOWED_ROOMS 放开为空 = 接受所有被邀请房间；ALLOWED_USERS 限编制内人类。
  AGENT_MXID=$(agent_mxid "$u")
  HUMANS=""
  for h in "${USERS[@]}"; do HUMANS="$HUMANS,$(human_mxid "$h")"; done
  HUMANS="${HUMANS#,}"
  cat > "$PROF/.env" <<ENVEOF
MATRIX_HOMESERVER=$HS
MATRIX_ACCESS_TOKEN=$(load_token "$u-agent")
MATRIX_USER_ID=$AGENT_MXID
MATRIX_ALLOWED_USERS=$HUMANS
MATRIX_E2EE_MODE=off
MATRIX_AUTO_THREAD=true
API_SERVER_KEY=$API_KEY
ENVEOF
  chmod 600 "$PROF/.env"

  [[ -f "$ROOT/.env" ]] || { echo "API_SERVER_KEY=$API_KEY" > "$ROOT/.env"; chmod 600 "$ROOT/.env"; }
  write_manifest "$u"

  # ── 3. 技能安装 ──────────────────────────────────────
  SKILLS_TARGET="$ROOT/skills"
  PROF_SKILLS="$PROF/skills"
  mkdir -p "$SKILLS_TARGET" "$PROF_SKILLS"
  install_skill() { # <skill-name>
    local s="$1"
    if [[ ! -d "$SKILLS_TARGET/$s" ]]; then
      mkdir -p "$SKILLS_TARGET/$s"
      cp "$SKILLS_SRC/$s/SKILL.md" "$SKILLS_TARGET/$s/SKILL.md"
    fi
    ln -sfn "$SKILLS_TARGET/$s" "$PROF_SKILLS/$s"
  }
  case "$u" in
    fanfan) for s in capability-report requirements-analyst pm-planning inbox-dedup; do install_skill "$s"; done ;;
    chen|hu|lin|xiao) for s in capability-report aipaydev-dev inbox-dedup defect-loop; do install_skill "$s"; done ;;
    qi|fei) for s in capability-report aipaydev-dev inbox-dedup defect-loop; do install_skill "$s"; done ;;
    *) install_skill capability-report; install_skill inbox-dedup ;;
  esac
  log "用户 $u home 就绪（gateway :$(gateway_port "$u")，技能已装）"
done

# ── 4. 各用户 clone aipaydev ──────────────────────────
for u in "${INSTANCED_USERS[@]}"; do
  WS=$(workspace "$u")
  if [[ ! -d "$WS" ]]; then
    git clone -q "$(gh_clone_url)" "$WS"
    (
      cd "$WS"
      git config user.name "$u (aipay)"
      git config user.email "$u@aipaydev.local"
    )
  fi
  log "用户 $u workspace: $WS"
done

log "setup 完成。下一步: bash aipay-up.sh"

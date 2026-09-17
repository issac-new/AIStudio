#!/bin/bash
# sim-setup.sh — 一次性环境准备（幂等）
#   1. 注册 6 个 Matrix 账号（3 人类 + 3 agent bot）并取 token
#   2. 建项目房间并全员加入
#   3. 生成每用户"电脑"目录树（.hermes home / webui home / workspace）
#   4. 初始化中央 bare 仓库 + 基线提交 + 各用户 clone
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=sim-lib.sh
source "$SCRIPT_DIR/sim-lib.sh"

mkdir -p "$SIM_ROOT" "$LOGS_DIR" "$PIDS_DIR" "$EVID_DIR"

# ── 1. Matrix 账号 ────────────────────────────────────
for u in "${USERS[@]}"; do
  synapse_register "$u" "SimPass_${u}_2026"
  synapse_register "$u-agent" "SimPass_${u}-agent_2026"
done
for u in "${USERS[@]}"; do
  save_token "$u" "$(mx_login "$u" "SimPass_${u}_2026")"
  save_token "$u-agent" "$(mx_login "$u-agent" "SimPass_${u}-agent_2026")"
done
log "6 个 Matrix 账号就绪，token 已存 $CREDS_DIR"

# ── 2. 项目房间 ───────────────────────────────────────
ALICE_TOKEN=$(load_token alice)
if [[ ! -s "$CREDS_DIR/room.id" ]]; then
  ROOM_ID=$(mx "$ALICE_TOKEN" POST createRoom "$(jq -n \
    --arg a "$(agent_mxid alice)" --arg b "$(human_mxid bob)" --arg ba "$(agent_mxid bob)" \
    --arg c "$(human_mxid carol)" --arg ca "$(agent_mxid carol)" \
    '{name:"stringops v0.1 交付", preset:"private_chat",
      invite:[$a,$b,$ba,$c,$ca]}')" | jq -r '.room_id')
  [[ "$ROOM_ID" == '!'* ]] || fail "建房失败: $ROOM_ID"
  save_room "$ROOM_ID"
fi
ROOM_ID=$(load_room)
log "项目房间: $ROOM_ID"

for name in alice bob carol alice-agent bob-agent carol-agent; do
  mx "$(load_token "$name")" POST "rooms/$ROOM_ID/join" '{}' >/dev/null 2>&1 || true
done
MEMBERS=$(mx_room_members "$ALICE_TOKEN" "$ROOM_ID" | sort | tr '\n' ' ')
log "房间成员: $MEMBERS"
NMEMBERS=$(mx_room_members "$ALICE_TOKEN" "$ROOM_ID" | grep -c .)
[[ "$NMEMBERS" == "6" ]] || fail "房间成员不足 6 个（实际 ${NMEMBERS}）"

# ── 3. 每用户目录树 + 配置 ────────────────────────────
API_KEY=$(api_server_key)
for u in "${USERS[@]}"; do
  ROOT=$(hermes_root "$u"); PROF=$(profile_dir "$u")
  mkdir -p "$PROF" "$(webui_home "$u")" "$(dirname "$(workspace "$u")")"
  chmod 700 "$(user_root "$u")"

  echo "$u" > "$ROOT/active_profile"

  # config.yaml：拷贝真机 model/fallback/toolsets/agent + custom_providers/model_catalog
  #（custom_providers 定义 custom:cc-switch 等，缺失时 gateway 报 Unknown provider）
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

  # gateway 凭据 .env：MATRIX 五件套 + 白名单 + API_SERVER_KEY
  AGENT_MXID=$(agent_mxid "$u")
  HUMANS="$(human_mxid alice),$(human_mxid bob),$(human_mxid carol)"
  cat > "$PROF/.env" <<ENVEOF
MATRIX_HOMESERVER=$HS
MATRIX_ACCESS_TOKEN=$(load_token "$u-agent")
MATRIX_USER_ID=$AGENT_MXID
MATRIX_HOME_ROOM=$ROOM_ID
MATRIX_ALLOWED_ROOMS=$ROOM_ID
MATRIX_ALLOWED_USERS=$HUMANS
MATRIX_E2EE_MODE=off
API_SERVER_KEY=$API_KEY
ENVEOF
  chmod 600 "$PROF/.env"

  # studio 侧 root .env（后端 API_SERVER_KEY 回落读 ~/.hermes/.env，这里仅给目录完整性）
  [[ -f "$ROOT/.env" ]] || { echo "API_SERVER_KEY=$API_KEY" > "$ROOT/.env"; chmod 600 "$ROOT/.env"; }
  log "用户 $u home 就绪: $ROOT (gateway api_server :$(gateway_port "$u"))"
done

# ── 4. 中央仓库 + 各用户 clone ────────────────────────
if [[ ! -d "$CENTRAL_REPO" ]]; then
  git init --bare -b main "$CENTRAL_REPO" >/dev/null
  TMP=$(mktemp -d)
  (
    cd "$TMP"
    git init -b main >/dev/null
    git config user.name "release-bot"
    git config user.email "release@sim.local"
    mkdir -p stringops tests
    cat > pyproject.toml <<'PYEOF'
[project]
name = "stringops"
version = "0.0.1"
requires-python = ">=3.9"
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
PYEOF
    echo '"""stringops — 字符串工具库（模拟交付项目）"""' > stringops/__init__.py
    cat > tests/test_smoke.py <<'PYEOF'
def test_package_imports():
    import stringops
    assert stringops.__doc__
PYEOF
    git add -A && git commit -qm "chore: baseline skeleton"
    git push -q "$CENTRAL_REPO" main
  )
  rm -rf "$TMP"
  log "中央仓库就绪: $CENTRAL_REPO"
fi
for u in "${USERS[@]}"; do
  WS=$(workspace "$u")
  if [[ ! -d "$WS" ]]; then
    git clone -q "$CENTRAL_REPO" "$WS"
    (
      cd "$WS"
      git config user.name "$u (sim)"
      git config user.email "$u@sim.local"
      git remote add central "$CENTRAL_REPO" 2>/dev/null || true
    )
  fi
  log "用户 $u workspace: $WS"
done

log "setup 完成。下一步: bash sim-up.sh"

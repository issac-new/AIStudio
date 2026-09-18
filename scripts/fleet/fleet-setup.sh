#!/bin/bash
# fleet-setup.sh — 一次性置备（幂等，全量三用户）
#   1. Synapse 容器在跑；注册 6 个 Matrix 账号并确保有效 token（fleet 新会话）
#   2. 每用户：独立 SwarmStudio.app 副本 + HOME 沙箱 + 预置 runtime（含 venv 装 pytest）
#   3. 建 fleet 项目房间并 6 成员加入
#   4. 每用户 .hermes profile（config.yaml + matrix 五件套 .env）
#   5. 中央 bare 仓库 + 基线 + 各用户 clone
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/fleet-lib.sh"

mkdir -p "$FLEET_ROOT" "$LOGS_DIR" "$PIDS_DIR" "$EVID_DIR"

# ── 0. 前置检查 ────────────────────────────────────────
[[ -x "$SOURCE_APP/Contents/MacOS/SwarmStudio" ]] || fail "缺少源应用 ${SOURCE_APP}（先安装 SwarmStudio 2.27+）"
SRC_RT=$(source_runtime)
[[ -x "$SRC_RT/python/venv/bin/hermes" && -x "$SRC_RT/node/bin/node" ]] \
  || fail "源运行时不完整: ${SRC_RT}（缺 venv hermes 或 node；先跑一次真实应用让它落盘）"
docker inspect "$SYNAPSE_CONTAINER" >/dev/null 2>&1 || fail "docker 容器 $SYNAPSE_CONTAINER 不存在"
docker start "$SYNAPSE_CONTAINER" >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "$HS/_matrix/client/versions" && break
  sleep 1
done
curl -sf -o /dev/null "$HS/_matrix/client/versions" || fail "Synapse 未就绪: $HS"

# ── 1. Matrix 账号 + token（有效则复用，失效重新 login）──
# 账号体系与 09-17 sim 共用（同一批人：alice/bob/carol ± agent）；
# fleet 只是各开新会话（新 token、新房间），Matrix 多会话语义允许与旧 sim 并存。
# 密码公式与既有账号一致（SimPass_*），全新 homeserver 下注册也走同一公式。
for u in "${USERS[@]}"; do
  synapse_register "$u" "SimPass_${u}_2026"
  synapse_register "$u-agent" "SimPass_${u}-agent_2026"
done
for name in alice bob carol alice-agent bob-agent carol-agent; do
  localpart="$name"
  t=""
  [[ -s "$CREDS_DIR/$name.token" ]] && t=$(load_token "$name") || true
  if [[ -z "$t" ]] || ! token_valid "$t" "$localpart"; then
    t=$(mx_login "$name" "SimPass_${name}_2026")
    [[ -n "$t" && "$t" != "null" ]] || fail "matrix login 失败: $name"
    save_token "$name" "$t"
    log "matrix 新会话: $name"
  else
    log "matrix 会话有效，复用: $name"
  fi
done

# ── 2. fleet 房间 ──────────────────────────────────────
ALICE_TOKEN=$(load_token alice)
if [[ ! -s "$CREDS_DIR/room.id" ]]; then
  ROOM_ID=$(mx "$ALICE_TOKEN" POST createRoom "$(jq -n \
    --arg a "$(agent_mxid alice)" --arg b "$(human_mxid bob)" --arg ba "$(agent_mxid bob)" \
    --arg c "$(human_mxid carol)" --arg ca "$(agent_mxid carol)" \
    '{name:"stringops v0.1 交付（fleet）", preset:"private_chat",
      invite:[$a,$b,$ba,$c,$ca]}')" | jq -r '.room_id')
  [[ "$ROOM_ID" == '!'* ]] || fail "建房失败: $ROOM_ID"
  save_room "$ROOM_ID"
fi
ROOM_ID=$(load_room)
log "fleet 房间: $ROOM_ID"
for name in alice bob carol alice-agent bob-agent carol-agent; do
  mx "$(load_token "$name")" POST "rooms/$ROOM_ID/join" '{}' >/dev/null 2>&1 || true
done
NMEMBERS=$(mx_room_members "$ALICE_TOKEN" "$ROOM_ID" | grep -c .)
[[ "$NMEMBERS" == "6" ]] || fail "房间成员不足 6 个（实际 ${NMEMBERS}）"

# ── 3. 每用户沙箱：app 副本 + runtime + venv pytest ────
PIP_INDEX_URL="${FLEET_PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
for u in "${USERS[@]}"; do
  ROOT=$(user_root "$u"); APP=$(app_copy "$u"); HOME_U=$(home_dir "$u")
  mkdir -p "$ROOT/apps" "$(dirname "$(workspace "$u")")"
  chmod 700 "$ROOT"

  if [[ ! -x "$APP/Contents/MacOS/SwarmStudio" ]]; then
    log "$u 拷贝独立应用副本 → ${APP}（约 1.3G）"
    cp -a "$SOURCE_APP" "$APP"
  else
    log "$u 应用副本已存在，跳过"
  fi

  RT=$(runtime_dir "$u")
  if [[ ! -x "$RT/python/venv/bin/hermes" ]]; then
    log "$u 预置运行时 → ${RT}（约 1.4G）"
    mkdir -p "$(dirname "$RT")"
    cp -a "$SRC_RT" "$RT"
  else
    log "$u 运行时已存在，跳过"
  fi

  VPY=$(instance_python "$u")
  if ! "$VPY" -c 'import pytest' >/dev/null 2>&1; then
    log "$u 实例 venv 安装 pytest（${PIP_INDEX_URL}）"
    "$VPY" -m pip install -q --index-url "$PIP_INDEX_URL" pytest \
      || fail "$u pytest 安装失败（可用 FLEET_PIP_INDEX_URL 换镜像）"
  fi
  "$VPY" -c 'import pytest' >/dev/null 2>&1 || fail "$u 实例 venv 缺 pytest"
done

# ── 4. 每用户 .hermes profile 配置 ─────────────────────
API_KEY=$(api_server_key)
[[ -n "$API_KEY" ]] || fail "取不到 API_SERVER_KEY（查 ~/.hermes/.env）"
for u in "${USERS[@]}"; do
  HROOT=$(hermes_root "$u"); PROF=$(profile_dir "$u")
  mkdir -p "$PROF"
  chmod 700 "$(home_dir "$u")"

  echo "$u" > "$HROOT/active_profile"

  # config.yaml：拷贝真机 model/fallback/toolsets/agent + custom_providers/model_catalog
  #（custom_providers 定义 custom:cc-switch 等，缺失时 gateway 报 Unknown provider）。
  # 共享运行时（本机模型代理等）由各实例沿用，不复制。
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

  # gateway 凭据 .env：matrix 五件套 + 白名单（房间收敛到 fleet 房间，与旧 sim 互不串扰）
  HUMANS="$(human_mxid alice),$(human_mxid bob),$(human_mxid carol)"
  cat > "$PROF/.env" <<ENVEOF
MATRIX_HOMESERVER=$HS
MATRIX_ACCESS_TOKEN=$(load_token "$u-agent")
MATRIX_USER_ID=$(agent_mxid "$u")
MATRIX_HOME_ROOM=$ROOM_ID
MATRIX_ALLOWED_ROOMS=$ROOM_ID
MATRIX_ALLOWED_USERS=$HUMANS
MATRIX_E2EE_MODE=off
API_SERVER_KEY=$API_KEY
ENVEOF
  chmod 600 "$PROF/.env"

  # studio 侧 root .env（后端 API_SERVER_KEY 回落读，这里给目录完整性）
  [[ -f "$HROOT/.env" ]] || { echo "API_SERVER_KEY=$API_KEY" > "$HROOT/.env"; chmod 600 "$HROOT/.env"; }
  log "用户 $u 沙箱就绪: app=$(app_copy "$u") studio :$(studio_port "$u") gateway :$(gateway_port "$u")"
done

# ── 5. 中央仓库 + 各用户 clone ─────────────────────────
if [[ ! -d "$CENTRAL_REPO" ]]; then
  git init --bare -b main "$CENTRAL_REPO" >/dev/null
  TMP=$(mktemp -d)
  (
    cd "$TMP"
    git init -b main >/dev/null
    git config user.name "release-bot"
    git config user.email "release@fleet.local"
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
    echo '"""stringops — 字符串工具库（fleet 模拟交付项目）"""' > stringops/__init__.py
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
      git config user.name "$u (fleet)"
      git config user.email "$u@fleet.local"
      git remote add central "$CENTRAL_REPO" 2>/dev/null || true
    )
  fi
  log "用户 $u workspace: $WS"
done

log "setup 完成。下一步: bash fleet-up.sh"

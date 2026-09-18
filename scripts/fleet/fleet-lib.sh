#!/bin/bash
# fleet-lib.sh — Matrix Fleet 独立桌面应用多实例部署公共库
# 设计文档: docs/superpowers/specs/2026-09-18-matrix-fleet-deploy-design.md
#
# 与 scripts/sim 的关系：sim 验证协议层（dev 树 server + 浏览器，已冻结归档）；
# fleet 验证部署形态（独立实例 + HOME 沙箱）。本库自包含，不依赖 dev 树。
#
# v2 共享化（用户指令）：应用直接使用本机安装（/Applications/SwarmStudio.app，
# 版本与所有安装保持一致，零副本）；运行时全 fleet 共享单份
# $FLEET_ROOT/shared/desktop-runtime（实例经 HERMES_DESKTOP_RUNTIME_DIR 重定向）。
# 每用户只保留 HOME 沙箱（配置与状态层）与 workspace。

set -euo pipefail

# /usr/bin/git 是 Xcode shim：系统升级后未接受 license 时直接拒绝执行（exit 69）。
# 统一前置 homebrew 路径；该 PATH 会经桌面 userSearchPath 透传给 server/网关/agent。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ── 常量 ────────────────────────────────────────────────
FLEET_ROOT="${FLEET_ROOT:-/Volumes/nvme2230/lab/ncwk-fleet}"
SOURCE_APP="${SOURCE_APP:-/Applications/SwarmStudio.app}"
SOURCE_RUNTIME_ROOT="${SOURCE_RUNTIME_ROOT:-$HOME/.hermes-web-ui/desktop-runtime}"
RUNTIME_VER="${RUNTIME_VER:-0.21.3}"
HS="http://127.0.0.1:8008"
SERVER_NAME="matrix.test"
SYNAPSE_CONTAINER="matrix-synapse"

SHARED_RUNTIME_ROOT="$FLEET_ROOT/shared/desktop-runtime"
CREDS_DIR="$FLEET_ROOT/creds"
LOGS_DIR="$FLEET_ROOT/logs"
PIDS_DIR="$FLEET_ROOT/pids"
EVID_DIR="$FLEET_ROOT/evidence"
CENTRAL_REPO="$FLEET_ROOT/central/stringops.git"

USERS=(alice bob carol)

# ── 每用户端口/路径（i = 1..3）─────────────────────────
user_index() { # alice→1 bob→2 carol→3
  case "$1" in
    alice) echo 1 ;;
    bob) echo 2 ;;
    carol) echo 3 ;;
    *) echo "unknown user: $1" >&2; return 1 ;;
  esac
}

studio_port() { echo $(( 8761 + $(user_index "$1") )); }
gateway_port() { echo $(( 8781 + $(user_index "$1") )); }
user_root()    { echo "$FLEET_ROOT/users/$1"; }
home_dir()     { echo "$(user_root "$1")/home"; }
app_bin()      { echo "$SOURCE_APP/Contents/MacOS/SwarmStudio"; }
hermes_root()  { echo "$(home_dir "$1")/.hermes"; }        # studio 侧 HERMES_HOME
profile_dir()  { echo "$(hermes_root "$1")/profiles/$1"; } # gateway 侧 HERMES_HOME
webui_home()   { echo "$(home_dir "$1")/.hermes-web-ui"; }
shared_runtime() { echo "$SHARED_RUNTIME_ROOT/hermes/$RUNTIME_VER/mac-arm64"; }
shared_venv()    { echo "$(shared_runtime)/python/venv/bin"; }
shared_python()  { echo "$(shared_venv)/python3"; }
shared_hermes()  { echo "$(shared_venv)/hermes"; }
source_runtime() { echo "$SOURCE_RUNTIME_ROOT/hermes/$RUNTIME_VER/mac-arm64"; }
workspace()    { echo "$(user_root "$1")/workspace/stringops"; }

agent_mxid() { echo "@$1-agent:$SERVER_NAME"; }
human_mxid() { echo "@$1:$SERVER_NAME"; }

# ── 日志 ────────────────────────────────────────────────
log()  { echo "[fleet $(date +%H:%M:%S)] $*"; }
fail() { echo "[fleet FAIL $(date +%H:%M:%S)] $*" >&2; exit 1; }

# ── Synapse 管理（容器与本机 docker）──────────────────
synapse_list_users() {
  docker exec "$SYNAPSE_CONTAINER" python3 -c "
import sqlite3
db = sqlite3.connect('/data/homeserver.db')
print('\n'.join(r[0] for r in db.execute('select name from users')))
" 2>/dev/null
}

synapse_register() { # <localpart> <password>  幂等：已存在则跳过
  local u="$1" p="$2"
  if synapse_list_users | grep -qx "@$u:$SERVER_NAME"; then
    log "matrix 用户 @$u:$SERVER_NAME 已存在，跳过注册"
    return 0
  fi
  docker exec "$SYNAPSE_CONTAINER" register_new_matrix_user \
    -c /data/homeserver.yaml -a -u "$u" -p "$p" >/dev/null 2>&1 \
    || fail "注册 matrix 用户 $u 失败"
  log "已注册 matrix 用户 @$u:$SERVER_NAME"
}

# ── Matrix 客户端 API ──────────────────────────────────
mx_login() { # <localpart> <password> → stdout: access_token
  curl -sf "$HS/_matrix/client/v3/login" \
    -H 'Content-Type: application/json' \
    -d "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"$1\"},\"password\":\"$2\"}" \
    | jq -r '.access_token'
}

mx() { # <token> <method> <api-path> [json-body] → stdout: response
  local token="$1" method="$2" path="$3" body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -sf -X "$method" "$HS/_matrix/client/v3/$path?access_token=$token" \
      -H 'Content-Type: application/json' -d "$body"
  else
    curl -sf -X "$method" "$HS/_matrix/client/v3/$path?access_token=$token"
  fi
}

mx_send() { # <token> <roomId> <text> [mentioned-mxid] → event_id
  local token="$1" room="$2" text="$3" mention="${4:-}"
  local mentions='{}'
  [[ -n "$mention" ]] && mentions="{\"user_ids\":[\"$mention\"]}"
  mx "$token" POST "rooms/$room/send/m.room.message" \
    "{\"msgtype\":\"m.text\",\"body\":$(jq -Rn --arg t "$text" '$t'),\"m.mentions\":$mentions}" \
    | jq -r '.event_id'
}

mx_messages() { # <token> <roomId> <limit> → 倒序消息数组（最新在前）
  local token="$1" room="$2" limit="${3:-100}"
  curl -sf "$HS/_matrix/client/v3/rooms/$room/messages?access_token=$token&dir=b&limit=$limit" \
    | jq -c '[.chunk[] | select(.type == "m.room.message")]'
}

mx_room_members() { # <token> <roomId>
  local token="$1" room="$2"
  mx "$token" GET "rooms/$room/joined_members" | jq -r '.joined | keys[]'
}

token_valid() { # <token> <localpart> → 0 有效
  local out
  out=$(curl -sf "$HS/_matrix/client/v3/account/whoami?access_token=$1" 2>/dev/null) || return 1
  [[ "$(echo "$out" | jq -r '.user_id // empty')" == "@$2:$SERVER_NAME" ]]
}

# ── Studio API（各实例独立端口）────────────────────────
studio() { # <port> <method> <path> [jwt] [json-body]
  local port="$1" method="$2" path="$3" jwt="${4:-}" body="${5:-}"
  local args=(-s -X "$method" "http://127.0.0.1:$port$path" -o /tmp/fleet-api.$$ -w '%{http_code}')
  [[ -n "$jwt" ]] && args+=(-H "Authorization: Bearer $jwt")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  local code
  code=$(curl "${args[@]}") || { rm -f /tmp/fleet-api.$$; return 1; }
  cat /tmp/fleet-api.$$; rm -f /tmp/fleet-api.$$
  [[ "$code" == 2* ]] || return 1
}

studio_login() { # <user> → jwt（每实例默认 admin/123456，状态隔离互不影响）
  local port; port=$(studio_port "$1")
  studio "$port" POST /api/auth/login "" \
    '{"username":"admin","password":"123456"}' | jq -r '.token'
}

# ── 凭据存取 ────────────────────────────────────────────
save_token() { # <name> <token>
  mkdir -p "$CREDS_DIR"; chmod 700 "$CREDS_DIR"
  printf '%s' "$2" > "$CREDS_DIR/$1.token"; chmod 600 "$CREDS_DIR/$1.token"
}
load_token() { cat "$CREDS_DIR/$1.token"; }
save_room() { mkdir -p "$CREDS_DIR"; printf '%s' "$1" > "$CREDS_DIR/room.id"; chmod 600 "$CREDS_DIR/room.id"; }
load_room() { cat "$CREDS_DIR/room.id"; }

api_server_key() { grep '^API_SERVER_KEY=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2- | tr -d '"' ; }

wait_http() { # <url> <name> <timeout-sec>
  local deadline=$(( $(date +%s) + $3 ))
  while (( $(date +%s) < deadline )); do
    curl -sf -o /dev/null "$1" && { log "$2 就绪: $1"; return 0; }
    sleep 3
  done
  fail "$2 在 $3s 内未就绪: $1（查 ${LOGS_DIR}）"
}

#!/bin/bash
# sim-lib.sh — ncwk 多用户 Matrix 协作模拟公共库
# 设计文档: docs/superpowers/specs/2026-09-17-multiuser-matrix-collab-sim-design.md
#
# 环境假设（见设计文档 §2）：
#   - Synapse 容器 matrix-synapse 运行于 127.0.0.1:8008，server_name=matrix.test
#   - hermes venv: ~/.hermes/hermes-agent/venv/bin/hermes（含 mautrix）
#   - Studio 生产构建: upstream/hermes-studio/dist/server/index.js
# 共享运行时（本机 cc-switch 模型代理等）由各实例沿用，不复制。

set -euo pipefail

# /usr/bin/git 是 Xcode shim：系统升级后未接受 license 时直接拒绝执行（exit 69）。
# 统一前置 homebrew 路径，保证所有子进程（含 agent 工具链）拿到可用的 git。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ── 常量 ────────────────────────────────────────────────
SIM_ROOT="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim}"
NCWK="/Volumes/nvme2230/lab/ncwk"
STUDIO_TREE="$NCWK/upstream/hermes-studio"
DIST_SERVER="$STUDIO_TREE/dist/server/index.js"
HERMES_BIN="$HOME/.hermes/hermes-agent/venv/bin/hermes"
HS="http://127.0.0.1:8008"
SERVER_NAME="matrix.test"
SYNAPSE_CONTAINER="matrix-synapse"

CREDS_DIR="$SIM_ROOT/creds"
LOGS_DIR="$SIM_ROOT/logs"
PIDS_DIR="$SIM_ROOT/pids"
EVID_DIR="$SIM_ROOT/evidence"
CENTRAL_REPO="$SIM_ROOT/central/stringops.git"

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

studio_port() { echo $(( 8700 + $(user_index "$1") )); }
gateway_port() { echo $(( 8720 + $(user_index "$1") )); }
user_root() { echo "$SIM_ROOT/users/$1"; }
hermes_root() { echo "$(user_root "$1")/.hermes"; }        # studio 侧 HERMES_HOME
profile_dir() { echo "$(hermes_root "$1")/profiles/$1"; } # gateway 侧 HERMES_HOME
webui_home() { echo "$(user_root "$1")/webui"; }
workspace()  { echo "$(user_root "$1")/workspace/stringops"; }

agent_mxid() { echo "@$1-agent:$SERVER_NAME"; }
human_mxid() { echo "@$1:$SERVER_NAME"; }

# ── 日志 ────────────────────────────────────────────────
log()  { echo "[sim $(date +%H:%M:%S)] $*"; }
fail() { echo "[sim FAIL $(date +%H:%M:%S)] $*" >&2; exit 1; }

# ── Synapse 管理 ───────────────────────────────────────
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

synapse_deactivate() { # <localpart>
  docker exec "$SYNAPSE_CONTAINER" python3 -m synapse._scripts.deactivate_user \
    -c /data/homeserver.yaml "@$1:$SERVER_NAME" 2>/dev/null || true
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

mx_send() { # <token> <roomId> <text> [mentioned-mxid]
  local token="$1" room="$2" text="$3" mention="${4:-}"
  local mentions='{}'
  [[ -n "$mention" ]] && mentions="{\"user_ids\":[\"$mention\"]}"
  mx "$token" POST "rooms/$room/send/m.room.message" \
    "{\"msgtype\":\"m.text\",\"body\":$(jq -Rn --arg t "$text" '$t'),\"m.mentions\":$mentions}" \
    | jq -r '.event_id'
}

mx_send_thread() { # <token> <roomId> <thread-root-event-id> <text> <mentioned-mxid>
  # gateway 会话按 thread 作用（MATRIX_AUTO_THREAD）：clarify/approve/retry 回复
  # 必须落在线程内才能到达对应会话。
  local token="$1" room="$2" root="$3" text="$4" mention="$5"
  mx "$token" POST "rooms/$room/send/m.room.message" \
    "{\"msgtype\":\"m.text\",\"body\":$(jq -Rn --arg t "$text" '$t'),\"m.mentions\":{\"user_ids\":[\"$mention\"]},\"m.relates_to\":{\"rel_type\":\"m.thread\",\"event_id\":\"$root\"}}" \
    | jq -r '.event_id'
}

mx_messages() { # <token> <roomId> <limit> → 倒序消息数组（最新在前）
  local token="$1" room="$2" limit="${3:-100}"
  curl -sf "$HS/_matrix/client/v3/rooms/$room/messages?access_token=$token&dir=b&limit=$limit" \
    | jq -c '[.chunk[] | select(.type == "m.room.message")]'
}

# 等待 agent 回复：<token> <roomId> <agent-mxid> <marker-event-id> <timeout-sec> [pattern]
# dir=b 返回最新在前；marker 在数组中的下标为 m，则下标 < m 的该 agent 消息即
# "marker 之后发出"。pattern（正则，缺省 .）用于区分进度消息与最终答复。
# 命中输出 body，超时返回 1。每 10s 轮询。
mx_wait_reply() {
  local token="$1" room="$2" agent="$3" marker="$4" timeout="${5:-600}" pattern="${6:-.}"
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    local body
    body=$(mx_messages "$token" "$room" 80 | jq -r --arg agent "$agent" --arg marker "$marker" --arg pat "$pattern" '
      (map(.event_id) | index($marker) // -1) as $m
      | (if $m < 0 then . else .[0:$m] end)
      | map(select(.sender == $agent and ((.content.body // "") | length > 0)))
      | map(select(.content.body | test($pat)))
      | if length > 0 then .[0].content.body else empty end') || true
    if [[ -n "$body" ]]; then
      echo "$body"
      return 0
    fi
    sleep 10
  done
  return 1
}

mx_room_members() { # <token> <roomId>
  local token="$1" room="$2"
  mx "$token" GET "rooms/$room/joined_members" | jq -r '.joined | keys[]'
}

# ── Studio API ────────────────────────────────────────
studio() { # <port> <method> <path> [jwt] [json-body]
  local port="$1" method="$2" path="$3" jwt="${4:-}" body="${5:-}"
  local args=(-s -X "$method" "http://127.0.0.1:$port$path" -o /tmp/sim-api.$$ -w '%{http_code}')
  [[ -n "$jwt" ]] && args+=(-H "Authorization: Bearer $jwt")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  local code
  code=$(curl "${args[@]}") || { rm -f /tmp/sim-api.$$; return 1; }
  cat /tmp/sim-api.$$; rm -f /tmp/sim-api.$$
  [[ "$code" == 2* ]] || return 1
}

studio_login() { # <user> → jwt
  local port; port=$(studio_port "$1")
  studio "$port" POST /api/auth/login "" \
    '{"username":"admin","password":"123456"}' | jq -r '.token'
}

# ── 凭据存取 ──────────────────────────────────────────
save_token() { # <name> <token>
  mkdir -p "$CREDS_DIR"; chmod 700 "$CREDS_DIR"
  printf '%s' "$2" > "$CREDS_DIR/$1.token"; chmod 600 "$CREDS_DIR/$1.token"
}
load_token() { cat "$CREDS_DIR/$1.token"; }
save_room() { mkdir -p "$CREDS_DIR"; printf '%s' "$1" > "$CREDS_DIR/room.id"; chmod 600 "$CREDS_DIR/room.id"; }
load_room() { cat "$CREDS_DIR/room.id"; }

api_server_key() { grep '^API_SERVER_KEY=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2- | tr -d '"' ; }

#!/bin/bash
# aipay-lib.sh — aipaydev 多用户 Matrix 全流程推演公共库
# 设计文档: docs/superpowers/specs/2026-09-22-aipaydev-multiuser-sim-design.md
#
# 环境假设：
#   - Synapse 容器 matrix-synapse 运行于 127.0.0.1:8008，server_name=matrix.test
#   - hermes venv: ~/.hermes/hermes-agent/venv/bin/hermes
#   - Studio 生产构建: upstream/hermes-studio/dist/server/index.js
#   - GitHub 中央仓库: issac-new/aipaydev（token 存 $CREDS_DIR/github.token）

set -euo pipefail

# /usr/bin/git 是 Xcode shim；统一前置 homebrew 路径（09-17 坑）
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ── 常量 ────────────────────────────────────────────────
SIM_ROOT="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-aipay}"
NCWK="/Volumes/nvme2230/lab/ncwk"
STUDIO_TREE="$NCWK/upstream/hermes-studio"
DIST_SERVER="$STUDIO_TREE/dist/server/index.js"
HERMES_BIN="$HOME/.hermes/hermes-agent/venv/bin/hermes"
HS="http://127.0.0.1:8008"
SERVER_NAME="matrix.test"
SYNAPSE_CONTAINER="matrix-synapse"
GH_REPO="issac-new/aipaydev"

CREDS_DIR="$SIM_ROOT/creds"
LOGS_DIR="$SIM_ROOT/logs"
PIDS_DIR="$SIM_ROOT/pids"
EVID_DIR="$SIM_ROOT/evidence"
SKILLS_SRC="$NCWK/overlay/scripts/aipay/skills"
DIRECTOR_CLONE="$SIM_ROOT/central/aipaydev"

# 编制（顺序即序号 i=1..12；admin 不起实例）
USERS=(admin bella fanfan wei mei chen hu lin xiao qi fei arch)
INSTANCED_USERS=(bella fanfan wei mei chen hu lin xiao qi fei arch) # 11 实例

user_index() {
  case "$1" in
    admin) echo 1 ;;  bella) echo 2 ;;  fanfan) echo 3 ;; wei) echo 4 ;;
    mei) echo 5 ;;    chen) echo 6 ;;   hu) echo 7 ;;     lin) echo 8 ;;
    xiao) echo 9 ;;   qi) echo 10 ;;    fei) echo 11 ;;   arch) echo 12 ;;
    *) echo "unknown user: $1" >&2; return 1 ;;
  esac
}

studio_port() { echo $(( 8700 + $(user_index "$1") )); }
gateway_port() { echo $(( 8720 + $(user_index "$1") )); }
user_root() { echo "$SIM_ROOT/users/$1"; }
hermes_root() { echo "$(user_root "$1")/.hermes"; }
profile_dir() { echo "$(hermes_root "$1")/profiles/$1"; }
webui_home() { echo "$(user_root "$1")/webui"; }
workspace()  { echo "$(user_root "$1")/workspace/aipaydev"; }
kanban_db()  { echo "$(hermes_root "$1")/kanban"; }

agent_mxid() { echo "@$1-agent:$SERVER_NAME"; }
human_mxid() { echo "@$1:$SERVER_NAME"; }
user_pass() { echo "Aipay_$1_2026"; }

# ── 日志 ────────────────────────────────────────────────
log()  { echo "[aipay $(date +%H:%M:%S)] $*"; }
fail() { echo "[aipay FAIL $(date +%H:%M:%S)] $*" >&2; exit 1; }

# ── Synapse 管理 ───────────────────────────────────────
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
    log "matrix 用户 @$u:$SERVER_NAME 已存在，跳过注册"
    return 0
  fi
  docker exec "$SYNAPSE_CONTAINER" register_new_matrix_user \
    -c /data/homeserver.yaml -a -u "$u" -p "$p" >/dev/null 2>&1 \
    || fail "注册 matrix 用户 $u 失败"
  log "已注册 matrix 用户 @$u:$SERVER_NAME"
}

# ── Matrix 客户端 API ──────────────────────────────────
mx_login() { # <localpart> <password> → access_token
  curl -sf "$HS/_matrix/client/v3/login" \
    -H 'Content-Type: application/json' \
    -d "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"$1\"},\"password\":\"$2\"}" \
    | jq -r '.access_token'
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

mx_send() { # <token> <roomId> <text> [mentioned-mxid[,mxid2...]]
  local token="$1" room="$2" text="$3" mention="${4:-}"
  local mentions='{}'
  if [[ -n "$mention" ]]; then
    mentions=$(echo "$mention" | tr ',' '\n' | jq -R . | jq -s '{user_ids:.}')
  fi
  mx "$token" POST "rooms/$room/send/m.room.message" \
    "{\"msgtype\":\"m.text\",\"body\":$(jq -Rn --arg t "$text" '$t'),\"m.mentions\":$mentions}" \
    | jq -r '.event_id'
}

mx_dm() { # <token> <target-mxid> <text> → event_id（幂等建 DM 房：以 creds/dm-<a>-<b>.id 缓存）
  local token="$1" target="$2" text="$3"
  echo "stub" >/dev/null # 实际由场景内联 createRoom 处理（DM 缓存键需双向唯一）
}

mx_messages() { # <token> <roomId> <limit> → 倒序 m.room.message 数组
  local token="$1" room="$2" limit="${3:-100}"
  curl -sf "$HS/_matrix/client/v3/rooms/$room/messages?access_token=$token&dir=b&limit=$limit" \
    | jq -c '[.chunk[] | select(.type == "m.room.message")]'
}

# 等待某 sender 在 marker 之后回复。<token> <roomId> <sender-mxid> <marker-event-id> <timeout> [pattern]
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

mx_room_members() { mx "$1" GET "rooms/$2/joined_members" | jq -r '.joined | keys[]'; }

mx_create_room() { # <token> <name> [invite-csv] → room_id
  local token="$1" name="$2" invite="${3:-}"
  local invites='[]'
  if [[ -n "$invite" ]]; then
    invites=$(echo "$invite" | tr ',' '\n' | jq -R . | jq -s .)
  fi
  mx "$token" POST createRoom "$(jq -n --arg n "$name" --argjson i "$invites" \
    '{name:$n, preset:"private_chat", invite:$i}')" | jq -r '.room_id'
}

mx_join() { mx "$1" POST "rooms/$2/join" '{}' >/dev/null 2>&1 || true; }

# ── Studio API ────────────────────────────────────────
studio() { # <port> <method> <path> [jwt] [json-body]
  local port="$1" method="$2" path="$3" jwt="${4:-}" body="${5:-}"
  local args=(-s -X "$method" "http://127.0.0.1:$port$path" -o "/tmp/aipay-api.$$" -w '%{http_code}')
  [[ -n "$jwt" ]] && args+=(-H "Authorization: Bearer $jwt")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  local code
  code=$(curl "${args[@]}") || { rm -f "/tmp/aipay-api.$$"; return 1; }
  cat "/tmp/aipay-api.$$"; rm -f "/tmp/aipay-api.$$"
  [[ "$code" == 2* ]] || return 1
}

studio_login() { # <user> → jwt（admin/123456 本地账号）
  local port; port=$(studio_port "$1")
  studio "$port" POST /api/auth/login "" \
    '{"username":"admin","password":"123456"}' | jq -r '.token'
}

# ── 凭据存取 ──────────────────────────────────────────
save_token() { mkdir -p "$CREDS_DIR"; chmod 700 "$CREDS_DIR"; printf '%s' "$2" > "$CREDS_DIR/$1.token"; chmod 600 "$CREDS_DIR/$1.token"; }
load_token() { cat "$CREDS_DIR/$1.token"; }
save_kv() { mkdir -p "$CREDS_DIR"; printf '%s' "$2" > "$CREDS_DIR/$1"; chmod 600 "$CREDS_DIR/$1"; }
load_kv() { cat "$CREDS_DIR/$1"; }

api_server_key() { grep '^API_SERVER_KEY=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2- | tr -d '"'; }

gh_token() {
  if [[ -s "$CREDS_DIR/github.token" ]]; then cat "$CREDS_DIR/github.token"; return 0; fi
  local t
  t=$(git credential fill <<EOF 2>/dev/null | grep ^password= | cut -d= -f2
protocol=https
host=github.com
EOF
)
  [[ -n "$t" ]] || fail "github token 不可用"
  save_kv github.token "$t"
  printf '%s' "$t"
}

gh_clone_url() { echo "https://x-access-token:$(gh_token)@github.com/$GH_REPO.git"; }

# 每用户 machine-manifest.json（能力清单，capability-report 技能的数据源）
write_manifest() { # <user>
  local u="$1" dir; dir="$(hermes_root "$u")"
  mkdir -p "$dir"
  case "$u" in
    fanfan)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"fanfan","machine":"fanfan-mac","roles":["产品经理"],"teams":[{"team":"产品团队","leader":"fanfan"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination","dispatch"]},
           {"id":"sys-analyst","capabilities":["requirements-analysis","architecture-design","payment-domain","clearing-domain"]}],
 "apps":[],"kanbanEndpoint":"http://127.0.0.1:8703/api/hermes/kanban"}
EOF
      ;;
    wei)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"wei","machine":"wei-mac","roles":["后端团队负责人"],"teams":[{"team":"支付后端","leader":"wei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination","triage","review"]}],
 "apps":[],"kanbanEndpoint":"http://127.0.0.1:8704/api/hermes/kanban"}
EOF
      ;;
    mei)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"mei","machine":"mei-mac","roles":["前端团队负责人"],"teams":[{"team":"小程序前端","leader":"mei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination","triage","review"]}],
 "apps":[],"kanbanEndpoint":"http://127.0.0.1:8705/api/hermes/kanban"}
EOF
      ;;
    chen)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"chen","machine":"chen-mac","roles":["研发"],"teams":[{"team":"支付后端","leader":"wei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination"]},
           {"id":"researcher","capabilities":["research","design"]},
           {"id":"csw-pay-core","capabilities":["backend","nodejs","payment-core","idempotency","state-machine"]}],
 "apps":["csw-pay-core"],"kanbanEndpoint":"http://127.0.0.1:8706/api/hermes/kanban"}
EOF
      ;;
    hu)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"hu","machine":"hu-mac","roles":["研发"],"teams":[{"team":"支付后端","leader":"wei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination"]},
           {"id":"researcher","capabilities":["research","design"]},
           {"id":"csw-channel-wechat","capabilities":["backend","nodejs","wechat-pay-v3","rsa-sign","pay-callback"]}],
 "apps":["csw-channel-wechat"],"kanbanEndpoint":"http://127.0.0.1:8707/api/hermes/kanban"}
EOF
      ;;
    lin)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"lin","machine":"lin-mac","roles":["研发"],"teams":[{"team":"支付后端","leader":"wei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination"]},
           {"id":"researcher","capabilities":["research","design"]},
           {"id":"csw-channel-alipay","capabilities":["backend","nodejs","alipay-openapi","rsa2-sign","tradePay"]}],
 "apps":["csw-channel-alipay"],"kanbanEndpoint":"http://127.0.0.1:8708/api/hermes/kanban"}
EOF
      ;;
    xiao)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"xiao","machine":"xiao-mac","roles":["研发"],"teams":[{"team":"小程序前端","leader":"mei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination"]},
           {"id":"researcher","capabilities":["research","design"]},
           {"id":"csw-cashier-mp","capabilities":["miniprogram","wechat-mp","alipay-mp","wx.requestPayment","my.tradePay"]}],
 "apps":["csw-cashier-mp"],"kanbanEndpoint":"http://127.0.0.1:8709/api/hermes/kanban"}
EOF
      ;;
    qi)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"qi","machine":"qi-mac","roles":["测试"],"teams":[{"team":"支付后端","leader":"wei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination"]},
           {"id":"tester","capabilities":["test-design","api-test","regression","whitebox-scan"]}],
 "apps":["csw-pay-core","csw-channel-wechat","csw-channel-alipay"],"kanbanEndpoint":"http://127.0.0.1:8710/api/hermes/kanban"}
EOF
      ;;
    fei)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"fei","machine":"fei-mac","roles":["测试"],"teams":[{"team":"小程序前端","leader":"mei"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination"]},
           {"id":"tester","capabilities":["test-design","mp-e2e","regression"]}],
 "apps":["csw-cashier-mp"],"kanbanEndpoint":"http://127.0.0.1:8711/api/hermes/kanban"}
EOF
      ;;
    bella)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"bella","machine":"bella-mac","roles":["BA"],"teams":[{"team":"业务分析","leader":"bella"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination","document"]}],
 "apps":[],"kanbanEndpoint":"http://127.0.0.1:8702/api/hermes/kanban"}
EOF
      ;;
    arch)
      cat > "$dir/machine-manifest.json" <<'EOF'
{"owner":"arch","machine":"arch-mac","roles":["架构治理"],"teams":[{"team":"虚拟架构小组","leader":"arch"}],
 "agents":[{"id":"orchestrator","capabilities":["coordination","architecture-review"]}],
 "apps":[],"kanbanEndpoint":"http://127.0.0.1:8712/api/hermes/kanban"}
EOF
      ;;
    *) return 0 ;;
  esac
  chmod 600 "$dir/machine-manifest.json"
}

role_of() {
  case "$1" in
    admin) echo "管理员" ;; bella) echo "BA" ;; fanfan) echo "产品经理" ;;
    wei) echo "后端团队负责人" ;; mei) echo "前端团队负责人" ;;
    chen) echo "研发·csw-pay-core" ;; hu) echo "研发·csw-channel-wechat" ;;
    lin) echo "研发·csw-channel-alipay" ;; xiao) echo "研发·csw-cashier-mp" ;;
    qi) echo "测试·后端" ;; fei) echo "测试·前端" ;; arch) echo "架构治理" ;;
    *) echo "未知" ;;
  esac
}

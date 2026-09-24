#!/bin/bash
# mx-lib.sh — 单 gateway 多路复用拓扑公共库（方案 V2.0）
#
# 拓扑：本机 1 个 hermes gateway（multiplex 全部 profile）+ 1 个 studio（多 matrix 账号）
# 用户模型：每个独立用户 = matrix 账号 + 账号下多个独立 kanban + 各 kanban 下的 agent teams
# 设计文档：docs/superpowers/specs/2026-09-24-multiplex-multiuser-feasibility-and-plan-v2.md
set -uo pipefail

MX_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERLAY_ROOT="$(cd "$MX_SCRIPT_DIR/../../.." && pwd)"
PATCH_DIR="$OVERLAY_ROOT/patches"
NCWK_ROOT="$(cd "$OVERLAY_ROOT/.." && pwd)"
SKILLS_SRC="$OVERLAY_ROOT/scripts/aipay/skills"
STUDIO_DIST="${MX_STUDIO_DIST:-$NCWK_ROOT/upstream/hermes-studio/dist}"
HERMES_BIN="${HERMES_BIN:-$HOME/.hermes/hermes-agent/venv/bin/hermes}"

# ── 拓扑常量 ────────────────────────────────────────────
SIM_ROOT="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
HERMES_ROOT="$SIM_ROOT/hermes"            # 单 hermes root（gateway 的 HERMES_HOME）
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
USERS=(admin bella fanfan wei mei chen hu lin xiao qi fei arch)
INSTANCED_USERS=(bella fanfan wei mei chen hu lin xiao qi fei arch)

# ── 日志/凭据（沿用 V1 约定）────────────────────────────
log()  { echo "[mux $(date +%H:%M:%S)] $*"; }
fail() { echo "[mux FAIL $(date +%H:%M:%S)] $*" >&2; exit 1; }
save_token() { mkdir -p "$CREDS_DIR"; chmod 700 "$CREDS_DIR"; printf '%s' "$2" > "$CREDS_DIR/$1.token"; chmod 600 "$CREDS_DIR/$1.token"; }
load_token() { cat "$CREDS_DIR/$1.token"; }
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
  *) echo "" ;;
esac; }
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
mx_send() { # <token> <roomId> <text> [mentioned-mxid[,mxid2...]] → event_id
  local token="$1" room="$2" text="$3" mention="${4:-}"
  local mentions='{}'
  if [[ -n "$mention" ]]; then
    mentions=$(echo "$mention" | tr ',' '\n' | jq -R . | jq -s '{user_ids:.}')
  fi
  mx "$token" POST "rooms/$room/send/m.room.message" \
    "{\"msgtype\":\"m.text\",\"body\":$(jq -Rn --arg t "$text" '$t'),\"m.mentions\":$mentions}" \
    | jq -r '.event_id'
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
  local invites='[]'
  [[ -n "$invite" ]] && invites=$(echo "$invite" | tr ',' '\n' | jq -R . | jq -s .)
  mx "$token" POST createRoom "$(jq -n --arg n "$name" --argjson i "$invites" \
    '{name:$n, preset:"private_chat", invite:$i}')" | jq -r '.room_id'
}
mx_join() { mx "$1" POST "rooms/$2/join" '{}' >/dev/null 2>&1 || true; }

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
studio_login() { # 本地 admin（管理面）
  studio POST /api/auth/login "" '{"username":"admin","password":"123456"}' | jq -r '.token'
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
mx_apply_agent_patches() {
  local tree="${HERMES_AGENT_TREE:-$HOME/.hermes/hermes-agent}"
  [[ -d "$tree/.git" ]] || fail "不是 git 仓库：$tree"
  for p in 390-agent-kanban-home-default-board.patch 391-agent-kanban-board-team-fence.patch; do
    local pf="$PATCH_DIR/$p"
    [[ -f "$pf" ]] || fail "缺 patch 文件：$pf"
    if git -C "$tree" apply --reverse --check "$pf" >/dev/null 2>&1; then
      log "运行时 patch 已在位：$p"; continue
    fi
    git -C "$tree" apply --check "$pf" >/dev/null 2>&1 \
      || fail "$p 与安装树（${tree}）冲突——未强行应用，人工处置后重跑"
    git -C "$tree" apply --whitespace=nowarn "$pf" || fail "$p 应用失败"
    log "运行时 patch 已部署：$p → $tree"
  done
}

# ── profile/manifest 生成 ───────────────────────────────
write_root_config() {
  mkdir -p "$HERMES_ROOT" "$LOCK_DIR" "$CREDS_DIR" "$PIDS_DIR" "$LOGS_DIR" "$EVID_DIR" "$WEBUI_HOME"
  chmod 700 "$SIM_ROOT"
  GW_PORT="$GW_PORT" python3 - "$HOME/.hermes/config.yaml" > "$HERMES_ROOT/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['gateway'] = {'multiplex_profiles': True}   # 单 gateway 多路复用（方案 §2.2 #1）
out['platforms'] = {
    'api_server': {'enabled': True, 'extra': {'host': '127.0.0.1', 'port': int(os.environ['GW_PORT'])}},
    'matrix': {'enabled': False},
    'email': {'enabled': False}, 'weixin': {'enabled': False}, 'webhook': {'enabled': False},
}
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$HERMES_ROOT/config.yaml"
  local api_key; api_key=$(api_server_key)
  echo "API_SERVER_KEY=$api_key" > "$HERMES_ROOT/.env"; chmod 600 "$HERMES_ROOT/.env"
}

write_user_profile() { # <user>：Orchestrator profile——仅账号和配置独立（方案 §2.1）
  local u="$1" PROF="$HERMES_ROOT/profiles/$u" api_key
  api_key=$(api_server_key)
  mkdir -p "$PROF"
  local defboard; defboard=$(first_board_of "$u")
  GW_PORT="$GW_PORT" DEF_BOARD="$defboard" python3 - "$HOME/.hermes/config.yaml" > "$PROF/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['kanban'] = {'default_board': os.environ['DEF_BOARD']}   # patch 390：钉本账号默认板
out['platforms'] = {
    'matrix': {'enabled': True},
    'email': {'enabled': False}, 'weixin': {'enabled': False}, 'webhook': {'enabled': False},
}
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$PROF/config.yaml"
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
MATRIX_APPROVAL_TIMEOUT_SECONDS=1800
API_SERVER_KEY=$api_key
ENVEOF
  chmod 600 "$PROF/.env"
}

write_agent_profile() { # <user> <agent-id>：研发专职 agent profile（无 matrix 凭据）
  local u="$1" a="$2" name; name=$(agent_profile "$u" "$a")
  local PROF="$HERMES_ROOT/profiles/$name" defboard
  defboard=$(boards_of "$u" | tr ' ' '\n' | grep ":$a$" | head -1 | cut -d: -f1)
  mkdir -p "$PROF"
  DEF_BOARD="$defboard" python3 - "$HOME/.hermes/config.yaml" > "$PROF/config.yaml" <<'PYEOF'
import sys, yaml, os
src = yaml.safe_load(open(sys.argv[1]))
keys = ('model', 'fallback_providers', 'custom_providers', 'model_catalog', 'toolsets', 'agent')
out = {k: src[k] for k in keys if k in src}
out['kanban'] = {'default_board': os.environ['DEF_BOARD']}
yaml.safe_dump(out, open(sys.stdout.fileno(), 'w'), allow_unicode=True, sort_keys=False)
PYEOF
  chmod 600 "$PROF/config.yaml"
}

write_user_manifest() { # <user>：账号级能力清单（capability-report 技能数据源）
  local u="$1" PROF="$HERMES_ROOT/profiles/$u" defboard agents_json boards_json a b alist
  defboard=$(first_board_of "$u")
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
  "kanbanEndpoint": "$(studio_url)/api/hermes/kanban?board=$defboard"
}
MANEOF
  chmod 600 "$PROF/machine-manifest.json"
}

write_fleet_manifest() { # 全局事实源：users → matrix 账号 / boards / teams
  local out="$SIM_ROOT/fleet-manifest.json" u b first=1
  {
    echo '{'
    echo "  \"topology\": \"single-gateway-multiplex\","
    echo "  \"hermesRoot\": \"$HERMES_ROOT\","
    echo "  \"gatewayPort\": $GW_PORT,"
    echo "  \"studioPort\": $STUDIO_PORT,"
    echo '  "users": ['
    for u in "${INSTANCED_USERS[@]}"; do
      [[ $first == 1 ]] || echo '    ,'
      first=0
      echo '    {'
      echo "      \"user\": \"$u\","
      echo "      \"humanMxid\": \"$(human_mxid "$u")\","
      echo "      \"agentMxid\": \"$(agent_mxid "$u")\","
      echo "      \"profile\": \"$u\","
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

install_skills() { # <profile-dir>：全 profile 同构技能副本（"其他内容完全一样"）
  local PROF="$1" s
  for s in capability-report requirements-analyst pm-planning aipaydev-dev inbox-dedup defect-loop; do
    [[ -d "$SKILLS_SRC/$s" ]] || continue
    rm -rf "$PROF/skills/$s"
    mkdir -p "$PROF/skills/$s"
    cp "$SKILLS_SRC/$s/SKILL.md" "$PROF/skills/$s/SKILL.md"
  done
}

# ═══════════════════════════════════════════════════════════
# 以下为 P1 场景迁移自 aipay-lib.sh 并入的常量/工具（V2 路径适配）
# ═══════════════════════════════════════════════════════════

# ── 推演轮次隔离（state/evidence 按 RUN_ID 分家，语义同 V1）────
RUN_ID="${RUN_ID:-}"
if [[ -n "$RUN_ID" ]]; then
  RUN_DIR="$SIM_ROOT/runs/$RUN_ID"
  mkdir -p "$RUN_DIR/evidence"
else
  RUN_DIR="$SIM_ROOT"
fi
STATE="$RUN_DIR/state.env"
EVID_DIR="${MX_EVID_DIR:-$RUN_DIR/evidence}"
NCWK="$NCWK_ROOT"
DIRECTOR_CLONE="$SIM_ROOT/central/aipaydev"
GH_REPO="issac-new/aipaydev"

# ── 需求标识（推演轮次参数化，同 V1）────────────────────────
RFD_ID="${RFD_ID:-RFD-001}"
RFD_SLUG="${RFD_SLUG:-payment-cashier}"
RFD_DOC="docs/requirements/${RFD_ID}-${RFD_SLUG}.md"
RFD_MATERIAL="${RFD_MATERIAL:-$OVERLAY_ROOT/scripts/aipay/materials/${RFD_ID}-${RFD_SLUG}.md}"
if [[ -z "${RFD_ONELINE:-}" ]]; then
  case "$RFD_ID" in
    RFD-002) RFD_ONELINE="在已上线的收单商户小程序收银台之上，增加退款（整单/多次部分、原路退回）与分账（多接收方、比例/时窗/冻结解冻）两项资金能力，双端一致且不产生资损" ;;
    *)       RFD_ONELINE="为收单商户开发兼容微信/支付宝双端的小程序支付收银台，含统一下单、渠道适配（财付通/支付宝）、支付结果通知与对账字段支撑" ;;
  esac
fi

# 账号工作区（V2：中央仓每账号一棵工作树；kanban dispatcher worker 另用每板 workspaces）
workspace() { echo "$SIM_ROOT/workspaces/$1/aipaydev"; }

# ── 模型额度预检（V2：profile 配置全同构，路径适配 profiles/<u>）──
# 返回：ok | quota | auth | unreachable | noreply
model_preflight() { # <user>
  local u="$1" cfg="${HERMES_AGENT_VENV:-$HOME/.hermes/hermes-agent/venv/bin/python}"
  local conf; conf="$HERMES_ROOT/profiles/$u/config.yaml"
  [[ -f "$conf" ]] || { echo "unreachable"; return 0; }
  [[ -x "$cfg" ]] || cfg=$(command -v python3 || true)
  [[ -n "$cfg" ]] || { echo "unreachable"; return 0; }
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
if not url or not name:
    print("unreachable"); raise SystemExit
url = url[:-3].rstrip("/") if url.endswith("/v1") else url
body = json.dumps({"model": name, "max_tokens": 4,
                   "messages": [{"role": "user", "content": "Reply with exactly: OK"}]}).encode()
req = urllib.request.Request(url + "/v1/chat/completions", data=body,
                             headers={"Content-Type": "application/json",
                                      **({"Authorization": "Bearer " + key} if key else {})})
try:
    with urllib.request.urlopen(req, timeout=45) as r:
        r.read()
    print("ok")
except urllib.error.HTTPError as e:
    text = (e.read() or b"").decode("utf8", "replace").lower()
    if e.status in (401, 403):
        print("quota" if ("limit" in text or "quota" in text) else "auth")
    elif e.status == 429:
        print("quota")
    else:
        print("noreply")
except Exception:
    print("unreachable")
PY
}

model_preflight_report() { # 检查全部实例，额度/鉴权异常即 fail
  local bad=() u st
  for u in "${INSTANCED_USERS[@]}"; do
    st=$(model_preflight "$u")
    [[ "$st" == "ok" ]] || bad+=("$u:$st")
  done
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
  save_token github.token "$t"
  printf '%s' "$t"
}

gh_clone_url() { echo "https://x-access-token:$(gh_token)@github.com/$GH_REPO.git"; }

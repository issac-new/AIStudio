#!/bin/bash
# aipay-up.sh — 拉起 11 个 SwarmStudio 实例（生产构建），gateway 由 Studio autostart 拉起
# 用法: bash aipay-up.sh [user ...]   # 缺省全部 11 实例；冒烟可只传 fanfan
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

[[ -f "$DIST_SERVER" ]] || fail "缺少构建产物 ${DIST_SERVER}（先 cd overlay && npm run build:full）"

if (( $# == 0 )); then START=("${INSTANCED_USERS[@]}"); else START=("$@"); fi
API_KEY=$(api_server_key)

# host 守卫门闸（host-gateway-ownership 收口）：推演多 profile 与宿主 orchestrator
# 共处一机时，禁止静默抢占宿主 gateway。显式策略三档，缺省 isolated：
#   isolated    宿主 orchestrator gateway 在线即 fail-fast（不推演、不抢占），
#               指引错峰或显式降档——推演宁可不开局，也不挤掉真实环境。
#   allow-force 运维者显式接受抢占语义（host 守卫 --force 路径），只在明确知道
#               宿主 gateway 可被挤下线时使用。
#   skip        不做检查（调试用；恢复 patch 373 之前的裸奔行为，不推荐）。
AIPAY_GATEWAY_HOST_POLICY="${AIPAY_GATEWAY_HOST_POLICY:-isolated}"
host_gateway_online() { # 宿主 orchestrator gateway（主环境 ~/.hermes 默认 8650）是否在线
  curl -sf --max-time 2 "http://127.0.0.1:8650/health" >/dev/null 2>&1
}
case "$AIPAY_GATEWAY_HOST_POLICY" in
  isolated)
    # 09-23 实测订正：上游 host 守卫是**全机级**，但锁目录可用 HERMES_GATEWAY_LOCK_DIR 按
    # profile 隔开（host_rendezvous.py:13）。单实例验证过：sim gateway :8723 健康、宿主
    # :8650 的 pid 与健康全程未变。故"宿主在线"本身不再构成开局的阻塞条件——真正的隔离
    # 是每 profile 独立锁目录，up_gateway 已按此构造。这里改为校验隔离到位。
    for u in "${START[@]}"; do
      d="$(hermes_root "$u")/gateway-locks"
      mkdir -p "$d" 2>/dev/null || fail "$u 锁目录不可写：$d"
    done
    host_gateway_online && log "host 守卫门闸：宿主 orchestrator(:8650) 在线——各 profile 用独立锁目录并存，不抢占、不替换（如需零重叠设 require-host-off）" \
                         || log "host 守卫门闸：宿主 gateway 离线，直接放行"
    ;;
  require-host-off)
    # 原 isolated 语义（保守档）：宿主在线即不开局，彻底避免任何同机双 gateway。
    if host_gateway_online; then
      fail "宿主 orchestrator gateway(:8650) 在线。要并存请回到缺省 policy=isolated（已实测不抢占）；要错峰推演请停宿主后再跑。"
    fi
    log "host 守卫门闸：require-host-off——宿主 gateway 必须离线才开局"
    ;;
  allow-force)
    log "host 守卫门闸：policy=allow-force 已并入 isolated（--force 只是同机再起，不杀宿主；杀宿主的是 --replace，本脚本永不使用）"
    ;;
  skip)
    log "host 守卫门闸：policy=skip——跳过检查（不推荐）"
    ;;
  *) fail "AIPAY_GATEWAY_HOST_POLICY 取值非法: $AIPAY_GATEWAY_HOST_POLICY（可选 isolated/require-host-off/allow-force/skip）" ;;
esac

up_one() {
  local u="$1" port gw_port
  port=$(studio_port "$u"); gw_port=$(gateway_port "$u")
  local pidfile="$PIDS_DIR/$u-server.pid"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "$u studio 已在运行 (pid $(cat "$pidfile"))"
    return 0
  fi
  # 接管孤儿实例：上一轮若非经本脚本重启，pid 文件会丢而端口仍在服务。此时再起一个
  # 必然 EADDRINUSE，且 wait_http 探到的是旧进程——看似成功，实则留下双进程与死 pid 文件。
  local orphan
  orphan=$(lsof -tnP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  if [[ -n "$orphan" ]] && curl -sf --max-time 5 "http://127.0.0.1:$port/health/ready" >/dev/null 2>&1; then
    echo "$orphan" > "$pidfile"
    log "$u studio 接管孤儿进程 pid $orphan (:$port)"
    return 0
  fi

  log "$u 启动 studio 后端 :$port (gateway api_server :$gw_port)"
  (
    cd "$STUDIO_TREE"
    mkdir -p "$(webui_home "$u")"
    exec env \
      PORT="$port" \
      NODE_ENV=production \
      HERMES_BIN="$HERMES_BIN" \
      HERMES_HOME="$(hermes_root "$u")" \
      HERMES_WEB_UI_HOME="$(webui_home "$u")" \
      HERMES_WEBUI_STATE_DIR="$(webui_home "$u")" \
      HERMES_GATEWAY_LOCK_DIR="$(hermes_root "$u")/gateway-locks" \
      HERMES_AGENT_HEALTH_URL="http://127.0.0.1:$gw_port" \
      GATEWAY_PORT="$gw_port" \
      API_SERVER_KEY="$API_KEY" \
      node "$DIST_SERVER" >> "$LOGS_DIR/$u-server.log" 2>&1
  ) &
  echo $! > "$pidfile"
}

up_gateway() { # <user> — gateway 必须由推演自己拉起：studio 只做 agent-health 代理，实测不 autostart
  # 上游 v0.21.4 的 host 守卫是**全机级**（一机一 gateway 服务所有 profile），故这里两件事缺一不可：
  #   HERMES_GATEWAY_LOCK_DIR  → 每 profile 独立 rendezvous/锁目录，不与宿主 orchestrator 争用记录
  #                        --force → 声明"我知道在同机再起一个 gateway"（只 warn，不杀宿主；杀宿主的是 --replace）
  # 实锤记录见 docs/superpowers/specs/2026-09-22-aipaydev-fullchain-sim-report.md §五-e。
  local u="$1" gw_port pidfile root
  gw_port=$(gateway_port "$u"); pidfile="$PIDS_DIR/$u-gateway.pid"; root=$(hermes_root "$u")
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "$u gateway 已在运行 (pid $(cat "$pidfile"))"; return 0
  fi
  local orphan
  orphan=$(lsof -tnP -iTCP:"$gw_port" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  if [[ -n "$orphan" ]] && curl -sf --max-time 5 "http://127.0.0.1:$gw_port/health" >/dev/null 2>&1; then
    echo "$orphan" > "$pidfile"
    log "$u gateway 接管孤儿进程 pid $orphan (:$gw_port)"; return 0
  fi
  log "$u 启动 gateway :$gw_port（独立锁目录 + --force）"
  (
    exec env HERMES_HOME="$root" HERMES_GATEWAY_LOCK_DIR="$root/gateway-locks" \
      "$HERMES_BIN" -p "$u" gateway run --force \
      >> "$LOGS_DIR/$u-gateway.log" 2>&1
  ) &
  echo $! > "$pidfile"
}

wait_http() { # <url> <name> <timeout-sec>
  local deadline=$(( $(date +%s) + $3 ))
  while (( $(date +%s) < deadline )); do
    curl -sf -o /dev/null "$1" && { log "$2 就绪: $1"; return 0; }
    sleep 3
  done
  fail "$2 在 $3s 内未就绪: $1（查 ${LOGS_DIR}）"
}

for u in "${START[@]}"; do up_one "$u"; sleep 2; done  # 错峰拉起，避免 cc-switch/CPU 风暴

for u in "${START[@]}"; do
  wait_http "http://127.0.0.1:$(studio_port "$u")/health/ready" "$u studio" 180
done
# gateway 由本脚本显式拉起（studio 只做健康代理，实测不 autostart）
for u in "${START[@]}"; do up_gateway "$u"; sleep 2; done
for u in "${START[@]}"; do
  wait_http "http://127.0.0.1:$(gateway_port "$u")/health" "$u gateway" 300
done

log "全部就绪。浏览器入口:"
for u in "${START[@]}"; do
  log "  $u → http://127.0.0.1:$(studio_port "$u") （matrix 用户 $(human_mxid "$u")）"
done

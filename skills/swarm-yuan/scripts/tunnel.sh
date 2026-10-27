#!/usr/bin/env bash
# tunnel.sh — 堡垒机 SSH 隧道编排（ProxyJump 标准协议，运维排障底座件）
# 场景：AI 修存量项目 bug 时连研发环境——数据库端口、JDWP 调试端口、日志机端口
#   都不直接可达，须经堡垒机（跳板机）转发到本机 127.0.0.1。本脚本统一编排：
#   up（建）/ down（拆）/ status（看）/ doctor（体检，供 env-setup.sh 资源检测调）/ print（审计打印命令）。
# 为什么不用 Xshell 图形客户端：AI 无法可靠驱动 GUI；Xshell 隧道本质是标准 SSH 端口转发，
#   人用 Xshell 建好的隧道本脚本 status/doctor 同样能体检（只看本地端口通不通）。
# 配置：scripts/tunnel.conf（用户可填充模板，含（填入）占位；未配置时 fail-closed 退出 1）。
#   JUMP_HOST        堡垒机，如 user@bastion.corp -p 2222
#   TUNNELS          逗号分隔 label:本地端口:目标主机:目标端口，如 db:15432:db-internal:5432,jdwp:15005:app-internal:5005
# 用法:
#   bash tunnel.sh up [--dry-run]        建全部隧道（--dry-run 只打印命令不执行）
#   bash tunnel.sh down [--dry-run]      拆全部隧道（只杀本脚本 -J/-L 特征精确匹配的 ssh 进程）
#   bash tunnel.sh status                逐条报本地端口/进程状态
#   bash tunnel.sh doctor                status + 配置体检；异常 exit 1（供 env-setup.sh 调用）
#   bash tunnel.sh print                 打印将执行的 ssh 命令（审计面，永不执行）
#   可选: --conf <path> 指定配置文件（默认脚本同目录 tunnel.conf）
# 安全约定:
#   - 本地绑定恒为 127.0.0.1（不暴露局域网）；JDWP 无认证，见 references/remote-debug-jvm.md 安全边界。
#   - down 用 pkill -f 匹配「-J <JUMP_HOST> 且 -L <bind>:<port>:<dest>」双特征，不误伤无关 ssh。
#   - 隧道本身不鉴权目标操作——数据库/SSH 的只读约束由凭证层账号权限 + ops-readonly-guard.sh 承载。
# 三平台兼容：bash 3.2 / 无 declare -A / POSIX 字符类 / nc -z 探活（macOS/Linux 通用形态，无 nc 时退化为 bash /dev/tcp）。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_PATH="${SCRIPT_DIR}/tunnel.conf"
CMD=""; DRY_RUN=0

_log() { printf '%s\n' "$*" >&2; }
die() { _log "✗ $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    up|down|status|doctor|print) CMD="$1" ;;
    --dry-run) DRY_RUN=1 ;;
    --conf) CONF_PATH="$2"; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "未知参数：$1（用法见 --help）" ;;
  esac
  shift
done
[[ -n "$CMD" ]] || die "缺子命令（up|down|status|doctor|print）"

# ---- 加载配置（fail-closed：缺失/占位/字段不全即拒） ----
[[ -f "$CONF_PATH" ]] || die "配置不存在：${CONF_PATH}（从模板 scripts/tunnel.conf 复制并填入堡垒机信息）"
# shellcheck disable=SC1090
source "$CONF_PATH"
grep -q "（填入" "$CONF_PATH" && die "tunnel.conf 仍是占位模板（含（填入）标记）——先填 JUMP_HOST/TUNNELS 再用"
[[ -n "${JUMP_HOST:-}" ]] || die "JUMP_HOST 未配置"
[[ -n "${TUNNELS:-}" ]] || die "TUNNELS 未配置"
# 安全边界：本地绑定恒为回环——非回环地址会把 DB/JDWP 端口暴露到局域网。
# 需要非回环绑定为 UserChallenge 级例外，须改本守卫并留决策痕，不接受 conf 值。
BIND="127.0.0.1"
if [[ -n "${LOCAL_BIND:-}" && "$LOCAL_BIND" != "127.0.0.1" && "$LOCAL_BIND" != "localhost" ]]; then
  die "LOCAL_BIND=${LOCAL_BIND} 被拒绝：隧道本地绑定只允许回环地址（127.0.0.1/localhost）"
fi
SSH_BIN="${SSH_BIN:-ssh}"
SSH_OPTS="${SSH_OPTS:--o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3}"

# ---- 解析 TUNNELS → 平行数组（bash 3.2 无关联数组） ----
T_LABEL=(); T_LPORT=(); T_HOST=(); T_PORT=()
parse_tunnels() {
  local list="${TUNNELS}" entry
  local IFS=','
  for entry in $list; do
    [[ -z "$entry" ]] && continue
    local f1="" f2="" f3="" f4="" rest="$entry"
    f1="${rest%%:*}"; rest="${rest#*:}"
    f2="${rest%%:*}"; rest="${rest#*:}"
    f3="${rest%%:*}"; rest="${rest#*:}"
    f4="$rest"
    if [[ -z "$f1" || -z "$f2" || -z "$f3" || -z "$f4" ]] || \
       ! printf '%s' "$f2$f4" | grep -qE '^[0-9]+$'; then
      die "TUNNELS 条目「${entry}」格式错误（须 label:本地端口:目标主机:目标端口 四段且端口为数字）"
    fi
    T_LABEL+=("$f1"); T_LPORT+=("$f2"); T_HOST+=("$f3"); T_PORT+=("$f4")
  done
  [[ ${#T_LABEL[@]} -gt 0 ]] || die "TUNNELS 无有效条目"
}
ssh_cmd() { printf '%s -f -N -J %s -L %s:%s:%s:%s %s' "$SSH_BIN" "$JUMP_HOST" "$1" "$2" "$3" "$4" "$SSH_OPTS"; }

# 端口探活：优先 nc -z，无 nc 退化为 bash /dev/tcp（超时 2 秒）
port_open() {
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 2 "$BIND" "$port" >/dev/null 2>&1 && return 0
    return 1
  fi
  (exec 3<>"/dev/tcp/${BIND}/${port}") 2>/dev/null && { exec 3>&- 3<&-; return 0; }
  return 1
}
# 进程匹配：-f -N -J 跳板 + -L 转发完整前缀特征（down/status 用；空输出=无进程）。
# 特征序必须与 ssh_cmd 的实际参数序一致（-f -N 在 -J/-L 之前）——旧模式要求 -N 出现在
# -L 段之后而 ssh_cmd 把 -N 放最前，down/status 永远匹配不到自己起的隧道进程，
# down 假成功、ssh 进程泄漏（R139 实抓；test-ops-readonly-guard.sh 闭环锁）。
tunnel_pids() {
  local label="$1" lport="$2" dhost="$3" dport="$4"
  pgrep -f -- "-f -N -J ${JUMP_HOST}.*-L ${BIND}:${lport}:${dhost}:${dport}" 2>/dev/null || true
}

parse_tunnels

case "$CMD" in
  print)
    printf '# 隧道命令审计（永不执行）：\n'
    for i in "${!T_LABEL[@]}"; do
      printf '# %s → %s:%s:%s:%s\n%s\n' "${T_LABEL[$i]}" "$BIND" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}" "$(ssh_cmd "$BIND" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}")"
    done
    exit 0 ;;
  up)
    FAIL=0
    for i in "${!T_LABEL[@]}"; do
      c="$(ssh_cmd "$BIND" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}")"
      if port_open "${T_LPORT[$i]}"; then
        printf '  = %s：本地 %s:%s 已在监听（视为已建，不重复起）\n' "${T_LABEL[$i]}" "$BIND" "${T_LPORT[$i]}"
        continue
      fi
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  [dry-run] %s：%s\n' "${T_LABEL[$i]}" "$c"
        continue
      fi
      if $c >/dev/null 2>&1; then
        printf '  ✓ %s：本地 %s:%s → %s:%s\n' "${T_LABEL[$i]}" "$BIND" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}"
      else
        printf '  ✗ %s：ssh 失败（查堡垒机可达性/账号/目标主机名）\n' "${T_LABEL[$i]}"
        FAIL=1
      fi
    done
    [[ $FAIL -eq 0 ]] || exit 1
    exit 0 ;;
  down)
    for i in "${!T_LABEL[@]}"; do
      pids="$(tunnel_pids "${T_LABEL[$i]}" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}")"
      if [[ -z "$pids" ]]; then
        printf '  = %s：无本脚本特征的隧道进程\n' "${T_LABEL[$i]}"
        continue
      fi
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  [dry-run] %s：将结束 pid %s\n' "${T_LABEL[$i]}" "$(printf '%s' "$pids" | tr '\n' ' ')"
        continue
      fi
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null
      printf '  ✓ %s：已结束 pid %s\n' "${T_LABEL[$i]}" "$(printf '%s' "$pids" | tr '\n' ' ')"
    done
    exit 0 ;;
  status)
    for i in "${!T_LABEL[@]}"; do
      pids="$(tunnel_pids "${T_LABEL[$i]}" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}")"
      if port_open "${T_LPORT[$i]}"; then st="端口通"; else st="端口不通"; fi
      if [[ -n "$pids" ]]; then pr="进程在(pid $(printf '%s' "$pids" | tr '\n' ','))"; else pr="无本脚本进程"; fi
      printf '  %s：本地 %s:%s → %s:%s [%s / %s]\n' "${T_LABEL[$i]}" "$BIND" "${T_LPORT[$i]}" "${T_HOST[$i]}" "${T_PORT[$i]}" "$st" "$pr"
    done
    exit 0 ;;
  doctor)
    # 体检 = status + 账（每条隧道要么端口通，要么明确报不通并给原因方向）
    FAIL=0
    for i in "${!T_LABEL[@]}"; do
      if port_open "${T_LPORT[$i]}"; then
        printf '  ✓ %s（%s:%s 通）\n' "${T_LABEL[$i]}" "$BIND" "${T_LPORT[$i]}"
      else
        printf '  ✗ %s（%s:%s 不通——先 bash tunnel.sh up；仍不通查堡垒机账号/目标主机名/端口）\n' "${T_LABEL[$i]}" "$BIND" "${T_LPORT[$i]}"
        FAIL=1
      fi
    done
    [[ $FAIL -eq 0 ]] || exit 1
    exit 0 ;;
esac

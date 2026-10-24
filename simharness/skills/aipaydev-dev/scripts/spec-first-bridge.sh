#!/usr/bin/env bash
# spec-first-bridge.sh — 五宿主 L1 写时拦截桥（R103，spec-first 四层模型的 L1 多宿主面）
#
# 职责：把各宿主的 PreToolUse hook 调用归一为 Claude 形态 payload，喂给判定单一事实源
# fail-gate-hook.sh（spec-first-lib 判据），再把 deny 翻译成各宿主通用的阻断协议。
#
# 阻断协议（五宿主统一，官方文档锚定）：exit 2 + stderr 原因——
#   Cursor「Exit code 2 - Block the action」/Gemini「exit code 2 Critical Block（stderr 为原因）」/
#   Devin「exit code 2 阻断」/kimi-code「exit 2 Intentional block（stderr 为原因）」；
#   OpenCode 由 .opencode/plugins/ 插件捕获本脚本退出码后 throw（tool.execute.before 抛错即中止）。
# 放行：exit 0，stdout 静默（fail-open——解析失败/缺库/缺 conf 一律放行，与 fail-gate-hook 同失败哲学）。
#
# 用法：
#   echo '<host payload JSON>' | bash spec-first-bridge.sh --host <cursor|gemini|devin|kimi|opencode>
#   bash spec-first-bridge.sh --tool <name> --path <file> --cmd <command>   # 显式参数（OpenCode 插件用）
# 归一化（宽松键提取，防各宿主字段漂移）：tool 取 tool_name/toolName/tool/name；
#   入参取 tool_input/toolInput/input/args/params 下的 command 与 file_path/filePath/path/fileName。
#   工具名映射（→ 判定库 canonical）：cursor Shell→Bash；gemini run_shell_command→Bash、
#   write_file→Write、replace→Edit；devin exec→Bash、write→Write、edit→Edit；kimi 原生；
#   opencode bash→Bash、write→Write、edit→Edit。未识别工具名原样透传（fail-gate-hook 自行判定）。
set -uo pipefail

HOST=""
T_TOOL=""
T_PATH=""
T_CMD=""
T_CWD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --tool) T_TOOL="${2:?}"; shift 2 ;;
    --path) T_PATH="${2:-}"; shift 2 ;;
    --cmd)  T_CMD="${2:-}"; shift 2 ;;
    --cwd)  T_CWD="${2:-}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

_self="$(cd "$(dirname "$0")" && pwd)"
HOOK=""
for _cand in "${_self}/fail-gate-hook.sh" "${_self}/../hooks/fail-gate-hook.sh"; do
  [[ -f "$_cand" ]] && { HOOK="$_cand"; break; }
done
[[ -z "$HOOK" ]] && exit 0   # 判定面不可用=放行（成套分发由 test-r103 锁配对）

# ===== 归一化 =====
NORM_TOOL=""
NORM_PATH=""
NORM_CMD=""
if [[ -n "$T_TOOL" ]]; then
  NORM_TOOL="$T_TOOL"; NORM_PATH="$T_PATH"; NORM_CMD="$T_CMD"; NORM_CWD="$T_CWD"
else
  PAYLOAD="$(cat 2>/dev/null || true)"
  [[ -z "$PAYLOAD" ]] && exit 0
  if command -v python3 >/dev/null 2>&1; then
    _NORM=$(printf '%s' "$PAYLOAD" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    for _ in range(3): print("")
    raise SystemExit(0)
def pick(o, keys):
    if not isinstance(o, dict): return ""
    for k in keys:
        v = o.get(k)
        if isinstance(v, str) and v: return v
    return ""
tool = pick(d, ("tool_name", "toolName", "tool", "name"))
ti = {}
for k in ("tool_input", "toolInput", "tool_args", "toolArgs", "input", "args", "params", "parameters"):
    if isinstance(d.get(k), dict):
        ti = d[k]; break
if not ti:
    ti = d  # 顶层平铺变体兜底
cmd = pick(ti, ("command", "cmd"))
path = pick(ti, ("file_path", "filePath", "path", "fileName"))
cwd = pick(d, ("cwd",))
print(tool); print(path); print(cmd); print(cwd)
' 2>/dev/null) || _NORM=""
    _lines=()
    while IFS= read -r _ln; do _lines+=("$_ln"); done <<< "$_NORM"
    NORM_TOOL="${_lines[0]:-}"
    NORM_PATH="${_lines[1]:-}"
    NORM_CMD="${_lines[2]:-}"
    NORM_CWD="${_lines[3]:-}"
  else
    exit 0  # 无 python3 无法归一=放行（披露哲学一致）
  fi
fi

# 工具名映射（全局统一表——五宿主工具名无冲突；bash 3.2 case 链；未命中原样透传）
# cursor Shell｜gemini run_shell_command｜devin exec｜opencode bash｜kimi Bash → Bash
# gemini write_file｜devin/opencode write → Write；gemini replace｜devin/opencode edit → Edit
case "$NORM_TOOL" in
  bash|Bash|exec|shell|Shell|run_shell_command) NORM_TOOL="Bash" ;;
  write|Write|write_file)                        NORM_TOOL="Write" ;;
  edit|Edit|replace|MultiEdit|multi_edit)        NORM_TOOL="Edit" ;;
esac

# ===== 构造 Claude 形态 payload 调判定链 =====
_e_tool=$(printf '%s' "$NORM_TOOL" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
_e_path=$(printf '%s' "$NORM_PATH" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
_e_cmd=$(printf '%s' "$NORM_CMD" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
_e_cwd=$(printf '%s' "${NORM_CWD:-$(pwd)}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
CANON="{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"${_e_tool}\",\"tool_input\":{\"command\":\"${_e_cmd}\",\"file_path\":\"${_e_path}\"},\"cwd\":\"${_e_cwd}\"}"

OUT="$(printf '%s' "$CANON" | bash "$HOOK" 2>/dev/null || true)"

# ===== 协议翻译：deny → exit 2 + stderr 原因（五宿主统一）=====
if printf '%s' "$OUT" | grep -q '"permissionDecision":"deny"'; then
  REASON=$(printf '%s' "$OUT" | sed -n 's/.*"permissionDecisionReason":"\([^"]*\)".*/\1/p' | head -1)
  [[ -z "$REASON" ]] && REASON="swarm-yuan spec-first: DENY（无 spec 写源码）"
  printf '%s\n' "$REASON" >&2
  exit 2
fi
exit 0

#!/usr/bin/env bash
# integrity-guard.sh — PreToolUse 防作弊门（权责分离的机械兜底）
#
# 来源：tanweai/pua integrity-guard.sh 的设计。swarm-yuan 受保护资产清单：
#   - 不用 pua 的 tests/scoring/CI/memory/secrets 通用清单，用 swarm-yuan 自己的
#     治理资产（facts.conf 数字单源 / framework-gates 注入区 / verifier/v1 司法层 /
#     gate-enforce-level.conf 禁手改 / self-precheck.conf 自举门禁）
#   - deny 场景：AI 试图改注入区让某框架门禁通过 / 改 facts.conf 让数字漂移消失 /
#     改 verifier 让断言放松 / 读 hidden_solution
#   - advisory 场景：改 precheck.conf（允许，但提醒「改完须重跑 self-check」）
#   - bash 3.2 兼容，python3 优先解析 JSON，无 python3 降级 grep+sed
#
# 设计理念：swarm-yuan 有「禁手改注入区」的注释约束（# >>> swarm-yuan:framework-gates >>>），
# 但无机械门拦截。AI 可能为了过门禁去改门禁本身。本 hook 是 prompt 层 policy-guardian(E3) 的
# 机械兜底——prompt 层先审，hook 层兜底，两层防御。
#
# 用法（由 hooks.json 的 PreToolUse matcher 自动调用）：
#   stdin = Claude Code PreToolUse hook payload（JSON）
#   stdout = hookSpecificOutput（permissionDecision: deny/advisory + additionalContext）
#   exit 0 = 不阻塞主流程（deny 通过 permissionDecision 字段传达，非 exit code）

set -uo pipefail

# ===== 读取 hook 输入 =====
HOOK_INPUT=$(cat 2>/dev/null || printf '')
[[ -z "$HOOK_INPUT" ]] && exit 0

# 一次性 python3 解析（无 python3 降级 grep+sed，仅顶层字段可靠）
if command -v python3 >/dev/null 2>&1; then
  _PARSED=$(printf '%s' "$HOOK_INPUT" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get("tool_name", ""))
    ti = d.get("tool_input", {})
    if not isinstance(ti, dict):
        ti = {}
    # 把 tool_input 序列化为单行 JSON 供 bash 后处理
    print(json.dumps(ti, ensure_ascii=False))
    # transcript_path 用于检测 PUA 是否激活（swarm-yuan 复用：检测 trace.jsonl 是否有决策记录）
    print(d.get("transcript_path", ""))
except Exception:
    print("")
    print("{}")
    print("")
' 2>/dev/null)
  _lines=()
  while IFS= read -r _ln; do _lines+=("$_ln"); done <<< "$_PARSED"
  TOOL_NAME="${_lines[0]:-}"
  # 注意：不能用 ${_lines[1]:-{}} —— {} 会触发 bash brace expansion 导致末尾多 }
  if [[ -z "${_lines[1]:-}" ]]; then
    TOOL_INPUT_JSON="{}"
  else
    TOOL_INPUT_JSON="${_lines[1]}"
  fi
  TRANSCRIPT_PATH="${_lines[2]:-}"
else
  # 降级：grep+sed 提取 tool_name（tool_input 解析不可靠，降级时只做 Bash 命令扫描）
  TOOL_NAME=$(printf '%s' "$HOOK_INPUT" | grep -o '"tool_name":"[^"]*"' 2>/dev/null | head -1 | sed 's/"tool_name":"//;s/"$//' || printf '')
  TOOL_INPUT_JSON="{}"
  TRANSCRIPT_PATH=""
fi

[[ -z "$TOOL_NAME" ]] && exit 0

# ===== swarm-yuan 受保护资产清单 =====
# deny 场景：机器维护区/司法层/数字单源——改了就是作弊
# advisory 场景：门禁配置/决策轨迹——允许改但提醒重跑
PROTECTED_DENY_PATTERNS='
framework-gates/.*\.sh
gate-enforce-level\.conf
verifier/v1/
self-precheck\.conf
rules\.d/.*\.rules
gate-rules\.sh
hidden_solution|gold_patch|golden_patch|benchmark_answer|answer_key|official_solution
'
# rules.d/*.rules 与 gate-rules.sh（规则自身）入 deny（audit-2026-08-25，DESIGN §5.2"规则自身不被 AI 篡改"）：
# AI 改规则数据=治理绕过。合法通道不破——--persist 审批沉淀是 `bash scripts/gate-rules.sh ...`
# 纯脚本调用，不含 MUTATING_RE 变更原语，不会触发 Bash 面 deny；直写（>>/sed -i/rm）才拦。

PROTECTED_ADVISORY_PATTERNS='
precheck\.conf
precheck\.arch\.conf
precheck\.compliance\.conf
facts\.conf
decisions\.jsonl
trace\.jsonl
state\.yaml
'

# ===== 从 tool_input 提取路径 =====
_extract_paths() {
  local json="$1"
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c '
import sys, json
try:
    ti = json.load(sys.stdin)
except Exception:
    sys.exit(0)
def collect(obj):
    paths = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("file_path", "path", "notebook_path", "pattern", "glob", "command") and isinstance(v, str):
                paths.append(v)
            else:
                paths.extend(collect(v))
    elif isinstance(obj, list):
        for item in obj:
            paths.extend(collect(item))
    return paths
for p in collect(ti):
    print(p)
' 2>/dev/null
  else
    # 降级：grep "file_path":"..." 等
    printf '%s' "$json" | grep -oE '"(file_path|path|notebook_path|pattern|glob|command)":"[^"]*"' 2>/dev/null | sed 's/.*":"//;s/"$//' || true
  fi
}

# ===== 检查路径是否命中受保护模式 =====
# 返回: "deny|<reason>|<path>" 或 "advisory|<reason>|<path>" 或空
_check_path() {
  local path="$1"
  local norm
  norm=$(printf '%s' "$path" | tr '\\' '/')
  # deny 模式
  while IFS= read -r pat; do
    [[ -z "$pat" ]] && continue
    if echo "$norm" | grep -qE "$pat" 2>/dev/null; then
      echo "deny|受保护治理资产（机器维护区/司法层/数字单源，禁手改）|$norm"
      return
    fi
  done <<< "$PROTECTED_DENY_PATTERNS"
  # advisory 模式
  while IFS= read -r pat; do
    [[ -z "$pat" ]] && continue
    if echo "$norm" | grep -qE "$pat" 2>/dev/null; then
      echo "advisory|门禁配置/决策轨迹（允许改但改完须重跑 self-check + 相关门禁）|$norm"
      return
    fi
  done <<< "$PROTECTED_ADVISORY_PATTERNS"
}

# ===== Bash 变更型命令检测 =====
# 检测 rm/mv/cp/sed -i/git reset 等变更型命令是否触碰受保护路径
MUTATING_RE='(^|[;&|()[:space:]])(rm|mv|cp|chmod|chown|truncate|tee|touch|mkdir|rmdir|git[[:space:]]+(reset|clean|checkout|restore)|sed[[:space:]]+(-i|--in-place)|perl[[:space:]]+-p?i|python3?[[:space:]]+.*open\(|node[[:space:]]+.*writeFile|npm[[:space:]]+version)\b|>>|>[^&]'

_check_bash_command() {
  local cmd="$1"
  # 变更型命令？
  if ! echo "$cmd" | grep -qE "$MUTATING_RE" 2>/dev/null; then
    return
  fi
  # 提取命令中的路径 token
  for token in $cmd; do
    # 去引号
    token=$(printf '%s' "$token" | sed "s/^['\"]//;s/['\"]$//")
    # 看起来像路径（含 / 或有文件扩展名）
    if echo "$token" | grep -qE '/' 2>/dev/null || echo "$token" | grep -qE '\.[A-Za-z0-9]+$' 2>/dev/null; then
      local hit
      hit=$(_check_path "$token")
      [[ -n "$hit" ]] && { echo "$hit"; return; }
    fi
  done
}

# ===== 主检测逻辑 =====
HIT=""

if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "MultiEdit" ]]; then
  # 提取 file_path / path
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    HIT=$(_check_path "$p")
    [[ -n "$HIT" ]] && break
  done < <(_extract_paths "$TOOL_INPUT_JSON")
elif [[ "$TOOL_NAME" == "Bash" ]]; then
  # 提取 command
  CMD=$(_extract_paths "$TOOL_INPUT_JSON" | head -1)
  [[ -z "$CMD" ]] && CMD=""
  if [[ -n "$CMD" ]]; then
    HIT=$(_check_bash_command "$CMD")
  fi
elif [[ "$TOOL_NAME" == "WebSearch" || "$TOOL_NAME" == "WebFetch" ]]; then
  # 检测搜索 benchmark answer / hidden solution
  # _extract_paths 只找 file_path/path 等键，WebSearch 的 query/url/prompt 需单独提取
  if command -v python3 >/dev/null 2>&1; then
    QUERY=$(printf '%s' "$TOOL_INPUT_JSON" | python3 -c '
import sys, json
try:
    ti = json.load(sys.stdin)
    q = ti.get("query", "") or ti.get("url", "") or ti.get("prompt", "")
    print(q if isinstance(q, str) else "")
except Exception:
    print("")
' 2>/dev/null)
  else
    QUERY=$(printf '%s' "$TOOL_INPUT_JSON" | grep -oE '"(query|url|prompt)":"[^"]*"' 2>/dev/null | head -1 | sed 's/.*":"//;s/"$//' || printf '')
  fi
  if echo "$QUERY" | grep -qiE 'hidden[-_[:space:]]+solution|official[-_[:space:]]+solution|gold[-_[:space:]]+patch|benchmark[-_[:space:]]+answer|swe[-_[:space:]]?bench[-_[:space:]]+solution|leaderboard[-_[:space:]]+answer' 2>/dev/null; then
    HIT="deny|solution contamination 风险：搜索 benchmark/hidden 答案会污染任务|$QUERY"
  fi
fi

# 未命中 → 放行
[[ -z "$HIT" ]] && exit 0

# 解析 HIT
DECISION=$(echo "$HIT" | cut -d'|' -f1)
REASON=$(echo "$HIT" | cut -d'|' -f2)
TARGET=$(echo "$HIT" | cut -d'|' -f3-)

MESSAGE="swarm-yuan integrity-guard: ${REASON}。四权分离生效：行动权/自评权/评分权/环境修改权须分离。目标: ${TARGET}"

# 输出 hookSpecificOutput（Claude Code PreToolUse 协议）
if [[ "$DECISION" == "deny" ]]; then
  # deny：硬阻塞
  cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${MESSAGE}","additionalContext":"swarm-yuan integrity-guard: DENY — ${REASON}。目标: ${TARGET}。如需修改此资产：1) 走 policy-guardian agent 审查（references/governance-agents.md）；2) 改 facts.conf 须同步全文档数字并重跑 self-check；3) 改注入区须走 --inject-frameworks（机器维护，禁手改）；4) 改 verifier/v1 须用户确认。"}}
EOF
else
  # advisory：不阻塞，仅注入提醒
  cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"swarm-yuan integrity-guard: ADVISORY — ${REASON}。目标: ${TARGET}。改完须：1) 重跑 bash scripts/self-check.sh --check-only 验证数字漂移；2) 重跑相关门禁（--all-full 或 --compliance-suite）确认断言仍通过；3) 决策落痕 bash scripts/trace-log.sh --decision --type UserChallenge --suggestion '改 ${TARGET}' --user-action approved --rationale '<填理由>'。"}}
EOF
fi

exit 0

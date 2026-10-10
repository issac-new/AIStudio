#!/usr/bin/env bash
# failure-detector.sh — PostToolUse(Bash) 失败模式检测器
#
# 来源：tanweai/pua failure-detector.sh 三层设计（exit_code + 错误签名 MD5 +
# SPINNING/EXPLORING/MIXED 三态模式分析）。swarm-yuan 侧纪律：
#   - 不用 PUA 话术，用门禁/特征卡/四要素术语
#   - bash 3.2 兼容（无 declare -A，无关联数组）
#   - 三平台兼容（macOS stat -f %m / Linux stat -c %Y 兜底）
#   - 无 python3/jq 硬依赖（纯 bash + md5/md5sum + cksum，降级友好）
#   - 落盘 .swarm-yuan/error-history.jsonl + 压力计数器
#   - SPINNING → 注入「换本质不同方案」指令；EXPLORING → 「保持方向」；MIXED → 「选最新错误方向提交」
#   - 突破检测（COUNT≥3 且 PEAK≥2 后成功）→ 降压归零 + 方法论沉淀指令
#
# 失败计数语义对齐 pua v3.5.1 runtime-contract（语义权威源
# references/governance-agents.md §Z.2）：
#   - 普通成功不清零失败计数（「ls 成功不是任务完成的证据」——Successful tools
#     are silent；same_sig_count 照清因属 SPINNING 去重维度；突破检测保留为
#     「验收通过」的机器近似降压出口）
#   - grep/rg 无匹配（exit 1 且无 error-like 模式）豁免不计失败（信息非失败）
#
# 设计理念：swarm-yuan 生成流程中 AI 反复改 conf 占位符失败时，此前无机械检测——
# AI 可能在原地打转 5 次才被发现。本 hook 把「失败模式」从 AI 自觉变成机械检测。
#
# 用法（由 hooks.json 的 PostToolUse matcher: "Bash" 自动调用）：
#   stdin = Claude Code PostToolUse hook payload（JSON）
#   stdout = 注入给 AI 的上下文（additionalContext）
#   exit 0 = 不阻塞（永不 fail 阻塞主流程，仅注入提示）
#
# 降级链：无 python3 → 纯 bash 解析（grep+sed 提取字段）；
#         无 md5/md5sum → cksum 兜底；无 cksum → 文本前 80 字符兜底。

set -uo pipefail

# ===== 配置 =====
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
STATE_DIR="${PROJECT_DIR}/.swarm-yuan"
COUNTER_FILE="${STATE_DIR}/.failure_count"
SESSION_FILE="${STATE_DIR}/.failure_session"
ERROR_HISTORY_FILE="${STATE_DIR}/error-history.jsonl"
PEAK_LEVEL_FILE="${STATE_DIR}/.peak_pressure_level"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

# ===== 读取 hook 输入 =====
HOOK_INPUT=$(cat 2>/dev/null || printf '')
[[ -z "$HOOK_INPUT" ]] && exit 0

# 一次性 python3 解析所有需要的字段（避免 $() 命令替换内 -c 单引号嵌套被 shell 破坏）。
# 无 python3 时降级 grep+sed（仅顶层字段可靠，tool_result.content 取不到——但 exit_code 是主信号，够用）。
if command -v python3 >/dev/null 2>&1; then
  _PARSED=$(printf '%s' "$HOOK_INPUT" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    # Claude Code PostToolUse
    # payload 的结果字段是 tool_response（旧版/部分宿主为 tool_result）——原实现只读
    # tool_result，现代宿主下 exit_code 恒取 0，失败计数/L 级升级/SPINNING 同签名去重
    # 整链死代码（「字段错位→机制整体失效」同型先例）。双字段兼容取值。
    tr = d.get("tool_response", d.get("tool_result", {}))
    if not isinstance(tr, dict):
        tr = {}
    # content 可能是 str 或 dict，统一转 str 并截断到 2000 字符
    content = tr.get("content", tr.get("text", ""))
    if isinstance(content, dict):
        content = json.dumps(content)
    content = str(content)[:2000] if content else ""
    # 命令文本（grep/rg 无匹配豁免需要——exit_code 分不清「无匹配」与「真错误」）
    ti = d.get("tool_input", {})
    if not isinstance(ti, dict):
        ti = {}
    command = ti.get("command", "") or ti.get("cmd", "")
    print(d.get("tool_name", ""))
    print(tr.get("exit_code", tr.get("exitCode", 0)))
    print(content)
    print(d.get("session_id", "unknown"))
    print(str(command)[:500] if command else "")
except Exception:
    print("")
    print(0)
    print("")
    print("unknown")
    print("")
' 2>/dev/null)
  # 按行读回（IFS 保留首尾空行用 read -r 循环）
  _lines=()
  while IFS= read -r _ln; do _lines+=("$_ln"); done <<< "$_PARSED"
  TOOL_NAME="${_lines[0]:-}"
  EXIT_CODE="${_lines[1]:-0}"
  TOOL_RESULT="${_lines[2]:-}"
  CURRENT_SESSION="${_lines[3]:-unknown}"
  TOOL_COMMAND="${_lines[4]:-}"
else
  # 降级：grep+sed 提取顶层字段（嵌套字段不可靠，exit_code 可能取不到→默认 0）
  TOOL_NAME=$(printf '%s' "$HOOK_INPUT" | grep -o '"tool_name":"[^"]*"' 2>/dev/null | head -1 | sed 's/"tool_name":"//;s/"$//' || printf '')
  EXIT_CODE=$(printf '%s' "$HOOK_INPUT" | grep -o '"exit_code":[0-9]*' 2>/dev/null | head -1 | sed 's/"exit_code"://' || printf '0')
  [[ -z "$EXIT_CODE" ]] && EXIT_CODE=0
  TOOL_RESULT=$(printf '%s' "$HOOK_INPUT" | grep -o '"content":"[^"]*"' 2>/dev/null | head -1 | sed 's/"content":"//;s/"$//' || printf '')
  CURRENT_SESSION=$(printf '%s' "$HOOK_INPUT" | grep -o '"session_id":"[^"]*"' 2>/dev/null | head -1 | sed 's/"session_id":"//;s/"$//' || printf 'unknown')
  TOOL_COMMAND=$(printf '%s' "$HOOK_INPUT" | grep -o '"command":"[^"]*"' 2>/dev/null | head -1 | sed 's/"command":"//;s/"$//' || printf '')
fi

[[ "$TOOL_NAME" != "Bash" ]] && exit 0
[[ -z "$EXIT_CODE" ]] && EXIT_CODE=0
# exit_code 是主信号（确定性可靠）；文本 grep 是次信号（exit_code≠0 时才查，防误报）
IS_ERROR="false"
if [[ "$EXIT_CODE" != "0" && "$EXIT_CODE" != "" ]]; then
  IS_ERROR="true"
elif echo "$TOOL_RESULT" | grep -qiE '^error:|^fatal:|^panic:|Traceback \(most recent|Exception:|command not found|No such file or directory|Permission denied'; then
  IS_ERROR="true"
fi

# grep/rg 无匹配豁免（§Z.2「grep 无匹配/非预期版本=信息，按实验验收判定，不按退出码」）。
# 判据：exit 1（grep 无匹配码；2 才是错误）+ 命令含 grep/rg + 输出无 error-like 模式 → 信息非失败。
if [[ "$IS_ERROR" == "true" && "$EXIT_CODE" == "1" ]]; then
  if printf '%s' "$TOOL_COMMAND" | grep -qE '(^|;|&&|\|\||\|) *(command +grep|grep|rg) ' 2>/dev/null; then
    if ! echo "$TOOL_RESULT" | grep -qiE 'error|fatal|Traceback|Exception|panic|denied|No such file'; then
      IS_ERROR="false"
    fi
  fi
fi

# ===== 会话隔离 =====
[[ -z "$CURRENT_SESSION" ]] && CURRENT_SESSION="unknown"
STORED_SESSION=""
[[ -f "$SESSION_FILE" ]] && STORED_SESSION=$(cat "$SESSION_FILE" 2>/dev/null || printf '')
if [[ "$CURRENT_SESSION" != "$STORED_SESSION" ]]; then
  echo "0" > "$COUNTER_FILE" 2>/dev/null || exit 0
  echo "0" > "$PEAK_LEVEL_FILE" 2>/dev/null || true
  : > "$ERROR_HISTORY_FILE" 2>/dev/null || true
  printf '%s' "$CURRENT_SESSION" > "$SESSION_FILE" 2>/dev/null || true
fi

# 读计数器
COUNT=0
[[ -f "$COUNTER_FILE" ]] && COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || printf '0')
[[ -z "$COUNT" ]] && COUNT=0

# 读峰值压力
PEAK_LEVEL=0
[[ -f "$PEAK_LEVEL_FILE" ]] && PEAK_LEVEL=$(cat "$PEAK_LEVEL_FILE" 2>/dev/null || printf '0')
[[ -z "$PEAK_LEVEL" ]] && PEAK_LEVEL=0

# ===== 降压检测：L2+ 挣扎后成功 =====
if [[ "$IS_ERROR" == "false" ]]; then
  if [[ "$COUNT" -ge 3 && "$PEAK_LEVEL" -ge 2 ]]; then
    # ★ 突破检测：连续失败≥3 次后成功
    ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || printf 'unknown')"
    printf '{"ts":"%s","event":"breakthrough","from_level":%s,"after_failures":%s}\n' \
      "$ts" "$PEAK_LEVEL" "$COUNT" >> "$ERROR_HISTORY_FILE" 2>/dev/null || true
    echo "0" > "$COUNTER_FILE"
    echo "0" > "$PEAK_LEVEL_FILE"
    # 突破时清 same_sig_count，避免下次同签名误判
    echo "0" > "${STATE_DIR}/.same_sig_count" 2>/dev/null || true
    rm -f "${STATE_DIR}/.last_sig_hash" 2>/dev/null || true
    cat << EOF
[swarm-yuan 突破 ✨ — 降压 from L${PEAK_LEVEL}]

连续 ${COUNT} 次失败后找到正确方案。压力归零：L${PEAK_LEVEL} → L0。

现在执行（swarm-yuan 方法论沉淀）：
1. 识别之前 ${COUNT} 次失败的根因（不是症状）
2. 记录正确路径——这是「特征卡/门禁配置」的可复用经验，写入 memory
3. 确认解决方案完整（不要过早庆祝——跑一遍 verify-completeness）
4. 扫描同类问题（swarm-yuan 铁律：一个问题进来，一类问题出去）

[门禁生效 🔥] 突破后方法论应沉淀为稳定单元，避免下次重走弯路。
EOF
    exit 0
  fi
  # 普通成功不清零 COUNT（「ls 成功不是任务完成的证据」，pua v3.5.1
  # runtime-contract「Successful tools are silent」）；验证类命令成功（test/verify/
  # check/build/lint 语义）=「子目标验收通过」的机器近似，清零。same_sig_count 照清
  # （换新尝试即进入新签名周期，属 SPINNING 去重维度）；突破检测保留为大挣扎后的降压出口。
  if [[ "$COUNT" -gt 0 ]]; then
    if printf '%s' "$TOOL_COMMAND" | grep -qiE '(^|/|;|&&|\|\||\|) *(pytest|py\.test|cargo (test|build|check)|npm (test|run (test|check|lint|build))|yarn (test|build)|make (test|check)|go test|mvn (test|verify)|gradle (test|build)|dotnet (test|build)|precheck|self-check|verify|run-tests?|lint|tsc|eslint|ruff|flake8|shellcheck)( |$)' 2>/dev/null; then
      echo "0" > "$COUNTER_FILE" 2>/dev/null || true
    fi
    echo "0" > "${STATE_DIR}/.same_sig_count" 2>/dev/null || true
    rm -f "${STATE_DIR}/.last_sig_hash" 2>/dev/null || true
  fi
  exit 0
fi

# ===== 失败路径：计数 + 记录错误签名 =====
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE" 2>/dev/null || exit 0

# 提取错误签名（首个含 error-like 模式的行，或首行，兜底 exit_code）
ERROR_SIG=$(echo "$TOOL_RESULT" | grep -iE 'error|fatal|Traceback|Exception|FAILED|panic|refused|denied|not found|cannot|unable|timeout' 2>/dev/null | head -1 | cut -c1-200)
[[ -z "$ERROR_SIG" ]] && ERROR_SIG=$(echo "$TOOL_RESULT" | head -1 | cut -c1-200)
[[ -z "$ERROR_SIG" ]] && ERROR_SIG="exit_code_${EXIT_CODE}"

# 提前定义 _sig_hash（同签名去重与 SPINNING 共用）
_sig_hash() {
  local s="$1"
  if command -v md5sum >/dev/null 2>&1; then
    printf '%s' "$s" | md5sum | cut -c1-8
  elif command -v md5 >/dev/null 2>&1; then
    printf '%s' "$s" | md5 | cut -c1-8
  elif command -v cksum >/dev/null 2>&1; then
    printf '%s' "$s" | cksum | awk '{printf "%08x", $1}'
  else
    printf '%s' "$s" | cut -c1-8
  fi
}

# 同签名累加（在 225 行 exit 0 之前，保证 run 1 也累加）
_cur_hash=$(_sig_hash "$ERROR_SIG") 2>/dev/null || _cur_hash="$ERROR_SIG"
if [[ ! -f "${STATE_DIR}/.last_sig_hash" ]]; then
  echo "$_cur_hash" > "${STATE_DIR}/.last_sig_hash"
  echo "1" > "${STATE_DIR}/.same_sig_count"
  SAME_SIG_COUNT=1
else
  _prev_hash=$(cat "${STATE_DIR}/.last_sig_hash" 2>/dev/null || echo "")
  if [[ "$_prev_hash" == "$_cur_hash" ]]; then
    SAME_SIG_COUNT_FILE="${STATE_DIR}/.same_sig_count"
    _prev_count=$(cat "$SAME_SIG_COUNT_FILE" 2>/dev/null || echo "1")
    [[ -z "$_prev_count" ]] && _prev_count=1
    SAME_SIG_COUNT=$(( _prev_count + 1 ))
    echo "$SAME_SIG_COUNT" > "$SAME_SIG_COUNT_FILE"
  else
    echo "$_cur_hash" > "${STATE_DIR}/.last_sig_hash"
    echo "1" > "${STATE_DIR}/.same_sig_count"
    SAME_SIG_COUNT=1
  fi
fi

# 追加错误历史（保留最近 10 条）
ts_epoch="$(date +%s 2>/dev/null || printf '0')"
# JSON 转义（反斜杠 + 双引号 + 剔除换行）
ERROR_SIG_ESC=$(printf '%s' "$ERROR_SIG" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
printf '{"ts":%s,"count":%s,"sig":"%s"}\n' "$ts_epoch" "$COUNT" "$ERROR_SIG_ESC" >> "$ERROR_HISTORY_FILE" 2>/dev/null || true
# 截断保留最近 10 条（tail + mv，三平台兼容）
tail -10 "$ERROR_HISTORY_FILE" > "${ERROR_HISTORY_FILE}.tmp" 2>/dev/null && mv "${ERROR_HISTORY_FILE}.tmp" "$ERROR_HISTORY_FILE" 2>/dev/null || true

# ===== 模式分析：SPINNING / EXPLORING / MIXED =====
PATTERN_ANALYSIS=""
if [[ "$COUNT" -ge 3 ]]; then
  # 纯 bash 模式分析（无 python3 依赖的降级路径）
  # 取最近 3 条签名，算 MD5（md5sum 优先，降级 md5，再降级 cksum，再降级首 40 字符）
  # _sig_hash 已在 ERROR_SIG 提取后定义（上移）
  # 读最近 3 条签名
  recent_sigs=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 提取 sig 字段值（降级 grep）
    sig_val=$(printf '%s' "$line" | sed -n 's/.*"sig":"\([^"]*\)".*/\1/p' 2>/dev/null || printf '')
    recent_sigs+=("$sig_val")
  done < <(tail -3 "$ERROR_HISTORY_FILE" 2>/dev/null)
  # 需 3 条才有意义
  if [[ ${#recent_sigs[@]} -ge 3 ]]; then
    h1=$(_sig_hash "${recent_sigs[0]}")
    h2=$(_sig_hash "${recent_sigs[1]}")
    h3=$(_sig_hash "${recent_sigs[2]}")
    if [[ "$h1" == "$h2" && "$h2" == "$h3" ]]; then
      PATTERN_ANALYSIS="SPINNING|${recent_sigs[2]}"
    elif [[ "$h1" != "$h2" && "$h2" != "$h3" && "$h1" != "$h3" ]]; then
      PATTERN_ANALYSIS="EXPLORING|${recent_sigs[0]}|${recent_sigs[1]}|${recent_sigs[2]}"
    else
      PATTERN_ANALYSIS="MIXED|${recent_sigs[0]}|${recent_sigs[1]}|${recent_sigs[2]}"
    fi
  fi
fi

# 跟踪峰值压力
CURRENT_LEVEL=0
if [[ "$COUNT" -ge 5 ]]; then
  CURRENT_LEVEL=4
elif [[ "$COUNT" -eq 4 ]]; then
  CURRENT_LEVEL=3
elif [[ "$COUNT" -eq 3 ]]; then
  CURRENT_LEVEL=2
elif [[ "$COUNT" -eq 2 ]]; then
  CURRENT_LEVEL=1
fi

# 同签名 3+ 次 → 仅一行 brief（完整诊断已在 L2 给出，此处不重复）
if [[ "${SAME_SIG_COUNT:-1}" -ge 3 ]]; then
  cat << EOF
[swarm-yuan SPINNING brief — 同一错误第 ${SAME_SIG_COUNT} 次]

错误签名重复 ${SAME_SIG_COUNT} 次（hash=${_cur_hash}），完整诊断已在第 2 次给出，不再重复。
强制：换一个本质不同的策略再执行下一个 Bash 调用。
swarm-yuan 铁律：改同一个 conf 变量/同一个门禁 ≠ 换策略，你需要本质不同的方案。
EOF
  exit 0
fi

# 按等级输出（L1 简短提示保留；L2+ 一行换路线提示——叙事剧场退役）
if [[ "$COUNT" -eq 2 ]]; then
  cat << EOF
[swarm-yuan L1 — 连续失败检测]

检测到连续 2 次失败。你必须切换到本质不同的方案——不是改参数/改函数名，是换策略。
EOF
elif [[ "$COUNT" -ge 3 ]]; then
  cat << EOF
[swarm-yuan L${COUNT} — 连续 ${COUNT} 次失败]
换路线：不是改参数/函数名，是换策略。先自己跑一遍验证命令确认通过再继续。
EOF
fi

exit 0

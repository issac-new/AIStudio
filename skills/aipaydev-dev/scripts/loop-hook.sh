#!/usr/bin/env bash
# loop-hook.sh — Stop hook：swarm-yuan Oracle Gate（来源：tanweai/pua pua-loop-hook + autoresearch）
#
# 设计理念：AI 说「完成了」不算数，verify_command 说了才算。
# 检测 <promise> 标签 → 独立跑 verify_command → exit≠0 拒绝 promise + 喂回输出 + loop 继续。
#
# Gate Protocol（autoresearch Oracle Isolation）:
#   Phase 1 (in-prompt): AI 自验，决定输出 <promise>
#   Phase 2 (in-hook):   本 hook 独立跑 verify_command，确认或拒绝
#   Phase 2 失败 → promise REJECTED → loop 继续 + 错误输出喂回 AI
#
# Stall Detection（连败强制反思）:
#   promise_rejections 1-2 → 提醒「上次 promise 被 Oracle 拒绝」
#   promise_rejections 3-4 → REASSESS「重读验证输出，列 3 个不同假设」
#   promise_rejections 5+  → 强制转向「你在解决错误的问题。退回需求本身」
#
# ASI（失败记忆）: 每次迭代追加 loop-history.jsonl，git revert 撤代码不撤记忆。
#
# 三平台兼容：bash 3.2 / date -u / stat -f %m(Linux: -c %Y) / timeout→gtimeout→perl 降级。
# 来源：Ralph Wiggum（Anthropic MIT）+ tanweai/pua pua-loop-hook。

set -uo pipefail
command -v jq >/dev/null 2>&1 || { echo "jq not found, skipping loop hook" >&2; exit 0; }

# ===== 可移植 timeout（macOS 无 GNU timeout）=====
run_with_timeout() {
  local seconds="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
  else
    perl -e 'my $s=shift @ARGV; $SIG{ALRM}=sub{exit 124}; alarm($s); exec @ARGV;' "$seconds" "$@"
  fi
}

HOOK_INPUT=$(cat 2>/dev/null || printf '')
[[ -z "$HOOK_INPUT" ]] && exit 0

# ===== Gate 0: subagent 隔离（Stop hook 仅主会话触发）=====
HOOK_EVENT=$(echo "$HOOK_INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null || echo "")
PARENT_SESSION=$(echo "$HOOK_INPUT" | jq -r '.parent_session_id // ""' 2>/dev/null || echo "")
if [[ "$HOOK_EVENT" == "SubagentStop" ]] || [[ -n "$PARENT_SESSION" ]]; then
  exit 0
fi

# ===== 状态文件解析（cwd 哈希命名，多项目隔离）=====
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
STATE_DIR="${PROJECT_DIR}/.swarm-yuan"
CWD_HASH=$(printf '%s' "$(pwd)" | (md5sum 2>/dev/null || md5 2>/dev/null || cksum) | cut -c1-8)
ABS_STATE_FILE="${STATE_DIR}/loop-${CWD_HASH}.md"

[[ -f "$ABS_STATE_FILE" ]] || exit 0

# ===== Stale lock 检测（mtime > 30min 视为孤儿，清理）=====
MTIME=$(stat -f %m "$ABS_STATE_FILE" 2>/dev/null || stat -c %Y "$ABS_STATE_FILE" 2>/dev/null || echo 0)
NOW=$(date +%s)
if [[ "$MTIME" =~ ^[0-9]+$ ]] && [[ $((NOW - MTIME)) -gt 1800 ]]; then
  echo "🧹 swarm-yuan Loop: 状态文件陈旧（>30min 空闲），清理孤儿" >&2
  echo "{\"status\":\"orphan_reaped\",\"state_file\":\"$ABS_STATE_FILE\",\"age_sec\":$((NOW - MTIME)),\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "${STATE_DIR}/loop-history.jsonl" 2>/dev/null || true
  rm -f "$ABS_STATE_FILE"
  exit 0
fi

# 规范化 CRLF
TEMP_NORM="${ABS_STATE_FILE}.norm.$$"
tr -d '\r' < "$ABS_STATE_FILE" > "$TEMP_NORM" && mv "$TEMP_NORM" "$ABS_STATE_FILE"

# 解析 frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$ABS_STATE_FILE" | tr -d '\r')
LOOP_ACTIVE=$(echo "$FRONTMATTER" | grep '^active:' | sed 's/active: *//' || true)
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//' || true)
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//' || true)
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/' || true)
VERIFY_CMD=$(echo "$FRONTMATTER" | grep '^verify_command:' | sed 's/verify_command: *//' | sed 's/^"\(.*\)"$/\1/' || true)
PROMISE_REJECTIONS=$(echo "$FRONTMATTER" | grep '^promise_rejections:' | sed 's/promise_rejections: *//' || echo "0")

[[ ! "$PROMISE_REJECTIONS" =~ ^[0-9]+$ ]] && PROMISE_REJECTIONS=0

# 暂停状态 → 不干预
if [[ "$LOOP_ACTIVE" == "false" ]]; then
  exit 0
fi

# ===== 检测 max_iterations 上限 =====
if [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]] && [[ "$MAX_ITERATIONS" -gt 0 ]] && [[ "$ITERATION" -gt "$MAX_ITERATIONS" ]]; then
  echo "⏹ swarm-yuan Loop: 达到 max_iterations=${MAX_ITERATIONS}，loop 终止" >&2
  rm -f "$ABS_STATE_FILE"
  exit 0
fi

# ===== 读取 AI 最后输出（检测 <promise> / <loop-abort> / <loop-pause>）=====
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")
LAST_MSG=$(echo "$HOOK_INPUT" | jq -r '.last_assistant_message // ""' 2>/dev/null || echo "")

# 如果 last_assistant_message 为空，尝试从 transcript 读最后一段
if [[ -z "$LAST_MSG" && -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
  LAST_MSG=$(tail -c 20000 "$TRANSCRIPT_PATH" 2>/dev/null | tr '\n' ' ' || echo "")
fi

# ===== <loop-abort> 终止 =====
if echo "$LAST_MSG" | grep -qE "<loop-abort>" 2>/dev/null; then
  ABORT_REASON=$(echo "$LAST_MSG" | sed -n 's/.*<loop-abort>\(.*\)<\/loop-abort>.*/\1/p' | head -1)
  echo "🛑 swarm-yuan Loop: <loop-abort> 信号——终止" >&2
  echo "  原因: ${ABORT_REASON:-（未说明）}" >&2
  echo "{\"iteration\":${ITERATION:-1},\"status\":\"aborted\",\"reason\":\"${ABORT_REASON:-unspecified}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "${STATE_DIR}/loop-history.jsonl" 2>/dev/null || true
  rm -f "$ABS_STATE_FILE"
  exit 0
fi

# ===== <loop-pause> 暂停 =====
if echo "$LAST_MSG" | grep -qE "<loop-pause>" 2>/dev/null; then
  PAUSE_REASON=$(echo "$LAST_MSG" | sed -n 's/.*<loop-pause>\(.*\)<\/loop-pause>.*/\1/p' | head -1)
  echo "⏸ swarm-yuan Loop: <loop-pause> 信号——暂停（状态保留，新会话自动恢复）" >&2
  echo "  原因: ${PAUSE_REASON:-（未说明）}" >&2
  # active: false（暂停，新会话 SessionStart 可恢复）
  sed -i.bak 's/^active: true$/active: false/' "$ABS_STATE_FILE" 2>/dev/null && rm -f "${ABS_STATE_FILE}.bak"
  echo "{\"iteration\":${ITERATION:-1},\"status\":\"paused\",\"reason\":\"${PAUSE_REASON:-unspecified}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "${STATE_DIR}/loop-history.jsonl" 2>/dev/null || true
  exit 0
fi

# ===== 检测 <promise> =====
if ! echo "$LAST_MSG" | grep -qE "<promise>${COMPLETION_PROMISE}</promise>" 2>/dev/null; then
  # 无 promise → 正常结束本轮，loop 不干预（AI 会在下轮继续）
  # 更新 iteration 计数
  NEW_ITER=$(( ${ITERATION:-1} + 1 ))
  sed -i.bak "s/^iteration: .*/iteration: ${NEW_ITER}/" "$ABS_STATE_FILE" 2>/dev/null && rm -f "${ABS_STATE_FILE}.bak"
  touch "$ABS_STATE_FILE"  # 更新 mtime（防 stale 误清）
  exit 0
fi

# ===== promise 检测到 → Phase 2: Oracle 独立验证 =====
echo "⚡ swarm-yuan Loop: 检测到 <promise>，Oracle 独立运行验证命令..." >&2
echo "  verify_command: ${VERIFY_CMD}" >&2

# 运行 verify_command（带 timeout 300s）
# 注意：`|| true` 会吞退出码，需用 set +e 或分离捕获
set +e
VERIFY_OUTPUT=$(run_with_timeout 300 bash -c "$VERIFY_CMD" 2>&1)
VERIFY_EXIT=$?
set -e
# run_with_timeout 超时返回 124，其他退出码透传

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ "$VERIFY_EXIT" -eq 0 ]]; then
  # ===== Oracle 接受 promise → loop 完成 =====
  echo "✅ swarm-yuan Loop: Oracle 验证通过——promise 接受，loop 完成！" >&2
  echo "{\"iteration\":${ITERATION:-1},\"status\":\"complete\",\"promise_rejections\":${PROMISE_REJECTIONS},\"timestamp\":\"${ts}\"}" >> "${STATE_DIR}/loop-history.jsonl" 2>/dev/null || true
  rm -f "$ABS_STATE_FILE"
  # 不阻塞——让 AI 正常结束
  exit 0
fi

# ===== Oracle 拒绝 promise → loop 继续 =====
PROMISE_REJECTIONS=$((PROMISE_REJECTIONS + 1))
echo "🚫 swarm-yuan Loop: Oracle 拒绝 promise（exit=${VERIFY_EXIT}）——loop 继续" >&2
echo "  验证输出（喂回 AI）:" >&2
echo "$VERIFY_OUTPUT" | tail -20 | sed 's/^/    /' >&2

# 更新状态文件：promise_rejections + iteration
sed -i.bak "s/^promise_rejections: .*/promise_rejections: ${PROMISE_REJECTIONS}/" "$ABS_STATE_FILE" 2>/dev/null && rm -f "${ABS_STATE_FILE}.bak"
NEW_ITER=$(( ${ITERATION:-1} + 1 ))
sed -i.bak "s/^iteration: .*/iteration: ${NEW_ITER}/" "$ABS_STATE_FILE" 2>/dev/null && rm -f "${ABS_STATE_FILE}.bak"
touch "$ABS_STATE_FILE"

# 记录历史
VERIFY_TAIL=$(echo "$VERIFY_OUTPUT" | tail -5 | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-300)
echo "{\"iteration\":${ITERATION:-1},\"status\":\"promise_rejected\",\"verify_exit\":${VERIFY_EXIT},\"rejections\":${PROMISE_REJECTIONS},\"verify_tail\":\"${VERIFY_TAIL}\",\"timestamp\":\"${ts}\"}" >> "${STATE_DIR}/loop-history.jsonl" 2>/dev/null || true

# ===== Stall Detection 注入 =====
cat << EOF
[swarm-yuan Oracle Gate — promise 被拒绝 #${PROMISE_REJECTIONS}]

你的 <promise>${COMPLETION_PROMISE}</promise> 被 Oracle 拒绝。
验证命令退出码: ${VERIFY_EXIT}
验证命令: ${VERIFY_CMD}

验证输出（逐字读）:
$(echo "$VERIFY_OUTPUT" | tail -30)

EOF

if [[ "$PROMISE_REJECTIONS" -ge 5 ]]; then
  cat << 'EOF'
🚨 Stall Detection: 连续 5+ 次 promise 被拒——你在解决错误的问题。

强制转向：
1. 退回需求本身——你确定在解决正确的问题吗？
2. 列出已验证事实 + 已排除可能 + 缩小范围
3. 如果真的不可能（需外部权限/根本性需求变更），用 <loop-abort>原因</loop-abort> 终止
   （这不是「我不行」，这是「问题的边界在这里」——有尊严的退出）
4. 否则换完全不同的思路——你已经证明当前方向走不通
EOF
elif [[ "$PROMISE_REJECTIONS" -ge 3 ]]; then
  cat << 'EOF'
⚠ Stall Detection: 连续 3+ 次 promise 被拒——REASSESS。

强制：
1. 重读上方验证输出，逐字读失败信号
2. 列 3 个本质不同的假设（不是改参数，是换思路）
3. 检查 git diff——你是否在重复上一轮的改动？
4. 读 .swarm-yuan/loop-history.jsonl——之前的迭代都试了什么？
5. 如果是 self-check 数字漂移——读 facts.conf 确认数字与代码真值一致
6. 如果是 precheck fail——读 gate-runs.jsonl 看 fail-id 级断言
EOF
else
  cat << 'EOF'
提醒：上次 promise 被 Oracle 拒绝。读上方验证输出，修复后再试。
- 先自己跑一遍验证命令确认通过，再输出 <promise>
- 不要在未验证的情况下声称完成
EOF
fi

# Stop 时顺带跑 loop-oracle 门禁（advisory——原 advisory-only
# 无触发路径，整合进 loop-hook 检查链；fail-open，有下层门禁兜底）
_pc="${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh"
[[ -f "$_pc" ]] && bash "$_pc" --loop-oracle 2>/dev/null || true

# loop 继续（exit 0 不阻塞，但 additionalContext 已注入）
exit 0

#!/usr/bin/env bash
# setup-loop.sh — 启动 swarm-yuan Oracle Gate 循环（来源：tanweai/pua pua-loop + autoresearch Oracle Isolation）
#
# 设计理念：swarm-yuan 生成流程跑完 Step 1-13 后，AI 说「已生成 skill」——但没独立验证。
# 本脚本创建状态文件，loop-hook.sh 在 Stop 事件时独立跑 verify_command，
# promise 被 Oracle 拒绝则 loop 继续，直到验证通过或 loop-abort。
#
# 用法:
#   bash scripts/setup-loop.sh "任务描述" [--verify '<命令>'] [--max-iterations <n>] [--completion-promise '<text>']
#
# verify_command 默认绑定生成物中真实存在的入口（绝对路径，cwd 无关）:
#   bash <skill>/scripts/precheck.sh --all
# （hook 以项目根为 cwd 跑 verify_command；相对路径在项目根不存在——
#   audit-claims-reality A8 修复：旧默认 self-check+--all-full 永不通过。）
#
# 三平台兼容：bash 3.2 / 无 declare -A / date -u / md5sum→md5 降级。
# 来源：Ralph Wiggum (Anthropic MIT) + tanweai/pua pua-loop。

set -euo pipefail

# ===== 参数解析 =====
PROMPT_PARTS=()
MAX_ITERATIONS=0
COMPLETION_PROMISE="SWARM_YUAN_DONE"
VERIFY_COMMAND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      cat << 'HELP_EOF'
swarm-yuan Oracle Gate Loop — 自动迭代 + 独立验证

USAGE:
  bash scripts/setup-loop.sh "任务描述" [OPTIONS]

ARGUMENTS:
  任务描述    初始任务 prompt（可多词不用引号）

OPTIONS:
  --verify '<command>'             验证命令——hook 在 <promise> 后独立运行（Oracle Gate）
                                   默认: bash <本脚本同目录>/precheck.sh --all（绝对路径，cwd 无关）
  --max-iterations <n>             最大迭代数（默认 0=无限）
  --completion-promise '<text>'    完成信号词（默认 SWARM_YUAN_DONE）
  -h, --help                       显示帮助

GATE PROTOCOL（来源：autoresearch Oracle Isolation）:
  Phase 1 (in-prompt): AI 跑 self-check/precheck，决定输出 <promise>
  Phase 2 (in-hook):   hook 独立跑 --verify 命令
  Phase 2 失败 → promise 被拒绝 → loop 继续 + 错误输出喂回 AI

完成信号: <promise>SWARM_YUAN_DONE</promise>
终止:     <loop-abort>原因</loop-abort>
暂停:     <loop-pause>缺什么</loop-pause>

EXAMPLES:
  bash scripts/setup-loop.sh "修复 precheck.conf 占位符" --verify 'bash scripts/precheck.sh --all'
  bash scripts/setup-loop.sh "生成完整 skill" --max-iterations 20
  bash scripts/setup-loop.sh "让合规门禁全过" --verify 'bash scripts/precheck.sh --compliance-suite'

STOPPING:
  默认无限循环，直到 Oracle 验证通过 / <loop-abort> / Ctrl+C

MONITORING:
  ls .swarm-yuan/loop-*.md           # 状态文件
  cat .swarm-yuan/loop-history.jsonl # 迭代历史
HELP_EOF
      exit 0
      ;;
    --max-iterations)
      [[ -z "${2:-}" ]] && { echo "❌ --max-iterations 需要数字参数" >&2; exit 1; }
      [[ ! "$2" =~ ^[0-9]+$ ]] && { echo "❌ --max-iterations 须正整数或 0" >&2; exit 1; }
      MAX_ITERATIONS="$2"; shift 2 ;;
    --completion-promise)
      [[ -z "${2:-}" ]] && { echo "❌ --completion-promise 需要文本参数" >&2; exit 1; }
      COMPLETION_PROMISE="$2"; shift 2 ;;
    --verify)
      [[ -z "${2:-}" ]] && { echo "❌ --verify 需要命令参数" >&2; exit 1; }
      VERIFY_COMMAND="$2"; shift 2 ;;
    *)
      PROMPT_PARTS+=("$1"); shift ;;
  esac
done

PROMPT="${PROMPT_PARTS[*]}"
[[ -z "$PROMPT" ]] && { echo "❌ 缺任务描述" >&2; echo "   例: bash scripts/setup-loop.sh \"修复占位符\" --verify 'bash scripts/precheck.sh --all'" >&2; exit 1; }

# 默认 verify：生成物侧 Oracle = precheck --all（核心 10 门禁对 PROJECT_DIR 真跑真判）。
# audit-claims-reality（A8）：用脚本自身绝对路径——hook 以项目根为 cwd 执行 verify_command
# （loop-hook.sh bash -c），相对路径 scripts/*.sh 在项目根不存在，旧默认永不通过；
# self-check 是生成器侧事实源校验（facts.conf 不随生成物分发），不适合做生成物默认 Oracle。
if [[ -z "$VERIFY_COMMAND" ]]; then
  _self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  _pc="${_self_dir}/precheck.sh"
  [[ -f "$_pc" ]] || _pc="${_self_dir}/../precheck.sh"   # 生成器侧 assets/hooks/ 布局兜底
  VERIFY_COMMAND="bash \"${_pc}\" --all"
fi

# ===== 状态文件（cwd 哈希命名，多项目隔离）=====
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
STATE_DIR="${PROJECT_DIR}/.swarm-yuan"
mkdir -p "$STATE_DIR" 2>/dev/null || { echo "❌ 无法创建 $STATE_DIR" >&2; exit 1; }

# cwd 哈希（md5sum→md5→cksum 降级，三平台兼容）
CWD_HASH=$(printf '%s' "$(pwd)" | (md5sum 2>/dev/null || md5 2>/dev/null || cksum) | cut -c1-8)
ABS_STATE="${STATE_DIR}/loop-${CWD_HASH}.md"

# YAML 引号处理
COMPLETION_PROMISE_YAML="\"${COMPLETION_PROMISE}\""
VERIFY_COMMAND_YAML="\"${VERIFY_COMMAND//\"/}\""

# ===== 写状态文件 =====
cat > "$ABS_STATE" <<EOF
---
active: true
iteration: 1
session_id: ${CLAUDE_CODE_SESSION_ID:-}
max_iterations: ${MAX_ITERATIONS}
completion_promise: ${COMPLETION_PROMISE_YAML}
verify_command: ${VERIFY_COMMAND_YAML}
promise_rejections: 0
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_cwd: "$(pwd)"
---

${PROMPT}

== swarm-yuan Oracle Gate 行为协议（每次迭代必须遵守）==
1. 读 .swarm-yuan/trace.jsonl + git log，了解上次做了什么（Git 是跨迭代记忆）
2. 如果存在 .swarm-yuan/loop-history.jsonl，先读了解之前的迭代结果，避免重复失败方案
3. 按三条铁律执行：版本锁定 / 安全规范 / 三平台兼容
4. 跑 self-check + precheck 验证改动，不跳过
5. 发现问题就修，修完再验证（不声称完成，先验证）
6. 只有当任务完全完成且验证通过时，输出 <promise>${COMPLETION_PROMISE}</promise>

== 验证门控（Oracle Isolation，来源：autoresearch）==
- 你输出 <promise> 后，hook 会独立运行: ${VERIFY_COMMAND}
- 如果验证命令退出码 ≠ 0 → 你的 promise 被拒绝 → loop 继续
- Oracle 不可欺骗：你无法绕过验证命令
- 先自己跑一遍验证命令确认通过，再输出 <promise>

== 防原地打转协议（来源：autoresearch Stall Detection）==
- 每轮开始先检查 git log + git diff：如果发现自己在重复上轮的改动，必须切换到完全不同的方案
- 连续 3 轮改同一个文件的同一区域 → 退一步重新分析根因
- 如果 self-check/precheck 持续失败，先读完整错误输出，列 3 个不同假设再行动
- promise 被拒绝 → 读 hook 返回的验证输出，修复后再尝试

禁止:
- 不要说「我无法解决」——在 loop 里没有退出权，穷尽一切才能输出完成信号
- 不要在未验证的情况下声称完成
- 不要连续 3 轮用同一种方法——不行就换
- 遇到困难先穷尽所有自动化手段，不要用 <loop-abort> 逃避
EOF

# ===== 初始化历史日志 =====
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"iteration\":0,\"status\":\"init\",\"verify_command\":\"${VERIFY_COMMAND//\"/}\",\"timestamp\":\"${ts}\",\"state_path\":\"${ABS_STATE}\"}" > "${STATE_DIR}/loop-history.jsonl"

# ===== 输出启动信息 =====
cat <<EOF
🔄 swarm-yuan Oracle Gate Loop 启动（来源：autoresearch + tanweai/pua pua-loop）

迭代: 1
最大迭代: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "无限（跑到 Oracle 验证通过）"; fi)
完成信号: <promise>${COMPLETION_PROMISE}</promise>
验证命令: ${VERIFY_COMMAND}
  ⚡ Oracle 激活：你无法对完成撒谎——hook 独立跑验证命令

Gate protocol:
  Phase 1: 你跑 self-check/precheck → 决定输出 <promise>
  Phase 2: hook 独立跑 --verify → 确认或拒绝

监控: cat .swarm-yuan/loop-history.jsonl
取消: Ctrl+C 或删 ${ABS_STATE}

═══════════════════════════════════════════════════════════
CRITICAL - Completion Gate
═══════════════════════════════════════════════════════════

完成时输出: <promise>${COMPLETION_PROMISE}</promise>

⚡ ORACLE GATE ACTIVE:
  你输出 <promise> 后，hook 会独立运行:
    ${VERIFY_COMMAND}
  退出码 ≠ 0 → promise 被拒绝 → loop 继续
  你无法绕过。先自己跑一遍确认通过再输出 <promise>。

═══════════════════════════════════════════════════════════

${PROMPT}
EOF

exit 0

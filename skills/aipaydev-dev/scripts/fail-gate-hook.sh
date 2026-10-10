#!/usr/bin/env bash
# fail-gate-hook.sh — PreToolUse 门禁失败捕获门（precheck fail 从"红字"升级为"真拦截"）
#
# 设计动机：此前的 PreToolUse hook 只 echo "✗ FAIL" 文字，AI 不重跑就等于绕过（诊断发现
# 的第一大洞）。本 hook 在门禁 fail 后捕获"未修复就继续改文件"的行为，返回 deny JSON 真拦截。
#
# 机制（捕获模型，非前置模型——不预跑门禁防慢，只抓"已 fail 未修复"）：
#   1. 配置 GATE_ENFORCE_DENY（precheck.conf，逗号分隔门禁名白名单）非空才生效；
#      空（默认）= 完全关闭，与既有行为逐字节一致（向后兼容）。
#   2. draft 期（SKILL.md status: draft）自动关闭——骨架期门禁红是常态，拦截会死锁。
#   3. PostToolUse Bash precheck.sh 时：若退出码非 0，把白名单门禁名记到
#      .swarm-yuan/.gate-fail-flag（捕获）；退出码 0 时清除（修复后解锁）。
#   4. PreToolUse Write/Edit/MultiEdit 时：flag 存在且非空 → deny JSON。
#   5. 文件目标豁免：改 .swarm-yuan/ 下的 conf 与 precheck.sh 本身不拦（修门禁配置的通道）。
#
# 用法（由 hooks.json 的 PreToolUse matcher 自动调用；PostToolUse 记 flag）：
#   stdin = Claude Code hook payload（JSON）
#   stdout = deny 时 hookSpecificOutput JSON；其余静默 exit 0
#   bash 3.2 兼容；解析失败一律放行（fail-open，不误伤正常流）
#
# --report 子命令（deny 事件审计报告，独立于 hook stdin 流程）
#   用法：bash fail-gate-hook.sh --report [N] [--project <项目根>]
#     N = 输出最近 N 条事件（默认 20）
#     --project = 项目根（缺省 = 当前目录）
#   退出码：0 正常（含空文件）；1 arg 错误。
#
# 配对审计模式（来源：dsh 调研 hook-protocol/src/events.ts，bash 化）：
#   deny-only 日志升级为"每个决策点一行"的全量审计 .swarm-yuan/gate-audit.jsonl：
#     ① invoked/result 配对语义折叠为单行（本 hook 是同步单次进程，无异步生命周期，
#        dsh 的配对事件是为跨异步边界 join；单行自包含 = 同语义的 bash 适配）；
#     ② handler 是稳定确定性 id（fail-gate-hook:edit / fail-gate-hook:bash，按匹配域派生，
#        非随机 UUID）——重跑可对齐；
#     ③ 派生决策规则：decision ∈ {deny, pass}，pass 也落行（豁免路径/命令不在白名单），
#        拦截率 = deny/总数 可算——不只数 deny；
#     ④ 目标字段截断 500 字符（dsh stderrSummary 同款有界摘要）；
#     ⑤ fail-open 变体（A4 原则的 bash 取舍）：审计写失败不阻塞主流程（|| true），
#        不学习 dsh "审计失败即拒绝决策"——我们的 deny 是安全侧动作，宁可留痕缺失也不可放行失效。
#   gate-deny.jsonl 保留双写（向后兼容旧 --report 与既有消费者）。
#   休眠不记：flag 不存在（门禁未红）或工具不在拦截域时不写审计行——审计总体是
#   "门禁红期间的决策点"，不是全量工具调用日志（体积纪律）。
#   --report 输出（audit 文件存在时）：① 最近 N 条决策事件 ② 拦截率（按 handler）
#   ③ 按门禁聚合（deny 行）④ 按工具决策分布；仅有旧 gate-deny.jsonl 时退回旧三段。

set -uo pipefail

if [[ "${1:-}" == "--report" ]]; then
  _rp_n=20
  _rp_proj="$(pwd)"
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project) _rp_proj="${2:?--project 需要路径}"; shift 2 ;;
      -h|--help) sed -n '22,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
      *) [[ "$1" =~ ^[0-9]+$ ]] && _rp_n="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
    esac
  done
  _rp_file="${_rp_proj}/.swarm-yuan/gate-deny.jsonl"
  _rp_audit="${_rp_proj}/.swarm-yuan/gate-audit.jsonl"
  # audit 文件存在 → 新四段（含拦截率）；否则退回旧三段（向后兼容）
  if [[ -f "$_rp_audit" ]]; then
    echo "## fail-gate 审计报告（project=${_rp_proj}，最近 ${_rp_n} 条，源=gate-audit.jsonl）"
    echo
    echo "### ① 最近决策事件（按时间倒序）"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "时间" "handler" "工具" "决策" "原因" "目标"
    tail -"$_rp_n" "$_rp_audit" | LC_ALL=C sed -n 's/.*"ts":"\([^"]*\)".*"handler":"\([^"]*\)".*"tool":"\([^"]*\)".*"decision":"\([^"]*\)".*"reason":"\([^"]*\)".*"target":"\([^"]*\)".*/\1\t\2\t\3\t\4\t\5\t\6/p' | LC_ALL=C sort -r
    echo
    echo "### ② 拦截率（按 handler：决策点总数 / deny 数 / 拦截率）"
    printf '%s\t%s\t%s\t%s\n' "handler" "决策点" "deny" "拦截率"
    LC_ALL=C sed -n 's/.*"handler":"\([^"]*\)".*"decision":"\([^"]*\)".*/\1\t\2/p' "$_rp_audit" \
      | LC_ALL=C awk -F'\t' '{t[$1]++; if ($2=="deny") d[$1]++} END {for (h in t) printf "%s\t%d\t%d\t%.1f%%\n", h, t[h], d[h]+0, (d[h]+0)*100/t[h]}' \
      | LC_ALL=C sort
    echo
    echo "### ③ 按门禁聚合（deny 行，哪些门禁拦截最多）"
    LC_ALL=C grep '"decision":"deny"' "$_rp_audit" | LC_ALL=C sed -n 's/.*"gates":"\([^"]*\)".*/\1/p' | LC_ALL=C sort | LC_ALL=C uniq -c | LC_ALL=C sort -rn | LC_ALL=C awk '{printf "%d\t%s\n", $1, $2}'
    echo
    echo "### ④ 按工具决策分布"
    printf '%s\t%s\t%s\n' "工具" "决策" "次数"
    LC_ALL=C sed -n 's/.*"tool":"\([^"]*\)".*"decision":"\([^"]*\)".*/\1\t\2/p' "$_rp_audit" | LC_ALL=C sort | LC_ALL=C uniq -c | LC_ALL=C sort -rn | LC_ALL=C awk '{printf "%d\t%s\t%s\n", $1, $2, $3}'
    exit 0
  fi
  if [[ ! -f "$_rp_file" ]]; then
    echo "## fail-gate deny 报告（project=${_rp_proj}）"
    echo "无 deny 事件（.swarm-yuan/gate-deny.jsonl 不存在）"
    exit 0
  fi
  echo "## fail-gate deny 报告（project=${_rp_proj}，最近 ${_rp_n} 条，源=gate-deny.jsonl 旧格式）"
  echo
  echo "### ① 最近 deny 事件（按时间倒序）"
  printf '%s\t%s\t%s\t%s\n' "时间" "工具" "目标" "门禁"
  # sed 抽 4 个字段（ts/tool/target/gates），逐行输出 TSV
  tail -"$_rp_n" "$_rp_file" | LC_ALL=C sed -n 's/.*"ts":"\([^"]*\)".*"tool":"\([^"]*\)".*"target":"\([^"]*\)".*"gates":"\([^"]*\)".*/\1\t\2\t\3\t\4/p' | LC_ALL=C sort -r
  echo
  echo "### ② 按门禁聚合（哪些门禁 deny 最多）"
  LC_ALL=C sed -n 's/.*"gates":"\([^"]*\)".*/\1/p' "$_rp_file" | LC_ALL=C sort | LC_ALL=C uniq -c | LC_ALL=C sort -rn | LC_ALL=C awk '{printf "%d\t%s\n", $1, $2}'
  echo
  echo "### ③ 按工具聚合"
  LC_ALL=C sed -n 's/.*"tool":"\([^"]*\)".*/\1/p' "$_rp_file" | LC_ALL=C sort | LC_ALL=C uniq -c | LC_ALL=C sort -rn | LC_ALL=C awk '{printf "%d\t%s\n", $1, $2}'
  exit 0
fi

HOOK_INPUT=$(cat 2>/dev/null || printf '')
[[ -z "$HOOK_INPUT" ]] && exit 0

# ===== 提取 hook 上下文（python3 优先，降级 grep）=====
if command -v python3 >/dev/null 2>&1; then
  _PARSED=$(printf '%s' "$HOOK_INPUT" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get("hook_event_name", ""))
    print(d.get("tool_name", ""))
    ti = d.get("tool_input", {})
    if isinstance(ti, dict):
        print(ti.get("command", "") or "")
        print(ti.get("file_path", "") or ti.get("path", "") or "")
    else:
        print("")
        print("")
    print(d.get("cwd", ""))
    tr = d.get("tool_response", {})
    if isinstance(tr, dict):
        ec = tr.get("exit_code", tr.get("exitCode", ""))
        print("" if ec is None else str(ec))
    else:
        print("")
except Exception:
    for _ in range(6):
        print("")
' 2>/dev/null)
  _lines=()
  while IFS= read -r _ln; do _lines+=("$_ln"); done <<< "$_PARSED"
  EVENT="${_lines[0]:-}"
  TOOL="${_lines[1]:-}"
  CMD="${_lines[2]:-}"
  FILE_PATH="${_lines[3]:-}"
  CWD="${_lines[4]:-}"
  EXIT_CODE="${_lines[5]:-}"
else
  EVENT=$(printf '%s' "$HOOK_INPUT" | grep -o '"hook_event_name":"[^"]*"' 2>/dev/null | head -1 | sed 's/"hook_event_name":"//;s/"$//' || printf '')
  TOOL=$(printf '%s' "$HOOK_INPUT" | grep -o '"tool_name":"[^"]*"' 2>/dev/null | head -1 | sed 's/"tool_name":"//;s/"$//' || printf '')
  CMD=$(printf '%s' "$HOOK_INPUT" | grep -o '"command":"[^"]*"' 2>/dev/null | head -1 | sed 's/"command":"//;s/"$//' || printf '')
  FILE_PATH=""
  CWD=""
  EXIT_CODE=""
fi

[[ -z "$EVENT" ]] && exit 0

# ===== 定位 skill 根与配置 =====
# hooks.json 用 ${CLAUDE_PLUGIN_ROOT:-.} 调用，cwd 是项目根；skill 脚本在 scripts/ 下
# 原实现 CONF/SKILL.md 全部取自 CWD 侧——测试的单目录
# 布局（skill 即项目）碰巧成立，但生成物是双目录布局（CLAUDE_PLUGIN_ROOT=skill 目录 ≠ cwd=
# 项目根），CONF 永远读不到 → spec 前置门在真实部署中整体死代码。修复：skill 侧文件三级
# 解析（CLAUDE_PLUGIN_ROOT → CWD（测试/单目录布局）→ 脚本自身位置）；项目侧（.swarm-yuan、
# spec 搜索）保持 CWD 语义不变。
ROOT="${CWD:-$(pwd)}"                       # 项目侧：状态/留痕/spec 搜索
FLAG_DIR="$ROOT/.swarm-yuan"
FLAG="$FLAG_DIR/.gate-fail-flag"
_sm_self="$(cd "$(dirname "$0")" && pwd)"
CONF=""
SKILL_MD=""
for _cand in "${CLAUDE_PLUGIN_ROOT:-}/scripts/precheck.conf" "$ROOT/scripts/precheck.conf" "${_sm_self}/../scripts/precheck.conf"; do
  [[ -z "$_cand" || ! -f "$_cand" ]] && continue
  CONF="$_cand"; break
done
for _cand in "${CLAUDE_PLUGIN_ROOT:-}/SKILL.md" "$ROOT/SKILL.md" "${_sm_self}/../../SKILL.md" "${_sm_self}/../SKILL.md"; do
  [[ -z "$_cand" || ! -f "$_cand" ]] && continue
  SKILL_MD="$_cand"; break
done

# spec-first 判定库（R101 单一事实源；目标技能布局 scripts/ 同目录，生成器仓布局 assets/hooks/ 上级）。
# 缺库=spec 判定面降级放行（与「解析失败一律放行」同一失败哲学）；生成物成套分发，配对由 test-r101 锁。
SPF_LIB=""
for _cand in "${_sm_self}/spec-first-lib.sh" "${_sm_self}/../spec-first-lib.sh"; do
  [[ -f "$_cand" ]] && { SPF_LIB="$_cand"; break; }
done
[[ -n "$SPF_LIB" ]] && . "$SPF_LIB"

# 白名单读取（GATE_ENFORCE_DENY=check_security,check_sensitive 或 all）
# 对齐同文件 SPEC_REQUIRED 解析范式（cut 剥注释 → tr 剥空白 → sed 剥引号）。
# 原缺陷：该行带 # MEASURE 行尾注释，sed 剥不到中间引号、注释全量混入 DENY_LIST；
# 首版修复只加 cut 不调 tr 顺序仍残留引号（态 30 判别器抓到）——tr 必须在 sed 前，
# 否则剥注释后的行尾空格让 s/"$// 锚不上。
DENY_LIST=""
[[ -f "$CONF" ]] && DENY_LIST=$(grep -m1 '^GATE_ENFORCE_DENY=' "$CONF" 2>/dev/null | cut -d'#' -f1 | tr -d '[:space:]' | sed 's/^GATE_ENFORCE_DENY=//;s/^"//;s/"$//' || printf '')

_deny_log() { # $1=tool $2=target $3=gates
  local _dl_dir="$ROOT/.swarm-yuan"
  local _dl_file="${_dl_dir}/gate-deny.jsonl"
  mkdir -p "$_dl_dir" 2>/dev/null || return 0
  local _dl_ts
  _dl_ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # JSON 最小转义（bash 3.2 + UTF-8 中文安全：先剥离换行/回车/反斜杠/双引号）
  local _e1 _e2 _e3
  _e1=$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
  _e2=$(printf '%s' "$2" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
  _e3=$(printf '%s' "$3" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
  printf '{"ts":"%s","tool":"%s","target":"%s","gates":"%s"}\n' "$_dl_ts" "$_e1" "$_e2" "$_e3" >> "$_dl_file" 2>/dev/null || true
}

# 全量决策审计（invoked/result 配对语义的 bash 单行适配）
# $1=handler $2=tool $3=target $4=decision(deny|pass) $5=reason $6=gates
_audit_log() {
  local _al_dir="$ROOT/.swarm-yuan"
  local _al_file="${_al_dir}/gate-audit.jsonl"
  mkdir -p "$_al_dir" 2>/dev/null || return 0
  local _al_ts
  _al_ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # 目标有界截断 500 字符（dsh stderrSummary 同款）+ JSON 最小转义
  local _a2 _a3 _a6
  _a2=$(printf '%s' "$2" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
  _a3=$(printf '%s' "$3" | cut -c1-500 | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
  _a6=$(printf '%s' "$6" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')
  printf '{"ts":"%s","handler":"%s","tool":"%s","decision":"%s","reason":"%s","target":"%s","gates":"%s"}\n' \
    "$_al_ts" "$1" "$_a2" "$4" "$5" "$_a3" "$_a6" >> "$_al_file" 2>/dev/null || true
}

# ===== rules.d 三值求值（无条件面）——PreToolUse Bash 先过规则数据 =====
# forbid 是无条件的：不依赖 GATE_ENFORCE_DENY/GATE_ENFORCE_DENY_BASH 开关、不依赖门禁红 flag——
# 随生成物分发的 rules.d/*.rules 即"规则治理命令"的常态面（npm publish/rm -rf/git reset --hard/sudo
# 默认硬拦，deny 消息带替代方案）。allow → 审计 pass 放行；prompt（3）/无规则 → 落回下方白名单（opt-in 面）。
# 此前求值嵌在 Bash 分支内，被 GATE_ENFORCE_DENY 空（:160 区域）与
# GATE_ENFORCE_DENY_BASH 空两道 early-exit 挡死——默认配置下 rules.d 永不生效，与"无条件"注释矛盾。
if [[ "$EVENT" == "PreToolUse" && "$TOOL" == "Bash" && -n "$CMD" ]]; then
  _gr="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/gate-rules.sh"
  _rd="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)/rules.d"
  if [[ -f "$_gr" && -d "$_rd" ]]; then
    _gr_out=$(bash "$_gr" "$_rd" "$CMD" 2>&1); _gr_rc=$?
    case "$_gr_rc" in
      2)  # forbid → 直接 deny（即使 flag 不存在——forbid 规则是无条件条件，不依赖门禁红）
          _gates=$(cat "$FLAG" 2>/dev/null || printf 'rules.d')
          _audit_log "fail-gate-hook:bash" "Bash" "$CMD" "deny" "rules-forbid" "$_gates"
          _deny_log "Bash" "$CMD" "rules.d:forbid"
          _forbid_msg=$(printf '%s\n' "$_gr_out" | grep '^FORBID' | head -1)
          cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"swarm-yuan rules.d: ${_forbid_msg}","additionalContext":"swarm-yuan fail-gate: DENY Bash（rules.d 三值判定 forbid）——${_forbid_msg}。规则数据在 rules.d/*.rules（可审计）；解除方式：①按替代方案改道；②审批沉淀：bash scripts/gate-rules.sh rules.d --persist \"<pattern>\" allow \"<理由>\" --goal <goal_id>（写 approved.rules + decisions.jsonl 落痕）。deny 已落盘 gate-audit.jsonl。"}}
EOF
          exit 0 ;;
      0)  # allow → 放行（只读白名单命中，跳过下方旧白名单逻辑）
          _audit_log "fail-gate-hook:bash" "Bash" "$CMD" "pass" "rules-allow" "$(cat "$FLAG" 2>/dev/null || printf 'configured')"
          exit 0 ;;
      *)  : ;;  # prompt（3）或无规则（3）→ 落回旧白名单逻辑（prompt 语义=flag 红时拦）
    esac
  fi
fi

# 白名单空（默认）= flag 捕获面关闭——但不挡 spec-first 无条件面（
# SPEC_REQUIRED 与 rules.d 同级，不依赖 GATE_ENFORCE_DENY 开关）。DENY_LIST 空的判定下沉到
# PreToolUse flag 分支内。

# ===== PostToolUse Bash：precheck 退出码 → flag 记/清 =====
if [[ "$EVENT" == "PostToolUse" && "$TOOL" == "Bash" ]]; then
  # 只对 precheck.sh 调用感兴趣
  case "$CMD" in
    *precheck.sh*)
      mkdir -p "$FLAG_DIR" 2>/dev/null || true
      if [[ "${EXIT_CODE:-0}" != "0" && -n "$EXIT_CODE" ]]; then
        # 记录白名单门禁名（逗号分隔原样落盘，deny 时原样展示）
        printf '%s' "$DENY_LIST" > "$FLAG" 2>/dev/null || true
      else
        rm -f "$FLAG" 2>/dev/null || true
      fi
      ;;
  esac
  exit 0
fi

# ===== PreToolUse Write/Edit/MultiEdit/Bash：flag 存在 → deny =====
# 拦截面扩展：
#   ① 拦截范围加 Bash（仅拦"推进态"命令白名单：git push/commit/merge/release/deploy/install 等；
#      不拦只读命令 git status/log/diff/ls/cat/grep，也不拦测试命令 npm test/build/lint——fail 后
#      需要重跑这些诊断，拦了反而死锁）。
#   ② deny 事件落盘 .swarm-yuan/gate-deny.jsonl（时间/工具/目标/白名单门禁），供 verifier 审计
#      和用户复盘——这是 deny 动作的"留痕"（G1 决策治理对齐 ISO/IEC 42001）。
#   ③ Bash 拦截需独立开关 GATE_ENFORCE_DENY_BASH（默认空=不拦 Bash，避免误伤）。
# （_deny_log/_audit_log 定义与 rules.d 无条件求值已前移至 DENY_LIST 检查之前——
#   FORBID 是无条件面，不应被白名单开关挡死。）
if [[ "$EVENT" == "PreToolUse" ]]; then
  case "$TOOL" in
    Write|Edit|MultiEdit)
      # draft 期自动关闭（骨架期门禁红是常态）——静默面=白名单/flag 捕获面 + spec 前置门；
      # 不含 rules.d 无条件面：forbid 是无条件的（A6 既定意图），骨架期 rm -rf/sudo 照样硬拦。
      # 位置：必须在 spec-first 之前——draft 骨架期无 spec 是常态，spec 门若先判会把骨架期
      # 全部写操作 deny 死锁（实证：顺序反了 draft 态写 src/ 被误拦）。
      if [[ -n "$SKILL_MD" ]] && grep -q '^status: draft' "$SKILL_MD" 2>/dev/null; then
        exit 0
      fi
      # SPEC_REQUIRED 流程前置门（无条件面）：
      # 写源码区（WRITABLE_DIRS 内）但当前无已批准 spec → deny。spec 缺失跳流程是
      # "流程性约束缺失"反馈的根因——workflow.md 是文档自觉，这里是机器强制。
      # draft 骨架期放行（骨架期无 spec 是常态）；conf 缺失/WRITABLE_DIRS 未配 → 放行（不阻碍诊断）。
      # 判定自 R101 收敛到 spec-first-lib.sh（spf_*，与 L2 pre-commit/L3 门禁/L4 状态机同源）；
      # 解析链历史坑（自引用默认死代码/行尾注释括号）的注记随迁该库，此处不重复。
      _spec_req=""
      [[ -n "$SPF_LIB" && -f "$CONF" ]] && _spec_req=$(spf_conf_val "$CONF" SPEC_REQUIRED)
      if [[ "$_spec_req" == "1" ]]; then
        _wd=""
        [[ -n "$SPF_LIB" ]] && _wd=$(spf_writable_dirs "$CONF")
        _norm_p=$(printf '%s' "$FILE_PATH" | tr '\\' '/')
        if spf_path_in_dirs "$_norm_p" "${PROJECT_DIR:-}" $_wd; then
          _spec_glob=""
          [[ -n "$SPF_LIB" ]] && _spec_glob=$(spf_conf_val "$CONF" SPEC_GLOB)
          _spec_glob="${_spec_glob:-docs/specs/*.md}"
          _spec_found=""
          [[ -n "$SPF_LIB" ]] && _spec_found=$(spf_find_approved_spec "$ROOT" "$_spec_glob")
          if [[ -z "$_spec_found" ]]; then
            _audit_log "fail-gate-hook:edit" "$TOOL" "$FILE_PATH" "deny" "spec-required" "spec-first"
            _deny_log "$TOOL" "$FILE_PATH" "spec-required"
            cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"swarm-yuan spec-first: 写源码区 ${_norm_p} 但无已批准 spec（${_spec_glob} 无含「## 决策记录」段的非占位文件）——流程强制：先 spec（需求/决策/约束/测试/回滚）再编码。","additionalContext":"swarm-yuan spec-first: DENY — 流程前置门生效（SPEC_REQUIRED=1）。解除方式：1) 用 /spec 命令生成本任务 spec 并填入决策记录；2) 若是排版/测试/文档改动不在 WRITABLE_DIRS 内则不拦；3) 关闭：conf 置 SPEC_REQUIRED=0（UserChallenge 类决策，须落痕）。deny 已落盘 gate-audit.jsonl。"}}
EOF
            exit 0
          fi
        fi
      fi
      # 白名单空 = flag 捕获面关闭（spec-first 已在上方判定，不受影响）
      [[ -z "$DENY_LIST" ]] && exit 0
      # flag 不存在 → 放行（休眠态不写审计：总体=门禁红期间的决策点）
      [[ ! -f "$FLAG" ]] && exit 0
      # 文件目标豁免：修 .swarm-yuan/ conf 或 precheck.sh 本身不拦（修配置通道）
      _norm=$(printf '%s' "$FILE_PATH" | tr '\\' '/')
      case "$_norm" in
        *.swarm-yuan/*|*precheck.sh|*precheck.conf|*precheck.arch.conf|*precheck.compliance.conf|*precheck.patch.conf)
          _audit_log "fail-gate-hook:edit" "$TOOL" "$FILE_PATH" "pass" "exempt-path" "$(cat "$FLAG" 2>/dev/null || printf 'configured')"
          exit 0
          ;;
      esac
      _gates=$(cat "$FLAG" 2>/dev/null || printf 'configured')
      [[ -z "$_gates" ]] && _gates="configured"
      _audit_log "fail-gate-hook:edit" "$TOOL" "$FILE_PATH" "deny" "gates-unresolved" "$_gates"
      _deny_log "$TOOL" "$FILE_PATH" "$_gates"
      cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"swarm-yuan fail-gate: 门禁 ${_gates} 上次运行 fail 且未修复——GATE_ENFORCE_DENY 白名单生效，先跑 bash scripts/precheck.sh 修复后再改文件。","additionalContext":"swarm-yuan fail-gate: DENY — precheck 捕获的 fail 未修复（白名单：${_gates}）。解除方式：1) 跑 bash scripts/precheck.sh --all（或对应门禁）修复至通过（flag 自动清除）；2) 若需放宽白名单，改 scripts/precheck.conf 的 GATE_ENFORCE_DENY（UserChallenge 类决策，须决策落痕）；3) 本门默认关闭，是你在 conf 里显式开启的。deny 事件已落盘 .swarm-yuan/gate-deny.jsonl（审计留痕）。"}}
EOF
      ;;
    Bash)
      # draft 期自动关闭（骨架期门禁红是常态）——Bash 捕获面静默（rules.d 无条件面已在上方前置）；
      if [[ -n "$SKILL_MD" ]] && grep -q '^status: draft' "$SKILL_MD" 2>/dev/null; then
        exit 0
      fi
      # Bash 拦截需独立开关 GATE_ENFORCE_DENY_BASH（默认空=不拦，避免误伤）
      # 白名单：git push/commit/merge/release/deploy/install/publish；不拦只读（status/log/diff/ls/cat/grep）与测试命令（npm test/build/lint）——fail 后需要重跑诊断。
      _bash_deny=""
      # tr 在 sed 前（对齐 SPEC_REQUIRED 范式），行尾注释不再混入白名单匹配
      [[ -f "$CONF" ]] && _bash_deny=$(grep -m1 '^GATE_ENFORCE_DENY_BASH=' "$CONF" 2>/dev/null | cut -d'#' -f1 | tr -d '[:space:]' | sed 's/^GATE_ENFORCE_DENY_BASH=//;s/^"//;s/"$//' || printf '')
      [[ -z "$_bash_deny" ]] && exit 0
      [[ ! -f "$FLAG" ]] && exit 0
      # 提取命令首个 token（git/npm/bash/sh 等）
      _cmd_first=$(printf '%s' "$CMD" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')
      _cmd_second=$(printf '%s' "$CMD" | awk '{print $2}' | tr '[:upper:]' '[:lower:]')
      # 拼成 cmd_first:cmd_second 形式做白名单匹配（git:push / npm:publish / bash:deploy.sh 等）
      _cmd_key="${_cmd_first}:${_cmd_second}"
      # rules.d 三值求值已前移至 DENY_LIST 检查之前（无条件面：forbid 不依赖本开关）；
      # 走到这里的是 prompt/无规则命中——落回旧白名单逻辑（prompt 语义=flag 红时拦）。
      # 白名单匹配（逗号分隔，支持三种形式：cmd_first 兜底 / cmd_first:cmd_second 精确 / cmd_second 单独）
      # 例：白名单 "push" 命中 "git push ..."（cmd_second）；白名单 "git" 命中所有 git 子命令（cmd_first 兜底）；
      #     白名单 "git:push" 精确命中。
      _match=0
      IFS=',' read -ra _deny_arr <<< "$_bash_deny"
      for _d in "${_deny_arr[@]+"${_deny_arr[@]}"}"; do
        [[ -z "$_d" ]] && continue
        if [[ "$_cmd_key" == "$_d" || "$_cmd_first" == "$_d" || "$_cmd_second" == "$_d" ]]; then
          _match=1; break
        fi
      done
      [[ "$_match" -eq 0 ]] && { _audit_log "fail-gate-hook:bash" "Bash" "$CMD" "pass" "bash-not-whitelisted" "$(cat "$FLAG" 2>/dev/null || printf 'configured')"; exit 0; }
      _gates=$(cat "$FLAG" 2>/dev/null || printf 'configured')
      [[ -z "$_gates" ]] && _gates="configured"
      _audit_log "fail-gate-hook:bash" "Bash" "$CMD" "deny" "gates-unresolved" "$_gates"
      _deny_log "Bash" "$CMD" "$_gates"
      cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"swarm-yuan fail-gate: 门禁 ${_gates} 上次运行 fail 且未修复——GATE_ENFORCE_DENY_BASH 拦截推进态命令（${_cmd_key}）。","additionalContext":"swarm-yuan fail-gate: DENY Bash — precheck 捕获的 fail 未修复（白名单：${_gates}），推进态命令 ${_cmd_key} 被 GATE_ENFORCE_DENY_BASH 拦截。解除方式：1) 跑 bash scripts/precheck.sh --all（或对应门禁）修复至通过；2) 若为误伤（如临时调研命令），改 scripts/precheck.conf 的 GATE_ENFORCE_DENY_BASH 白名单（UserChallenge 类决策）。deny 事件已落盘 .swarm-yuan/gate-deny.jsonl。"}}
EOF
      ;;
  esac
fi

exit 0

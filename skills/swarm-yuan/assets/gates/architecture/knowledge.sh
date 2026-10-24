# gate: knowledge
# domain: architecture / enforce: advisory / tier: arch
check_knowledge() {
  echo "=== 项目知识复用检查（AGENTS.md/CLAUDE.md/记忆 → 生成 skill 是否复用）==="
  local found=0

  # ---- 0. 可检索记忆后端逐个探（memory-backends.sh 适配层派发，不绑定具体插件）----
  # 后端未定义 search 契约函数（如 local 文件后端）或不可用时自然跳过；
  # 有一个后端有历史记录即 pass，已装但无记忆/报错则 warn 披露（首次生成属正常）。
  if command -v mem_backends_list >/dev/null 2>&1; then
    local _backend _rc
    for _backend in $(mem_backends_list); do
      # 仅可检索后端参与（未定义 mem_<id>_search 契约的后端——如 local 项目状态文件——不算记忆证据源）
      command -v "mem_${_backend}_search" >/dev/null 2>&1 || continue
      mem_detect "$_backend" || continue
      # set -e 下取退出码必须走 if 条件上下文（条件位挂起 -e，else 分支 $? 仍有效）
      if mem_search "$_backend" "project rules conventions" >/dev/null 2>&1; then
        _rc=0
      else
        _rc=$?
      fi
      trace_tool "mem:${_backend}" "search project rules conventions"
      if [[ $_rc -eq 0 ]]; then
        pass "记忆后端 ${_backend} 有历史记录（项目知识已积累）"
      elif [[ $_rc -eq 2 ]]; then
        warn "记忆后端 ${_backend} 已装但检索报错——首次生成或 worker 未运行，探查后写入项目特征摘要"
      else
        warn "记忆后端 ${_backend} 已装但无项目记忆——首次生成 skill，探查后写入项目特征摘要"
      fi
    done
  fi

  # ---- 1. 检查项目是否有知识文件 ----
  local has_agents=0 has_claude=0 has_memories=0
  [[ -f "$PROJECT_DIR/AGENTS.md" ]] && has_agents=1
  [[ -f "$PROJECT_DIR/CLAUDE.md" ]] && has_claude=1
  # 记忆痕迹探测：项目内通用目录 + 适配层各后端的 present（含插件数据目录，由后端自报）
  [[ -d "$PROJECT_DIR/.zcode/memories" || -d "$HOME/.zcode/cli/memories" || -d "$PROJECT_DIR/.claude" ]] && has_memories=1
  if command -v mem_present >/dev/null 2>&1; then
    local _pb
    for _pb in $(mem_backends_list); do
      if mem_present "$_pb"; then has_memories=1; break; fi
    done
  fi

  if [[ $has_agents -eq 0 && $has_claude -eq 0 && $has_memories -eq 0 ]]; then
    skip_if_unconfigured "项目无 AGENTS.md/CLAUDE.md/记忆文件，知识复用检查跳过"
    return
  fi

  # ---- 2. 检查生成的 SKILL.md 是否引用了知识来源 ----
  local skill_file
  # 同源兜底：候选末位加本技能自身 SKILL.md（技能根取 _CONF_DIR 绝对路径）——
  # 自定义 target-dir 生成时前三级（默认安装位/相对 cwd）在项目根 cwd 下全部失明。
  local _self_skill_md
  _self_skill_md="${_CONF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)}/SKILL.md"
  skill_file=$(_first_existing_file "$PROJECT_DIR/.claude/skills/*/SKILL.md" ".claude/skills/*/SKILL.md" "SKILL.md" "$_self_skill_md")
  if [[ -z "$skill_file" ]]; then
    skip_if_unconfigured "未找到生成的 SKILL.md，知识复用检查跳过"
    return
  fi

  local refs=0
  [[ $has_agents -eq 1 ]] && grep -qiE 'AGENTS\.md|见 AGENTS' "$skill_file" 2>/dev/null && refs=$((refs+1))
  [[ $has_claude -eq 1 ]] && grep -qiE 'CLAUDE\.md|见 CLAUDE' "$skill_file" 2>/dev/null && refs=$((refs+1))
  [[ $has_memories -eq 1 ]] && grep -qiE 'memories|记忆|claude-mem|\.zcode' "$skill_file" 2>/dev/null && refs=$((refs+1))

  local total=$((has_agents + has_claude + has_memories))
  if [[ $refs -ge $total ]]; then
    pass "项目知识复用完整（${refs}/${total} 个知识来源被引用）"
  elif [[ $refs -gt 0 ]]; then
    warn "项目知识部分复用（${refs}/${total} 个来源被引用）——建议在 SKILL.md 铁律段引用全部知识来源"
  else
    fail "项目有知识文件（AGENTS.md/CLAUDE.md/记忆）但生成的 SKILL.md 未引用——须读取项目知识并写入铁律段"
    found=1
  fi

  # ---- 3. 检查特征卡是否从知识文件提取了规则 ----
  # 检查 SKILL.md 的铁律段是否含"见 AGENTS.md"等引用（非写死规则值）
  if [[ $has_agents -eq 1 ]]; then
    # 读 AGENTS.md 的关键规则（可改范围/只读区/分支策略）
    local agents_rules; agents_rules=$(grep -iE '可改|只读|禁止|分支|feature|feat|fix' "$PROJECT_DIR/AGENTS.md" 2>/dev/null | head -5 || true)
    if [[ -n "$agents_rules" ]]; then
      # 检查 SKILL.md 是否引用了这些规则（而非写死值）
      if ! grep -qiE 'AGENTS\.md' "$skill_file" 2>/dev/null; then
        warn "AGENTS.md 含项目规则但 SKILL.md 未引用来源——须标注'见 AGENTS.md'而非写死规则值"
      fi
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "项目知识复用检查通过"
  fi
}

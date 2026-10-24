# gate: adr
# domain: architecture / enforce: warn / tier: arch
check_adr() {
  echo "=== 架构决策记录检查（TOGAF：决策可追溯 + 技术债登记）==="
  local found=0

  # ---- 1. ADR 目录必须存在 ----
  if [[ -z "$ADR_DIR" ]]; then
    warn "未配置 ADR_DIR，跳过架构决策检查（生成目标技能时设为 docs/adr 或 adr）"
    return
  fi
  if [[ ! -d "$ADR_DIR" ]]; then
    fail "ADR 目录不存在：${ADR_DIR}（TOGAF 要求架构决策可追溯，须建立 ADR 目录）"
    found=1
    # 后续检查依赖目录存在，直接返回
    if [[ $found -eq 0 ]]; then pass "架构决策记录检查通过"; fi
    return
  fi

  # ---- 2. ADR 文件计数（至少应有 1 个 ADR）----
  local adr_count
  adr_count=$(find "$ADR_DIR" -type f \( -name '*.md' -o -name '*.adoc' \) 2>/dev/null | wc -l | xargs || true)
  if [[ "$adr_count" -eq 0 ]]; then
    warn "${ADR_DIR} 目录无 ADR 文件（在 ADR_DIR 新建 0001-技术栈选择.md + 0002-关键架构决策.md（格式：# ADR-NNNN: 标题 / 状态 / 上下文 / 决策 / 理由））"
  fi

  # ---- 3. 本次引入的新依赖/新框架必须有对应 ADR ----
  # 检测 git diff 中新增的 import 语句（package.json/requirements.txt/go.mod/pyproject.toml）
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local base; base=$(_git_base)
    local diff_imports
    diff_imports=$(git diff "$base"...HEAD -- '*.ts' '*.js' '*.py' '*.go' 2>/dev/null \
      | grep -E '^\+.*(import|from)\s' \
      | grep -oE "['\"][^'\"./][^'\"]*['\"]" | sed "s/['\"]//g" | sort -u || true)
    # 过滤出"非相对路径"的第三方包（形如 lodash、@scope/pkg）
    local third_party=""
    while IFS= read -r pkg; do
      [[ -z "$pkg" ]] && continue
      # 相对路径（./ ../）跳过；node: 内置跳过
      case "$pkg" in
        ./*|../*|node:*) continue ;;
        @*/*|*) ;;
      esac
      third_party="${third_party}${third_party:+$'\n'}$pkg"
    done <<< "$diff_imports"

    if [[ -n "$third_party" ]]; then
      # 在所有 ADR 文件中搜索这些包名
      local adr_all; adr_all=$(cat "$ADR_DIR"/*.md "$ADR_DIR"/*.adoc 2>/dev/null || true)
      local unexplained=""
      while IFS= read -r pkg; do
        [[ -z "$pkg" ]] && continue
        if ! echo "$adr_all" | grep -qF -- "$pkg"; then
          unexplained="${unexplained}${unexplained:+$'\n'}$pkg"
        fi
      done <<< "$third_party"
      if [[ -n "$unexplained" ]]; then
        warn "本次新增以下第三方依赖未在 ADR 中说明选型理由（TOGAF 要求技术选型有决策记录）："
        echo "$unexplained" | sed 's/^/    - /'
        echo "  建议：在 ${ADR_DIR}/ 新增 ADR，记录为何选这些包（替代方案/权衡/影响）"
      fi
    fi
  fi

  # ---- 4. 技术债登记检查 ----
  if [[ -n "$TECH_DEBT_FILE" ]]; then
    if [[ ! -f "$TECH_DEBT_FILE" ]]; then
      warn "技术债登记文件不存在：${TECH_DEBT_FILE}（绕过架构决策的临时代码应在技术债登记，便于追踪）"
    else
      local td_count; td_count=$(grep -cE '^\s*[-*]\s' "$TECH_DEBT_FILE" 2>/dev/null || true)
      # 检测代码中是否有 TODO/FIXME/HACK 但未在技术债登记
      local code_todos
      code_todos=$(_scan_src 'TODO|FIXME|HACK|XXX' 'ts,js,py,go' 'node_modules\|\.patch' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" | wc -l | xargs || true)
      if [[ "$code_todos" -gt 0 ]]; then
        warn "代码中有 ${code_todos} 处 TODO/FIXME/HACK——在 TECH_DEBT_FILE 追加条目：格式 '- [ ] 文件:行号 TODO内容 计划修复时间'（当前技术债条目 ${td_count} 个）"
      fi
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "架构决策记录检查通过（${adr_count} 个 ADR）"
  fi
}

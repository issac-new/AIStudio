# gate: impact
# domain: architecture / enforce: warn / tier: arch
check_impact() {
  echo "=== 变更影响分析检查（TOGAF：变更须含影响范围段 + 消费方清单）==="
  local found=0

  # ---- 0. 基线短路 ----
  # 刚激活、无待审变更的存量项目基线跑 --all-full 即红"未找到 spec 文档"——TOGAF 语义
  # "变更须做影响分析"前提是有变更。与 check_scope 同口径：HEAD 在基点且工作区 clean
  # （无待审变更）→ 放行；有变更（工作区脏或领先基点）→ 维持原 fail 语义。
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local _imp_base _imp_dirty _imp_ahead
    _imp_base=$(_git_base)
    # 技能/账本为工具链自有写入面（scope 豁免同口径）——create 未提交时不算待审变更；
    # porcelain 对未跟踪目录整目录显示（?? .claude/），故模式须匹配目录形态本身。
    # || true 与 check_scope 同口径：porcelain 为空或全被豁免滤掉时 grep 退出 1，
    # set -euo pipefail 下裸赋值会杀整个 precheck（v2.13.2 实证：干净基线一跑 --impact 即崩）
    _imp_dirty=$(git status --porcelain 2>/dev/null | grep -vE '(\.claude|\.codex|\.swarm-yuan)(/|$)' | head -1 || true)
    _imp_ahead=$(git rev-list --count "${_imp_base}"..HEAD 2>/dev/null || echo 1)
    if [[ -z "$_imp_dirty" && "${_imp_ahead:-1}" -eq 0 ]]; then
      pass "基线无待审变更（HEAD 在 ${_imp_base} 且工作区 clean）——影响分析待执勤变更时生效"
      return
    fi
  fi

  # ---- 1. 找 spec 文件（影响范围段应在此）----
  # 发现逻辑统一走 _find_spec_file（SPEC_GLOB 优先；显式 IMPACT_SPEC_FILE 仍最高）。
  local spec_file="${IMPACT_SPEC_FILE:-$SPEC_FILE}"
  [[ -z "$spec_file" ]] && spec_file=$(_find_spec_file '影响范围|impact|消费方|stakeholder')

  # ---- 2. spec 必须含"影响范围"段 ----
  if [[ -z "$spec_file" ]]; then
    fail "未找到 spec 文档——TOGAF 要求每次架构变更先做影响分析（spec 须含'影响范围'段，列出受影响消费方）"
    found=1
  else
    if ! grep -qE '影响范围|impact|消费方|stakeholder' "$spec_file" 2>/dev/null; then
      fail "${spec_file} 缺少'影响范围'段（TOGAF 要求架构变更声明影响范围：哪些系统/模块/消费方受影响、迁移路径）"
      found=1
    fi
  fi

  # ---- 3. 变更影响分析：优先用 gitnexus impact/detect_changes，降级 grep ----
  # 消费前确保已构建（gitnexus_ensure_indexed/graphify_ensure_built），未构建则触发构建提示/降级
  # graphify god-nodes 原挂在 gitnexus 分支的 elif 上——
  # 两工具同装时 graphify 永不执行，与 SKILL.md「代码图谱平权选型可并用」声称不符。两者检测面
  # 不同（gitnexus=受影响进程 / graphify=God Node 枢纽），正交应并行；grep 降级仍兜底在最后。
  if has_gitnexus && gitnexus_ensure_indexed; then
    # gitnexus detect_changes: git diff → 受影响进程（最准确）
    trace_tool "gitnexus" "detect_changes"
    local gn_impact; gn_impact=$(gitnexus detect_changes 2>/dev/null | head -30 || true)
    if [[ -n "$gn_impact" ]]; then
      local affected_count; affected_count=$(echo "$gn_impact" | grep -cE '^\s+\S' || true)
      if [[ "$affected_count" -gt 5 ]]; then
        warn "gitnexus 检测到 ${affected_count} 个受影响进程——变更影响范围较大，确认 spec 已列出受影响方"
      fi
      echo "  gitnexus detect_changes 输出（前 10 行）："
      echo "$gn_impact" | head -10 | sed 's/^/    /'
    fi
  fi
  if has_graphify && graphify_ensure_built; then
    # graphify God Nodes 变更影响检测（God Nodes 是变更风险放大器）
    # C4 修复：graphify v0.9.22+ 的 god-nodes 是顶层子命令（graphify god-nodes），非 graphify explain god-nodes。
    trace_tool "graphify" "god-nodes"
    local gf_report; gf_report=$(graphify god-nodes 2>/dev/null | head -50 || true)
    if echo "$gf_report" | grep -qiE 'god.node|hub|surprising'; then
      local god_count; god_count=$(echo "$gf_report" | grep -icE 'god.node|hub' || true)
      if [[ "$god_count" -gt 0 ]]; then
        warn "graphify 检出 ${god_count} 个 God Node（高扇入枢纽节点）——变更此类节点影响范围放大，确认 spec 已评估"
        echo "$gf_report" | grep -iE 'god.node|hub|surprising' | head -5 | sed 's/^/    /'
      fi
    fi
  fi
  if ! ( ( has_gitnexus && gitnexus_ensure_indexed ) || ( has_graphify && graphify_ensure_built ) ) \
     && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    # 降级：git diff + grep 反查消费方
    local changed; changed=$(_git_changed_files)
    if [[ -n "$changed" ]]; then
      local cf
      while IFS= read -r cf; do
        [[ -z "$cf" ]] && continue
        local in_writable=0 wd
        for wd in "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}"; do
          case "$cf" in
            "$wd"*) in_writable=1; break ;;
          esac
        done
        [[ $in_writable -eq 0 ]] && continue
        local mod; mod=$(basename "$cf")
        mod="${mod%.*}"
        [[ -z "$mod" ]] && continue
        local consumers
        consumers=$(grep -rlwF -- "$mod" "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" \
          --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.vue' 2>/dev/null \
          | grep -v "^${cf}$" || true)
        if [[ -n "$consumers" ]]; then
          local ccount; ccount=$(echo "$consumers" | wc -l | xargs || true)
          if [[ $ccount -gt 3 ]]; then
            warn "${cf} 有 ${ccount} 个消费方引用——变更影响范围较大，确认 spec 已列出这些消费方并评估回归"
          fi
        fi
      done <<< "$changed"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "变更影响分析检查通过"
  fi
}

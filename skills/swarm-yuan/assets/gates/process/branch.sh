# gate: branch
# domain: process / enforce: strict / tier: core
# 域源正本（运行态由 gates-strict.sh 扁平承载，两处须同步修改）。
# 语义（2026-11-12 根治 main 检出恒红误报）：挡的是「在保护分支上进行实质开发」，
# 不是「检出恰在保护分支」。本仓工作流（AGENTS.md 规则 3）：worktree/feature 分支开发 →
# main 合并（--no-ff）→ chore/docs 类直提——主检出常态停在 main 跑 precheck 属合法形态。
# 放行三态：merge 进行中（MERGE_HEAD 在）/ 工作区零变更 / 变更全部命中
# PROTECTED_BRANCH_ALLOW 白名单（conf，空格分隔 glob；`dir/**` 前缀匹配整棵子树）。
# 未配置白名单=保护分支上任何变更都拦（merge 态与零变更仍放行——零变更放行正是
# 「主检出停在 main 跑 precheck」恒红误报的修复点，不属放松），既有安装不静默放宽。
_branch_change_allowed() {  # → rc 0=放行（merge/零变更/全白名单） 1=有实质开发改动
  local _f _pat _hit
  git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && return 0
  local _changed=""
  _changed="$(_git_changed_files 2>/dev/null || true)"
  [[ -z "$_changed" ]] && return 0
  [[ -z "${PROTECTED_BRANCH_ALLOW:-}" ]] && return 1
  # read -a 拆分白名单：裸 ${VAR} 迭代会做路径名展开——`docs/**` 恰有匹配文件时被展开成
  # 文件清单，`dir/**` 前缀语义静默失效（compliant-on-main-docs fixture 实抓）。
  local _pats=()
  read -r -a _pats <<< "${PROTECTED_BRANCH_ALLOW}"
  while IFS= read -r _f; do
    [[ -z "$_f" ]] && continue
    _hit=0
    for _pat in "${_pats[@]}"; do
      if [[ "$_pat" == */** ]]; then
        [[ "$_f" == "${_pat%/\*\*}"/* ]] && { _hit=1; break; }
      else
        [[ "$_f" == "$_pat" ]] && { _hit=1; break; }
      fi
    done
    [[ "$_hit" -eq 1 ]] || return 1
  done <<< "$_changed"
  return 0
}
check_branch() {
  echo "=== 分支检查 ==="
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    skip_if_unconfigured "非 git 仓库，分支检查跳过"
    return
  fi
  local branch
  branch=$(git branch --show-current 2>/dev/null || echo "")
  if [[ -z "$branch" ]]; then
    skip_if_unconfigured "无法获取当前分支（detached HEAD？），分支检查跳过"
    return
  fi
  local protected=""
  for pb in ${PROTECTED_BRANCHES[@]+"${PROTECTED_BRANCHES[@]}"}; do
    [[ "$branch" == "$pb" ]] && protected="$pb"
  done
  if [[ -n "$protected" ]]; then
    if _branch_change_allowed; then
      pass "保护分支 ${protected}：merge 态/零变更/仅白名单改动——实质开发须走 feature 分支"
    else
      fail "保护分支 ${protected} 上有实质开发改动——worktree/feature 分支开发，main 仅合并与白名单类（${PROTECTED_BRANCH_ALLOW:-未配置=全拦}）直提"
    fi
    return
  fi
  if [[ "$branch" =~ $BRANCH_REGEX ]]; then
    pass "分支规范: ${branch}"
  elif [[ "$branch" == "main" || "$branch" == "master" ]]; then
    fail "当前在 ${branch}（未列入 PROTECTED_BRANCHES），应切到 feature 分支开发"
  else
    fail "分支名不规范: $branch (应为 $BRANCH_REGEX)"
  fi
}

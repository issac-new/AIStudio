# gate: branch
# domain: process / enforce: strict / tier: core
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
  for pb in ${PROTECTED_BRANCHES[@]+"${PROTECTED_BRANCHES[@]}"}; do
    if [[ "$branch" == "$pb" ]]; then
      fail "绝不允许在保护分支 ${pb} 上开发"
      return
    fi
  done
  if [[ "$branch" =~ $BRANCH_REGEX ]]; then
    pass "分支规范: ${branch}"
  elif [[ "$branch" == "main" || "$branch" == "master" ]]; then
    fail "当前在 ${branch}，应切到 feature 分支开发"
  else
    fail "分支名不规范: $branch (应为 $BRANCH_REGEX)"
  fi
}

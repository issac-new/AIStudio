# gate: spec-first
# domain: process / enforce: warn / tier: core
check_spec_first() {
  echo "=== spec-first 流程门（L3 门禁时强拦，R101）==="
  local _sr="${SPEC_REQUIRED:-}"
  # R128：占位符剥离收敛到 spec-first-lib spf_strip_placeholder（precheck.sh source 本文件前
  # 已加载判定库）；command -v 守卫=库缺失时不剥不炸（set -e 安全，同下方 spf_* 缺失守卫）。
  command -v spf_strip_placeholder >/dev/null 2>&1 && _sr="$(spf_strip_placeholder "${_sr}")"
  if [[ "$_sr" != "1" ]]; then
    skip_if_unconfigured "SPEC_REQUIRED 未启用（conf 置 1 开启——与 fail-gate-hook/pre-commit/state-machine 同开关）"
    return 0
  fi
  if [[ -z "${WRITABLE_DIRS[*]:-}" ]]; then
    skip_if_unconfigured "WRITABLE_DIRS 未配置（spec-first 检测面为空）"
    return 0
  fi
  if ! command -v spf_find_approved_spec >/dev/null 2>&1; then
    skip_if_unconfigured "spec-first-lib.sh 缺失（判定面不可用，生成物成套分发被破坏）"
    return 0
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    skip_if_unconfigured "非 git 仓库（无变更检测面；L2 pre-commit 亦不适用）"
    return 0
  fi
  local _root="${PROJECT_DIR:-$(pwd)}"
  local _changed _hit=""
  _changed=$(_git_changed_files)
  # 与 check_scope 同款豁免过滤：工具链自有路径（.swarm-yuan/.claude/skills/.codex/skills）
  # 是门禁/hook/技能升级的合法写入面，不属"无 spec 写源码"语义——分层执法，不重复兜。
  _changed=$(printf '%s\n' "$_changed" | grep -vE '^(\.claude/skills/|\.codex/skills/|\.swarm-yuan/)' || true)
  local _f
  while IFS= read -r _f; do
    [[ -z "${_f:-}" ]] && continue
    # _git_changed_files 给仓库相对路径；spf_path_in_dirs 按绝对路径段匹配——补根再判（同 L2）
    if spf_path_in_dirs "${_root}/${_f}" "$_root" "${WRITABLE_DIRS[*]}"; then _hit="$_f"; break; fi
  done <<< "$_changed"
  if [[ -z "$_hit" ]]; then
    pass "spec-first: git 变更未触及可写源码区（WRITABLE_DIRS）"
    return 0
  fi
  local _sg="${SPEC_GLOB:-}"
  # R128：占位符剥离收敛（同上方 _sr——spec-first-lib spf_strip_placeholder，守卫式调用）。
  command -v spf_strip_placeholder >/dev/null 2>&1 && _sg="$(spf_strip_placeholder "${_sg}")"
  _sg="${_sg:-docs/specs/*.md}"
  local _approved=""
  # R109-D8 spec-变更关联（与 L2 同源 spec-first-lib）：特性分支上治理 spec 须在变更集
  # （staged ∪ 本分支 diff ∪ untracked——门禁时开发中态的 spec 已写未提交也认）；
  # 基分支保留存在性（主干直提交归分支门，合并后全量复查按宽口径放行）。
  # --no-verify 逃逸的提交在 L3 被抓：分支 diff 有源码无 spec 即 fail（比存在性更强）。
  # conf 路径=本文件同目录（生成器 assets/ 与目标技能 scripts/ 两布局皆然）——BASE_BRANCH 优先级来源。
  local _CONF_PATH
  _CONF_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/precheck.conf"
  [[ -f "$_CONF_PATH" ]] || _CONF_PATH=""
  if spf_on_base_branch "$_root" "$_CONF_PATH"; then
    _approved="$(spf_find_approved_spec "$_root" "$_sg")"
  else
    _approved="$(spf_find_governing_spec "$_root" "$_sg" 'staged branch untracked' "$_CONF_PATH")"
  fi
  if [[ -n "$_approved" ]]; then
    # DESIGN_SYNC 二段核验（与 L2 同判据 spec-first-lib；关联面=门禁态 staged∪branch∪untracked，worktree 视图）。
    if command -v spf_design_sync_check >/dev/null 2>&1; then
      local _ds_violation
      _ds_violation="$(spf_design_sync_check "$_root" "$_CONF_PATH" "$_approved" 'staged branch untracked' worktree)"
      if [[ -n "$_ds_violation" ]]; then
        fail "gate_design_sync: ${_ds_violation}——解除：把声明触及的设计文档修订并入本批，或改声明 DESIGN_SYNC: none 附理由（节点⑦审查背书）；开关 DESIGN_SYNC_REQUIRED/DESIGN_DOCS（precheck.conf）"
        return 0
      fi
    fi
    pass "spec-first: 可写区变更有变更集内已批准 spec（${_approved}）"
  else
    fail "gate_spec_first_missing: git 变更触及可写源码区（如 ${_hit}）但本变更集无已批准 spec（须含「## 决策记录」段且非占位；R109-D8 起=spec 须随本分支提交/staged/untracked 携带，历史 spec 不再放行）——先 spec 再编码；四层拦截同判据（L1 写时 hook/L2 提交时 pre-commit/本门/L4 状态机 build 准入）"
  fi
}

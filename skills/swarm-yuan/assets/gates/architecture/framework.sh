# gate: framework
# domain: architecture / enforce: warn / tier: arch
check_framework() {
  echo "▶ 框架适配门禁 (--framework)"
  if [[ ${#ACTIVE_FRAMEWORKS[@]} -eq 0 ]]; then
    # 漏配检测：探查信号明显但未配置 → warn
    local hit
    hit=$(find "${PROJECT_DIR:-.}" -name '*Mapper.xml' -not -path '*/node_modules/*' 2>/dev/null | head -1)
    [[ -n "$hit" ]] && warn "发现 $hit 但 ACTIVE_FRAMEWORKS 未配置——疑似漏配 mybatis"
    skip_if_unconfigured "ACTIVE_FRAMEWORKS 未配置"; return
  fi
  local fw fn _run_list=()
  # --framework <id>：仅跑指定框架（单框架隔离）；未指定 id 则全量串联（兼容原行为）
  if [[ -n "${FRAMEWORK_ID:-}" ]]; then
    local _found=0 _cand
    for _cand in ${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}; do
      [[ "$_cand" == "$FRAMEWORK_ID" ]] && _found=1 && break
    done
    if [[ $_found -eq 0 ]]; then
      fail "框架 '$FRAMEWORK_ID' 不在 ACTIVE_FRAMEWORKS（${ACTIVE_FRAMEWORKS[*]}）——无法单跑"
      return
    fi
    _run_list=("$FRAMEWORK_ID")
    echo "  （单框架模式：仅 ${FRAMEWORK_ID}）"
  else
    _run_list=(${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"})
  fi
  for fw in ${_run_list[@]+"${_run_list[@]}"}; do
    fn="_fw_$(echo "$fw" | tr '-' '_')_check"
    if declare -f "$fn" >/dev/null 2>&1; then
      # F2（dsh/cordis 吸收·满足判定显式化）：requires_conf 变量全空 → 门禁不生效。
      # requires_conf 声明随 --inject-frameworks 保留在标记区块头部，从本脚本自身 grep。
      # 对应论文 Def 25 的满足判定 σ ⊧ d 显式化——PENDING 态给可执行修复指令而非静默。
      local _rc_line _rc_vars _rv _all_empty=1
      _rc_line=$(grep -m1 "^# ruleset: ${fw}  requires_conf:" "$0" 2>/dev/null || true)
      if [[ -n "$_rc_line" ]]; then
        _rc_vars="${_rc_line##*requires_conf: }"
        for _rv in $_rc_vars; do
          # 未声明或空数组/空串都算未配置（启动兜底循环已把未声明的补成空数组）
          if eval "[[ -n \"\${${_rv}[@]:-}\" ]]"; then _all_empty=0; break; fi
        done
        [[ "$_all_empty" -eq 1 ]] && warn "框架 '$fw' 的 requires_conf 全空（${_rc_vars}）——门禁将不生效跳过。请在 precheck.arch.conf 配置，或跑 bash generate-skill.sh --inject-frameworks <skill_dir> 重同步占位"
      fi
      # || true 兜底：单个框架函数内若有命令返回非 0（如 grep 无匹配），
      # set -e 会触发整个 check_framework 退出，导致后续框架无法执行。
      # 框架函数内部的 pass/fail/warn 已自行记录检查结果，此处只须防止退出。
      "$fn" || true
    else
      fail "框架 '$fw' 已激活但无门禁实现（$fn 缺失）——须运行 generate-skill.sh --inject-frameworks"
    fi
  done
}

# gate: upstream-baseline
# domain: process / enforce: advisory / tier: explicit
check_upstream_baseline() {
  echo "=== 上游运行时基线 drift 核验（--upstream-baseline，advisory）==="
  local _sd="${SKILL_DIR:-${_CONF_DIR:-$(pwd)}/..}"
  local bl_file=""
  local _cand
  for _cand in "${PROJECT_DIR:-$(pwd)}/docs/upstream-baseline.md" "${_sd}/docs/upstream-baseline.md" "${_sd}/../docs/upstream-baseline.md"; do
    if [[ -f "$_cand" ]]; then bl_file="$_cand"; break; fi
  done
  if [[ -z "$bl_file" ]]; then
    # warn 而非 skip：目标技能侧无基线属正常，但维持显式披露口径（执行统计与历史 golden 一致）
    warn "基线文件不存在（docs/upstream-baseline.md 未找到——目标技能侧无基线属正常）"
    return 0
  fi
  local drifted=0 synced=0 watch=0 license_risk=0
  # 扫 baseline_status= 标记
  while IFS= read -r ln; do
    [[ -z "$ln" ]] && continue
    case "$ln" in
      *baseline_status=synced*) synced=$((synced+1));;
      *baseline_status=drifted*) drifted=$((drifted+1));;
      *baseline_status=watch*) watch=$((watch+1));;
      *baseline_status=license-risk*) license_risk=$((license_risk+1));;
    esac
  done < "$bl_file" 2>/dev/null
  if [[ $((synced + drifted + watch + license_risk)) -eq 0 ]]; then
    warn "基线文件 ${bl_file} 存在但无任何 baseline_status 标记——基线未登记或已迁移，请重核（不以零标记假通过）"
    return 0
  fi
  echo "  ⓘ 上游基线（${bl_file}）：synced=${synced} drifted=${drifted} watch=${watch} license-risk=${license_risk}"
  if [[ $drifted -gt 0 ]]; then
    warn "上游运行时 ${drifted} 项 drifted（引用基线落后上游最新版）——建议重核并更新基线"
    grep -nE 'baseline_status=drifted' "$bl_file" 2>/dev/null | head -5 | sed 's/^/    /'
  fi
  if [[ $license_risk -gt 0 ]]; then
    warn "上游运行时 ${license_risk} 项 license-risk（许可证冲突风险）——须法务评估"
    grep -nE 'baseline_status=license-risk' "$bl_file" 2>/dev/null | head -5 | sed 's/^/    /'
  fi
  if [[ $drifted -eq 0 && $license_risk -eq 0 ]]; then
    pass "上游运行时基线核验通过（${synced} synced / ${watch} watch，无 drift 无 license-risk）"
  fi
}

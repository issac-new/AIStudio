# gate: rtm
# domain: compliance / enforce: warn / tier: compliance
check_rtm() {
  echo "=== 需求追溯矩阵（RTM）检查（ISO/IEC/IEEE 29148：需求↔测试/矩阵追溯）==="
  [[ "${RTM_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "RTM_REQUIRED 未启用，RTM 检查跳过"; return; }
  local found=0
  local matrix="${RTM_MATRIX_FILE:-docs/rtm.md}"
  local matrix_ok=1
  if [[ ! -f "$matrix" ]]; then
    matrix_ok=0
    if [[ "${RTM_MATRIX_REQUIRED:-0}" == "1" ]]; then
      # fail-closed 锚点：声明矩阵强制而文件缺失即 fail 并返回（不再级联检查 REQ，防误报放大）
      fail "gate_rtm_matrix_missing: 追溯矩阵文件不存在：${matrix}（RTM_MATRIX_REQUIRED=1，fail-closed；可用 RTM_MATRIX_FILE 指定路径）"
      return
    fi
    warn "追溯矩阵文件不存在：${matrix}——降级为仅测试目录追溯（RTM_MATRIX_REQUIRED=1 可升级为 fail）"
  fi
  local spec="${SPEC_FILE:-}"
  if [[ -z "$spec" || ! -f "$spec" ]]; then
    warn "SPEC_FILE 未配置或不存在，无法提取 REQ- 编号——RTM 降级为仅矩阵存在性检查"
    pass "需求追溯矩阵检查通过（无需求源，0/0）"
    return
  fi
  # 从 spec 提取 REQ-[0-9]+ 编号集合（去重排序，与 --requirements 的 REQ- 机制同源）
  local reqs
  reqs=$(grep -oE 'REQ-[0-9]+' "$spec" 2>/dev/null | sort -u || true)
  if [[ -z "$reqs" ]]; then
    pass "需求追溯矩阵检查通过（spec 无 REQ- 编号条目，0/0）"
    return
  fi
  # 测试目录文件清单（TEST_DIR_PATTERNS 经 _fw_resolve_globs 解析，兼容 bash 3.2 无 globstar）
  local test_files=""
  if [[ ${#TEST_DIR_PATTERNS[@]} -gt 0 ]]; then
    test_files=$(_fw_resolve_globs ${TEST_DIR_PATTERNS[@]+"${TEST_DIR_PATTERNS[@]}"} || true)
  fi
  local total=0 traced=0 req hit _thits
  while IFS= read -r req; do
    [[ -z "$req" ]] && continue
    total=$((total+1))
    hit=0
    # 编号边界防护：REQ-001 不得误命中 REQ-0010（ERE 后置 [^0-9] 或行尾）
    if [[ $matrix_ok -eq 1 ]] && grep -qE "${req}([^0-9]|\$)" "$matrix" 2>/dev/null; then
      hit=1
    fi
    if [[ $hit -eq 0 && -n "$test_files" ]]; then
      _thits=$(printf '%s\n' "$test_files" | xargs grep -lE "${req}([^0-9]|\$)" 2>/dev/null || true)
      [[ -n "$_thits" ]] && hit=1
    fi
    if [[ $hit -eq 1 ]]; then
      traced=$((traced+1))
    else
      fail "gate_rtm_untraced:${req}: 需求未追溯——测试目录与追溯矩阵（${matrix}）均无 ${req} 引用（29148 RTM）"
      found=1
    fi
  done <<< "$reqs"
  local pct=$((traced*100/total))
  echo "  ⓘ 追溯率：${pct}%（${traced}/${total}，矩阵：${matrix}）"
  [[ $found -eq 0 ]] && { pass "需求追溯矩阵检查通过（全部 ${total} 个 REQ 已追溯，追溯率 ${pct}%）"; return 0; }
}

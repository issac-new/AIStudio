# gate: test-evidence
# domain: compliance / enforce: strict / tier: compliance
check_test_evidence() {
  echo "=== 测试证据链检查（GB/T 15532-2008 测试规范 / GB/T 9386-2008 测试文档）==="
  [[ "${TEST_EVIDENCE_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "TEST_EVIDENCE_REQUIRED 未启用，测试证据链检查跳过"; return; }
  local dir="${TEST_EVIDENCE_DIR:-docs/test}"
  if [[ ! -d "$dir" ]]; then
    fail "gate_test_evidence_missing: 测试证据文档目录不存在：${dir}（GB/T 15532-2008 须含测试计划/测试说明/测试报告）"
    return
  fi
  local found=0
  # ① 三类测试文档存在性（测试计划/测试说明/测试报告）
  local _plan _spec_doc _report
  _plan=$(find "$dir" -maxdepth 2 -type f \( -iname '*测试计划*' -o -iname '*test*plan*' -o -iname '*plan*' \) 2>/dev/null | head -1)
  _spec_doc=$(find "$dir" -maxdepth 2 -type f \( -iname '*测试说明*' -o -iname '*测试用例*' -o -iname '*test*case*' -o -iname '*test*spec*' \) 2>/dev/null | head -1)
  _report=$(find "$dir" -maxdepth 2 -type f \( -iname '*测试报告*' -o -iname '*test*report*' \) 2>/dev/null | head -1)
  if [[ -z "$_plan" || -z "$_spec_doc" || -z "$_report" ]]; then
    local _miss=""
    [[ -z "$_plan" ]] && _miss="${_miss}测试计划 "
    [[ -z "$_spec_doc" ]] && _miss="${_miss}测试说明/用例 "
    [[ -z "$_report" ]] && _miss="${_miss}测试报告 "
    fail "gate_test_evidence_missing: 测试证据文档缺：${_miss}（GB/T 15532-2008 须含测试计划+测试说明+测试报告三类）"
    found=1
  fi
  # ② 测试报告含准出条件结论段
  if [[ -n "$_report" ]]; then
    if ! grep -qE '准出|验收结论|测试结论|pass.*criteria|exit.*criteria' "$_report" 2>/dev/null; then
      fail "gate_test_evidence_exit_missing: 测试报告缺准出条件结论段（${_report}）——GB/T 15532-2008 要求测试报告含验收准则与结论"
      found=1
    fi
  fi
  # ③ REQ- 编号勾稽（warn-only：测试文档中 REQ- 引用与 spec 抽样核对）
  local _spec="${SPEC_FILE:-}"
  if [[ -n "$_spec" && -f "$_spec" ]]; then
    local _reqs _req _hit
    _reqs=$(grep -oE 'REQ-[0-9]+' "$_spec" 2>/dev/null | sort -u || true)
    if [[ -n "$_reqs" ]]; then
      while IFS= read -r _req; do
        [[ -z "$_req" ]] && continue
        _hit=$(find "$dir" -type f -exec grep -lE "${_req}([^0-9]|\$)" {} \; 2>/dev/null | head -1 || true)
        [[ -z "$_hit" ]] && warn "测试文档未引用 ${_req}（测试证据链断链，建议补追溯）"
      done <<< "$_reqs"
    fi
  fi
  # ④ 零 TBD
  local _tbd
  _tbd=$(grep -rnE 'TBD|待定|待明确|待补充' "$dir" 2>/dev/null || true)
  if [[ -n "$_tbd" ]]; then
    fail "gate_test_evidence_tbd: 测试证据文档含待定项——测试结论必须完整：
$(printf '%s\n' "$_tbd" | head -5 | sed 's/^/    /')"
    found=1
  fi
  [[ $found -eq 0 ]] && { pass "测试证据链检查通过（计划+说明+报告齐备，含准出结论，零待定项）"; return 0; }
}

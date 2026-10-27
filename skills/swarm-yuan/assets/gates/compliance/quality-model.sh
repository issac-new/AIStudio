# gate: quality-model
# domain: compliance / enforce: strict / tier: compliance
check_quality_model() {
  echo "=== 质量特性剪裁核验（GB/T 25000.10-2016 八特性 + ISO/IEC 25010:2023 Safety 主动对齐）==="
  [[ "${QUALITY_MODEL_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "QUALITY_MODEL_REQUIRED 未启用，质量特性剪裁核验跳过"; return; }
  local spec="${SPEC_FILE:-}"
  if [[ -z "$spec" || ! -f "$spec" ]]; then
    fail "gate_quality_model_missing: SPEC_FILE 未配置或不存在——无法核验质量特性剪裁表（spec §22 须含八特性逐项适用/剪裁声明）"
    return
  fi
  local found=0
  # ① 质量特性剪裁表存在性（spec 中须含质量特性剪裁表标题或至少一个八特性字段）
  local _qm_section
  _qm_section=$(grep -nE '质量特性剪裁表|^#+.*质量特性|质量模型|quality.*model|功能适合性|性能效率' "$spec" 2>/dev/null | head -1 || true)
  if [[ -z "$_qm_section" ]]; then
    fail "gate_quality_model_missing: spec 未声明质量特性剪裁表——须含 GB/T 25000.10-2016 八特性（功能适合性/性能效率/兼容性/易用性/可靠性/安全性/维护性/可移植性）逐项适用/剪裁声明"
    found=1
  fi
  # ② 八特性逐项覆盖（缺项 fail，列明缺失特性以利修复）
  local _ch _miss=""
  for _ch in 功能适合性 性能效率 兼容性 易用性 可靠性 安全性 维护性 可移植性; do
    grep -qF "$_ch" "$spec" 2>/dev/null || _miss="${_miss}${_ch} "
  done
  if [[ -n "$_miss" ]]; then
    fail "gate_quality_model_incomplete: 质量特性剪裁表缺特性：${_miss}（GB/T 25000.10-2016 八特性须逐项声明适用/剪裁+理由）"
    found=1
  fi
  # ③ Safety 维度声明（ISO/IEC 25010:2023 新增；国标 25000.10-2016 暂无，主动对齐）
  if ! grep -qE 'Safety|无害性|人身安全' "$spec" 2>/dev/null; then
    fail "gate_quality_model_safety: spec 未声明 Safety（无害性）维度——ISO/IEC 25010:2023 新增该特性，国标 GB/T 25000.10-2016 暂无，须主动对齐声明（适用/不适用+理由）"
    found=1
  fi
  # ④ 零 TBD（质量特性剪裁表不得含待定项）
  local _tbd
  _tbd=$(grep -nE 'TBD|待定|待明确|待补充' "$spec" 2>/dev/null || true)
  if [[ -n "$_tbd" ]]; then
    fail "gate_quality_model_tbd: spec 含待定项（TBD/待定/待明确/待补充）——质量特性剪裁结论必须完整：
$(printf '%s\n' "$_tbd" | head -5 | sed 's/^/    /')"
    found=1
  fi
  [[ $found -eq 0 ]] && { pass "质量特性剪裁核验通过（八特性+Safety 齐备，零待定项）"; return 0; }
}

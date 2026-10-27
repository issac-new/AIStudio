# gate: pia
# domain: compliance / enforce: strict / tier: compliance
check_pia() {
  echo "=== 隐私影响评估（PIA）检查（个人信息保护法第55-56条 / GB/T 35273-2020）==="
  [[ "${PIA_REQUIRED:-0}" == "1" ]] || {
    if [[ -n "${PIA_EXEMPT_REASON:-}" ]]; then
      warn "PIA 检查已豁免（${PIA_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_pia_unconfigured: PIA_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（PIA_REQUIRED=1）或填写 PIA_EXEMPT_REASON 豁免理由（个保法第55条：处理敏感个人信息须事前进行个人信息保护影响评估）"
    fi
    return
  }
  local dir="${PIA_DOCS_DIR:-docs/privacy}"
  local found=0
  # PIA 豁免登记（5 字段：对象|规则|理由|审批人|日期；空理由视为无效豁免 → fail）
  local _pia_exempt=""
  if [[ ${#PIA_EXEMPTIONS[@]} -gt 0 ]]; then
    local _pex _pex_id _pex_reason
    for _pex in "${PIA_EXEMPTIONS[@]}"; do
      _pex_reason=$(printf '%s\n' "$_pex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3}')
      if [[ -z "$_pex_reason" ]]; then
        fail "gate_pia_exemption_invalid: PIA 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${_pex}"
        return
      fi
      _pex_id=$(printf '%s\n' "$_pex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      _pia_exempt="${_pia_exempt}${_pex_id} "
    done
  fi
  _pia_exempted() { printf '%s\n' "$_pia_exempt" | grep -qF "$1"; }
  if [[ ! -d "$dir" ]]; then
    if _pia_exempted gate_pia_doc_missing; then
      warn "gate_pia_doc_missing: PIA 文档目录不存在（已豁免留痕）"
      return
    fi
    fail "gate_pia_doc_missing: PIA 文档目录不存在：${dir}（PIA_REQUIRED=1，fail-closed；个保法第55条：处理敏感个人信息等情形须事前进行个人信息保护影响评估）"
    return
  fi
  # ① PIA 评估文档存在性
  local _pia_doc
  _pia_doc=$(find "$dir" -maxdepth 2 -type f \( -iname '*pia*' -o -name '*隐私影响评估*' -o -name '*影响评估*' \) 2>/dev/null | head -1)
  if [[ -z "$_pia_doc" ]]; then
    if _pia_exempted gate_pia_doc_missing; then
      warn "gate_pia_doc_missing: PIA 评估文档不存在（已豁免留痕）"
    else
      fail "gate_pia_doc_missing: PIA 评估文档不存在（${dir} 下未见 *pia*/ *隐私影响评估* 文件；个保法第55-56条）"
      found=1
    fi
  fi
  # ② 个人信息处理活动清单存在性
  local _inv
  _inv=$(find "$dir" -maxdepth 2 -type f \( -name '*清单*' -o -iname '*inventory*' -o -iname '*register*' -o -iname '*activities*' \) 2>/dev/null | head -1)
  if [[ -z "$_inv" ]]; then
    if _pia_exempted gate_pia_inventory_missing; then
      warn "gate_pia_inventory_missing: 个人信息处理活动清单不存在（已豁免留痕）"
    else
      fail "gate_pia_inventory_missing: 个人信息处理活动清单不存在（${dir} 下未见 *清单*/*inventory*/*register* 文件；GB/T 35273-2020 处理活动记录）"
      found=1
    fi
  fi
  # ③ PIA 文档零 TBD（评估报告不得含待定项）
  local _tbd
  _tbd=$(grep -rnE 'TBD|待定|待明确|待补充' "$dir" 2>/dev/null || true)
  if [[ -n "$_tbd" ]]; then
    if _pia_exempted gate_pia_tbd; then
      warn "gate_pia_tbd: PIA 文档含待定项（已豁免留痕）"
    else
      fail "gate_pia_tbd: PIA 文档含待定项（TBD/待定/待明确/待补充）——评估结论必须完整：
$(printf '%s\n' "$_tbd" | head -5 | sed 's/^/    /')"
      found=1
    fi
  fi
  # ④ 清单覆盖勾稽（warn-only：PRIVACY_SCAN_DIRS 各目录应在清单中有引用）
  if [[ -n "$_inv" && ${#PRIVACY_SCAN_DIRS[@]} -gt 0 ]]; then
    local d _base
    for d in ${PRIVACY_SCAN_DIRS[@]+"${PRIVACY_SCAN_DIRS[@]}"}; do
      _base=$(basename "$d")
      grep -qF "$_base" "$_inv" 2>/dev/null || warn "处理活动清单（${_inv}）未引用 PRIVACY_SCAN_DIRS 目录：${d}——请核对登记完整性"
    done
  fi
  [[ $found -eq 0 ]] && { pass "PIA 检查通过（评估文档+处理活动清单齐备，零待定项）"; return 0; }
}

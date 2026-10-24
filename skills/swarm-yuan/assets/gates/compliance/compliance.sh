# gate: compliance
# domain: compliance / enforce: strict / tier: compliance
check_compliance() {
  echo "=== 标准合规矩阵校验（25000.51/8566/8567+9386/安全/国际/门禁姿态）==="
  # 矩阵路径：优先 COMPLIANCE_MATRIX_FILE，缺省探测 SKILL_DIR/references/standards-compliance.md
  local matrix="${COMPLIANCE_MATRIX_FILE:-}"
  if [[ -z "$matrix" ]]; then
    # SKILL_DIR 用 _CONF_DIR（配置加载时已解析为绝对路径，规避 cd 后 $0 相对路径失效）
    local skill_dir cand
    skill_dir=$(cd "${_CONF_DIR}/.." 2>/dev/null && pwd || echo "$PROJECT_DIR")
    cand="${skill_dir}/references/standards-compliance.md"
    [[ -f "$cand" ]] && matrix="$cand"
  fi
  if [[ -z "$matrix" || ! -f "$matrix" ]]; then
    if [[ -n "${COMPLIANCE_MATRIX_FILE:-}" ]]; then
      # 显式配置但文件不存在 → fail-closed
      fail "gate_compliance_matrix_missing: 配置的矩阵文件不存在：${COMPLIANCE_MATRIX_FILE}"
    else
      skip_if_unconfigured "标准合规矩阵未配置（references/standards-compliance.md 缺失）"
    fi
    return
  fi
  local found=0
  # 6 锚点默认集（与 references/standards-compliance.md 锚点契约一致，可用 COMPLIANCE_REQUIRED_SECTIONS 覆盖）
  local anchors=(
    '## A. GB/T 25000.51 八特性 × 门禁映射'
    '## B. GB/T 8566 过程 × 生成流程映射'
    '## C. GB/T 8567+9386 文档包 × 交付物映射'
    '## D. 安全标准 × 门禁映射（等保/三法/38674/34943/39786）'
    '## E. 国际工程标准映射（ISO 5055/SSDF/ASVS/SBOM-SLSA）'
    '## F. 门禁姿态与豁免登记'
  )
  if [[ ${#COMPLIANCE_REQUIRED_SECTIONS[@]} -gt 0 ]]; then
    anchors=("${COMPLIANCE_REQUIRED_SECTIONS[@]}")
  fi
  local a
  for a in "${anchors[@]}"; do
    if ! grep -qF "$a" "$matrix" 2>/dev/null; then
      fail "gate_compliance_anchor_incomplete:${a}: 矩阵缺少锚点章节"
      found=1
    fi
  done
  # 全文占位符扫描（骨架填充残留）
  local ph
  ph=$(grep -nE '待填充|（待填充）|<占位符>|填充指引' "$matrix" 2>/dev/null || true)
  if [[ -n "$ph" ]]; then
    fail "gate_compliance_placeholder: 矩阵存在未填充占位符："
    echo "$ph" | head -10
    found=1
  fi
  # SPEC_FILE 存在时查「## 22. 标准合规」段
  if [[ -n "${SPEC_FILE:-}" && -f "$SPEC_FILE" ]]; then
    if ! grep -qE '^## 22\. 标准合规' "$SPEC_FILE" 2>/dev/null; then
      fail "gate_compliance_spec_section_missing: spec 缺少「## 22. 标准合规」段"
      found=1
    fi
  fi
  # ---- 标准映射表核验（STANDARDS_MAP_FILE 配置或默认探测；文件不存在则跳过）----
  local _smap="${STANDARDS_MAP_FILE:-}"
  if [[ -z "$_smap" ]]; then
    # 默认探测 SKILL_DIR/assets/standards-map.conf（SKILL_DIR 用 _CONF_DIR 推导，同矩阵探测口径）
    local _smap_dir _smap_cand
    _smap_dir=$(cd "${_CONF_DIR}/.." 2>/dev/null && pwd || echo "")
    _smap_cand="${_smap_dir}/assets/standards-map.conf"
    [[ -n "$_smap_dir" && -f "$_smap_cand" ]] && _smap="$_smap_cand"
  fi
  if [[ -n "$_smap" && -f "$_smap" ]]; then
    local _ln_no=0 _bad_fmt="" _bad_conf="" _row _nf _cf
    while IFS= read -r _row || [[ -n "$_row" ]]; do
      _ln_no=$((_ln_no+1))
      case "$_row" in ''|\#*) continue;; esac
      _nf=$(printf '%s\n' "$_row" | awk -F'|' '{print NF}')
      if [[ "$_nf" -ne 5 ]]; then
        _bad_fmt="${_bad_fmt}${_ln_no}行(${_nf}字段) "
        continue
      fi
      _cf=$(printf '%s\n' "$_row" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}')
      case "$_cf" in high|medium|unverified) ;; *) _bad_conf="${_bad_conf}${_ln_no}行(${_cf}) ";; esac
    done < "$_smap"
    if [[ -n "$_bad_fmt" ]]; then
      fail "gate_compliance_standards_map_format: 标准映射表字段数≠5：${_bad_fmt}（须为 rule|cwe|gb_iso|asvs5|confidence 五字段）"
    fi
    if [[ -n "$_bad_conf" ]]; then
      fail "gate_compliance_standards_map_confidence: 标准映射表 confidence 非法值：${_bad_conf}（仅 high|medium|unverified）"
    fi
    [[ -z "$_bad_fmt" && -z "$_bad_conf" ]] && pass "标准映射表核验通过（${_smap}）"
  fi
  [[ $found -eq 0 ]] && pass "标准合规矩阵校验通过（锚点齐备，无占位符）"
}

# gate: oss-eval
# domain: security / enforce: strict / tier: compliance
check_oss_eval() {
  echo "=== 开源代码安全评价（GB/T 43848-2024：来源/安全质量/知识产权/管理四维）==="
  if [[ "${OSS_EVAL_REQUIRED:-0}" != "1" ]]; then
    if [[ -n "${OSS_EVAL_EXEMPT_REASON:-}" ]]; then
      warn "开源代码安全评价已豁免（${OSS_EVAL_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_oss_eval_unconfigured: OSS_EVAL_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（OSS_EVAL_REQUIRED=1）或填写 OSS_EVAL_EXEMPT_REASON 豁免理由（GB/T 43848-2024 开源代码安全评价）"
    fi
    return
  fi
  local found=0
  # ① 成分清单存在（复用 --sbom 产物；sbom 未跑时本门禁独立核验目录）
  local dir="${SBOM_OUTPUT_DIR:-.sbom}"
  local _sbom_files
  _sbom_files=$(find "$dir" -type f \( -name '*.json' -o -name '*.spdx' -o -name '*.xml' -o -name '*.txt' \) 2>/dev/null | head -20 || true)
  if [[ -z "$_sbom_files" ]]; then
    fail "gate_oss_eval_sbom_missing: 开源成分清单产物不存在（${dir}；GB/T 43848-2024 将成分清单纳入评价体系——先运行 --sbom 生成）"
    found=1
  fi
  # ② 许可证遵从（块名单扫描成分清单）
  if [[ -n "$_sbom_files" && ${#SBOM_LICENSE_BLOCKLIST[@]} -gt 0 ]]; then
    local lic _hits=""
    for lic in ${SBOM_LICENSE_BLOCKLIST[@]+"${SBOM_LICENSE_BLOCKLIST[@]}"}; do
      local h
      h=$(printf '%s\n' "$_sbom_files" | xargs grep -lF "$lic" 2>/dev/null || true)
      [[ -n "$h" ]] && _hits="${_hits}${lic}→$(printf '%s\n' "$h" | head -3 | tr '\n' ' ') "
    done
    if [[ -n "$_hits" ]]; then
      fail "gate_oss_eval_license_blocked: 成分清单命中许可证块名单：${_hits}（GB/T 43848-2024 知识产权维度：开源许可证遵从度评价）"
      found=1
    fi
  fi
  # ③ 上游来源登记（管理维度，warn-only）
  if [[ ! -f README.md && ! -f UPSTREAM.md ]]; then
    warn "未见上游来源登记文档（README.md 或 UPSTREAM.md）——GB/T 43848-2024 来源维度建议登记开源成分来源"
  fi
  # ④ 豁免到期检查（warn-only：SBOM_LICENSE_EXEMPTIONS 五字段第 5 字段日期 < 今天）
  if [[ ${#SBOM_LICENSE_EXEMPTIONS[@]} -gt 0 ]]; then
    local today ex _d
    today=$(date -u +%Y-%m-%d)
    for ex in ${SBOM_LICENSE_EXEMPTIONS[@]+"${SBOM_LICENSE_EXEMPTIONS[@]}"}; do
      _d=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}')
      if [[ -n "$_d" && "$_d" < "$today" ]]; then
        warn "开源许可证豁免已过期：${ex}（到期日 ${_d} < ${today}）——须复审或移除"
      fi
    done
  fi
  [[ $found -eq 0 ]] && pass "开源代码安全评价通过（成分清单在案，许可证未命中块名单）"
}

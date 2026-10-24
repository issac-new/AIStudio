# gate: privacy
# domain: security / enforce: strict / tier: compliance
check_privacy() {
  echo "=== 个人信息（PII）扫描（个保法 / GB/T 35273）==="
  [[ ${#PRIVACY_SCAN_DIRS[@]} -eq 0 ]] && { skip_if_unconfigured "PRIVACY_SCAN_DIRS 未配置"; return; }
  # 配置目录全不存在 → fail-closed
  local existing=() d
  for d in "${PRIVACY_SCAN_DIRS[@]}"; do
    [[ -d "$d" ]] && existing+=("$d")
  done
  if [[ ${#existing[@]} -eq 0 ]]; then
    fail "gate_privacy_dirs_missing: PRIVACY_SCAN_DIRS 配置的目录全部不存在：${PRIVACY_SCAN_DIRS[*]}"
    return
  fi
  # 内置 ERE：18 位身份证 / 手机号 / 16-19 位银行卡
  local patterns=(
    '[1-9][0-9]{5}(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx]'
    '1[3-9][0-9]{9}'
    '[0-9]{16,19}'
  )
  if [[ ${#PRIVACY_EXTRA_PATTERNS[@]} -gt 0 ]]; then
    patterns+=("${PRIVACY_EXTRA_PATTERNS[@]}")
  fi
  # R118：配置的非法 ERE 不得被 2>/dev/null 吞成“无命中”。扫描前逐条校验。
  local _pv_pat
  for _pv_pat in "${patterns[@]}"; do
    if ! _regex_is_valid "$_pv_pat"; then
      fail "gate_privacy_invalid_pattern: PRIVACY_EXTRA_PATTERNS 含非法 ERE：${_pv_pat}"
      return
    fi
  done
  local found=0 pat kw hits pii_files=""
  # R126-G9：PRIVACY_SCAN_DIRS 配 "." 时原实现全量扫 .git/node_modules——16-19 位数字
  # 规则命中锁文件哈希/依赖包内文本，PII 假阳性淹没真发现且是全门禁族最慢的一次扫描。
  # 对齐 check_security 的目录排除纪律（_sec_scan 恒排 .git/node_modules）。
  local _pv_xdirs=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=target --exclude-dir=.swarm-yuan)
  for d in "${existing[@]}"; do
    for pat in "${patterns[@]}"; do
      # 滤 example/mock/dummy/placeholder/样例 噪声行；-I 跳过二进制
      hits=$(grep -rnIE "${_pv_xdirs[@]}" "$pat" "$d" 2>/dev/null | grep -viE 'example|mock|dummy|placeholder|样例' || true)
      [[ -n "$hits" ]] && pii_files="${pii_files}$(echo "$hits" | cut -d: -f1)
"
    done
    # 敏感关键词（固定串、忽略大小写）
    if [[ ${#PRIVACY_SENSITIVE_KEYWORDS[@]} -gt 0 ]]; then
      for kw in "${PRIVACY_SENSITIVE_KEYWORDS[@]}"; do
        hits=$(grep -rniF "${_pv_xdirs[@]}" "$kw" "$d" 2>/dev/null | grep -viE 'example|mock|dummy|placeholder|样例' || true)
        [[ -n "$hits" ]] && pii_files="${pii_files}$(echo "$hits" | cut -d: -f1)
"
      done
    fi
  done
  # 隐私豁免：对象|规则|理由|审批人|日期（对象=文件路径或文件名；规则=pii/privacy/*）
  _privacy_exempted() {
    local ex obj rule
    for ex in "${PRIVACY_EXEMPTIONS[@]+"${PRIVACY_EXEMPTIONS[@]}"}"; do
      obj=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      rule=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}')
      [[ "$obj" == "$1" || "$obj" == "$(basename "$1")" ]] || continue
      [[ -z "$rule" || "$rule" == "pii" || "$rule" == "privacy" || "$rule" == "*" ]] && return 0
    done
    return 1
  }
  # 按文件聚合去重后逐文件判定；命中豁免的降为 warn（旧版只回显登记行，豁免不生效）
  local _pii_exempted_n=0
  if [[ -n "$pii_files" ]]; then
    local f
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if _privacy_exempted "$f"; then
        warn "gate_privacy_pii_exempted:${f}: 疑似个人信息命中，但已登记 PRIVACY_EXEMPTIONS 豁免"
        _pii_exempted_n=$((_pii_exempted_n+1))
      else
        fail "gate_privacy_pii_found:${f}: 疑似个人信息命中（身份证/手机号/银行卡/敏感关键词）"
        found=1
      fi
    done <<< "$(printf '%s' "$pii_files" | sort -u)"
  fi
  # 豁免登记：5 字段（对象|规则|理由|审批人|日期）校验 + 回显
  if [[ ${#PRIVACY_EXEMPTIONS[@]} -gt 0 ]]; then
    local ex nf
    for ex in "${PRIVACY_EXEMPTIONS[@]}"; do
      nf=$(awk -F'|' '{print NF}' <<< "$ex")
      if [[ "$nf" -ne 5 ]]; then
        fail "gate_privacy_exemption_invalid: 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${ex}"
        found=1
      else
        echo "  ⓘ 豁免登记：${ex}"
      fi
    done
  fi
  if [[ $found -eq 0 ]]; then
    if [[ "$_pii_exempted_n" -gt 0 ]]; then
      pass "未发现未豁免的个人信息泄露风险（${_pii_exempted_n} 个文件已按 PRIVACY_EXEMPTIONS 豁免）"
    else
      pass "未发现个人信息泄露风险"
    fi
  fi
}

# gate: requirements
# domain: compliance / enforce: warn / tier: compliance
check_requirements() {
  echo "=== 需求质量检查（ISO/IEC/IEEE 29148：无 TBD / 唯一 ID / EARS）==="
  local found=0 hits l
  # —— 0. OpenSpec CLI 整合（WP1.1）：若装了 openspec 且配置了 OPENSPEC_SPEC_DIR，
  #     跑 `openspec validate --all --strict` 校验 delta spec 合法性；未装/未配置则降级（下方文档检查已覆盖）。
  #     语义：openspec validate 退出码不稳定（部分版本 failed 时仍 rc=0），故靠输出判断——
  #     输出含 "failed" 且 "passed" 项为 0 → spec 非法 → fail。独立于 SPEC_FILE，openspec 有自己的 spec 目录。
  local ospec_dir="${OPENSPEC_SPEC_DIR:-}"
  # 相对路径解析为 PROJECT_DIR 下（与 precheck 其他路径解析一致；run-gate-fixture 不 cd 到 fixture，
  # cwd 可能是 swarm-yuan/，相对路径 openspec 会解析到错误位置）
  if [[ -n "$ospec_dir" && "${ospec_dir:0:1}" != "/" && -n "${PROJECT_DIR:-}" ]]; then
    ospec_dir="$PROJECT_DIR/$ospec_dir"
  fi
  if has_openspec && [[ -n "$ospec_dir" && -d "$ospec_dir" ]]; then
    trace_tool "openspec" "validate --all --strict $ospec_dir"
    local ospec_out; ospec_out=$(openspec validate --all --strict --no-interactive "$ospec_dir" 2>&1 || true)
    if echo "$ospec_out" | grep -qE '[1-9][0-9]* failed' && ! echo "$ospec_out" | grep -qE '[1-9][0-9]* passed'; then
      fail "gate_requirements_openspec_invalid: openspec validate 失败（delta spec 非法，详见输出）"
      echo "$ospec_out" | tail -10 | sed 's/^/    /'
      found=1
    else
      pass "openspec validate 通过（delta spec 合法）"
    fi
  fi
  local spec="${SPEC_FILE:-}"
  if [[ -z "$spec" || ! -f "$spec" ]]; then
    if [[ $found -eq 0 ]]; then
      skip_if_unconfigured "SPEC_FILE 未配置或不存在，需求 lint 跳过（openspec 守卫已在上方执行）"
      return
    fi
    # openspec 已 fail，仍返回非 0
    return 1
  fi
  # —— 1. TBD 零容忍（REQUIREMENTS_STRICT=1）：spec 含 TBD/待定/待明确 → fail（id 带行号）
  if [[ "${REQUIREMENTS_STRICT:-0}" == "1" ]]; then
    hits=$(grep -nE 'TBD|待定|待明确' "$spec" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
      while IFS= read -r l; do
        [[ -n "$l" ]] && fail "gate_requirements_tbd:${l%%:*}: spec 含 TBD/待定/待明确（29148 要求需求集完备、不允许待定项）"
      done <<< "$hits"
      found=1
    fi
  fi
  # —— 2. 唯一标识（REQUIREMENTS_ID_REQUIRED=1）：需求条目（含 应当/应该/必须/shall/must 的列表项）缺 REQ- 编号 → fail
  if [[ "${REQUIREMENTS_ID_REQUIRED:-0}" == "1" ]]; then
    hits=$(grep -nE '^[[:space:]]*([-*+]|[0-9]+[.)])[[:space:]]+' "$spec" 2>/dev/null \
      | grep -E '应当|应该|必须|shall|must|SHALL|MUST' \
      | grep -vE 'REQ-[0-9A-Za-z-]+' || true)
    if [[ -n "$hits" ]]; then
      local noid_count
      noid_count=$(printf '%s\n' "$hits" | wc -l | xargs)
      fail "gate_requirements_no_id: ${noid_count} 条需求条目缺 REQ- 唯一编号（29148 要求每条需求可唯一标识）"
      printf '%s\n' "$hits" | head -10 | sed 's/^/    /'
      found=1
    fi
  fi
  # —— 3. EARS 句式覆盖率 → warn-only（粗估：需求句中含 当…时/如果/若/when/while/if 触发词的比例 <50% 提示）
  local total=0 ears=0
  total=$(_norm_int "$(grep -cE '应当|应该|必须|shall|must|SHALL|MUST' "$spec" 2>/dev/null || true)")
  ears=$(_norm_int "$(grep -cE '当.*时|如果|若|在.*时|when|while|if |When |While |If ' "$spec" 2>/dev/null || true)")
  if [[ "$total" -gt 0 ]]; then
    local pct=$((ears*100/total))
    if [[ "$pct" -lt 50 ]]; then
      warn "EARS 句式覆盖率约 ${pct}%（${ears}/${total}，<50%）——建议按 EARS（Ubiquitous/Event/State/Optional/Complex）改写需求句"
    fi
  fi
  # —— 4. 需求集合一致性（ISO/IEC/IEEE 29148 §5.2.7.2：同一概念同一术语，无矛盾）→ warn-only
  #    启发式：提取需求句中的名词性关键词（中文 2-4 字词/英文大写缩写），检查同一概念是否用了不同词
  #    实现局限：bash 无 NLP，仅做粗粒度术语漂移提示（同义词对配置在 REQUIREMENTS_SYNONYM_PAIRS）
  if [[ ${#REQUIREMENTS_SYNONYM_PAIRS[@]} -gt 0 ]]; then
    local _pair _term_a _term_b _term_hits
    for _pair in "${REQUIREMENTS_SYNONYM_PAIRS[@]}"; do
      IFS='|' read -r _term_a _term_b <<< "$_pair"
      [[ -z "$_term_a" || -z "$_term_b" ]] && continue
      _term_hits=$(grep -cE "$_term_a" "$spec" 2>/dev/null || true)
      local _term_b_hits; _term_b_hits=$(grep -cE "$_term_b" "$spec" 2>/dev/null || true)
      if [[ "$_term_hits" -gt 0 && "$_term_b_hits" -gt 0 ]]; then
        warn "需求术语不一致：'${_term_a}'（${_term_hits} 处）与 '${_term_b}'（${_term_b_hits} 处）混用——29148 要求同一概念同一术语"
      fi
    done
  fi
  # —— 5. 需求集合完备性（ISO/IEC/IEEE 29148 §5.2.7.1：无 TBD/TBC/TBP）→ 已在上文 REQUIREMENTS_STRICT 覆盖
  #    补充：TBC（待确认）/TBP（待提供）也纳入零容容忍（REQUIREMENTS_STRICT=1 时）
  if [[ "${REQUIREMENTS_STRICT:-0}" == "1" ]]; then
    local _tbc_hits
    _tbc_hits=$(grep -nE 'TBC|TBP|待确认|待提供' "$spec" 2>/dev/null || true)
    if [[ -n "$_tbc_hits" ]]; then
      while IFS= read -r l; do
        [[ -n "$l" ]] && fail "gate_requirements_tbc:${l%%:*}: spec 含 TBC/TBP/待确认/待提供（29148 要求需求集完备，不允许待定项）"
      done <<< "$_tbc_hits"
      found=1
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "需求质量检查通过（执法项未命中；EARS 覆盖率为 warn-only 提示）"
  fi
}

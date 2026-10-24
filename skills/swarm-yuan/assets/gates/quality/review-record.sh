# gate: review-record
# domain: quality / enforce: strict / tier: compliance
check_review_record() {
  echo "=== 评审记录与 AI 过程信息项检查（GB/T 8566-2022 评审过程 / ISO/IEC 42001 成文信息+可追溯）==="
  [[ "${REVIEW_RECORD_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "REVIEW_RECORD_REQUIRED 未启用，评审记录检查跳过"; return; }
  local dir="${REVIEW_RECORD_DIR:-docs/reviews}"
  if [[ ! -d "$dir" ]]; then
    fail "gate_review_record_missing: 评审记录目录不存在：${dir}（GB/T 8566-2022 评审过程要求留存评审记录）"
    return
  fi
  local found=0
  # ① 评审记录存在且含评审人/日期/结论三要素
  # R140 G-D7：文件名口径对齐——check_review 的今日留痕自定命名就是 YYYY-MM-DD.md，
  # 本门禁旧 find 只认 *review*/*评审*，按姊妹口径命名的真实记录（trade-forge 实证
  # docs/reviews/2026-10-20.md）反被判 missing。两类命名都收；三要素内容检查不变。
  local _recs _rec
  _recs=$(find "$dir" -maxdepth 2 -type f \( -iname '*review*' -o -iname '*评审*' -o -iname '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*.md' \) 2>/dev/null || true)
  if [[ -z "$_recs" ]]; then
    fail "gate_review_record_missing: 评审记录目录无评审文件（${dir} 下未见 *review*/*评审* 文件）"
    found=1
  else
    while IFS= read -r _rec; do
      [[ -z "$_rec" ]] && continue
      local _miss=""
      grep -qE '评审人|reviewer|审核人' "$_rec" 2>/dev/null || _miss="${_miss}评审人 "
      grep -qE '日期|date|时间' "$_rec" 2>/dev/null || _miss="${_miss}日期 "
      grep -qE '结论|conclusion|result|通过|不通过' "$_rec" 2>/dev/null || _miss="${_miss}结论 "
      if [[ -n "$_miss" ]]; then
        fail "gate_review_record_incomplete: 评审记录缺要素：${_miss}（${_rec}；GB/T 8566-2022 评审记录须含评审人/日期/结论）"
        found=1
      fi
      # 零 TBD
      if grep -qE 'TBD|待定|待明确|待补充' "$_rec" 2>/dev/null; then
        fail "gate_review_record_tbd: 评审记录含待定项（${_rec}）——评审结论必须完整"
        found=1
      fi
    done <<< "$_recs"
  fi
  # ② AI 过程信息项（AI_DISCLOSURE_REQUIRED=1 时）
  if [[ "${AI_DISCLOSURE_REQUIRED:-0}" == "1" ]]; then
    local _spec="${SPEC_FILE:-}"
    if [[ -n "$_spec" && -f "$_spec" ]]; then
      if ! grep -qE 'AI.*(生成|辅助|generated)|人工智能.*生成|AI-assisted' "$_spec" 2>/dev/null; then
        fail "gate_review_record_ai_undisclosed: spec 未声明 AI 辅助生成（AI_DISCLOSURE_REQUIRED=1）——ISO/IEC 42001 成文信息要求 AI 生成产物声明+人工复核记录"
        found=1
      fi
    fi
    # 人工复核记录存在性（warn-only）
    local _hr
    _hr=$(find "$dir" -type f -exec grep -lE '人工复核|human.*(review|verify)|人工审查' {} \; 2>/dev/null | head -1 || true)
    [[ -z "$_hr" ]] && warn "未见人工复核记录（AI_DISCLOSURE_REQUIRED=1 建议留存人工复核签字）"
  fi
  [[ $found -eq 0 ]] && pass "评审记录检查通过（评审人/日期/结论齐备，零待定项）"
}

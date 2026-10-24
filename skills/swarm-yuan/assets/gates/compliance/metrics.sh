# gate: metrics
# domain: compliance / enforce: advisory / tier: compliance
check_metrics() {
  echo "=== 度量门禁化检查（GB/T 25000.30 质量度量 / DevOps 度量趋势恶化告警）==="
  local runs_dir="${GATE_RUNS_DIR:-}"
  if [[ -z "$runs_dir" ]]; then
    skip_if_unconfigured "GATE_RUNS_DIR 未配置，度量检查跳过（无 gate-runs.jsonl 数据源）"
    return
  fi
  local jsonl="${runs_dir}/gate-runs.jsonl"
  if [[ ! -f "$jsonl" ]]; then
    skip_if_unconfigured "gate-runs.jsonl 不存在（${jsonl}）——度量检查跳过（首次运行无历史数据）"
    return
  fi
  local window="${METRICS_TREND_WINDOW:-3}"
  local found=0
  # 提取 strict 门禁列表（从 gate-enforce-level.conf）
  local _conf_dir _gel
  _conf_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  _gel="${_conf_dir}/gate-enforce-level.conf"
  local _strict_gates=""
  if [[ -f "$_gel" ]]; then
    _strict_gates=$(grep -E '=strict$' "$_gel" 2>/dev/null | cut -d= -f1 || true)
  fi
  [[ -z "$_strict_gates" ]] && { warn "gate-enforce-level.conf 无 strict 门禁或文件缺失——度量趋势检查降级为全门禁"; _strict_gates=$(grep -oE '"gate":"[^"]*"' "$jsonl" 2>/dev/null | sed 's/"gate":"//;s/"//' | sort -u || true); }
  local _g _statuses _half _total _first_half _second_half _fh_pass _sh_pass _prev_rate _rate _declining=""
  for _g in $_strict_gates; do
    [[ -z "$_g" ]] && continue
    # 取该门禁最近 N 次状态
    _statuses=$(grep -F "\"gate\":\"$_g\"" "$jsonl" 2>/dev/null | grep -oE '"status":"[^"]*"' | sed 's/"status":"//;s/"//' | tail -"$window" || true)
    [[ -z "$_statuses" ]] && continue
    _total=$(printf '%s\n' "$_statuses" | grep -c . || true)
    [[ "$_total" -lt 2 ]] && continue
    _half=$((_total / 2))
    [[ "$_half" -eq 0 ]] && _half=1
    _first_half=$(printf '%s\n' "$_statuses" | head -"$_half" || true)
    _second_half=$(printf '%s\n' "$_statuses" | tail -"$((_total - _half))" || true)
    _fh_pass=$(printf '%s\n' "$_first_half" | grep -c 'pass' || true)
    _sh_pass=$(printf '%s\n' "$_second_half" | grep -c 'pass' || true)
    _prev_rate=$((_fh_pass * 100 / _half))
    _rate=$((_sh_pass * 100 / (_total - _half)))
    if [[ "$_rate" -lt "$_prev_rate" ]]; then
      _declining="${_declining}${_g}(${_prev_rate}%→${_rate}%) "
    fi
  done
  if [[ -n "$_declining" ]]; then
    fail "gate_metrics_trend_declining: strict 门禁通过率趋势恶化：${_declining}（窗口 ${window} 次；GB/T 25000.30 度量反馈——质量退化信号，须排查根因）"
    found=1
  fi
  [[ $found -eq 0 ]] && pass "度量趋势检查通过（strict 门禁通过率无恶化，窗口 ${window} 次）"
}

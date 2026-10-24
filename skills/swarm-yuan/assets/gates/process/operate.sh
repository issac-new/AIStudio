# gate: operate
# domain: process / enforce: advisory / tier: explicit
check_operate() {
  echo "=== 发布后运营（--operate，advisory）==="
  # ① spec §23 灰度观察声明
  local spec_f="${SPEC_FILE:-}"
  [[ -z "$spec_f" ]] && spec_f=$(_first_existing_file "docs/spec.md" "spec.md" "docs/spec-template.md" "spec-template.md")
  if [[ -n "$spec_f" && -f "$spec_f" ]]; then
    if grep -qE '## 23|发布后运营|灰度观察' "$spec_f" 2>/dev/null; then
      pass "spec 含 §23 发布后运营段（${spec_f}）"
    else
      warn "spec 缺 §23 发布后运营段（完整级别必填，D 方向研发全流程闭环）"
    fi
  else
    warn "未找到 spec 文件，跳过 §23 检查（可配 SPEC_FILE 启用）"
  fi
  # ② 健康检查端点（HEALTH_CHECK_URLS 配置时 curl 探测，超时 5s）
  # R126-G13：旧实现读单数 HEALTH_CHECK_URL，而 conf 模板/_default_conf/check_shift_left/
  # 文档口径均为复数 HEALTH_CHECK_URLS——用户按模板配置后探测永不生效。改读复数
  # （逐端点探测），单数保留为遗留兼容回退。
  if [[ ${#HEALTH_CHECK_URLS[@]} -gt 0 ]]; then
    local _op_hc
    for _op_hc in "${HEALTH_CHECK_URLS[@]}"; do
      if command -v curl >/dev/null 2>&1; then
        if curl -sf --max-time 5 "$_op_hc" >/dev/null 2>&1; then
          pass "健康检查端点可访问（${_op_hc}）"
        else
          warn "健康检查端点不可达（${_op_hc}，环境依赖）"
        fi
      else
        warn "curl 不可用，跳过健康检查探测"
      fi
    done
  elif [[ -n "${HEALTH_CHECK_URL:-}" ]]; then
    if command -v curl >/dev/null 2>&1; then
      if curl -sf --max-time 5 "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
        pass "健康检查端点可访问（${HEALTH_CHECK_URL}）"
      else
        warn "健康检查端点不可达（${HEALTH_CHECK_URL}，环境依赖）"
      fi
    else
      warn "curl 不可用，跳过健康检查探测"
    fi
  fi
  # ③ 告警阈值配置（ALERT_CONFIG_FILE 存在且非空）
  if [[ -n "${ALERT_CONFIG_FILE:-}" ]]; then
    if [[ -s "$ALERT_CONFIG_FILE" ]]; then
      pass "告警阈值配置存在（${ALERT_CONFIG_FILE}）"
    else
      warn "告警配置文件缺失或为空：${ALERT_CONFIG_FILE}"
    fi
  fi
  # ④ runbook（RUNBOOK_FILE 存在）
  if [[ -n "${RUNBOOK_FILE:-}" ]]; then
    if [[ -f "$RUNBOOK_FILE" ]]; then
      pass "runbook 存在（${RUNBOOK_FILE}）"
    else
      warn "runbook 缺失：${RUNBOOK_FILE}"
    fi
  fi
  # 全未配置 → 跳过提示
  if [[ -z "${HEALTH_CHECK_URL:-}${ALERT_CONFIG_FILE:-}${RUNBOOK_FILE:-}" ]]; then
    echo "  (operate 监控项未配置，跳过——可配 HEALTH_CHECK_URL/ALERT_CONFIG_FILE/RUNBOOK_FILE 启用)"
  fi
}

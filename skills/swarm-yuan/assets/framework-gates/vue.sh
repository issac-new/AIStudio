# ruleset: vue  requires_conf: VUE_FILE_GLOBS VUE_REQUIRE_SCRIPT_SETUP VUE_FORBIDDEN_OPTIONS_API VUE_VHTML_SANITIZE_REQUIRED VUE_VHTML_SANITIZE_PATTERNS VUE_VFOR_FORBIDDEN_INDEX_KEY VUE_REACTIVE_WARN_THRESHOLD VUE_PINIA_FILE_GLOBS VUE_PINIA_DEFINESTORE_REQUIRED VUE_PINIA_AGGREGATE_STORE
# gates: fw_vue_script_setup(fail) fw_vue_no_options_api(fail) fw_vue_vhtml_sanitize(fail) fw_vue_vfor_index_key(warn) fw_vue_reactivity_threshold(warn) fw_vue_pinia_definestore(warn) fw_vue_pinia_aggregate(warn)
# harvested-from: ncwk-dev precheck.sh:2454-2509 (2026-07-17)；pinia 合并自 ncwk-dev precheck.sh:2536-2555 (2026-07-17)
# 7 规律统一改用 _fw_report 报告器（fail_id 提取对齐 precheck.sh:498 FAIL_IDS 收集）
_fw_vue_check() {
  echo "  [vue] Vue 3.5 框架规律"
  local files
  files=$(_fw_resolve_globs "${VUE_FILE_GLOBS[@]+"${VUE_FILE_GLOBS[@]}"}" | sort -u)
  [[ -z "$files" ]] && { warn "vue: 无 .vue 文件可检"; return; }
  local fa=()
  while IFS= read -r ln; do fa+=("$ln"); done <<< "$files"

  # 规律1: <script setup> 强制
  if [[ "${VUE_REQUIRE_SCRIPT_SETUP:-}" == "1" ]]; then
    local total setup bad=""
    total=$(_fw_grep_count "<script" "${fa[@]}")
    setup=$(_fw_grep_count "<script setup" "${fa[@]}")
    if [[ "$total" -gt 0 && "$setup" -ne "$total" ]]; then
      bad="SFC 总数 $total, <script setup> 占比 $setup, 非 setup 的 $((total-setup)) 个"
    fi
    _fw_report fail fw_vue_script_setup "$bad" "<script setup> 强制（Vue 3.5 RFC 已稳定）" "全部 SFC 用 <script setup> ($setup/$total)"
  fi

  # 规律2: 禁 Options API
  if [[ -n "${VUE_FORBIDDEN_OPTIONS_API:-}" ]]; then
    local hits bad=""
    hits=$(grep -rnE "${VUE_FORBIDDEN_OPTIONS_API:-}" "${fa[@]}" 2>/dev/null || true)
    [[ -n "$hits" ]] && bad="$hits"
    _fw_report fail fw_vue_no_options_api "$bad" "检出 Options API（Vue 3 推荐 Composition API + <script setup>）" "无 Options API"
  fi

  # 规律3: v-html 须配套 sanitize（同文件级）
  if [[ "${VUE_VHTML_SANITIZE_REQUIRED:-}" == "1" ]]; then
    local vhtml_files="" bad="" offenders="" cnt=0
    while IFS= read -r f; do vhtml_files="$vhtml_files $f"; done < <(grep -rlE "v-html" "${fa[@]}" 2>/dev/null || true)
    if [[ -z "${vhtml_files// }" ]]; then
      _fw_report pass fw_vue_vhtml_sanitize "" "无 v-html 使用" ""
    else
      for f in $vhtml_files; do
        if ! grep -qE "${VUE_VHTML_SANITIZE_PATTERNS:-}" "$f" 2>/dev/null; then
          offenders="$offenders $f"
        fi
        cnt=$((cnt+1))
      done
      [[ -n "$offenders" ]] && bad="$offenders"
      _fw_report fail fw_vue_vhtml_sanitize "$bad" "v-html 未配套 sanitize（CWE-79 XSS 风险）" "v-html 均配套 sanitize（${cnt} 处）"
    fi
  fi

  # 规律4: v-for 禁 index 作 key（warn 级）
  if [[ -n "${VUE_VFOR_FORBIDDEN_INDEX_KEY:-}" ]]; then
    local hits bad=""
    hits=$(grep -rnE "${VUE_VFOR_FORBIDDEN_INDEX_KEY:-}" "${fa[@]}" 2>/dev/null || true)
    [[ -n "$hits" ]] && bad="$hits"
    _fw_report warn fw_vue_vfor_index_key "$bad" "v-for 用 index 作 key（稳定数组可接受，动态数组需 item.id）" "v-for 无 index 作 key"
  fi

  # 规律5: reactive 用量预警（仅超阈值时 warn，无 bad 累积）
  local rc; rc=$( { grep -rhoE "\breactive\b" "${fa[@]}" 2>/dev/null || true; } | wc -l | xargs)
  if [[ -n "${VUE_REACTIVE_WARN_THRESHOLD:-}" && "$rc" -gt "${VUE_REACTIVE_WARN_THRESHOLD:-}" ]]; then
    warn "fw_vue_reactivity_threshold: reactive 用量 $rc 处（阈值 ${VUE_REACTIVE_WARN_THRESHOLD}），建议优先 ref/computed"
  fi

  # 版本感知——package.json 检 vue 版本（2 vs 3 口径分流标注）
  local _vue_ver=""
  _vue_ver=$(grep -oE '"vue"[[:space:]]*:[[:space:]]*"[^"]*"' "${PROJECT_DIR:-.}/package.json" 2>/dev/null | grep -oE '^[0-9]+' | head -1)
  if [[ -n "$_vue_ver" && "$_vue_ver" != "3" ]]; then
    pass "fw_vue_version_aware: Vue ${_vue_ver}.x 项目——规则集主口径 3.5.x，${_vue_ver}.x 项目部分规律版本区间外（VUE_REQUIRE_SCRIPT_SETUP 等不适用——Options API 项目请勿填该 conf 变量）"
  fi

  # ====================================================================
  # fw_vue_pinia_definestore(warn)：Pinia store 须用 defineStore 定义
  # （合并自原 pinia.sh，门禁 id 由 fw_pinia_definestore 改名以遵循 fw_vue_<rule> 命名规范）
  # ====================================================================
  if [[ "${VUE_PINIA_DEFINESTORE_REQUIRED:-}" == "1" ]]; then
    local pinia_files pfa=() cnt bad=""
    pinia_files=$(_fw_resolve_globs ${VUE_PINIA_FILE_GLOBS[@]+"${VUE_PINIA_FILE_GLOBS[@]}"} 2>/dev/null | sort -u)
    if [[ -z "$pinia_files" ]]; then
      warn "fw_vue_pinia_definestore: VUE_PINIA_FILE_GLOBS 未配置或无文件可检"
    else
      while IFS= read -r ln; do [[ -n "$ln" ]] && pfa+=("$ln"); done <<< "$pinia_files"
      cnt=$(_fw_grep_count "defineStore" "${pfa[@]}")
      [[ "$cnt" -eq 0 ]] && bad="未检出 defineStore（疑似未用 Pinia 或漏定义）"
      _fw_report warn fw_vue_pinia_definestore "$bad" "Pinia store 未用 defineStore 定义" "defineStore 定义（$cnt 文件）"
    fi
  fi

  # ====================================================================
  # fw_vue_pinia_aggregate(warn)：聚合层 store 须存在
  # （合并自原 pinia.sh，门禁 id 由 fw_pinia_aggregate_store 改名）
  # ====================================================================
  if [[ -n "${VUE_PINIA_AGGREGATE_STORE:-}" ]]; then
    local bad=""
    [[ ! -f "${VUE_PINIA_AGGREGATE_STORE:-}" ]] && bad="VUE_PINIA_AGGREGATE_STORE=${VUE_PINIA_AGGREGATE_STORE} 未配置或不存在"
    _fw_report warn fw_vue_pinia_aggregate "$bad" "聚合层 store 缺失（pinia root 不可达）" "聚合层 store 存在（${VUE_PINIA_AGGREGATE_STORE}）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

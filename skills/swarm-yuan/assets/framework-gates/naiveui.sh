# ruleset: naiveui  requires_conf: NAIVEUI_FILE_GLOBS
# gates: fw_naiveui_named_import(warn) fw_naiveui_no_global_register(fail) fw_naiveui_no_dual_ui(fail) fw_naiveui_config_provider_theme(warn) fw_naiveui_usemessage_inject(warn) fw_naiveui_datatable_virtual(warn) fw_naiveui_darktheme(warn) fw_naiveui_form_rules(warn) fw_naiveui_select_remote(warn) fw_naiveui_upload_size_limit(fail) fw_naiveui_modal_preset_card(warn)
# harvested-from: ncwk-dev precheck.sh:2510-2535 (2026-07-17) + P5 扩展（2026-07-17），规律源自 NaiveUI 2.x 官方文档
_fw_naiveui_check() {
  echo "  [naiveui] NaiveUI 2.x 框架规律"

  local files fa=()
  files=$(_fw_resolve_globs ${NAIVEUI_FILE_GLOBS[@]+"${NAIVEUI_FILE_GLOBS[@]}"} 2>/dev/null | sort -u)
  [[ -z "$files" ]] && { warn "naiveui: 无文件可检"; return; }
  while IFS= read -r ln; do [[ -n "$ln" ]] && fa+=("$ln"); done <<< "$files"

  # ====================================================================
  # fw_naiveui_named_import(warn)：须具名导入
  # ====================================================================
  local named
  named=$(_fw_grep_count "from 'naive-ui'" "${fa[@]+"${fa[@]}"}")
  if [[ "$named" -gt 0 ]]; then
    pass "fw_naiveui_named_import: 具名导入 ($named 文件)"
  else
    warn "fw_naiveui_named_import: 未检出具名导入（或未使用 NaiveUI）"
  fi

  # ====================================================================
  # fw_naiveui_no_global_register(fail)：禁全局注册组件
  # ====================================================================
  local g_hits
  g_hits=$(grep -rnE "app\.use\(n|app\.component\('n-|globalProperties" "${fa[@]+"${fa[@]}"}" 2>/dev/null || true)
  if [[ -z "$g_hits" ]]; then
    pass "fw_naiveui_no_global_register: 无全局注册组件"
  else
    fail "fw_naiveui_no_global_register: 检出全局注册（须具名导入 + unplugin-vue-components 自动按需）: $g_hits"
  fi

  # ====================================================================
  # fw_naiveui_no_dual_ui(fail)：禁第二套 UI 库
  # ====================================================================
  local d_hits
  d_hits=$(grep -rnE "from 'element-plus'|from 'ant-design-vue'|from 'vant'" "${fa[@]+"${fa[@]}"}" 2>/dev/null || true)
  if [[ -z "$d_hits" ]]; then
    pass "fw_naiveui_no_dual_ui: 无第二套 UI 库"
  else
    fail "fw_naiveui_no_dual_ui: 检出第二套 UI 库（混用致主题/包体冲突）: $d_hits"
  fi

  # ====================================================================
  # fw_naiveui_config_provider_theme(warn)：主题须用 n-config-provider，禁改源 CSS
  # ====================================================================
  local th_bad=""
  local f
  for f in "${fa[@]+"${fa[@]}"}"; do
    case "$(basename "$f")" in
      *.css|*.scss|*.less)
        local ln
        ln=$(grep -nE '\.n-(button|input|data-table|modal)\b' "$f" 2>/dev/null | head -1 || true)
        [[ -n "$ln" ]] && th_bad="${th_bad}${f}:${ln}
"
        ;;
    esac
  done
  _fw_report warn fw_naiveui_config_provider_theme "$th_bad" "直接覆写 .n-* 类（须用 n-config-provider theme overrides，升级即失效）" "未检出直接覆写 .n-* 类（已用 config-provider）"

  # ====================================================================
  # fw_naiveui_usemessage_inject(warn)：useMessage 须注入式，禁裸 createDiscreteApi
  # ====================================================================
  local dm_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    local ln
    ln=$(grep -nE 'createDiscreteApi\(' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && dm_bad="${dm_bad}${f}:${ln}
"
  done
  _fw_report warn fw_naiveui_usemessage_inject "$dm_bad" "检出 createDiscreteApi（脱离组件树，无法消费 config-provider context；优先 useMessage/useDialog 注入式）" "未检出 createDiscreteApi（已用注入式 useMessage）"

  # ====================================================================
  # fw_naiveui_datatable_virtual(warn)：n-data-table 大数据须虚拟滚动
  # ====================================================================
  local tbl_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    if ! grep -qE '<n-data-table\b' "$f" 2>/dev/null; then continue; fi
    if grep -qE ':data="[a-zA-Z_]*(list|List|rows|Rows|data|Data)"' "$f" 2>/dev/null; then
      if ! grep -qE 'virtual-scroll|:virtual|:max-height|:max-height' "$f" 2>/dev/null; then
        local ln
        # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
        ln=$(grep -nE '<n-data-table\b' "$f" 2>/dev/null | head -1 || true)
        tbl_bad="${tbl_bad}${f}:${ln}
"
      fi
    fi
  done
  _fw_report warn fw_naiveui_datatable_virtual "$tbl_bad" "n-data-table 大数据源未配 virtual-scroll（>1k 行须虚拟滚动）" "已配虚拟滚动或数据量小（或无表格）"

  # ====================================================================
  # fw_naiveui_darktheme(warn)：暗色模式须用 darkTheme，禁手写 dark CSS
  # ====================================================================
  local dk_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    case "$(basename "$f")" in
      *.css|*.scss|*.less|*.vue)
        local ln
        ln=$(grep -nE '\.dark\s|html\.dark|:root\.dark|prefers-color-scheme' "$f" 2>/dev/null | head -1 || true)
        [[ -n "$ln" ]] && dk_bad="${dk_bad}${f}:${ln}
"
        ;;
    esac
  done
  local has_darktheme=0
  for f in "${fa[@]+"${fa[@]}"}"; do
    if grep -qE 'darkTheme|dark-theme' "$f" 2>/dev/null; then has_darktheme=1; fi
  done
  if [[ "$has_darktheme" -eq 1 ]]; then
    pass "fw_naiveui_darktheme: 已用 darkTheme（n-config-provider）"
  elif [[ -n "$dk_bad" ]]; then
    warn "fw_naiveui_darktheme: 手写暗色 CSS（须用 n-config-provider :theme=\"darkTheme\"，否则与组件库主题脱节）:
${dk_bad}"
  else
    pass "fw_naiveui_darktheme: 未检出暗色模式手写 CSS（或无暗色需求）"
  fi

  # ====================================================================
  # fw_naiveui_form_rules(warn)：n-form 须用 rules 校验
  # ====================================================================
  local fr_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    if ! grep -qE '<n-form\b' "$f" 2>/dev/null; then continue; fi
    if ! grep -qE ':rules=|:rules:' "$f" 2>/dev/null; then
      local ln
      ln=$(grep -nE "if[[:space:]]*\([^)]*(\.value|length|===|==)|alert\(['\"]" "$f" 2>/dev/null | head -1 || true)
      [[ -n "$ln" ]] && fr_bad="${fr_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_naiveui_form_rules "$fr_bad" "n-form 未用 :rules + 手动 if 校验（须用 rules + formRef.validate）" "n-form 均用 rules 校验（或无表单）"

  # ====================================================================
  # fw_naiveui_select_remote(warn)：n-select filterable 大数据须远程搜索
  # ====================================================================
  local sel_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    if ! grep -qE '<n-select\b' "$f" 2>/dev/null; then continue; fi
    if grep -qE 'filterable' "$f" 2>/dev/null; then
      if ! grep -qE 'on-search|@search|:loading|remote' "$f" 2>/dev/null; then
        local ln
        ln=$(grep -nE 'filterable' "$f" 2>/dev/null | head -1 || true)
        sel_bad="${sel_bad}${f}:${ln}
"
      fi
    fi
  done
  _fw_report warn fw_naiveui_select_remote "$sel_bad" "n-select filterable 未配 on-search 远程搜索（大数据选项须远程）" "远程搜索配置合理（或无 filterable）"

  # ====================================================================
  # fw_naiveui_upload_size_limit(fail)：n-upload 须配大小限制
  # ====================================================================
  local up_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    if ! grep -qE '<n-upload\b' "$f" 2>/dev/null; then continue; fi
    if ! grep -qE 'before-upload|@before-upload|:max|:limit' "$f" 2>/dev/null; then
      local ln
      ln=$(grep -nE '<n-upload\b' "$f" 2>/dev/null | head -1 || true)
      up_bad="${up_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_naiveui_upload_size_limit "$up_bad" "n-upload 未配 before-upload 大小校验（无限制可上传超大文件致 DoS）" "均配大小限制（或无上传）"

  # ====================================================================
  # fw_naiveui_modal_preset_card(warn)：n-modal 优先 preset-card
  # ====================================================================
  local mdl_bad=""
  for f in "${fa[@]+"${fa[@]}"}"; do
    if ! grep -qE '<n-modal\b' "$f" 2>/dev/null; then continue; fi
    if ! grep -qE 'preset|:title|:bordered' "$f" 2>/dev/null; then
      local ln
      ln=$(grep -nE '<n-modal\b' "$f" 2>/dev/null | head -1 || true)
      mdl_bad="${mdl_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_naiveui_modal_preset_card "$mdl_bad" "n-modal 未配 preset（推荐 preset=\"card\" 统一标题/关闭/边框，否则手写布局不一致）" "n-modal 配置合理（或无 modal）"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

# ruleset: antd  requires_conf: ANTD_SRC_GLOBS
# gates: fw_antd_app_useapp(fail) fw_antd_on_demand_import(warn) fw_antd_form_useform(warn) fw_antd_table_virtual(warn) fw_antd_configprovider_theme(warn) fw_antd_form_item_name(warn) fw_antd_modal_destroyonclose(warn) fw_antd_select_remote(warn) fw_antd_upload_size_limit(fail) fw_antd_typography_ellipsis(warn) fw_antd_grid_responsive(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 Ant Design 6.x / 5.x 官方文档
_fw_antd_check() {
  echo "  [antd] Ant Design 6.x / 5.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${ANTD_SRC_GLOBS[@]+"${ANTD_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "antd: ANTD_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # ====================================================================
  # fw_antd_app_useapp(fail)：React 18+ 须用 App.useApp，禁静态 message.xxx
  # ====================================================================
  local static_bad=""
  local f
  for f in "${srcarr[@]}"; do
    # 文件已用 App.useApp / useApp 注入式 → 跳过（调用点形式相同，无法机械区分）
    if grep -qE 'useApp\(\)|App\.useApp' "$f" 2>/dev/null; then
      continue
    fi
    local ln
    ln=$(grep -nE '\b(message|notification|modal)\.(success|error|info|warning|warn|loading|open|confirm)\(' "$f" 2>/dev/null \
       | grep -vE 'useApp|App\.' || true)
    [[ -n "$ln" ]] && static_bad="${static_bad}${f}:${ln}
"
  done
  _fw_report fail fw_antd_app_useapp "$static_bad" "检出 message/notification/modal 静态调用（React 18+ 须用 App.useApp，静态调用无法消费 ConfigProvider context，主题/locale 失效）" "未检出静态 message/notification/modal（已用 useApp）"

  # ====================================================================
  # fw_antd_on_demand_import(warn)：检出全量 import 'antd'
  # ====================================================================
  local full_imp=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(grep -nE "from ['\"]antd['\"]|import ['\"]antd/(dist|lib)" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && full_imp="${full_imp}${f}:${ln}
"
  done
  _fw_report warn fw_antd_on_demand_import "$full_imp" "检出全量 import antd（须用 unplugin 按需引入，否则包体过大）" "未检出全量 import（已按需引入或未使用）"

  # ====================================================================
  # fw_antd_form_useform(warn)：禁废弃 Form.create 高阶组件
  # ====================================================================
  local fc_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(grep -nE 'Form\.create\(|@Form\.create|createFormDecorator|FormProps.*wrappedComponentRef' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && fc_bad="${fc_bad}${f}:${ln}
"
  done
  _fw_report warn fw_antd_form_useform "$fc_bad" "检出 Form.create 废弃 API（4.x 起移除，须用 useForm Hook）" "未检出 Form.create（已用 useForm 或无表单）"

  # ====================================================================
  # fw_antd_table_virtual(warn)：Table 大数据须虚拟滚动
  # ====================================================================
  local tbl_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE '<Table\b|<a-table\b' "$f" 2>/dev/null; then
      continue
    fi
    if grep -qE ':dataSource="[a-zA-Z_]*(list|List|rows|Rows|data|Data)"|dataSource=\{[a-zA-Z_]*(list|List|rows|Rows)' "$f" 2>/dev/null; then
      if ! grep -qE 'virtual|scroll=\{|scroll:|react-window|vxe-table|:scroll' "$f" 2>/dev/null; then
        local ln
        # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
        ln=$(grep -nE '<Table\b|<a-table\b' "$f" 2>/dev/null | head -1 || true)
        tbl_bad="${tbl_bad}${f}:${ln}
"
      fi
    fi
  done
  _fw_report warn fw_antd_table_virtual "$tbl_bad" "Table 绑定大数据源未配 virtual/scroll（>1k 行须虚拟滚动）" "Table 已配虚拟滚动或数据量小（或无表格）"

  # ====================================================================
  # fw_antd_configprovider_theme(warn)：主题须用 ConfigProvider token，禁全局 CSS
  # ====================================================================
  local th_bad=""
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.css|*.less|*.scss)
        local ln
        ln=$(grep -nE '\.ant-(btn|input|table|modal)|:where\(\.ant-' "$f" 2>/dev/null | head -1 || true)
        [[ -n "$ln" ]] && th_bad="${th_bad}${f}:${ln}
"
        ;;
    esac
  done
  _fw_report warn fw_antd_configprovider_theme "$th_bad" "直接覆写 .ant-* 类样式（须用 ConfigProvider theme.token，升级即失效）" "未检出直接覆写 .ant-* 类（已用 ConfigProvider token）"

  # ====================================================================
  # fw_antd_form_item_name(warn)：Form.Item 须配 name 与 data 对应
  # ====================================================================
  local fi_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE '<Form\.Item\b|<a-form-item\b' "$f" 2>/dev/null; then
      continue
    fi
    local ln
    ln=$(grep -nE '<Form\.Item\b|<a-form-item\b' "$f" 2>/dev/null | grep -vE 'name=|name:' || true)
    [[ -n "$ln" ]] && fi_bad="${fi_bad}${f}:${ln}
"
  done
  _fw_report warn fw_antd_form_item_name "$fi_bad" "Form.Item 未配 name（须与 data 字段对应，否则校验/取值失效）" "Form.Item 均配 name（或无表单项）"

  # ====================================================================
  # fw_antd_modal_destroyonclose(warn)：Modal 须配 destroyOnClose
  # ====================================================================
  local mdl_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE '<Modal\b|<a-modal\b' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE 'destroyOnClose|destroy-on-close' "$f" 2>/dev/null; then
      local ln
      ln=$(grep -nE '<Modal\b|<a-modal\b' "$f" 2>/dev/null | head -1 || true)
      mdl_bad="${mdl_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_antd_modal_destroyonclose "$mdl_bad" "Modal 未配 destroyOnClose（关闭后子组件状态残留）" "Modal 均配 destroyOnClose（或无 Modal）"

  # ====================================================================
  # fw_antd_select_remote(warn)：Select showSearch 大数据须远程搜索
  # ====================================================================
  local sel_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE '<Select\b|<a-select\b' "$f" 2>/dev/null; then
      continue
    fi
    if grep -qE 'showSearch' "$f" 2>/dev/null; then
      if ! grep -qE 'onSearch|filterOption=\{false\}|remote' "$f" 2>/dev/null; then
        local ln
        ln=$(grep -nE 'showSearch' "$f" 2>/dev/null | head -1 || true)
        sel_bad="${sel_bad}${f}:${ln}
"
      fi
    fi
  done
  _fw_report warn fw_antd_select_remote "$sel_bad" "Select showSearch 未配 onSearch 远程搜索（大数据选项须远程，否则全量渲染卡顿）" "Select 远程搜索配置合理（或无 showSearch）"

  # ====================================================================
  # fw_antd_upload_size_limit(fail)：Upload 须配文件大小限制
  # ====================================================================
  local up_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE '<Upload\b|<a-upload\b' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE 'beforeUpload|maxCount|:limit|:size' "$f" 2>/dev/null; then
      local ln
      ln=$(grep -nE '<Upload\b|<a-upload\b' "$f" 2>/dev/null | head -1 || true)
      up_bad="${up_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_antd_upload_size_limit "$up_bad" "Upload 未配 beforeUpload 大小校验（无限制可上传超大文件致存储耗尽/DoS）" "Upload 均配大小限制（或无上传）"

  # ====================================================================
  # fw_antd_typography_ellipsis(warn)：长文本须用 Typography.Ellipsis
  # ====================================================================
  local ell_bad=""
  for f in "${srcarr[@]}"; do
    # 检出 .slice(0, n) 截断字符串显示（疑似手写截断替代 Ellipsis）
    local ln
    ln=$(grep -nE '\.slice\(0,[[:space:]]*[0-9]+\)[[:space:]]*\+?[[:space:]]*['"'"'"]?\.{0,3}["'"'"']?' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && ell_bad="${ell_bad}${f}:${ln}
"
  done
  _fw_report warn fw_antd_typography_ellipsis "$ell_bad" "检出手写 .slice 截断显示（须用 Typography.Paragraph/Ellipsis ellipsis，自适应+tooltip）" "未检出手写截断（已用 Typography.Ellipsis 或无截断）"

  # ====================================================================
  # fw_antd_grid_responsive(warn)：Row/Col 须配响应式断点
  # ====================================================================
  local grid_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE '<Col\b|<a-col\b' "$f" 2>/dev/null; then
      continue
    fi
    # Col 仅用静态 span 无 xs/sm/md/lg 断点
    local ln
    ln=$(grep -nE '<Col\b|<a-col\b' "$f" 2>/dev/null | grep -E 'span=' | grep -vE 'xs=|sm=|md=|lg=|xl=|xxl=' || true)
    [[ -n "$ln" ]] && grid_bad="${grid_bad}${f}:${ln}
"
  done
  _fw_report warn fw_antd_grid_responsive "$grid_bad" "Col 仅用静态 span 无响应式断点（须 xs/sm/md/lg 配置，否则移动端错位）" "Col 响应式配置合理（或无 Grid）"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

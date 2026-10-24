# ruleset: tailwind  requires_conf: TAILWIND_CONFIG_GLOBS
# gates: fw_tailwind_content_scan(fail) fw_tailwind_css_first_config(warn) fw_tailwind_arbitrary_abuse(warn) fw_tailwind_prefix_isolate(warn) fw_tailwind_dark_mode(warn) fw_tailwind_group_hover(warn) fw_tailwind_apply_reuse(warn) fw_tailwind_postcss_order(warn) fw_tailwind_preflight_conflict(warn) fw_tailwind_custom_color(warn) fw_tailwind_responsive_prefix(warn) fw_tailwind_prod_minify(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 Tailwind CSS 4.x / 3.x 官方文档
_fw_tailwind_check() {
  echo "  [tailwind] Tailwind CSS 4.x / 3.x 框架规律"

  # ---------- 收集配置文件 ----------
  local cfgs cfgarr=()
  cfgs=$(_fw_resolve_globs ${TAILWIND_CONFIG_GLOBS[@]+"${TAILWIND_CONFIG_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && cfgarr+=("$ln")
  done <<< "$cfgs"

  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    warn "tailwind: TAILWIND_CONFIG_GLOBS 未配置或无文件可检"
    return
  fi

  # ====================================================================
  # fw_tailwind_content_scan(fail)：content 扫描路径须完整
  # ====================================================================
  local content_ok=0 content_files=""
  local f
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      tailwind.config.*)
        if grep -qE 'content:' "$f" 2>/dev/null; then
          content_ok=1
          # content 含 ./src/** 等即视为完整
          if ! grep -qE '\*\*' "$f" 2>/dev/null; then
            content_files="${content_files}${f}: content 无 ** 通配（漏扫致样式丢失）
"
          fi
        fi
        ;;
      *.css)
        # 4.x CSS-first：含 @import "tailwindcss" 或 @source
        if grep -qE '@import.*tailwindcss|@source' "$f" 2>/dev/null; then
          content_ok=1
        fi
        ;;
    esac
  done
  if [[ "$content_ok" -eq 0 ]]; then
    fail "fw_tailwind_content_scan: 未配 content 扫描路径（漏扫致样式丢失，JIT 不生成未扫到类的样式）"
  elif [[ -n "$content_files" ]]; then
    fail "fw_tailwind_content_scan: content 扫描路径不完整:
${content_files}"
  else
    pass "fw_tailwind_content_scan: content 扫描路径完整"
  fi

  # ====================================================================
  # fw_tailwind_css_first_config(warn)：4.x 须用 @theme CSS-first 配置
  # ====================================================================
  local has_js_cfg=0 has_css_theme=0 has_v4_import=0
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      tailwind.config.*) has_js_cfg=1 ;;
      *.css)
        grep -qE '@theme' "$f" 2>/dev/null && has_css_theme=1
        grep -qE '@import.*tailwindcss' "$f" 2>/dev/null && has_v4_import=1
        ;;
    esac
  done
  if [[ "$has_v4_import" -eq 1 && "$has_js_cfg" -eq 1 && "$has_css_theme" -eq 0 ]]; then
    warn "fw_tailwind_css_first_config: 4.x 用 @import tailwindcss 但仍用 tailwind.config.js（4.x 推荐 @theme CSS-first 配置）"
  else
    pass "fw_tailwind_css_first_config: 配置方式合理（CSS-first 或 JS 配置一致）"
  fi

  # ====================================================================
  # fw_tailwind_arbitrary_abuse(warn)：任意值不可过度滥用
  # ====================================================================
  local arb_bad=""
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      *.vue|*.tsx|*.jsx|*.html|*.ts)
        # 单文件含 5+ 任意值 [xxx] 疑似滥用
        local cnt
        cnt=$(grep -oE '\[[a-zA-Z0-9_#-]+:[^\]]+\]' "$f" 2>/dev/null | wc -l | xargs)
        if [[ "${cnt:-0}" -ge 5 ]]; then
          arb_bad="${arb_bad}${f}: 任意值 ${cnt} 处（过度滥用须改自定义 CSS/组件类）
"
        fi
        ;;
    esac
  done
  _fw_report warn fw_tailwind_arbitrary_abuse "${arb_bad}" "检出任意值滥用（>5 处/文件，应抽自定义 CSS 或 @apply 复用）" "任意值用量合理（或未滥用）"

  # ====================================================================
  # fw_tailwind_prefix_isolate(warn)：与组件库混用须配 prefix 隔离
  # ====================================================================
  # 检出同时用 tailwind + 组件库（element/antd/naiveui）但无 prefix
  local has_ui=0 has_prefix=0
  for f in "${cfgarr[@]}"; do
    grep -qE 'prefix:' "$f" 2>/dev/null && has_prefix=1
  done
  # 启发式：配置目录或同项目检出组件库依赖（简化：检查 content 路径含 element/antd/naive）
  for f in "${cfgarr[@]}"; do
    if grep -qE 'element-plus|ant-design|naive-ui|el-|ant-' "$f" 2>/dev/null; then
      has_ui=1
    fi
  done
  if [[ "$has_ui" -eq 1 && "$has_prefix" -eq 0 ]]; then
    warn "fw_tailwind_prefix_isolate: 与组件库混用但未配 prefix（tailwind preflight 覆盖组件库默认样式，须 prefix 或 layer 隔离）"
  else
    pass "fw_tailwind_prefix_isolate: prefix 隔离合理（或无组件库冲突）"
  fi

  # ====================================================================
  # fw_tailwind_dark_mode(warn)：暗色模式须显式配置 darkMode
  # ====================================================================
  local dm_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'darkMode:|@custom-variant dark' "$f" 2>/dev/null; then
      dm_hit=1
    fi
  done
  if [[ "$dm_hit" -eq 1 ]]; then
    pass "fw_tailwind_dark_mode: 已显式配置 darkMode"
  else
    warn "fw_tailwind_dark_mode: 未显式配置 darkMode（默认 media，须按项目声明 class/selector 策略）"
  fi

  # ====================================================================
  # fw_tailwind_group_hover(warn)：group-hover 须配 group 标记
  # ====================================================================
  # 简化：检出 group-hover: 使用即提示须父级 group 类
  local gh_bad=""
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      *.vue|*.tsx|*.jsx|*.html)
        local ln
        ln=$(grep -nE 'group-hover:' "$f" 2>/dev/null || true)
        [[ -n "$ln" ]] && gh_bad="${gh_bad}${f}:${ln}
"
        ;;
    esac
  done
  _fw_report warn fw_tailwind_group_hover "${gh_bad}" "检出 group-hover:（须父级标 group 类，否则不生效）" "无 group-hover（或已配 group）"

  # ====================================================================
  # fw_tailwind_apply_reuse(warn)：重复类组合须用 @apply 抽组件类
  # ====================================================================
  local apply_hit=0
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      *.css|*.scss)
        grep -qE '@apply' "$f" 2>/dev/null && apply_hit=1
        ;;
    esac
  done
  if [[ "$apply_hit" -eq 1 ]]; then
    pass "fw_tailwind_apply_reuse: 已用 @apply 抽组件类"
  else
    warn "fw_tailwind_apply_reuse: 未用 @apply（重复类组合须 @apply 抽组件类，否则模板臃肿）"
  fi

  # ====================================================================
  # fw_tailwind_postcss_order(warn)：PostCSS 插件顺序须 tailwindcss 在前
  # ====================================================================
  local pc_bad=""
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      postcss.config.*)
        # 检出 autoprefixer 在 tailwindcss 之前
        local tw_l ap_l
        # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
        tw_l=$(grep -nE "tailwindcss|@tailwindcss" "$f" 2>/dev/null | head -1 | cut -d: -f1 || true)
        ap_l=$(grep -nE 'autoprefixer' "$f" 2>/dev/null | head -1 | cut -d: -f1 || true)
        if [[ -n "$tw_l" && -n "$ap_l" && "$ap_l" -lt "$tw_l" ]]; then
          pc_bad="${pc_bad}${f}: autoprefixer(行${ap_l}) 在 tailwindcss(行${tw_l}) 之前（须 tailwindcss 先）"
        fi
        ;;
    esac
  done
  _fw_report warn fw_tailwind_postcss_order "${pc_bad}" "PostCSS 插件顺序错误（tailwindcss 须在 autoprefixer 之前）" "PostCSS 插件顺序合理（或无 postcss 配置）"

  # ====================================================================
  # fw_tailwind_preflight_conflict(warn)：Preflight 须按需关闭
  # ====================================================================
  local pf_off=0 has_ui2=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'preflight:[[:space:]]*false|corePlugins:[[:space:]]*\{[^}]*preflight:[[:space:]]*false' "$f" 2>/dev/null; then
      pf_off=1
    fi
    if grep -qE 'element-plus|ant-design|naive-ui' "$f" 2>/dev/null; then
      has_ui2=1
    fi
  done
  if [[ "$has_ui2" -eq 1 && "$pf_off" -eq 0 ]]; then
    warn "fw_tailwind_preflight_conflict: 与组件库混用但未关 preflight（preflight 重置样式覆盖组件库默认，如 button 背景）"
  else
    pass "fw_tailwind_preflight_conflict: preflight 配置合理（或无组件库冲突）"
  fi

  # ====================================================================
  # fw_tailwind_custom_color(warn)：自定义颜色须用 theme 配置（非任意值）
  # ====================================================================
  local cc_hit=0
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      tailwind.config.*)
        grep -qE 'colors:' "$f" 2>/dev/null && cc_hit=1
        ;;
      *.css)
        grep -qE '@theme.*color|--color-' "$f" 2>/dev/null && cc_hit=1
        ;;
    esac
  done
  if [[ "$cc_hit" -eq 1 ]]; then
    pass "fw_tailwind_custom_color: 自定义颜色已用 theme 配置"
  else
    warn "fw_tailwind_custom_color: 未用 theme 自定义颜色（品牌色须 theme 配置，禁用任意值硬编码）"
  fi

  # ====================================================================
  # fw_tailwind_responsive_prefix(warn)：响应式须用断点前缀
  # ====================================================================
  # 简化：检出 @media 手写（未用 sm:/md: 前缀）
  local mq_bad=""
  for f in "${cfgarr[@]}"; do
    case "$(basename "$f")" in
      *.css|*.scss)
        local ln
        ln=$(grep -nE '@media[[:space:]]*\(' "$f" 2>/dev/null | grep -vE 'prefers-color' || true)
        [[ -n "$ln" ]] && mq_bad="${mq_bad}${f}:${ln}
"
        ;;
    esac
  done
  _fw_report warn fw_tailwind_responsive_prefix "${mq_bad}" "检出手写 @media（须用 sm:/md:/lg: 响应式前缀，统一断点）" "未检出手写 @media（已用响应式前缀）"

  # ====================================================================
  # fw_tailwind_prod_minify(warn)：生产构建须 minify
  # ====================================================================
  # 简化：postcss/tailwind 配置无 minify 关闭即视为合理（tailwind 默认生产 minify）
  local min_off=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'minify:[[:space:]]*false' "$f" 2>/dev/null; then
      min_off=1
    fi
  done
  if [[ "$min_off" -eq 1 ]]; then
    warn "fw_tailwind_prod_minify: minify 关闭（生产须 minify，CSS 体积过大）"
  else
    pass "fw_tailwind_prod_minify: minify 默认开启（或未显式关闭）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

# ruleset: webpack  requires_conf: WEBPACK_CONFIG_GLOBS
# gates: fw_webpack_persistent_cache(warn) fw_webpack_splitchunks(warn) fw_webpack_chunk_naming(warn) fw_webpack_defineplugin(warn) fw_webpack_mode_minimize(warn) fw_webpack_tree_shaking(warn) fw_webpack_resolve_alias(warn) fw_webpack_devtool(fail) fw_webpack_externals(warn) fw_webpack_loader_order(warn) fw_webpack_performance_hints(warn) fw_webpack_copy_plugin(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 webpack 5.x 官方文档
_fw_webpack_check() {
  echo "  [webpack] webpack 5.x 框架规律"

  # ---------- 收集配置文件 ----------
  local cfgs cfgarr=()
  cfgs=$(_fw_resolve_globs ${WEBPACK_CONFIG_GLOBS[@]+"${WEBPACK_CONFIG_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && cfgarr+=("$ln")
  done <<< "$cfgs"

  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    warn "webpack: WEBPACK_CONFIG_GLOBS 未配置或无文件可检"
    return
  fi

  # 合并所有配置文件内容供跨文件检索
  local allcfg=""
  local f
  for f in "${cfgarr[@]}"; do
    allcfg="${allcfg}$(cat "$f" 2>/dev/null)
"
  done

  # ====================================================================
  # fw_webpack_persistent_cache(warn)：须配持久缓存 filesystem
  # ====================================================================
  local cache_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE "cache:[[:space:]]*\{|cache:[[:space:]]*'filesystem'|cache:[[:space:]]*\{[[:space:]]*type:[[:space:]]*['\"]filesystem" "$f" 2>/dev/null; then
      if grep -qE "type:[[:space:]]*['\"]filesystem" "$f" 2>/dev/null; then
        cache_hit=1
      fi
    fi
  done
  if [[ "$cache_hit" -eq 1 ]]; then
    pass "fw_webpack_persistent_cache: 已配 cache.type='filesystem'"
  else
    warn "fw_webpack_persistent_cache: 未配持久缓存（cache.type='filesystem'，二次构建提速 90%+）"
  fi

  # ====================================================================
  # fw_webpack_splitchunks(warn)：须配 splitChunks 分包
  # ====================================================================
  local sc_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'splitChunks' "$f" 2>/dev/null; then
      sc_hit=1
    fi
  done
  if [[ "$sc_hit" -eq 1 ]]; then
    pass "fw_webpack_splitchunks: 已配 splitChunks 分包"
  else
    warn "fw_webpack_splitchunks: 未配 splitChunks（默认分包策略单一，须按 vendor/公共模块拆分）"
  fi

  # ====================================================================
  # fw_webpack_chunk_naming(warn)：动态 import 须配 webpackChunkName
  # ====================================================================
  local cn_bad=""
  for f in "${cfgarr[@]}"; do
    local ln
    ln=$(grep -nE "import\(" "$f" 2>/dev/null | grep -vE 'webpackChunkName|/\* webpackChunkName' || true)
    [[ -n "$ln" ]] && cn_bad="${cn_bad}${f}:${ln}
"
  done
  _fw_report warn fw_webpack_chunk_naming "${cn_bad}" "动态 import 未配 webpackChunkName（chunk 名为数字，难以调试 + 缓存失效）" "动态 import 均配 webpackChunkName（或无动态 import）"

  # ====================================================================
  # fw_webpack_defineplugin(warn)：环境变量须用 DefinePlugin 注入
  # ====================================================================
  local dp_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'DefinePlugin' "$f" 2>/dev/null; then
      dp_hit=1
    fi
  done
  if [[ "$dp_hit" -eq 1 ]]; then
    pass "fw_webpack_defineplugin: 已用 DefinePlugin 注入环境变量"
  else
    warn "fw_webpack_defineplugin: 未用 DefinePlugin（环境变量须显式注入 process.env.XXX，否则客户端 undefined）"
  fi

  # ====================================================================
  # fw_webpack_mode_minimize(warn)：生产 mode 须开启压缩
  # ====================================================================
  local mode_prod=0 minimize_off=0
  for f in "${cfgarr[@]}"; do
    if grep -qE "mode:[[:space:]]*['\"]production" "$f" 2>/dev/null; then
      mode_prod=1
    fi
    if grep -qE "minimize:[[:space:]]*false|minimize:[[:space:]]*0\b" "$f" 2>/dev/null; then
      minimize_off=1
    fi
  done
  if [[ "$mode_prod" -eq 1 && "$minimize_off" -eq 1 ]]; then
    warn "fw_webpack_mode_minimize: mode=production 但 minimize=false（生产须压缩，包体过大）"
  elif [[ "$mode_prod" -eq 1 ]]; then
    pass "fw_webpack_mode_minimize: 生产 mode 压缩已开启"
  else
    pass "fw_webpack_mode_minimize: 非生产 mode（或未显式关闭压缩）"
  fi

  # ====================================================================
  # fw_webpack_tree_shaking(warn)：须配 usedExports/sideEffects
  # ====================================================================
  local ts_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'usedExports|sideEffects' "$f" 2>/dev/null; then
      ts_hit=1
    fi
  done
  if [[ "$ts_hit" -eq 1 ]]; then
    pass "fw_webpack_tree_shaking: 已配 usedExports/sideEffects"
  else
    warn "fw_webpack_tree_shaking: 未显式配 usedExports/sideEffects（生产默认开启，但 package.json 须声明 sideEffects:false 优化）"
  fi

  # ====================================================================
  # fw_webpack_resolve_alias(warn)：resolve.alias 须显式配置
  # ====================================================================
  local alias_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'resolve:[[:space:]]*\{' "$f" 2>/dev/null; then
      if grep -qE 'alias:' "$f" 2>/dev/null; then
        alias_hit=1
      fi
    fi
  done
  if [[ "$alias_hit" -eq 1 ]]; then
    pass "fw_webpack_resolve_alias: 已配 resolve.alias"
  else
    warn "fw_webpack_resolve_alias: 未配 resolve.alias（@ 路径别名须显式，否则相对路径深嵌套难维护）"
  fi

  # ====================================================================
  # fw_webpack_devtool(fail)：生产 devtool 须关闭或用 source-map（非 eval）
  # ====================================================================
  local dt_bad=""
  local has_prod=0
  for f in "${cfgarr[@]}"; do
    grep -qE "mode:[[:space:]]*['\"]production" "$f" 2>/dev/null && has_prod=1
    local ln
    ln=$(grep -nE "devtool:[[:space:]]*['\"](eval|eval-cheap-source-map|inline-source-map|cheap-eval-source-map)" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && dt_bad="${dt_bad}${f}:${ln}
"
  done
  if [[ -n "$dt_bad" && "$has_prod" -eq 1 ]]; then
    fail "fw_webpack_devtool: 生产 mode 用 eval 类 devtool（泄露源码 CWE-540 + 包体大，须 source-map 或 false）:
${dt_bad}"
  elif [[ -n "$dt_bad" ]]; then
    warn "fw_webpack_devtool: devtool 用 eval 类（非生产可接受，生产须关闭）:
${dt_bad}"
  else
    pass "fw_webpack_devtool: devtool 配置合理（非 eval 或未配置）"
  fi

  # ====================================================================
  # fw_webpack_externals(warn)：CDN 依赖须配 externals 外部化
  # ====================================================================
  # 检出 html 模板引用 CDN script 但配置无 externals → warn（简化：配置含 externals 即 pass）
  local ext_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'externals' "$f" 2>/dev/null; then
      ext_hit=1
    fi
  done
  if [[ "$ext_hit" -eq 1 ]]; then
    pass "fw_webpack_externals: 已配 externals（CDN 依赖外部化）"
  else
    warn "fw_webpack_externals: 未配 externals（CDN 引入的依赖须 externals，否则重复打包）"
  fi

  # ====================================================================
  # fw_webpack_loader_order(warn)：loader 链顺序（use 数组从右到左）
  # ====================================================================
  local lo_bad=""
  for f in "${cfgarr[@]}"; do
    # 检出 use: [...] 数组中 loader 字符串（非对象）顺序疑似错误：sass-loader 在 css-loader 之前
    local ln
    ln=$(grep -nE "use:[[:space:]]*\[" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] || continue
    # 简化：检出 use 数组含 sass-loader + css-loader，且 sass-loader 行号 < css-loader 行号
    local sass_l css_l
    # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
    sass_l=$(grep -nE 'sass-loader' "$f" 2>/dev/null | head -1 | cut -d: -f1 || true)
    css_l=$(grep -nE 'css-loader' "$f" 2>/dev/null | head -1 | cut -d: -f1 || true)
    if [[ -n "$sass_l" && -n "$css_l" && "$sass_l" -lt "$css_l" ]]; then
      lo_bad="${lo_bad}${f}: sass-loader(行${sass_l}) 在 css-loader(行${css_l}) 之前（webpack 从右到左执行，须 css-loader 在前）
"
    fi
  done
  _fw_report warn fw_webpack_loader_order "${lo_bad}" "loader 链顺序错误（webpack use 数组从右到左执行，sass-loader 须在末尾）" "loader 顺序合理（或无多 loader 链）"

  # ====================================================================
  # fw_webpack_performance_hints(warn)：须配 performance 阈值
  # ====================================================================
  local perf_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'performance:' "$f" 2>/dev/null; then
      perf_hit=1
    fi
  done
  if [[ "$perf_hit" -eq 1 ]]; then
    pass "fw_webpack_performance_hints: 已配 performance 阈值"
  else
    warn "fw_webpack_performance_hints: 未配 performance（默认 warn 250KB，须按项目调整 hints/maxAssetSize）"
  fi

  # ====================================================================
  # fw_webpack_copy_plugin(warn)：静态资源须用 CopyWebpackPlugin
  # ====================================================================
  local cp_hit=0
  for f in "${cfgarr[@]}"; do
    if grep -qE 'CopyWebpackPlugin|copy-webpack-plugin' "$f" 2>/dev/null; then
      cp_hit=1
    fi
  done
  if [[ "$cp_hit" -eq 1 ]]; then
    pass "fw_webpack_copy_plugin: 已用 CopyWebpackPlugin 处理静态资源"
  else
    warn "fw_webpack_copy_plugin: 未用 CopyWebpackPlugin（public 静态资源须显式拷贝，否则部署缺失）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

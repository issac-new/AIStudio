# ruleset: vite  requires_conf: VITE_CONFIG_FILE VITE_INJECT_SCRIPT
# gates: fw_vite_alias_array_form(warn) fw_vite_alias_order(warn) fw_vite_inject_clean(warn) fw_vite_env_prefix(warn) fw_vite_manual_chunks(warn) fw_vite_build_target(warn) fw_vite_sourcemap_prod(warn) fw_vite_base_path(warn) fw_vite_optimize_deps(warn) fw_vite_proxy_target(warn) fw_vite_esbuild_minify(warn)
# harvested-from: ncwk-dev precheck.sh:2602-2632 (2026-07-17) + P5 扩展（2026-07-17），规律源自 Vite 8.x / 7.x 官方文档
_fw_vite_check() {
  echo "  [vite] Vite 8.x / 7.x 框架规律"
  local cfg="${VITE_CONFIG_FILE:-}"

  if [[ -z "$cfg" || ! -f "$cfg" ]]; then
    warn "vite: VITE_CONFIG_FILE 未配置或不存在 ($cfg)"
    return
  fi

  # ====================================================================
  # fw_vite_alias_array_form(warn)：alias 须数组形式
  # 原 fail 对"对象形式 alias"过严——对象形式是 vite 合法用法(Vite resolve.alias
  # 接受 Record<string,string>)。降为 warn:对象形式存在时提示建议数组(保证顺序),不 fail。
  # R119：完全无 alias 配置 = 项目不使用别名，合法状态，pass（nest-forge 实证误报）；
  # 只有 alias: 存在但形态无法识别时才 fail。
  # ====================================================================
  if grep -qE "alias:[[:space:]]*\[" "$cfg" 2>/dev/null; then
    pass "fw_vite_alias_array_form: alias 数组形式"
  elif grep -qE "alias:[[:space:]]*\{" "$cfg" 2>/dev/null; then
    warn "fw_vite_alias_array_form: alias 对象形式(Vite 合法,但数组形式保证顺序更佳)"
  elif ! grep -qE "alias[[:space:]]*:" "$cfg" 2>/dev/null; then
    pass "fw_vite_alias_array_form: 未配置 alias（项目不使用别名，跳过）"
  else
    fail "fw_vite_alias_array_form: alias 形态无法识别（须数组或对象形式）"
  fi

  # ====================================================================
  # fw_vite_alias_order(warn)：@/custom 须在 @ 之前
  # alias_order 依赖 alias_array_form 的数组形式,对象形式无顺序保证概念。
  # 对象形式时降为 warn(无法判定顺序);无 @/custom 时 skip。
  # ====================================================================
  local custom_line at_line
  custom_line=$( { grep -nE "@/custom" "$cfg" 2>/dev/null || true; } | head -1 | cut -d: -f1)
  at_line=$( { grep -nE "find:[[:space:]]*['\"]@['\"]" "$cfg" 2>/dev/null || true; } | head -1 | cut -d: -f1)
  if [[ -z "$custom_line" ]]; then
    pass "fw_vite_alias_order: 无 @/custom 别名,跳过顺序检查"
  elif grep -qE "alias:[[:space:]]*\{" "$cfg" 2>/dev/null; then
    warn "fw_vite_alias_order: alias 对象形式无法保证顺序(@/custom 须在 @ 前,建议改数组形式)"
  elif [[ -n "$at_line" && "$custom_line" -lt "$at_line" ]]; then
    pass "fw_vite_alias_order: @/custom 在 @ 之前 (行 $custom_line < $at_line)"
  else
    fail "fw_vite_alias_order: @/custom 须在 @ 之前 (custom=$custom_line at=$at_line)"
  fi

  # ====================================================================
  # fw_vite_inject_clean(warn)：inject.mjs 须支持 --clean 回滚
  # 原 fail 对"VITE_INJECT_SCRIPT 指向非 inject.mjs 文件"的项目过严。
  # 如 RuoYi-Vue3 把 VITE_INJECT_SCRIPT 填为 vite/plugins/index.js(非 inject 脚本)，
  # 门禁 grep 不到 --clean 直接 fail。修复：文件存在但非 inject 脚本(无 inject 特征)
  # 降为 warn(可能误配);仅当明确是 inject.mjs 但缺 --clean 才 fail。空值仍 skip。
  # ====================================================================
  if [[ -n "${VITE_INJECT_SCRIPT:-}" && -f "${VITE_INJECT_SCRIPT:-}" ]]; then
    # 判定是否 inject 脚本:文件名含 inject 或内容含 inject 相关特征(transform/inject/replace)
    local _is_inject=0
    case "$(basename "${VITE_INJECT_SCRIPT:-}")" in
      *inject*) _is_inject=1 ;;
    esac
    [[ $_is_inject -eq 0 ]] && grep -qiE "inject|transform.*plugin|replace.*code" "${VITE_INJECT_SCRIPT:-}" 2>/dev/null && _is_inject=1
    if [[ $_is_inject -eq 1 ]]; then
      if grep -qE "\-\-clean" "${VITE_INJECT_SCRIPT:-}" 2>/dev/null; then
        pass "fw_vite_inject_clean: inject 脚本含 --clean 回滚分支"
      else
        fail "fw_vite_inject_clean: inject 脚本须支持 --clean 回滚"
      fi
    else
      warn "fw_vite_inject_clean: VITE_INJECT_SCRIPT 指向非 inject 脚本(${VITE_INJECT_SCRIPT:-}),可能误配——若项目无 inject 需求请置空该变量"
    fi
  else
    pass "fw_vite_inject_clean: 无 inject 脚本,跳过"
  fi

  # ====================================================================
  # fw_vite_env_prefix(warn)：环境变量须 VITE_ 前缀，防泄漏敏感配置
  # ====================================================================
  # 检出 process.env / import.meta.env 引用非 VITE_ 前缀变量（疑似泄漏后端密钥到客户端）
  local env_bad=""
  local ln
  ln=$(grep -nE "(process|import\.meta)\.env\.[A-Z]" "$cfg" 2>/dev/null \
     | grep -vE 'VITE_|MODE|BASE_URL|PROD|DEV|SSR' || true)
  [[ -n "$ln" ]] && env_bad="$ln"
  # 同时检查 .env 文件含敏感 key（password/secret/key/token）非 VITE_ 前缀
  local envdir
  envdir=$(dirname "$cfg")
  local envfile
  for envfile in "$envdir"/.env "$envdir"/.env.local "$envdir"/.env.production; do
    [[ -f "$envfile" ]] || continue
    local fln
    fln=$(grep -nE '^(PASSWORD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)=' "$envfile" 2>/dev/null || true)
    [[ -n "$fln" ]] && env_bad="${env_bad}${envfile}:${fln}
"
  done
  _fw_report warn fw_vite_env_prefix "$env_bad" "检出非 VITE_ 前缀的敏感环境变量引用（Vite 仅注入 VITE_ 前缀到客户端，敏感配置应放后端）" "未检出敏感环境变量泄漏"

  # ====================================================================
  # fw_vite_manual_chunks(warn)：构建须配 manualChunks 拆分
  # ====================================================================
  if grep -qE 'manualChunks|rollupOptions' "$cfg" 2>/dev/null; then
    pass "fw_vite_manual_chunks: 已配 manualChunks/rollupOptions 分包"
  else
    warn "fw_vite_manual_chunks: 未配 manualChunks（单 chunk 过大，首屏加载慢，须按路由/依赖拆分）"
  fi

  # ====================================================================
  # fw_vite_build_target(warn)：build.target 须显式配置浏览器兼容
  # ====================================================================
  if grep -qE 'target:|target =' "$cfg" 2>/dev/null; then
    pass "fw_vite_build_target: 已显式配置 build.target"
  else
    warn "fw_vite_build_target: 未配 build.target（默认 'baseline-widely-available'，须按兼容性需求显式声明）"
  fi

  # ====================================================================
  # fw_vite_sourcemap_prod(warn)：生产构建须关闭 sourcemap
  # ====================================================================
  if grep -qE "sourcemap:[[:space:]]*true|sourcemap:[[:space:]]*'hidden'" "$cfg" 2>/dev/null; then
    # 检查是否在 build 块内且无环境判断
    if ! grep -qE "sourcemap:[[:space:]]*(mode|import\.meta|process\.env|isProd|prod)" "$cfg" 2>/dev/null; then
      warn "fw_vite_sourcemap_prod: sourcemap 开启但无生产环境判断（生产 sourcemap 泄露源码 CWE-540）"
    else
      pass "fw_vite_sourcemap_prod: sourcemap 配置含环境判断"
    fi
  else
    pass "fw_vite_sourcemap_prod: 未开启 sourcemap（或默认关闭）"
  fi

  # ====================================================================
  # fw_vite_base_path(warn)：base 路径须显式配置（部署子路径）
  # ====================================================================
  if grep -qE "^[[:space:]]*base:|base[[:space:]]*=" "$cfg" 2>/dev/null; then
    pass "fw_vite_base_path: 已显式配置 base 路径"
  else
    warn "fw_vite_base_path: 未配 base（默认 '/'，部署到子路径时资源 404）"
  fi

  # ====================================================================
  # fw_vite_optimize_deps(warn)：预构建缓存须显式管理
  # ====================================================================
  if grep -qE 'optimizeDeps|optimize-deps' "$cfg" 2>/dev/null; then
    pass "fw_vite_optimize_deps: 已配 optimizeDeps 预构建"
  else
    warn "fw_vite_optimize_deps: 未配 optimizeDeps（CJS 依赖须 include 预构建，否则 dev 启动重复全量预构建）"
  fi

  # ====================================================================
  # fw_vite_proxy_target(warn)：server.proxy 须配 target，禁裸 rewrite
  # ====================================================================
  local proxy_bad=""
  if grep -qE 'proxy:' "$cfg" 2>/dev/null; then
    if ! grep -qE 'target:' "$cfg" 2>/dev/null; then
      # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
      proxy_bad=$(grep -nE 'proxy:' "$cfg" 2>/dev/null | head -1 || true)
    fi
  fi
  _fw_report warn fw_vite_proxy_target "$proxy_bad" "server.proxy 未配 target（代理须显式 target，否则转发无效）" "proxy 配置合理（或无 proxy）"

  # ====================================================================
  # fw_vite_esbuild_minify(warn)：生产压缩须 esbuild/minify，禁留未压缩
  # ====================================================================
  if grep -qE 'minify:' "$cfg" 2>/dev/null; then
    if grep -qE "minify:[[:space:]]*false|minify:[[:space:]]*'none'" "$cfg" 2>/dev/null; then
      warn "fw_vite_esbuild_minify: minify 关闭（生产须 esbuild 压缩，包体过大）"
    else
      pass "fw_vite_esbuild_minify: minify 配置合理"
    fi
  else
    pass "fw_vite_esbuild_minify: minify 默认 esbuild（或未显式关闭）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

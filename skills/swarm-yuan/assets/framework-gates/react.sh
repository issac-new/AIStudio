# ruleset: react  requires_conf: REACT_SRC_GLOBS
# gates: fw_react_hooks_top_level(fail) fw_react_effect_deps(fail) fw_react_list_key(warn) fw_react_immutable_state(fail) fw_react_memo_benefit(warn) fw_react_error_boundary(warn) fw_react_context_split(warn) fw_react_lazy_suspense(warn) fw_react_server_client_boundary(warn) fw_react_no_render_subscribe(warn) fw_react_ref_callback_explicit(warn) fw_react_no_forwardref(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 React 19.x / 18.x 官方文档 + eslint-plugin-react-hooks；规律14/15 为 React 19 升级指南补充
_fw_react_check() {
  echo "  [react] React 19.x / 18.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${REACT_SRC_GLOBS[@]+"${REACT_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "react: REACT_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，去单行注释与块注释行，避免注释误报）

  # 版本感知——package.json 检 react 版本（18 vs 19 口径分流标注）
  local _react_ver=""
  _react_ver=$(grep -oE '"react"[[:space:]]*:[[:space:]]*"[^"]*"' "${PROJECT_DIR:-.}/package.json" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  if [[ -n "$_react_ver" && "$_react_ver" != "19" ]]; then
    pass "fw_react_version_aware: React ${_react_ver}.x 项目——规则集主口径 19.x，18.x 项目部分规律版本区间外（标注待验证条目以 §3 规律表 ⚠ 为准）"
  fi

  # ====================================================================
  # fw_react_hooks_top_level(fail)：Hook 须顶层调用，禁条件/循环/嵌套函数
  # ====================================================================
  local hook_bad=""
  local f
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 检测 Hook 调用出现在 if(/for(/while(/} else 块内（粗粒度：行内同时含控制结构与 Hook 调用）
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '^\s*(if|else if|for|while|switch)\b.*\b(use[A-Z][a-zA-Z]*|useState|useEffect|useMemo|useCallback|useRef|useReducer|useContext)\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && hook_bad="${hook_bad}${f}:${ln}
"
  done
  _fw_report fail fw_react_hooks_top_level "${hook_bad}" "Hook 调用出现在条件/循环块内（须顶层同步调用，否则调用顺序错乱）" "未检出条件/循环内 Hook 调用"

  # ====================================================================
  # fw_react_effect_deps(fail)：useEffect 须配依赖数组
  # ====================================================================
  local eff_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 检测 useEffect( ... ) 未配第二参数（无逗号后跟 [ 或 useEffect(fn) 直接闭合）
    # 简化：useEffect 调用行 + 后续 1-3 行内未出现 , [ 或 ,[
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'useEffect\(' 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    # 对每个 useEffect 调用，取该行起 4 行窗口检查是否有依赖数组
    local lineno firstline
    firstline=$(printf '%s\n' "$ln" | head -1 | cut -d: -f1)
    if [[ -n "$firstline" ]]; then
      local window
      window=$(printf '%s\n' "$body" | sed -n "${firstline},$((firstline+4))p" 2>/dev/null)
      # 依赖数组迹象：, [ 或 ,[ 或 useEffect(fn, []) 同行
      if ! printf '%s\n' "$window" | grep -qE ',[[:space:]]*\[|useEffect\([^,]*,[[:space:]]*\[' 2>/dev/null; then
        eff_bad="${eff_bad}${f}:${firstline}: useEffect 疑似无依赖数组
"
      fi
    fi
  done
  _fw_report fail fw_react_effect_deps "${eff_bad}" "useEffect 未配依赖数组（漏依赖用旧值/省略 deps 每次 render 触发）" "useEffect 均配依赖数组（或无 useEffect）"

  # ====================================================================
  # fw_react_list_key(warn)：列表渲染禁用 index 作 key
  # ====================================================================
  local key_hit=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'key=\{(index|i|idx)\}|key="index"|key=\{idx\}' 2>/dev/null || true)
    [[ -n "$ln" ]] && key_hit="${key_hit}${f}:${ln}
"
  done
  _fw_report warn fw_react_list_key "${key_hit}" "列表渲染用 index 作 key（增删/排序时 DOM 复用错位，稳定列表可接受）" "未检出 index 作 key"

  # ====================================================================
  # fw_react_immutable_state(fail)：state 须不可变更新
  # ====================================================================
  local mut_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 检出 setState 后紧接 mutate：.push(/.splice(/.pop(/.shift(/.unshift( 或直接属性赋值 state.x =
    # 模式1：直接对 state 变量调用 mutate 方法（如 items.push(...)）
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '\b(items|list|state|data|arr|todos|cart)\b\.(push|splice|pop|shift|unshift|sort|reverse)\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && mut_bad="${mut_bad}${f}:${ln}
"
    # 模式2：setState 调用同表达式中 mutate（setItems(items.push(...))）
    ln=$(printf '%s\n' "$body" | grep -nE 'set[A-Z][a-zA-Z]*\([^)]*\.(push|splice|pop)\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && mut_bad="${mut_bad}${f}:${ln}
"
  done
  _fw_report fail fw_react_immutable_state "${mut_bad}" "直接 mutate state（须 spread/immer 返回新引用，否则 React 不 re-render）" "未检出直接 mutate state"

  # ====================================================================
  # fw_react_memo_benefit(warn)：useMemo/useCallback 漏依赖风险
  # ====================================================================
  local memo_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # useCallback(fn, []) 或 useMemo(() => fn, []) 且函数体引用 props/state（疑似漏依赖）
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'use(Callback|Memo)\([^,]*,[[:space:]]*\[\][[:space:]]*\)' 2>/dev/null || true)
    [[ -n "$ln" ]] && memo_bad="${memo_bad}${f}:${ln}
"
  done
  _fw_report warn fw_react_memo_benefit "${memo_bad}" "useMemo/useCallback 依赖为 []（若函数体引用 props/state 则漏依赖，须人工确认）" "未检出空依赖 memo（或无 memo 调用）"

  # ====================================================================
  # fw_react_error_boundary(warn)：须有 ErrorBoundary
  # ====================================================================
  local has_jsx=0 has_eb=0
  for f in "${srcarr[@]}"; do
    if grep -qE '<[A-Z][a-zA-Z]*[[:space:]]|return[[:space:]]*\(' "$f" 2>/dev/null; then
      has_jsx=1
    fi
    if grep -qE 'componentDidCatch|getDerivedStateFromError' "$f" 2>/dev/null; then
      has_eb=1
    fi
  done
  if [[ "$has_jsx" -eq 0 ]]; then
    pass "fw_react_error_boundary: 无 JSX 渲染，跳过"
  elif [[ "$has_eb" -eq 1 ]]; then
    pass "fw_react_error_boundary: 已配 ErrorBoundary"
  else
    warn "fw_react_error_boundary: JSX 渲染存在但无 componentDidCatch/getDerivedStateFromError（缺错误边界，渲染错误白屏）"
  fi

  # ====================================================================
  # fw_react_context_split(warn)：Context 巨型 value 拆分
  # ====================================================================
  local ctx_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 检出 Provider value={{ a, b, c, d, e, f, ... }}（>5 字段）— 简化：value={{ 后字段数
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'value=\{\{[^}]*,[^}]*,[^}]*,[^}]*,[^}]*,[^}]*' 2>/dev/null || true)
    [[ -n "$ln" ]] && ctx_bad="${ctx_bad}${f}:${ln}
"
  done
  _fw_report warn fw_react_context_split "${ctx_bad}" "Context value 含 >5 字段巨型对象（任意变更全树 re-render，须拆分）" "未检出巨型 Context value"

  # ====================================================================
  # fw_react_lazy_suspense(warn)：lazy 须配 Suspense
  # ====================================================================
  local lazy_hit=0 sus_hit=0 lazy_files=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'React\.lazy\(|lazy\(' "$f" 2>/dev/null; then
      lazy_hit=1
      lazy_files="${lazy_files}${f}
"
    fi
    if grep -qE '<Suspense' "$f" 2>/dev/null; then
      sus_hit=1
    fi
  done
  if [[ "$lazy_hit" -eq 0 ]]; then
    pass "fw_react_lazy_suspense: 无 lazy 组件，跳过"
  elif [[ "$sus_hit" -eq 1 ]]; then
    pass "fw_react_lazy_suspense: lazy 组件已配 Suspense"
  else
    warn "fw_react_lazy_suspense: React.lazy 调用但未检出 <Suspense 包裹（加载期无 fallback 白屏）:
${lazy_files}"
  fi

  # ====================================================================
  # fw_react_server_client_boundary(warn)：RSC 内禁 Hook/浏览器 API
  # ====================================================================
  # 原"任一文件含 'use client' 即判 is_app_router=1"对 CSR SPA 误报——
  # shadcn ui 组件自带 'use client'(模板残留)但项目是 react-router CSR 非 Next.js RSC。
  # 修复: 须同时满足"含 use client"且"是 Next.js App Router 项目"(检出 next.config 或
  # app/ 目录含 page.tsx/layout.tsx)。仅 use client 不够——CSR 项目也可能有残留。
  local is_app_router=0
  local _has_use_client=0
  for f in "${srcarr[@]}"; do
    if grep -qE "'use client'|\"use client\"" "$f" 2>/dev/null; then
      _has_use_client=1
      break
    fi
  done
  if [[ "$_has_use_client" -eq 1 ]]; then
    # 有 use client,进一步判定是否真 Next.js App Router(非 CSR SPA 误带)
    # 信号: next.config.{js,ts,mjs} 存在,或 app/ 目录含 page.tsx/layout.tsx
    local _proj_root="${PROJECT_DIR:-.}"
    if [[ -f "$_proj_root/next.config.js" || -f "$_proj_root/next.config.ts" || -f "$_proj_root/next.config.mjs" ]] \
       || find "$_proj_root" -maxdepth 3 -type f \( -name "page.tsx" -o -name "layout.tsx" \) \
            -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q .; then
      is_app_router=1
    fi
  fi
  if [[ "$is_app_router" -eq 0 ]]; then
    pass "fw_react_server_client_boundary: 非 Next.js App Router 项目，跳过（CSR SPA 的 use client 残留不触发）"
  else
    local rsc_bad=""
    for f in "${srcarr[@]}"; do
      local body firstline
      body=$(_fw_strip_comments_c "$f")
      firstline=$(printf '%s\n' "$body" | head -1)
      # 文件首行无 'use client' 但含 Hook/浏览器 API
      if ! printf '%s' "$firstline" | grep -qE "'use client'|\"use client\""; then
        if printf '%s\n' "$body" | grep -qE 'useState\(|useEffect\(|useRef\(|window\.|document\.|localStorage\.' 2>/dev/null; then
          rsc_bad="${rsc_bad}${f}
"
        fi
      fi
    done
    _fw_report warn fw_react_server_client_boundary "${rsc_bad}" "含 Hook/浏览器 API 但文件首行无 'use client'（Server Component 内禁用，须标 'use client'）" "交互组件均标 'use client'"
  fi

  # ====================================================================
  # fw_react_no_render_subscribe(warn)：render 阶段禁订阅事件/定时器
  # ====================================================================
  local sub_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 粗粒度：addEventListener/setInterval/setTimeout 出现在文件中，但同文件无 useEffect 包裹（简化启发式）
    local has_sub has_eff
    has_sub=$(printf '%s\n' "$body" | grep -cE 'addEventListener\(|setInterval\(' 2>/dev/null || true)
    has_eff=$(printf '%s\n' "$body" | grep -cE 'useEffect\(' 2>/dev/null || true)
    if [[ "${has_sub:-0}" -gt 0 && "${has_eff:-0}" -eq 0 ]]; then
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE 'addEventListener\(|setInterval\(' 2>/dev/null || true)
      [[ -n "$ln" ]] && sub_bad="${sub_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_react_no_render_subscribe "${sub_bad}" "检出 addEventListener/setInterval 但同文件无 useEffect 包裹（render 阶段订阅会泄漏，须移入 effect + cleanup）" "未检出 render 阶段订阅（或已用 useEffect 包裹）"

  # ====================================================================
  # fw_react_ref_callback_explicit(warn)：ref callback 须显式块语法，禁隐式返回（React 19）
  # ====================================================================
  local refcb_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 检出 ref={... => ( 隐式返回箭头（无块 {} 包裹）——简化：ref= 后跟箭头函数且 => 后紧跟 ( 而非 {
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'ref=\{[^}]*=>[[:space:]]*\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && refcb_bad="${refcb_bad}${f}:${ln}
"
  done
  _fw_report warn fw_react_ref_callback_explicit "${refcb_bad}" "ref callback 隐式返回（React 19 须块语法 ref={c => { x = c }}，否则返回值误判 cleanup 函数报错）" "未检出 ref callback 隐式返回"

  # ====================================================================
  # fw_react_no_forwardref(warn)：React 19 起 ref 可作 prop，新组件禁用 forwardRef
  # ====================================================================
  local fwd_hit=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '\bforwardRef\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && fwd_hit="${fwd_hit}${f}:${ln}
"
  done
  _fw_report warn fw_react_no_forwardref "${fwd_hit}" "检出 forwardRef（React 19 起 ref 可作 prop 直传，新组件禁用 forwardRef 包裹；存量组件标注待迁移）" "未检出 forwardRef"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

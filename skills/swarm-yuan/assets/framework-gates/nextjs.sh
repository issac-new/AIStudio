# ruleset: nextjs  requires_conf: NEXTJS_SRC_GLOBS
# gates: fw_nextjs_use_client(fail) fw_nextjs_server_action_auth(fail) fw_nextjs_middleware_matcher(fail) fw_nextjs_fetch_cache(warn) fw_nextjs_headers_server_only(fail) fw_nextjs_dynamic_params(warn) fw_nextjs_image_optimize(warn) fw_nextjs_metadata_api(warn) fw_nextjs_router_conflict(fail) fw_nextjs_revalidate(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 Next.js 15.x / 16.x 官方文档
_fw_nextjs_check() {
  echo "  [nextjs] Next.js 15.x / 16.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${NEXTJS_SRC_GLOBS[@]+"${NEXTJS_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "nextjs: NEXTJS_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_js_head（仅剥离行首 // 注释与块注释行，保留行内 //，避免误伤 URL 中的 https://）

  # 判断文件首行是否标 'use client' / "use client"
  _fw_nextjs_is_client() {
    local firstline
    firstline=$(sed -n '1p' "$1" 2>/dev/null)
    printf '%s' "$firstline" | grep -qE "^'use client'|^\"use client\"" 2>/dev/null
  }

  # ====================================================================
  # fw_nextjs_use_client(fail)：Server Component 禁用 Hook/浏览器 API
  # ====================================================================
  local uc_bad=""
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.tsx|*.jsx|*.ts|*.js)
        ;;
      *) continue ;;
    esac
    if _fw_nextjs_is_client "$f"; then
      continue
    fi
    local body
    body=$(_fw_strip_comments_js_head "$f")
    # 跳过 'use server' 文件（Server Action 文件本身用 next/headers 等服务端 API）
    if printf '%s' "$body" | head -1 | grep -qE "^'use server'|^\"use server\"" 2>/dev/null; then
      continue
    fi
    if printf '%s\n' "$body" | grep -qE 'useState\(|useEffect\(|useRef\(|useMemo\(|useCallback\(|window\.|document\.|localStorage\.' 2>/dev/null; then
      local ln
      # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
      ln=$(printf '%s\n' "$body" | grep -nE 'useState\(|useEffect\(|useRef\(|window\.|document\.|localStorage\.' 2>/dev/null | head -1 || true)
      uc_bad="${uc_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_nextjs_use_client "$uc_bad" "Server Component 内用 Hook/浏览器 API（须文件首行标 'use client'）" "交互组件均标 'use client'（或无 Hook/浏览器 API）"

  # ====================================================================
  # fw_nextjs_server_action_auth(fail)：Server Action 须显式鉴权
  # ====================================================================
  local sa_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_js_head "$f")
    # 文件级 'use server' 或函数级 'use server' 标注
    local is_server_action=0
    if printf '%s' "$body" | head -1 | grep -qE "^'use server'|^\"use server\"" 2>/dev/null; then
      is_server_action=1
    fi
    # 检出 async function ...Action 模式
    if printf '%s\n' "$body" | grep -qE "async function [a-zA-Z]+Action" 2>/dev/null; then
      is_server_action=1
    fi
    [[ "$is_server_action" -eq 0 ]] && continue
    # async 函数体内须含鉴权关键字
    if ! printf '%s\n' "$body" | grep -qE '\bauth\(|getServerSession|requireAuth|currentUser|getSession|cookies\(\)\.get' 2>/dev/null; then
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE "'use server'|async function [a-zA-Z]+Action" 2>/dev/null | head -1 || true)
      sa_bad="${sa_bad}${f}:${ln}: Server Action 未检出鉴权
"
    fi
  done
  _fw_report fail fw_nextjs_server_action_auth "$sa_bad" "Server Action 未显式鉴权（等价公开端点，任意客户端可调，越权风险 CWE-862）" "Server Action 均配鉴权（或无 Server Action）"

  # ====================================================================
  # fw_nextjs_middleware_matcher(fail)：中间件须配 matcher
  # ====================================================================
  local mw_file="" mw_found=0
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      middleware.ts|middleware.js|middleware.mjs)
        mw_found=1
        mw_file="$f"
        break
        ;;
    esac
  done
  if [[ "$mw_found" -eq 0 ]]; then
    pass "fw_nextjs_middleware_matcher: 无中间件，跳过"
  else
    if grep -qE 'matcher' "$mw_file" 2>/dev/null; then
      pass "fw_nextjs_middleware_matcher: 中间件已配 matcher"
    else
      fail "fw_nextjs_middleware_matcher: middleware.ts 未配 matcher（默认全站拦截，性能差且误拦静态资源）:
${mw_file}"
    fi
  fi

  # ====================================================================
  # fw_nextjs_fetch_cache(warn)：fetch 须显式声明缓存语义
  # ====================================================================
  local fc_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_js_head "$f")
    local lines ln rest
    lines=$(printf '%s\n' "$body" | grep -nE '\bfetch\(' 2>/dev/null || true)
    [[ -z "$lines" ]] && continue
    while IFS=: read -r lnum rest; do
      [[ -z "$lnum" ]] && continue
      [[ "$lnum" =~ ^[0-9]+$ ]] || continue
      # 取该行起 4 行窗口检查 cache:/next: 参数
      local window
      window=$(printf '%s\n' "$body" | sed -n "${lnum},$((lnum+4))p" 2>/dev/null)
      if ! printf '%s\n' "$window" | grep -qE 'cache:[[:space:]]*|next:[[:space:]]*\{|revalidate:' 2>/dev/null; then
        fc_bad="${fc_bad}${f}:${lnum}: fetch 无 cache:/next: 参数
"
      fi
    done <<< "$lines"
  done
  _fw_report warn fw_nextjs_fetch_cache "$fc_bad" "fetch 未显式声明缓存语义（Next.js 15+ 默认变更，须显式 cache:/next:）" "fetch 均声明缓存语义（或无 fetch）"

  # ====================================================================
  # fw_nextjs_headers_server_only(fail)：cookies/headers 禁 Client 调用
  # ====================================================================
  local hs_bad=""
  for f in "${srcarr[@]}"; do
    if ! _fw_nextjs_is_client "$f"; then
      continue
    fi
    local body
    body=$(_fw_strip_comments_js_head "$f")
    if printf '%s\n' "$body" | grep -qE "from 'next/headers'|from \"next/headers\"|\bcookies\(\)|\bheaders\(\)" 2>/dev/null; then
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE "from 'next/headers'|cookies\(\)|headers\(\)" 2>/dev/null | head -1 || true)
      hs_bad="${hs_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_nextjs_headers_server_only "$hs_bad" "Client Component 调用 next/headers 的 cookies()/headers()（服务端 API，Client 禁用）" "cookies/headers 仅在 Server Component 使用"

  # ====================================================================
  # fw_nextjs_dynamic_params(warn)：动态路由须声明 generateStaticParams/dynamic
  # ====================================================================
  local dp_bad=""
  for f in "${srcarr[@]}"; do
    # 动态路由文件路径含 [param]
    if printf '%s' "$f" | grep -qE '\[[a-zA-Z_][a-zA-Z0-9_]*\]' 2>/dev/null; then
      case "$(basename "$f")" in
        page.tsx|page.jsx|page.ts|page.js)
          ;;
        *) continue ;;
      esac
      if ! grep -qE 'generateStaticParams|export const dynamic' "$f" 2>/dev/null; then
        dp_bad="${dp_bad}${f}
"
      fi
    fi
  done
  _fw_report warn fw_nextjs_dynamic_params "$dp_bad" "动态路由页未声明 generateStaticParams/dynamic（静态/动态判定不确定）" "动态路由均声明静态化策略（或无动态路由）"

  # ====================================================================
  # fw_nextjs_image_optimize(warn)：禁裸 <img>
  # ====================================================================
  local img_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_js_head "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '<img[[:space:]]' 2>/dev/null || true)
    [[ -n "$ln" ]] && img_bad="${img_bad}${f}:${ln}
"
  done
  _fw_report warn fw_nextjs_image_optimize "$img_bad" "检出裸 <img>（须用 next/image 优化：resize/WebP/lazy）" "未检出裸 <img>"

  # ====================================================================
  # fw_nextjs_metadata_api(warn)：App Router 须用 metadata API
  # ====================================================================
  local is_app_router=0
  for f in "${srcarr[@]}"; do
    if printf '%s' "$f" | grep -qE '/app/' 2>/dev/null; then
      is_app_router=1
      break
    fi
  done
  if [[ "$is_app_router" -eq 0 ]]; then
    pass "fw_nextjs_metadata_api: 非 App Router 项目，跳过"
  else
    local md_bad=""
    for f in "${srcarr[@]}"; do
      local body
      body=$(_fw_strip_comments_js_head "$f")
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE '<Head>|document\.head|next/head' 2>/dev/null || true)
      [[ -n "$ln" ]] && md_bad="${md_bad}${f}:${ln}
"
    done
    _fw_report warn fw_nextjs_metadata_api "$md_bad" "App Router 项目用 <Head>/document.head/next/head（须用 export const metadata / generateMetadata）" "未检出手动 head 操作"
  fi

  # ====================================================================
  # fw_nextjs_router_conflict(fail)：pages/ 与 app/ 同路径双定义
  # ====================================================================
  local pages_paths app_paths conflict=""
  # 2026-07-20 P1 沉睡修复：原 sed 以 `|` 为分隔符且模式内含 ERE 交替 `(tsx|jsx|ts|js)`，
  # GNU/BSD sed 均解析报错（gsed: unknown option to `s'；BSD: parentheses not balanced），
  # 2>/dev/null 吞错后 pages_paths/app_paths 恒为空 → 本门禁沉睡恒 pass。
  # 仅将两条含交替的 s 命令分隔符 `|`→`:`（路径不含 `:`），判定语义与输出行不动。
  # 对照证据：修复前两侧 stderr 报错且 stdout 为空；修复后同一合成样本 GNU/BSD 输出逐字节一致。
  pages_paths=$(printf '%s\n' "${srcarr[@]}" | grep -E '/pages/' 2>/dev/null \
    | sed -E 's|.*/pages/||; s:/page\.(tsx|jsx|ts|js)$:/:; s:\.(tsx|jsx|ts|js)$::; s:^index$::' 2>/dev/null || true)
  app_paths=$(printf '%s\n' "${srcarr[@]}" | grep -E '/app/' 2>/dev/null \
    | sed -E 's|.*/app/||; s:/page\.(tsx|jsx|ts|js)$::; s:\.(tsx|jsx|ts|js)$::' 2>/dev/null || true)
  if [[ -n "$pages_paths" && -n "$app_paths" ]]; then
    local p
    while IFS= read -r p; do
      [[ -z "$p" ]] && continue
      if printf '%s\n' "$app_paths" | grep -qx "$p" 2>/dev/null; then
        conflict="${conflict}${p}
"
      fi
    done <<< "$pages_paths"
  fi
  _fw_report fail fw_nextjs_router_conflict "$conflict" "pages/ 与 app/ 同路径双定义（路由冲突报错）" "无 pages/app 同路径冲突（或仅一种 Router）"

  # ====================================================================
  # fw_nextjs_revalidate(warn)：revalidate 须合理
  # ====================================================================
  local rev_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_js_head "$f")
    # export const revalidate = N
    local val
    val=$(printf '%s\n' "$body" | grep -oE 'export const revalidate[[:space:]]*=[[:space:]]*[0-9]+' 2>/dev/null \
      | grep -oE '[0-9]+$' 2>/dev/null || true)
    [[ -z "$val" ]] && continue
    # 值为 0 或 >86400（1 天）→ warn
    if [[ "$val" -eq 0 || "$val" -gt 86400 ]]; then
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE "export const revalidate" 2>/dev/null | head -1 || true)
      rev_bad="${rev_bad}${f}:${ln}: revalidate=${val}
"
    fi
  done
  _fw_report warn fw_nextjs_revalidate "$rev_bad" "revalidate 值为 0 或 >86400（0=全动态，>1天=数据陈旧，须确认）" "未检出异常 revalidate（或无 revalidate）"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

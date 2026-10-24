# ruleset: nuxt  requires_conf: NUXT_SRC_GLOBS
# gates: fw_nuxt_fetch_key(fail) fw_nuxt_hydration(fail) fw_nuxt_usestate_key(fail) fw_nuxt_autoimport_conflict(fail) fw_nuxt_middleware_scope(warn) fw_nuxt_component_naming(warn) fw_nuxt_composable_export(warn) fw_nuxt_server_boundary(fail) fw_nuxt_seo_meta(warn) fw_nuxt_error_page(warn) fw_nuxt_runtime_config_secret(fail)
# harvested-from: P5 范例（2026-07-17），规律源自 Nuxt 4.x 官方文档
_fw_nuxt_check() {
  echo "  [nuxt] Nuxt 4.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${NUXT_SRC_GLOBS[@]+"${NUXT_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "nuxt: NUXT_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_js_head（仅剥离行首 // 注释与块注释行，保留行内 //，避免误伤 URL）

  local f

  # ====================================================================
  # fw_nuxt_fetch_key(fail)：useAsyncData 须 key，useFetch 动态 url 须 key
  # ====================================================================
  local fk_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_js_head "$f")
    # useAsyncData( 无 key 参数 → fail
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'useAsyncData\(' 2>/dev/null || true)
    if [[ -n "$ln" ]]; then
      # 检查 useAsyncData 调用窗口内是否含 key:
      local firstline
      firstline=$(printf '%s\n' "$ln" | head -1 | cut -d: -f1)
      if [[ -n "$firstline" ]]; then
        local window
        window=$(printf '%s\n' "$body" | sed -n "${firstline},$((firstline+6))p" 2>/dev/null)
        if ! printf '%s\n' "$window" | grep -qE "key:[[:space:]]*|useAsyncData\([[:space:]]*['\"]" 2>/dev/null; then
          fk_bad="${fk_bad}${f}:${firstline}: useAsyncData 无 key 参数
"
        fi
      fi
    fi
    # useFetch( 动态 url（含 ${} 模板或变量拼接）无 key → warn（并入 fk_bad warn 级，但门禁为 fail，故仅 useAsyncData fail）
  done
  _fw_report fail fw_nuxt_fetch_key "$fk_bad" "useAsyncData 调用未传 key 参数（无 url 须必传 key，否则 key 推导脆弱致缓存串）" "useAsyncData 均传 key（或无 useAsyncData）"

  # ====================================================================
  # fw_nuxt_hydration(fail)：render 阶段禁 Date.now/Math.random/uuid
  # ====================================================================
  local hyd_bad=""
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.vue) ;;
      *) continue ;;
    esac
    local body
    body=$(_fw_strip_comments_js_head "$f")
    # 仅检查 <script setup> 顶层（粗粒度：检出这些 API 调用即可，onMounted 内的由人工区分）
    # 简化：检出 Date.now()/Math.random()/crypto.randomUUID() 且同文件无 onMounted 包裹 → fail
    local has_random has_mounted
    has_random=$(printf '%s\n' "$body" | grep -cE 'Date\.now\(\)|Math\.random\(\)|crypto\.randomUUID\(\)|new Date\(\)' 2>/dev/null || true)
    has_mounted=$(printf '%s\n' "$body" | grep -cE 'onMounted\(' 2>/dev/null || true)
    if [[ "${has_random:-0}" -gt 0 && "${has_mounted:-0}" -eq 0 ]]; then
      local ln
      # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
      ln=$(printf '%s\n' "$body" | grep -nE 'Date\.now\(\)|Math\.random\(\)|crypto\.randomUUID\(\)|new Date\(\)' 2>/dev/null | head -1 || true)
      hyd_bad="${hyd_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_nuxt_hydration "$hyd_bad" "render 阶段用 Date.now/Math.random/uuid（SSR 与客户端 hydration 不一致）" "未检出 render 阶段随机 API（或已用 onMounted 包裹）"

  # ====================================================================
  # fw_nuxt_usestate_key(fail)：useState 须 key
  # ====================================================================
  local us_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_js_head "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'useState\(' 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    local firstline
    firstline=$(printf '%s\n' "$ln" | head -1 | cut -d: -f1)
    if [[ -n "$firstline" ]]; then
      local window
      window=$(printf '%s\n' "$body" | sed -n "${firstline},$((firstline+4))p" 2>/dev/null)
      # useState 须有 key（首参为字符串字面量）
      if ! printf '%s\n' "$window" | grep -qE "useState\([[:space:]]*['\"]" 2>/dev/null; then
        us_bad="${us_bad}${f}:${firstline}: useState 无 key
"
      fi
    fi
  done
  _fw_report fail fw_nuxt_usestate_key "$us_bad" "useState 调用未传 key（须唯一稳定 key，否则状态互相覆盖）" "useState 均传 key（或无 useState）"

  # ====================================================================
  # fw_nuxt_autoimport_conflict(fail)：composables/ 导出禁与内置同名
  # ====================================================================
  local ai_bad=""
  local builtin_re='useState|useFetch|useAsyncData|useHead|useSeoMeta|ref|reactive|computed|watch|watchEffect|navigateTo|useRouter|useRoute|defineNuxtPlugin|defineNuxtRouteMiddleware'
  for f in "${srcarr[@]}"; do
    if printf '%s' "$f" | grep -qE '/composables/' 2>/dev/null; then
      local body
      body=$(_fw_strip_comments_js_head "$f")
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE "export (function|const) (${builtin_re})\b" 2>/dev/null || true)
      [[ -n "$ln" ]] && ai_bad="${ai_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_nuxt_autoimport_conflict "$ai_bad" "composables/ 导出与 Nuxt 内置同名（覆盖内置致行为异常）" "未检出 composable 与内置同名"

  # ====================================================================
  # fw_nuxt_middleware_scope(warn)：全局中间件页面级逻辑
  # ====================================================================
  local mw_bad=""
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.global.ts)
        local body
        body=$(_fw_strip_comments_js_head "$f")
        # 含多个特定路径判断（>2 处 to.path 判断）→ 疑似页面级逻辑
        local cnt
        cnt=$(printf '%s\n' "$body" | grep -cE "to\.path|to\.name|to\.fullPath" 2>/dev/null || true)
        if [[ "${cnt:-0}" -gt 2 ]]; then
          mw_bad="${mw_bad}${f}: 全局中间件含 ${cnt} 处路径判断（疑似页面级逻辑，应拆命名中间件）
"
        fi
        ;;
    esac
  done
  _fw_report warn fw_nuxt_middleware_scope "$mw_bad" "全局中间件含页面级逻辑（应拆命名中间件按页引用）" "全局中间件仅做全局逻辑（或无全局中间件）"

  # ====================================================================
  # fw_nuxt_component_naming(warn)：components/ 不同目录同名
  # ====================================================================
  local comp_names="" dup_bad=""
  for f in "${srcarr[@]}"; do
    if printf '%s' "$f" | grep -qE '/components/' 2>/dev/null; then
      case "$(basename "$f")" in
        *.vue)
          comp_names="${comp_names}$(basename "$f")
"
          ;;
      esac
    fi
  done
  if [[ -n "$comp_names" ]]; then
    # 重复文件名
    local dups
    dups=$(printf '%s' "$comp_names" | sort | uniq -d 2>/dev/null || true)
    if [[ -n "$dups" ]]; then
      dup_bad="$dups"
    fi
  fi
  _fw_report warn fw_nuxt_component_naming "$dup_bad" "components/ 不同目录同名 .vue（自动导入冲突）" "未检出同名组件（或无 components/）"

  # ====================================================================
  # fw_nuxt_composable_export(warn)：composables/ 导出 const/class
  # ====================================================================
  local ce_bad=""
  for f in "${srcarr[@]}"; do
    if printf '%s' "$f" | grep -qE '/composables/' 2>/dev/null; then
      local body
      body=$(_fw_strip_comments_js_head "$f")
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE 'export const [a-zA-Z]+ *=|export class ' 2>/dev/null || true)
      [[ -n "$ln" ]] && ce_bad="${ce_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_nuxt_composable_export "$ce_bad" "composables/ 导出 const/class（约定导出函数 use*，常量移 utils/）" "未检出 const/class 导出（或无 composables/）"

  # ====================================================================
  # fw_nuxt_server_boundary(fail)：app/ 禁 import server/
  # ====================================================================
  local sb_bad=""
  for f in "${srcarr[@]}"; do
    # 仅检查客户端目录（app/ 下，排除 server/ 自身）
    if printf '%s' "$f" | grep -qE '/app/' 2>/dev/null; then
      local body
      body=$(_fw_strip_comments_js_head "$f")
      local ln
      ln=$(printf '%s\n' "$body" | grep -nE "from ['\"](~|~/|\\.*/)(server|server/)" 2>/dev/null || true)
      [[ -n "$ln" ]] && sb_bad="${sb_bad}${f}:${ln}
"
    fi
  done
  _fw_report fail fw_nuxt_server_boundary "$sb_bad" "app/ 下文件 import server/ 内部（服务端代码泄露到客户端 bundle）" "未检出 client import server 内部"

  # ====================================================================
  # fw_nuxt_seo_meta(warn)：禁手动 document.head/title
  # ====================================================================
  local seo_bad=""
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.vue) ;;
      *) continue ;;
    esac
    local body
    body=$(_fw_strip_comments_js_head "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'document\.head|document\.title' 2>/dev/null || true)
    [[ -n "$ln" ]] && seo_bad="${seo_bad}${f}:${ln}
"
  done
  _fw_report warn fw_nuxt_seo_meta "$seo_bad" "组件内 document.head/document.title（须用 useSeoMeta/useHead，SSR 友好）" "未检出手动 head 操作"

  # ====================================================================
  # fw_nuxt_error_page(warn)：须配 error.vue
  # ====================================================================
  local has_error=0
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      error.vue)
        has_error=1
        break
        ;;
    esac
  done
  if [[ "$has_error" -eq 1 ]]; then
    pass "fw_nuxt_error_page: 已配 error.vue"
  else
    warn "fw_nuxt_error_page: 未检出 error.vue（生产错误页不友好/可能泄露堆栈）"
  fi

  # ====================================================================
  # fw_nuxt_runtime_config_secret(fail)：public 禁含敏感值
  # ====================================================================
  local rc_bad=""
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      nuxt.config.ts|nuxt.config.js|nuxt.config.mjs) ;;
      *) continue ;;
    esac
    local body
    body=$(_fw_strip_comments_js_head "$f")
    # 检出 public: 块内含 secret/password/apiKey/privateKey/token
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '(secret|password|api[_-]?[Kk]ey|private[_-]?[Kk]ey|token)[[:space:]]*:' 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    # 该敏感行是否在 public 块内（前后文出现 public:）
    local firstline
    firstline=$(printf '%s\n' "$ln" | head -1 | cut -d: -f1)
    if [[ -n "$firstline" ]]; then
      # 检查 firstline 前 15 行内是否含 public: 且无 runtimeConfig 顶层（简化启发式）
      local before
      before=$(printf '%s\n' "$body" | sed -n "$((firstline > 15 ? firstline - 15 : 1)),${firstline}p" 2>/dev/null)
      if printf '%s\n' "$before" | grep -qE 'public:' 2>/dev/null; then
        rc_bad="${rc_bad}${f}:${firstline}: public 块含敏感 key
"
      fi
    fi
  done
  _fw_report fail fw_nuxt_runtime_config_secret "$rc_bad" "runtimeConfig.public 含敏感 key（public 打包进客户端 bundle 泄露 CWE-312）" "未检出 public 含敏感值（或无 nuxt.config）"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

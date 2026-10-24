# ruleset: gin  requires_conf: GIN_SRC_GLOBS
# gates: fw_gin_should_bind_not_bind(warn) fw_gin_context_copy(fail) fw_gin_recovery_middleware(fail) fw_gin_graceful_shutdown(warn) fw_gin_abort_return(warn) fw_gin_binding_validator(warn) fw_gin_cors(fail) fw_gin_auth_middleware(fail) fw_gin_upload_limit(warn) fw_gin_gzip(warn) fw_gin_error_handling(warn) fw_gin_rate_limit(warn) fw_gin_health_check(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 Gin 1.10.x ~ 1.12.x 官方文档与 gin-contrib 实践
_fw_gin_check() {
  echo "  [gin] Gin 1.10.x / 1.11.x / 1.12.x 框架规律"

  # ---------- 收集源文件清单（go + go.mod + 配置统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${GIN_SRC_GLOBS[@]+"${GIN_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "gin: GIN_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 go 源码 vs go.mod（go.mod 单独成组供依赖识别）
  local goarr=() modarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.go) goarr+=("$f") ;;
      go.mod|go.sum) modarr+=("$f") ;;
    esac
  done

  # 代码正文过滤：调公共库 _fw_strip_comments_c_inline（C 系变体，多剥行内 /* */）

  local g ln

  # ====================================================================
  # fw_gin_should_bind_not_bind(warn)：禁用 c.Bind 系列（自动 400 + Abort）
  # ====================================================================
  local bind_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    ln=$(_fw_strip_comments_c_inline "$g" | grep -nE 'c\.(Bind|BindJSON|BindQuery|BindURI|BindWith|BindHeader|BindXML|BindYAML|BindForm)\(' || true)
    [[ -n "$ln" ]] && bind_bad="${bind_bad}${g}:${ln}
"
  done
  _fw_report warn fw_gin_should_bind_not_bind "$bind_bad" "检出 c.Bind 系列（Must bind 自动 400+Abort，须改 ShouldBind 系列由开发者控错）" "未检出 c.Bind 系列（已用 ShouldBind 系列）"

  # ====================================================================
  # fw_gin_context_copy(fail)：goroutine 内引用 c 须 c.Copy()
  # ====================================================================
  local copy_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # 命中 go func / go <fn>( 启动协程的行号
    local goline
    goline=$(printf '%s\n' "$code" | grep -nE '\bgo[[:space:]]+(func|\w+\()' || true)
    [[ -z "$goline" ]] && continue
    # 文件级是否存在 c.Copy()
    local has_copy=0
    _fw_strip_comments_c_inline "$g" | grep -qE '\.Copy\(\)' && has_copy=1
    # 若文件内有 go 语句且引用了 c (gin.Context)，但全文无 c.Copy() → fail
    if [[ "$has_copy" -eq 0 ]]; then
      # 检查 go 语句所在行及其后 15 行内是否引用 c. / c) / c,
      local bad_lines=""
      while IFS= read -r gl; do
        [[ -z "$gl" ]] && continue
        local lineno=${gl%%:*}
        local start=$((lineno))
        local end=$((lineno + 15))
        local block
        block=$(printf '%s\n' "$code" | sed -n "${start},${end}p")
        if printf '%s\n' "$block" | grep -qE '\bc\.(Request|JSON|Param|Query|Get|PostForm|Header|Abort|Next|Set|Done)|\bc,\s|\bc\)|\bc\s+\)'; then
          bad_lines="${bad_lines}${gl}
"
        fi
      done <<< "$goline"
      [[ -n "$bad_lines" ]] && copy_bad="${copy_bad}${g}: goroutine 引用 gin.Context 但无 c.Copy():
${bad_lines}
"
    fi
  done
  _fw_report fail fw_gin_context_copy "$copy_bad" "goroutine 内直接用 gin.Context（Context 对象池复用，须 c.Copy() 只读副本，否则数据竞争/串响应）" "goroutine 内 Context 均经 c.Copy() 或无跨协程用 c"

  # ====================================================================
  # fw_gin_recovery_middleware(fail)：gin.New() 须配 Recovery 且置首
  # ====================================================================
  local has_new=0 has_default=0 has_recovery=0 recovery_first=1 use_order=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE 'gin\.New\(\)' && has_new=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'gin\.Default\(\)' && has_default=1
    if _fw_strip_comments_c_inline "$g" | grep -qE 'gin\.Recovery\(\)'; then
      has_recovery=1
      # 取所有 .Use( 行号，判断 Recovery 是否首个
      local uses rec_line
      uses=$(_fw_strip_comments_c_inline "$g" | grep -nE '\.Use\(' || true)
      # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
      rec_line=$(_fw_strip_comments_c_inline "$g" | grep -nE 'gin\.Recovery\(\)' | head -1 | cut -d: -f1 || true)
      if [[ -n "$uses" && -n "$rec_line" ]]; then
        local first_use
        first_use=$(printf '%s\n' "$uses" | head -1 | cut -d: -f1)
        if [[ -n "$first_use" && "$first_use" -ne "$rec_line" && "$rec_line" -gt "$first_use" ]]; then
          recovery_first=0
          use_order="${use_order}${g}: Recovery(line ${rec_line}) 非首中间件(首 Use line ${first_use})
"
        fi
      fi
    fi
  done
  if [[ "$has_new" -eq 1 && "$has_recovery" -eq 0 && "$has_default" -eq 0 ]]; then
    fail "fw_gin_recovery_middleware: gin.New() 未配 gin.Recovery()（panic 未捕获将崩进程）"
  elif [[ "$recovery_first" -eq 0 ]]; then
    warn "fw_gin_recovery_middleware: gin.Recovery() 非首个中间件（panic 在其之前的中间件中未被捕获）:
${use_order}"
  else
    pass "fw_gin_recovery_middleware: Recovery 已启用且置首（或用 gin.Default）"
  fi

  # ====================================================================
  # fw_gin_graceful_shutdown(warn)：禁用 engine.Run/ListenAndServe 无 Shutdown
  # ====================================================================
  local run_hit=0 shutdown_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE '\.Run\(|http\.ListenAndServe\(' && run_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE '\.Shutdown\(' && shutdown_hit=1
  done
  if [[ "$run_hit" -eq 1 && "$shutdown_hit" -eq 0 ]]; then
    warn "fw_gin_graceful_shutdown: 检出 engine.Run/ListenAndServe 但无 Shutdown（SIGTERM 强断在途请求，须 http.Server.Shutdown）"
  else
    pass "fw_gin_graceful_shutdown: 已配 Shutdown 或无 Run 阻塞"
  fi

  # ====================================================================
  # fw_gin_abort_return(warn)：c.Abort() 须配 return
  # ====================================================================
  local abort_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    local alines
    alines=$(printf '%s\n' "$code" | grep -nE 'c\.Abort(WithStatus|WithStatusJSON|WithStatusString|WithError)?\(' || true)
    [[ -z "$alines" ]] && continue
    while IFS= read -r al; do
      [[ -z "$al" ]] && continue
      local lineno=${al%%:*}
      # 检查同行是否有 return
      if printf '%s' "$al" | grep -qE 'return'; then
        continue
      fi
      # 检查下一非空行是否为 return
      local next
      next=$(printf '%s\n' "$code" | sed -n "$((lineno+1)),\$p" | grep -vE '^[[:space:]]*$' | head -1 || true)
      if printf '%s' "$next" | grep -qE '^[[:space:]]*return[[:space:]]*$|^[[:space:]]*return[[:space:]]+'; then
        continue
      fi
      # 下一行是 } 视为块结束：仅当该 } 之后无更多非空代码（即函数体末尾）才接受；
      # 若 } 之后还有语句（如 } c.JSON(...)），说明 Abort 在 if/for 内未 return，函数继续执行 → 违规
      if printf '%s' "$next" | grep -qE '^[[:space:]]*\}'; then
        # next 形如 "  }" 或 "} c.JSON(...)" —— 若同行 } 后有语句，已违规
        if printf '%s' "$next" | grep -qE '\}[[:space:]]*[^[:space:]]'; then
          abort_bad="${abort_bad}${g}:${al}
"
          continue
        fi
        # } 后下一非空行须为空或函数级 }（缩进更浅），否则为 if/for 内部块未 return
        local after_brace
        after_brace=$(printf '%s\n' "$code" | sed -n "$((lineno+1)),\$p" | grep -vE '^[[:space:]]*$' | sed -n '2p')
        if [[ -n "$after_brace" ]] && ! printf '%s' "$after_brace" | grep -qE '^[[:space:]]*\}'; then
          abort_bad="${abort_bad}${g}:${al}
"
        fi
        continue
      fi
      abort_bad="${abort_bad}${g}:${al}
"
    done <<< "$alines"
  done
  _fw_report warn fw_gin_abort_return "$abort_bad" "c.Abort() 后未 return（Abort 仅阻后续中间件，当前函数仍执行，须 Abort+return）" "Abort 均配 return"

  # ====================================================================
  # fw_gin_binding_validator(warn)：ShouldBind 须配 binding: 标签
  # ====================================================================
  local sb_hit=0 tag_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE 'c\.ShouldBind' && sb_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'binding:"' && tag_hit=1
  done
  if [[ "$sb_hit" -eq 1 && "$tag_hit" -eq 0 ]]; then
    warn "fw_gin_binding_validator: 检出 ShouldBind 但无 binding:\"...\" 标签（缺标签则任何输入都通过校验）"
  else
    pass "fw_gin_binding_validator: ShouldBind 配合 binding 标签或无 ShouldBind"
  fi

  # ====================================================================
  # fw_gin_cors(fail)：AllowAllOrigins + AllowCredentials 禁止共存
  # ====================================================================
  local cors_all_cred_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    if printf '%s\n' "$code" | grep -qE 'AllowAllOrigins[[:space:]]*:[[:space:]]*true'; then
      if printf '%s\n' "$code" | grep -qE 'AllowCredentials[[:space:]]*:[[:space:]]*true'; then
        cors_all_cred_bad="${cors_all_cred_bad}${g}: AllowAllOrigins=true + AllowCredentials=true（浏览器禁止 * + 凭证共存，CORS 失效）
"
      fi
    fi
  done
  _fw_report fail fw_gin_cors "$cors_all_cred_bad" "AllowAllOrigins 与 AllowCredentials 同时 true（浏览器规范禁止 * + 凭证，CORS 凭证请求全部被拒）" "未检出禁用组合"

  # ====================================================================
  # fw_gin_auth_middleware(fail)：鉴权用 c.Query("token") / 无 Abort 分支
  # ====================================================================
  local query_token_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    ln=$(_fw_strip_comments_c_inline "$g" | grep -nE 'c\.Query\("(token|access_token|jwt)"\)|c\.Query\("auth"\)' || true)
    [[ -n "$ln" ]] && query_token_bad="${query_token_bad}${g}:${ln}
"
  done
  _fw_report fail fw_gin_auth_middleware "$query_token_bad" "鉴权 token 取自 URL query（会进 access log / Referer 泄露，须用 Authorization header）" "未检出 URL query 取 token"

  # ====================================================================
  # fw_gin_upload_limit(warn)：FormFile/MultipartForm 须配 MaxMultipartMemory
  # ====================================================================
  local upload_hit=0 maxmem_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE 'c\.FormFile\(|c\.MultipartForm\(' && upload_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'MaxMultipartMemory' && maxmem_hit=1
  done
  if [[ "$upload_hit" -eq 1 && "$maxmem_hit" -eq 0 ]]; then
    warn "fw_gin_upload_limit: 检出 FormFile/MultipartForm 但无 MaxMultipartMemory 设置（默认 32MB，大文件 DoS 风险）"
  else
    pass "fw_gin_upload_limit: 已配 MaxMultipartMemory 或无上传"
  fi

  # ====================================================================
  # fw_gin_gzip(warn)：gzip.Gzip 须配 WithExcludedExtensions/Paths
  # ====================================================================
  local gzip_hit=0 gzip_exclude_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE 'gzip\.Gzip\(' && gzip_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'WithExcludedExtensions|WithExcludedPaths|WithExcludedPathRegexps' && gzip_exclude_hit=1
  done
  if [[ "$gzip_hit" -eq 1 && "$gzip_exclude_hit" -eq 0 ]]; then
    warn "fw_gin_gzip: gzip.Gzip 未配 WithExcludedExtensions/Paths（已压缩内容二次压缩浪费 CPU）"
  else
    pass "fw_gin_gzip: 已配排除规则或无 gzip"
  fi

  # ====================================================================
  # fw_gin_error_handling(warn)：c.String(4xx/5xx) 须配合 c.Error 统一处理
  # ====================================================================
  local str_err_bad=0 has_cerror=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE 'c\.Error\(' && has_cerror=1
    if _fw_strip_comments_c_inline "$g" | grep -qE 'c\.String\((4[0-9]{2}|5[0-9]{2})'; then
      str_err_bad=1
    fi
  done
  if [[ "$str_err_bad" -eq 1 && "$has_cerror" -eq 0 ]]; then
    warn "fw_gin_error_handling: 检出 c.String(4xx/5xx) 错误响应但无 c.Error 统一累积（响应格式碎片化）"
  else
    pass "fw_gin_error_handling: 已用 c.Error 统一或无散落 c.String 错误"
  fi

  # ====================================================================
  # fw_gin_rate_limit(warn)：公开 POST 路由须配限流中间件
  # ====================================================================
  local public_post_hit=0 has_limiter=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    if _fw_strip_comments_c_inline "$g" | grep -qE '\.(POST|Any)\("[^"]*(/login|/signin|/sms|/register|/signup|/verify|/captcha)"'; then
      public_post_hit=1
    fi
    if _fw_strip_comments_c_inline "$g" | grep -qE 'limiter|tollbooth|rate\.|ratelimit|RateLimit|throttled'; then
      has_limiter=1
    fi
  done
  if [[ "$public_post_hit" -eq 1 && "$has_limiter" -eq 0 ]]; then
    warn "fw_gin_rate_limit: 检出公开 POST 路由(login/sms/register) 但无限流中间件（易被刷接口撞库/短信轰炸）"
  else
    pass "fw_gin_rate_limit: 已配限流或无公开 POST 路由"
  fi

  # ====================================================================
  # fw_gin_health_check(warn)：/healthz 不应走根级鉴权/限流
  # ====================================================================
  local root_auth_hit=0 root_limit_hit=0 health_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    # 根 Engine 上的 Use（非 group 内）启发式：engine.Use / r.Use（顶层变量）
    if _fw_strip_comments_c_inline "$g" | grep -qE '(engine|r|app|router|g)\.Use\('; then
      # 是否 Use 的是鉴权/限流
      if _fw_strip_comments_c_inline "$g" | grep -qE '\.Use\([^)]*(Auth|JWT|jwt|Session|auth|limiter|Limit|rate)'; then
        root_auth_hit=1
      fi
    fi
    if _fw_strip_comments_c_inline "$g" | grep -qE '"/healthz"|"/health"|"/ready"|"/readyz"'; then
      health_hit=1
    fi
  done
  if [[ "$health_hit" -eq 1 && "$root_auth_hit" -eq 1 ]]; then
    warn "fw_gin_health_check: 检出 /healthz 路由且根级 Use 鉴权/限流（探针会被 401/429 误杀，须 healthz 注册在鉴权前的根组）"
  else
    pass "fw_gin_health_check: 健康检查路由未受根级鉴权/限流拦截"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

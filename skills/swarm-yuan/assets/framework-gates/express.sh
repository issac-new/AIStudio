# ruleset: express  requires_conf: EXPRESS_SRC_GLOBS
# gates: fw_express_helmet(fail) fw_express_error_handler_last(fail) fw_express_input_validation(warn) fw_express_body_limit(warn) fw_express_x_powered_by(warn) fw_express_router_module(warn) fw_express_async_error(warn) fw_express_static_cache(warn) fw_express_compression(warn) fw_express_node_env(warn) fw_express_rate_limit(warn) fw_express_cors(warn)
# harvested-from: P4 调研（2026-07-17），规律源自 Express 5.x 官方文档与迁移指南
_fw_express_check() {
  echo "  [express] Express 5.x / 4.x 框架规律"

  # ---------- 收集源文件清单（js/ts + package.json 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${EXPRESS_SRC_GLOBS[@]+"${EXPRESS_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "express: EXPRESS_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 js/ts 源码 vs package.json
  local jsarr=() pkgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.js|*.mjs|*.cjs|*.ts) jsarr+=("$f") ;;
      package.json) pkgarr+=("$f") ;;
    esac
  done

  # ====================================================================
  # fw_express_helmet(fail)：helmet 安全头基线
  # ====================================================================
  local helmet_hit
  helmet_hit=$(grep -rlE "require\(['\"]helmet['\"]\)|from['\"]helmet['\"]|helmet\(\)" "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$helmet_hit" ]]; then
    pass "fw_express_helmet: helmet 安全头已启用"
  else
    fail "fw_express_helmet: 未检出 helmet（生产基线安全头缺失 CWE-693，须 app.use(helmet())）"
  fi

  # ====================================================================
  # fw_express_error_handler_last(fail)：错误处理中间件（4 参数）须最后注册
  # ====================================================================
  local eh_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local badln
    badln=$(awk '
      /app\.use\([[:space:]]*(async[[:space:]]+)?(function[[:space:]]*)?\([[:space:]]*err[[:space:]]*,/ { errline=NR; next }
      /app\.use\([[:space:]]*(async[[:space:]]+)?(function[[:space:]]*)?\([[:space:]]*err[[:space:]]*\)/ { errline=NR; next }
      /app\.use\([[:space:]]*[A-Za-z0-9_.]*(errorHandler|errorMiddleware|handleError)[[:space:]]*\)/ { errline=NR; next }
      /app\.(use|get|post|put|delete|patch|all)\(/ { if (errline > 0 && NR > errline) { print NR; found=1 } }
      END { }
    ' "$f" 2>/dev/null || true)
    if [[ -n "$badln" ]]; then
      eh_bad="${eh_bad}${f}: 错误处理中间件之后仍注册路由/中间件（行 ${badln}）
"
    fi
  done
  _fw_report fail fw_express_error_handler_last "$eh_bad" "4 参数错误处理中间件须最后注册（在其后注册的路由错误无法被捕获）" "错误处理中间件位于最后或无 4 参数中间件"

  # ====================================================================
  # fw_express_input_validation(warn)：express-validator 等输入校验
  # ====================================================================
  local iv_hit
  iv_hit=$(grep -rlE 'express-validator|validationResult|param\(\)|query\(\)|body\(\)|checkSchema|joi|Joi|zod|yup|ajv|celebrate' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$iv_hit" ]]; then
    pass "fw_express_input_validation: 输入校验存在"
  else
    warn "fw_express_input_validation: 未检出输入校验（express-validator/joi/zod），外部输入须白名单校验 CWE-20"
  fi

  # ====================================================================
  # fw_express_body_limit(warn)：body 解析须配 limit
  # ====================================================================
  local bl_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE '(express|bodyParser)\.(json|urlencoded)\(\s*\)' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && bl_bad="${bl_bad}${f}:${ln}
"
  done
  _fw_report warn fw_express_body_limit "$bl_bad" "body 解析未配 limit（默认 100kb 可依业务调整，防大包 DoS CWE-400）" "body 解析已配 limit 或未使用 body 解析"

  # ====================================================================
  # fw_express_x_powered_by(warn)：app.disable('x-powered-by')
  # ====================================================================
  local xpb_hit
  # helmet({hidePoweredBy:true}) 或 helmet.hidePoweredBy() 同样禁 x-powered-by——单检 disable() 误报
  xpb_hit=$(grep -rlE "disable\(['\"]x-powered-by['\"]\)|hidePoweredBy" "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$xpb_hit" ]]; then
    pass "fw_express_x_powered_by: x-powered-by 已禁用"
  else
    warn "fw_express_x_powered_by: 未禁用 x-powered-by 响应头（泄露技术栈 CWE-200，须 app.disable('x-powered-by')）"
  fi

  # ====================================================================
  # fw_express_router_module(warn)：路由模块化 express.Router
  # ====================================================================
  local app_routes router_hit
  app_routes=$(grep -rlE 'app\.(get|post|put|delete|patch)\(' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  router_hit=$(grep -rlE 'express\.Router\(' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$app_routes" ]]; then
    pass "fw_express_router_module: 无 app 直挂路由"
  elif [[ -n "$router_hit" ]]; then
    pass "fw_express_router_module: express.Router 模块化存在"
  else
    warn "fw_express_router_module: 路由全部直挂 app 且无 express.Router 模块化（多路由项目须按领域拆 Router）:
${app_routes}"
  fi

  # ====================================================================
  # fw_express_async_error(warn)：Express 4 async 错误须转发；5.x 自动捕获
  # ====================================================================
  local ex_major="" p vline
  for p in "${pkgarr[@]+"${pkgarr[@]}"}"; do
    vline=$(grep -E '"express"[[:space:]]*:' "$p" 2>/dev/null | head -1 || true)
    if [[ -n "$vline" ]]; then
      vline=$(printf '%s' "$vline" | grep -oE '[0-9]+' | head -1 || true)
      [[ -n "$vline" && -z "$ex_major" ]] && ex_major="$vline"
    fi
  done
  local async_hit
  async_hit=$(grep -rlE 'async[[:space:]]*\([[:space:]]*(req|request)' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$async_hit" ]]; then
    pass "fw_express_async_error: 无 async 路由处理器"
  elif [[ "$ex_major" == "5" ]]; then
    pass "fw_express_async_error: Express 5.x 自动捕获 async 路由 Promise 拒绝"
  else
    local ae_ok=""
    ae_ok=$(grep -rlE 'express-async-errors|asyncHandler|asyncMiddleware|\.catch\(' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
    # Express 4 下逐文件确认 async 处理器含 try
    local ae_bad=""
    for f in $async_hit; do
      if ! grep -qE 'try[[:space:]]*\{|express-async-errors|\.catch\(|asyncHandler' "$f" 2>/dev/null; then
        ae_bad="${ae_bad}${f}
"
      fi
    done
    if [[ -n "$ae_ok" || -z "$ae_bad" ]]; then
      pass "fw_express_async_error: async 错误已转发/包裹（Express 版本=${ex_major:-待验证}）"
    else
      warn "fw_express_async_error: Express 4.x 下 async 路由 Promise 拒绝不会自动进入错误中间件（须 try/catch 转发 next(err) 或 express-async-errors；Express 5.x 起自动捕获，版本未检出时按待验证处理）:
${ae_bad}"
    fi
  fi

  # ====================================================================
  # fw_express_static_cache(warn)：express.static 须配 maxAge
  # ====================================================================
  local sc_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'express\.static\(' "$f" 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    if ! grep -qE 'maxAge|maxage|setHeaders|immutable' "$f" 2>/dev/null; then
      sc_bad="${sc_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_express_static_cache "$sc_bad" "express.static 未配 maxAge/缓存策略（静态资源无缓存头，性能损耗）" "静态资源已配缓存或未用 express.static"

  # ====================================================================
  # fw_express_compression(warn)：压缩中间件
  # ====================================================================
  local comp_hit
  comp_hit=$(grep -rlE "require\(['\"]compression['\"]\)|from['\"]compression['\"]|compression\(\)" "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$comp_hit" ]]; then
    pass "fw_express_compression: compression 压缩中间件已启用"
  else
    warn "fw_express_compression: 未检出 compression 中间件（文本响应未压缩，带宽与延迟损耗）"
  fi

  # ====================================================================
  # fw_express_node_env(warn)：生产 NODE_ENV=production
  # ====================================================================
  local ne_hit=""
  ne_hit=$(grep -rlE 'NODE_ENV' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  local p2
  for p2 in "${pkgarr[@]+"${pkgarr[@]}"}"; do
    if grep -qE 'NODE_ENV' "$p2" 2>/dev/null; then
      ne_hit="${ne_hit}${p2}
"
    fi
  done
  if [[ -n "$ne_hit" ]]; then
    pass "fw_express_node_env: NODE_ENV 配置存在（生产须 production，Express 缓存视图/少错误栈）"
  else
    warn "fw_express_node_env: 未检出 NODE_ENV 配置（生产须 NODE_ENV=production，否则视图不缓存且错误栈外露）"
  fi

  # ====================================================================
  # fw_express_rate_limit(warn)：速率限制
  # ====================================================================
  local rl_hit
  rl_hit=$(grep -rlE 'express-rate-limit|rate-limiter-flexible|rateLimit' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$rl_hit" ]]; then
    pass "fw_express_rate_limit: 速率限制存在"
  else
    warn "fw_express_rate_limit: 未检出速率限制（express-rate-limit），公开端点须限流防滥用 CWE-770"
  fi

  # ====================================================================
  # fw_express_cors(warn)：CORS 显式 origin 白名单
  # ====================================================================
  local cors_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'cors\(\s*\)' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && cors_bad="${cors_bad}${f}:${ln}
"
    ln=$(grep -nE "origin[[:space:]]*:[[:space:]]*['\"]\*['\"]|origin[[:space:]]*:[[:space:]]*true" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && cors_bad="${cors_bad}${f}:${ln}
"
  done
  _fw_report warn fw_express_cors "$cors_bad" "CORS 未显式配置 origin 白名单（cors() 空参 / origin:* 放行任意源 CWE-942）" "CORS origin 白名单已配或未启用 CORS"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

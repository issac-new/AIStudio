# ruleset: fastify  requires_conf: FASTIFY_SRC_GLOBS
# gates: fw_fastify_schema_validation(fail) fw_fastify_response_schema(warn) fw_fastify_encapsulation(warn) fw_fastify_onsend_return(fail) fw_fastify_error_handler(fail) fw_fastify_logger(warn) fw_fastify_plugin_order(warn) fw_fastify_decorate_reference(warn) fw_fastify_cors(warn) fw_fastify_rate_limit(warn) fw_fastify_auth(warn) fw_fastify_swagger(warn)
# harvested-from: P4 调研（2026-07-17），规律源自 Fastify 5.x 官方文档（https://fastify.dev/docs/latest/）
_fw_fastify_check() {
  echo "  [fastify] Fastify 5.x 框架规律"

  # ---------- 收集源文件清单（js/ts + package.json 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${FASTIFY_SRC_GLOBS[@]+"${FASTIFY_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "fastify: FASTIFY_SRC_GLOBS 未配置或无文件可检"
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

  # 路由声明文件（跨门禁复用）
  local route_files
  route_files=$(grep -rlE '(app|fastify|server|router)\.(get|post|put|delete|patch|route)\(' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)

  # ====================================================================
  # fw_fastify_schema_validation(fail)：路由必须声明 schema 校验
  # ====================================================================
  local sv_bad=""
  while IFS= read -r rf; do
    [[ -z "$rf" ]] && continue
    if ! grep -qE 'schema[[:space:]]*:' "$rf" 2>/dev/null; then
      sv_bad="${sv_bad}${rf}
"
    fi
  done <<< "$route_files"
  _fw_report fail fw_fastify_schema_validation "$sv_bad" "路由未声明 schema 校验（Ajv 输入白名单缺失 CWE-20，须配 schema.body/querystring/params）" "路由均声明 schema 或无路由"

  # ====================================================================
  # fw_fastify_response_schema(warn)：响应 schema 启用 fast-json-stringify
  # ====================================================================
  local rs_bad="" rs_has_schema=0
  while IFS= read -r rf; do
    [[ -z "$rf" ]] && continue
    if grep -qE 'schema[[:space:]]*:' "$rf" 2>/dev/null; then
      rs_has_schema=1
      if ! grep -qE 'response[[:space:]]*:' "$rf" 2>/dev/null; then
        rs_bad="${rs_bad}${rf}
"
      fi
    fi
  done <<< "$route_files"
  if [[ "$rs_has_schema" -eq 0 ]]; then
    pass "fw_fastify_response_schema: 无 schema 路由（由 fw_fastify_schema_validation 主检），跳过"
  elif [[ -n "$rs_bad" ]]; then
    warn "fw_fastify_response_schema: 路由 schema 缺 response 声明（序列化未走 fast-json-stringify 白名单，可能泄露内部字段 CWE-200）:
${rs_bad}"
  else
    pass "fw_fastify_response_schema: 响应 schema 已声明"
  fi

  # ====================================================================
  # fw_fastify_encapsulation(warn)：插件内 decorate 须确认封装隔离或 fp 包裹
  # ====================================================================
  local enc_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    # 插件函数签名（形参含 fastify）且体内有 .decorate(
    if ! grep -qE '\(fastify[,)]' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE '\.decorate(Request|Reply)?\(' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE "fastify-plugin|fp\(" "$f" 2>/dev/null; then
      enc_bad="${enc_bad}${f}
"
    fi
  done
  _fw_report warn fw_fastify_encapsulation "$enc_bad" "插件内 .decorate() 未用 fastify-plugin 包裹（封装上下文隔离，装饰器仅插件内可见；须确认隔离有意或用 fp 共享）" "插件装饰器封装处理明确（fp 包裹或无跨上下文共享）"

  # ====================================================================
  # fw_fastify_onsend_return(fail)：onSend 修改 payload 须 return/done
  # ====================================================================
  local os_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local badln
    badln=$(awk '
      /addHook\(['"'"']onSend['"'"']/ {
        win=NR+15; mut=0; ret=0; start=NR
      }
      NR>0 && NR<=win && win>0 {
        if ($0 ~ /payload\.(replace|toString|slice)|JSON\.stringify|newPayload/) mut=1
        if ($0 ~ /return[[:space:]]|done\(/) ret=1
        if (NR==win && mut==1 && ret==0) { print start; }
      }
    ' "$f" 2>/dev/null || true)
    if [[ -n "$badln" ]]; then
      os_bad="${os_bad}${f}: onSend 钩子（行 ${badln}）改写 payload 但未 return/done（修改静默丢弃）
"
    fi
  done
  _fw_report fail fw_fastify_onsend_return "$os_bad" "onSend 修改 payload 必须 return newPayload（async）或 done(null, payload)（callback），否则修改静默丢弃" "onSend payload 修改均有 return/done 或无 onSend"

  # ====================================================================
  # fw_fastify_error_handler(fail)：setErrorHandler 统一错误处理
  # ====================================================================
  if [[ -z "$route_files" ]]; then
    pass "fw_fastify_error_handler: 无路由，跳过"
  else
    local eh_hit
    eh_hit=$(grep -rlE 'setErrorHandler' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
    if [[ -n "$eh_hit" ]]; then
      pass "fw_fastify_error_handler: setErrorHandler 已配置"
    else
      fail "fw_fastify_error_handler: 存在路由但未配置 setErrorHandler（默认错误响应可能泄露内部细节 CWE-209，错误格式不收敛）"
    fi
  fi

  # ====================================================================
  # fw_fastify_logger(warn)：logger 选项 / pino 集成
  # ====================================================================
  local init_file="" lg_ok=0
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    if grep -qE "require\(['\"]fastify['\"]\)|from[[:space:]]+['\"]fastify['\"]" "$f" 2>/dev/null; then
      init_file="${init_file}${f}
"
      if grep -qE 'logger[[:space:]]*:|pino' "$f" 2>/dev/null; then
        lg_ok=1
      fi
    fi
  done
  if [[ -z "$init_file" ]]; then
    pass "fw_fastify_logger: 未定位 fastify 初始化文件，跳过"
  elif [[ "$lg_ok" -eq 1 ]]; then
    pass "fw_fastify_logger: logger/pino 已启用"
  else
    warn "fw_fastify_logger: fastify 初始化未启用 logger（内建 pino 默认关闭，无请求日志事故难回溯；生产须 JSON 输出勿用 pino-pretty）:
${init_file}"
  fi

  # ====================================================================
  # fw_fastify_plugin_order(warn)：register 须先于依赖路由
  # ====================================================================
  local po_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local route_ln reg_ln
    # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
    route_ln=$(grep -nE '(app|fastify|server|router)\.(get|post|put|delete|patch|route)\(' "$f" 2>/dev/null | head -1 | cut -d: -f1 || true)
    reg_ln=$(grep -nE '\.register\(' "$f" 2>/dev/null | head -1 | cut -d: -f1 || true)
    if [[ -n "$route_ln" && -n "$reg_ln" && "$route_ln" -lt "$reg_ln" ]]; then
      po_bad="${po_bad}${f}: 首个路由（行 ${route_ln}）先于首个 register（行 ${reg_ln}）声明
"
    fi
  done
  _fw_report warn fw_fastify_plugin_order "$po_bad" "路由先于插件注册声明（后注册插件的钩子/装饰器对先声明路由不生效，鉴权漏挂风险 CWE-862）" "插件注册先于路由或同文件无混排"

  # ====================================================================
  # fw_fastify_decorate_reference(warn)：decorateRequest/Reply 禁对象字面量
  # ====================================================================
  local dr_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'decorate(Request|Reply)\([^,]+,[[:space:]]*(\{|\[)' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && dr_bad="${dr_bad}${f}:${ln}
"
  done
  _fw_report warn fw_fastify_decorate_reference "$dr_bad" "decorateRequest/decorateReply 默认值用对象/数组字面量（跨请求共享同一引用，请求间数据串扰 CWE-668；须传 null 钩子内赋值）" "请求/响应装饰器无共享引用字面量"

  # ====================================================================
  # fw_fastify_cors(warn)：@fastify/cors origin 白名单
  # ====================================================================
  local cors_hit=0 cors_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    if grep -qE "@fastify/cors" "$f" 2>/dev/null; then
      cors_hit=1
      local ln
      ln=$(grep -nE "origin[[:space:]]*:[[:space:]]*(true|['\"]\*['\"])" "$f" 2>/dev/null || true)
      [[ -n "$ln" ]] && cors_bad="${cors_bad}${f}:${ln}
"
    fi
  done
  if [[ "$cors_hit" -eq 0 ]]; then
    pass "fw_fastify_cors: 未启用 @fastify/cors，跳过"
  elif [[ -n "$cors_bad" ]]; then
    warn "fw_fastify_cors: CORS origin 为 true/'*'（任意源放行 CWE-942，生产须显式域名白名单）:
${cors_bad}"
  else
    pass "fw_fastify_cors: CORS origin 白名单已配"
  fi

  # ====================================================================
  # fw_fastify_rate_limit(warn)：@fastify/rate-limit
  # ====================================================================
  local rl_hit=""
  rl_hit=$(grep -rlE '@fastify/rate-limit' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$rl_hit" ]]; then
    for p in "${pkgarr[@]+"${pkgarr[@]}"}"; do
      if grep -qE '@fastify/rate-limit' "$p" 2>/dev/null; then
        rl_hit="$p"
      fi
    done
  fi
  if [[ -n "$rl_hit" ]]; then
    pass "fw_fastify_rate_limit: @fastify/rate-limit 已引入"
  else
    warn "fw_fastify_rate_limit: 未检出 @fastify/rate-limit（公开端点无速率限制，撞库/刷量风险 CWE-770）"
  fi

  # ====================================================================
  # fw_fastify_auth(warn)：认证机制
  # ====================================================================
  if [[ -z "$route_files" ]]; then
    pass "fw_fastify_auth: 无路由，跳过"
  else
    local au_hit
    au_hit=$(grep -rlE '@fastify/auth|preHandler|authenticate|onRequest' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
    if [[ -n "$au_hit" ]]; then
      pass "fw_fastify_auth: 认证钩子/@fastify/auth 存在"
    else
      warn "fw_fastify_auth: 存在路由但未检出认证机制（@fastify/auth 或 preHandler/onRequest 钩子，受保护路由未授权风险 CWE-862）"
    fi
  fi

  # ====================================================================
  # fw_fastify_swagger(warn)：@fastify/swagger 文档同源
  # ====================================================================
  local sw_hit=""
  sw_hit=$(grep -rlE '@fastify/swagger' "${jsarr[@]+"${jsarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$sw_hit" ]]; then
    for p in "${pkgarr[@]+"${pkgarr[@]}"}"; do
      if grep -qE '@fastify/swagger' "$p" 2>/dev/null; then
        sw_hit="$p"
      fi
    done
  fi
  if [[ -n "$sw_hit" ]]; then
    pass "fw_fastify_swagger: @fastify/swagger 已引入（文档与 schema 同源）"
  else
    warn "fw_fastify_swagger: 未检出 @fastify/swagger（手维护文档与实现漂移风险，须以路由 schema 生成 OpenAPI）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

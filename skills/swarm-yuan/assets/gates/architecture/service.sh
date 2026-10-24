# gate: service
# domain: architecture / enforce: warn / tier: arch
check_service() {
  echo "=== 微服务架构检查（共享DB/同步链/共享模型/网关/trace透传）==="
  local found=0

  if [[ ${#SERVICE_DIRS[@]} -eq 0 ]]; then
    warn "未配置 SERVICE_DIRS，跳过微服务架构检查（生成目标技能时列出各服务目录）"
    return
  fi

  # ---- 1. 共享数据库检测：多服务 DB 配置指向同一数据库 ----
  if [[ ${#DB_CONFIG_FILES[@]} -gt 0 ]]; then
    declare -a db_uris=()
    local cf
    for cf in "${DB_CONFIG_FILES[@]}"; do
      [[ -f "$cf" ]] || continue
      # 提取数据库连接 URI/host（粗筛：含 host/port/database 的配置行）
      # BRE sed 的 \s（字面 s）与 \?（GNU 扩展）在 BSD 不支持，
      # 改 ERE + [[:space:]] + ?——此前 macOS 上 URI 剥离行为分歧。
      local uri
      uri=$(grep -hoE '(host|HOST|url|URL|dsn|DSN|database_url|DATABASE_URL)[[:space:]]*[:=][[:space:]]*["'"'"']?[^"'"'"'[:space:],;]+' "$cf" 2>/dev/null \
        | sed -E 's/.*[:=][[:space:]]*["'"'"']?//' | sort -u || true)
      if [[ -n "$uri" ]]; then
        db_uris+=("${cf}::${uri}")
      fi
    done
    # 检测是否有两个服务指向同一 host+database
    local i j
    for ((i=0; i<${#db_uris[@]}; i++)); do
      for ((j=i+1; j<${#db_uris[@]}; j++)); do
        local uri_i="${db_uris[$i]##*::}"
        local uri_j="${db_uris[$j]##*::}"
        local file_i="${db_uris[$i]%%::*}"
        local file_j="${db_uris[$j]%%::*}"
        if [[ -n "$uri_i" && "$uri_i" == "$uri_j" ]]; then
          fail "共享数据库反模式：${file_i} 与 ${file_j} 指向同一数据库（${uri_i}）。微服务应每服务独立数据库，避免 schema 变更互相影响"
          found=1
        fi
      done
    done
    if [[ $found -eq 0 ]]; then
      pass "无共享数据库（${#db_uris[@]} 个 DB 配置均指向不同实例）"
    fi
  fi

  # ---- 2. 共享模型/库检测：多服务依赖同一共享包 ----
  if [[ -n "$SHARED_LIBS_DIR" && -d "$SHARED_LIBS_DIR" ]]; then
    local shared_pkg; shared_pkg=$(basename "$SHARED_LIBS_DIR")
    local svc_count=0
    local svc
    for svc in "${SERVICE_DIRS[@]}"; do
      [[ -d "$svc" ]] || continue
      # 检测服务是否 import 了共享包
      if grep -rqwF -- "$shared_pkg" "$svc" --include='*.ts' --include='*.js' --include='*.py' 2>/dev/null; then
        svc_count=$((svc_count+1))
      fi
    done
    if [[ $svc_count -gt 1 ]]; then
      warn "共享库 ${SHARED_LIBS_DIR} 被 ${svc_count} 个服务依赖——共享领域模型会导致服务无法独立演进（改一处全服务重发）。将共享库拆分：utils/types 可共享，领域模型复制到各服务（防分布式单体）"
    fi
  fi

  # ---- 3. API 网关存在性 ----
  if [[ -z "$API_GATEWAY" ]]; then
    warn "未配置 API_GATEWAY——新建 API_GATEWAY 目录/文件，实现认证+限流+跨域+路由聚合（或在 API_GATEWAY 指向已有网关）"
  elif [[ ! -e "$API_GATEWAY" ]]; then
    warn "API 网关不存在：${API_GATEWAY}（客户端直连后端服务会导致认证/跨域/限流各服务重复实现）"
  else
    pass "API 网关存在：${API_GATEWAY}"
  fi

  # ---- 4. 同步调用链深度（HTTP/RPC 调用）----
  if [[ "$MAX_SYNC_CHAIN" -gt 0 ]]; then
    local svc2
    for svc2 in "${SERVICE_DIRS[@]}"; do
      [[ -d "$svc2" ]] || continue
      # 粗筛：统计服务内 HTTP 调用语句（fetch/axios/httpClient/grpc）
      local call_count
      call_count=$(_scan_src '(fetch|axios|httpClient|grpc|http\.request|requests\.)\(' 'ts,js,py' 'test\|mock\|node_modules' "$svc2" | wc -l | xargs || true)
      if [[ "$call_count" -gt "$MAX_SYNC_CHAIN" ]]; then
        warn "${svc2} 有 ${call_count} 处对外同步调用——同步链过长易雪崩（建议熔断/降级/异步化，阈值 ${MAX_SYNC_CHAIN}）"
      fi
    done
  fi

  # ---- 5. 分布式追踪（traceId 透传）检测 ----
  local trace_found=0
  local svc3
  for svc3 in "${SERVICE_DIRS[@]}"; do
    [[ -d "$svc3" ]] || continue
    if grep -rqwE 'traceId|trace_id|x-trace|traceparent|spanId|span_id|opentelemetry|@opentelemetry' "$svc3" \
      --include='*.ts' --include='*.js' --include='*.py' 2>/dev/null; then
      trace_found=1
      break
    fi
  done
  if [[ $trace_found -eq 0 ]]; then
    warn "未检测到 traceId/spanId 透传——跨服务调用无分布式追踪，故障难定位（建议接入 OpenTelemetry 或透传 x-trace-id）"
  else
    pass "检测到分布式追踪（traceId 透传）"
  fi

  if [[ $found -eq 0 ]]; then
    pass "微服务架构检查通过"
  fi
}

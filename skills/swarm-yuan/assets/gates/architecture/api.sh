# gate: api
# domain: architecture / enforce: warn / tier: arch
check_api() {
  echo "=== API 契约与幂等检查（版本化/幂等/跨服务事务）==="
  local found=0 _api_checked=0

  # ---- 1. API 定义文件版本化 ----
  if [[ -z "$API_SPEC_DIR" ]]; then
    warn "未配置 API_SPEC_DIR，跳过 API 契约检查（建议建立 OpenAPI/proto/GraphQL schema 目录）"
  elif [[ ! -d "$API_SPEC_DIR" ]]; then
    warn "API 定义目录不存在：${API_SPEC_DIR}"
  else
    local specs; specs=$(find "$API_SPEC_DIR" -type f \( -name '*.yaml' -o -name '*.yml' -o -name '*.json' -o -name '*.proto' -o -name '*.graphql' \) 2>/dev/null || true)
    if [[ -n "$specs" ]]; then
      _api_checked=1
      local sf
      while IFS= read -r sf; do
        [[ -z "$sf" ]] && continue
        if ! grep -qE 'version["'"'"']?[[:space:]]*[:=]|^version|## v?[0-9]|edition["'"'"']?[[:space:]]*[:=]' "$sf" 2>/dev/null; then
          fail "API 定义缺 version：${sf}（微服务契约无版本化会导致消费方静默挂）"
          found=1
        fi
      done <<< "$specs"
    fi
  fi

  # ---- 1b. 接口测试覆盖（端点 × 测试映射 + 状态码断言）----
  _api_test_coverage_check || found=1

  # ---- 2. 写操作幂等性检测 ----
  if [[ ${#WRITE_HANDLER_DIRS[@]} -gt 0 ]]; then
    local hd
    for hd in "${WRITE_HANDLER_DIRS[@]}"; do
      [[ -d "$hd" ]] || continue
      # 检测 POST/PUT/DELETE handler 是否含幂等键（idempotency-key/request-id 去重）
      local handlers
      handlers=$(grep -rlnE '(POST|PUT|DELETE|@Post|@Put|@Delete|app\.(post|put|delete))' "$hd" \
        --include='*.ts' --include='*.js' --include='*.py' 2>/dev/null || true)
      if [[ -n "$handlers" ]]; then
        local hf
        while IFS= read -r hf; do
          [[ -z "$hf" ]] && continue
          if ! grep -qwiE 'idempotency|request.?id|dedup|去重|幂等' "$hf" 2>/dev/null; then
            warn "${hf} 含写操作但无幂等设计（建议 idempotency-key 去重，防止重试导致重复扣款/重复创建）"
          fi
        done <<< "$handlers"
      fi
    done
  fi

  # ---- 3. 跨服务分布式事务检测（反模式：微服务不该用 2PC）----
  local svc
  for svc in "${SERVICE_DIRS[@]+"${SERVICE_DIRS[@]}"}"; do
    [[ -d "$svc" ]] || continue
    # 检测跨服务 BEGIN TRANSACTION / @Transactional 跨服务调用
    local xa
    xa=$(_scan_src 'XAResource|XA_OPEN|2pc|two.?phase|distributed.?transaction|seata|@GlobalTransactional' 'ts,js,py,java' 'test\|mock\|node_modules' "$svc")
    if [[ -n "$xa" ]]; then
      warn "${svc} 检测到分布式事务/2PC——微服务应避免跨服务事务，改用 Saga/Outbox 模式"
      echo "$xa" | head -3 | sed 's/^/    /'
    fi
  done

  # ---- 4. Outbox 模式提示（写库+发消息一致性）----
  local has_outbox=0
  for svc in "${SERVICE_DIRS[@]+"${SERVICE_DIRS[@]}"}"; do
    [[ -d "$svc" ]] || continue
    if grep -rqwiE 'outbox|out_box|event.?relay|transactional.?outbox' "$svc" \
      --include='*.ts' --include='*.js' --include='*.py' --include='*.java' 2>/dev/null; then
      has_outbox=1
      break
    fi
  done
  if [[ $has_outbox -eq 0 && ${#SERVICE_DIRS[@]} -gt 0 ]]; then
    warn "未检测到 Outbox 模式——服务写库后发消息可能不一致（库已改消息未发）。建议 outbox 表保证原子性"
  fi

  if [[ $found -eq 0 ]]; then
    if [[ "$_api_checked" -eq 1 ]]; then
      pass "API 契约与幂等检查通过"
    else
      # R118：版本化未执行时仍可能跑了幂等/事务检查——用 warn 明示“部分完成”，不写“通过”。
      warn "API 契约版本化未执行（API_SPEC_DIR 未配置或目录/定义文件不存在）；幂等与跨服务事务检查已执行"
    fi
  fi
}

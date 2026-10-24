# ruleset: sentinel  requires_conf: SENTINEL_SRC_GLOBS
# gates: fw_sentinel_rule_persist(fail) fw_sentinel_resource_fallback(warn) fw_sentinel_blockhandler_split(warn) fw_sentinel_degrade_strategy(warn) fw_sentinel_param_flow(warn) fw_sentinel_flow_shape(warn) fw_sentinel_system_rule(warn) fw_sentinel_gateway_flow(warn) fw_sentinel_dashboard_auth(warn) fw_sentinel_dynamic_refresh(warn) fw_sentinel_fallback_light(warn) fw_sentinel_resource_naming(warn) fw_sentinel_biz_exception(warn)
# harvested-from: P3 框架规则引擎（2026-07-17），规律源自 Sentinel 1.8.x 官方文档（2.x 仅 alpha，标待验证）
_fw_sentinel_check() {
  echo "  [sentinel] Sentinel 1.8.x（2.0.0-alpha 待验证）框架规律"

  # ---------- 收集源文件清单（Java + 配置文件 + 构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SENTINEL_SRC_GLOBS[@]+"${SENTINEL_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "sentinel: SENTINEL_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f c j
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|*.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # ---------- Sentinel 使用痕迹总判定 ----------
  local sentinel_used=0
  local su_hit
  # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
  su_hit=$(grep -rlE '@SentinelResource|SphU\.|SphO\.|FlowRule|DegradeRule|ParamFlowRule|SystemRule|BlockException|com\.alibaba\.csp|spring\.cloud\.sentinel|sentinel-' "${javaarr[@]+"${javaarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}" 2>/dev/null | head -1 || true)
  [[ -n "$su_hit" ]] && sentinel_used=1

  # ====================================================================
  # fw_sentinel_rule_persist(fail)：规则须持久化到数据源，禁止仅存内存
  # ====================================================================
  if [[ "$sentinel_used" -eq 0 ]]; then
    pass "fw_sentinel_rule_persist: 无 Sentinel 使用痕迹，跳过"
  else
    # 数据源持久化检出：点分隔字面量 / Java DataSource API /
    # 嵌套 yml 启发式（文件含 sentinel + datasource/data-source + 具体数据源类型）
    local ds_hit=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'spring\.cloud\.sentinel\.datasource|sentinel-datasource-|DataSourceProperties' "$c" 2>/dev/null; then
        ds_hit=1
        break
      fi
      if grep -qiE 'sentinel' "$c" 2>/dev/null \
         && grep -qE 'datasource|data-source' "$c" 2>/dev/null \
         && grep -qiE 'nacos|zookeeper|apollo|redis|consul' "$c" 2>/dev/null; then
        ds_hit=1
        break
      fi
    done
    if [[ "$ds_hit" -eq 0 ]]; then
      for j in "${javaarr[@]+"${javaarr[@]}"}"; do
        if grep -qE 'ReadableDataSource|NacosDataSource|ZookeeperDataSource|ApolloDataSource|FileRefreshableDataSource' "$j" 2>/dev/null; then
          ds_hit=1
          break
        fi
      done
    fi
    if [[ "$ds_hit" -eq 1 ]]; then
      pass "fw_sentinel_rule_persist: 已配规则数据源持久化"
    else
      fail "fw_sentinel_rule_persist: 检出 Sentinel 使用但无数据源持久化（spring.cloud.sentinel.datasource / ReadableDataSource）——规则仅存内存，重启即丢失"
    fi
  fi

  # ====================================================================
  # fw_sentinel_resource_fallback(warn)：@SentinelResource 须配 blockHandler/fallback
  # ====================================================================
  local sr_files
  sr_files=$(grep -rlE '@SentinelResource\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  local sr_bad=""
  if [[ -n "$sr_files" ]]; then
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      if ! grep -qE 'blockHandler|fallback' "$j" 2>/dev/null; then
        sr_bad="${sr_bad}${j}
"
      fi
    done <<< "$sr_files"
  fi
  if [[ -z "$sr_files" ]]; then
    pass "fw_sentinel_resource_fallback: 无 @SentinelResource，跳过"
  elif [[ -n "$sr_bad" ]]; then
    warn "fw_sentinel_resource_fallback: @SentinelResource 未配 blockHandler/fallback（限流降级异常将上抛为 500）:
${sr_bad}"
  else
    pass "fw_sentinel_resource_fallback: @SentinelResource 均配降级处理"
  fi

  # ====================================================================
  # fw_sentinel_blockhandler_split(warn)：只有 fallback 无 blockHandler 时 BlockException 不上 fallback 通道
  # ====================================================================
  local split_bad=""
  if [[ -n "$sr_files" ]]; then
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      if grep -qE 'fallback' "$j" 2>/dev/null && ! grep -qE 'blockHandler|blockHandlerClass' "$j" 2>/dev/null; then
        split_bad="${split_bad}${j}
"
      fi
    done <<< "$sr_files"
  fi
  if [[ -z "$sr_files" ]]; then
    pass "fw_sentinel_blockhandler_split: 无 @SentinelResource，跳过"
  elif [[ -n "$split_bad" ]]; then
    warn "fw_sentinel_blockhandler_split: 只配 fallback 未配 blockHandler（1.6.3+ BlockException 不进 fallback，将上抛）:
${split_bad}"
  else
    pass "fw_sentinel_blockhandler_split: blockHandler/fallback 分工完整"
  fi

  # ====================================================================
  # fw_sentinel_degrade_strategy(warn)：熔断规则须配 minRequestAmount 防小样本误熔断
  # ====================================================================
  local degrade_hit=0 minreq_hit=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if grep -qE 'DegradeRule|DEGRADE_GRADE_' "$j" 2>/dev/null; then
      degrade_hit=1
      grep -qE 'minRequestAmount|minRequest' "$j" 2>/dev/null && minreq_hit=1
    fi
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'degrade-rules|degrade\.|DEGRADE_GRADE_|exception-ratio|exception-count' "$c" 2>/dev/null; then
      degrade_hit=1
      grep -qE 'min-request-amount|minRequestAmount' "$c" 2>/dev/null && minreq_hit=1
    fi
  done
  if [[ "$degrade_hit" -eq 0 ]]; then
    pass "fw_sentinel_degrade_strategy: 无熔断规则，跳过"
  elif [[ "$minreq_hit" -eq 1 ]]; then
    pass "fw_sentinel_degrade_strategy: 熔断规则已配 minRequestAmount"
  else
    warn "fw_sentinel_degrade_strategy: 检出熔断规则但未配 minRequestAmount（统计窗口内请求数须 ≥5，防小样本误熔断；RT/异常比选型须按场景）"
  fi

  # ====================================================================
  # fw_sentinel_param_flow(warn)：热点参数限流须 blockHandler 接 ParamFlowException
  # ====================================================================
  local pf_hit=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE 'ParamFlowRule|ParamFlowItem' "$j" 2>/dev/null && { pf_hit=1; break; }
  done
  if [[ "$pf_hit" -eq 0 ]]; then
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      grep -qE 'param-flow-rules|param-flow' "$c" 2>/dev/null && { pf_hit=1; break; }
    done
  fi
  if [[ "$pf_hit" -eq 0 ]]; then
    pass "fw_sentinel_param_flow: 无热点参数限流，跳过"
  else
    local bh_hit=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      grep -qE 'blockHandler|ParamFlowException' "$j" 2>/dev/null && { bh_hit=1; break; }
    done
    if [[ "$bh_hit" -eq 1 ]]; then
      pass "fw_sentinel_param_flow: 热点限流已配 blockHandler 兜底"
    else
      warn "fw_sentinel_param_flow: 检出 ParamFlowRule 但工程无 blockHandler（ParamFlowException 将上抛 500）"
    fi
  fi

  # ====================================================================
  # fw_sentinel_flow_shape(warn)：突发流量须评估匀速排队/冷启动整形
  # ====================================================================
  local flow_hit=0 shape_hit=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if grep -qE 'FlowRule\b' "$j" 2>/dev/null; then
      flow_hit=1
      grep -qE 'controlBehavior|CONTROL_BEHAVIOR_' "$j" 2>/dev/null && shape_hit=1
    fi
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'flow-rules|flow-rules:' "$c" 2>/dev/null; then
      flow_hit=1
      grep -qE 'control-behavior|controlBehavior' "$c" 2>/dev/null && shape_hit=1
    fi
  done
  if [[ "$flow_hit" -eq 0 ]]; then
    pass "fw_sentinel_flow_shape: 无 FlowRule 配置，跳过"
  elif [[ "$shape_hit" -eq 1 ]]; then
    pass "fw_sentinel_flow_shape: 流量整形策略已显式配置"
  else
    warn "fw_sentinel_flow_shape: 检出 FlowRule 但未配 controlBehavior（默认快速失败；突发/冷启动场景须评估匀速排队 RATE_LIMITER 或 WARM_UP）"
  fi

  # ====================================================================
  # fw_sentinel_system_rule(warn)：高流量入口须 SystemRule 全局兜底
  # ====================================================================
  if [[ "$sentinel_used" -eq 0 ]]; then
    pass "fw_sentinel_system_rule: 无 Sentinel 使用，跳过"
  else
    local sys_hit=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      grep -qE 'SystemRule|SystemRuleManager' "$j" 2>/dev/null && { sys_hit=1; break; }
    done
    if [[ "$sys_hit" -eq 0 ]]; then
      for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
        grep -qE 'system-rules' "$c" 2>/dev/null && { sys_hit=1; break; }
      done
    fi
    if [[ "$sys_hit" -eq 1 ]]; then
      pass "fw_sentinel_system_rule: 已配系统自适应保护"
    else
      warn "fw_sentinel_system_rule: 检出 Sentinel 使用但无 SystemRule（高流量入口须配系统级 LOAD/RT/QPS/CPU 兜底，仅对入口流量生效）"
    fi
  fi

  # ====================================================================
  # fw_sentinel_gateway_flow(warn)：Spring Cloud Gateway 入口须接 sentinel-gateway 适配器
  # ====================================================================
  local gw_dep=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    grep -qE 'spring-cloud-starter-gateway|spring\.cloud\.gateway' "$c" 2>/dev/null && { gw_dep=1; break; }
  done
  if [[ "$gw_dep" -eq 0 || "$sentinel_used" -eq 0 ]]; then
    pass "fw_sentinel_gateway_flow: 无 Gateway+Sentinel 组合，跳过"
  else
    local gw_adp=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      grep -qE 'sentinel-spring-cloud-gateway-adapter|sentinel-api-gateway-adapter' "$c" 2>/dev/null && { gw_adp=1; break; }
    done
    if [[ "$gw_adp" -eq 0 ]]; then
      for j in "${javaarr[@]+"${javaarr[@]}"}"; do
        grep -qE 'GatewayFlowRule|SentinelGatewayFilter|GatewayRuleManager' "$j" 2>/dev/null && { gw_adp=1; break; }
      done
    fi
    if [[ "$gw_adp" -eq 1 ]]; then
      pass "fw_sentinel_gateway_flow: 网关已接 Sentinel 适配器"
    else
      warn "fw_sentinel_gateway_flow: Gateway + Sentinel 但无 sentinel-spring-cloud-gateway-adapter/GatewayFlowRule（入口无 route 维度限流）"
    fi
  fi

  # ====================================================================
  # fw_sentinel_dashboard_auth(warn)：Dashboard 默认口令必须修改
  # ====================================================================
  local dash_hit=0 auth_hit=0 auth_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    # dashboard 检出：点分隔字面量或嵌套 yml（文件同含 sentinel 与 dashboard）
    if grep -qE 'sentinel\.transport\.dashboard|transport\.dashboard|sentinel\.dashboard' "$c" 2>/dev/null \
       || { grep -qiE 'sentinel' "$c" 2>/dev/null && grep -qiE 'dashboard' "$c" 2>/dev/null; }; then
      dash_hit=1
      if grep -qE 'sentinel\.dashboard\.auth\.|dashboard.*auth|(^|[[:space:]])auth:|auth.*(username|password)' "$c" 2>/dev/null; then
        auth_hit=1
      fi
      local ln
      ln=$(grep -nE '(password|username)[[:space:]]*[:=][[:space:]]*sentinel([[:space:]]|$)' "$c" 2>/dev/null || true)
      [[ -n "$ln" ]] && auth_bad="${auth_bad}${c}:${ln}
"
    fi
  done
  if [[ -n "$auth_bad" ]]; then
    fail "fw_sentinel_dashboard_auth: Dashboard 使用默认口令 sentinel/sentinel（CWE-521 弱口令，必须修改）:
${auth_bad}"
  elif [[ "$dash_hit" -eq 0 ]]; then
    pass "fw_sentinel_dashboard_auth: 无 Dashboard 连接配置，跳过"
  elif [[ "$auth_hit" -eq 1 ]]; then
    pass "fw_sentinel_dashboard_auth: Dashboard 鉴权已显式配置"
  else
    warn "fw_sentinel_dashboard_auth: 检出 Dashboard 连接但无 sentinel.dashboard.auth 配置（默认口令 sentinel/sentinel 风险，且勿暴露公网）"
  fi

  # ====================================================================
  # fw_sentinel_dynamic_refresh(warn)：Dashboard + 数据源同存须确认 push 双向同步
  # ====================================================================
  local dash2=0 ds2=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'transport\.dashboard|sentinel\.dashboard' "$c" 2>/dev/null \
       || { grep -qiE 'sentinel' "$c" 2>/dev/null && grep -qiE 'dashboard' "$c" 2>/dev/null; }; then
      dash2=1
    fi
    if grep -qE 'spring\.cloud\.sentinel\.datasource' "$c" 2>/dev/null \
       || { grep -qiE 'sentinel' "$c" 2>/dev/null && grep -qE 'datasource|data-source' "$c" 2>/dev/null; }; then
      ds2=1
    fi
  done
  if [[ "$dash2" -eq 1 && "$ds2" -eq 1 ]]; then
    warn "fw_sentinel_dynamic_refresh: Dashboard + 数据源同存（官方 Dashboard 改规则默认只推客户端内存、不回写数据源，生产须改造 DynamicRulePublisher push 双向同步）"
  else
    pass "fw_sentinel_dynamic_refresh: 无 Dashboard+数据源组合，跳过"
  fi

  # ====================================================================
  # fw_sentinel_fallback_light(warn)：降级方法不得再发远程调用
  # ====================================================================
  local fl_bad=""
  if [[ -n "$sr_files" ]]; then
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      if grep -qE 'fallback|blockHandler' "$j" 2>/dev/null \
         && grep -qE 'RestTemplate|restTemplate\.|FeignClient|OkHttpClient|HttpClient' "$j" 2>/dev/null; then
        fl_bad="${fl_bad}${j}
"
      fi
    done <<< "$sr_files"
  fi
  _fw_report warn fw_sentinel_fallback_light "${fl_bad}" "降级方法与远程调用同文件（降级逻辑须轻量本地兜底，禁止再调远程接口级联放大）" "未检出降级方法内远程调用痕迹"

  # ====================================================================
  # fw_sentinel_resource_naming(warn)：资源命名风格不得混用
  # ====================================================================
  local slash_cnt=0 plain_cnt=0 vals=""
  if [[ -n "$sr_files" ]]; then
    vals=$(grep -hoE 'value[[:space:]]*=[[:space:]]*"[^"]+"' $sr_files 2>/dev/null | sed -E 's/.*"([^"]+)"/\1/' || true)
    while IFS= read -r v; do
      [[ -z "$v" ]] && continue
      case "$v" in
        */*) slash_cnt=$((slash_cnt+1)) ;;
        *)   plain_cnt=$((plain_cnt+1)) ;;
      esac
    done <<< "$vals"
  fi
  if [[ "$slash_cnt" -gt 0 && "$plain_cnt" -gt 0 ]]; then
    warn "fw_sentinel_resource_naming: @SentinelResource value 风格混用（URL 路径风格 ${slash_cnt} 处 / 标识符风格 ${plain_cnt} 处）——规则按资源名绑定，风格混乱易配错静默失效"
  else
    pass "fw_sentinel_resource_naming: 资源命名风格统一（或无 @SentinelResource）"
  fi

  # ====================================================================
  # fw_sentinel_biz_exception(warn)：异常比例熔断须排除业务校验异常
  # ====================================================================
  local exrule_hit=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE 'DEGRADE_GRADE_EXCEPTION_RATIO|DEGRADE_GRADE_EXCEPTION_COUNT' "$j" 2>/dev/null && { exrule_hit=1; break; }
  done
  if [[ "$exrule_hit" -eq 0 ]]; then
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      grep -qE 'exception-ratio|exception-count' "$c" 2>/dev/null && { exrule_hit=1; break; }
    done
  fi
  if [[ "$exrule_hit" -eq 0 ]]; then
    pass "fw_sentinel_biz_exception: 无异常比例/异常数熔断，跳过"
  elif [[ -z "$sr_files" ]]; then
    warn "fw_sentinel_biz_exception: 检出异常比例/异常数熔断（须确认业务校验异常不入熔断统计，代码方式用 Tracer.ignore）"
  else
    local exig_hit=0
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      grep -qE 'exceptionsToIgnore|exceptionsToTrace' "$j" 2>/dev/null && { exig_hit=1; break; }
    done <<< "$sr_files"
    if [[ "$exig_hit" -eq 1 ]]; then
      pass "fw_sentinel_biz_exception: 已配 exceptionsToIgnore/Trace 区分业务异常"
    else
      warn "fw_sentinel_biz_exception: 异常比例/异常数熔断 + @SentinelResource 无 exceptionsToIgnore/Trace（业务校验异常误统计将误熔断）"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

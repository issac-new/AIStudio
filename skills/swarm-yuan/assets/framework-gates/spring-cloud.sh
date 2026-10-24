# ruleset: spring-cloud  requires_conf: SPRINGCLOUD_SRC_GLOBS
# gates: fw_scloud_feign_fallback(warn) fw_scloud_feign_timeout(warn) fw_scloud_feign_retry(warn) fw_scloud_lb_retry_idempotent(warn) fw_scloud_gateway_route_order(warn) fw_scloud_refresh_scope(warn) fw_scloud_config_failfast(warn) fw_scloud_bootstrap_deprecated(warn) fw_scloud_discovery_healthcheck(warn) fw_scloud_feign_log_level(warn) fw_scloud_gateway_ratelimit(warn) fw_scloud_config_encrypt(fail) fw_scloud_version_matrix(warn)
# harvested-from: P2 范例（2026-07-17），规律源自 Spring Cloud 2024.x / 2025.x 官方文档
_fw_spring_cloud_check() {
  echo "  [spring-cloud] Spring Cloud 2024.x / 2025.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置文件 + 构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SPRINGCLOUD_SRC_GLOBS[@]+"${SPRINGCLOUD_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "spring-cloud: SPRINGCLOUD_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # ====================================================================
  # fw_scloud_feign_fallback(warn)：@FeignClient 须配 fallback/fallbackFactory
  # ====================================================================
  local feign_files
  feign_files=$(grep -rlE '@FeignClient\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  local ff_bad=""
  while IFS= read -r ff; do
    [[ -z "$ff" ]] && continue
    if ! grep -qE 'fallback|fallbackFactory' "$ff" 2>/dev/null; then
      ff_bad="${ff_bad}${ff}
"
    fi
  done <<< "$feign_files"
  _fw_report warn fw_scloud_feign_fallback "${ff_bad}" "@FeignClient 未配 fallback/fallbackFactory（生产须降级）" "@FeignClient 均配降级或无 Feign client"

  # ====================================================================
  # fw_scloud_feign_timeout(warn)：Feign 超时须显式配置
  # ====================================================================
  local has_feign=0
  [[ -n "$feign_files" ]] && has_feign=1
  if [[ "$has_feign" -eq 0 ]]; then
    pass "fw_scloud_feign_timeout: 无 Feign client，跳过"
  else
    local timeout_hit=0 c
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'feign\.client\.config.*\.(connect-timeout|read-timeout)' "$c" 2>/dev/null; then
        timeout_hit=1
        break
      fi
    done
    if [[ "$timeout_hit" -eq 0 ]]; then
      warn "fw_scloud_feign_timeout: 检出 @FeignClient 但未配 feign.client.config.*connect-timeout/read-timeout（默认值可能过长）"
    else
      pass "fw_scloud_feign_timeout: Feign 超时已显式配置"
    fi
  fi

  # ====================================================================
  # fw_scloud_feign_retry(warn)：Retryer 须确认接口幂等
  # ====================================================================
  local retry_hit=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'Retryer|feign\.client\.config.*\.retryer|retryer' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && retry_hit="${retry_hit}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'Retryer\b' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && retry_hit="${retry_hit}${j}:${ln}
"
  done
  _fw_report warn fw_scloud_feign_retry "${retry_hit}" "检出 Feign Retryer（须确认目标接口幂等，非幂等 POST/DELETE 禁重试）" "未检出 Feign 重试配置"

  # ====================================================================
  # fw_scloud_lb_retry_idempotent(warn)：retry-on-all-operations 风险
  # ====================================================================
  local lb_all_hit=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'retry-on-all-operations' "$c" 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    if printf '%s\n' "$ln" | grep -qE 'true'; then
      lb_all_hit="${lb_all_hit}${c}:${ln}
"
    fi
  done
  _fw_report warn fw_scloud_lb_retry_idempotent "${lb_all_hit}" "retry-on-all-operations=true（非幂等 POST/DELETE 重复副作用风险）" "未检出 retry-on-all-operations=true"

  # ====================================================================
  # fw_scloud_gateway_route_order(warn)：路由谓词顺序
  # ====================================================================
  local gw_hit=0 gw_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if ! grep -qE 'spring\.cloud\.gateway\.routes|RouteLocator' "$c" 2>/dev/null; then
      continue
    fi
    gw_hit=1
    # 简化检测：Path=/** 或 Path=/api/** 出现在具体 Path=/api/xxx 之前
    local lines star_line specific_line
    # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
    star_line=$(grep -nE 'Path=/\*\*|Path=/api/\*\*|Path:[[:space:]]*/\*\*|Path:[[:space:]]*/api/\*\*' "$c" 2>/dev/null | head -1 | cut -d: -f1 || true)
    specific_line=$(grep -nE 'Path=/api/[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$|Path:[[:space:]]*/api/[a-zA-Z0-9_-]+(/[a-zA-Z0-9_{}-]+)*' "$c" 2>/dev/null | head -1 | cut -d: -f1 || true)
    if [[ -n "$star_line" && -n "$specific_line" && "$star_line" -lt "$specific_line" ]]; then
      gw_bad="${gw_bad}${c}: 宽泛 Path 路由(line ${star_line}) 前置于具体路由(line ${specific_line})
"
    fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if grep -qE 'RouteLocator' "$j" 2>/dev/null; then
      gw_hit=1
    fi
  done
  if [[ "$gw_hit" -eq 0 ]]; then
    pass "fw_scloud_gateway_route_order: 无 Gateway 路由，跳过"
  elif [[ -n "$gw_bad" ]]; then
    warn "fw_scloud_gateway_route_order: 宽泛路由前置于具体路由（须按 specificity 降序）:
${gw_bad}"
  else
    pass "fw_scloud_gateway_route_order: 路由顺序合理"
  fi

  # ====================================================================
  # fw_scloud_refresh_scope(warn)：@RefreshScope 误用
  # ====================================================================
  local rs_files
  rs_files=$(grep -rlE '@RefreshScope\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$rs_files" ]]; then
    pass "fw_scloud_refresh_scope: 无 @RefreshScope，跳过"
  else
    # 无配置中心依赖则 warn
    local has_config=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'spring\.cloud\.config|spring\.config\.import.*configserver' "$c" 2>/dev/null; then
        has_config=1
        break
      fi
    done
    if [[ "$has_config" -eq 0 ]]; then
      warn "fw_scloud_refresh_scope: 检出 @RefreshScope 但无配置中心（滥用导致代理开销）:
${rs_files}"
    else
      pass "fw_scloud_refresh_scope: @RefreshScope 配合配置中心使用"
    fi
  fi

  # ====================================================================
  # fw_scloud_config_failfast(warn)：Config 须 fail-fast
  # ====================================================================
  local config_uri_hit=0 ff_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'spring\.cloud\.config\.uri|spring\.config\.import.*configserver' "$c" 2>/dev/null; then
      config_uri_hit=1
      if grep -qE 'fail-fast[[:space:]]*[:=][[:space:]]*true' "$c" 2>/dev/null; then
        ff_ok=1
      fi
    fi
  done
  if [[ "$config_uri_hit" -eq 0 ]]; then
    pass "fw_scloud_config_failfast: 无配置中心，跳过"
  elif [[ "$ff_ok" -eq 1 ]]; then
    pass "fw_scloud_config_failfast: 已配 fail-fast=true"
  else
    warn "fw_scloud_config_failfast: spring.cloud.config.uri 未配 fail-fast=true（不可达时静默用本地默认，生产风险）"
  fi

  # ====================================================================
  # fw_scloud_bootstrap_deprecated(warn)：bootstrap.yml 弃用
  # ====================================================================
  local bs_hit=0 bs_files=""
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      bootstrap.yml|bootstrap.yaml|bootstrap.properties)
        bs_hit=1
        bs_files="${bs_files}${f}
"
        ;;
    esac
  done
  if [[ "$bs_hit" -eq 0 ]]; then
    pass "fw_scloud_bootstrap_deprecated: 无 bootstrap.yml"
  else
    # 检查是否有 spring-cloud-starter-bootstrap 依赖
    local has_bs_dep=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'spring-cloud-starter-bootstrap' "$c" 2>/dev/null; then
        has_bs_dep=1
        break
      fi
    done
    if [[ "$has_bs_dep" -eq 1 ]]; then
      pass "fw_scloud_bootstrap_deprecated: bootstrap.yml + 显式 starter-bootstrap 依赖"
    else
      warn "fw_scloud_bootstrap_deprecated: bootstrap.yml 存在但无 spring-cloud-starter-bootstrap（Boot 2.4+ 默认不加载，须迁 spring.config.import）:
${bs_files}"
    fi
  fi

  # ====================================================================
  # fw_scloud_discovery_healthcheck(warn)：服务发现健康检查
  # ====================================================================
  local eureka_hit=0 hc_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'eureka\.client' "$c" 2>/dev/null; then
      eureka_hit=1
      if grep -qE 'eureka\.client\.healthcheck\.enabled' "$c" 2>/dev/null; then
        hc_ok=1
      fi
    fi
  done
  if [[ "$eureka_hit" -eq 0 ]]; then
    pass "fw_scloud_discovery_healthcheck: 无 Eureka 客户端，跳过"
  elif [[ "$hc_ok" -eq 1 ]]; then
    pass "fw_scloud_discovery_healthcheck: 已配 healthcheck.enabled"
  else
    warn "fw_scloud_discovery_healthcheck: eureka.client 未配 healthcheck.enabled（默认用心跳，无法反映 actuator health）"
  fi

  # ====================================================================
  # fw_scloud_feign_log_level(warn)：Feign 日志级别
  # ====================================================================
  local fl_hit=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'logger-level[[:space:]]*[:=][[:space:]]*FULL|logging\.level.*feign.*FULL' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && fl_hit="${fl_hit}${c}:${ln}
"
  done
  _fw_report warn fw_scloud_feign_log_level "${fl_hit}" "Feign 日志级别 FULL（生产禁用，泄露请求体 + 日志爆炸）" "未检出 Feign FULL 日志"

  # ====================================================================
  # fw_scloud_gateway_ratelimit(warn)：Gateway 限流
  # ====================================================================
  local gw_rl_hit=0 gw_present=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'spring\.cloud\.gateway\.routes|RouteLocator' "$c" 2>/dev/null; then
      gw_present=1
      if grep -qE 'RequestRateLimiter' "$c" 2>/dev/null; then
        gw_rl_hit=1
      fi
    fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if grep -qE 'RouteLocator' "$j" 2>/dev/null; then
      gw_present=1
      if grep -qE 'RequestRateLimiter' "$j" 2>/dev/null; then
        gw_rl_hit=1
      fi
    fi
  done
  if [[ "$gw_present" -eq 0 ]]; then
    pass "fw_scloud_gateway_ratelimit: 无 Gateway，跳过"
  elif [[ "$gw_rl_hit" -eq 1 ]]; then
    pass "fw_scloud_gateway_ratelimit: 已配 RequestRateLimiter"
  else
    warn "fw_scloud_gateway_ratelimit: Gateway 路由无 RequestRateLimiter（入口网关须限流保护下游）"
  fi

  # ====================================================================
  # fw_scloud_config_encrypt(fail)：配置中心敏感值须加密
  # ====================================================================
  local enc_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    # 仅在含配置中心引用时检查（yml 嵌套结构 spring:cloud:config: 或点分隔 spring.cloud.config 或 configserver）
    if ! grep -qE 'spring\.cloud\.config|configserver|^  cloud:' "$c" 2>/dev/null; then
      continue
    fi
    # 敏感 key 行值非 {cipher}
    local ln
    ln=$(grep -nE '(password|secret|api-key|apikey|token|private-key):[[:space:]]*[^{[:space:]]' "$c" 2>/dev/null \
       | grep -vE '\$\{|cipher|<generated>|example|change-?me|changeme' || true)
    [[ -n "$ln" ]] && enc_bad="${enc_bad}${c}:${ln}
"
  done
  _fw_report fail fw_scloud_config_encrypt "${enc_bad}" "配置中心敏感值未加密（须 {cipher} 前缀，明文存储泄露即全泄露 CWE-312）" "未检出明文敏感配置"

  # ====================================================================
  # fw_scloud_version_matrix(warn)：release train 与 Boot 版本矩阵
  # ====================================================================
  local sc_ver="" boot_ver=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    case "$(basename "$c")" in
      pom.xml|*.xml)
        local v
        v=$(grep -A2 -E 'spring-cloud-dependencies' "$c" 2>/dev/null | grep -oE '<version>[^<]+</version>' | head -1 | sed -E 's/<\/?version>//g' || true)
        [[ -n "$v" && -z "$sc_ver" ]] && sc_ver="$v"
        v=$(grep -E '<spring-boot.version>|<parent>' "$c" 2>/dev/null | head -2 || true)
        ;;
      build.gradle|*.gradle|*.gradle.kts)
        local v
        v=$(grep -oE 'spring.cloud.dependencies[^\"]*\"[^\"]+\"' "$c" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)"/\1/' || true)
        [[ -n "$v" && -z "$sc_ver" ]] && sc_ver="$v"
        ;;
    esac
  done
  if [[ -z "$sc_ver" ]]; then
    pass "fw_scloud_version_matrix: 未检出 spring-cloud-dependencies 版本，跳过"
  else
    # 矩阵：2024.x ↔ Boot 3.4；2025.x ↔ Boot 4.0；启发式 major 对齐
    warn "fw_scloud_version_matrix: spring-cloud-dependencies=${sc_ver}，须人工核对与 Spring Boot 版本矩阵对齐（2024.x↔Boot 3.4 / 2025.x↔Boot 4.0）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

# ruleset: dubbo  requires_conf: DUBBO_SRC_GLOBS
# gates: fw_dubbo_timeout_idempotent(warn) fw_dubbo_timeout_config(warn) fw_dubbo_version_required(warn) fw_dubbo_generic_security(warn) fw_dubbo_qos_exposure(fail) fw_dubbo_serialization(warn) fw_dubbo_cluster_failover(warn) fw_dubbo_loadbalance(warn) fw_dubbo_mock_degrade(fail) fw_dubbo_rpc_context(warn) fw_dubbo_async(warn) fw_dubbo_direct_url(fail) fw_dubbo_registry(warn)
# harvested-from: P3 调研（2026-07-17），规律源自 Apache Dubbo 3.3.x 官方文档与 releases
_fw_dubbo_check() {
  echo "  [dubbo] Apache Dubbo 3.3.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置文件 + 构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${DUBBO_SRC_GLOBS[@]+"${DUBBO_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "dubbo: DUBBO_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|*.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # 注解行提取：剥 Javadoc/块注释/行注释行（`* ... @DubboService ...` 这类注释提及不是注解），保留行号供定位
  _fw_dubbo_anno_lines() {
    grep -nE "$2" "$1" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*(\*|/\*|//)' || true
  }

  local has_dubbo=0
  local svc_files="" ref_files=""
  local j c ln
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    [[ -n "$(_fw_dubbo_anno_lines "$j" '@DubboService\b')" ]] && svc_files="${svc_files}${j}
"
    [[ -n "$(_fw_dubbo_anno_lines "$j" '@DubboReference\b')" ]] && ref_files="${ref_files}${j}
"
  done
  svc_files=$(printf '%s' "$svc_files" | grep -E '.+' || true)
  ref_files=$(printf '%s' "$ref_files" | grep -E '.+' || true)
  [[ -n "$svc_files" || -n "$ref_files" ]] && has_dubbo=1

  # ====================================================================
  # fw_dubbo_timeout_idempotent(warn)：retries>0 须确认接口幂等；显式 retries=0 为合规态
  # ====================================================================
  local retry_hit="" retry_zero=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(_fw_dubbo_anno_lines "$j" 'retries[[:space:]]*=[[:space:]]*"?[1-9]')
    [[ -n "$ln" ]] && retry_hit="${retry_hit}${j}:${ln}
"
    [[ -n "$(_fw_dubbo_anno_lines "$j" 'retries[[:space:]]*=[[:space:]]*"?0([^0-9]|$)')" ]] && retry_zero=1
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'retries[[:space:]]*[:=][[:space:]]*"?[1-9]' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && retry_hit="${retry_hit}${c}:${ln}
"
    grep -qE 'retries[[:space:]]*[:=][[:space:]]*"?0([^0-9]|$)' "$c" 2>/dev/null && retry_zero=1
  done
  if [[ -n "$retry_hit" ]]; then
    warn "fw_dubbo_timeout_idempotent: 检出 retries>0（failover 重试放大副作用，须确认目标接口幂等，写操作 retries=0）:
${retry_hit}"
  elif [[ "$has_dubbo" -eq 1 && "$retry_zero" -eq 1 ]]; then
    pass "fw_dubbo_timeout_idempotent: 已显式 retries=0（写接口不重试）"
  elif [[ "$has_dubbo" -eq 1 ]]; then
    warn "fw_dubbo_timeout_idempotent: 未显式声明 retries（默认 2 生效于 failover，非幂等写接口须显式 retries=0）"
  else
    pass "fw_dubbo_timeout_idempotent: 无 Dubbo 服务，跳过"
  fi

  # ====================================================================
  # fw_dubbo_timeout_config(warn)：超时须显式配置
  # ====================================================================
  if [[ "$has_dubbo" -eq 0 ]]; then
    pass "fw_dubbo_timeout_config: 无 Dubbo 服务，跳过"
  else
    local to_bad="" global_to=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      ln=$(_fw_dubbo_anno_lines "$j" '@Dubbo(Service|Reference)\b' | grep -vE 'timeout' || true)
      [[ -n "$ln" ]] && to_bad="${to_bad}${j}:${ln}
"
    done
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'dubbo\.(consumer|provider)\.timeout|^[[:space:]]*timeout[[:space:]]*[:=]' "$c" 2>/dev/null; then
        global_to=1
      fi
    done
    if [[ "$global_to" -eq 1 ]]; then
      pass "fw_dubbo_timeout_config: 已配全局超时"
    elif [[ -n "$to_bad" ]]; then
      warn "fw_dubbo_timeout_config: @DubboService/@DubboReference 未配 timeout 且无全局超时（默认 1000ms 与业务 SLA 不符风险）:
${to_bad}"
    else
      pass "fw_dubbo_timeout_config: 超时已显式配置"
    fi
  fi

  # ====================================================================
  # fw_dubbo_version_required(warn)：@DubboService 须显式 version
  # ====================================================================
  local ver_bad=""
  if [[ -n "$svc_files" ]]; then
    while IFS= read -r vf; do
      [[ -z "$vf" ]] && continue
      ln=$(_fw_dubbo_anno_lines "$vf" '@DubboService\b' | grep -vE 'version' || true)
      [[ -n "$ln" ]] && ver_bad="${ver_bad}${vf}:${ln}
"
    done <<< "$svc_files"
  fi
  if [[ -z "$svc_files" ]]; then
    pass "fw_dubbo_version_required: 无 @DubboService，跳过"
  elif [[ -n "$ver_bad" ]]; then
    warn "fw_dubbo_version_required: @DubboService 未显式 version（接口演进/灰度须 version 隔离）:
${ver_bad}"
  else
    pass "fw_dubbo_version_required: @DubboService 均显式 version"
  fi

  # ====================================================================
  # fw_dubbo_generic_security(warn)：泛化调用安全
  # ====================================================================
  local gen_hit=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'GenericService|\$invoke\b|generic[[:space:]]*=[[:space:]]*"?true' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && gen_hit="${gen_hit}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'generic[[:space:]]*[:=][[:space:]]*"?true' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && gen_hit="${gen_hit}${c}:${ln}
"
  done
  _fw_report warn fw_dubbo_generic_security "$gen_hit" "检出泛化调用（须鉴权 + 方法/参数白名单，禁止透传外部输入 CWE-862）" "未检出泛化调用"

  # ====================================================================
  # fw_dubbo_qos_exposure(fail)：qos 端口禁止公网暴露
  # ====================================================================
  local qos_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'dubbo\.qos\.accept\.foreign\.ip[[:space:]]*[:=][[:space:]]*true|qos-accept-foreign-ip[[:space:]]*[:=][[:space:]]*true|dubbo\.qos\.host[[:space:]]*[:=][[:space:]]*0\.0\.0\.0|qos-host[[:space:]]*[:=][[:space:]]*0\.0\.0\.0' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && qos_bad="${qos_bad}${c}:${ln}
"
  done
  # yml 嵌套形态（qos:\n  accept-foreign-ip: true 简化按同行 key 检）
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'accept-foreign-ip[[:space:]]*:[[:space:]]*true' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && qos_bad="${qos_bad}${c}:${ln}
"
  done
  _fw_report fail fw_dubbo_qos_exposure "$qos_bad" "qos 端口允许远程访问（无鉴权可远程下线服务 CWE-749，生产必须 localhost）" "qos 未允许远程访问"

  # ====================================================================
  # fw_dubbo_serialization(warn)：序列化协议选型
  # ====================================================================
  local ser_hit=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'serialization[[:space:]]*=[[:space:]]*"(java|nativejava|fastjson)"' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && ser_hit="${ser_hit}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'serialization[[:space:]]*[:=][[:space:]]*"?(java|nativejava|fastjson)\b' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && ser_hit="${ser_hit}${c}:${ln}
"
  done
  _fw_report warn fw_dubbo_serialization "$ser_hit" "检出 java 原生/fastjson1 序列化（反序列化 RCE CWE-502，须 hessian2/fastjson2）" "未检出高危序列化协议"

  # ====================================================================
  # fw_dubbo_cluster_failover(warn)：集群容错策略语义匹配
  # ====================================================================
  local clu_hit=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'cluster[[:space:]]*=[[:space:]]*"(failover|failsafe|forking|failback|broadcast)"' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && clu_hit="${clu_hit}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'cluster[[:space:]]*[:=][[:space:]]*"?(failover|failsafe|forking|failback|broadcast)\b' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && clu_hit="${clu_hit}${c}:${ln}
"
  done
  _fw_report warn fw_dubbo_cluster_failover "$clu_hit" "检出显式 cluster 策略（写操作须 failfast，failsafe 吞异常仅可丢弃调用）" "未显式配 cluster（默认 failover，写接口须自行评估）"

  # ====================================================================
  # fw_dubbo_loadbalance(warn)：负载均衡策略评估
  # ====================================================================
  local lb_hit=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'loadbalance[[:space:]]*=[[:space:]]*"(random|roundrobin|leastactive|consistenthash|shortestresponse)"' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && lb_hit="${lb_hit}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'loadbalance[[:space:]]*[:=][[:space:]]*"?(random|roundrobin|leastactive|consistenthash|shortestresponse)\b' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && lb_hit="${lb_hit}${c}:${ln}
"
  done
  _fw_report warn fw_dubbo_loadbalance "$lb_hit" "检出显式 loadbalance（须确认与流量特征匹配，默认 random 不感知实例负载）" "未显式配 loadbalance"

  # ====================================================================
  # fw_dubbo_mock_degrade(fail)：mock=force 上生产屏蔽真实调用
  # ====================================================================
  local mock_bad="" mock_warn=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'mock[[:space:]]*=[[:space:]]*"force:' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && mock_bad="${mock_bad}${j}:${ln}
"
    ln=$(grep -nE 'mock[[:space:]]*=[[:space:]]*"return' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && mock_warn="${mock_warn}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'mock[[:space:]]*[:=][[:space:]]*"?force:' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && mock_bad="${mock_bad}${c}:${ln}
"
  done
  if [[ -n "$mock_bad" ]]; then
    fail "fw_dubbo_mock_degrade: 检出 mock=force:（直接屏蔽真实调用，仅限测试/演练，生产禁用）:
${mock_bad}"
  elif [[ -n "$mock_warn" ]]; then
    warn "fw_dubbo_mock_degrade: 检出 mock=return 降级（确认兜底内容合理）:
${mock_warn}"
  else
    pass "fw_dubbo_mock_degrade: 未检出 mock 配置"
  fi

  # ====================================================================
  # fw_dubbo_rpc_context(warn)：RpcContext 隐式传参 + 异步丢失
  # ====================================================================
  local rc_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if ! grep -qE 'RpcContext\.[a-zA-Z]+\.(get|set|remove)Attachment|RpcContext\.get(Context|ClientAttachment|ServerAttachment)\(\)\.(get|set|remove)Attachment' "$j" 2>/dev/null; then
      continue
    fi
    if grep -qE 'CompletableFuture|@Async|new Thread|ExecutorService' "$j" 2>/dev/null; then
      rc_bad="${rc_bad}${j}
"
    fi
  done
  _fw_report warn fw_dubbo_rpc_context "$rc_bad" "RpcContext 隐式传参与异步/线程切换同文件（attachment 跨线程丢失，上下文断链）" "未检出隐式传参与异步混用"

  # ====================================================================
  # fw_dubbo_async(warn)：异步调用须异常/超时兜底
  # ====================================================================
  local async_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if ! grep -qE 'async[[:space:]]*=[[:space:]]*true|RpcContext\.[a-zA-Z]+\(\)\.getCompletableFuture|RpcContext\.getContext\(\)\.getCompletableFuture' "$j" 2>/dev/null; then
      continue
    fi
    if ! grep -qE 'exceptionally|orTimeout|completeOnTimeout|whenComplete' "$j" 2>/dev/null; then
      async_bad="${async_bad}${j}
"
    fi
  done
  _fw_report warn fw_dubbo_async "$async_bad" "Dubbo 异步调用无 exceptionally/orTimeout 兜底（异常静默 / future 悬挂）" "异步调用有兜底或未检出异步"

  # ====================================================================
  # fw_dubbo_direct_url(fail)：生产禁用直连 url
  # ====================================================================
  local url_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'url[[:space:]]*=[[:space:]]*"dubbo://' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && url_bad="${url_bad}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'dubbo\.reference\.[a-zA-Z0-9._-]+\.url|^[[:space:]]*url[[:space:]]*:[[:space:]]*dubbo://' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && url_bad="${url_bad}${c}:${ln}
"
  done
  _fw_report fail fw_dubbo_direct_url "$url_bad" "检出 Dubbo 直连 url（绕过注册中心，仅限测试环境，生产禁用）" "未检出直连 url"

  # ====================================================================
  # fw_dubbo_registry(warn)：注册中心地址须显式配置
  # ====================================================================
  if [[ "$has_dubbo" -eq 0 ]]; then
    pass "fw_dubbo_registry: 无 Dubbo 服务，跳过"
  else
    local reg_hit=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      # 扁平 properties（dubbo.registry.address=…）/ 带 scheme 的 YAML address / Spring Boot 惯用的 YAML 嵌套
      # （registry: 块下 address: 任意非空值——N/A 是显式的「无注册中心直连」声明，同属已配置）
      if grep -qE 'dubbo\.registry\.address|registry\.address|^[[:space:]]*address[[:space:]]*:[[:space:]]*(nacos|zookeeper|redis|multicast)://' "$c" 2>/dev/null \
         || { grep -qE '^[[:space:]]*registry[[:space:]]*:' "$c" 2>/dev/null \
              && grep -qE '^[[:space:]]*address[[:space:]]*:[[:space:]]*[^[:space:]#]' "$c" 2>/dev/null; }; then
        reg_hit=1
        break
      fi
    done
    if [[ "$reg_hit" -eq 1 ]]; then
      pass "fw_dubbo_registry: 注册中心地址已配置"
    else
      warn "fw_dubbo_registry: 检出 Dubbo 服务但无 dubbo.registry.address（服务注册失败或注册到错误集群风险）"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

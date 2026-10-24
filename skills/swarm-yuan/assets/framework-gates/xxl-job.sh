# ruleset: xxl-job  requires_conf: XXLJOB_SRC_GLOBS
# gates: fw_xxljob_idempotent(warn) fw_xxljob_access_token(fail) fw_xxljob_route_strategy(warn) fw_xxljob_shard_consistency(warn) fw_xxljob_fail_retry(warn) fw_xxljob_glue_injection(fail) fw_xxljob_schedule_ha(warn) fw_xxljob_executor_registry(warn) fw_xxljob_log_collection(warn) fw_xxljob_version_align(warn)
# harvested-from: P3（2026-07-17），规律源自 XXL-Job 3.4.x 官方文档与 releases
_fw_xxl_job_check() {
  echo "  [xxl-job] XXL-Job 3.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置 + 构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${XXLJOB_SRC_GLOBS[@]+"${XXLJOB_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "xxl-job: XXLJOB_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|*.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # ====================================================================
  # fw_xxljob_idempotent(warn)：@XxlJob 含写操作须幂等
  # ====================================================================
  local idem_bad=""
  local j
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE '@XxlJob\b' "$j" 2>/dev/null || continue
    # 写操作特征
    grep -qE '\.(insert|update|save|delete)[A-Z(]|\.(insert|update|save|delete)\(|jdbcTemplate\.(update|execute)' "$j" 2>/dev/null || continue
    # 幂等痕迹
    if ! grep -qE '幂等|idempot|[Dd]edup|去重|getShardIndex|唯一键|uniqueKey|onDuplicateKey|INSERT[[:space:]]+IGNORE|insertIgnore' "$j" 2>/dev/null; then
      idem_bad="${idem_bad}${j}
"
    fi
  done
  _fw_report warn fw_xxljob_idempotent "${idem_bad}" "@XxlJob 含写操作但无幂等痕迹（重试/分片/故障转移会重复执行）" "任务处理器幂等性痕迹齐备或无写操作任务"

  # ====================================================================
  # fw_xxljob_access_token(fail)：accessToken 禁止空/默认/弱值
  # ====================================================================
  local tk_fail="" tk_any=0
  local c ln
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE '(xxl\.job\.(executor\.)?accessToken|accessToken)[[:space:]]*[:=]' "$c" 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    tk_any=1
    # 空值（properties 行尾 = 空 / yml 行尾 : 空 / 空串 "" ''）
    local bad
    bad=$(printf '%s\n' "$ln" | grep -E 'accessToken[[:space:]]*[:=][[:space:]]*(""|'"''"')?[[:space:]]*(#.*)?$' \
        | grep -E 'accessToken' || true)
    [[ -n "$bad" ]] && tk_fail="${tk_fail}${c}:${bad}
"
    # 默认/弱值
    bad=$(printf '%s\n' "$ln" | grep -iE 'accessToken[[:space:]]*[:=][[:space:]]*"?(default_token|xxl-job|123456|test|admin|changeme|password)"?[[:space:]]*$' || true)
    [[ -n "$bad" ]] && tk_fail="${tk_fail}${c}:${bad}
"
  done
  if [[ -n "$tk_fail" ]]; then
    fail "fw_xxljob_access_token: 执行器/调度中心 accessToken 为空或弱值（未授权触发任务 + GLUE RCE 面，CWE-306/798）:
${tk_fail}"
  elif [[ "$tk_any" -eq 0 ]]; then
    # 有 xxl-job 配置但完全无 accessToken
    local has_xxl=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'xxl\.job\.|xxl-job-core' "$c" 2>/dev/null; then has_xxl=1; break; fi
    done
    if [[ "$has_xxl" -eq 1 ]]; then
      warn "fw_xxljob_access_token: 检出 xxl-job 配置但未配 accessToken（2.1+ 生产必须双侧配置强随机 token）"
    else
      pass "fw_xxljob_access_token: 无 xxl-job 配置，跳过"
    fi
  else
    pass "fw_xxljob_access_token: accessToken 已配置非空非弱值"
  fi

  # ====================================================================
  # fw_xxljob_route_strategy(warn)：批量任务须评估分片广播
  # ====================================================================
  local route_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE '@XxlJob\b' "$j" 2>/dev/null || continue
    grep -qE 'for[[:space:]]*\(|while[[:space:]]*\(|batch|[Bb]atch|page|Page|List<' "$j" 2>/dev/null || continue
    if ! grep -qE 'getShardIndex|getShardTotal' "$j" 2>/dev/null; then
      route_bad="${route_bad}${j}
"
    fi
  done
  _fw_report warn fw_xxljob_route_strategy "${route_bad}" "批量特征任务未见分片痕迹（大数据量任务须分片广播 SHARDING_BROADCAST，默认 FIRST 单机热点）" "批量任务已用分片或无批量任务"

  # ====================================================================
  # fw_xxljob_shard_consistency(warn)：分片须取模分发
  # ====================================================================
  local shard_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE 'XxlJobHelper\.getShardIndex' "$j" 2>/dev/null || continue
    if ! grep -qE 'XxlJobHelper\.getShardTotal' "$j" 2>/dev/null || ! grep -qE '%' "$j" 2>/dev/null; then
      shard_bad="${shard_bad}${j}
"
    fi
  done
  _fw_report warn fw_xxljob_shard_consistency "${shard_bad}" "用 getShardIndex 但未见 getShardTotal 取模（全执行器将重复处理全量数据）" "分片取模分发正确或未用分片"

  # ====================================================================
  # fw_xxljob_fail_retry(warn)：catch 块禁止吞异常
  # ====================================================================
  local fr_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE '@XxlJob\b' "$j" 2>/dev/null || continue
    grep -qE 'catch[[:space:]]*\(' "$j" 2>/dev/null || continue
    if ! grep -qE 'handleFail|ReturnT\.FAILED|FAILED|throw[[:space:]]' "$j" 2>/dev/null; then
      fr_bad="${fr_bad}${j}
"
    fi
  done
  _fw_report warn fw_xxljob_fail_retry "${fr_bad}" "catch 块疑似吞异常（须 throw / XxlJobHelper.handleFail，否则调度中心误判成功，重试告警失效）" "失败上报痕迹齐备或无 catch"

  # ====================================================================
  # fw_xxljob_glue_injection(fail)：动态执行 + 任务参数 = RCE 面
  # ====================================================================
  local glue_fail="" glue_warn=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if ! grep -qE 'GroovyClassLoader|ScriptEngine|Runtime\.getRuntime\(\)\.exec|ProcessBuilder' "$j" 2>/dev/null; then
      continue
    fi
    if grep -qE 'getJobParam|XxlJobHelper\.getJobParam' "$j" 2>/dev/null; then
      glue_fail="${glue_fail}${j}
"
    else
      glue_warn="${glue_warn}${j}
"
    fi
  done
  if [[ -n "$glue_fail" ]]; then
    fail "fw_xxljob_glue_injection: 动态执行 API 与任务参数同文件（任务参数拼入代码/命令执行 = RCE，CWE-94/78）:
${glue_fail}"
  elif [[ -n "$glue_warn" ]]; then
    warn "fw_xxljob_glue_injection: 检出动态执行 API（人工确认输入不可被任务参数污染）:
${glue_warn}"
  else
    pass "fw_xxljob_glue_injection: 未检出动态执行面"
  fi

  # ====================================================================
  # fw_xxljob_schedule_ha(warn)：admin.addresses 须多地址
  # ====================================================================
  local ha_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'xxl\.job\.admin\.addresses[[:space:]]*[:=]' "$c" 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    # 值不含逗号即单地址
    local val
    val=$(printf '%s\n' "$ln" | sed -E 's/.*addresses[[:space:]]*[:=][[:space:]]*//; s/["'"'"']//g' | head -1)
    if ! printf '%s' "$val" | grep -q ','; then
      ha_bad="${ha_bad}${c}:${ln}
"
    fi
  done
  _fw_report warn fw_xxljob_schedule_ha "${ha_bad}" "xxl.job.admin.addresses 为单地址（调度中心集群须逗号分隔多地址，单点故障执行器失联）" "admin.addresses 多地址或未配置"

  # ====================================================================
  # fw_xxljob_executor_registry(warn)：executor.appname 须显式配置
  # ====================================================================
  local xxl_cfg=0 appname_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'xxl\.job\.|xxl-job-core' "$c" 2>/dev/null; then xxl_cfg=1; fi
    if grep -qE 'xxl\.job\.executor\.appname|appname[[:space:]]*[:=][[:space:]]*[^[:space:]"]' "$c" 2>/dev/null; then appname_ok=1; fi
  done
  if [[ "$xxl_cfg" -eq 0 ]]; then
    pass "fw_xxljob_executor_registry: 无 xxl-job 配置，跳过"
  elif [[ "$appname_ok" -eq 1 ]]; then
    pass "fw_xxljob_executor_registry: executor.appname 已配置"
  else
    warn "fw_xxljob_executor_registry: 检出 xxl-job 但无 xxl.job.executor.appname（自动注册不可用，退化为手动录入）"
  fi

  # ====================================================================
  # fw_xxljob_log_collection(warn)：任务日志走 XxlJobHelper.log + logpath
  # ====================================================================
  local log_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE '@XxlJob\b' "$j" 2>/dev/null || continue
    if grep -qE 'System\.out\.print' "$j" 2>/dev/null; then
      log_bad="${log_bad}${j}(System.out)
"
    fi
  done
  if [[ "$xxl_cfg" -eq 1 ]]; then
    local logpath_ok=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'xxl\.job\.executor\.logpath[[:space:]]*[:=][[:space:]]*[^[:space:]"#]' "$c" 2>/dev/null; then logpath_ok=1; fi
    done
    [[ "$logpath_ok" -eq 0 ]] && log_bad="${log_bad}(xxl.job.executor.logpath 未配置，默认路径随容器易失)
"
  fi
  _fw_report warn fw_xxljob_log_collection "${log_bad}" "任务日志未走 XxlJobHelper.log 或 logpath 未配（调度中心看不到执行日志）" "日志采集配置齐备"

  # ====================================================================
  # fw_xxljob_version_align(warn)：xxl-job-core 与调度中心主版本对齐
  # ====================================================================
  local core_ver=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local v
    # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
    v=$(grep -A3 -E 'xxl-job-core' "$c" 2>/dev/null | grep -oE '<version>[0-9][^<]*</version>' | head -1 | sed -E 's/<\/?version>//g' || true)
    [[ -z "$v" ]] && v=$(grep -oE 'xxl-job-core[^0-9"]*[0-9]+\.[0-9]+(\.[0-9]+)?' "$c" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || true)
    [[ -n "$v" && -z "$core_ver" ]] && core_ver="$v"
  done
  if [[ -z "$core_ver" ]]; then
    pass "fw_xxljob_version_align: 未检出 xxl-job-core 版本，跳过"
  elif printf '%s' "$core_ver" | grep -qE '^[012]\.'; then
    warn "fw_xxljob_version_align: xxl-job-core=${core_ver} 为 3.x 之前版本（须人工核对与调度中心大版本对齐，协议跨大版本不保证兼容）"
  else
    pass "fw_xxljob_version_align: xxl-job-core=${core_ver} 为 3.x"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

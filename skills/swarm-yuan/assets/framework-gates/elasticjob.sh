# ruleset: elasticjob  requires_conf: ELASTICJOB_SRC_GLOBS
# gates: fw_elasticjob_failover(fail) fw_elasticjob_idempotent(warn) fw_elasticjob_sharding(warn) fw_elasticjob_registry(warn) fw_elasticjob_misfire(warn) fw_elasticjob_timezone(warn) fw_elasticjob_error_handler(warn) fw_elasticjob_tracing(warn)
# harvested-from: P3（2026-07-17），规律源自 ElasticJob 3.x（3.0.5）官方文档与 releases
_fw_elasticjob_check() {
  echo "  [elasticjob] ElasticJob 3.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置 + 构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${ELASTICJOB_SRC_GLOBS[@]+"${ELASTICJOB_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "elasticjob: ELASTICJOB_SRC_GLOBS 未配置或无文件可检"
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

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，剔 // 与块注释行）
  # 配置正文过滤：调公共库 _fw_strip_comments_cfg（配置系，剔 # 注释行）

  local j c ln

  # 作业存在性预检（Java 实现类 或 elasticjob.jobs 配置 或 依赖声明）
  local job_present=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE 'implements (SimpleJob|DataflowJob|ScriptJob)|ShardingContext|ScheduleJobBootstrap'; then
      job_present=1
      break
    fi
  done
  if [[ "$job_present" -eq 0 ]]; then
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if _fw_strip_comments_cfg "$c" | grep -qE 'elasticjob\.jobs\.|elasticjob-lite'; then
        job_present=1
        break
      fi
    done
  fi

  # ====================================================================
  # fw_elasticjob_failover(fail)：分片作业须开 failover 失效转移
  # ====================================================================
  local fo_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if _fw_strip_comments_cfg "$c" | grep -qE 'failover[[:space:]]*[:=][[:space:]]*true'; then fo_ok=1; fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE '\.failover\(true\)'; then fo_ok=1; fi
  done
  if [[ "$job_present" -eq 0 ]]; then
    pass "fw_elasticjob_failover: 无 ElasticJob 作业，跳过"
  elif [[ "$fo_ok" -eq 1 ]]; then
    pass "fw_elasticjob_failover: failover 已开启"
  else
    fail "fw_elasticjob_failover: 检出 ElasticJob 作业但未开启 failover（实例宕机其分片数据该周期不处理，须 failover=true）"
  fi

  # ====================================================================
  # fw_elasticjob_idempotent(warn)：作业含写操作须幂等
  # ====================================================================
  local idem_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    _fw_strip_comments_c "$j" | grep -qE 'implements (SimpleJob|DataflowJob|ScriptJob)' || continue
    _fw_strip_comments_c "$j" | grep -qE '\.(insert|update|save|delete)[A-Z(]|\.(insert|update|save|delete)\(|jdbcTemplate\.(update|execute)' || continue
    if ! _fw_strip_comments_c "$j" | grep -qE '幂等|idempot|[Dd]edup|去重|唯一键|uniqueKey|onDuplicateKey|INSERT[[:space:]]+IGNORE|insertIgnore|状态机'; then
      idem_bad="${idem_bad}${j}
"
    fi
  done
  _fw_report warn fw_elasticjob_idempotent "$idem_bad" "作业含写操作但无幂等痕迹（重分片/failover/手动触发会重复执行）" "作业幂等性痕迹齐备或无写操作作业"

  # ====================================================================
  # fw_elasticjob_sharding(warn)：分片须确定性取模分发
  # ====================================================================
  local shard_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    _fw_strip_comments_c "$j" | grep -qE 'getShardingItem' || continue
    if ! _fw_strip_comments_c "$j" | grep -qE 'getShardingTotalCount' || ! _fw_strip_comments_c "$j" | grep -qE '%'; then
      shard_bad="${shard_bad}${j}
"
    fi
  done
  _fw_report warn fw_elasticjob_sharding "$shard_bad" "用 getShardingItem 但未见 getShardingTotalCount 取模（每实例将处理全量数据，副作用放大 N 倍）" "分片取模分发正确或未用分片"

  # ====================================================================
  # fw_elasticjob_registry(warn)：ZK 注册中心须集群多地址
  # ====================================================================
  local reg_any=0 reg_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(_fw_strip_comments_cfg "$c" | grep -nE 'server-lists[[:space:]]*[:=]' || true)
    [[ -z "$ln" ]] && continue
    reg_any=1
    local val
    val=$(printf '%s\n' "$ln" | sed -E 's/.*server-lists[[:space:]]*[:=][[:space:]]*//; s/["'"'"']//g' | head -1)
    if ! printf '%s' "$val" | grep -q ','; then
      reg_bad="${reg_bad}${c}:${ln}
"
    fi
  done
  if [[ "$job_present" -eq 0 ]]; then
    pass "fw_elasticjob_registry: 无 ElasticJob 作业，跳过"
  elif [[ "$reg_any" -eq 0 ]]; then
    warn "fw_elasticjob_registry: 检出 ElasticJob 作业但无 elasticjob.reg-center.server-lists（ZK 注册中心未配置）"
  elif [[ -n "$reg_bad" ]]; then
    warn "fw_elasticjob_registry: server-lists 为单地址（ZK 单点故障全量作业停调，生产须集群多地址逗号分隔）:
${reg_bad}"
  else
    pass "fw_elasticjob_registry: ZK 注册中心多地址已配"
  fi

  # ====================================================================
  # fw_elasticjob_misfire(warn)：misfire 须显式配置
  # ====================================================================
  local mis_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if _fw_strip_comments_cfg "$c" | grep -qE 'elasticjob\.jobs\.|elastic-job-class'; then
      if _fw_strip_comments_cfg "$c" | grep -qE 'misfire'; then mis_hit=1; fi
    fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE '\.misfire\('; then mis_hit=1; fi
  done
  if [[ "$job_present" -eq 0 ]]; then
    pass "fw_elasticjob_misfire: 无 ElasticJob 作业，跳过"
  elif [[ "$mis_hit" -eq 1 ]]; then
    pass "fw_elasticjob_misfire: misfire 已显式配置"
  else
    warn "fw_elasticjob_misfire: 作业配置无 misfire 键（默认补跑策略须按业务显式选型，防恢复后补跑风暴/数据缺口）"
  fi

  # ====================================================================
  # fw_elasticjob_timezone(warn)：cron 须显式时区
  # ====================================================================
  local tz_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if _fw_strip_comments_cfg "$c" | grep -qE 'time-zone|timeZone'; then tz_hit=1; fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE '\.timeZone\(|TimeZone\.getTimeZone'; then tz_hit=1; fi
  done
  if [[ "$job_present" -eq 0 ]]; then
    pass "fw_elasticjob_timezone: 无 ElasticJob 作业，跳过"
  elif [[ "$tz_hit" -eq 1 ]]; then
    pass "fw_elasticjob_timezone: 作业时区已显式声明"
  else
    warn "fw_elasticjob_timezone: 作业配置无 time-zone（容器默认 UTC 与 Asia/Shanghai 差 8h，须显式声明）"
  fi

  # ====================================================================
  # fw_elasticjob_error_handler(warn)：禁止 catch 吞异常
  # ====================================================================
  local eh_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    _fw_strip_comments_c "$j" | grep -qE 'implements (SimpleJob|DataflowJob|ScriptJob)' || continue
    _fw_strip_comments_c "$j" | grep -qE 'catch[[:space:]]*\(' || continue
    if ! _fw_strip_comments_c "$j" | grep -qE 'throw[[:space:]]|JobErrorHandler|error-handler|errorHandler'; then
      eh_bad="${eh_bad}${j}
"
    fi
  done
  _fw_report warn fw_elasticjob_error_handler "$eh_bad" "作业 catch 疑似吞异常（须 rethrow 或接 JobErrorHandler，否则调度层误判成功，监控失效）" "异常处理痕迹齐备或无 catch"

  # ====================================================================
  # fw_elasticjob_tracing(warn)：作业事件追踪须接 RDB
  # ====================================================================
  local tr_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if _fw_strip_comments_cfg "$c" | grep -qE 'elasticjob\.tracing|tracing\.type|event-trace'; then tr_hit=1; fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE 'TracingConfiguration|TracingListener'; then tr_hit=1; fi
  done
  if [[ "$job_present" -eq 0 ]]; then
    pass "fw_elasticjob_tracing: 无 ElasticJob 作业，跳过"
  elif [[ "$tr_hit" -eq 1 ]]; then
    pass "fw_elasticjob_tracing: 事件追踪已配置"
  else
    warn "fw_elasticjob_tracing: 作业无 elasticjob.tracing 事件追踪（执行历史仅存 ZK 瞬时状态，故障回溯断链，须 tracing.type=RDB）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

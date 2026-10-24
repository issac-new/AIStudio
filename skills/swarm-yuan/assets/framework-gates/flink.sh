# ruleset: flink  requires_conf: FLINK_SRC_GLOBS
# gates: fw_flink_checkpoint_enabled(fail) fw_flink_checkpoint_interval(warn) fw_flink_savepoint_uid(warn) fw_flink_exactly_once_sink(warn) fw_flink_watermark(warn) fw_flink_allowed_lateness(warn) fw_flink_state_backend(warn) fw_flink_state_ttl(warn) fw_flink_api_choice(warn) fw_flink_cdc_checkpoint(warn) fw_flink_restart_strategy(warn) fw_flink_parallelism_slots(warn) fw_flink_async_io(warn) fw_flink_cep_within(warn) fw_flink_jm_ha(warn) fw_flink_version_2x(warn)
# harvested-from: P3（2026-07-17），规律源自 Apache Flink 2.x / 1.20.x LTS 官方文档与 Flink CDC 3.x 文档
_fw_flink_check() {
  echo "  [flink] Apache Flink 2.x / 1.20.x LTS 框架规律"

  # ---------- 收集源文件清单（Java + SQL + YAML + conf 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${FLINK_SRC_GLOBS[@]+"${FLINK_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "flink: FLINK_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/SQL 文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java|*.scala) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|*.sql|*.xml) cfgarr+=("$f") ;;
    esac
  done

  # ---------- 全局信号预检（供多门禁复用） ----------
  # 作业入口（DataStream / Table）
  local has_job=0
  if grep -lqE 'StreamExecutionEnvironment|getExecutionEnvironment|StreamTableEnvironment' ${javaarr[@]+"${javaarr[@]}"} 2>/dev/null; then
    has_job=1
  fi
  # checkpoint 配置（代码或配置文件任一；覆盖点分隔与 yaml 缩进两种写法）
  local has_ckpt=0
  if grep -lqE 'enableCheckpointing|checkpointing\.interval|interval:[[:space:]]*[0-9]+' ${javaarr[@]+"${javaarr[@]}"} ${cfgarr[@]+"${cfgarr[@]}"} 2>/dev/null; then
    has_ckpt=1
  fi

  # ====================================================================
  # fw_flink_checkpoint_enabled(fail)：流作业必须启用 checkpoint
  # ====================================================================
  if [[ "$has_job" -eq 0 ]]; then
    pass "fw_flink_checkpoint_enabled: 未检出 DataStream/Table 作业入口，跳过"
  elif [[ "$has_ckpt" -eq 1 ]]; then
    pass "fw_flink_checkpoint_enabled: checkpoint 已启用"
  else
    fail "fw_flink_checkpoint_enabled: 检出 Flink 作业但全项目无 checkpoint 配置（enableCheckpointing/execution.checkpointing.interval）——故障丢状态无法恢复，生产必须启用"
  fi

  # ====================================================================
  # fw_flink_checkpoint_interval(warn)：checkpoint 间隔过小拖吞吐
  # ====================================================================
  local ckpt_small=""
  if [[ "$has_ckpt" -eq 1 ]]; then
    local jf
    for jf in ${javaarr[@]+"${javaarr[@]}"}; do
      local ln
      ln=$(grep -nE 'enableCheckpointing\(([0-9]{1,4}|[1-5][0-9]{4})\)' "$jf" 2>/dev/null || true)
      [[ -n "$ln" ]] && ckpt_small="${ckpt_small}${jf}:${ln}
"
    done
  fi
  _fw_report warn fw_flink_checkpoint_interval "$ckpt_small" "checkpoint 间隔疑似 <60s（大状态作业过频快照拖吞吐，经验区间 1–10min，须人工确认）" "未检出过小 checkpoint 间隔"

  # ====================================================================
  # fw_flink_savepoint_uid(warn)：算子须显式 .uid()
  # ====================================================================
  local uid_bad=""
  local jf
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE '\.(map|flatMap|keyBy|process|filter|window)\(' "$jf" 2>/dev/null; then
      if ! grep -qE '\.uid\(' "$jf" 2>/dev/null; then
        uid_bad="${uid_bad}${jf}
"
      fi
    fi
  done
  _fw_report warn fw_flink_savepoint_uid "$uid_bad" "转换算子未显式 .uid()（savepoint 升级后无法映射状态，生产须全算子 uid）" "算子均显式 uid 或无转换算子"

  # ====================================================================
  # fw_flink_exactly_once_sink(warn)：exactly-once 须事务 Sink
  # ====================================================================
  local eos_files
  eos_files=$(grep -rlE 'EXACTLY_ONCE' ${javaarr[@]+"${javaarr[@]}"} 2>/dev/null || true)
  local eos_bad=""
  while IFS= read -r jf; do
    [[ -z "$jf" ]] && continue
    if grep -qE 'addSink\(|implements SinkFunction|new SinkFunction' "$jf" 2>/dev/null; then
      eos_bad="${eos_bad}${jf}
"
    fi
  done <<< "$eos_files"
  _fw_report warn fw_flink_exactly_once_sink "$eos_bad" "EXACTLY_ONCE + addSink/SinkFunction（旧接口无两阶段提交，端到端仅 at-least-once，须迁 FLIP-143 Sink/KafkaSink 事务）" "未检出 EXACTLY_ONCE+旧 Sink 组合"

  # ====================================================================
  # fw_flink_watermark(warn)：事件时间窗口必须配 Watermark
  # ====================================================================
  local wm_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE 'EventTimeWindows|EventTimeSessionWindows|event_time|\.window\(' "$jf" 2>/dev/null; then
      if ! grep -qE 'WatermarkStrategy|assignTimestampsAndWatermarks' "$jf" 2>/dev/null; then
        wm_bad="${wm_bad}${jf}
"
      fi
    fi
  done
  _fw_report warn fw_flink_watermark "$wm_bad" "检出窗口/事件时间用法但无 WatermarkStrategy（事件时间窗口无水位线永不触发或数据错乱）" "窗口作业均配 Watermark 或无窗口"

  # ====================================================================
  # fw_flink_allowed_lateness(warn)：迟到数据须显式处置
  # ====================================================================
  local late_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE 'EventTimeWindows|\.window\(' "$jf" 2>/dev/null; then
      if ! grep -qE 'allowedLateness|sideOutputLateData' "$jf" 2>/dev/null; then
        late_bad="${late_bad}${jf}
"
      fi
    fi
  done
  _fw_report warn fw_flink_allowed_lateness "$late_bad" "窗口作业无 allowedLateness/sideOutputLateData（超水位线迟到数据默认静默丢弃，统计口径漏数）" "迟到数据已显式处置或无窗口"

  # ====================================================================
  # fw_flink_state_backend(warn)：KeyedState 使用须确认状态后端
  # ====================================================================
  local ks_files
  ks_files=$(grep -rlE 'ValueState|ListState|MapState|ReducingState|AggregatingState' ${javaarr[@]+"${javaarr[@]}"} 2>/dev/null || true)
  if [[ -z "$ks_files" ]]; then
    pass "fw_flink_state_backend: 未检出 KeyedState，跳过"
  else
    local sb_hit=0
    if grep -lqE 'state\.backend|EmbeddedRocksDBStateBackend|HashMapStateBackend|ForStStateBackend' ${javaarr[@]+"${javaarr[@]}"} ${cfgarr[@]+"${cfgarr[@]}"} 2>/dev/null; then
      sb_hit=1
    fi
    if [[ "$sb_hit" -eq 1 ]]; then
      pass "fw_flink_state_backend: 已配状态后端"
    else
      warn "fw_flink_state_backend: 检出 KeyedState 但无 state.backend 配置（默认堆内，GB 级状态须 RocksDB+增量快照；2.x ForSt 待验证）"
    fi
  fi

  # ====================================================================
  # fw_flink_state_ttl(warn)：KeyedState 须配 StateTtlConfig
  # ====================================================================
  local ttl_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE 'ValueStateDescriptor|ListStateDescriptor|MapStateDescriptor|ReducingStateDescriptor|AggregatingStateDescriptor' "$jf" 2>/dev/null; then
      if ! grep -qE 'StateTtlConfig|enableTimeToLive' "$jf" 2>/dev/null; then
        ttl_bad="${ttl_bad}${jf}
"
      fi
    fi
  done
  _fw_report warn fw_flink_state_ttl "$ttl_bad" "StateDescriptor 未配 StateTtlConfig（key 空间增长时状态无界膨胀，须 TTL+清理策略）" "状态均配 TTL 或无 KeyedState"

  # ====================================================================
  # fw_flink_api_choice(warn)：DataStream vs Table API 混用边界
  # ====================================================================
  local mix_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE 'StreamTableEnvironment' "$jf" 2>/dev/null; then
      if grep -qE 'KeyedProcessFunction|\.process\(' "$jf" 2>/dev/null; then
        mix_bad="${mix_bad}${jf}
"
      fi
    fi
  done
  _fw_report warn fw_flink_api_choice "$mix_bad" "Table/SQL 与 DataStream 复杂状态算子混用（须明确转换边界，retract 语义易错）" "未检出两套 API 混用"

  # ====================================================================
  # fw_flink_cdc_checkpoint(warn)：CDC 源断点续传依赖 checkpoint
  # ====================================================================
  local cdc_hit=0
  if grep -lqE 'MySqlSource|FlinkSourceFunction|flink-cdc|FlinkCdc|pipeline:' ${javaarr[@]+"${javaarr[@]}"} ${cfgarr[@]+"${cfgarr[@]}"} 2>/dev/null; then
    cdc_hit=1
  fi
  if [[ "$cdc_hit" -eq 0 ]]; then
    pass "fw_flink_cdc_checkpoint: 未检出 CDC 源，跳过"
  elif [[ "$has_ckpt" -eq 1 ]]; then
    pass "fw_flink_cdc_checkpoint: CDC 源 + checkpoint 已配，断点续传可用"
  else
    warn "fw_flink_cdc_checkpoint: 检出 CDC 源（flink-cdc）但无 checkpoint 配置——故障即从头全量重读，断点续传失效"
  fi

  # ====================================================================
  # fw_flink_restart_strategy(warn)：生产须显式 RestartStrategy
  # ====================================================================
  if [[ "$has_job" -eq 0 ]]; then
    pass "fw_flink_restart_strategy: 无作业入口，跳过"
  else
    local rs_hit=0
    if grep -lqE 'setRestartStrategy|RestartStrategy|restart-strategy' ${javaarr[@]+"${javaarr[@]}"} ${cfgarr[@]+"${cfgarr[@]}"} 2>/dev/null; then
      rs_hit=1
    fi
    if [[ "$rs_hit" -eq 1 ]]; then
      pass "fw_flink_restart_strategy: 已配重启策略"
    else
      warn "fw_flink_restart_strategy: 作业无 restart-strategy/RestartStrategy（默认行为不足：无 checkpoint 不重启，有 checkpoint 无限重启风暴风险，须按故障预算收敛）"
    fi
  fi

  # ====================================================================
  # fw_flink_parallelism_slots(warn)：并行度硬编码与 slot 规划
  # ====================================================================
  local par_hit=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    local ln
    ln=$(grep -nE '\.setParallelism\([0-9]+\)' "$jf" 2>/dev/null || true)
    [[ -n "$ln" ]] && par_hit="${par_hit}${jf}:${ln}
"
  done
  _fw_report warn fw_flink_parallelism_slots "$par_hit" ".setParallelism() 硬编码并行度（应外置 pipeline.parallelism/-p，与 taskmanager.numberOfTaskSlots 协同规划）" "未检出硬编码并行度"

  # ====================================================================
  # fw_flink_async_io(warn)：算子内同步阻塞调用
  # ====================================================================
  local aio_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE 'StreamExecutionEnvironment|DataStream' "$jf" 2>/dev/null; then
      if grep -qE 'RestTemplate|HttpClient|DriverManager|getConnection\(|HttpUtil|OkHttpClient' "$jf" 2>/dev/null; then
        if ! grep -qE 'AsyncDataStream|RichAsyncFunction' "$jf" 2>/dev/null; then
          aio_bad="${aio_bad}${jf}
"
        fi
      fi
    fi
  done
  _fw_report warn fw_flink_async_io "$aio_bad" "作业内含同步 HTTP/JDBC 调用且无 AsyncDataStream（阻塞 subtask 主线程，拖垮吞吐传导反压，须异步 I/O 或维表 join）" "未检出算子内同步阻塞调用"

  # ====================================================================
  # fw_flink_cep_within(warn)：CEP 模式须配 within
  # ====================================================================
  local cep_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    if grep -qE 'CEP\.pattern|Pattern\.begin' "$jf" 2>/dev/null; then
      if ! grep -qE '\.within\(' "$jf" 2>/dev/null; then
        cep_bad="${cep_bad}${jf}
"
      fi
    fi
  done
  _fw_report warn fw_flink_cep_within "$cep_bad" "CEP 模式无 .within( 时间约束（NFA 部分匹配状态永久驻留，无界增长 OOM）" "CEP 模式均配 within 或无 CEP"

  # ====================================================================
  # fw_flink_jm_ha(warn)：flink-conf 须配 high-availability
  # ====================================================================
  local fc_hit=0 ha_ok=0
  local cf
  for cf in ${cfgarr[@]+"${cfgarr[@]}"}; do
    case "$(basename "$cf")" in
      flink-conf.yml|flink-conf.yaml)
        fc_hit=1
        if grep -qE 'high-availability' "$cf" 2>/dev/null; then
          ha_ok=1
        fi
        ;;
    esac
  done
  if [[ "$fc_hit" -eq 0 ]]; then
    pass "fw_flink_jm_ha: 无 flink-conf.yaml，跳过（平台托管 JM 须人工确认 HA）"
  elif [[ "$ha_ok" -eq 1 ]]; then
    pass "fw_flink_jm_ha: 已配 high-availability"
  else
    warn "fw_flink_jm_ha: flink-conf.yaml 无 high-availability 配置（standalone 生产 JM 单点，挂掉全集群失控）"
  fi

  # ====================================================================
  # fw_flink_version_2x(warn)：Flink 2.x 迁移旧 API
  # ====================================================================
  local v2_bad=""
  for jf in ${javaarr[@]+"${javaarr[@]}"}; do
    local ln
    ln=$(grep -nE 'org\.apache\.flink\.api\.java\.DataSet|implements SourceFunction|implements SinkFunction|extends RichSourceFunction|extends RichSinkFunction' "$jf" 2>/dev/null || true)
    [[ -n "$ln" ]] && v2_bad="${v2_bad}${jf}:${ln}
"
  done
  _fw_report warn fw_flink_version_2x "$v2_bad" "检出 DataSet/SourceFunction/SinkFunction 旧 API（Flink 2.0 已移除 DataSet、弃用旧 Source/Sink 接口；升级 2.x 须迁 FLIP-27/FLIP-143，savepoint 兼容矩阵待验证）" "未检出 2.x 弃用 API"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

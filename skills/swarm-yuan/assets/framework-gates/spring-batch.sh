# ruleset: spring-batch  requires_conf: SPRING_BATCH_JOB_DIRS
# gates: fw_batch_step_scope(fail) fw_batch_step_three_pieces(warn) fw_batch_chunk_commit(warn) fw_batch_jobrepo_tx(warn) fw_batch_restart(warn) fw_batch_itemstream_restart(warn) fw_batch_writer_idempotent(warn) fw_batch_processor_null(warn) fw_batch_skip_retry(warn) fw_batch_table_prefix(warn) fw_batch_listener_swallow(warn) fw_batch_partition(warn) fw_batch_builderfactory_migration(warn)
# harvested-from: T8 P1 范例（2026-07-17），规律源自 spring-batch 5.2.6 官方参考文档与 5.0 迁移指南
_fw_spring_batch_check() {
  echo "  [spring-batch] Spring Batch 5.x 框架规律"

  # ---------- 收集 Java 源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SPRING_BATCH_JOB_DIRS[@]+"${SPRING_BATCH_JOB_DIRS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$srcs" ]]; then
    warn "spring-batch: SPRING_BATCH_JOB_DIRS 未配置或无文件可检"
    return
  fi
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，剔除 // 与 javadoc 块注释行，避免 grep 误命中 javadoc 文本）

  # ====================================================================
  # fw_batch_step_scope(fail)：@Value("#{jobParameters/stepExecutionContext ...") 的 Bean 须有 @StepScope/@JobScope
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_step_scope: 无 Java 源文件，跳过"
  else
    local lbfile lb_bad=""
    for lbfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$lbfile")
      # 文件含 late-binding SpEL（@Value("#{jobParameters / stepExecutionContext）
      if ! printf '%s\n' "$code" | grep -qE '@Value\("#\{(jobParameters|stepExecutionContext)'; then
        continue
      fi
      # 同文件无 @StepScope 或 @JobScope → 违规
      if ! printf '%s\n' "$code" | grep -qE '@(StepScope|JobScope)\b'; then
        lb_bad="${lb_bad}${lbfile}
"
      fi
    done
    _fw_report fail fw_batch_step_scope "${lb_bad}" "使用 @Value(\"#{jobParameters/stepExecutionContext}\") late binding 的 Bean 缺 @StepScope/@JobScope（Bean 须在 Step 启动后才实例化，缺 scope 会在容器启动期注入 null 或 SpEL 求值失败）" "late-binding Bean 均配 @StepScope/@JobScope（或无 late-binding 用法）"
  fi

  # ====================================================================
  # fw_batch_step_three_pieces(warn)：chunk 步骤须显式声明 reader + writer
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_step_three_pieces: 无 Java 源文件，跳过"
  else
    local tpfile tp_bad=""
    for tpfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$tpfile")
      # 文件含 new StepBuilder 与 .chunk(
      if ! printf '%s\n' "$code" | grep -qE 'new[[:space:]]+StepBuilder\b'; then continue; fi
      if ! printf '%s\n' "$code" | grep -qE '\.chunk\('; then continue; fi
      # 缺 .reader( 或 .writer(
      if ! printf '%s\n' "$code" | grep -qE '\.reader\(' || ! printf '%s\n' "$code" | grep -qE '\.writer\('; then
        tp_bad="${tp_bad}${tpfile}
"
      fi
    done
    _fw_report warn fw_batch_step_three_pieces "${tp_bad}" "chunk 步骤缺 .reader() 或 .writer()（build() 阶段抛 IllegalArgumentException: Reader/Writer must be provided）" "chunk 步骤均声明 reader + writer"
  fi

  # ====================================================================
  # fw_batch_chunk_commit(warn)：.chunk( 参数须为字面量整数且非 1
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_chunk_commit: 无 Java 源文件，跳过"
  else
    local ccfile cc_bad=""
    for ccfile in "${srcarr[@]}"; do
      local code chunk_lines
      code=$(_fw_strip_comments_c "$ccfile")
      chunk_lines=$(printf '%s\n' "$code" | grep -E '\.chunk\(' || true)
      [[ -z "$chunk_lines" ]] && continue
      local bad=0
      # 检查每条 .chunk( 调用：参数应为字面量整数；为 1 → warn；为变量/无参 → warn
      while IFS= read -r cl; do
        [[ -z "$cl" ]] && continue
        # 提取 .chunk( 后第一个参数（到 , 或 ) ）
        # sed -E 下 \s 在 BSD 是字面 s——改 [[:space:]]
        local arg
        arg=$(printf '%s' "$cl" | sed -E 's/.*\.chunk\([[:space:]]*//; s/[[:space:]]*[,)].*//')
        if [[ -z "$arg" ]]; then
          bad=1  # 无参
        elif [[ "$arg" =~ ^[0-9]+$ ]]; then
          if [[ "$arg" -eq 1 ]]; then bad=1; fi  # commit-interval=1
        else
          bad=1  # 变量/表达式 → 须人工核实
        fi
      done <<< "$chunk_lines"
      [[ "$bad" -eq 1 ]] && cc_bad="${cc_bad}${ccfile}
"
    done
    _fw_report warn fw_batch_chunk_commit "${cc_bad}" ".chunk() 参数非字面量整数或为 1（commit-interval=1 每条 item 一次事务开销极大；变量参数须人工核实取值合理 10–1000）" "chunk commit-interval 均为合理字面量整数"
  fi

  # ====================================================================
  # fw_batch_jobrepo_tx(warn)：@EnableBatchProcessing 配置类含自定义 transactionManager 但无 JobRepository 显式 setTransactionManager
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_jobrepo_tx: 无 Java 源文件，跳过"
  else
    local jtfile jt_bad=""
    for jtfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$jtfile")
      # 含 @EnableBatchProcessing
      if ! printf '%s\n' "$code" | grep -qE '@EnableBatchProcessing\b'; then continue; fi
      # 含自定义 transactionManager Bean（@Bean ... PlatformTransactionManager / DataSourceTransactionManager）
      if ! printf '%s\n' "$code" | grep -qE '(PlatformTransactionManager|DataSourceTransactionManager|JpaTransactionManager)\b'; then continue; fi
      # 无 JobRepositoryFactoryBean / DefaultBatchConfiguration / setTransactionManager / @Bean JobRepository
      if printf '%s\n' "$code" | grep -qE 'JobRepositoryFactoryBean|DefaultBatchConfiguration|setTransactionManager|@Bean[[:space:]]+JobRepository'; then
        continue
      fi
      jt_bad="${jt_bad}${jtfile}
"
    done
    _fw_report warn fw_batch_jobrepo_tx "${jt_bad}" "@EnableBatchProcessing 配置类含自定义 transactionManager 但无 JobRepository 显式 setTransactionManager/DefaultBatchConfiguration 重写（元数据事务与业务 chunk 事务隔离须显式管控，5.x @EnableBatchProcessing 不再暴露事务管理器 Bean）" "JobRepository 事务管理器显式配置或无自定义 transactionManager"
  fi

  # ====================================================================
  # fw_batch_restart(warn)：Job 定义文件须含任一重启策略关键字
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_restart: 无 Java 源文件，跳过"
  else
    local rsfile rs_bad=""
    for rsfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$rsfile")
      # 文件含 Job 定义（new JobBuilder 或 JobBuilderFactory）
      if ! printf '%s\n' "$code" | grep -qE 'new[[:space:]]+JobBuilder\b|JobBuilderFactory'; then continue; fi
      # 无任一重启关键字
      if printf '%s\n' "$code" | grep -qE 'allowStartIfComplete|startLimit|preventRestart|Incrementer|\.incrementer\('; then
        continue
      fi
      rs_bad="${rs_bad}${rsfile}
"
    done
    _fw_report warn fw_batch_restart "${rs_bad}" "Job 定义文件无 allowStartIfComplete/startLimit/preventRestart/Incrementer 任一关键字（默认行为：COMPLETED step 重启时跳过、可无限重启；须人工核实是否有意依赖默认）" "Job 定义文件均含显式重启策略或 incrementer"
  fi

  # ====================================================================
  # fw_batch_itemstream_restart(warn)：ItemReader/Writer 实现类须实现 ItemStream 或 extends ItemStream 基类
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_itemstream_restart: 无 Java 源文件，跳过"
  else
    local isfile is_bad=""
    for isfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$isfile")
      # implements ItemReader< / ItemWriter<（自定义 reader/writer）
      if ! printf '%s\n' "$code" | grep -qE 'implements\s+.*(ItemReader|ItemWriter)\s*<'; then continue; fi
      # 已实现 ItemStream 或 extends 已实现 ItemStream 的基类
      if printf '%s\n' "$code" | grep -qE 'implements\s+.*ItemStream|extends\s+(AbstractItemStreamReader|AbstractItemCountingItemStreamItemReader|AbstractItemStreamItemWriter)'; then
        continue
      fi
      is_bad="${is_bad}${isfile}
"
    done
    _fw_report warn fw_batch_itemstream_restart "${is_bad}" "自定义 ItemReader/ItemWriter 未实现 ItemStream（重启时无法从断点续读，会从头执行重复处理已写数据）" "自定义 Reader/Writer 均实现 ItemStream 或 extends ItemStream 基类"
  fi

  # ====================================================================
  # fw_batch_writer_idempotent(warn)：ItemWriter.write 须幂等（仅 insert/save/add 无 upsert/merge/exists → warn）
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_writer_idempotent: 无 Java 源文件，跳过"
  else
    local wifile wi_bad=""
    for wifile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$wifile")
      # implements ItemWriter<
      if ! printf '%s\n' "$code" | grep -qE 'implements\s+.*ItemWriter\s*<'; then continue; fi
      # 已含幂等信号（upsert/merge/exists/saveOrUpdate/findById 去重）
      if printf '%s\n' "$code" | grep -qE 'upsert|merge|exists|saveOrUpdate|findById|insertIgnore|ON[[:space:]]+DUPLICATE'; then
        continue
      fi
      # 仅含 insert/save/add（高风险非幂等）
      if printf '%s\n' "$code" | grep -qE '\b(insert|save|add)\b'; then
        wi_bad="${wi_bad}${wifile}
"
      fi
    done
    _fw_report warn fw_batch_writer_idempotent "${wi_bad}" "ItemWriter.write 仅含 insert/save/add 无 upsert/merge/exists（重启重写会重复写入，须幂等或去重）" "ItemWriter 含幂等信号或无非幂等写"
  fi

  # ====================================================================
  # fw_batch_processor_null(warn)：ItemProcessor.process 含 return null; 须注释过滤意图
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_processor_null: 无 Java 源文件，跳过"
  else
    local pnfile pn_bad=""
    for pnfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$pnfile")
      # implements ItemProcessor<
      if ! printf '%s\n' "$code" | grep -qE 'implements\s+.*ItemProcessor\s*<'; then continue; fi
      # 不含 return null; → 跳过
      if ! printf '%s\n' "$code" | grep -qE 'return[[:space:]]+null'; then continue; fi
      # 含过滤意图注释（filter|过滤|skip|drop）→ 视为已说明，跳过
      if printf '%s\n' "$code" | grep -qiE 'filter|过滤|drop|skip'; then continue; fi
      pn_bad="${pn_bad}${pnfile}
"
    done
    _fw_report warn fw_batch_processor_null "${pn_bad}" "ItemProcessor.process 含 return null; 但无过滤意图注释（return null 表示过滤 item，误用会静默丢数据）" "ItemProcessor 无 return null; 或已注释过滤意图"
  fi

  # ====================================================================
  # fw_batch_skip_retry(warn)：skipLimit/retryLimit 须配显式异常类型
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_skip_retry: 无 Java 源文件，跳过"
  else
    local srfile sr_bad=""
    for srfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$srfile")
      # 含 .skipLimit( / .retryLimit(
      if ! printf '%s\n' "$code" | grep -qE '\.(skipLimit|retryLimit)\('; then continue; fi
      # 缺 .skip( / .retry( 显式异常类型
      if printf '%s\n' "$code" | grep -qE '\.(skip|retry)\s*\('; then continue; fi
      sr_bad="${sr_bad}${srfile}
"
    done
    _fw_report warn fw_batch_skip_retry "${sr_bad}" "skipLimit/retryLimit 未配 .skip()/.retry() 显式异常类型（默认会 skip/retry 所有异常，坏数据被静默跳过或 retry 风暴）" "skip/retry 均配显式异常类型或无 skipLimit/retryLimit"
  fi

  # ====================================================================
  # fw_batch_table_prefix(warn)：application 配置含 spring.batch 但无 table-prefix 或 initialize-schema=always
  # ====================================================================
  local pd="${PROJECT_DIR:-}"
  local tp_bad=""
  if [[ -n "$pd" && -d "$pd" ]]; then
    local cfg
    while IFS= read -r cfg; do
      [[ -z "$cfg" ]] && continue
      # 含 spring.batch 配置
      if ! grep -qE 'spring\.batch' "$cfg" 2>/dev/null; then continue; fi
      local issue=""
      # 无 table-prefix（共享库风险）
      if ! grep -qE 'table-prefix' "$cfg" 2>/dev/null; then
        issue="${issue}缺 table-prefix;"
      fi
      # initialize-schema=always（生产应 never）
      if grep -qE 'initialize-schema:\s*always|initialize-schema=\s*always' "$cfg" 2>/dev/null; then
        issue="${issue}initialize-schema=always;"
      fi
      [[ -n "$issue" ]] && tp_bad="${tp_bad}${cfg}: ${issue}
"
    done < <(find "$pd" -maxdepth 5 -type f \( -name 'application*.yml' -o -name 'application*.yaml' -o -name 'application*.properties' \) 2>/dev/null)
  fi
  if [[ -z "$pd" || ! -d "$pd" ]]; then
    pass "fw_batch_table_prefix: PROJECT_DIR 未配置，跳过"
  elif [[ -z "$tp_bad" ]]; then
    pass "fw_batch_table_prefix: spring.batch 配置含 table-prefix 且 initialize-schema 非 always"
  else
    warn "fw_batch_table_prefix: spring.batch 配置存在风险（生产应显式 table-prefix 防共享库冲突，initialize-schema=never 由 flyway/liquibase 管控 schema）:
${tp_bad}"
  fi

  # ====================================================================
  # fw_batch_listener_swallow(warn)：Listener 实现类 after* 方法 catch 无 throw → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_listener_swallow: 无 Java 源文件，跳过"
  else
    local lsfile ls_bad=""
    for lsfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$lsfile")
      # implements 任一 Listener 接口
      if ! printf '%s\n' "$code" | grep -qE 'implements\s+.*(StepExecutionListener|ChunkListener|ItemReadListener|ItemProcessListener|ItemWriteListener|JobExecutionListener)'; then
        continue
      fi
      # 粗扫：含 catch 块但无 throw（行级粗匹配：catch 行附近若干行无 throw）
      # 简化：文件含 catch 关键字，且全文无 throw 关键字 → 疑似吞异常
      if printf '%s\n' "$code" | grep -qE '\bcatch\b' && ! printf '%s\n' "$code" | grep -qE '\bthrow\b'; then
        ls_bad="${ls_bad}${lsfile}
"
      fi
    done
    _fw_report warn fw_batch_listener_swallow "${ls_bad}" "Listener 实现类含 catch 无 throw（after* 回调吞异常会使 step 状态与实际不符，应向上传播或 addFailureException）" "Listener 实现类无 catch 吞异常或含 throw"
  fi

  # ====================================================================
  # fw_batch_partition(warn)：大 Job（多个 chunk step）无并行化关键字 → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_partition: 无 Java 源文件，跳过"
  else
    local ptfile pt_bad=""
    for ptfile in "${srcarr[@]}"; do
      local code chunk_cnt
      code=$(_fw_strip_comments_c "$ptfile")
      # 含 Job 定义
      if ! printf '%s\n' "$code" | grep -qE 'new[[:space:]]+JobBuilder\b|JobBuilderFactory'; then continue; fi
      # 统计 .chunk( 出现次数（多个 chunk step 视为"大 Job"）
      chunk_cnt=$(printf '%s\n' "$code" | grep -cE '\.chunk\(' || true)
      [[ "$chunk_cnt" -lt 2 ]] && continue
      # 已含并行化关键字
      if printf '%s\n' "$code" | grep -qE 'Partitioner|TaskExecutor|remoteChunking|RemoteChunkingManagerStepBuilder|partitioner\('; then
        continue
      fi
      pt_bad="${pt_bad}${ptfile}
"
    done
    _fw_report warn fw_batch_partition "${pt_bad}" "多 chunk step 的 Job 无 Partitioner/TaskExecutor/remoteChunking（大 Job 须按 IO/CPU 特征显式决策并行化，单线程跑大 IO 任务耗时过长）" "Job 已含并行化决策或为单 step 小 Job"
  fi

  # ====================================================================
  # fw_batch_builderfactory_migration(warn)：检出 JobBuilderFactory/StepBuilderFactory → 迁移到 JobBuilder/StepBuilder
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_batch_builderfactory_migration: 无 Java 源文件，跳过"
  else
    local bffile bf_bad=""
    for bffile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$bffile")
      if printf '%s\n' "$code" | grep -qE '\b(JobBuilderFactory|StepBuilderFactory)\b'; then
        bf_bad="${bf_bad}${bffile}
"
      fi
    done
    _fw_report warn fw_batch_builderfactory_migration "${bf_bad}" "检出 JobBuilderFactory/StepBuilderFactory（Spring Batch 5.0 废弃、5.2 移除，须迁移到 new JobBuilder(name, jobRepository) / new StepBuilder(name, jobRepository)，且 chunk/tasklet 显式传 PlatformTransactionManager）" "未检出 JobBuilderFactory/StepBuilderFactory（已用 JobBuilder/StepBuilder）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}

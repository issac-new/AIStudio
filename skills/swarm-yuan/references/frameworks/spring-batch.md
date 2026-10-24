---
ruleset_id: spring-batch
适用版本: spring-batch 5.0.x–5.2.x（Spring Boot 3.x / Spring Framework 6 / Java 17 / Jakarta EE 9 基线）；5.2.6 为 5.x 最新（2026-06-10）；6.0.x 已发布（适配 Boot 4 / Spring Framework 7，差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/spring-projects/spring-batch/releases ；https://github.com/spring-projects/spring-batch/tags ；https://github.com/spring-projects/spring-batch/wiki/Spring-Batch-5.0-Migration-Guide ；https://docs.spring.io/spring-batch/reference/step/late-binding.html ；https://docs.spring.io/spring-batch/reference/job/configuring-repository.html ；https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing/configuring.html ；https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing/commit-interval.html ；https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing/restart.html ；https://docs.spring.io/spring-batch/reference/readers-and-writers/item-stream.html ；https://docs.spring.io/spring-batch/reference/readers-and-writers/item-writer.html ；https://docs.spring.io/spring-batch/reference/job/running.html ；https://docs.spring.io/spring-batch/reference/ ）
深度门槛: 12
---

# Spring Batch 规则集

<!--
本规则集为 P1 第三批框架规则集，结构与 mybatis / lombok 规则集对齐（六节式）。
覆盖范围：Spring Batch 5.x（Spring Boot 3.x 基线；Jakarta EE 9；Java 17+）。
调研时点：2026-07-17，已核对 spring-batch 5.x 最新发布为 5.2.6（2026-06-10）；6.0.x 已发布（适配 Spring Boot 4 / Spring Framework 7）。
Spring Batch 5.0 为重大破坏性变更：JobBuilderFactory/StepBuilderFactory 废弃移除、@EnableBatchProcessing 不再暴露事务管理器 Bean、BatchConfigurer 接口删除、chunk/tasklet 显式传 PlatformTransactionManager。已落入 §6。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.batch:spring-batch-core` / `org.springframework.batch:spring-batch-infrastructure` / `org.springframework.batch:spring-batch-integration` | 高 |
| 注解 | `@EnableBatchProcessing` / `@StepScope` / `@JobScope` / `@BatchStep` / `@BatchJob` | 高 |
| 类 | `JobBuilder` / `StepBuilder` / `JobBuilderFactory`（5.x 前已废弃）/ `StepBuilderFactory`（5.x 前已废弃）/ `JobRepository` / `JobLauncher` / `JobOperator` / `RunIdIncrementer` | 高 |
| 构建器 DSL | `.chunk(` / `.tasklet(` / `.reader(` / `.writer(` / `.processor(` / `.allowStartIfComplete(` / `.startLimit(` / `.incrementer(` / `.preventRestart()` | 高 |
| SpEL | `@Value("#{jobParameters` / `@Value("#{stepExecutionContext` / `@Value("#{jobExecutionContext` | 高 |
| 配置 | `spring.batch.job.enabled` / `spring.batch.job.name` / `spring.batch.jdbc.initialize-schema` / `spring.batch.jdbc.table-prefix` | 高 |
| 接口实现 | `implements ItemReader<` / `implements ItemWriter<` / `implements ItemProcessor<` / `implements Tasklet` / `implements ItemStream` / `extends AbstractItemStreamItemReader` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 spring-batch 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Job 配置类：`grep -rlE '@EnableBatchProcessing\b|new JobBuilder\b|JobBuilderFactory' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 Job 配置的 .java 文件数 = `grep -l … | wc -l`）
- Step 定义：`grep -rnE 'new StepBuilder\b|\.chunk\(|\.tasklet\(' "${PROJECT_DIR}" --include='*.java'`
- @StepScope/@JobScope 用法：`grep -rnE '@(StepScope|JobScope)\b' "${PROJECT_DIR}" --include='*.java'`
- late-binding SpEL：`grep -rnE "@Value\(\"#\{(jobParameters|stepExecutionContext|jobExecutionContext)" "${PROJECT_DIR}" --include='*.java'`
- ItemReader/Writer/Processor 实现：`grep -rlE 'implements\s+(ItemReader|ItemWriter|ItemProcessor|Tasklet|ItemStream)<' "${PROJECT_DIR}" --include='*.java'`
- 重启配置：`grep -rnE '\.(allowStartIfComplete|startLimit|preventRestart)\(' "${PROJECT_DIR}" --include='*.java'`
- Incrementer：`grep -rnE 'RunIdIncrementer|JobParametersIncrementer|\.incrementer\(' "${PROJECT_DIR}" --include='*.java'`
- @EnableBatchProcessing + 自定义 transactionManager：`grep -rlE '@EnableBatchProcessing' "${PROJECT_DIR}" --include='*.java'`
- chunk commit-interval 字面量：`grep -rnE '\.chunk\([0-9]' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：@Value late binding（jobParameters/stepExecutionContext）必须配 @StepScope
- **适用版本**: spring-batch 5.x 全版本（late-binding 机制自早期版本延续）
- **规律**: 用 `@Value("#{jobParameters['x']}")` / `@Value("#{stepExecutionContext['x']}")` / `@Value("#{jobExecutionContext['x']}")` 从 SpEL 取值时，对应 Bean 必须标 `@StepScope`（或访问 jobExecutionContext/jobParameters 时用 `@JobScope`）。官方文档明确："Using a scope of Step is required to use late binding, because the bean cannot actually be instantiated until the Step starts, to let the attributes be found." 且 "Any bean that uses late binding must be declared with scope='step' [或 @StepScope]"。缺 scope 则 Bean 在 Spring 容器启动期即被实例化，此时 JobParameters/ExecutionContext 尚未就绪 → 注入 null 或抛 `IllegalStateException`/SpEL 求值失败。
- **违反后果**: 启动期或首次 Job 执行时 SpEL 求值失败 / 注入 null / `BeanExpressionException`；ItemReader 拿到 null 资源路径导致 NPE。
- **验证方法**: 在 `SPRING_BATCH_JOB_DIRS` 范围内 grep `@Value("#{jobParameters` / `@Value("#{stepExecutionContext` 行，命中所在 Bean 方法/类须在同文件内出现 `@StepScope`（jobExecutionContext 场景可 `@JobScope`）；缺 `@StepScope`/`@JobScope` → fail。
- **对应门禁**: fw_batch_step_scope(fail)

```verify
id: spring-batch-r1
cmd: 
expect: always
```

### 规律：Step 三件套（reader/writer/processor）须在 chunk 步骤中显式声明
- **适用版本**: spring-batch 5.x 全版本
- **规律**: chunk 导向步骤通过 `.chunk(int).reader(...).writer(...)` 定义，`ItemProcessor` 可选。官方文档示例：`new StepBuilder("step1", jobRepository).<String,String>chunk(10).transactionManager(transactionManager).reader(itemReader()).writer(itemWriter()).build()`。缺 reader 或 writer 会在 `build()` 阶段抛 `IllegalArgumentException: Reader must be provided` / `Writer must be provided`。processor 返回 null 表示过滤（见单独规律）。
- **违反后果**: 启动期 `build()` 抛 IllegalArgumentException，Job 无法装配。
- **验证方法**: `grep -rnE 'new StepBuilder\b' *.java` 命中文件中若同文件有 `.chunk(` 但缺 `.reader(` 或 `.writer(` → warn（人工核实是否在其它方法补全）。
- **对应门禁**: fw_batch_step_three_pieces(warn)

```verify
id: spring-batch-r2
cmd: grep -rnE 'new StepBuilder\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：chunk commit-interval（提交间隔）须显式指定合理值
- **适用版本**: spring-batch 5.x 全版本
- **规律**: `commit-interval`（Java DSL 为 `.chunk(int)`）控制每多少条 item 提交一次事务。官方文档示例均显式传值（如 `chunk(10)`），未提供"默认值"的官方承诺——`chunk(int)` 在 Java DSL 中是必填参数（`SimpleStepBuilder.chunk(int chunkSize)` 必须传 int）。值过小（如 1）导致每条 item 都提交，事务/数据库 IO 开销极大；值过大（如 10000）导致单事务持锁过长、内存堆积、失败回滚代价高。典型经验值 10–1000，须按吞吐/延迟/失败回滚代价权衡。
- **违反后果**: commit-interval=1 → 吞吐骤降（每条 item 一次事务）；commit-interval 过大 → 长事务、内存溢出、失败回滚丢大量数据。
- **验证方法**: `grep -rnE 'new StepBuilder\b|\.chunk\(' *.java`，命中文件若含 `.chunk(` 但参数非字面量整数（如变量、无参 `.chunk(`）→ warn；参数为字面量 1 → warn（提示事务开销过大）。
- **对应门禁**: fw_batch_chunk_commit(warn)

```verify
id: spring-batch-r3
cmd: grep -rnE 'new StepBuilder\b|\.chunk\(' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：JobRepository 须用独立 transactionManager 与业务事务隔离
- **适用版本**: spring-batch 5.x 全版本（5.0 起 @EnableBatchProcessing 不再暴露事务管理器 Bean，须手动传给 chunk/tasklet）
- **规律**: JobRepository 自身对元数据表（BATCH_JOB_INSTANCE/EXECUTION/STEP_EXECUTION 等）的 create/update 调用默认用 `ISOLATION_SERIALIZABLE` 隔离级别（官方文档："The default isolation level for that method is SERIALIZABLE, which is quite aggressive. READ_COMMITTED usually works equally well."），且 JobRepository 通过 AOP advice 包裹自身方法以保证元数据持久化正确。官方文档："transactional advice is automatically created around the repository... to ensure that the batch metadata... is persisted correctly. The behavior of the framework is not well defined if the repository methods are not transactional."。5.x 起 `@EnableBatchProcessing` 不再暴露事务管理器 Bean，开发者须为 chunk/tasklet 显式传 `PlatformTransactionManager`。若把 JobRepository 元数据事务与业务 chunk 事务混用同一 DataSource + 同一事务管理器而无显式隔离，元数据写入会与业务 DML 在同事务中，失败回滚会丢元数据。
- **违反后果**: 元数据与业务数据同事务回滚 → 重启时状态丢失 / 重启行为不可预期；SERIALIZABLE 隔离在高并发下死锁。
- **验证方法**: `@EnableBatchProcessing` 配置类中若同时定义自定义 `transactionManager` Bean 但无 `JobRepositoryFactoryBean.setTransactionManager(...)` 或 5.x `DefaultBatchConfiguration` 重写 / `@Bean JobRepository` 显式 setTransactionManager → warn（人工核实隔离）。
- **对应门禁**: fw_batch_jobrepo_tx(warn)

```verify
id: spring-batch-r4
cmd: 
expect: always
```

### 规律：重启策略须显式声明（allowStartIfComplete / startLimit / preventRestart）
- **适用版本**: spring-batch 5.x 全版本
- **规律**: Spring Batch 默认 job 可重启：已 COMPLETED 的 step 在重启时被跳过（官方文档："any step with a status of COMPLETED... is skipped"）。需"每次都跑"的 step（如清理/校验）须显式 `.allowStartIfComplete(true)`；易失败且失败后需人工介入的 step 须 `.startLimit(n)`（默认 `Integer.MAX_VALUE`，超限抛 `StartLimitExceededException`）；明确不可重启的 job 须 `.preventRestart()`。官方文档："Setting allow-start-if-complete to true overrides this so that the step always runs." 与 "Attempting to run it again causes a StartLimitExceededException to be thrown."。Job 定义文件若无任一重启关键字，默认行为虽合理但意图不明，须人工核实是否有意依赖默认。
- **违反后果**: 重启时已 COMPLETED 的 step 被静默跳过 → 业务期望重跑却未跑；或失败 step 无限重试。
- **验证方法**: `grep -rlE 'new JobBuilder\b|JobBuilderFactory' *.java` 取 Job 定义文件，若同文件无 `allowStartIfComplete`/`startLimit`/`preventRestart`/`Incrementer` 任一关键字 → warn。
- **对应门禁**: fw_batch_restart(warn)

```verify
id: spring-batch-r5
cmd: grep -rlE 'new JobBuilder\b|JobBuilderFactory' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：JobParametersIncrementer 须用于"每次都新 JobInstance"的可重复 Job
- **适用版本**: spring-batch 5.x 全版本
- **规律**: Spring Batch 用"identifying job parameters"判等 JobInstance：相同 identifying 参数再次启动会抛 `JobInstanceAlreadyCompleteException`（job 已 COMPLETED）。可重复执行的 job 须挂 `.incrementer(new RunIdIncrementer())`（或自定义 `JobParametersIncrementer`）追加 `run.id`（每次自增）作为 identifying 参数，使每次执行产生新 JobInstance。官方 `RunIdIncrementer` 是现成实现。无 incrementer 的 job 若被定时调度反复启动，第二次起即报 `JobInstanceAlreadyCompleteException`。
- **违反后果**: 定时/反复执行的 Job 第二次启动报 `JobInstanceAlreadyCompleteException`。
- **验证方法**: `grep -rlE 'new JobBuilder\b' *.java` 取 Job 定义，若同文件无 `RunIdIncrementer`/`JobParametersIncrementer`/`.incrementer(` → warn（提示人工核实是否需要可重复执行）。本规律与 fw_batch_restart 关键字集部分重叠（Incrementer 同时是重启策略信号），在 §4 实现中归入 fw_batch_restart 同检。
- **对应门禁**: fw_batch_restart(warn)

```verify
id: spring-batch-r6
cmd: grep -rlE 'new JobBuilder\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：ItemReader/Writer 须实现 ItemStream 以支持重启（restartable）
- **适用版本**: spring-batch 5.x 全版本
- **规律**: 重启能力依赖 `ItemStream` 接口的 `open(ExecutionContext)` / `update(ExecutionContext)` / `close()` 三方法。官方文档："readers and writers need to be opened, closed, and require a mechanism for persisting state. The ItemStream interface serves that purpose"；`update` "is called before committing, to ensure that the current state is persisted in the database before commit"；`open` "if expected data is found in the ExecutionContext, it may be used to start the ItemReader or ItemWriter at a location other than its initial state"。自定义 Reader/Writer 若不实现 ItemStream，重启时无法从断点续读，会从头开始 → 重复处理已写数据。
- **违反后果**: 重启从头执行 → 重复写入已处理数据（若 Writer 非幂等则数据脏）。
- **验证方法**: `grep -lE 'implements\s+(ItemReader|ItemWriter)<' *.java` 命中文件若未实现 `ItemStream` 且未 `extends` 已实现 ItemStream 的基类（如 `AbstractItemStreamReader`/`AbstractItemCountingItemStreamItemReader`）→ warn。
- **对应门禁**: fw_batch_itemstream_restart(warn)

```verify
id: spring-batch-r7
cmd: grep -lE 'implements\s+(ItemReader|ItemWriter)<' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：ItemWriter.write 须幂等以容忍重启重写
- **适用版本**: spring-batch 5.x 全版本
- **规律**: 官方文档定义 `ItemWriter.write(Chunk<? extends T> items)` 接受一个 list（"the interface accepts a list, rather than an item by itself"）。重启场景下，上次已写入但未在最后 commit 点之前的 chunk 可能被再次写入（因 step 从最后成功 commit 点续读）。因此 `write` 须幂等：重复写同一批 item 不产生副作用（如 upsert 而非 insert、带主键去重、外部系统支持去重 token）。官方虽未在 item-writer.html 强制"must be idempotent"，但 restart 语义隐含此要求——ItemWriter 文档明确 write 在 chunk 内批量执行且可能因失败重试。
- **违反后果**: 重启后重复 insert → 主键冲突 / 数据重复；外部系统重复推送。
- **验证方法**: `grep -lE 'implements\s+ItemWriter<' *.java` 命中文件若 `write` 方法体内仅含 `insert`/`save`/`add` 无 upsert/merge/exists 判重 → warn（人工核实幂等性）。机械扫描难断语义，本门禁仅对显式只写 insert 的高风险场景 warn。
- **对应门禁**: fw_batch_writer_idempotent(warn)

```verify
id: spring-batch-r8
cmd: grep -lE 'implements\s+ItemWriter<' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：ItemProcessor 返回 null 表示过滤，不可误用为错误信号
- **适用版本**: spring-batch 5.x 全版本
- **规律**: `ItemProcessor.process(T item)` 返回 null 表示过滤该 item（不传给 writer），官方文档明确此语义。误把 null 当错误信号会导致 item 被静默丢弃。需"标记错误"应抛异常或用 skip/retry 策略。过滤统计可通过 `ItemProcessor` 配合 `count`/`filterCount` 观测，step 的 `filterCount` 会累计被过滤 item 数。
- **违反后果**: 业务数据被静默过滤丢失，无异常可追踪。
- **验证方法**: `grep -lE 'implements\s+ItemProcessor<' *.java` 命中文件中 `process` 方法若含 `return null;` 且无注释说明过滤意图 → warn（人工核实是否误用）。
- **对应门禁**: fw_batch_processor_null(warn)

```verify
id: spring-batch-r9
cmd: grep -lE 'implements\s+ItemProcessor<' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：skip/retry 须限定可恢复异常并设上限
- **适用版本**: spring-batch 5.x 全版本
- **规律**: `.skipLimit(n)` / `.retryLimit(n)` 须配 `.skip(Exception.class)` / `.noSkip(Exception.class)` / `.retry(Exception.class)` / `.noRetry(Exception.class)` 精确圈定可跳过/可重试异常。官方文档强调 skip/retry 限可恢复异常（如 `SkippableException`），不可对业务校验异常（如数据非法）skip——否则坏数据被静默跳过。无限 skip（`skipLimit(Integer.MAX_VALUE)`）等于关闭故障检测。
- **违反后果**: 坏数据被静默跳过；或 retry 风暴拖垮下游。
- **验证方法**: `grep -rnE '\.(skipLimit|retryLimit)\(' *.java` 命中行若同文件无 `.skip(`/`.retry(` 显式异常类型声明 → warn。
- **对应门禁**: fw_batch_skip_retry(warn)

```verify
id: spring-batch-r10
cmd: grep -rnE '\.(skipLimit|retryLimit)\(' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：JobRepository 表前缀与 schema 初始化须与部署环境一致
- **适用版本**: spring-batch 5.x 全版本
- **规律**: Spring Batch 元数据表默认前缀 `BATCH_`，可通过 `spring.batch.jdbc.table-prefix` 或 `JobRepositoryFactoryBean.setTablePrefix(...)` 改写。多 schema / 共享库场景须显式声明前缀避免冲突；`spring.batch.jdbc.initialize-schema` 控制是否自动建表（`embedded`/`always`/`never`），生产环境应为 `never` 并用 flyway/liquibase 管控 schema。
- **违反后果**: 元数据表找不到 → `BadSqlGrammarException`；或多应用共享库表前缀冲突。
- **验证方法**: `application*.yml` 含 `spring.batch` 但无 `spring.batch.jdbc.table-prefix` 且部署在共享库 → warn（人工核实）；`initialize-schema=always` 在生产 → warn。
- **对应门禁**: fw_batch_table_prefix(warn)

```verify
id: spring-batch-r11
cmd: 
expect: always
```

### 规律：监听器（Listener）须避免吞没异常
- **适用版本**: spring-batch 5.x 全版本
- **规律**: `StepExecutionListener`/`ChunkListener`/`ItemReadListener`/`ItemProcessListener`/`ItemWriteListener`/`JobExecutionListener` 的回调方法若抛异常会中断 step，但常见反模式是在 `afterRead`/`afterWrite` 等回调中 `try-catch` 吞异常（记日志后 return）→ 失败被静默，step 状态与实际不符。`beforeChunk`/`afterChunk` 抛异常会 fail 当前 chunk。监听器中应让异常向上传播或显式用 `ExitMessage`/`JobExecution.addFailureException` 记录。
- **违反后果**: 错误被静默吞没，step 显示成功但数据未正确写入。
- **验证方法**: `grep -lE 'implements\s+(StepExecutionListener|ChunkListener|ItemReadListener|ItemProcessListener|ItemWriteListener|JobExecutionListener)' *.java` 命中文件中 `after` 开头方法体若含 `catch.*\{[^}]*\}` 且无 `throw` → warn。
- **对应门禁**: fw_batch_listener_swallow(warn)

```verify
id: spring-batch-r12
cmd: grep -lE 'implements\s+(StepExecutionListener|ChunkListener|ItemReadListener|ItemProcessListener|ItemWriteListener|JobExecutionListener)' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：分区/远程分块选型须按 IO/CPU 特征显式决策
- **适用版本**: spring-batch 5.x 全版本（`spring-batch-integration` 提供远程分块）
- **规律**: 单机多线程 step 适合 CPU 密集（reader 需线程安全/`SynchronizedItemStreamReader`）；`Partitioner` 适合 IO 密集且数据可按键切分（每分区独立 step execution）；远程分块（remote chunking via Spring Integration）适合 IO 密集且 writer 远端。官方文档明确"Spring Batch does not control the threads spawned in these use cases" → 多线程/分区 step 中 `@JobScope` bean 不可靠。选型须显式：不能默认用单线程跑大任务。
- **违反后果**: 单线程跑大 IO 任务耗时过长；多线程 step 用了非线程安全 reader → 数据错乱；分区 step 用 `@JobScope` → bean 注入异常。
- **验证方法**: `grep -lE 'new JobBuilder\b' *.java` 命中文件中若大 Job（多个 chunk step）无 `Partitioner`/`TaskExecutor`/`remoteChunkingManager` 任一扩展关键字 → warn（人工核实是否需并行化）。机械扫描难断规模，本门禁仅提示人工决策。
- **对应门禁**: fw_batch_partition(warn)

```verify
id: spring-batch-r13
cmd: grep -lE 'new JobBuilder\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Spring Batch 5.x 须用 JobBuilder/StepBuilder（JobBuilderFactory/StepBuilderFactory 已废弃移除）
- **适用版本**: spring-batch 5.0+（5.0 废弃，5.2 移除）
- **规律**: Spring Batch 5.0 迁移指南明确："JobBuilderFactory and StepBuilderFactory are not exposed as beans in the application context anymore, and are now deprecated for removal in v5.2"。新代码须用 `new JobBuilder("myJob", jobRepository).start(step).build()` 与 `new StepBuilder("step1", jobRepository).<I,O>chunk(10).transactionManager(tm)...build()`。旧 `JobBuilderFactory.create(name).start(step).build()` 在 5.2 已移除，编译/运行期失败。同时 `@EnableBatchProcessing` 不再暴露事务管理器 Bean，`BatchConfigurer` 接口删除。
- **违反后果**: 5.2+ 项目用 `JobBuilderFactory`/`StepBuilderFactory` → 编译错（已移除）；5.0–5.1 用旧工厂虽可编译但 emit deprecation warning，升级 5.2 即破。
- **验证方法**: `grep -rnE 'JobBuilderFactory|StepBuilderFactory' *.java` 命中即 warn（提示迁移到 JobBuilder/StepBuilder）。
- **对应门禁**: fw_batch_builderfactory_migration(warn)

```verify
id: spring-batch-r14
cmd: grep -rnE 'JobBuilderFactory|StepBuilderFactory' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

<!--
共 14 条规律（≥12 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_batch_step_scope | fail | SPRING_BATCH_JOB_DIRS 下含 `@Value("#{jobParameters`/`@Value("#{stepExecutionContext` 的 Bean 所在文件无 `@StepScope`/`@JobScope` → fail (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_step_three_pieces | warn | 含 `new StepBuilder` + `.chunk(` 的文件缺 `.reader(` 或 `.writer(` → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_chunk_commit | warn | `.chunk(` 参数非字面量整数或为字面量 1 → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_jobrepo_tx | warn | `@EnableBatchProcessing` 配置类含自定义 `transactionManager` Bean 但无 `JobRepositoryFactoryBean`/`DefaultBatchConfiguration`/`setTransactionManager` → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_restart | warn | Job 定义文件无 `allowStartIfComplete`/`startLimit`/`preventRestart`/`Incrementer`/`incrementer` 任一关键字 → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_itemstream_restart | warn | `implements ItemReader/ItemWriter<` 的类未实现 `ItemStream` 且未 extends ItemStream 基类 → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_writer_idempotent | warn | `implements ItemWriter<` 类的 write 方法体仅含 insert/save/add 无 upsert/merge/exists → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_processor_null | warn | `implements ItemProcessor<` 类的 process 方法含 `return null;` 且无过滤意图注释 → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_skip_retry | warn | `.skipLimit(`/`.retryLimit(` 命中但同文件无 `.skip(`/`.retry(` 显式异常 → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_table_prefix | warn | application 配置含 `spring.batch` 但无 `table-prefix` 且 `initialize-schema=always` → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_listener_swallow | warn | Listener 实现类的 after* 方法含 catch 无 throw → warn (CWE-390) | SPRING_BATCH_JOB_DIRS |
| fw_batch_partition | warn | 大 Job（多个 chunk step）无 Partitioner/TaskExecutor/remoteChunking 关键字 → warn (n/a) | SPRING_BATCH_JOB_DIRS |
| fw_batch_builderfactory_migration | warn | 检出 `JobBuilderFactory`/`StepBuilderFactory` → warn 迁移到 JobBuilder/StepBuilder (n/a) | SPRING_BATCH_JOB_DIRS |

<!--
门禁 id 命名规范：fw_batch_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/spring-batch.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_batch_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: spring-batch  requires_conf: SPRING_BATCH_JOB_DIRS` 声明。
fixture 验证只覆盖 step_scope（violating→fail）+ 其余 warn/pass（compliant 全 pass）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| spring-batch × spring-boot | 5.x 起用 `@EnableBatchProcessing` + `DefaultBatchConfiguration`；`spring.batch.job.enabled=false` 禁用启动即跑 | Boot 3 自动配置会在启动时执行 ApplicationRunner 的 Job，生产环境通常须禁用启动即跑改由调度器触发 |
| spring-batch × mybatis/jpa | ItemWriter 写 JPA 实体须在 chunk 事务内 flush + clear，避免一级缓存膨胀；`HibernateItemWriter`/`JpaItemWriter` 已封装 | chunk 大 + 未 clear → 持久化上下文 OOM；批量 flush 失败回滚一致 |
| spring-batch × spring-cloud-task | batch job 跑在 task 中须用 `spring-cloud-task-batch` 听 JobExecution 完成事件回写 task 状态 | task 须感知 job 成败才能标 task 状态；无集成则 task 提前结束 |
| spring-batch × quartz/shedlock | 定时调度须配 `JobParametersIncrementer`（RunIdIncrementer）避免 JobInstanceAlreadyCompleteException | 相同 identifying 参数二次启动即报已 complete；incrementer 追加 run.id 产生新 JobInstance |
| spring-batch × spring-integration | 远程分块用 `RemoteChunkingManagerStepBuilder`，master/worker 间消息须幂等 + 顺序保证 | worker 失败重启可能重处理消息；ItemWriter 幂等是前提（见 fw_batch_writer_idempotent） |

<!--
无强交互的框架组合省略；本表聚焦 spring-batch 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| spring-batch 5.0 | **破坏性变更**：`JobBuilderFactory`/`StepBuilderFactory` 废弃（5.2 移除）；`@EnableBatchProcessing` 不再暴露事务管理器 Bean，chunk/tasklet 须显式传 `PlatformTransactionManager`；`BatchConfigurer` 接口删除；`@EnableBatchProcessing` 默认配置 JdbcJobRepository（须 DataSource Bean）；Jakarta EE 9（`javax.*`→`jakarta.*`）；Java 17 基线；Spring Framework 6 | 4.x→5.x 升级须迁移到 `new JobBuilder(name, jobRepository)` / `new StepBuilder(name, jobRepository)`；显式传事务管理器；改 import |
| spring-batch 5.0 | `chunk(int)` 与 `chunk(int, PlatformTransactionManager)` API：5.x DSL 中 `.chunk(10).transactionManager(tm)` 或 `.chunk(10, tm)`（待验证：两种重载在 5.x 各小版本的具体签名差异，须核对 5.0/5.1/5.2 javadoc） | chunk 步骤必须显式传事务管理器，否则 step 无事务边界 |
| spring-batch 5.1 | 待验证：未联网核实 5.1 release notes 具体变更；沿用 5.0 起迁移趋势 | 须人工核实 5.1 是否有额外破坏性变更 |
| spring-batch 5.2 | `JobBuilderFactory`/`StepBuilderFactory` 正式移除（5.0 deprecated for removal in v5.2） | 5.2+ 项目用旧工厂编译错 |
| spring-batch 5.2.6 | 5.x 最新维护版（2026-06-10）；Spring Framework 6.2.x 配套 | 待验证：无破坏性变更清单公开，规律基于 5.x 通用项 |
| spring-batch 6.0 | **破坏性变更**：适配 Spring Boot 4 / Spring Framework 7；MongoDB DAO 性能优化；`SynchronizedItemStreamReader` 线程安全修复；`ExitStatus` 不可变契约修复 | 5.x→6.x 升级须回归 ExitStatus/SynchronizedItemStreamReader 行为；本规则集暂不覆盖 6.0，待 6.x 规则集落地 |
| spring-batch 4.x（legacy） | `javax.*` namespace；`JobBuilderFactory`/`StepBuilderFactory` 仍可用；Java 8+ 基线 | 4.x 项目不适用 5.x 规律（JobBuilder/StepBuilder 迁移规律除外） |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
5.0 的 JobBuilderFactory/StepBuilderFactory 废弃与 @EnableBatchProcessing 不再暴露事务管理器为两次关键破坏性变更，升级路径须显式核对。
5.1 release notes 未联网核实，标"待验证"，不臆造。
-->

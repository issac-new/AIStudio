---
ruleset_id: quartz
适用版本: Quartz 2.5.x（当前 2.5.2，2026-07 现行；2.4.x/2.3.x 差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/quartz-scheduler/quartz/releases ；https://www.quartz-scheduler.org/documentation/ ；https://docs.spring.io/spring-framework/reference/integration/scheduling.html ）
深度门槛: 10
---

# Quartz 规则集

<!--
本规则集覆盖 Quartz 2.5.x（2026-07-17 联网核实：最新 2.5.2，2.5.x 为 bug-fix/依赖升级线）。
2.5.0 起 breaking：迁移 Jakarta 命名空间（jakarta.*）+ 最低 JDK 11；2.4.x 为 javax + JDK 8 维护线。
Spring Boot 集成形态（spring-boot-starter-quartz / @Scheduled）与原生 quartz.properties 形态并存陈述。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.quartz-scheduler:quartz` / `spring-boot-starter-quartz` / `net.javacrumbs.shedlock:shedlock-spring`（配套信号） | 高 |
| 注解 | `@Scheduled` / `@DisallowConcurrentExecution` / `@PersistJobDataAfterExecution` / `@SchedulerLock` | 高 |
| 配置 | `org.quartz.*` / `spring.quartz.*` / `QRTZ_*`（数据库表前缀） | 高 |
| 代码 | `JobBuilder` / `TriggerBuilder` / `CronScheduleBuilder` / `SchedulerFactoryBean` / `JobDetail` / `implements Job` | 高 |
| 文件 | `**/quartz.properties` / `**/tables_*.sql`（QRTZ 建表脚本） | 中（需排除仅样例文档） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
依赖/注解/配置任一高置信度命中即可激活 quartz 规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Job 实现类：`grep -rlE 'implements Job|extends QuartzJobBean' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：Job 类文件数 = `grep -l … | wc -l`）
- @Scheduled 任务点：`grep -rnE '@Scheduled\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：@Scheduled 注解行数）
- Trigger 定义：`grep -rnE 'TriggerBuilder|CronScheduleBuilder|SimpleScheduleBuilder' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- JobDataMap 使用点：`grep -rnE 'JobDataMap|usingJobData|getJobDataMap' "${PROJECT_DIR}" --include='*.java'`
- Quartz 配置：`grep -rnE 'org\.quartz\.|spring\.quartz\.' "${PROJECT_DIR}"`（计数核验基准：配置行数）
- 分布式锁痕迹：`grep -rnE '@SchedulerLock|ShedLock|RedissonClient' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有构件；四要素核验"构件枚举计数≥实际×0.95"依此判定。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：多实例部署的 @Scheduled 任务必须加分布式锁（ShedLock/Redisson），否则重复执行
- **适用版本**: Spring Framework 5.x/6.x（@Scheduled）
- **规律**: Spring `@Scheduled` 是进程内调度，无集群协调。应用多实例部署时每个实例都会触发同一任务，造成重复执行。多实例生产环境必须：改用 Quartz 集群（JDBC JobStore + 数据库锁），或为 @Scheduled 任务加 ShedLock（`@SchedulerLock`，DB/Redis/ZK provider）/ Redisson 分布式锁兜底。单实例部署也须注释说明"依赖单实例"，防止后续扩容踩雷。
- **违反后果**: N 实例重复执行 N 次 → 重复扣款 / 重复推送 / 数据翻倍（CWE-362 竞态条件 / CWE-366 互斥竞争不充分）。
- **验证方法**: `grep -rlE '@Scheduled\b' --include='*.java'` 存在但全仓库无 `@SchedulerLock|ShedLock|RedissonClient|shedlock` → fail。
- **对应门禁**: fw_quartz_scheduled_lock(fail)

```verify
id: quartz-r1
cmd: grep -rlE '@Scheduled\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：多实例 Quartz 必须用 JDBC JobStore 集群模式，禁止 RAMJobStore 上生产
- **适用版本**: 全版本
- **规律**: RAMJobStore 存内存，多实例各自调度互不知晓，任务重复执行且宕机丢失全部调度状态。多实例须 `org.quartz.jobStore.class=org.springframework.scheduling.quartz.LocalDataSourceJobStore`（Spring）或 `JDBCJobStoreTX` + `org.quartz.jobStore.isClustered=true` + 建 QRTZ_* 表（数据库行锁保证同一时刻仅一个实例触发任务）。`instanceId=AUTO`、所有实例共用同一数据源与同 `instanceName`。Spring Boot 对应 `spring.quartz.job-store-type=jdbc` + `spring.quartz.properties.org.quartz.jobStore.isClustered=true`。
- **违反后果**: 多实例任务重复触发；实例重启调度状态全丢（CWE-362 竞态条件 / CWE-366 互斥竞争不充分）。
- **验证方法**: 检出 `RAMJobStore` → warn；检出 `spring.quartz|org.quartz` 配置但无 `job-store-type.*jdbc|jobStore.class|isClustered` → warn。
- **对应门禁**: fw_quartz_cluster_jobstore(warn)

```verify
id: quartz-r2
cmd: 
expect: always
```

### 规律：CronTrigger 必须显式选型 misfire 策略
- **适用版本**: 全版本
- **规律**: 调度线程池耗尽/应用停机期间错过触发即 misfire。CronTrigger 默认 `MISFIRE_INSTRUCTION_SMART_POLICY`（对 cron 等价于 fire once now，恢复时立即补跑一次）。须按业务显式选型：`withMisfireHandlingInstructionFireAndProceed`（补跑一次后按原计划）/`withMisfireHandlingInstructionDoNothing`（跳过错过的，等下个周期）/`withMisfireHandlingInstructionIgnoreMisfirePolicy`（错过的全部补跑）。对账类任务用 DoNothing 防补跑风暴；补偿类任务用 FireAndProceed。
- **违反后果**: 停机恢复后任务风暴补跑 → DB 洪峰；或错过周期数据缺口。
- **验证方法**: 检出 `CronScheduleBuilder` 但无 `withMisfireHandlingInstruction|MISFIRE_INSTRUCTION` → warn；配置侧有 cron 作业但无 misfire 相关属性 → warn。
- **对应门禁**: fw_quartz_misfire(warn)

```verify
id: quartz-r3
cmd: 
expect: always
```

### 规律：线程池上限 org.quartz.threadPool.threadCount 必须显式配置
- **适用版本**: 全版本
- **规律**: 默认 `threadCount` 未配时 Quartz 须显式给出（quartz.properties 缺省会启动失败；Spring Boot 默认 10，待验证各 Boot 版本默认值）。threadCount 决定并发任务上限：过小导致任务排队 misfire，过大导致 DB 连接/内存争抢。经验值：并发任务峰值 + 2 冗余，且 < 数据源连接池上限。`org.quartz.threadPool.class` 默认 SimpleThreadPool 生产可用。
- **违反后果**: 线程不足 → 任务延迟/misfire 堆积；线程过多 → 资源争抢拖垮应用。
- **验证方法**: 检出 `org.quartz|spring.quartz` 配置但无 `threadCount` → warn。
- **对应门禁**: fw_quartz_threadpool(warn)

```verify
id: quartz-r4
cmd: 
expect: always
```

### 规律：JobDataMap 只能存 String/基本类型，禁止存业务对象
- **适用版本**: 全版本（JDBC JobStore 序列化约束）
- **规律**: JDBC JobStore 集群模式下 JobDataMap 会被序列化进 `QRTZ_JOB_DETAILS.JOB_DATA`（或 `QRTZ_SIMPROP_TRIGGERS` 基本类型列）。存业务对象（DTO/Entity/连接/Spring Bean）会：序列化失败（未实现 Serializable）、类版本漂移反序列化爆炸、对象过大撑爆 BLOB。规范：JobDataMap 仅放 String/int/long/boolean 等基本类型标识（如 orderId），任务执行时按 id 回源查库取全量数据。`useDriverManagerDataSource` 无关。
- **违反后果**: 序列化异常任务无法调度；类升级后历史 JobDataMap 反序列化 ClassNotFound（CWE-502 不安全反序列化）。
- **验证方法**: 检出 `usingJobData\(|JobDataMap.*put\(|getJobDataMap\(\)\.put\(` 行参数含 `new [A-Z]` 对象构造 → warn。
- **对应门禁**: fw_quartz_jobdatamap(warn)

```verify
id: quartz-r5
cmd: 
expect: always
```

### 规律：任务执行必须幂等，重复触发无副作用
- **适用版本**: 全版本
- **规律**: Quartz misfire 补跑、集群故障转移、手动重触发、@Scheduled 多实例（锁失效边界）都会导致同一任务重复执行。含写操作（insert/update/save/扣减/推送）的任务必须幂等：业务唯一键、状态机校验、执行记录表去重。非幂等任务禁止配 misfire 补跑策略。
- **违反后果**: 重复执行 → 重复扣款 / 重复推送 / 数据翻倍。
- **验证方法**: Job 实现类/@Scheduled 方法所在类含 `.(insert|update|save|delete)(` 写操作但无 `幂等|idempot|dedup|去重|唯一键|onDuplicateKey` 痕迹 → warn。
- **对应门禁**: fw_quartz_idempotent(warn)

```verify
id: quartz-r6
cmd: 
expect: always
```

### 规律：有状态 Job 必须加 @DisallowConcurrentExecution，必要时叠加 @PersistJobDataAfterExecution
- **适用版本**: 全版本
- **规律**: 同一 JobDetail 的多个 Trigger 到点会并发执行同一 Job（Quartz 每次 new 实例但共享 JobDataMap/外部资源）。任务有共享状态（写同一份文件、累加外部计数、JobDataMap 计数器）时须 `@DisallowConcurrentExecution` 保证同一 JobDetail 串行；JobDataMap 状态跨执行累积还须 `@PersistJobDataAfterExecution` 把执行期修改写回 JobStore。注意 @DisallowConcurrentExecution 锁粒度是 JobDetail，不同 JobDetail（同名不同组）仍并发。
- **违反后果**: 同任务并发执行 → 状态竞争 / 文件写坏 / 计数漂移（CWE-362 竞态条件 / CWE-366 互斥竞争不充分）。
- **验证方法**: 检出 `implements Job|extends QuartzJobBean` 类但无 `@DisallowConcurrentExecution` → warn。
- **对应门禁**: fw_quartz_disallow_concurrent(warn)

```verify
id: quartz-r7
cmd: 
expect: always
```

### 规律：cron 表达式必须显式声明时区，禁止依赖服务器默认时区
- **适用版本**: 全版本
- **规律**: cron 触发按 `CronTrigger` 时区解释，默认取服务器 JVM 时区。容器/云环境默认 UTC，与中国时区（Asia/Shanghai）差 8 小时，"每天凌晨 2 点"会变成下午 6 点触发。Quartz 原生须 `CronScheduleBuilder.inTimeZone(TimeZone.getTimeZone("Asia/Shanghai"))`；Spring `@Scheduled(cron=..., zone="Asia/Shanghai")`。夏令时时区还须注意 cron 语义漂移（Quartz cron 秒级 6/7 段，与 Unix crontab 5 段不同，混用直接错位）。
- **违反后果**: 任务在错误时刻触发，日切/结算错位。
- **验证方法**: `@Scheduled` 行含 `cron` 但无 `zone` → warn；`CronScheduleBuilder` 无 `inTimeZone` → warn。
- **对应门禁**: fw_quartz_timezone(warn)

```verify
id: quartz-r8
cmd: 
expect: always
```

### 规律：cron 语义须核对段数与符号（Quartz 6/7 段 vs Unix 5 段）
- **适用版本**: 全版本
- **规律**: Quartz cron 为 `秒 分 时 日 月 周 [年]` 6-7 段，Unix crontab 为 `分 时 日 月 周` 5 段。直接把 5 段表达式贴进 Quartz 会解析错位或报错。`?` 仅用于日/周互斥；`L/W/#` 为 Quartz 扩展。配置化 cron 表达式须在启动时校验（`CronExpression.isValidExpression`）防上线即炸。
- **违反后果**: 表达式错位 → 任务永不触发或每分钟狂触发。
- **验证方法**: 表达式存于配置/数据库，静态不可机械核验 → 人工检查（核对表达式段数与启动校验日志）。
- **对应门禁**: 人工检查

```verify
id: quartz-r9
cmd: 
expect: always
```

### 规律：触发器优先级与线程池须协同规划，核心任务 priority 须高于批量任务
- **适用版本**: 全版本
- **规律**: 线程池占满时 Quartz 按 `Trigger.priority`（默认 5）决定先触发谁。核心链路任务（支付对账）与批量任务（报表导出）混部时，核心任务 priority 须调高（如 9），批量任务调低（如 1），防止批量占满线程池饿死核心任务。
- **违反后果**: 线程池挤占 → 核心任务延迟触发。
- **验证方法**: priority 在 TriggerBuilder.withPriority 配置，须结合任务分级清单 → 人工检查。
- **对应门禁**: 人工检查

```verify
id: quartz-r10
cmd: 
expect: always
```

### 规律：JobListener/TriggerListener 须接告警，任务失败禁止静默
- **适用版本**: 全版本
- **规律**: Quartz 任务抛异常默认只记日志（`JobExecutionException`），无外部通知。生产须注册 `JobListener`（`jobWasExecuted` 中检查 `jobException`）接告警（钉钉/邮件/PagerDuty），或接 Micrometer 指标暴露失败计数。`refireImmediately` 须防无限重试风暴（须限次数）。
- **违反后果**: 任务持续失败无人感知，业务数据缺口扩大。
- **验证方法**: 监听器注册与告警通道配置不可机械核验 → 人工检查（核对 Listener 注册与告警演练）。
- **对应门禁**: 人工检查

```verify
id: quartz-r11
cmd: 
expect: always
```

### 规律：调度中心高可用须整体评估（DB 锁 + 实例数 + 恢复策略）
- **适用版本**: 全版本
- **规律**: Quartz 集群高可用三要素：JDBC JobStore 数据库锁（单点 DB 成为瓶颈，DB 挂全集群停调）、实例数 ≥2（`instanceId=AUTO`）、`misfireThreshold`（默认 60s，待验证各版本默认值）与恢复补跑策略匹配业务容忍度。`clusterCheckinInterval`（默认 15s）决定故障发现时延。调度 DB 须与业务库隔离或评估连接争抢。
- **违反后果**: 调度 DB 单点故障 → 全量任务停调；故障转移延迟 → 任务窗口错过。
- **验证方法**: 部署拓扑与 DB 容量规划 → 人工检查（故障演练记录核对）。
- **对应门禁**: 人工检查

```verify
id: quartz-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。8 条挂门禁 id，4 条（cron 段数/优先级/监听器告警/高可用）为人工检查。
verify-framework-ruleset.sh 扫描每条规律体内"对应门禁/人工检查"关键字，本文件全覆盖。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_quartz_scheduled_lock | fail | @Scheduled 存在但全仓库无 ShedLock/Redisson 痕迹 → fail | QUARTZ_SRC_GLOBS | CWE-362/366 |
| fw_quartz_cluster_jobstore | warn | RAMJobStore 检出，或 quartz 配置无 jdbc JobStore/isClustered → warn | QUARTZ_SRC_GLOBS | CWE-362/366 |
| fw_quartz_misfire | warn | CronScheduleBuilder 无 withMisfireHandlingInstruction → warn | QUARTZ_SRC_GLOBS | — |
| fw_quartz_threadpool | warn | quartz 配置无 threadCount → warn | QUARTZ_SRC_GLOBS | — |
| fw_quartz_jobdatamap | warn | JobDataMap/usingJobData put 对象构造（new Xxx）→ warn | QUARTZ_SRC_GLOBS | CWE-502 |
| fw_quartz_idempotent | warn | Job 类含写操作无幂等痕迹 → warn | QUARTZ_SRC_GLOBS | — |
| fw_quartz_disallow_concurrent | warn | Job 实现类无 @DisallowConcurrentExecution → warn | QUARTZ_SRC_GLOBS | CWE-362/366 |
| fw_quartz_timezone | warn | @Scheduled cron 无 zone / CronScheduleBuilder 无 inTimeZone → warn | QUARTZ_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_quartz_<rule>（rule 全小写下划线）。
上表 8 条 id 在 assets/framework-gates/quartz.sh 中均有同名实现；片段头 `# gates:` 与本表一致。
人工检查类规律（cron 段数/优先级/监听器告警/高可用）无门禁 id，不入本表。
fixture 验证覆盖：violating 含 @Scheduled 多实例无分布式锁 → fw_quartz_scheduled_lock fail 主触发 + JobDataMap 存对象；compliant 修正全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| quartz × spring-boot | Boot 3.x 用 `spring.quartz.*` 自动装配 SchedulerFactoryBean；Jakarta 命名空间须 Quartz 2.5+ | 2.4.x javax 与 Boot 3 jakarta 不兼容（2.5.0 breaking：Jakarta + JDK 11） |
| quartz × redis | @Scheduled 分布式锁可用 ShedLock redis provider，与缓存 Redis 须隔离 db index | 防止 FLUSHDB 误清锁数据导致并发执行 |
| quartz × mybatis | 任务回源查询须分页 + 索引，禁止全表扫描后内存过滤 | 调度任务常批量，全表扫描拖垮 DB |
| quartz × spring-security | 调度管理端点（若有自建 pause/resume API）须鉴权 | 未授权者可暂停/触发任务 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Quartz 2.3.2 | C3P0 升级修 CVE-2019-5427；XXE 修复 | 2.3.2 以下有已知 CVE，须升级 |
| Quartz 2.4.0 | 移除 TerracottaJobStore 与 NativeJob；构建迁 Gradle；最低 JDK 8 | 用 Terracotta 集群的须迁 JDBC JobStore |
| Quartz 2.5.0 | breaking：Jakarta 命名空间（jakarta.*）；最低 JDK 11 | Boot 3 必须 2.5+；javax 项目留在 2.4.x |
| Quartz 2.5.1/2.5.2 | bug-fix 与依赖升级（2.5.x 维护线） | 建议跟进 2.5.2 |
| Spring Boot 2.7→3.x | spring.quartz.jdbc.initialize-schema 行为核对（内嵌库才默认初始化） | 生产库须手工执行 QRTZ 建表脚本 |

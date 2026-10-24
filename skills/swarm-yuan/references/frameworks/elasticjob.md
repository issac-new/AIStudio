---
ruleset_id: elasticjob
适用版本: ElasticJob 3.x（当前 3.0.5，2026-02 发布，2026-07 现行）
最后调研: 2026-07-17（来源：https://shardingsphere.apache.org/elasticjob/current/en/downloads/ ；https://shardingsphere.apache.org/elasticjob/current/cn/overview/ ；https://github.com/apache/shardingsphere-elasticjob ）
深度门槛: 10
---

# ElasticJob 规则集

<!--
本规则集覆盖 ElasticJob 3.x（2026-07-17 联网核实：最新 3.0.5，2026-02-07 发布，核心项目仍发版；
ElasticJob-UI 最后版本 3.0.2 停在 2022-10-31，运维控制台活跃度低，按"可用但停滞"陈述）。
ElasticJob-Lite（嵌入式，ZK 注册中心）为现行主推形态；ElasticJob-Cloud 活跃度待验证，新项目选型按 Lite 陈述。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.shardingsphere.elasticjob:elasticjob-lite-core` / `elasticjob-lite-spring-boot-starter` / `elasticjob-error-handler-*` / `elasticjob-tracing-rdb` | 高 |
| 代码 | `implements SimpleJob` / `implements DataflowJob` / `ShardingContext` / `JobConfiguration` / `ScheduleJobBootstrap` | 高 |
| 配置 | `elasticjob.reg-center.*` / `elasticjob.jobs.*` / `elasticjob.tracing.*` | 高 |
| 注解 | `@ElasticJobConfiguration`（社区封装，待验证官方性） | 低（非官方标准注解，仅辅助） |
| 文件 | `**/elasticjob*.yml` / ZK 命名空间 `**/job` 节点 | 低 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
依赖/代码/配置任一高置信度命中即可激活 elasticjob 规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 作业实现类：`grep -rlE 'implements (SimpleJob|DataflowJob|ScriptJob)' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：作业类文件数 = `grep -l … | wc -l`）
- 分片使用点：`grep -rnE 'getShardingItem|getShardingTotalCount|ShardingContext' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 作业配置：`grep -rnE 'elasticjob\.jobs\.|JobConfiguration' "${PROJECT_DIR}"`（计数核验基准：配置行数）
- 注册中心配置：`grep -rnE 'elasticjob\.reg-center|server-lists|ZookeeperRegistryCenter' "${PROJECT_DIR}"`
- failover/misfire 配置：`grep -rnE 'failover|misfire' "${PROJECT_DIR}"`
- 事件追踪配置：`grep -rnE 'elasticjob\.tracing|TracingConfiguration' "${PROJECT_DIR}"`

<!--
枚举该框架特有构件；四要素核验"构件枚举计数≥实际×0.95"依此判定。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：分片作业必须开启 failover 失效转移，故障实例分片自动接管
- **适用版本**: 3.x
- **规律**: ElasticJob 分片调度下，某实例宕机时其分片默认不再执行（须等下次重分片，期间数据缺口）。开启 `failover: true`（Spring Boot starter）或 `JobConfiguration.newBuilder(...).failover(true)`（Java API）后，运行中分片项会被其他存活实例以一次性任务接管。批量数据处理作业必须开启；对执行时序敏感的任务可关，但须人工评估缺口容忍度。failover 依赖 ZK 临时节点感知实例下线（会话超时周期内完成转移）。
- **违反后果**: 实例宕机 → 其分片数据该周期未处理，业务缺口无人发现。
- **验证方法**: 检出作业（`implements SimpleJob|DataflowJob` 或 `elasticjob.jobs.` 配置）但全仓库无 `failover: true`/`failover(true)` → fail。
- **对应门禁**: fw_elasticjob_failover(fail)

```verify
id: elasticjob-r1
cmd: 
expect: always
```

### 规律：作业执行必须幂等，重分片/failover/手动触发重复执行无副作用
- **适用版本**: 3.x
- **规律**: ElasticJob 在重分片（实例上下线）、failover 接管、misfire 补跑、控制台手动触发场景下同一数据可能被重复处理。含写操作（insert/update/save/扣减/推送）的作业必须幂等：业务唯一键去重、状态机 CAS（`where status = '待处理'`）、执行记录表。非幂等作业禁止开 failover 与 misfire 补跑。
- **违反后果**: 重复执行 → 重复扣款 / 重复推送 / 数据翻倍。
- **验证方法**: 作业类含 `.(insert|update|save|delete)(` 写操作但无 `幂等|idempot|dedup|去重|状态机|onDuplicateKey` 痕迹 → warn。
- **对应门禁**: fw_elasticjob_idempotent(warn)

```verify
id: elasticjob-r2
cmd: 
expect: always
```

### 规律：分片逻辑必须确定性分发（item % totalCount），禁止分片参数与分发脱节
- **适用版本**: 3.x
- **规律**: 作业通过 `ShardingContext.getShardingItem()`（本分片序号）与 `getShardingTotalCount()` 获取分片参数，数据分发必须确定性：`id % totalCount == item`（或等价的 hash 取模/范围段）。仅取 shardingItem 打日志而实际查询不按分片过滤，则每个实例处理全量数据，副作用放大 N 倍。分片参数须与 `sharding-total-count` 配置一致（代码写死总数会与配置漂移）。
- **违反后果**: N 实例重复处理全量数据；或部分数据段无实例认领形成空洞。
- **验证方法**: 检出 `getShardingItem` 但同文件无 `%` 取模或 `getShardingTotalCount` → warn。
- **对应门禁**: fw_elasticjob_sharding(warn)

```verify
id: elasticjob-r3
cmd: 
expect: always
```

### 规律：分片总数须与实例规模匹配，禁止分片数 < 实例数长期空转
- **适用版本**: 3.x
- **规律**: `sharding-total-count` 决定并行度上限：分片数 > 实例数时单实例顺序领多片；分片数 < 实例数时空闲实例空转（资源浪费但无害）；分片数 = 1 时退化为单实例调度（丧失水平扩展）。经验值：分片数 = 实例数 × 2~3，兼顾 failover 接管粒度。扩容实例数后须重估分片数（分片数不随实例自动增长）。
- **违反后果**: 分片数过小 → 数据量增长后单周期处理超时；分片数 = 1 → 无扩展能力。
- **验证方法**: 实例规模与数据量规划不可机械核验 → 人工检查（核对 sharding-total-count 与实例数比例）。
- **对应门禁**: 人工检查

```verify
id: elasticjob-r4
cmd: 
expect: always
```

### 规律：ZK 注册中心必须集群多地址，禁止单点
- **适用版本**: 3.x（Curator/ZK 依赖）
- **规律**: ElasticJob-Lite 的注册中心（ZooKeeper）承载选主、分片、failover 协调。`elasticjob.reg-center.server-lists` 单地址时 ZK 单点故障 → 全量作业调度瘫痪（ZK 不可用时作业停调，运行中作业降级本地继续但无法重分片）。生产须 ZK 集群（≥3 节点）+ 逗号分隔多地址。`session-timeout-milliseconds`（默认 60000）决定故障感知时延；命名空间 `namespace` 须按环境隔离（dev/test/prod 禁共用）。
- **违反后果**: ZK 单点故障 → 调度整体停摆；环境串扰 → 测试作业触发生产数据。
- **验证方法**: 检出 elasticjob 使用但无 `server-lists` → warn；`server-lists` 值不含逗号（单地址）→ warn。
- **对应门禁**: fw_elasticjob_registry(warn)

```verify
id: elasticjob-r5
cmd: 
expect: always
```

### 规律：misfire 补跑策略须按业务显式配置
- **适用版本**: 3.x
- **规律**: `misfire`（默认 true，待验证 starter 各版本默认值）控制错过触发时刻后是否立即补跑。对账/汇总类任务错过周期须跳过时配 `misfire: false`（等下个周期）；补偿/同步类任务须补跑配 true。停机维护窗口长的业务须评估补跑风暴（多实例恢复同时补跑压 DB）。
- **违反后果**: 恢复后任务风暴补跑 → DB 洪峰；或错过周期数据缺口。
- **验证方法**: 检出 `elasticjob.jobs.` 配置但无 `misfire` 键 → warn。
- **对应门禁**: fw_elasticjob_misfire(warn)

```verify
id: elasticjob-r6
cmd: 
expect: always
```

### 规律：cron 须显式声明时区，禁止依赖服务器默认时区
- **适用版本**: 3.x（`time-zone` 属性）
- **规律**: ElasticJob 作业 cron 默认按服务器 JVM 时区解释，容器环境默认 UTC 与中国时区差 8 小时。3.x 支持 `time-zone`（如 `Asia/Shanghai`）按作业声明时区，须显式配置。跨时区业务（UTC 存储 + 本地时区展示）还须核对日切边界。
- **违反后果**: 任务在错误时刻触发，日切/结算错位。
- **验证方法**: 检出 `elasticjob.jobs.` 配置但无 `time-zone|timeZone` → warn。
- **对应门禁**: fw_elasticjob_timezone(warn)

```verify
id: elasticjob-r7
cmd: 
expect: always
```

### 规律：作业异常必须显式处理，禁止 catch 吞异常
- **适用版本**: 3.x（JobErrorHandler SPI）
- **规律**: 作业 `execute` 抛异常会记入 ZK 并触发告警链（若配置）。catch 吞异常（空 catch / 仅打印日志）使调度层误判成功，重试与监控失效。生产须接入 `JobErrorHandler`（elasticjob-error-handler-dingtalk/wechat/email 模块或自定义 SPI，`job-error-handler.type` 配置），作业内 catch 后须 rethrow 或交 error handler。
- **违反后果**: 失败静默，业务数据缺口无人发现。
- **验证方法**: 作业类含 `catch` 但无 `throw|JobErrorHandler|error-handler` 痕迹 → warn。
- **对应门禁**: fw_elasticjob_error_handler(warn)

```verify
id: elasticjob-r8
cmd: 
expect: always
```

### 规律：作业事件追踪须接 RDB，执行历史须可审计
- **适用版本**: 3.x（elasticjob-tracing-rdb）
- **规律**: `elasticjob.tracing.type=RDB` + 数据源把作业执行事件（开始/成功/失败、分片项、耗时）落库（JOB_EXECUTION_LOG / JOB_STATUS_TRACE_LOG 表），是排障与审计基础。无追踪时作业执行历史仅存 ZK 瞬时状态，故障回溯断链。追踪数据源须与业务库隔离（写放大）。
- **违反后果**: 作业执行无历史可查，线上问题无法回溯。
- **验证方法**: 检出作业配置但无 `elasticjob.tracing|TracingConfiguration` → warn。
- **对应门禁**: fw_elasticjob_tracing(warn)

```verify
id: elasticjob-r9
cmd: 
expect: always
```

### 规律：ElasticJob-Lite vs Cloud 选型须按部署形态，新项目用 Lite
- **适用版本**: 3.x
- **规律**: ElasticJob-Lite 为无中心嵌入式（jar 依赖 + ZK 协调），接入成本低、社区主线；ElasticJob-Cloud 为 Mesos 常驻调度形态，资源治理强但运维重，活跃度待验证（3.x 主线发版集中在 Lite，2026-02 3.0.5 为 Lite 线）。新项目默认 Lite；仅超大规模混部资源治理场景评估 Cloud。
- **违反后果**: 选型 Cloud 后维护断档，升级无路径。
- **验证方法**: 选型决策 → 人工检查（核对形态与维护计划）。
- **对应门禁**: 人工检查

```verify
id: elasticjob-r10
cmd: 
expect: always
```

### 规律：分片策略须按数据分布选型（平均/哈希/轮转）
- **适用版本**: 3.x（`sharding-strategy.type`）
- **规律**: 内置分片策略：`AVG_ALLOCATION`（平均分片项给实例，默认）、`ODEVITY`（奇偶哈希，按作业名 hash 决定奇偶分配）、`ROUND_ROBIN`（轮转）。数据倾斜场景（某分片项数据量远大于其他）须自定义 `JobShardingStrategy` SPI 按业务键均衡。策略与分片逻辑（item 过滤）必须配套，换策略须重验分发正确性。
- **违反后果**: 数据倾斜 → 单实例处理超时；策略与分发逻辑错配 → 数据空洞。
- **验证方法**: 策略配置与数据分布 → 人工检查（核对 sharding-strategy.type 与分片键分布）。
- **对应门禁**: 人工检查

```verify
id: elasticjob-r11
cmd: 
expect: always
```

### 规律：运维须接 Console（elasticjob-ui）管控生命周期，禁止直接改 ZK
- **适用版本**: 3.x（ElasticJob-UI 3.0.2，2022-10 后未发版，按停滞项目陈述）
- **规律**: 作业的触发/暂停/失效/分片调整须走 Console（elasticjob-ui）或 Lite 的 `JobOperateAPI`，禁止直接 `set/delete` ZK 节点（绕过协调协议会造成分片状态不一致）。`overwrite: true` 时本地配置覆盖 ZK 已调度配置，生产须统一配置源（建议 false + Console 为准），防止本地与 ZK 双写漂移。UI 项目停滞，安全补丁须自评（待验证是否有 fork 维护线）。
- **违反后果**: 直改 ZK → 分片状态错乱作业重复/丢失；双写漂移 → 配置不生效。
- **验证方法**: 运维流程 → 人工检查（核对 Console 接入与 overwrite 配置）。
- **对应门禁**: 人工检查

```verify
id: elasticjob-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。8 条挂门禁 id，4 条（分片数规模/Lite vs Cloud/分片策略/Console 运维）为人工检查。
verify-framework-ruleset.sh 扫描每条规律体内"对应门禁/人工检查"关键字，本文件全覆盖。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_elasticjob_failover | fail | 检出作业但全仓库无 failover=true 痕迹 → fail | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_idempotent | warn | 作业类含写操作无幂等痕迹 → warn | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_sharding | warn | 用 getShardingItem 但未取模/无 getShardingTotalCount → warn | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_registry | warn | 有作业无 server-lists，或 server-lists 单地址 → warn | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_misfire | warn | 作业配置无 misfire 键 → warn | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_timezone | warn | 作业配置无 time-zone → warn | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_error_handler | warn | 作业 catch 吞异常无 throw/JobErrorHandler → warn | ELASTICJOB_SRC_GLOBS | — |
| fw_elasticjob_tracing | warn | 作业配置无 tracing 事件追踪 → warn | ELASTICJOB_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_elasticjob_<rule>（rule 全小写下划线）。
上表 8 条 id 在 assets/framework-gates/elasticjob.sh 中均有同名实现；片段头 `# gates:` 与本表一致。
人工检查类规律（分片数规模/Lite vs Cloud/分片策略/Console 运维）无门禁 id，不入本表。
fixture 验证覆盖：violating 含分片作业无 failover → fw_elasticjob_failover fail 主触发 + 无幂等；compliant 修正全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| elasticjob × spring-boot | Boot starter 配置节点 `elasticjob.*`；作业类须为 Spring Bean 方可注入依赖 | 非 Bean 作业类由 elasticjob 自实例化，@Autowired 静默为 null |
| elasticjob × quartz | 同一任务禁止 ElasticJob 与 Quartz/@Scheduled 双调度通道并存 | 双通道各自触发，重复执行且 failover 语义互相打架 |
| elasticjob × mybatis | 分片查询 Mapper 须按 `item % totalCount` 过滤（mod 函数或 id 段） | 否则每实例全表扫描重复处理 |
| elasticjob × redis | 作业幂等可用 Redis SETNX 去重键（带 TTL），与缓存 db index 隔离 | 复用同库 FLUSHDB 会清掉幂等键导致重复执行 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| ElasticJob 2.x → 3.0 | 包名 `com.dangdang.ddframe.job`/`io.elasticjob` → `org.apache.shardingsphere.elasticjob`；配置模型重构 | 2.x 配置与 API 全量不兼容，迁移须改包名 + 配置 |
| ElasticJob 3.0.x | Spring Boot starter 属性 kebab-case（sharding-total-count/time-zone/job-error-handler.type） | camelCase 写法静默不生效 |
| ElasticJob 3.0.4 | bug-fix 线（具体点待验证） | 升级前核对 release notes |
| ElasticJob 3.0.5 | 2026-02-07 发布（现行最新） | 建议跟进；UI 仍停 3.0.2（2022-10），安全补丁自评 |
| ElasticJob-Cloud | 3.x 活跃度待验证，主线在 Lite | 新项目默认 Lite |

---
ruleset_id: flink
适用版本: Apache Flink 2.x（2.0–2.3，现行稳定 2.3.0）/ 1.20.x LTS（差异单独标注）；Flink CDC 3.x（现行稳定 3.6）
最后调研: 2026-07-17（来源：https://flink.apache.org/downloads/ ；https://nightlies.apache.org/flink/flink-docs-master/docs/ops/upgrading/ ；https://nightlies.apache.org/flink/flink-cdc-docs-master/ ）
深度门槛: 10
---

# Flink 规则集

<!--
本规则集覆盖 Apache Flink 2.x（2.0 2025-03 GA，现行稳定 2.3.0 2026-06-25）与 1.20.x LTS（现行 1.20.5）。
调研时点：2026-07-17。已核实：版本号与发布日期（downloads 页）；Flink CDC 3.6 稳定 / 3.7-SNAPSHOT 开发中；
连接器大版本已随 2.x 换轨（Kafka 4.x / JDBC 4.x 面向 Flink 2.0.x，旧轨面向 1.18–1.20.x）。
未联网核实的细节（2.0 移除 DataSet API 的具体 FLIP、ForSt 异步状态后端默认行为、1.x→2.x savepoint 兼容矩阵）
一律标"待验证"，对应门禁统一降 warn。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.flink:flink-streaming-java` / `flink-table-api-java-bridge` / `flink-connector-*` / `org.apache.flink.cdc:flink-cdc-*` / `com.ververica:flink-connector-*` | 高 |
| 注解/代码 | `StreamExecutionEnvironment` / `StreamTableEnvironment` / `DataStream` / `WatermarkStrategy` / `CheckpointConfig` | 高 |
| 文件 | `**/flink-conf.yaml` / `**/flink-conf.yml` / `**/sql-client-defaults.yaml` / `**/conf/flink-conf.yaml` | 中（须排除他用） |
| 配置 | `execution.checkpointing.*` / `state.backend.*` / `restart-strategy.*` / `pipeline.jars` / `table.*` / `high-availability.*` | 高 |
| 代码 | `enableCheckpointing` / `assignTimestampsAndWatermarks` / `RestartStrategy` / `KeyedState` / `ValueState` / `CEP.pattern` | 高 |
| CDC | `flink-cdc.yaml`（YAML pipeline：`source:`/`sink:` + `pipeline:` 节点）/ `MySqlSource` / `FlinkSourceFunction` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 flink 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- DataStream 作业入口：`grep -rlE 'StreamExecutionEnvironment|getExecutionEnvironment' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含作业入口的 .java 文件数）
- Table/SQL 作业：`grep -rlE 'StreamTableEnvironment|CREATE TABLE.*WITH' "${PROJECT_DIR}" --include='*.java' --include='*.sql'`（计数核验基准：文件数）
- 窗口算子：`grep -rnE '\.window\(|TumblingEventTimeWindows|SlidingEventTimeWindows|SessionWindow' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：窗口定义行数）
- KeyedState 使用：`grep -rnE 'ValueState|ListState|MapState|ReducingState|AggregatingState' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：状态声明行数）
- checkpoint/savepoint 配置：`grep -rnE 'enableCheckpointing|execution\.checkpointing|savepoint' "${PROJECT_DIR}"`（计数核验基准：命中行数）
- Watermark 策略：`grep -rnE 'WatermarkStrategy|assignTimestampsAndWatermarks' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- flink-conf 配置：`find "${PROJECT_DIR}" -name 'flink-conf.y*ml' -not -path '*/node_modules/*'`（计数核验基准：文件数）
- CDC 源：`grep -rnE 'MySqlSource|PostgresSource|FlinkSourceFunction|flink-cdc' "${PROJECT_DIR}"`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：流作业必须启用 checkpoint，禁止裸跑无容错
- **适用版本**: 全版本（1.x / 2.x）
- **规律**: DataStream 作业默认不启用 checkpoint，故障即丢状态、无法断点恢复。生产作业必须 `env.enableCheckpointing(interval)` 或 `execution.checkpointing.interval` 显式开启；无 checkpoint 时 RestartStrategy 默认不重启（1.x 行为，2.x 待验证默认值是否变更），作业一挂即停。
- **违反后果**: 故障丢全部中间状态，从 Kafka 最早位点重放导致重复计算 / 结果错乱；exactly-once 无从谈起。
- **验证方法**: 检出 `StreamExecutionEnvironment` 作业但全项目无 `enableCheckpointing`/`execution.checkpointing.interval` → fail。
- **对应门禁**: fw_flink_checkpoint_enabled(fail)

```verify
id: flink-r1
cmd: 
expect: always
```

### 规律：checkpoint 间隔须与状态大小权衡，过频拖吞吐过疏恢复慢
- **适用版本**: 全版本
- **规律**: checkpoint 间隔过小（<60s）时大状态作业频繁快照，barrier 对齐与快照 IO 拖垮吞吐；过大（>10min）则故障回放量大、恢复慢。经验区间 1–10min，按状态大小与 SLA 调整；间隔须大于快照本身耗时（`state.backend.*.incremental` 增量快照可缩短）。
- **违反后果**: 过频 → 吞吐腰斩、反压；过疏 → 故障恢复重放数小时数据。
- **验证方法**: `enableCheckpointing(N)` 中 N<60000 → warn 人工确认；或检出 interval < 1min。
- **对应门禁**: fw_flink_checkpoint_interval(warn)

```verify
id: flink-r2
cmd: 
expect: always
```

### 规律：算子须显式 .uid()，否则 savepoint 升级后无法映射
- **适用版本**: 全版本
- **规律**: savepoint 依赖算子 UID 做状态映射；未显式 `.uid()` 时 Flink 自动生成 hash UID，作业拓扑一变（增删算子、改链）即无法从 savepoint 恢复。生产作业所有转换算子须显式 `.uid("...")`，官方升级文档亦强烈建议（见 upgrading 页 "explicit operator UIDs"）。
- **违反后果**: 版本升级 / 拓扑微调后 savepoint 报废，只能冷启动丢状态。
- **验证方法**: 检出 `.map(`/`.keyBy(`/`.process(` 等转换但全文件无 `.uid(` → warn。
- **对应门禁**: fw_flink_savepoint_uid(warn)

```verify
id: flink-r3
cmd: 
expect: always
```

### 规律：exactly-once 须端到端：CheckpointingMode + 支持事务的两阶段提交 Sink
- **适用版本**: 全版本（SinkFunction 旧接口在 2.x 已弃用/移除，待验证具体移除版本）
- **规律**: `EXACTLY_ONCE` 仅保证 Flink 内部状态一致；端到端 exactly-once 要求 Sink 支持两阶段提交 / 幂等写（KafkaSink 事务、TwoPhaseCommitSinkFunction、FLIP-143 Sink 接口）。旧 `SinkFunction`（`addSink(...)`）不支持事务语义，写出即 at-least-once。
- **违反后果**: 故障恢复后下游重复数据（重复扣减库存 / 重复入账）。
- **验证方法**: 检出 `EXACTLY_ONCE` 但 sink 侧为 `addSink(`/`implements SinkFunction` → warn 人工确认 Sink 事务能力。
- **对应门禁**: fw_flink_exactly_once_sink(warn)

```verify
id: flink-r4
cmd: 
expect: always
```

### 规律：事件时间窗口必须配 Watermark，否则窗口永不触发/数据错乱
- **适用版本**: 全版本
- **规律**: 使用 EventTime 窗口（`TumblingEventTimeWindows` 等）必须 `assignTimestampsAndWatermarks(WatermarkStrategy...)` 指定水位线策略（如 `forBoundedOutOfOrderness`）；无 watermark 时窗口按事件时间永不推进，数据滞留。处理时间窗口不需要 watermark。
- **违反后果**: 窗口不触发（无结果输出）或触发时机错乱，结果不可信。
- **验证方法**: 检出 EventTime 窗口类但无 `WatermarkStrategy`/`assignTimestampsAndWatermarks` → warn。
- **对应门禁**: fw_flink_watermark(warn)

```verify
id: flink-r5
cmd: 
expect: always
```

### 规律：乱序/迟到数据须显式处置：forBoundedOutOfOrderness + allowedLateness + sideOutputLateData
- **适用版本**: 全版本
- **规律**: 乱序容忍度由 WatermarkStrategy（如 `forBoundedOutOfOrderness(Duration)`）决定；超过 watermark 仍迟到的数据默认直接丢弃。须按业务配 `.allowedLateness(...)` 二次触发或 `.sideOutputLateData(...)` 收集迟到数据，否则统计口径静默漏数。
- **违反后果**: 迟到数据被静默丢弃 → 报表/计费少算，且无任何告警。
- **验证方法**: 检出 EventTime 窗口但无 `allowedLateness` 且无 `sideOutputLateData` → warn。
- **对应门禁**: fw_flink_allowed_lateness(warn)

```verify
id: flink-r6
cmd: 
expect: always
```

### 规律：状态后端选型：小状态 HashMap/堆内，大状态 RocksDB + 增量 checkpoint
- **适用版本**: 1.20.x / 2.x（2.x 引入 ForSt 分离式状态后端，默认行为待验证）
- **规律**: `state.backend` 未配置时默认 HashMap（堆内），状态超 GB 级即 GC 压力 / OOM 风险；大状态须 RocksDB（`state.backend.type=rocksdb` / EmbeddedRocksDBStateBackend）+ `incremental=true` 增量快照。2.x ForSt 异步状态后端面向超大状态（待验证默认化时点）。
- **违反后果**: 大状态堆内存溢出 / checkpoint 超时雪崩。
- **验证方法**: 检出 KeyedState 使用但无 `state.backend` / `EmbeddedRocksDBStateBackend` 配置 → warn 人工确认状态规模。
- **对应门禁**: fw_flink_state_backend(warn)

```verify
id: flink-r7
cmd: 
expect: always
```

### 规律：KeyedState 须配 StateTtlConfig，否则状态无限增长
- **适用版本**: 全版本
- **规律**: `ValueState`/`MapState` 等 KeyedState 默认永不过期，key 空间持续增长（如新设备/新用户）时状态无限膨胀，最终拖垮 RocksDB / 堆。须 `StateTtlConfig.newBuilder(...)` 配 TTL + 清理策略（`.cleanupFullSnapshot()` / `.cleanupIncrementally(...)`）。
- **违反后果**: 状态无界增长 → checkpoint 越来越慢直至超时，作业雪崩。
- **验证方法**: 检出 `ValueStateDescriptor`/`MapStateDescriptor` 但无 `StateTtlConfig`/`enableTimeToLive` → warn。
- **对应门禁**: fw_flink_state_ttl(warn)

```verify
id: flink-r8
cmd: 
expect: always
```

### 规律：KeyedState 不可跨 key 访问，keyBy 键选型决定状态分布
- **适用版本**: 全版本
- **规律**: KeyedState 作用域是当前 key；跨 key 聚合须用 window/ProcessAllWindowFunction/广播状态。`keyBy` 键基数过低（如按天）会导致数据倾斜、单 subtask 热点；键须高基数且均匀（如 userId/orderId）。
- **违反后果**: 数据倾斜 → 个别 TaskManager 打满 CPU/状态，反压传导全作业。
- **验证方法**: 人工检查 keyBy 键基数与倾斜监控（Web UI subtask 数据量对比）。
- **对应门禁**: 人工检查

```verify
id: flink-r9
cmd: 
expect: always
```

### 规律：DataStream vs Table API/SQL 选型须按场景，不可混用两套语义
- **适用版本**: 全版本
- **规律**: 标准 SQL 分析/CDC 入湖/维表 join 用 Table API/SQL（优化器、changelog 语义完善）；复杂事件处理/定制状态机/细粒度 timer 用 DataStream API。同一作业混用须明确转换边界（`toDataStream`/`toChangelogStream`），尤其回撤流（retract）语义转换易错。
- **违反后果**: retract 流语义错配 → 结果重复或反转；两套 API 各自配置 checkpoint 行为不一致。
- **验证方法**: 检出同一文件同时 `StreamTableEnvironment` 与大量 `.process(`/`KeyedProcessFunction` → warn 人工确认选型边界。
- **对应门禁**: fw_flink_api_choice(warn)

```verify
id: flink-r10
cmd: 
expect: always
```

### 规律：flink-cdc 断点续传依赖 checkpoint，3.x YAML pipeline 须配 checkpoint 间隔
- **适用版本**: Flink CDC 3.x（现行稳定 3.6）/ 2.x DataStream 版
- **规律**: Flink CDC 增量快照算法（incremental snapshot）的断点续传依赖 Flink checkpoint：作业失败后从最近 checkpoint 恢复 binlog/oplog 位点。未启用 checkpoint 时 CDC 源故障即从头全量重读。3.x YAML pipeline（`flink-cdc.yaml`）须在 `pipeline:` 段或 flink-conf 配 checkpoint 间隔；2.x `MySqlSource` 同上。
- **违反后果**: CDC 作业故障 → 全量重跑数小时，下游湖表重复摄入。
- **验证方法**: 检出 `MySqlSource`/`flink-cdc`/`FlinkSourceFunction` 但无 checkpoint 配置 → warn。
- **对应门禁**: fw_flink_cdc_checkpoint(warn)

```verify
id: flink-r11
cmd: 
expect: always
```

### 规律：生产必须显式配 RestartStrategy，默认行为不足
- **适用版本**: 1.20.x / 2.x（2.x 默认 restart 策略待验证）
- **规律**: 生产须显式配 `restart-strategy`（exponential-delay 或 failure-rate，如 `restart-strategy=failure-rate`、`max-failures-per-interval`）。无 checkpoint 时默认 NoRestartStrategy；有 checkpoint 时默认按 delay 无限重启（1.x 行为），频繁故障会陷入重启风暴压垮外部系统。须按故障预算收敛。
- **违反后果**: 无重启 → 一挂即停；无限重启 → 重启风暴打满 Kafka/DB。
- **验证方法**: 作业存在但无 `restart-strategy`/`RestartStrategy`/`setRestartStrategy` → warn。
- **对应门禁**: fw_flink_restart_strategy(warn)

```verify
id: flink-r12
cmd: 
expect: always
```

### 规律：并行度与 TaskManager slot 须显式规划，禁止依赖默认
- **适用版本**: 全版本
- **规律**: 并行度硬编码在代码里（`.setParallelism(1)`）会与集群 slot 脱节；应外置（`pipeline.parallelism` / 提交参数 `-p`）。`taskmanager.numberOfTaskSlots` 默认 1（每 TM 单 slot，待验证 2.x 是否仍默认 1）须按核数调整；并行度 > 总 slot 数作业直接起不来。
- **违反后果**: 扩缩容失效 / 资源浪费 / 作业无法调度。
- **验证方法**: 检出 `.setParallelism(` 硬编码数字 → warn 确认与 slot/扩缩容策略匹配。
- **对应门禁**: fw_flink_parallelism_slots(warn)

```verify
id: flink-r13
cmd: 
expect: always
```

### 规律：访问外部系统（HTTP/DB）须用 AsyncDataStream 异步 I/O，禁止算子内同步阻塞
- **适用版本**: 全版本
- **规律**: 在 `map`/`flatMap`/`process` 内同步调用 RestTemplate/HttpClient/JDBC 会阻塞 subtask 主线程，拖垮吞吐并传导反压。外部查询须用 `AsyncDataStream.unorderedWait(...)` + `RichAsyncFunction`，配超时与容量；或改维表 join（Table API lookup join）。
- **违反后果**: 吞吐断崖 / 反压雪崩 / checkpoint 超时。
- **验证方法**: 检出作业文件含 `RestTemplate`/`HttpClient`/`DriverManager`/`HttpUtil` 但无 `AsyncDataStream` → warn。
- **对应门禁**: fw_flink_async_io(warn)

```verify
id: flink-r14
cmd: 
expect: always
```

### 规律：反压定位须走标准路径（Web UI + Metrics），禁止盲目加资源
- **适用版本**: 全版本
- **规律**: 反压定位标准路径：Web UI BackPressure 页定位被压算子 → 其下游即瓶颈；结合 `busyTimeMsPerSecond`/`backPressuredTimeMsPerSecond`（1.13+ 指标）与 mailbox 耗时区分 GC/外部调用/数据倾斜。确认瓶颈前禁止盲目加并行度（倾斜时加并行度无效）。
- **违反后果**: 盲扩资源无效果且成本翻倍；真实瓶颈（倾斜/外部系统）被掩盖。
- **验证方法**: 人工检查（Web UI BackPressure 页 + busy/backPressured 指标截图存档）。
- **对应门禁**: 人工检查

```verify
id: flink-r15
cmd: 
expect: always
```

### 规律：CEP 模式必须配 within 时间约束，禁止无界模式
- **适用版本**: 全版本
- **规律**: `CEP.pattern(...)` 不配 `.within(Time...)` 时模式状态（NFA 缓存的部分匹配）永久驻留，等价于无 TTL 状态，最终 OOM。所有 CEP 模式必须配 within；长周期模式还须评估状态量。
- **违反后果**: NFA 状态无界增长 → OOM / checkpoint 超时。
- **验证方法**: 检出 `CEP.pattern` 但同文件无 `.within(` → warn。
- **对应门禁**: fw_flink_cep_within(warn)

```verify
id: flink-r16
cmd: 
expect: always
```

### 规律：JobManager 高可用：standalone 生产集群必须配 high-availability
- **适用版本**: 1.20.x / 2.x
- **规律**: standalone 部署下 JobManager 单点，挂掉全集群作业失控。生产必须 `high-availability: org.apache.flink.kubernetes.highavailability.KubernetesHaServicesFactory` 或 zookeeper HA + `high-availability.storageDir`。YARN/K8s session 模式由平台兜底，仍建议显式配。
- **违反后果**: JM 单点故障 → 全部作业中断且无自动恢复。
- **验证方法**: 检出 `flink-conf.yaml` 但无 `high-availability` 配置 → warn。
- **对应门禁**: fw_flink_jm_ha(warn)

```verify
id: flink-r17
cmd: 
expect: always
```

### 规律：Flink 2.x 升级：DataSet API 移除、SourceFunction/SinkFunction 旧接口弃用
- **适用版本**: 1.20.x → 2.x
- **规律**: Flink 2.0（2025-03-24 GA）为近十年首个大版本：DataSet API 移除、旧 `SourceFunction`/`SinkFunction` 接口弃用（迁移 FLIP-27 `Source` / FLIP-143 `Sink`），连接器大版本换轨（Kafka 4.x/JDBC 4.x 面向 2.x）。1.x→2.x 跨大版本升级 savepoint 兼容性须人工核对官方矩阵（upgrading 页兼容表仅覆盖 1.8–1.20，2.x 兼容矩阵待验证）。
- **违反后果**: 直接升 2.x 编译失败 / savepoint 不兼容冷启动丢状态。
- **验证方法**: 检出 `org.apache.flink.api.java.DataSet`/`implements SourceFunction`/`implements SinkFunction` → warn 提示 2.x 迁移。
- **对应门禁**: fw_flink_version_2x(warn)

```verify
id: flink-r18
cmd: 
expect: always
```

<!--
共 18 条规律（≥10 门槛）。16 条挂门禁 id，2 条挂人工检查（keyBy 倾斜、反压定位），无游离规律。
verify-framework-ruleset.sh 扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_flink_checkpoint_enabled | fail | 检出 DataStream 作业入口但无 enableCheckpointing/execution.checkpointing → fail 无容错 | FLINK_SRC_GLOBS | — |
| fw_flink_checkpoint_interval | warn | enableCheckpointing(N<60000) → warn 间隔过小拖吞吐 | FLINK_SRC_GLOBS | — |
| fw_flink_savepoint_uid | warn | 检出转换算子但无 .uid( → warn savepoint 不可映射 | FLINK_SRC_GLOBS | — |
| fw_flink_exactly_once_sink | warn | EXACTLY_ONCE + addSink(/SinkFunction → warn Sink 无事务 | FLINK_SRC_GLOBS | — |
| fw_flink_watermark | warn | EventTime 窗口无 WatermarkStrategy → warn 窗口不触发 | FLINK_SRC_GLOBS | — |
| fw_flink_allowed_lateness | warn | EventTime 窗口无 allowedLateness/sideOutputLateData → warn 迟到数据静默丢弃 | FLINK_SRC_GLOBS | — |
| fw_flink_state_backend | warn | KeyedState 使用但无 state.backend 配置 → warn 默认堆内大状态风险 | FLINK_SRC_GLOBS | — |
| fw_flink_state_ttl | warn | *StateDescriptor 无 StateTtlConfig → warn 状态无界增长 | FLINK_SRC_GLOBS | — |
| fw_flink_api_choice | warn | 同文件 StreamTableEnvironment + KeyedProcessFunction 混用 → warn 选型边界 | FLINK_SRC_GLOBS | — |
| fw_flink_cdc_checkpoint | warn | 检出 CDC 源但无 checkpoint 配置 → warn 断点续传失效 | FLINK_SRC_GLOBS | — |
| fw_flink_restart_strategy | warn | 作业无 restart-strategy/RestartStrategy → warn 默认不足 | FLINK_SRC_GLOBS | — |
| fw_flink_parallelism_slots | warn | .setParallelism( 硬编码 → warn 并行度与 slot 脱节 | FLINK_SRC_GLOBS | — |
| fw_flink_async_io | warn | 算子内同步 HTTP/JDBC 无 AsyncDataStream → warn 阻塞反压 | FLINK_SRC_GLOBS | — |
| fw_flink_cep_within | warn | CEP.pattern 无 .within( → warn NFA 状态无界 | FLINK_SRC_GLOBS | — |
| fw_flink_jm_ha | warn | flink-conf.yaml 无 high-availability → warn JM 单点 | FLINK_SRC_GLOBS | — |
| fw_flink_version_2x | warn | 检出 DataSet/SourceFunction/SinkFunction 旧 API → warn 2.x 迁移 | FLINK_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_flink_<rule>（rule 全小写下划线）。
本表 16 条 id 须在 assets/framework-gates/flink.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_flink_<rule>(level) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: flink  requires_conf: FLINK_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含无 checkpoint + 无 watermark + 无 restart strategy + 无 uid → fw_flink_checkpoint_enabled fail 主触发；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| flink × paimon | Flink 流读 Paimon 表须配 changelog-producer（lookup/full-compaction）才能拿到 changelog；CDC 摄入 Paimon 须 checkpoint 保断点续传 | 否则流读仅 latest 快照 / 故障全量重摄入 |
| flink × kafka | exactly-once 写 Kafka 须 KafkaSink + transactional.id 前缀 + checkpoint 联动 | 两阶段提交依赖 checkpoint 完成触发 commit |
| flink × flink-cdc | CDC 3.x YAML pipeline 与 2.x DataStream API 不可混用于同一 source；3.x 用 pipeline connector | 两套连接器架构不同（Pipeline vs Flink Sources） |
| flink × spring-boot | 禁止把 Flink 作业内嵌 Spring Boot 服务进程；JM/TM 独立部署 | 类加载冲突 + 生命周期不一致（官方不支持嵌 Web 容器） |

<!--
本表聚焦 flink 生态内高频组合；与 paimon/kafka 的交互为双向互补。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Flink 1.13 | 引入 busy/backPressured 时间指标；旧 backpressure 推断方式废弃 | 反压定位改用新指标 |
| Flink 1.15 | SourceFunction/SinkFunction 标记弃用（FLIP-27/FLIP-143 迁移窗口开启） | 旧接口告警，须规划迁移 |
| Flink 1.20 | LTS 线（现行 1.20.5，2026-06-03）；2.x 迁移前最后一版 | 待验证：1.20 弃用项在 2.0 的移除清单 |
| Flink 2.0（2025-03-24） | DataSet API 移除；连接器大版本换轨（Kafka 4.x/JDBC 4.x） | 升级须重写批作业 + 换连接器版本 |
| Flink 2.x | savepoint 兼容矩阵 1.x→2.x 待验证（upgrading 页表仅覆盖 1.8–1.20） | 跨大版本升级须人工核对矩阵，禁止裸升 |
| Flink CDC 3.x（现行 3.6） | YAML pipeline 架构独立于 DataStream 版；增量快照免锁切换 | 旧 2.x CDC DataStream 作业须评估迁移 |

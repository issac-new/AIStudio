---
ruleset_id: kafka
适用版本: Apache Kafka 4.x（4.3.x，2026-05 GA；KRaft 终态，ZooKeeper 已移除）/ spring-kafka 3.x/4.x（差异单独标注）
最后调研: 2026-07-17（来源：https://endoflife.date/kafka ；https://kafka.apache.org/downloads ；https://kafka.apache.org/documentation/ ；https://kafka.apache.org/40/documentation.html ；https://docs.spring.io/spring-kafka/reference/ ）
深度门槛: 10
---

# Kafka 规则集

<!--
本规则集覆盖 Apache Kafka 4.x（现行 4.3.1，2026-06-23 发布；4.0 起 KRaft 唯一模式，ZooKeeper 彻底移除；
KIP-848 新一代消费者组再均衡协议 4.0 GA）与 spring-kafka 3.x（Boot 3.x）/ 4.x（Boot 4.x，待验证 GA 时点）。
调研时点：2026-07-17。kafka.apache.org/downloads 页面调研时点抓取失败，版本号以 endoflife.date/kafka 交叉核实。
无法确认的点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.kafka:kafka-clients` / `org.springframework.kafka:spring-kafka` / `spring-kafka-test` / `io.confluent:kafka-avro-serializer` | 高 |
| 注解 | `@KafkaListener` / `@RetryableTopic` / `@KafkaHandler` / `@DltHandler` | 高 |
| 配置 | `spring.kafka.*` / `bootstrap.servers` / `bootstrap-servers` / `group.id` / `enable.auto.commit` | 高 |
| 代码 | `KafkaTemplate` / `ProducerRecord` / `KafkaProducer` / `KafkaConsumer` / `ConsumerFactory` / `DeadLetterPublishingRecoverer` | 高 |
| 文件 | `**/docker-compose*.yml` 含 `kafka:` / `**/schema-registry*.yml` | 中（需排除仅部署描述） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 kafka 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 消费者监听器：`grep -rlE '@KafkaListener\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @KafkaListener 的 .java 文件数）
- 生产者发送点：`grep -rnE 'KafkaTemplate|new ProducerRecord|KafkaProducer' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：生产者文件数）
- 死信恢复器：`grep -rnE 'DeadLetterPublishingRecoverer|@RetryableTopic|@DltHandler|DefaultErrorHandler' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：DLT 配置行数）
- 事务生产者：`grep -rnE 'transactional.id|transactional-id|TRANSACTIONAL_ID_CONFIG|transactionalIdPrefix' "${PROJECT_DIR}"`（计数核验基准：事务配置行数）
- 消费配置：`grep -rnE 'enable.auto.commit|enable-auto-commit|ENABLE_AUTO_COMMIT_CONFIG|group.id|group-id' "${PROJECT_DIR}"`（计数核验基准：消费配置行数）
- 分区/再均衡策略：`grep -rnE 'partition.assignment.strategy|partition-assignment-strategy|PartitionAssignor' "${PROJECT_DIR}"`（计数核验基准：策略配置行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：enable.auto.commit=true 与业务处理组合即消息丢失，offset 提交语义须与业务匹配
- **适用版本**: Kafka 全版本 / spring-kafka 全版本
- **规律**: `enable.auto.commit=true` 时消费者按 `auto.commit.interval.ms`（默认 5s）周期提交最大已拉取 offset——与业务处理进度完全脱钩：消息已 poll 但业务尚未处理/处理失败时宕机，offset 已提交 → 重启后从下一批开始，**消息永久丢失**。生产必须 `enable.auto.commit=false` + 业务成功后提交（spring-kafka 容器 AckMode：RECORD/BATCH/MANUAL；spring-kafka 2.3+ 容器默认关闭 auto.commit 并代为提交，待验证 4.x 默认行为微调）。手动提交也不免除业务幂等义务（见下条）。
- **违反后果**: 消费失败消息静默丢失，且无重投（区别于 RocketMQ 重试语义）→ 资金/订单断链。
- **验证方法**: 配置检出 `enable-auto-commit: true` / `enable.auto.commit=true` / Java `ENABLE_AUTO_COMMIT_CONFIG, "true"` → fail。
- **对应门禁**: fw_kafka_offset_semantics(fail)

```verify
id: kafka-r1
cmd: 
expect: always
```

### 规律：acks=0 消防水管语义必丢数据，可靠性按 acks 分级选型
- **适用版本**: Kafka 全版本
- **规律**: `acks=0`：生产者发出即忘，任何 broker 抖动/leader 选举即丢数据，且与幂等生产者（`enable.idempotence=true` 要求 acks=all）直接冲突，4.x 客户端会拒绝该组合；`acks=1`：仅 leader 落盘，leader 宕机未同步副本 → 丢；`acks=all`（= -1）+ `min.insync.replicas≥2`：ISR 多数派落盘，金融级。选型：日志埋点可 acks=1（待验证：可接受丢失率须业务确认），业务消息必须 acks=all。
- **违反后果**: acks=0/1 + broker 故障 → 已"发送成功"的消息批量丢失。
- **验证方法**: 检出 `acks: 0` / `acks=0` / `ACKS_CONFIG, "0"` → fail；检出 `acks: 1` / `acks=1` → warn 人工确认可丢失。
- **对应门禁**: fw_kafka_acks(fail)

```verify
id: kafka-r2
cmd: 
expect: always
```

### 规律：消费端必须幂等——at-least-once 下 rebalance/重提交必然重复
- **适用版本**: Kafka 全版本 / spring-kafka 全版本
- **规律**: 即使 enable.auto.commit=false，消费成功但提交前宕机、rebalance 触发分区重分配、手动提交失败重试，都会重复投递。消费端须幂等：业务唯一键去重（Redis SETNX / DB 唯一键），或 offset 与业务写同事务（Kafka 事务 consume-transform-produce 场景）。exactly-once 仅覆盖 Kafka 内部链路，业务副作用仍需自身幂等。
- **违反后果**: 重复消费 → 重复扣款 / 重复通知 / 统计翻倍。
- **验证方法**: 检出 `@KafkaListener` 文件内无幂等痕迹（`幂等|idempot|dedup|去重|setIfAbsent|setnx|ON DUPLICATE|insertIgnore|uk_`）→ warn（spring-kafka 手动提交降低丢失窗口但不去重，故 warn 级）。
- **对应门禁**: fw_kafka_idempotent_consumer(warn)

```verify
id: kafka-r3
cmd: 
expect: always
```

### 规律：消费者并发数须 ≤ 分区数，超出部分永远空转
- **适用版本**: Kafka 全版本 / spring-kafka 全版本
- **规律**: 同消费者组内，一个分区同一时刻只分配给一个消费者。`@KafkaListener(concurrency = "N")`（spring-kafka 并发=容器内线程数，组内总消费者数 = 实例数×concurrency）超过分区数时，超额线程分不到分区永远空转，且 rebalance 时加剧抖动。扩容消费能力的上限 = 分区数；须更高吞吐先扩分区（扩分区不影响已有 key 顺序以外的语义，但不可缩分区）。
- **违反后果**: 盲目加线程/加实例无提速效果，资源浪费 + rebalance 频繁。
- **验证方法**: 检出 `@KafkaListener` 但全项目无 `concurrency` 显式配置 → warn 人工核对"组内总消费者数 ≤ 分区数"。
- **对应门禁**: fw_kafka_consumer_le_partitions(warn)

```verify
id: kafka-r4
cmd: 
expect: always
```

### 规律：幂等生产者 4.x 默认开启，显式关闭须书面理由
- **适用版本**: Kafka ≥3.0 默认 `enable.idempotence=true`（4.x 维持，待验证 4.x 是否有默认行为微调）
- **规律**: 幂等生产者（PID + sequence number）消除重试导致的单分区重复与乱序，Kafka 3.0 起默认 true。显式配置 `enable.idempotence=false` 会回退到"重试即可能重复"的旧语义——仅在兼容古董 broker（<0.11）时才允许。开启幂等后 `retries` 默认 Integer.MAX_VALUE、`acks=all` 被强制，不可再配 acks=0/1。
- **违反后果**: 显式关幂等 + 网络抖动重试 → 单分区内消息重复。
- **验证方法**: 检出 `enable-idempotence: false` / `enable.idempotence=false` / `ENABLE_IDEMPOTENCE_CONFIG, "false"` → warn。
- **对应门禁**: fw_kafka_idempotent_producer(warn)

```verify
id: kafka-r5
cmd: 
expect: always
```

### 规律：跨分区原子写须事务生产者，消费端须 read_committed 配对
- **适用版本**: Kafka ≥0.11 / spring-kafka 全版本
- **规律**: 一次写多个分区/topic 须原子（要么全成要么全败）时，用事务生产者：`transactional.id`（必须唯一且稳定，重启后同 id 恢复未完成事务）+ `initTransactions/beginTransaction/commitTransaction`。消费端不配 `isolation.level=read_committed`（默认 read_uncommitted）会读到未提交/已中止事务的消息——**只配生产者不配消费者 = 白搭**。consume-transform-produce 链路用 `sendOffsetsToTransaction` 把消费位点绑入同一事务。
- **违反后果**: 消费者读到中止事务消息 → 幽灵数据；transactional.id 冲突 → 生产者互踢（ProducerFencedException）。
- **验证方法**: 检出 `transactional.id|transactional-id|TRANSACTIONAL_ID_CONFIG` 但无 `read_committed|READ_COMMITTED|isolation-level|isolation.level` → warn。
- **对应门禁**: fw_kafka_transactional_producer(warn)

```verify
id: kafka-r6
cmd: 
expect: always
```

### 规律：rebalance 协议选型——cooperative 增量再均衡，4.x 新版消费者协议
- **适用版本**: Kafka ≥2.4（CooperativeStickyAssignor）/ 4.x（KIP-848 服务端再均衡协议 GA）
- **规律**: 旧 eager 协议（RangeAssignor/StickyAssignor）rebalance = stop-the-world：全组停消费、全部位点重分配。`CooperativeStickyAssignor` 增量再均衡：仅迁移变动分区，其余分区持续消费。Kafka 4.0 GA KIP-848 新一代消费者组协议（broker 端协调，consumer 配置 `group.protocol=consumer`），rebalance 不再全局停摆（4.x 默认行为待验证：新协议是否默认开启按 broker/客户端版本组合核对）。显式配置 RangeAssignor 属于回退行为，须理由。
- **违反后果**: eager rebalance 期间消费停顿数秒~数十秒，触发雪崩式积压。
- **验证方法**: 检出 `RangeAssignor`（显式回退 eager）→ warn；检出 `CooperativeSticky` → pass。
- **对应门禁**: fw_kafka_rebalance_cooperative(warn)

```verify
id: kafka-r7
cmd: 
expect: always
```

### 规律：分区器须保持同 key 同分区，RoundRobin 破坏键序
- **适用版本**: Kafka 全版本
- **规律**: 默认分区器：有 key → murmur2(key) % 分区数（同 key 恒同分区，保分区内有序）；无 key → sticky 批量轮询。显式配置 `RoundRobinPartitioner`/`UniformStickyPartitioner` 会把同 key 消息打散到多分区，消费端无法保证同业务键顺序（如订单状态机乱序）。自定义分区器必须保持"同 key → 同分区"不变式。
- **违反后果**: 同订单事件被并发消费乱序处理 → 状态回退（已支付被已创建覆盖）。
- **验证方法**: 检出 `RoundRobinPartitioner|UniformStickyPartitioner|round.robin` → warn。
- **对应门禁**: fw_kafka_partitioner(warn)

```verify
id: kafka-r8
cmd: 
expect: always
```

### 规律：消费失败须配死信（DLT），禁止无限重试阻塞分区
- **适用版本**: spring-kafka ≥2.7（@RetryableTopic）/ 全版本
- **规律**: 消费抛异常默认容器无限重试（spring-kafka 2.x 前）或按 SeekToCurrentErrorHandler 重试 9 次后日志丢弃（行为随版本演进，待验证 4.x 默认）。生产必须显式：`DefaultErrorHandler` + `DeadLetterPublishingRecoverer`（失败消息发 `<topic>.DLT`），或声明式 `@RetryableTopic` + `@DltHandler`。DLT 消息须监控 + 人工/定时兜底。毒丸消息不配 DLT → 分区被永久阻塞，lag 无限增长。
- **违反后果**: 单条毒丸消息卡死整个分区；或静默丢弃无人知晓。
- **验证方法**: 检出 `@KafkaListener` 但无 `DeadLetterPublishingRecoverer|@RetryableTopic|@DltHandler|DefaultErrorHandler` → warn。
- **对应门禁**: fw_kafka_dlq(warn)

```verify
id: kafka-r9
cmd: 
expect: always
```

### 规律：consumer lag 必须监控告警，积压是 Kafka 消费的第一故障信号
- **适用版本**: Kafka 全版本 / spring-kafka 全版本
- **规律**: Kafka 无 broker 内建"堆积告警"，消费滞后量（lag = log-end-offset − committed-offset）须外部监控：Micrometer（spring-kafka 监听器容器内建 `spring.kafka.listener.micrometer-enabled`）/ kafka_exporter / Burrow / AdminClient API 自采。lag 持续上升 = 消费速率 < 生产速率，须扩分区/扩消费者/优化处理耗时；lag 突降但业务未消费 = offset 被误提交（配合 offset_semantics 规律）。
- **违反后果**: 积压数小时无感知，业务延迟失控后才发现。
- **验证方法**: 检出 Kafka 使用但无 `micrometer|MeterRegistry|kafka_exporter|burrow|adminClient` → warn。
- **对应门禁**: fw_kafka_lag_monitor(warn)

```verify
id: kafka-r10
cmd: 
expect: always
```

### 规律：消息顺序仅单分区内成立，顺序敏感业务必须带 key
- **适用版本**: Kafka 全版本
- **规律**: Kafka 只保证**分区内**有序。无 key 消息（`new ProducerRecord<>(topic, value)` 两参构造）按 sticky 轮询散布多分区，全局无序；顺序敏感业务（订单、账户流水）必须 `new ProducerRecord<>(topic, key, value)` 以业务键为 key（同键恒同分区）。跨分区全局顺序只有"单分区 topic"一条路，吞吐被单分区锁死，仅适用极低 TPS 场景。
- **违反后果**: 无 key 发送 + 多分区 → 同实体事件乱序消费 → 状态机错乱。
- **验证方法**: 检出 `ProducerRecord` 两参构造（topic, value 无 key）→ warn。
- **对应门禁**: fw_kafka_order_partition(warn)

```verify
id: kafka-r11
cmd: 
expect: always
```

### 规律：消息格式演进须 Schema Registry 约束，裸 JSON 演进必炸消费端
- **适用版本**: Kafka 全版本 / Confluent Schema Registry / Apicurio
- **规律**: Kafka 不约束 payload 格式。裸 JSON/String 序列化下，生产者随意改字段（删字段、改类型）→ 老消费者反序列化爆炸或静默丢字段。生产须 Schema Registry（Avro/Protobuf/JSON Schema）+ 兼容性策略（BACKWARD 默认，消费者先升级；FORWARD/FULL 按发布顺序选型），序列化器用 `KafkaAvroSerializer`/`KafkaProtobufSerializer` + `schema.registry.url`。StringSerializer 裸 JSON 仅限内部低风险 topic。
- **违反后果**: 生产者改 schema 无校验 → 全量消费者反序列化异常，分区阻塞。
- **验证方法**: 检出 `StringSerializer|StringDeserializer` 且无 `schema.registry|schema-registry|SchemaRegistryClient|KafkaAvroSerializer|SpecificRecord` → warn。
- **对应门禁**: fw_kafka_schema_registry(warn)

```verify
id: kafka-r12
cmd: 
expect: always
```

### 规律：消费组命名与复用规范——同组不同订阅即错乱
- **适用版本**: Kafka 全版本 / spring-kafka 全版本
- **规律**: 同 group.id 内所有实例/线程共享订阅与位点：同一 group.id 下不同 @KafkaListener 订阅不同 topic 是合法的（Kafka 组订阅是并集），但**不同业务复用同一 group.id** 会导致 rebalance 联动（一个 listener 抖动全组重平衡）与位点管理混乱。规范：group.id 按"业务域.用途.环境"命名，一 listener 一组；静态成员资格（`group.instance.id`）减少滚动发布 rebalance（KIP-345）。
- **违反后果**: 无关业务 listener 互相触发 rebalance 停摆；位点误提交串业务。
- **验证方法**: 多个 @KafkaListener 检出相同 groupId 且 topic 不同 → warn 人工确认复用合理性。
- **对应门禁**: fw_kafka_group_mgmt(warn)

```verify
id: kafka-r13
cmd: 
expect: always
```

### 规律：topic 名是双边字符串，生产/消费两侧配对须核对（横向清剿轮）
- **适用版本**: Kafka 全版本 / spring-kafka 全版本
- **规律**: producer 的 `send("X")` 与 consumer 的 `@KafkaListener(topics = "X")` 是两处互不知晓的字符串——改一边（或 typo）编译通过、启动正常，消息静默流入黑洞或消费者空等。本服务内双边字面量配对完整是最低保障；单边 topic（外部系统生产/消费）须在 §5 消息拓扑配对表显式登记。
- **违反后果**: 消息静默断链：无消费积压告警（没人监听）、无错误日志，业务数据丢失靠对账才发现。
- **验证方法**: 机械提取生产侧字面量（.send("X")/new ProducerRecord("X")）与消费侧字面量（@KafkaListener topics）双向 diff，单边悬挂即 warn 人工核对（常量引用提不出字面量自然跳过）。
- **对应门禁**: fw_kafka_topic_pair(warn)

```verify
id: kafka-r14
cmd: 
expect: always
```

<!--
共 14 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_kafka_offset_semantics | fail | 检出 enable-auto-commit/enable.auto.commit=true（yml/properties/Java Config）→ fail 消息丢失 | KAFKA_SRC_GLOBS | —（提交语义契约，消息丢失无对应 CWE 弱点类） |
| fw_kafka_acks | fail | 检出 acks=0/acks: 0 → fail；acks=1 → warn 确认可丢失 | KAFKA_SRC_GLOBS | —（持久性契约） |
| fw_kafka_idempotent_consumer | warn | @KafkaListener 文件无幂等痕迹 → warn | KAFKA_SRC_GLOBS | —（幂等契约） |
| fw_kafka_consumer_le_partitions | warn | @KafkaListener 无 concurrency 显式配置 → warn 核对消费者数≤分区数 | KAFKA_SRC_GLOBS | —（容量核对） |
| fw_kafka_idempotent_producer | warn | enable-idempotence=false 显式关闭 → warn | KAFKA_SRC_GLOBS | —（重试语义） |
| fw_kafka_transactional_producer | warn | transactional.id 存在但无 read_committed 配对 → warn | KAFKA_SRC_GLOBS | —（读已提交配对） |
| fw_kafka_rebalance_cooperative | warn | 显式 RangeAssignor → warn 回退 eager；CooperativeSticky → pass | KAFKA_SRC_GLOBS | —（协议选型） |
| fw_kafka_partitioner | warn | RoundRobinPartitioner/UniformStickyPartitioner → warn 键序破坏 | KAFKA_SRC_GLOBS | —（键序契约） |
| fw_kafka_dlq | warn | @KafkaListener 无 DLT/DefaultErrorHandler → warn | KAFKA_SRC_GLOBS | CWE-755（毒丸消息异常无处置通道） |
| fw_kafka_lag_monitor | warn | Kafka 使用但无 micrometer/MeterRegistry/exporter → warn | KAFKA_SRC_GLOBS | CWE-778（积压无监控=故障信号无记录） |
| fw_kafka_order_partition | warn | ProducerRecord 两参构造（无 key）→ warn 乱序风险 | KAFKA_SRC_GLOBS | —（顺序契约） |
| fw_kafka_schema_registry | warn | StringSerializer 且无 schema registry 痕迹 → warn | KAFKA_SRC_GLOBS | —（演进约束） |
| fw_kafka_group_mgmt | warn | 多 listener 同 groupId 不同 topic → warn | KAFKA_SRC_GLOBS | —（订阅管理） |
| fw_kafka_topic_pair | warn | 生产/消费 topic 字面量双向 diff，单边悬挂即 warn | KAFKA_SRC_GLOBS | —（拓扑配对一致性） |

<!--
门禁 id 命名规范：fw_kafka_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/kafka.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_kafka_<rule>(fail|warn) ...` 与本表 id 集合一致。
fixture 验证覆盖：violating 含 @KafkaListener 无幂等 + enable-auto-commit=true + acks=0
  → offset_semantics / acks 双 fail 主触发（expected-fail-ids 2/2 已登记）；compliant 修正（手动提交 + acks=all + 幂等 + DLT + schema registry）全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| kafka × spring-boot | spring-kafka 版本与 Boot 对齐（3.x ↔ Boot 3.x；4.x ↔ Boot 4.x 待验证矩阵） | kafka-clients 版本由 Boot BOM 管理，错配 NoSuchMethodError |
| kafka × flink | Flink Kafka source 须开 checkpoint + 两阶段提交 sink 才达 exactly-once；隔离级别 read_committed | 否则 failover 重复消费/读到中止事务 |
| kafka × mybatis | 消费幂等落库用 DB 唯一键兜底，offset 与业务写不可跨系统事务 | Kafka 与 RDBMS 无 XA，幂等只能最终一致 |
| kafka × jackson | JsonSerializer 演进须与 Schema Registry 策略一致；@JsonIgnoreProperties(ignoreUnknown) 兜底 | 新增字段反序列化炸老消费者 |
| kafka × celery | celery 以 kafka 为 broker 时须显式 acks=all + 消费幂等，任务侧配 time_limit 防堆积 | kafka acks 可丢失时 celery 任务无时间上限易资源耗尽（见 P1-2 编排加严） |
| kafka × redis | 用 Redis 作去重/幂等缓存须带 TTL 且与 offset 提交时序一致 | Redis 键无过期致去重窗口膨胀，与 Kafka 位点错配丢幂等防护 |
| kafka × seata | 消费落库与 Seata AT 不可混用同一业务写路径，须二选一或 TCC 编排 | 两套分布式事务协议叠加致重复消费与双写不一致 |

<!--
本表聚焦 kafka 生态内高频组合；无强交互的组合不列。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Kafka 3.0 | enable.idempotence 默认 true；KRaft 预览 | 老代码显式 acks=1 与默认幂等冲突须显式化 |
| Kafka 3.3-3.9 | KRaft 生产可用逐步成熟；ZooKeeper 标记废弃 | 新部署一律 KRaft |
| Kafka 4.0 | ZooKeeper 彻底移除（KRaft 唯一）；KIP-848 新消费者组协议 GA；旧客户端 API 移除（KafkaConsumer 旧构造等，待验证清单） | ZK 架构集群须迁移；consumer 默认协议行为按 broker/client 版本核对 |
| Kafka 4.x | Java 17 基线（broker/client 均须，待验证） | 老 Java 8/11 服务升级客户端须同步升 JDK |
| spring-kafka 3.x | Boot 3.x / jakarta 命名空间；micrometer 观测内建 | javax→jakarta 迁移 |
| spring-kafka 4.x | Boot 4.x 配套（GA 时点对齐待验证） | 待验证：默认 AckMode / auto.commit 行为微调须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

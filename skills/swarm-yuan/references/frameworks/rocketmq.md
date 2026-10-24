---
ruleset_id: rocketmq
适用版本: Apache RocketMQ 5.x（5.5.0，2026-04 GA）/ rocketmq-spring 2.3.x（4.x 差异单独标注）
最后调研: 2026-07-17（来源：https://rocketmq.apache.org/download/ ；https://rocketmq.apache.org/docs/ ；https://rocketmq.apache.org/docs/featureBehavior/03transactionmessage/ ；https://github.com/apache/rocketmq-spring ）
深度门槛: 10
---

# RocketMQ 规则集

<!--
本规则集覆盖 Apache RocketMQ 5.x（现行 5.5.0，2026-04-10 发布；5.x 为 proxy/remoting 双模式终态架构）
与 rocketmq-spring-boot-starter 2.3.x（现行 2.3.4，2025-07 发布）。调研时点：2026-07-17。
4.x（4.9.x 维护线）与 5.x 差异：5.x 定时消息支持任意时长（4.x 仅 18 个固定 level）；
5.x POP 消费模式新增；gRPC 客户端与 remoting 客户端并存。无法确认的点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.rocketmq:rocketmq-spring-boot-starter` / `rocketmq-client` / `rocketmq-client-java` | 高 |
| 注解 | `@RocketMQMessageListener` / `@RocketMQTransactionListener` / `@MessageModel` | 高 |
| 配置 | `rocketmq.name-server` / `rocketmq.producer.*` / `rocketmq.consumer.*` | 高 |
| 代码 | `RocketMQTemplate` / `DefaultMQProducer` / `DefaultMQPushConsumer` / `TransactionListener` / `MessageListenerOrderly` | 高 |
| 文件 | `**/rocketmq*.yml` / `**/rocketmq*.properties` | 中（需排除仅文件名巧合） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 rocketmq 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 消费者监听器：`grep -rlE '@RocketMQMessageListener\b|MessageListenerConcurrently|MessageListenerOrderly' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：监听器 .java 文件数）
- 事务监听器：`grep -rlE 'TransactionListener|@RocketMQTransactionListener|executeLocalTransaction' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：事务监听器文件数）
- 生产者模板：`grep -rlE 'RocketMQTemplate|DefaultMQProducer' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：生产者文件数）
- 顺序消息发送：`grep -rnE 'sendOrderly|MessageQueueSelector' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：顺序发送调用行数）
- 延迟消息发送：`grep -rnE 'setDelayTimeLevel|messageDelayLevel|withDelayTimeLevel|setDeliverTimeMs|DELAY' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：延迟发送行数）
- 批量消息发送：`grep -rnE 'sendBatch|send\([^)]*Collection|send\([^)]*List' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：批量发送行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：消费端必须幂等——at-least-once 语义下重复投递必然发生
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: RocketMQ 消费语义为 at-least-once：消费成功但 ACK 丢失、broker 主从切换、消费组 rebalance 都会导致同一消息重复投递。消费端必须以业务唯一键（msgKey / `MessageExt.getKeys()` / 订单号）做幂等去重：Redis `SETNX`（带 TTL）或 DB 唯一键冲突捕获。不允许"假设消息只到一次"直接写库。
- **违反后果**: 重复消费 → 重复扣款 / 重复发货 / 库存超扣（资金类故障）。
- **验证方法**: 检出 `@RocketMQMessageListener` 的 .java 文件内无幂等痕迹（`幂等|idempot|dedup|去重|setIfAbsent|setnx|SETNX|ON DUPLICATE|insertIgnore|uk_|unique`）→ fail。
- **对应门禁**: fw_rocketmq_idempotent_consumer(fail)

```verify
id: rocketmq-r1
cmd: 
expect: always
```

### 规律：顺序消息消费端必须用 ORDERLY 监听，并发监听破坏顺序语义
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 生产端 `sendOrderly(..., MessageQueueSelector, shardingKey)` 把同 shardingKey 消息路由到同一队列；消费端必须用 `MessageListenerOrderly`（或 rocketmq-spring `@RocketMQMessageListener(consumeMode = ConsumeMode.ORDERLY)`）单线程串行拉取该队列。若消费端用并发监听（`CONCURRENTLY`，rocketmq-spring 默认值），同队列消息被多线程并发处理，顺序语义被破坏。
- **违反后果**: 订单状态机乱序（"已支付"被"已创建"覆盖）→ 数据错乱。
- **验证方法**: 检出 `sendOrderly` / `MessageQueueSelector`（生产端顺序发送）但消费端文件无 `ORDERLY` / `MessageListenerOrderly` → fail。
- **对应门禁**: fw_rocketmq_orderly_listener(fail)

```verify
id: rocketmq-r2
cmd: 
expect: always
```

### 规律：事务消息必须实现 checkLocalTransaction 回查，半消息不可悬挂
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 事务消息两阶段：先发 half 消息（对消费者不可见），执行本地事务后 commit/rollback。若 commit/rollback 响应丢失，broker 会定时回查 `TransactionListener.checkLocalTransaction`（rocketmq-spring 为 `@RocketMQTransactionListener` 注解类）。未实现回查 → half 消息悬挂，broker 反复回查直至默认回查次数耗尽丢弃（4.x 默认回查 15 次，5.x 待验证），本地事务与消息状态永久不一致。
- **违反后果**: 本地事务已提交但消息被丢弃 → 下游永远收不到（分布式事务断链）。
- **验证方法**: 检出 `TransactionListener` / `executeLocalTransaction` / `sendMessageInTransaction` 但全项目无 `checkLocalTransaction` → fail。
- **对应门禁**: fw_rocketmq_tx_checkback(fail)

```verify
id: rocketmq-r3
cmd: 
expect: always
```

### 规律：消费失败重试次数须显式收敛，死信队列（DLQ）须有人工兜底
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 并发消费默认最大重试 16 次（4.x 默认 `maxReconsumeTimes=16`，重试间隔阶梯递增），耗尽后消息进 `%DLQ%<consumerGroup>` 死信队列。rocketmq-spring 用 `@RocketMQMessageListener(maxReconsumeTimes = N)` 显式配置；顺序消费默认重试 Integer.MAX_VALUE（会一直重试，须业务内熔断）。DLQ 消息不会自动消费，必须配监控告警 + 人工/定时任务兜底处理，否则失败消息静默沉淀。
- **违反后果**: 默认 16 次重试对不可恢复错误无意义（白白阻塞）；DLQ 无监控 → 失败消息无人知晓。
- **验证方法**: 检出 `@RocketMQMessageListener` 但无 `maxReconsumeTimes` / `max-reconsume-times` → warn；项目无 `%DLQ%` / DLQ 处理 → 合入同一 warn 提示。
- **对应门禁**: fw_rocketmq_retry_dlq(warn)

```verify
id: rocketmq-r4
cmd: 
expect: always
```

### 规律：消费速率必须 ≥ 生产速率，消费并发度须显式配置防堆积
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 消息堆积根因 = 消费速率 < 生产速率。消费端并发度由 `consumeThreadMin/consumeThreadMax`（原生客户端，默认各 20）或 rocketmq-spring `consumeThreadNumber`/`consumeThreadMax`（待验证：2.3.x 注解属性名随版本变化）控制。生产环境须按业务量显式配置消费线程数与批量消费条数（`consumeMessageBatchMaxSize`，默认 1），并监控堆积量（`mqadmin consumerProgress` / Dashboard）。批量消费可显著提速但失败整批重投，幂等前置。
- **违反后果**: 大促流量洪峰时消费线程不足 → 消息堆积数小时 → 业务延迟不可接受。
- **验证方法**: 检出 `@RocketMQMessageListener` 但无 `consumeThread` / `consumeMessageBatchMaxSize` → warn。
- **对应门禁**: fw_rocketmq_backlog(warn)

```verify
id: rocketmq-r5
cmd: 
expect: always
```

### 规律：延迟消息必须用 broker 定时能力，禁止客户端 sleep / 轮询模拟
- **适用版本**: RocketMQ 4.x（18 个固定 level：1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h）/ 5.x（任意时长定时消息）
- **规律**: 4.x 延迟消息仅支持 18 个固定延迟级别（`message.setDelayTimeLevel(n)`）；5.x 支持任意时点定时消息（`setDeliverTimeMs` / 时间戳）。禁止在消费者侧 `Thread.sleep` 或定时任务轮询 DB 模拟延迟——阻塞消费线程导致堆积。延迟量级超 2h（4.x 上限）须升 5.x 或改用任务调度（xxl-job）+ 消息。
- **违反后果**: sleep 阻塞消费线程 → 消费并发度归零 → 全线消息堆积。
- **验证方法**: 含 RocketMQ 生产/消费代码的文件检出 `Thread.sleep` → warn；检出 `setDelayTimeLevel|setDeliverTimeMs|DELAY` → pass。
- **对应门禁**: fw_rocketmq_delay(warn)

```verify
id: rocketmq-r6
cmd: 
expect: always
```

### 规律：批量消息须同 topic 且 ≤ 4MiB，失败须降级单发
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: `producer.send(Collection<Message>)` 批量发送约束：同 topic、同 waitStoreMsgOK、不支持延迟/事务消息、总大小 ≤ 4MiB（默认 maxMessageSize=4MB，5.x 待验证是否调整）。超限须自行切分批次。批量发送失败时整批失败，须降级逐条单发以定位毒丸消息。
- **违反后果**: 批量超限直接 `MQClientException`；整批失败重投放大流量。
- **验证方法**: 检出 `sendBatch` / `send(` 接 Collection/List 参数 → warn 人工确认批次大小切分与降级单发逻辑。
- **对应门禁**: fw_rocketmq_batch(warn)

```verify
id: rocketmq-r7
cmd: 
expect: always
```

### 规律：SQL92 过滤须 broker 端开启 enablePropertyFilter，tag 过滤优先
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 过滤两档：tag（简单字符串匹配，broker 端 hash 过滤，性能高）与 SQL92（`MessageSelector.bySql`，按消息属性过滤，须 broker 配置 `enablePropertyFilter=true`，默认 false）。SQL92 过滤要求消息 `putUserProperties` 写入可过滤属性。能用 tag 就不用 SQL92（SQL92 在 broker 端逐条表达式求值，大流量下 CPU 开销显著）。
- **违反后果**: broker 未开 enablePropertyFilter → 订阅 SQL92 的消费者抛异常 / 收不到消息。
- **验证方法**: 检出 `MessageSelector.bySql|SelectorType.SQL92|bySql` → warn 确认 broker enablePropertyFilter=true 且已评估 CPU 开销。
- **对应门禁**: fw_rocketmq_filter(warn)

```verify
id: rocketmq-r8
cmd: 
expect: always
```

### 规律：广播模式无重试与堆积兜底，非必要勿用
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: `MessageModel.BROADCASTING`（广播）：同一条消息投递到消费组内每个实例，消费进度按客户端本地维护，广播模式失败不重试（4.x 行为，5.x 待验证），实例重启后从最新位点开始（历史消息不补投）。默认 `CLUSTERING`（集群）：组内负载均衡，每条消息仅一个实例消费。广播仅适用于本地缓存刷新等可丢失场景；业务消息用广播 → 单实例重启期间消息永久丢失。
- **违反后果**: 广播 + 实例重启 → 该实例错过窗口内全部消息；误用广播做业务消费 → 重复处理全组实例。
- **验证方法**: 检出 `BROADCASTING|MessageModel.BROADCASTING|broadcasting` → warn 确认场景可丢失。
- **对应门禁**: fw_rocketmq_broadcast(warn)

```verify
id: rocketmq-r9
cmd: 
expect: always
```

### 规律：顺序消息区分全局顺序与分区顺序，全局顺序吞吐极差
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 全局顺序 = topic 只建 1 个队列 + 单消费者线程，吞吐被单队列物理上限锁死（数千 TPS 量级，待验证具体值），仅适用严格全局时序场景（如 binlog 同步）。业务顺序几乎都是"同一业务键有序"（如同一订单的消息有序）= 分区顺序：`sendOrderly` 以 shardingKey（订单号）哈希选队列，同键落同队列 + 消费端 ORDERLY 串行。选型错误用全局顺序 → 大促直接打爆。
- **违反后果**: 全局顺序 topic 在大流量下成为单点瓶颈，全链路延迟飙升。
- **验证方法**: 检出 `sendOrderly` → warn 人工确认走分区顺序（shardingKey 哈希）而非全局单队列。
- **对应门禁**: fw_rocketmq_order_scope(warn)

```verify
id: rocketmq-r10
cmd: 
expect: always
```

### 规律：生产环境须开启消息轨迹，否则问题定位靠猜
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 消息轨迹（msgTrace）记录消息从生产→存储→消费全链路耗时与状态。客户端开启：生产者 `enableMsgTrace=true`（rocketmq-spring `rocketmq.producer.enable-msg-trace=true`）、消费者同理（`rocketmq.consumer.enable-msg-trace=true`）。轨迹数据写入 `RMQ_SYS_TRACE_TOPIC`（可自定义轨迹 topic 避免争抢）。不开轨迹，"消息丢了/慢了"类故障只能靠 broker 日志人肉关联 msgId。
- **违反后果**: 线上消息链路故障无法定位，MTTR 数小时级。
- **验证方法**: 检出 RocketMQ 使用（producer/listener）但配置无 `enableMsgTrace|enable-msg-trace` → warn。
- **对应门禁**: fw_rocketmq_trace(warn)

```verify
id: rocketmq-r11
cmd: 
expect: always
```

### 规律：同一消费组内订阅关系必须一致，否则消息路由错乱
- **适用版本**: RocketMQ 4.x / 5.x 全版本
- **规律**: 同一 consumerGroup 的所有实例必须订阅相同的 topic + 相同的 tag 表达式（"订阅关系一致"）。RocketMQ 按组维护订阅与位点：同组内 A 实例订阅 `topicA:tag1`、B 实例订阅 `topicA:tag2`（或不同 topic），broker 端订阅关系互相覆盖，导致消息被路由到不消费该 tag 的实例而被静默丢弃。不同业务必须拆不同 consumerGroup；同组多实例部署同一套代码。
- **违反后果**: 部分消息静默丢失（被路由到不消费的实例），故障隐蔽且随机。
- **验证方法**: 多个 `@RocketMQMessageListener` 检出相同 consumerGroup 但 topic/selectorExpression 不同 → warn。
- **对应门禁**: fw_rocketmq_group_consistency(warn)

```verify
id: rocketmq-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_rocketmq_idempotent_consumer | fail | @RocketMQMessageListener 文件无幂等痕迹（setIfAbsent/去重/idempot 等）→ fail 重复消费风险 | ROCKETMQ_SRC_GLOBS | —（重复投递契约） |
| fw_rocketmq_orderly_listener | fail | 检出 sendOrderly/MessageQueueSelector 但消费端无 ORDERLY/MessageListenerOrderly → fail 顺序破坏 | ROCKETMQ_SRC_GLOBS | CWE-662（并发监听破坏顺序同步语义） |
| fw_rocketmq_tx_checkback | fail | 检出 TransactionListener/sendMessageInTransaction 但无 checkLocalTransaction → fail 半消息悬挂 | ROCKETMQ_SRC_GLOBS | CWE-755（half 消息悬挂=异常状态无处置） |
| fw_rocketmq_retry_dlq | warn | @RocketMQMessageListener 无 maxReconsumeTimes → warn 重试/DLQ 兜底缺失 | ROCKETMQ_SRC_GLOBS | CWE-755（重试/DLQ 兜底缺失） |
| fw_rocketmq_backlog | warn | @RocketMQMessageListener 无 consumeThread/consumeMessageBatchMaxSize → warn 并发度未配防堆积 | ROCKETMQ_SRC_GLOBS | CWE-770（消费并发无节制→堆积） |
| fw_rocketmq_delay | warn | RocketMQ 代码文件内检出 Thread.sleep → warn 禁 sleep 模拟延迟；检出 delayTime API → pass | ROCKETMQ_SRC_GLOBS | —（延迟实现方式） |
| fw_rocketmq_batch | warn | 检出批量发送 → warn 确认 ≤4MiB 切分与降级单发 | ROCKETMQ_SRC_GLOBS | —（批量约束） |
| fw_rocketmq_filter | warn | 检出 bySql/SQL92 → warn 确认 broker enablePropertyFilter=true | ROCKETMQ_SRC_GLOBS | —（broker 开关契约） |
| fw_rocketmq_broadcast | warn | 检出 BROADCASTING → warn 确认场景可丢失 | ROCKETMQ_SRC_GLOBS | —（可丢失场景确认） |
| fw_rocketmq_order_scope | warn | 检出 sendOrderly → warn 确认分区顺序而非全局单队列 | ROCKETMQ_SRC_GLOBS | —（顺序范围选型） |
| fw_rocketmq_trace | warn | 检出 RocketMQ 使用但无 enableMsgTrace/enable-msg-trace → warn | ROCKETMQ_SRC_GLOBS | CWE-778（无消息轨迹=链路无记录） |
| fw_rocketmq_group_consistency | warn | 多 listener 同 consumerGroup 不同 topic → warn 订阅关系不一致 | ROCKETMQ_SRC_GLOBS | —（订阅一致性） |

<!--
门禁 id 命名规范：fw_rocketmq_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/rocketmq.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_rocketmq_<rule>(fail|warn) ...` 与本表 id 集合一致。
fixture 验证覆盖：violating 含 @RocketMQMessageListener 无幂等 + MessageQueueSelector 顺序选队列发送无顺序监听 + 事务消息无回查
  → idempotent_consumer/orderly_listener/tx_checkback 三 fail 主触发（expected-fail-ids 3/3 已登记）；compliant 修正（setIfAbsent 幂等 + 显式重试/并发/轨迹）全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| rocketmq × spring-boot | rocketmq-spring 版本须与 Boot 版本对齐（2.3.x ↔ Boot 2.7/3.x 待验证矩阵） | starter 依赖 spring-messaging，版本错配装配失败 |
| rocketmq × seata | 事务消息与 Seata AT 不可混用同一业务写路径，须二选一或 TCC 编排 | 两套分布式事务协议叠加导致悬挂/双写不一致 |
| rocketmq × mybatis | 消费幂等落库建议 DB 唯一键 + INSERT IGNORE / ON DUPLICATE KEY，Mapper 层须显式 | 仅 Redis 去重在 Redis 故障窗口失效，DB 唯一键兜底 |
| rocketmq × xxl-job | DLQ 兜底重投建议 xxl-job 定时扫描 `%DLQ%<group>` 而非常驻线程 | 常驻线程与消费组 rebalance 互相干扰 |
| rocketmq × redis | 用 Redis 作幂等/去重缓存须带 TTL 且与事务消息回查时序一致 | 无 TTL 致去重窗口膨胀，回查窗口错位丢幂等防护 |
| rocketmq × celery | 与 celery 任务编排时 RocketMQ 事务消息与 celery 异步任务须解耦，避免事务消息阻塞 worker | 事务消息半消息超时回滚与 celery 任务状态机冲突致双写 |
| rocketmq × seata | 事务消息与 Seata TCC 同写路径须显式二选一或 TCC 编排（见上 rocketmq × seata 行） | 协议叠加致悬挂/双写不一致 |

<!--
本表聚焦 rocketmq 生态内高频组合；无强交互的组合不列。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| RocketMQ 4.9.x | 维护线终态；延迟消息仅 18 级；nameServer 无 proxy | 超 2h 延迟须升 5.x |
| RocketMQ 5.0 | 引入 proxy 层 + POP 消费 + gRPC 客户端；存储计算分离 | remoting 直连与 proxy 两种接入模式，客户端依赖选型须明确 |
| RocketMQ 5.x | 定时消息支持任意时长（setDeliverTimeMs）；轻量版延迟 level 兼容保留 | 4.x 的 delayTimeLevel 代码可迁移但建议改定时 API |
| rocketmq-spring 2.3.x | @RocketMQMessageListener 支持 consumeThreadNumber 等属性（具体属性名随小版本变化，待验证） | 门禁按 `consumeThread` 前缀模糊匹配，版本差异须人工核对 |
| RocketMQ Dashboard 2.0.0 | 独立于 broker 发布（2024-09 现行） | 堆积/死信监控依赖 Dashboard 或 mqadmin，须部署 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

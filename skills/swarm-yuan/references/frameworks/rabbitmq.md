---
ruleset_id: rabbitmq
适用版本: RabbitMQ 4.x（4.3.x 现行，4.3.2 发布于 2026-06-11；classic queue 已废弃，quorum queue 为推荐默认）/ spring-amqp 3.x（Boot 3）与 4.x（Boot 4，差异单独标注）
最后调研: 2026-07-17（来源：https://endoflife.date/rabbitmq ；https://www.rabbitmq.com/docs ；https://www.rabbitmq.com/docs/quorum-queues ；https://www.rabbitmq.com/docs/confirms ；https://www.rabbitmq.com/docs/dlx ；https://docs.spring.io/spring-amqp/reference/ ）
深度门槛: 10
---

# RabbitMQ 规则集

<!--
本规则集覆盖 RabbitMQ 4.x（现行 4.3.x；4.0 起 classic mirrored queues 移除，4.1 起 non-mirrored
classic queue 宣布废弃、Khepri 元数据存储新部署默认——具体 GA 细节差异单独标注）与
spring-amqp 3.x（Boot 3.x）/ 4.x（Boot 4.x，jakarta 命名空间）。
调研时点：2026-07-17。版本号以 endoflife.date/rabbitmq 交叉核实（4.3.2，2026-06-11；
4.2 社区支持止于 2026-07-31）。无法确认的点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.boot:spring-boot-starter-amqp` / `org.springframework.amqp:spring-rabbit` / `com.rabbitmq:amqp-client` | 高 |
| 注解 | `@RabbitListener` / `@RabbitHandler` / `@EnableRabbit` | 高 |
| 配置 | `spring.rabbitmq.*` / `spring.rabbitmq.listener.*` / `publisher-confirm-type` / `x-dead-letter-exchange` / `x-queue-type` | 高 |
| 代码 | `RabbitTemplate` / `ConnectionFactory` / `QueueBuilder` / `DirectExchange` / `TopicExchange` / `basicPublish` / `basicConsume` | 高 |
| 文件 | `**/docker-compose*.yml` 含 `rabbitmq:` | 中（需排除仅部署描述） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 rabbitmq 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 消费者监听器：`grep -rlE '@RabbitListener\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @RabbitListener 的 .java 文件数）
- 队列声明：`grep -rnE 'new Queue\(|QueueBuilder\.|queueDeclare\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：队列声明行数）
- 交换机声明：`grep -rnE 'new (Direct|Topic|Fanout|Headers)Exchange|ExchangeBuilder\.' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：交换机声明行数）
- 生产者发送点：`grep -rnE 'RabbitTemplate|convertAndSend|basicPublish' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：生产者文件数）
- 死信配置：`grep -rnE 'x-dead-letter|deadLetter|DeadLetter|dlx|DLQ' "${PROJECT_DIR}"`（计数核验基准：DLQ 配置行数）
- 发布确认配置：`grep -rnE 'ConfirmCallback|ReturnsCallback|publisher-confirm|publisher-returns|confirmSelect|waitForConfirms' "${PROJECT_DIR}"`（计数核验基准：发布确认行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：消费端必须手动 ACK——autoAck=true / AcknowledgeMode.NONE 即消息丢失
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: 原生客户端 `basicConsume(queue, autoAck=true, ...)` 或 spring-amqp `AcknowledgeMode.NONE`：broker 投递即视为成功，消费者宕机/业务失败 → **消息永久丢失**（at-most-once）。生产必须手动确认：原生 `basicAck(deliveryTag, false)` 业务成功后调用、失败 `basicNack(tag, false, requeue=false)` 进 DLQ；spring-amqp `spring.rabbitmq.listener.simple.acknowledge-mode: manual`（或 AUTO 容器代确认，业务抛异常容器 nack——可接受但 MANUAL 控制力更强）。
- **违反后果**: 消费失败消息静默丢失，资金/订单断链；失败消息无重投无死信。
- **验证方法**: 检出 `AcknowledgeMode.NONE` / `acknowledge-mode: none` / `basicConsume(..., true, ...)`（autoAck=true）→ fail。
- **对应门禁**: fw_rabbitmq_manual_ack(fail)

```verify
id: rabbitmq-r1
cmd: 
expect: always
```

### 规律：消费端必须幂等——at-least-once 下重投/requeue 必然重复
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: RabbitMQ 仅保证 at-least-once：ack 丢失重投、basicNack requeue、broker 故障转移都会重复投递。消费端须以 message-id（生产者必须设置 `MessageProperties.messageId`）做去重：Redis SETNX 或 DB 唯一键。`redelivered` 标志只能提示不可依赖（首次重复可能标志未置位，待验证边界行为）。
- **违反后果**: 重复消费 → 重复扣款 / 重复通知 / 统计翻倍。
- **验证方法**: 检出 `@RabbitListener` 文件内无幂等痕迹（`幂等|idempot|dedup|去重|setIfAbsent|setnx|ON DUPLICATE|insertIgnore|uk_`）→ warn。
- **对应门禁**: fw_rabbitmq_idempotent_consumer(warn)

```verify
id: rabbitmq-r2
cmd: 
expect: always
```

### 规律：队列必须配死信交换机（DLX）——毒丸消息禁止无限 requeue 阻塞
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: 消费失败 `basicNack(requeue=true)` 无限循环会打满消费者并阻塞队列头部。生产须：队列声明带 `x-dead-letter-exchange` + `x-dead-letter-routing-key`（spring-amqp `QueueBuilder.durable().withArgument("x-dead-letter-exchange", ...)`），失败 nack(requeue=false) 路由进 DLQ 队列；DLQ 消息须监控 + 人工/定时兜底。注意 DLX 消息原 routing key 循环重投会形成死循环。
- **违反后果**: 毒丸消息无限 requeue 打爆消费者；或直接丢弃无人知晓。
- **验证方法**: 检出 RabbitMQ 使用但无 `x-dead-letter|deadLetter|dlx|dlq` 痕迹 → warn。
- **对应门禁**: fw_rabbitmq_dlq(warn)

```verify
id: rabbitmq-r3
cmd: 
expect: always
```

### 规律：队列须 durable=true 且消息须 persistent——缺一重启即丢
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: 持久化是三件套缺一不可：交换机 durable + 队列 durable + 消息 `deliveryMode=2`（PERSISTENT）。`new Queue(name, false)` / `QueueBuilder.nonDurable()` / 原生 `queueDeclare(name, false, ...)` → broker 重启队列消失；非 persistent 消息即使在 durable 队列中重启也丢。注意 quorum queue 强制 durable（见 quorum 规律）；lazy queue 已并入 quorum 语义（3.12+，待验证细节）。
- **违反后果**: broker 重启/升级 → 队列与消息全失。
- **验证方法**: 检出 `new Queue("x", false)` / `QueueBuilder.nonDurable` / `queueDeclare(..., false, ...)` / `MessageDeliveryMode.NON_PERSISTENT` → warn。
- **对应门禁**: fw_rabbitmq_durable_persistent(warn)

```verify
id: rabbitmq-r4
cmd: 
expect: always
```

### 规律：Connection/Channel 必须复用——每次新建是教科书级反模式
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: TCP 连接 + AMQP 握手 + channel 建立每次数百 ms，且 broker 侧每连接每信道都有内存/文件句柄开销。原生客户端：Connection 长连接复用（每线程/每操作新建 Channel、用完关闭）；spring-amqp：`CachingConnectionFactory` 缓存 channel，业务代码禁止自行 `connectionFactory.newConnection()`（绕开缓存）。禁止"发一条消息新建一次连接"。
- **违反后果**: 高并发下连接风暴打垮 broker；发送端延迟飙升。
- **验证方法**: 业务代码检出 `.newConnection(` / `.newChannel(`（原生客户端直接建连/建道）→ warn 人工确认复用策略。
- **对应门禁**: fw_rabbitmq_connection_reuse(warn)

```verify
id: rabbitmq-r5
cmd: 
expect: always
```

### 规律：消费端必须配 prefetch 限流——默认 250 须按业务收敛
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: prefetch（basicQos）控制 broker 推送给单个消费者的未确认消息上限。spring-amqp 默认 prefetch=250：慢消费场景 250 条堆在单个消费者内存里，其余消费者空转（负载不均），消费者宕机 250 条全部重投。须按单条处理耗时收敛（如 10-50）；原生客户端 `channel.basicQos(n)`。prefetch=0 表示不限，生产禁止。
- **违反后果**: 慢消费者积压 + 宕机批量重投；快消费者饿死。
- **验证方法**: 检出消费者（@RabbitListener / basicConsume）但无 `prefetch|basicQos|PrefetchCount` 配置 → warn。
- **对应门禁**: fw_rabbitmq_prefetch(warn)

```verify
id: rabbitmq-r6
cmd: 
expect: always
```

### 规律：生产者必须开发布确认（publisher confirm）+ returns——否则发送即盲发
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: basicPublish 默认发后不管：broker 未落盘、交换机不存在、无队列匹配（unroutable）全部静默。生产须：`publisher-confirm-type: correlated`（spring-amqp 异步确认，性能优于同步）+ `publisher-returns: true` + `ReturnsCallback` 处理不可路由消息（须配 `mandatory=true`，spring Boot 配 publisher-returns 即生效）。原生客户端 `confirmSelect()` + `waitForConfirmsOrDie()` / 异步监听器。confirm 是 broker 收到并负责的确认，不是消费成功。
- **违反后果**: 发送"成功"但消息未达 broker / 被路由黑洞吞掉，业务对账才发现。
- **验证方法**: 检出生产者（RabbitTemplate/basicPublish/convertAndSend）但无 `ConfirmCallback|ReturnsCallback|publisher-confirm|publisher-returns|confirmSelect|waitForConfirms` → warn。
- **对应门禁**: fw_rabbitmq_publisher_confirm(warn)

```verify
id: rabbitmq-r7
cmd: 
expect: always
```

### 规律：延迟消息选型——TTL+DLX 模拟 vs rabbitmq-delayed-message-exchange 插件
- **适用版本**: RabbitMQ 3.x/4.x（插件 4.x 继续支持，待验证最新兼容矩阵）
- **规律**: TTL+DLX 延迟模式（消息先投进带 `x-message-ttl` 的暂存队列，过期后死信转发真实队列）缺陷：队列级 TTL 时消息按入队顺序过期，头部阻塞（队头消息 TTL 长会挡住后面 TTL 短的）；per-message TTL 缓解但仍有队头效应；且过期消息可能延迟投递（broker 惰性过期，待验证 4.x 行为）。生产推荐 `rabbitmq-delayed-message-exchange` 插件（`x-delayed-message` 交换机 + `x-delay` 头）或改 RocketMQ/Kafka 定时能力。
- **违反后果**: 延迟消息不按预期时点投递；队头阻塞导致批量延迟。
- **验证方法**: 检出 `x-message-ttl`/`setExpiration` 与 `x-dead-letter` 共存（TTL+DLX 延迟特征）→ warn 人工确认或迁插件。
- **对应门禁**: fw_rabbitmq_delay(warn)

```verify
id: rabbitmq-r8
cmd: 
expect: always
```

### 规律：新建队列须显式 quorum——classic queue 4.x 已废弃
- **适用版本**: RabbitMQ 4.x（classic mirrored queues 4.0 移除；non-mirrored classic queue 4.1 宣布废弃，移除时点待验证）
- **规律**: quorum queue（Raft 多数派复制）是 4.x 唯一推荐的高可用队列类型：声明 `x-queue-type=quorum`（spring-amqp `withArgument("x-queue-type", "quorum")`），强制 durable + persistent。classic queue v1 无复制、broker 宕机即不可用；4.1 起官方宣布废弃（默认队列类型默认值变更时点待验证）。quorum queue 不支持：exclusive、auto-delete、非 durable、消息优先级（部分限制，待验证 4.x 完整清单）。
- **违反后果**: classic queue 单点；升级 4.x 后废弃类型面临移除风险。
- **验证方法**: 显式检出 `x-queue-type=classic` / `"type": "classic"` → warn；检出队列声明（`new Queue(|queueDeclare|QueueBuilder`）但无 quorum 痕迹 → warn 人工确认。
- **对应门禁**: fw_rabbitmq_quorum(warn)

```verify
id: rabbitmq-r9
cmd: 
expect: always
```

### 规律：交换机类型选型须匹配路由语义——headers 交换机性能差慎用
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: direct（精确 routing key）/ topic（模式匹配 `*.order.#`）/ fanout（广播全绑定队列，无视 key）/ headers（按 header 键值匹配）。headers 交换机匹配开销大、通配能力弱、运维可见性差，生产几乎总可用 topic 替代；fanout 广播须确认每个绑定队列都真需要全量消息（否则放大流量）。选型错配会导致路由复杂度指数上升。
- **违反后果**: headers 交换机高流量下 CPU 飙升；fanout 滥用流量放大。
- **验证方法**: 检出 `HeadersExchange` / `ExchangeTypes.HEADERS` / `type: headers` → warn。
- **对应门禁**: fw_rabbitmq_exchange_type(warn)

```verify
id: rabbitmq-r10
cmd: 
expect: always
```

### 规律：消费者并发须显式配置——单消费者线程是隐形瓶颈
- **适用版本**: spring-amqp 全版本
- **规律**: spring-amqp SimpleMessageListenerContainer 默认 `concurrentConsumers=1`：单线程串行消费，吞吐被单线程锁死。须显式 `spring.rabbitmq.listener.simple.concurrency` + `max-concurrency`（或 @RabbitListener `concurrency = "2-8"`）按 CPU/IO 特征配置；并发上限还受 prefetch 与队列分区（单队列内部无序并行，quorum 单 leader 写入）约束。并发消费下消息顺序不再保证，顺序敏感业务须单并发 + 单队列（牺牲吞吐）。
- **违反后果**: 消费速率 < 生产速率 → 队列持续堆积；或盲开高并发打垮下游 DB。
- **验证方法**: 检出 @RabbitListener 但无 `concurrency` 显式配置 → warn。
- **对应门禁**: fw_rabbitmq_consumer_concurrency(warn)

```verify
id: rabbitmq-r11
cmd: 
expect: always
```

### 规律：autoDelete/exclusive 队列禁止承载业务消息——断连即删
- **适用版本**: RabbitMQ 全版本 / spring-amqp 全版本
- **规律**: `autoDelete=true`（最后消费者取消订阅即删队列）与 `exclusive=true`（声明连接关闭即删）只适用于临时回复队列（RPC reply-to）等场景。业务队列误用 → 消费者滚动重启/网络抖动期间队列连同未消费消息一起消失，且无告警。quorum queue 干脆不支持二者（4.x 强制约束）。server-named 临时队列（`queueDeclare("", ...)`）同理。
- **违反后果**: 消费者断连 → 队列 + 存量消息静默蒸发。
- **验证方法**: 检出 `.autoDelete(` / `auto-delete: true` / `.exclusive(` / `exclusive: true` / `queueDeclare` 第 3/4 参 true → warn。
- **对应门禁**: fw_rabbitmq_auto_delete(warn)

```verify
id: rabbitmq-r12
cmd: 
expect: always
```

### 规律：队列/routingKey 名是双边字符串，生产/监听两侧配对须核对（横向清剿轮）
- **适用版本**: spring-amqp 3.x 全版本
- **规律**: `convertAndSend("Q", msg)` 与 `@RabbitListener(queues = "Q")` 是互不知晓的字符串——改一边即静默断链（消息进无人监听的队列，或监听空队列）。binding/routingKey 同理。单边队列（外部系统）须在 §5 消息拓扑配对表登记。
- **违反后果**: 消息静默断链；TTL 队列消息过期丢弃更隐蔽。
- **验证方法**: 机械提取生产侧首字面量与监听侧 queues 字面量双向 diff，单边悬挂即 warn（常量引用自然跳过）。
- **对应门禁**: fw_rabbit_endpoint_pair(warn)

```verify
id: rabbitmq-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_rabbitmq_manual_ack | fail | 检出 AcknowledgeMode.NONE / acknowledge-mode: none / basicConsume(...,true) → fail 消息丢失 | RABBITMQ_SRC_GLOBS | —（确认语义契约） |
| fw_rabbitmq_idempotent_consumer | warn | @RabbitListener 文件无幂等痕迹 → warn | RABBITMQ_SRC_GLOBS | —（幂等契约） |
| fw_rabbitmq_dlq | warn | RabbitMQ 使用但无 x-dead-letter/dlx/dlq 痕迹 → warn | RABBITMQ_SRC_GLOBS | CWE-755（毒丸 requeue 无死信处置） |
| fw_rabbitmq_durable_persistent | warn | new Queue(name,false) / QueueBuilder.nonDurable / queueDeclare durable=false / NON_PERSISTENT → warn | RABBITMQ_SRC_GLOBS | —（持久化契约） |
| fw_rabbitmq_connection_reuse | warn | 业务代码检出 .newConnection( / .newChannel( → warn 确认复用 | RABBITMQ_SRC_GLOBS | CWE-770（每操作新建连接无节制） |
| fw_rabbitmq_prefetch | warn | 有消费者但无 prefetch/basicQos 配置 → warn | RABBITMQ_SRC_GLOBS | CWE-770（默认 prefetch 250 堆满内存） |
| fw_rabbitmq_publisher_confirm | warn | 有生产者但无 ConfirmCallback/ReturnsCallback/publisher-confirm 痕迹 → warn | RABBITMQ_SRC_GLOBS | —（发布确认契约） |
| fw_rabbitmq_delay | warn | x-message-ttl/setExpiration 与 x-dead-letter 共存（TTL+DLX 延迟）→ warn 建议插件 | RABBITMQ_SRC_GLOBS | —（延迟模式选型） |
| fw_rabbitmq_quorum | warn | 显式 classic 或队列声明无 x-queue-type=quorum → warn | RABBITMQ_SRC_GLOBS | —（队列类型选型） |
| fw_rabbitmq_exchange_type | warn | 检出 HeadersExchange/ExchangeTypes.HEADERS/type: headers → warn | RABBITMQ_SRC_GLOBS | —（交换机选型） |
| fw_rabbitmq_consumer_concurrency | warn | @RabbitListener 无 concurrency 显式配置 → warn | RABBITMQ_SRC_GLOBS | —（并发配置） |
| fw_rabbitmq_auto_delete | warn | 检出 .autoDelete(/.exclusive(/auto-delete: true/exclusive: true → warn | RABBITMQ_SRC_GLOBS | —（临时队列风险） |
| fw_rabbit_endpoint_pair | warn | 生产/监听队列名字面量双向 diff，单边悬挂即 warn | RABBITMQ_SRC_GLOBS | —（拓扑配对一致性） |

<!--
门禁 id 命名规范：fw_rabbitmq_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/rabbitmq.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_rabbitmq_<rule>(fail|warn) ...` 与本表 id 集合一致。
fixture 验证覆盖：violating 含 @RabbitListener + acknowledge-mode: none + 无幂等 + 无 DLQ
  + 每次新建 Connection + nonDurable/autoDelete → manual_ack fail 主触发（expected-fail-ids 1/1 已登记）；
  compliant 修正（manual ack + setIfAbsent 幂等 + DLX + quorum + prefetch + confirm + concurrency）全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| rabbitmq × spring-boot | spring-amqp 版本与 Boot BOM 对齐（3.x ↔ Boot 3.x；4.x ↔ Boot 4.x） | 错配导致 auto-config 冲突 / NoSuchMethodError |
| rabbitmq × jackson | Jackson2JsonMessageConverter 须配 trusted packages（默认仅 java.util/java.lang 等白名单）；schema 演进须保留旧字段反序列化兼容 | 反序列化白名单拦截即消费失败进 DLQ；CWE-502 反序列化风险 |
| rabbitmq × mybatis | 消费幂等落库用 DB 唯一键兜底；手动 ack 须在 DB 事务提交之后 | 先 ack 后提交失败即丢消息；先提交后 ack 宕机即重复（故仍需幂等） |
| rabbitmq × spring-retry | listener retry（spring.rabbitmq.listener.simple.retry）与 DLQ 配合：max-attempts 收敛，重试耗尽后 republish 进 DLQ 而非 requeue | 本地重试 + requeue 叠加即无限循环 |
| rabbitmq × celery | celery 以 rabbitmq 为 broker 时须配 prefetch 限流 + 序列化禁用 pickle + 任务 time_limit | pickle 反序列化 RCE 叠加 broker 暴露即远程执行，无 time_limit 易堆积 |
| rabbitmq × redis | 用 Redis 作任务状态/去重缓存须带 TTL 且与 manual ack 时序一致 | 无 TTL 致去重窗口膨胀，先 ack 后写缓存断层即重复消费 |

<!--
本表聚焦 rabbitmq 生态内高频组合；无强交互的组合不列。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| RabbitMQ 3.8 | quorum queue 引入；classic mirrored queues（HA 镜像）宣布废弃 | 新队列选型应直接 quorum |
| RabbitMQ 3.12 | classic queue v2 存储格式默认；lazy queue 语义并入 quorum | classic v1 迁移窗口开启 |
| RabbitMQ 3.13 | 升级 4.0 前必须开启全部 stable feature flags | 未开齐 feature flag 直接拒绝升级 |
| RabbitMQ 4.0 | classic mirrored queues 移除；Khepri 元数据存储可选；AMQP 1.0 支持重构；最低 Erlang 版本抬升（待验证具体版本） | 镜像队列集群必须先迁 quorum 再升级 |
| RabbitMQ 4.1 | Khepri 新部署默认；non-mirrored classic queue 宣布废弃（移除时点待验证） | 新建队列须 x-queue-type=quorum |
| RabbitMQ 4.2 | 社区支持至 2026-07-31 | 仍在 4.2 的项目须规划升 4.3 |
| RabbitMQ 4.3 | 现行稳定（4.3.2，2026-06-11） | 本规则集版本基准 |
| spring-amqp 4.0 | 对应 Boot 4.x / jakarta 命名空间（GA 细节待验证） | javax→jakarta 迁移 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

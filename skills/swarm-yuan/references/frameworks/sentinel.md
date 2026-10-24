---
ruleset_id: sentinel
适用版本: Sentinel 1.8.x（稳定线，2026-07 现行 1.8.10）/ 2.0.0-alpha（预览版，待验证 GA 时点；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/alibaba/Sentinel/releases ；https://sentinelguard.io/zh-cn/docs/introduction.html ；https://sentinelguard.io/zh-cn/docs/annotation-support.html ；https://sentinelguard.io/zh-cn/docs/dynamic-rule-configuration.html ；https://sentinelguard.io/zh-cn/docs/basic-api-resource-rule.html ）
深度门槛: 10
---

# Sentinel 规则集

<!--
本规则集覆盖 Sentinel 1.8.x 稳定线（2026-07-17 联网核实：最新 1.8.10，发布于 2026-05）。
Sentinel 2.x 状态：仅 2.0.0-alpha 预览版（2026-02 发布，pre-release），无稳定 GA；规律按 1.8.x 陈述，
2.x 行为变化（规则模型/API 调整）标"待验证"，不臆造。
调研时点：2026-07-17。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.alibaba.cloud:spring-cloud-starter-alibaba-sentinel` / `com.alibaba.csp:sentinel-core` / `sentinel-annotation-aspectj` / `sentinel-datasource-nacos` / `sentinel-spring-cloud-gateway-adapter` / `sentinel-parameter-flow-control` | 高 |
| 注解 | `@SentinelResource` | 高 |
| 配置 | `spring.cloud.sentinel.*` / `spring.cloud.sentinel.datasource.*` / `spring.cloud.sentinel.transport.dashboard` | 高 |
| 代码 | `SphU.entry` / `FlowRule` / `DegradeRule` / `ParamFlowRule` / `SystemRule` / `GatewayFlowRule` / `BlockException` | 高 |
| 文件 | `**/sentinel-dashboard*.jar` / `**/sentinel-rules/**` | 中（需排除他用） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 sentinel 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- @SentinelResource 资源点：`grep -rlE '@SentinelResource\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @SentinelResource 的 .java 文件数）
- 代码硬编码规则：`grep -rnE 'FlowRule|DegradeRule|ParamFlowRule|SystemRule' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：规则构造行数）
- 数据源持久化配置：`grep -rnE 'spring\.cloud\.sentinel\.datasource|ReadableDataSource|DataSourceProperties' "${PROJECT_DIR}"`（计数核验基准：数据源配置行数）
- Dashboard 连接配置：`grep -rnE 'spring\.cloud\.sentinel\.transport\.dashboard' "${PROJECT_DIR}"`
- 熔断规则配置：`grep -rnE 'DegradeRule|degrade-rules|DEGRADE_GRADE_' "${PROJECT_DIR}"`
- 热点参数规则：`grep -rnE 'ParamFlowRule|param-flow|ParamFlowItem' "${PROJECT_DIR}"`

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：Sentinel 规则须持久化到数据源（Nacos 等），禁止仅存内存
- **适用版本**: Sentinel 1.8.x（2.x 待验证）
- **规律**: Sentinel 默认 pull/push 模式规则存客户端内存，应用重启即丢失。生产须通过 `ReadableDataSource` 接 Nacos/ZooKeeper/Apollo 数据源持久化规则（Spring Cloud Alibaba 用 `spring.cloud.sentinel.datasource.<name>.nacos.*`）。规则持久化是高可用的前提。
- **违反后果**: 应用重启后限流/熔断规则全部丢失 → 突发流量无保护 → 服务雪崩。
- **验证方法**: 检出 `@SentinelResource`/`SphU`/`FlowRule` 等 Sentinel 使用痕迹，但无 `spring.cloud.sentinel.datasource`/`ReadableDataSource`/`sentinel-datasource-*` 依赖 → fail。
- **对应门禁**: fw_sentinel_rule_persist(fail)

```verify
id: sentinel-r1
cmd: 
expect: always
```

### 规律：@SentinelResource 须配 blockHandler 或 fallback，分工明确
- **适用版本**: Sentinel 1.8.x（注解支持 1.6+ 稳定）
- **规律**: `@SentinelResource` 的 `blockHandler` 处理 BlockException（限流/熔断/系统保护触发，函数签名须同参列表追加 BlockException），`fallback` 处理业务异常（Java 异常降级）。两者职责不同：只配 fallback 时限流降级触发的 BlockException 不会被 fallback 接收（1.6.x 起 fallback 不处理 BlockException），会向上抛 BlockException 变成 500。生产至少配 blockHandler，业务降级另配 fallback。
- **违反后果**: 限流触发时用户收到 500 异常而非兜底响应；业务异常无降级直达用户。
- **验证方法**: `grep -rnE '@SentinelResource\b' --include='*.java'` 命中行未含 `blockHandler` 且未含 `fallback` → warn。
- **对应门禁**: fw_sentinel_resource_fallback(warn)

```verify
id: sentinel-r2
cmd: grep -rnE '@SentinelResource\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：只配 fallback 不配 blockHandler 时，BlockException 不上 fallback 通道
- **适用版本**: Sentinel 1.6.3+ / 1.8.x
- **规律**: Sentinel 官方语义：`fallback` 仅针对业务异常，`blockHandler` 仅针对 BlockException。若只配 fallback，限流/熔断时抛 `BlockException`/`FlowException`/`DegradeException` 直接上抛调用方。须按"限流降级走 blockHandler、业务异常走 fallback"分工。
- **违反后果**: 限流触发 → BlockException 上抛 → 调用方收到 UndeclaredThrowableException / 500。
- **验证方法**: @SentinelResource 含 `fallback` 但无 `blockHandler` → warn。
- **对应门禁**: fw_sentinel_blockhandler_split(warn)

```verify
id: sentinel-r3
cmd: 
expect: always
```

### 规律：熔断规则 RT 与异常比选型须按场景，minRequestAmount 防小样本误熔断
- **适用版本**: Sentinel 1.8.x（1.8.0 起慢调用比例引入 slowRatioThreshold）
- **规律**: 熔断策略三选：慢调用比例（`DEGRADE_GRADE_RT`，maxRt 划定慢调用阈值，slowRatioThreshold 比例阈值）、异常比例（`DEGRADE_GRADE_EXCEPTION_RATIO`）、异常数（`DEGRADE_GRADE_EXCEPTION_COUNT`）。下游不稳定但自身逻辑简单 → 慢调用比例；自身依赖外部接口异常多 → 异常比例。`minRequestAmount` 须 ≥5（统计窗口内请求数不足不熔断），`statIntervalMs` 与 `timeWindow`（熔断时长）须成比例。
- **违反后果**: minRequestAmount=1 → 首个慢请求即熔断；异常比例用于无外部依赖的纯计算资源 → 永不熔断形同虚设。
- **验证方法**: 检出 `DegradeRule`/`degrade` 配置但无 `minRequestAmount`/`min-request-amount` → warn。
- **对应门禁**: fw_sentinel_degrade_strategy(warn)

```verify
id: sentinel-r4
cmd: 
expect: always
```

### 规律：热点参数限流须用 ParamFlowRule 且 blockHandler 处理 ParamFlowException
- **适用版本**: Sentinel 1.8.x（sentinel-parameter-flow-control 模块）
- **规律**: 高频同参数访问（如某爆款商品 ID、某用户 ID 刷接口）用热点参数限流：`ParamFlowRule` 指定参数索引（`paramIdx`）、单机阈值，例外项 `ParamFlowItem` 给特定参数值单独阈值。热点规则触发抛 `ParamFlowException`（BlockException 子类），@SentinelResource blockHandler 可统一接住。
- **违反后果**: 无热点限流 → 单一热点 key 打满资源配额挤占其他请求；无 blockHandler → ParamFlowException 上抛 500。
- **验证方法**: 检出 `ParamFlowRule`/`param-flow` 但工程内无 `blockHandler` 关键字 → warn。
- **对应门禁**: fw_sentinel_param_flow(warn)

```verify
id: sentinel-r5
cmd: 
expect: always
```

### 规律：突发流量场景须考虑匀速排队/冷启动流量整形，避免默认快速失败误杀
- **适用版本**: Sentinel 1.8.x
- **规律**: FlowRule `controlBehavior`：0 直接拒绝（默认）、1 Warm Up（冷启动，预热期逐步放量，防冷系统被突发压垮）、2 匀速排队（`CONTROL_BEHAVIOR_RATE_LIMITER`，漏桶匀速通过，maxQueueingTimeMs 排队超时）。秒杀/定时任务流量突刺场景默认快速失败会误杀正常请求，须评估匀速排队。
- **违反后果**: 突发合法流量被批量拒绝 → 用户大面积失败重试 → 流量放大二次冲击。
- **验证方法**: 检出 `FlowRule`/flow 规则配置但无 `controlBehavior`/`control-behavior` 字段 → warn 人工确认突发场景整形策略。
- **对应门禁**: fw_sentinel_flow_shape(warn)

```verify
id: sentinel-r6
cmd: 
expect: always
```

### 规律：高流量入口须配系统自适应保护 SystemRule 兜底
- **适用版本**: Sentinel 1.8.x
- **规律**: SystemRule 按系统维度保护（LOAD（仅 Linux）/RT/线程数/入口 QPS/CPU 使用率（1.5.1+）），是应用级最后兜底。单资源流控无法防"全资源叠加过载"，高流量入口服务须配 SystemRule（注意：SystemRule 仅对入口流量生效，即 `ContextUtil.enter` 默认入口或 EntryType.IN）。
- **违反后果**: 整体过载无全局熔断 → CPU 打满 → 整机不可用。
- **验证方法**: 检出 Sentinel 使用痕迹但无 `SystemRule`/`system-rule` 配置 → warn。
- **对应门禁**: fw_sentinel_system_rule(warn)

```verify
id: sentinel-r7
cmd: 
expect: always
```

### 规律：Spring Cloud Gateway 入口须接 sentinel-gateway 适配器做网关流控
- **适用版本**: Sentinel 1.8.x + Spring Cloud Gateway（sentinel-spring-cloud-gateway-adapter）
- **规律**: 网关是流量入口，须用 `sentinel-spring-cloud-gateway-adapter` + `GatewayFlowRule`（按 route 或自定义 API 分组 `ApiDefinition` 限流），配合 `SentinelGatewayFilter`。仅靠下游服务各自限流无法防入口级突发。
- **违反后果**: 入口无限流 → 突发流量直接冲垮后端服务。
- **验证方法**: 检出 `spring-cloud-starter-gateway` 依赖 + Sentinel 使用，但无 `sentinel-spring-cloud-gateway-adapter`/`GatewayFlowRule` → warn。
- **对应门禁**: fw_sentinel_gateway_flow(warn)

```verify
id: sentinel-r8
cmd: 
expect: always
```

### 规律：Sentinel Dashboard 鉴权默认口令必须修改
- **适用版本**: Sentinel 1.8.x（1.7.0+ 支持登录鉴权）
- **规律**: Dashboard 默认账号/口令均为 `sentinel`（`sentinel.dashboard.auth.username`/`sentinel.dashboard.auth.password` JVM 参数或配置文件注入）。生产暴露 Dashboard 必须改默认口令并限制网络可达性（不暴露公网）。
- **违反后果**: 默认口令被未授权登录 → 任意篡改限流规则 / 探测内部接口拓扑 CWE-521。
- **验证方法**: 检出 `sentinel.dashboard.auth.password` 值为 `sentinel`（默认口令）→ fail；检出 dashboard 连接配置但无 auth 配置痕迹 → warn。
- **对应门禁**: fw_sentinel_dashboard_auth(warn)

```verify
id: sentinel-r9
cmd: 
expect: always
```

### 规律：Dashboard 改规则默认不回写数据源，生产须改造 push 模式双向同步
- **适用版本**: Sentinel 1.8.x
- **规律**: 官方 Dashboard 默认实现把规则推送到客户端内存（`transport` 模块 HTTP API），不回写 Nacos 等数据源；数据源里的规则与 Dashboard 显示可能不一致，重启后 Dashboard 改的规则丢失。生产须按官方"生产环境推送规则"指引改造 Dashboard（实现 DynamicRulePublisher 回写数据源）。
- **违反后果**: 运维在 Dashboard 调的规则重启后丢失 / Dashboard 与数据源规则漂移。
- **验证方法**: 检出 `spring.cloud.sentinel.transport.dashboard` + `spring.cloud.sentinel.datasource` 同存 → warn 人工确认 Dashboard 已做 push 模式双向同步改造。
- **对应门禁**: fw_sentinel_dynamic_refresh(warn)

```verify
id: sentinel-r10
cmd: 
expect: always
```

### 规律：fallback/blockHandler 降级逻辑必须轻量，不得再发起远程调用
- **适用版本**: Sentinel 1.8.x
- **规律**: 降级方法在下游已不可用或限流时执行，若内部再调远程接口（RestTemplate/Feign）会级联放大失败、拖长调用链。降级方法应返回本地兜底（缓存/默认值/静态响应）。
- **违反后果**: 降级链路二次失败 → 雪崩传导；降级超时加剧线程占用。
- **验证方法**: 检出 fallback/blockHandler 方法体内含 `restTemplate.`/`RestTemplate`/`feignClient.` 调用 → warn 人工确认降级轻量。
- **对应门禁**: fw_sentinel_fallback_light(warn)

```verify
id: sentinel-r11
cmd: 
expect: always
```

### 规律：资源命名须统一规范，URL 资源与方法资源不得混用风格
- **适用版本**: Sentinel 1.8.x
- **规律**: 资源名是规则绑定的 key，全工程须统一风格（推荐 `模块:动作` 或统一 URL 风格）。@SentinelResource value 与代码 SphU.entry 资源名若一半用 `/api/order` 一半用 `orderQuery`，规则配置与 Dashboard 拓扑将混乱难维护。
- **违反后果**: 规则配错资源名不生效（静默无保护）；Dashboard 资源拓扑爆炸难治理。
- **验证方法**: 检出多个 @SentinelResource 且 value 风格混用（部分含 `/` 路径风格、部分纯标识符）→ warn。
- **对应门禁**: fw_sentinel_resource_naming(warn)

```verify
id: sentinel-r12
cmd: 
expect: always
```

### 规律：异常比例熔断须用 exceptionsToIgnore 排除业务校验异常，避免误统计
- **适用版本**: Sentinel 1.8.x（@SentinelResource exceptionsToTrace/exceptionsToIgnore 1.8.0 引入）
- **规律**: 异常比例/异常数熔断统计的是资源抛出的异常；业务校验异常（参数错误、库存不足等预期内异常）不应计入熔断统计，否则正常业务拒绝会把资源熔断。@SentinelResource 用 `exceptionsToIgnore` 排除、`exceptionsToTrace` 限定统计范围；代码方式用 `Tracer.ignore`。
- **违反后果**: 业务异常比例升高 → 资源被误熔断 → 正常流量被拒。
- **验证方法**: 检出异常比例/异常数熔断（`DEGRADE_GRADE_EXCEPTION`/`exception-ratio`/`exception-count`）但 @SentinelResource 无 `exceptionsToIgnore`/`exceptionsToTrace` → warn。
- **对应门禁**: fw_sentinel_biz_exception(warn)

```verify
id: sentinel-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_sentinel_rule_persist | fail | 检出 Sentinel 使用但无 datasource 持久化配置 → fail 规则内存丢失风险 (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_resource_fallback | warn | @SentinelResource 无 blockHandler 且无 fallback → warn (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_blockhandler_split | warn | @SentinelResource 有 fallback 无 blockHandler → warn BlockException 上抛 (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_degrade_strategy | warn | 检出熔断规则但无 minRequestAmount → warn 小样本误熔断 (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_param_flow | warn | 检出 ParamFlowRule 但工程无 blockHandler → warn (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_flow_shape | warn | 检出 FlowRule 无 controlBehavior → warn 确认整形策略 (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_system_rule | warn | 检出 Sentinel 使用但无 SystemRule → warn 无全局兜底 (CWE-400) | SENTINEL_SRC_GLOBS |
| fw_sentinel_gateway_flow | warn | gateway + sentinel 但无 gateway-adapter/GatewayFlowRule → warn (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_dashboard_auth | warn | dashboard.password=sentinel 默认口令 → fail；dashboard 无 auth 痕迹 → warn (CWE-521) | SENTINEL_SRC_GLOBS |
| fw_sentinel_dynamic_refresh | warn | transport.dashboard + datasource 同存 → warn 确认 push 模式双向同步 (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_fallback_light | warn | fallback/blockHandler 方法体内含远程调用 → warn (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_resource_naming | warn | @SentinelResource value 风格混用（路径/标识符） → warn (n/a) | SENTINEL_SRC_GLOBS |
| fw_sentinel_biz_exception | warn | 异常比例熔断 + 无 exceptionsToIgnore/Trace → warn (n/a) | SENTINEL_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_sentinel_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/sentinel.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_sentinel_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: sentinel  requires_conf: SENTINEL_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 @SentinelResource 无 fallback + 规则内存未持久化 → rule_persist fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| sentinel × spring-cloud-gateway | 网关限流须用 sentinel-spring-cloud-gateway-adapter + GatewayFlowRule | 普通 FlowRule 不识别 route 维度 |
| sentinel × nacos | 规则持久化推荐 sentinel-datasource-nacos；Dashboard 须改 push 模式回写 | 默认 Dashboard 不回写数据源，规则漂移 |
| sentinel × spring-cloud-openfeign | Feign 熔断可配 `feign.sentinel.enabled=true` 用 Sentinel 替代 Hystrix | Hystrix 已废弃，Spring Cloud 推荐 Sentinel/resilience4j |
| sentinel × dubbo | Dubbo 服务治理须 sentinel-apache-dubbo-adapter 接 provider/consumer 双端限流 | 无适配器则 RPC 入口无保护 |

<!--
本表聚焦 sentinel 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Sentinel 1.6.3 | fallback 不再处理 BlockException，blockHandler/fallback 分工明确 | 旧版只用 fallback 的项目升级后限流异常上抛 |
| Sentinel 1.7.0 | Dashboard 支持登录鉴权（auth.username/auth.password） | 默认口令 sentinel/sentinel 必须修改 |
| Sentinel 1.8.0 | 熔断重构：慢调用比例引入 slowRatioThreshold；@SentinelResource 增加 exceptionsToTrace/Ignore | 旧 maxRt 语义变化，异常统计须显式排除业务异常 |
| Sentinel 1.8.x | 稳定线现行（2026-07 最新 1.8.10）；transport/datasource SPI 稳定 | 本规则集基准版本 |
| Sentinel 2.0.0-alpha | 预览版（2026-02 发布），规则模型/API 待验证，无 GA | 待验证：2.x 行为变化未联网核实，生产不建议采用 alpha |

<!--
记录已知版本陷阱，生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

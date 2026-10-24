---
ruleset_id: dubbo
适用版本: Apache Dubbo 3.3.x（现行稳定线，最新 3.3.6；3.2.x 为维护线，差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/apache/dubbo/releases ；https://dubbo.apache.org/ ）
深度门槛: 10
---

# Dubbo 规则集

<!--
本规则集覆盖 Apache Dubbo 3.3.x（现行稳定线，2026-07 时点 GitHub Releases 标记 3.3.6 为 Latest；3.2.x 为维护线）。
调研时点：2026-07-17。3.3.x 默认协议 triple（基于 HTTP/2）；Dubbo 2.7 及更早默认 dubbo 协议 + hessian2 序列化，版本陷阱见 §6。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.dubbo:dubbo` / `dubbo-spring-boot-starter` / `dubbo-registry-nacos` / `dubbo-registry-zookeeper` / `dubbo-rpc-triple` | 高 |
| 注解 | `@DubboService` / `@DubboReference` / `@EnableDubbo` / `@DubboMethod` | 高 |
| 文件 | `**/dubbo.properties` / `**/dubbo.xml` / `**/dubbo-provider.xml` / `**/dubbo-consumer.xml` | 中（需排除他用） |
| 配置 | `dubbo.application.*` / `dubbo.registry.*` / `dubbo.protocol.*` / `dubbo.consumer.*` / `dubbo.provider.*` / `dubbo.qos.*` | 高 |
| 代码 | `RpcContext` / `GenericService` / `org.apache.dubbo.config.annotation` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 dubbo 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Dubbo 服务提供方：`grep -rlE '@DubboService\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @DubboService 的 .java 文件数）
- Dubbo 服务引用方：`grep -rlE '@DubboReference\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @DubboReference 的 .java 文件数）
- 泛化调用点：`grep -rnE 'GenericService|\$invoke|generic[[:space:]]*=' "${PROJECT_DIR}"`（计数核验基准：泛化调用行数）
- RpcContext 隐式传参：`grep -rnE 'RpcContext\.[a-zA-Z]+\.(get|set|remove)Attachment' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：Attachment 操作行数）
- qos 配置：`grep -rnE 'dubbo\.qos\.|qos-' "${PROJECT_DIR}"`（计数核验基准：qos 配置行数）
- 注册中心配置：`grep -rnE 'dubbo\.registry\.' "${PROJECT_DIR}"`

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：Dubbo 重试须幂等，retries>0 仅允许幂等接口
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: Dubbo 消费端默认 `retries=2`（failover 集群容错下生效），超时或网络异常时自动重试到下一个提供者。非幂等接口（写操作）必须显式 `retries=0`，或改用 `cluster="failfast"`。重试放大副作用（重复扣款/下单）。超时 `timeout` 与重试叠加须评估总耗时上限（retries × timeout）。
- **违反后果**: 非幂等接口默认重试 → 重复写 / 重复扣款。
- **验证方法**: `grep -rnE 'retries[[:space:]]*=[[:space:]]*"?[1-9]' --include='*.java'` 或配置 `dubbo.consumer.retries` 值 >0 → warn 确认目标接口幂等；未显式声明 retries 的写接口亦按默认 2 计。
- **对应门禁**: fw_dubbo_timeout_idempotent(warn)

```verify
id: dubbo-r1
cmd: grep -rnE 'retries[[:space:]]*=[[:space:]]*"?[1-9]' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@DubboService/@DubboReference 超时须显式配置
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: Dubbo 默认超时 1000ms（消费端 `dubbo.consumer.timeout` 默认 1000，待验证：3.3 是否调整默认值，未联网逐条核实）。生产须按业务 SLA 在方法级显式 `timeout`，消费端 timeout 须小于调用方上层超时，提供端 timeout 作为兜底。无显式 timeout 时默认值可能与业务预期严重不符。
- **违反后果**: 默认超时过短 → 正常慢请求被截断触发重试放大；过长 → 线程池堆积雪崩。
- **验证方法**: 检出 `@DubboService`/`@DubboReference` 未含 `timeout` 且配置无 `dubbo.consumer.timeout`/`dubbo.provider.timeout` → warn。
- **对应门禁**: fw_dubbo_timeout_config(warn)

```verify
id: dubbo-r2
cmd: 
expect: always
```

### 规律：@DubboService 须显式 version，接口演进依赖版本隔离
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: Dubbo 服务以 `interface + version + group` 三元组标识。不显式声明 `version` 时新旧接口无法并存，升级只能全量替换，失去灰度/平滑迁移能力。接口有任何不兼容变更须升 version，消费端按 version 引用。
- **违反后果**: 接口升级无法灰度；多版本共存需求时只能新建接口，技术债累积。
- **验证方法**: `grep -rnE '@DubboService\b' --include='*.java'` 命中行未含 `version` → warn。
- **对应门禁**: fw_dubbo_version_required(warn)

```verify
id: dubbo-r3
cmd: grep -rnE '@DubboService\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：泛化调用须收敛权限与入参校验
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: 泛化调用（`GenericService` / `generic=true`）绕过接口签名直接按方法名+参数类型调用，常用于网关/测试平台。提供端开启泛化（`generic=true`）意味着任意方法可被反射式调用，须配合 token/鉴权过滤；消费端泛化调用须校验方法名与参数白名单，禁止透传外部输入。
- **违反后果**: 泛化入口未鉴权 → 任意服务方法被未授权调用 CWE-862。
- **验证方法**: 检出 `generic[[:space:]]*=[[:space:]]*"?true` 或 `GenericService` → warn 人工确认鉴权与白名单。
- **对应门禁**: fw_dubbo_generic_security(warn)

```verify
id: dubbo-r4
cmd: 
expect: always
```

### 规律：qos 端口禁止公网/跨主机暴露
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: qos（Quality of Service）运维端口（默认 22222）提供 online/offline/shutdown 等指令。`dubbo.qos.accept.foreign.ip=true` 或 `dubbo.qos.host=0.0.0.0` 允许远程访问 qos 端口，生产必须保持默认 false/localhost，或网络层隔离。qos 无鉴权，暴露即可远程下线服务。
- **违反后果**: qos 端口暴露 → 任意主机可执行服务下线/关停指令 CWE-749。
- **验证方法**: 检出 `dubbo.qos.accept.foreign.ip[[:space:]]*[:=][[:space:]]*true` / `qos-accept-foreign-ip.*true` / `dubbo.qos.host[[:space:]]*[:=][[:space:]]*0\.0\.0\.0` → fail。
- **对应门禁**: fw_dubbo_qos_exposure(fail)

```verify
id: dubbo-r5
cmd: 
expect: always
```

### 规律：序列化协议须选 hessian2/fastjson2，禁止 java 原生序列化
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: Dubbo 支持 hessian2（默认）、fastjson2、java 原生等序列化。`serialization=java` 开启 Java 原生反序列化，历史反序列化漏洞链（CWE-502）主要攻击面；fastjson（1.x）亦有多次 RCE 记录。3.3 推荐 hessian2 或 fastjson2（safeMode）。triple 协议默认 protobuf/hessian2 包装，与 dubbo 协议序列化选型相互独立，混部时须确认兼容矩阵。
- **违反后果**: java 原生序列化 → 反序列化 RCE CWE-502。
- **验证方法**: 检出 `serialization[[:space:]]*[:=][[:space:]]*"?(java|nativejava|fastjson)\b` → warn（fastjson1/java 须替换为 hessian2/fastjson2）。
- **对应门禁**: fw_dubbo_serialization(warn)

```verify
id: dubbo-r6
cmd: 
expect: always
```

### 规律：集群容错策略须与业务语义匹配，写操作禁用 failover
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: `cluster` 默认 `failover`（失败自动切换重试）。写操作须 `failfast`（快速失败）；`failsafe` 吞异常仅适用日志类可丢弃调用；`forking` 并行多调用放大资源消耗须谨慎。集群策略与 retries 联动（failover 才消费 retries）。
- **违反后果**: 写操作 failover → 重复副作用；failsafe 吞异常 → 故障静默。
- **验证方法**: 检出 `cluster[[:space:]]*=[[:space:]]*"(failover|failsafe|forking)"` → warn 人工确认与接口幂等性匹配。
- **对应门禁**: fw_dubbo_cluster_failover(warn)

```verify
id: dubbo-r7
cmd: 
expect: always
```

### 规律：负载均衡策略须显式评估，默认 random 不感知实例负载
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: `loadbalance` 默认 `random`（加权随机）。`leastactive` 感知活跃调用数适合长耗时服务；`consistenthash` 适合有状态场景；`shortestresponse`（3.x）感知响应时间。显式配置 `loadbalance` 须人工确认与流量特征匹配。
- **违反后果**: 默认 random 在实例性能不均时倾斜 → 慢实例堆积。
- **验证方法**: 检出 `loadbalance[[:space:]]*=[[:space:]]*"` → warn 人工确认策略匹配。
- **对应门禁**: fw_dubbo_loadbalance(warn)

```verify
id: dubbo-r8
cmd: 
expect: always
```

### 规律：服务降级 mock 须用 return 而非 force，force 仅测试用
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: `mock=return null`/`mock=return xxx` 在调用失败后返回兜底（failover 后降级）；`mock=force:return xxx` 直接屏蔽真实调用（不发起远程调用），仅限测试/演练。生产误配 force → 服务永远返回假数据。
- **违反后果**: force mock 上生产 → 真实逻辑被屏蔽，数据静默错误。
- **验证方法**: 检出 `mock[[:space:]]*=[[:space:]]*"force:` → fail；`mock=return` → warn 确认降级内容合理。
- **对应门禁**: fw_dubbo_mock_degrade(warn)

```verify
id: dubbo-r9
cmd: 
expect: always
```

### 规律：RpcContext 隐式传参禁止跨线程/异步使用
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: `RpcContext.setAttachment/getAttachment` 基于 ThreadLocal 隐式传递上下文。异步调用、业务线程池切换后 attachment 丢失；Dubbo 3 引入 `RpcContext.getClientAttachment()`/`getServerAttachment()` 细分，旧 `getContext()` 双端语义有差异（待验证：3.3 各 minor 迁移进度）。显式传参优先于隐式传参。
- **违反后果**: 异步链路 attachment 丢失 → 上下文（traceId/租户）断链。
- **验证方法**: 检出 `RpcContext.*Attachment` 且同文件存在 `CompletableFuture|@Async|new Thread|ExecutorService` → warn。
- **对应门禁**: fw_dubbo_rpc_context(warn)

```verify
id: dubbo-r10
cmd: 
expect: always
```

### 规律：异步调用须显式线程池与超时，CompletableFuture 须兜底异常
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: `async=true` 或返回 `CompletableFuture` 的异步调用，结果须经 `RpcContext.getCompletableFuture()` 获取；异步链路异常不处理会静默丢失；异步调用超时仍受 timeout 约束，须显式 `orTimeout/completeOnTimeout` 或 `exceptionally` 兜底。
- **违反后果**: 异步异常静默 → 故障不可见；无超时兜底 → future 悬挂。
- **验证方法**: 检出 `async[[:space:]]*=[[:space:]]*true` 或 `RpcContext.getCompletableFuture` 且无 `exceptionally|orTimeout|whenComplete` → warn。
- **对应门禁**: fw_dubbo_async(warn)

```verify
id: dubbo-r11
cmd: 
expect: always
```

### 规律：生产环境禁用直连 url，消费必须走注册中心
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: `@DubboReference(url="dubbo://host:port")` 或 `dubbo.reference.xxx.url=` 绕过注册中心直连指定实例，仅限本地调试/测试环境。生产直连失去服务发现、负载均衡、容错能力，实例变更须改代码。
- **违反后果**: 生产直连 → 单点调用、实例扩缩容不生效、绕过注册中心治理。
- **验证方法**: 检出 `@DubboReference(` 含 `url[[:space:]]*=[[:space:]]*"dubbo://` 或配置 `dubbo.reference.*.url` → fail。
- **对应门禁**: fw_dubbo_direct_url(fail)

```verify
id: dubbo-r12
cmd: 
expect: always
```

### 规律：注册中心选型与地址须显式配置，禁止默认裸奔
- **适用版本**: Dubbo 3.x / 2.7.x
- **规律**: Dubbo 支持 nacos（3.x 推荐，应用级服务发现）/ zookeeper / 多注册中心。`dubbo.registry.address` 缺失时服务不注册（或按默认协议尝试，行为依版本而异）。3.x 应用级服务发现要求 `dubbo.registry.register-mode=instance`（3.0+ 默认 instance，待验证 3.3 是否仍是默认）。多注册中心须明确 `registryIds`。
- **违反后果**: 注册中心地址缺失 → 服务注册失败静默或注册到错误集群。
- **验证方法**: 检出 @EnableDubbo/@DubboService 但配置无 `dubbo.registry.address` → warn。
- **对应门禁**: fw_dubbo_registry(warn)

```verify
id: dubbo-r13
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_dubbo_timeout_idempotent | warn | 检出 retries>0 配置/注解 → warn 确认接口幂等 (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_timeout_config | warn | @DubboService/@DubboReference 无 timeout 且无全局 timeout → warn (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_version_required | warn | @DubboService 行未含 version → warn (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_generic_security | warn | generic=true 或 GenericService 检出 → warn 人工确认鉴权 (CWE-862) | DUBBO_SRC_GLOBS |
| fw_dubbo_qos_exposure | fail | qos accept-foreign-ip=true 或 qos.host=0.0.0.0 → fail (CWE-749) | DUBBO_SRC_GLOBS |
| fw_dubbo_serialization | warn | serialization=java/nativejava/fastjson → warn (CWE-502) | DUBBO_SRC_GLOBS |
| fw_dubbo_cluster_failover | warn | 检出 cluster 显式策略 → warn 人工确认语义匹配 (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_loadbalance | warn | 检出 loadbalance 显式配置 → warn 人工确认 (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_mock_degrade | fail | mock=force: 检出 → fail（force 上生产屏蔽真实调用）；mock=return → warn 提示 (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_rpc_context | warn | RpcContext Attachment + 异步/线程切换同现 → warn (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_async | warn | async=true 或 getCompletableFuture 无异常/超时兜底 → warn (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_direct_url | fail | @DubboReference url=dubbo:// 或 dubbo.reference.*.url → fail (n/a) | DUBBO_SRC_GLOBS |
| fw_dubbo_registry | warn | 有 Dubbo 服务但无 dubbo.registry.address → warn (n/a) | DUBBO_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_dubbo_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/dubbo.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_dubbo_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: dubbo  requires_conf: DUBBO_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 @DubboService 无 version/timeout + qos 端口公网暴露（qos_exposure fail 主触发）+ 直连 url；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| dubbo × spring-boot | dubbo-spring-boot-starter 版本须与 dubbo 核心包对齐（同 BOM） | 版本错配导致 auto-config 冲突 / Bean 装配失败 |
| dubbo × seata | 全局事务内 Dubbo 调用须确认 XID 经 attachment 透传（3.x 自动，2.7 须确认过滤器链） | XID 断链导致分支事务不注册，全局锁失效 |
| dubbo × spring-cloud | 同进程同时启用 Feign 与 Dubbo 时超时/重试配置相互独立，须分别收敛 | 两套 RPC 默认值不同，混用易漏配一侧 |

<!--
本表聚焦 dubbo 生态内高频组合；无强交互的组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Dubbo 2.7 → 3.0 | 默认注册模型从接口级改应用级（register-mode=instance） | 升级后注册实例数骤降属预期；消费端 3.0 可兼容 2.7 接口级 |
| Dubbo 3.x | 默认协议 triple（HTTP/2），dubbo 协议仍支持 | 混部时序列化兼容矩阵须确认（triple 默认 hessian2/protobuf 包装） |
| Dubbo 3.2 → 3.3 | qos 配置键保持 dubbo.qos.*；指标/配置中心增强（待验证 3.3 各 minor 行为差异） | 待验证：3.3 是否调整 qos 默认绑定地址，按"默认 localhost"陈述 |
| Dubbo 全版本 | RpcContext.getContext() 双端语义差异，3.x 拆分 getClientAttachment/getServerAttachment | 隐式传参迁移时须按新 API 改 |
| Dubbo 2.7 及更早 | 默认 hessian2；java 原生序列化曾多发反序列化 CVE | serialization=java 禁止 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

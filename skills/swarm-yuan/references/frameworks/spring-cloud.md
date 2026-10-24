---
ruleset_id: spring-cloud
适用版本: Spring Cloud 2024.x（Moorgate）/ 2025.x（待验证 GA 时点与 Boot 4 兼容矩阵；差异单独标注）
最后调研: 2026-07-17（来源：https://spring.io/projects/spring-cloud ；https://docs.spring.io/spring-cloud-openfeign/reference/ ；https://docs.spring.io/spring-cloud-loadbalancer/reference/ ；https://docs.spring.io/spring-cloud-config/reference/ ；https://docs.spring.io/spring-cloud-gateway/reference/ ；https://github.com/spring-cloud/spring-cloud-release ）
深度门槛: 12
---

# Spring Cloud 规则集

<!--
本规则集覆盖 Spring Cloud 2024.x（Moorgate，对应 Spring Boot 3.4）与 2025.x（对应 Boot 4.0，待验证 GA 时点）。
调研时点：2026-07-17。Spring Cloud 2025.x release train 与 Boot 4.0 兼容矩阵：待验证（2025-11 Spring Boot 4.0 GA 后 Spring Cloud 跟进版本号未联网核实，规律按"2025.x ↔ Boot 4.0"陈述并标待验证）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.cloud:spring-cloud-starter` / `spring-cloud-starter-openfeign` / `spring-cloud-starter-loadbalancer` / `spring-cloud-starter-gateway` / `spring-cloud-starter-config` / `spring-cloud-starter-netflix-eureka-client` / `spring-cloud-starter-bus` | 高 |
| 注解 | `@EnableFeignClients` / `@EnableDiscoveryClient` / `@RefreshScope` / `@FeignClient` | 高 |
| 文件 | `**/bootstrap.yml` / `**/bootstrap.properties` / `**/spring-cloud-bootstrap.yml` | 中（Boot 2.4+ 默认弃用 bootstrap，改 import） |
| 配置 | `spring.cloud.config.*` / `spring.cloud.gateway.routes.*` / `feign.client.*` / `spring.cloud.loadbalancer.*` / `eureka.client.*` / `spring.cloud.bus.*` | 高 |
| 代码 | `@FeignClient` / `SpringCloudLoadBalancer` / `RouteLocator` / `@RefreshScope` / `DiscoveryClient` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 spring-cloud 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Feign client 接口：`grep -rlE '@FeignClient\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @FeignClient 的 .java 文件数 = `grep -l … | wc -l`）
- Gateway 路由定义：`grep -rnE 'RouteLocator|spring\.cloud\.gateway\.routes' "${PROJECT_DIR}"`（计数核验基准：路由定义行数）
- @RefreshScope Bean：`grep -rlE '@RefreshScope\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：Bean 文件数）
- 配置中心引用：`grep -rnE 'spring\.cloud\.config\.(uri|name|label|import)' "${PROJECT_DIR}"`
- LoadBalancer 配置：`grep -rnE 'spring\.cloud\.loadbalancer\.' "${PROJECT_DIR}"`
- Bus 刷新端点：`grep -rnE 'spring\.cloud\.bus\.' "${PROJECT_DIR}"`

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：@FeignClient 须配 fallback 或 fallbackFactory 实现熔断降级
- **适用版本**: Spring Cloud OpenFeign 4.x（2024.x / 2025.x）
- **规律**: `@FeignClient` 默认无 fallback，下游服务不可用时直接抛异常向上传播。生产须配 `fallback` 或 `fallbackFactory` 实现降级逻辑，返回兜底响应。`fallbackFactory` 可获取异常原因，优于 `fallback`。
- **违反后果**: 下游抖动导致调用方雪崩；无降级时错误直达用户。
- **验证方法**: `grep -rnE '@FeignClient\b' --include='*.java'` 命中行未含 `fallback`/`fallbackFactory` → warn。
- **对应门禁**: fw_scloud_feign_fallback(warn)

```verify
id: spring-cloud-r1
cmd: grep -rnE '@FeignClient\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Feign client 超时须显式配置，区分 connectTimeout 与 readTimeout
- **适用版本**: Spring Cloud OpenFeign 4.x
- **规律**: OpenFeign 默认 `connectTimeout=10s`、`readTimeout=60s`（4.x 起默认行为，待验证：4.x 是否调整默认值，未联网核实）。生产须按业务显式配置 `feign.client.config.default.connect-timeout`/`read-timeout`，避免长超时拖垮线程池。`connectTimeout` 应短（连接建立快），`readTimeout` 按业务 SLA。
- **违反后果**: 默认超时过长 → 下游慢响应拖垮调用方线程池；过短 → 正常请求被截断。
- **验证方法**: 检出 `@FeignClient` 但配置无 `feign.client.config.*connect-timeout`/`*read-timeout` → warn。
- **对应门禁**: fw_scloud_feign_timeout(warn)

```verify
id: spring-cloud-r2
cmd: 
expect: always
```

### 规律：Feign 重试须谨慎，非幂等接口禁用重试
- **适用版本**: Spring Cloud OpenFeign 4.x
- **规律**: `feign.Retryer` 默认不重试（`Retryer.NEVER_RETRY`）。开启重试须确认被调接口幂等（GET 安全；POST/PUT/DELETE 非幂等须禁重试）。`Retryer.Default` 默认最大 5 次。重试与超时叠加可能导致请求放大。
- **违反后果**: 非幂等接口重试 → 重复扣款 / 重复下单。
- **验证方法**: 检出 `Retryer` 配置或 `feign.client.config.*retryer` → warn 人工确认目标接口幂等性。
- **对应门禁**: fw_scloud_feign_retry(warn)

```verify
id: spring-cloud-r3
cmd: 
expect: always
```

### 规律：Spring Cloud LoadBalancer 重试须对幂等谓词生效
- **适用版本**: Spring Cloud LoadBalancer 4.x
- **规律**: `spring.cloud.loadbalancer.retry.enabled=true` 开启重试，默认仅对 GET 请求重试（`Retryable exchanges` 须幂等）。配置 `spring.cloud.loadbalancer.retry.retry-on-all-operations=true` 会对所有 HTTP 方法重试，此时非幂等接口（POST/DELETE）须排除。重试次数 `max-retries-on-same-service-instance`/`max-retries-on-next-service-instance` 须收敛。
- **违反后果**: `retry-on-all-operations=true` + 非幂等接口 → 重复副作用。
- **验证方法**: 检出 `retry-on-all-operations[[:space:]]*[:=][[:space:]]*true` → warn 确认无非幂等接口。
- **对应门禁**: fw_scloud_lb_retry_idempotent(warn)

```verify
id: spring-cloud-r4
cmd: 
expect: always
```

### 规律：Gateway 路由谓词顺序敏感，须按 specificity 降序排列
- **适用版本**: Spring Cloud Gateway 4.x
- **规律**: Gateway 路由按声明顺序匹配，首个匹配的路由生效。高 specificity 谓词（如 Path=/api/orders/{id}）须排在低 specificity 谓词（如 Path=/api/**）之前，否则被宽泛路由吞掉。`RouteLocator` 中 `.route(...)` 顺序即匹配顺序；yml 中 `routes` 列表顺序即匹配顺序。
- **违反后果**: 宽泛路由前置导致精细路由失效 / 请求被错误处理。
- **验证方法**: 检出多条 Gateway 路由，若 `Path=/**` 或 `Path=/api/**` 出现在具体路径路由之前 → warn。
- **对应门禁**: fw_scloud_gateway_route_order(warn)

```verify
id: spring-cloud-r5
cmd: 
expect: always
```

### 规律：@RefreshScope 须配合 Config Bus 或 /actuator/refresh，配置刷新粒度须明确
- **适用版本**: Spring Cloud Config 4.x / Bus 4.x
- **规律**: `@RefreshScope` 让 Bean 在配置刷新（`/actuator/refresh` 或 Bus `/actuator/busrefresh`）后重建。滥用 @RefreshScope 会导致 Bean 代理化、首次访问延迟重建。须明确哪些 Bean 需要动态刷新（如数据源参数、限流阈值），非动态配置不标 @RefreshScope。
- **违反后果**: @RefreshScope 滥用 → 代理开销、首次访问延迟、状态丢失。
- **验证方法**: `@RefreshScope` 标注的 Bean 须确认其依赖的配置项会动态变更；无配置中心的项目误用 @RefreshScope → warn。
- **对应门禁**: fw_scloud_refresh_scope(warn)

```verify
id: spring-cloud-r6
cmd: 
expect: always
```

### 规律：Config 配置中心须配 fail-fast 与重试，避免启动期静默用本地默认
- **适用版本**: Spring Cloud Config 4.x
- **规律**: 客户端连配置中心失败时默认不 fail-fast，静默用本地 `application.yml`，可能导致生产用错配置。生产须 `spring.cloud.config.fail-fast=true` + 配重试（`spring.retry.*`），启动期连不上配置中心直接失败而非降级本地。
- **违反后果**: 配置中心不可达时静默用本地默认配置 → 生产用错参数（如数据库指向测试库）。
- **验证方法**: 检出 `spring.cloud.config.uri` 但无 `fail-fast[[:space:]]*[:=][[:space:]]*true` → warn。
- **对应门禁**: fw_scloud_config_failfast(warn)

```verify
id: spring-cloud-r7
cmd: 
expect: always
```

### 规律：bootstrap.yml 在 Boot 2.4+ 默认弃用，须改 spring.config.import
- **适用版本**: Spring Cloud 2020.0+（Boot 2.4+）
- **规律**: Spring Boot 2.4 起默认不加载 `bootstrap.yml`，Spring Cloud 改用 `spring.config.import=configserver:` 引入配置中心。残留 `bootstrap.yml` 须迁移至 `application.yml` 的 `spring.config.import`，或显式引入 `spring-cloud-starter-bootstrap` 依赖恢复旧行为。
- **违反后果**: bootstrap.yml 不被加载 → 配置中心配置不生效，静默用本地配置。
- **验证方法**: 存在 `bootstrap.yml`/`bootstrap.properties` 且无 `spring-cloud-starter-bootstrap` 依赖 → warn。
- **对应门禁**: fw_scloud_bootstrap_deprecated(warn)

```verify
id: spring-cloud-r8
cmd: 
expect: always
```

### 规律：服务发现客户端须配健康检查与注册间隔，避免僵尸实例
- **适用版本**: Spring Cloud Netflix Eureka Client 4.x / Spring Cloud LoadBalancer 4.x
- **规律**: Eureka 默认 30s 心跳续约、90s 剔除。生产须开启健康检查 `eureka.client.healthcheck.enabled=true`（用 actuator health 替代心跳），并按实例规模调整 `lease-renewal-interval-in-seconds`/`lease-expiration-duration-in-seconds`。LoadBalancer 缓存须配合理 TTL。
- **违反后果**: 实例下线后仍被路由 → 请求失败；心跳过频增加 Eureka 负载。
- **验证方法**: 检出 `eureka.client` 配置但无 `healthcheck.enabled` → warn。
- **对应门禁**: fw_scloud_discovery_healthcheck(warn)

```verify
id: spring-cloud-r9
cmd: 
expect: always
```

### 规律：Feign client 须配日志级别收敛，避免生产 FULL 日志
- **适用版本**: Spring Cloud OpenFeign 4.x
- **规律**: OpenFeign 日志级别 `NONE/BASIC/HEADERS/FULL`，默认 NONE。生产误配 `logging.level.<feign-client>=FULL` 会打印全部请求/响应体（含敏感信息），性能与安全双风险。调试用 BASIC/HEADERS，生产用 NONE/BASIC。
- **违反后果**: FULL 日志泄露敏感请求体 / 日志量爆炸。
- **验证方法**: 检出 `logging.level.*feign*=FULL` 或 `feign.client.config.*.logger-level=FULL` → warn。
- **对应门禁**: fw_scloud_feign_log_level(warn)

```verify
id: spring-cloud-r10
cmd: 
expect: always
```

### 规律：Gateway 须配限流过滤器，避免下游被流量冲垮
- **适用版本**: Spring Cloud Gateway 4.x
- **规律**: Gateway 作为入口网关须配限流（`RequestRateLimiter` 过滤器 + Redis RateLimiter），按 IP/用户/接口维度限流。无限流的网关仅转发不保护下游。
- **违反后果**: 突发流量冲垮下游服务。
- **验证方法**: 检出 Gateway 路由定义但无 `RequestRateLimiter` 过滤器 → warn。
- **对应门禁**: fw_scloud_gateway_ratelimit(warn)

```verify
id: spring-cloud-r11
cmd: 
expect: always
```

### 规律：分布式配置须配加密（对称/非对称），敏感配置禁止明文存储配置中心
- **适用版本**: Spring Cloud Config 4.x
- **规律**: 配置中心存储的数据库口令、密钥等敏感配置须加密：对称加密 `encrypt.key` 或非对称 `encrypt.key-store`。`{cipher}` 前缀标识加密值。明文存储敏感配置导致配置中心泄露即全部泄露。
- **违反后果**: 配置中心被未授权访问 → 全量敏感配置泄露 CWE-312。
- **验证方法**: 配置中心检出敏感 key（password/secret/key/token）对应值非 `{cipher}` 前缀 → fail。
- **对应门禁**: fw_scloud_config_encrypt(fail)

```verify
id: spring-cloud-r12
cmd: 
expect: always
```

### 规律：release train 须与 Spring Boot 版本矩阵严格对齐
- **适用版本**: Spring Cloud 2024.x ↔ Boot 3.4；2025.x ↔ Boot 4.0（待验证）
- **规律**: Spring Cloud release train 与 Spring Boot 版本严格绑定（如 2024.x 对应 Boot 3.4）。版本不匹配会导致 auto-configuration 冲突、Bean 装配失败、API 不兼容。`spring-cloud-dependencies` BOM 须与 Boot 版本对齐。
- **违反后果**: 版本错配启动失败 / 运行期 NoSuchMethodError。
- **验证方法**: 检出 `spring-cloud-dependencies` 版本与 Boot 版本不符矩阵 → warn（人工核对矩阵）。
- **对应门禁**: fw_scloud_version_matrix(warn)

```verify
id: spring-cloud-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥12 门槛）。每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_scloud_feign_fallback | warn | @FeignClient 未含 fallback/fallbackFactory → warn 降级缺失 (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_feign_timeout | warn | 检出 @FeignClient 但无 feign.client.config.*connect-timeout/read-timeout → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_feign_retry | warn | 检出 Retryer 配置 → warn 确认接口幂等性 (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_lb_retry_idempotent | warn | retry-on-all-operations=true → warn 非幂等风险 (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_gateway_route_order | warn | Path=/** 前置于具体路径路由 → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_refresh_scope | warn | 无配置中心项目误用 @RefreshScope → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_config_failfast | warn | spring.cloud.config.uri 无 fail-fast=true → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_bootstrap_deprecated | warn | bootstrap.yml 存在且无 spring-cloud-starter-bootstrap → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_discovery_healthcheck | warn | eureka.client 无 healthcheck.enabled → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_feign_log_level | warn | Feign 日志级别 FULL → warn (CWE-532) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_gateway_ratelimit | warn | Gateway 路由无 RequestRateLimiter → warn (CWE-770) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_config_encrypt | fail | 配置中心敏感 key 值非 {cipher} 前缀 → fail 明文泄露 (CWE-312) | SPRINGCLOUD_SRC_GLOBS |
| fw_scloud_version_matrix | warn | spring-cloud-dependencies 版本与 Boot 不符矩阵 → warn (n/a) | SPRINGCLOUD_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_scloud_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/spring-cloud.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_scloud_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: spring-cloud  requires_conf: VAR1 VAR2` 声明。
fixture 验证覆盖：violating 含 @FeignClient 无 fallback + 超时未配 + 配置中心明文 password → config_encrypt fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| spring-cloud × spring-boot | release train 须与 Boot 版本矩阵对齐 | 版本不匹配导致 auto-config 冲突 |
| spring-cloud × mybatis | 多服务共用 Mapper 接口包名时 @MapperScan 须加 basePackages 区分 | 否则跨服务 Bean 扫描冲突 |
| spring-cloud × spring-security | Gateway/Feign 须传递认证 token，SecurityFilterChain 须放行内部服务调用 | 否则服务间调用 401 |
| spring-cloud-openfeign × resilience4j | Feign 熔断推荐 resilience4j 替代已废弃的 Hystrix | Hystrix 不再维护，resilience4j 是 Spring Cloud 推荐熔断器 |

<!--
无强交互的框架组合省略；本表聚焦 spring-cloud 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Spring Cloud 2020.0 | bootstrap.yml 默认弃用，改 spring.config.import | 残留 bootstrap.yml 不加载，配置不生效 |
| Spring Cloud 2022.0 | 移除 Spring Cloud Netflix Hystrix；推荐 resilience4j | Hystrix 相关配置失效 |
| Spring Cloud 2024.0 | 对应 Boot 3.4；OpenFeign 4.x 调整默认超时（待验证具体值）| 待验证：feign 默认超时变化须人工核实 |
| Spring Cloud 2025.x | 对应 Boot 4.0；jakarta 终态（待验证 GA 时点）| 待验证：2025.x 是否已 GA，规律按"2025.x ↔ Boot 4.0"陈述 |
| Spring Cloud Gateway 4.x | RoutePredicateFactory API 稳定；`spring.cloud.gateway.default-filters` | 默认过滤器顺序须确认 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

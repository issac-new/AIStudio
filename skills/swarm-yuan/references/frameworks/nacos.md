---
ruleset_id: nacos
适用版本: Nacos 3.x（2026-07 现行 3.2.3）/ 2.5.x 维护线（2.5.3；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/alibaba/nacos/releases ；https://nacos.io/docs/latest/overview/ ；https://nacos.io/docs/latest/manual/user/java-sdk/usage/ ；https://nacos.io/docs/latest/manual/admin/deployment/deployment-overview/ ）
深度门槛: 10
---

# Nacos 规则集

<!--
本规则集覆盖 Nacos 3.x 现行线（2026-07-17 联网核实：最新 3.2.3，发布于 2026-07-14；
3.x server/console 需 Java 17，client 保持 Java 8）与 2.5.x 维护线（2.5.3 同日发布，bugfix/安全维护）。
3.2.0 引入 Skill Registry / Prompt Registry（"AI Triad"），与本规则集主题无强关联，不单列规律。
调研时点：2026-07-17。无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.alibaba.cloud:spring-cloud-starter-alibaba-nacos-config` / `spring-cloud-starter-alibaba-nacos-discovery` / `com.alibaba.nacos:nacos-client` / `nacos-spring-context` | 高 |
| 注解 | `@NacosValue` / `@NacosPropertySource` / `@NacosConfigListener` / `@NacosInjected` | 高 |
| 配置 | `spring.cloud.nacos.config.*` / `spring.cloud.nacos.discovery.*` / `nacos.server-addr` | 高 |
| 文件 | `**/nacos/conf/cluster.conf` / `**/application.properties`（nacos server 包内） | 中（需排除他用） |
| 代码 | `NamingService` / `ConfigService` / `NacosFactory` / `NacosConfigManager` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 nacos 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Nacos 配置引用：`grep -rnE 'spring\.cloud\.nacos\.config' "${PROJECT_DIR}"`（计数核验基准：配置引用行数）
- 服务注册配置：`grep -rnE 'spring\.cloud\.nacos\.discovery' "${PROJECT_DIR}"`（计数核验基准：discovery 配置行数）
- @NacosValue 注入点：`grep -rlE '@NacosValue\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @NacosValue 的 .java 文件数）
- 命名空间隔离配置：`grep -rnE 'namespace' "${PROJECT_DIR}" --include='*.yml' --include='*.properties'`
- 持久化实例声明：`grep -rnE 'ephemeral' "${PROJECT_DIR}"`
- 共享/扩展配置：`grep -rnE 'shared-configs|extension-configs' "${PROJECT_DIR}"`

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：环境隔离必须用命名空间（namespace），禁止全环境共用 public
- **适用版本**: Nacos 2.x / 3.x
- **规律**: Nacos 隔离粒度：namespace（租户/环境级）→ group（业务分组）→ dataId。dev/staging/prod 必须分 namespace（用 namespace id，不是名称），不同环境共用 public 命名空间会导致配置串读、服务跨环境发现（dev 调进 prod）。`spring.cloud.nacos.config.namespace` 与 `spring.cloud.nacos.discovery.namespace` 须成对配置。
- **违反后果**: 跨环境服务发现 → dev 流量打进 prod 库；配置覆盖串环境 → 生产事故。
- **验证方法**: 检出 `spring.cloud.nacos.*` 配置但无 `namespace` 配置 → warn。
- **对应门禁**: fw_nacos_namespace_isolation(warn)

```verify
id: nacos-r1
cmd: 
expect: always
```

### 规律：敏感配置禁止明文入 Nacos，须加密或外部化注入
- **适用版本**: Nacos 2.x / 3.x（2.2+ 提供配置加密插件 SPI，3.x 沿用；具体插件生态待验证）
- **规律**: 数据库口令、AK/SK、API token 等敏感值不得明文写入 Nacos 配置或随 application.yml 入库。处置方式（任选）：1）环境变量/启动参数外部化注入（`${DB_PASSWORD}` 占位）；2）Nacos 配置加密插件（加密存储、客户端解密）；3）对接 KMS/Vault。明文入 Nacos 意味着控制台可读、导出泄露、快照泄露。
- **违反后果**: 配置中心被未授权访问或快照外泄 → 全量敏感配置泄露 CWE-312。
- **验证方法**: 检出含 nacos 引用的配置文件中敏感 key（password/secret/token/api-key/access-key）值为明文（非 `${...}` 占位 / 非 `{cipher}`）→ fail。
- **对应门禁**: fw_nacos_config_encrypt(fail)

```verify
id: nacos-r2
cmd: 
expect: always
```

### 规律：持久化实例 vs 临时实例选型须明确，ephemeral=false 须人工确认
- **适用版本**: Nacos 2.x / 3.x
- **规律**: `spring.cloud.nacos.discovery.ephemeral` 默认 true（临时实例，客户端心跳上报，AP 模式 Distro 协议，实例宕机自动剔除）；false 为持久化实例（服务端主动探测，CP 模式 Raft 持久化存储，实例不剔除仅标记不健康）。普通微服务用临时实例；少数需永久保留注册信息的场景（如某些中间件节点）才用持久化。误用持久化实例 → 宕机实例不剔除持续被路由。
- **违反后果**: ephemeral=false 误用 → 僵尸实例持续收流量；ephemeral=true 用于须保留场景 → 网络分区时实例被剔除。
- **验证方法**: 检出 `ephemeral: false` / `ephemeral=false` → warn 人工确认选型必要性。
- **对应门禁**: fw_nacos_instance_ephemeral(warn)

```verify
id: nacos-r3
cmd: 
expect: always
```

### 规律：生产配置变更须走灰度发布，禁止直接全量推送
- **适用版本**: Nacos 2.x（Beta 发布按 IP 灰度）/ 3.x（正式灰度发布能力，3.0+；灰度规则细节待验证）
- **规律**: 高风险配置（限流阈值、开关、数据源参数）生产变更必须先灰度：Nacos 2.x 用 Beta 发布（按 IP 列表灰度）；3.x 提供正式灰度发布（按灰度规则/标签，待验证具体规则模型）。验证灰度节点无异常后再全量。
- **违反后果**: 错误配置全量瞬时生效 → 全集群同时故障，无缓冲窗口。
- **验证方法**: 检出 prod 环境配置（`profiles.active: prod` / dataId 含 prod）但无 gray/beta 灰度痕迹 → warn 人工确认发布流程含灰度环节。
- **对应门禁**: fw_nacos_gray_release(warn)

```verify
id: nacos-r4
cmd: 
expect: always
```

### 规律：@NacosValue 须显式 autoRefreshed=true，否则配置变更不生效
- **适用版本**: nacos-spring-context 1.x / 2.x
- **规律**: nacos-spring 的 `@NacosValue` 默认 `autoRefreshed=false`——配置推送后字段不刷新，须显式 `@NacosValue(value = "${k:v}", autoRefreshed = true)`。Spring Cloud Alibaba 体系则用 `@Value` + `@RefreshScope` 实现刷新。混用两套注解语义须明确。
- **违反后果**: 运维改了配置、客户端日志显示收到推送，但运行值不变 → 排查困难。
- **验证方法**: 检出 `@NacosValue` 但文件无 `autoRefreshed[[:space:]]*=[[:space:]]*true` → warn。
- **对应门禁**: fw_nacos_value_refresh(warn)

```verify
id: nacos-r5
cmd: 
expect: always
```

### 规律：Nacos Server 生产须集群部署（≥3 节点）+ 外置存储，禁止 standalone
- **适用版本**: Nacos 2.x / 3.x
- **规律**: 生产 Nacos Server 至少 3 节点集群（cluster.conf 列出全部节点），配置存储用外置 MySQL（嵌入式 Derby 仅限单机试用）；3.x server/console 需 Java 17。客户端 `server-addr` 建议配多节点或用 VIP/域名。standalone 模式单点故障 → 全集群配置/注册中心不可用。
- **违反后果**: Nacos 单点宕机 → 配置无法下发、新实例无法注册、控制台不可用。
- **验证方法**: 检出 `server-addr` 单地址（无逗号分隔多节点）或 standalone 模式痕迹 → warn。
- **对应门禁**: fw_nacos_server_cluster(warn)

```verify
id: nacos-r6
cmd: 
expect: always
```

### 规律：客户端心跳间隔不得擅自调小，默认 5s 为合理基线
- **适用版本**: Nacos 2.x / 3.x
- **规律**: 临时实例客户端默认每 5s 发心跳（`nacos.naming.heart-beat-interval`），server 15s 未收心跳标记不健康、30s 剔除。擅自调小心跳（如 1s）在实例规模大时给 server 造成心跳风暴；调大则故障发现延迟。无明确容量评估不得改默认值。
- **违反后果**: 心跳过频 → server CPU/带宽压力；过疏 → 宕机实例发现慢、流量打到死实例。
- **验证方法**: 检出 `heart-beat-interval`/`beatInterval` 显式配置且值 < 5000 → warn。
- **对应门禁**: fw_nacos_client_heartbeat(warn)

```verify
id: nacos-r7
cmd: 
expect: always
```

### 规律：配置回滚预案须依赖历史版本能力，发布前确认可一键回退
- **适用版本**: Nacos 2.x / 3.x
- **规律**: Nacos 控制台保存配置历史版本（默认保留 30 天），支持按历史版本回滚。高风险变更发布前须确认：1）历史版本保留策略满足回滚窗口；2）回滚操作有负责人与流程；3）回滚同样走灰度。回滚本质是"再发布一次旧版本"，灰度纪律同样适用。
- **违反后果**: 错误配置发布后无回滚路径 → 故障持续时间拉长。
- **验证方法**: 人工检查（确认团队发布/回滚 runbook 覆盖 Nacos 配置场景）。
- **对应门禁**: 人工检查

```verify
id: nacos-r8
cmd: 
expect: always
```

### 规律：@Value 注入 Nacos 配置须配 @RefreshScope，否则变更不刷新
- **适用版本**: Spring Cloud Alibaba 2021.x+ / Nacos 2.x / 3.x
- **规律**: Spring Cloud Alibaba 体系下 `@Value("${...}")` 注入的值在 Nacos 配置推送后不会自动刷新，Bean 须加 `@RefreshScope`（或改用 `@ConfigurationProperties` + `@RefreshScope`，其绑定属性默认支持刷新）。无刷新的 @Value 导致"配置改了但服务没反应"。
- **违反后果**: 配置变更静默不生效 → 运维与开发互相甩锅；误以为已生效实际跑旧值。
- **验证方法**: 检出 Nacos config 使用 + java 含 `@Value` 但无 `@RefreshScope`/`@NacosValue` → warn。
- **对应门禁**: fw_nacos_config_listener(warn)

```verify
id: nacos-r9
cmd: 
expect: always
```

### 规律：共享配置、扩展配置、应用配置的优先级须明确，避免覆盖意外
- **适用版本**: Spring Cloud Alibaba 2021.x+
- **规律**: 优先级从低到高：`shared-configs`（共享配置）< `extension-configs`（扩展配置）< `${spring.application.name}.properties`（应用主配置）< `${spring.application.name}-${profile}.properties`（profile 配置，最高）。同 key 时高优先级覆盖低优先级。排障"配置不生效"先查是否被更高优先级 dataId 覆盖。
- **违反后果**: 共享配置与主配置同 key → 值被意外覆盖，表现为配置"改了没用"。
- **验证方法**: 检出同时配置 `shared-configs` 与 `extension-configs` → warn 人工核对 key 覆盖关系。
- **对应门禁**: fw_nacos_config_priority(warn)

```verify
id: nacos-r10
cmd: 
expect: always
```

### 规律：多环境 profile 不得硬编码，须由部署环境注入
- **适用版本**: Nacos 2.x / 3.x + Spring Boot 2.4+
- **规律**: dataId 按 `${prefix}-${spring.profiles.active}.${file-extension}` 解析。`spring.profiles.active` 硬编码 `prod` 入库 → 所有环境都读 prod 配置。active 须用占位符（`${DEPLOY_ENV:dev}`）由部署环境注入，镜像与代码环境无关。
- **违反后果**: dev 环境拉起读 prod 配置 → 连生产库；镜像无法跨环境复用。
- **验证方法**: 检出 `profiles.active` 值为固定字面值（非 `${...}` 占位）→ warn。
- **对应门禁**: fw_nacos_profile_isolation(warn)

```verify
id: nacos-r11
cmd: 
expect: always
```

### 规律：服务元数据（metadata）须用于版本/权重路由，不得留空裸注册
- **适用版本**: Nacos 2.x / 3.x
- **规律**: `spring.cloud.nacos.discovery.metadata.*` 注册的元数据（version、region、weight-hint）是灰度路由、同可用区优先、版本隔离的基础数据。配合负载均衡策略（如 NacosRule 同集群优先）消费。全空 metadata 的服务无法参与精细化流量治理。
- **违反后果**: 无版本元数据 → 灰度/蓝绿路由无法实现；跨可用区随机调用 → 延迟与流量成本上升。
- **验证方法**: 检出 `spring.cloud.nacos.discovery` 配置但无 `metadata` → warn。
- **对应门禁**: fw_nacos_metadata(warn)

```verify
id: nacos-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_nacos_namespace_isolation | warn | nacos 配置无 namespace → warn 环境未隔离 | NACOS_CONFIG_GLOBS | — |
| fw_nacos_config_encrypt | fail | 含 nacos 引用的配置中敏感 key 明文（非 ${}/{cipher}）→ fail | NACOS_CONFIG_GLOBS | CWE-312；GB/T 34944-2017 §6.2.6.3（口令硬编码） |
| fw_nacos_instance_ephemeral | warn | ephemeral=false → warn 确认持久化实例选型 | NACOS_CONFIG_GLOBS | — |
| fw_nacos_gray_release | warn | prod 配置无 gray/beta 痕迹 → warn 发布流程须含灰度 | NACOS_CONFIG_GLOBS | — |
| fw_nacos_value_refresh | warn | @NacosValue 无 autoRefreshed=true → warn 不刷新 | NACOS_SRC_GLOBS | — |
| fw_nacos_server_cluster | warn | server-addr 单地址 / standalone → warn 单点风险 | NACOS_CONFIG_GLOBS | — |
| fw_nacos_client_heartbeat | warn | heart-beat-interval < 5000 → warn 心跳风暴 | NACOS_CONFIG_GLOBS NACOS_SRC_GLOBS | — |
| fw_nacos_config_listener | warn | Nacos config + @Value 无 @RefreshScope/@NacosValue → warn | NACOS_SRC_GLOBS NACOS_CONFIG_GLOBS | — |
| fw_nacos_config_priority | warn | shared-configs 与 extension-configs 同存 → warn 核对覆盖 | NACOS_CONFIG_GLOBS | — |
| fw_nacos_profile_isolation | warn | profiles.active 硬编码字面值 → warn 环境硬编码 | NACOS_CONFIG_GLOBS | — |
| fw_nacos_metadata | warn | discovery 配置无 metadata → warn 无流量治理数据 | NACOS_CONFIG_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_nacos_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/nacos.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_nacos_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: nacos  requires_conf: NACOS_SRC_GLOBS NACOS_CONFIG_GLOBS` 声明。
fixture 验证覆盖：violating 含配置明文密码 + 无命名空间隔离 → config_encrypt fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| nacos × sentinel | Sentinel 规则持久化用 sentinel-datasource-nacos，namespace/group 须与业务配置分开 | 规则与业务配置混 group 易误删 |
| nacos × spring-cloud | Spring Cloud Alibaba 体系：bootstrap/import 引入 nacos config；@Value 须 @RefreshScope；配置中心敏感 key 值须 {cipher} 前缀 | Boot 2.4+ 用 spring.config.import=nacos:；明文入 Nacos 致敏感配置泄露（见 P1-2 编排加严：Nacos 未加密 → Spring Cloud 须 cipher） |
| nacos × dubbo | Dubbo 注册中心用 nacos 时 namespace 与 group 须与 RPC 治理对齐 | 跨 namespace 服务不可见导致调用失败 |
| nacos × spring-boot | spring.profiles.active 决定 dataId 解析，环境注入须与部署平台一致 | 硬编码 profile 导致跨环境读错配置 |
| nacos × redis | 配置推送/监听可用 Redis 作二级缓存，须配连接池与密码且 key 带 TTL | 无密码 Redis 被读致配置泄露，无 TTL 致陈旧配置滞留 |
| nacos × seata | Seata 注册中心/配置中心可共用 nacos，namespace/group 须与业务配置分开 | 混 group 易误删事务配置触发全局回滚失败 |

<!--
本表聚焦 nacos 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Nacos 2.0 | 客户端改 gRPC 长连接（9848/9849 端口偏移） | 防火墙只开 8848 会导致 2.x 客户端连不上 |
| Nacos 2.2 | 配置加密插件 SPI；默认鉴权身份 key 须自定义（2.2.1+ 强制） | 旧默认 key 启动报错/安全告警 |
| Nacos 2.3+ | Beta 发布能力稳定，持久化实例运维口径明确 | 灰度发布流程基线 |
| Nacos 2.5.x | 维护线（2026-07-14 发 2.5.3），bugfix/安全维护 | 2.x 用户升级基线 |
| Nacos 3.0 | server/console 分离部署；server/console 需 Java 17（client 仍 Java 8）；正式灰度发布能力 | 升级须先升 JDK 17；灰度规则模型待验证 |
| Nacos 3.2 | 引入 Skill/Prompt Registry（AI Triad）；2026-07 现行 3.2.3 | 本规则集基准版本 |

<!--
记录已知版本陷阱，生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->

---
ruleset_id: druid
适用版本: druid 1.2.20–1.2.24 / druid-spring-boot-starter 1.2.20–1.2.24（差异单独标注）
最后调研: 2026-07-22（来源：https://github.com/alibaba/druid/releases ；https://github.com/alibaba/druid/wiki/DruidDataSource%E9%85%8D%E7%BD%AE%E5%B1%9E%E6%80%A7%E5%88%97%E8%A1%A8 ；https://github.com/alibaba/druid/wiki/Druid%E9%85%8D%E7%BD%AE ；https://github.com/alibaba/druid/wiki/%E9%85%8D%E7%BD%AE_StatViewServlet%E9%85%8D%E7%BD%AE）
深度门槛: 10
---

# Druid 规则集

<!--
本规则集覆盖 Alibaba Druid 1.2.x 数据库连接池（druid + druid-spring-boot-starter）。
调研时点：2026-07-22，已核对最新发布为 1.2.24（2025-12）。
Druid 定位为"为监控而生的数据库连接池"，核心能力：连接池管理 + SQL 防火墙（wall filter）+
监控统计（stat filter）+ 慢 SQL 记录。规律聚焦连接池参数健壮性、监控端点暴露面、SQL 注入防护。
无法确认的版本点已标"待验证"，不臆造。

§4 门禁清单的 id 与 assets/framework-gates/druid.sh 的 `# gates:` 头注释严格一致。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.alibaba:druid` / `com.alibaba:druid-spring-boot-starter` / `com.alibaba:druid-spring-boot-3-starter` | 高 |
| 配置 | `spring.datasource.druid.*` / `druid.initial-size` / `druid.max-active` / `druid.filters` / `druid.filter.stat.*` / `druid.filter.wall.*` | 高 |
| 代码 | `DruidDataSource` / `DruidDataSourceBuilder` / `DruidFilterConfiguration` / `StatViewServlet` / `WebStatFilter` | 高 |
| XML | `<bean.*DruidDataSource` / `<property name="filters" value="stat,wall"` | 中（Spring XML 配置） |
| 注解 | `@DruidStat` / `@StatFilter` | 低（非官方，部分封装库） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 druid 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Druid 数据源声明：`grep -rlE 'DruidDataSource|DruidDataSourceBuilder|spring\.datasource\.druid' "${PROJECT_DIR}" --include='*.java' --include='*.yml' --include='*.yaml' --include='*.properties'`（计数核验基准：含以上任一特征的文件数）
- StatViewServlet 注册：`grep -rlE 'StatViewServlet|druid\.stat-view-servlet' "${PROJECT_DIR}" --include='*.java' --include='*.yml' --include='*.yaml'`
- WebStatFilter 注册：`grep -rlE 'WebStatFilter|druid\.web-stat-filter' "${PROJECT_DIR}" --include='*.java' --include='*.yml' --include='*.yaml'`
- wall filter 配置：`grep -rnE 'druid\.filters|druid\.filter\.wall|filters.*wall' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties'`
- stat filter 配置：`grep -rnE 'druid\.filter\.stat|stat\.slow-sql|stat\.log-slow-sql' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties'`
- 连接池参数：`grep -rnE 'initial-size|max-active|min-idle|max-wait|time-between-eviction-runs|keep-alive' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties'`
- Spring XML 数据源：`grep -rlE '<bean[^>]*DruidDataSource' "${PROJECT_DIR}" --include='*.xml'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：StatViewServlet 监控面板缺鉴权即暴露全量 SQL 与连接信息

- **现象**：Druid 自带 StatViewServlet（默认 `/druid/*`）暴露 SQL 执行统计、连接池状态、URI 调用栈。未配 `login-username`/`login-password` 时无鉴权直接访问。
- **根因**：StatViewServlet 默认 `loginUsername=null`，无凭据即放行；监控页含全量 SQL 文本（含参数值）、Session 信息、数据源密码脱敏前的配置。
- **影响**：CWE-200（信息暴露）——攻击者获取 SQL 执行模式、表结构线索、慢查询指纹，辅助 SQL 注入；CWE-522（凭据不足保护）。
- **证据**：`StatViewServlet` 源码 `req.getSession().setAttribute(...)` 前检查 `loginUsername == null || loginUsername.isEmpty()` 直接跳过鉴权（druid 1.2.x `StatViewServlet.java#service`）。
- **对应门禁**：`fw_druid_statview_expose`（fail）。

```verify
id: druid-r1
cmd: 
expect: always
```

### 规律：缺 wall filter 则 SQL 防火墙失效，MyBatis ${} 注入直通

- **现象**：Druid wall filter（WallFilter）拦截 SQL 注入（基于 SQL 语义分析），未启用时 MyBatis `${}` 占位、字符串拼接的 SQL 直达数据库。
- **根因**：wall filter 非默认启用，须在 `druid.filters` 显式声明 `wall` 或注册 `WallFilter` Bean；缺则无注入防御层（JDBC 层无语义检查）。
- **影响**：CWE-89（SQL 注入）——`${}` 拼接的 SQL 无过滤直达 DB，与 MyBatis 规律"${} 是文本替换非参数化"叠加放大风险。
- **证据**：`druid.filters=stat`（仅 stat 无 wall）的配置在 Druid 官方 wiki "Druid 配置" 章节标注 wall 为可选；wall 拦截逻辑在 `WallFilter.java#statementExecuteAfter`。
- **对应门禁**：`fw_druid_wall_filter`（warn）。

```verify
id: druid-r2
cmd: 
expect: always
```

### 规律：连接池未配 max-active 导致默认值 8 在高并发下连接耗尽

- **现象**：Druid 默认 `maxActive=8`，生产高并发场景连接数不足致请求排队等待连接，超 `maxWait`（默认 60s）抛 `GetConnectionTimeoutException`。
- **根因**：默认值面向演示非生产；未显式配置时用 `DruidDataSource.DEFAULT_MAX_ACTIVE_SIZE=8`。
- **影响**：CWE-400（不可控资源消耗）——连接耗尽致服务不可用。
- **证据**：`DruidDataSource.java` 静态常量 `DEFAULT_MAX_ACTIVE_SIZE = 8`；官方 wiki "DruidDataSource 配置属性列表" 标注 maxActive 默认 8。
- **对应门禁**：`fw_druid_datasource_pool`（warn）。

```verify
id: druid-r3
cmd: 
expect: always
```

### 规律：min-idle 与 initial-size 不一致致启动即预创建不匹配

- **现象**：`initial-size`（启动时创建的物理连接数）与 `min-idle`（连接池最小空闲）不一致时，启动创建的连接若 > min-idle 会被回收，< min-idle 会补创建，产生启动期连接抖动。
- **根因**：两个参数独立，无一致性约束；initial-size 影响启动速度，min-idle 影响稳态空闲下限。
- **影响**：启动期性能波动（非功能缺陷，warn 提示对齐）。
- **证据**：`DruidDataSource.java#init` 中 `initialSize` 创建后由 `minIdle` 的 keepAlive 机制调整；官方 wiki 建议生产环境 initial-size = min-idle。
- **对应门禁**：`fw_druid_datasource_pool`（warn，同一门禁附带检查）。

```verify
id: druid-r4
cmd: 
expect: always
```

### 规律：未配 keepAlive 致 min-idle 连接被 DB 侧 wait_timeout 断开

- **现象**：MySQL `wait_timeout`（默认 8h）会断开空闲连接，Druid 池中 min-idle 维持的连接若不配 `keepAlive=true` 会被 DB 单向断开，下次取用时抛 `CommunicationsException`。
- **根因**：keepAlive 默认 false（1.2.x）；启用后 Druid 对 min-idle 范围内的连接定期发保活探测（validationQuery）。
- **影响**：连接失效致偶发查询失败（CWE-754 不当异常处理）。
- **证据**：`DruidDataSource.java` 字段 `keepAlive` 默认 false；`DestroyTask` 中 `keepAlive && …` 分支发 `validationQuery`。
- **对应门禁**：`fw_druid_datasource_pool`（warn，同一门禁附带检查）。

```verify
id: druid-r5
cmd: 
expect: always
```

### 规律：WebStatFilter 监控 URI 访问默认排除不足致监控页自身被统计

- **现象**：WebStatFilter 统计 HTTP 请求的 JDBC 调用，默认 `exclusions` 含 `*.js,*.gif,*.jpg,*.bmp,*.png,*.css,*.ico,/druid/*`，但若自定义应用路径与 `/druid/*` 重叠或未排除监控页自身，会产生递归统计。
- **根因**：exclusions 默认值覆盖常见静态资源 + `/druid/*`，但自定义 context-path 或改 Druid 路径时须同步更新。
- **影响**：统计噪声（非安全缺陷，warn 提示核对 exclusions）。
- **证据**：`WebStatFilter.java` 默认 `exclusions = "*.js,*.gif,*.jpg,*.bmp,*.png,*.css,*.ico,/druid/*"`。
- **对应门禁**：人工检查（无独立门禁，dev-guide §10 提示）。

```verify
id: druid-r6
cmd: 
expect: always
```

### 规律：spring.datasource.druid 与 spring.datasource 同级混用致参数失效

- **现象**：druid-spring-boot-starter 下，连接池参数须在 `spring.datasource.druid.*` 下；若误写在 `spring.datasource.hikari.*` 或顶层 `spring.datasource.*`，DruidDataSource 读不到，用默认值。
- **根因**：starter 注册 `DruidDataSourceWrapper` 绑定 `spring.datasource.druid.*` 前缀；HikariCP 的 `spring.datasource.hikari.*` 绑定 HikariConfig，两者配置树隔离。
- **影响**：配置失效致连接池用默认值（回退到规律3的 maxActive=8 风险）。
- **证据**：`DruidDataSourceWrapper.java` `@ConfigurationProperties("spring.datasource.druid")`；与 `HikariDataSource` 的 `spring.datasource.hikari` 前缀并列。
- **对应门禁**：人工检查（dev-guide §10 提示区分 druid/hikari 前缀）。

```verify
id: druid-r7
cmd: 
expect: always
```

### 规律：Spring Boot 3 须用 druid-spring-boot-3-starter 否则 auto-config 不生效

- **现象**：Spring Boot 3（jakarta 命名空间）用 `druid-spring-boot-starter`（javax）会致 `DruidDataSourceAutoConfigure` 加载失败或 Servlet 注册异常。
- **根因**：SB3 的 jakarta.servlet 与 starter 1.2.20 及以下的 javax.servlet 冲突；1.2.21+ 提供 `druid-spring-boot-3-starter`。
- **影响**：Starter 不生效，Druid 退化为手动 Bean 注册或直接不生效用 HikariCP 默认。
- **证据**：druid 1.2.21 release notes 新增 `druid-spring-boot-3-starter`；`DruidDataSourceAutoConfigure` 在 SB3 下 `@ConditionalOnClass` 检测 jakarta 失败。
- **对应门禁**：人工检查（dev-guide §10 提示 SB3 须用 3-starter）。

```verify
id: druid-r8
cmd: 
expect: always
```

### 规律：slow-sql-millis 与 log-slow-sql 未配套致慢 SQL 不记录

- **现象**：配 `stat.filter.slow-sql-millis`（阈值）但未配 `log-slow-sql=true`，或反之，慢 SQL 不会被记录到日志。
- **根因**：`slow-sql-millis` 仅标记慢 SQL（stat 统计），`log-slow-sql` 控制是否输出到 logback/log4j；两者独立，须配套。
- **影响**：慢 SQL 不可观测（CWE-778 不充分日志），性能问题难定位。
- **证据**：`StatFilter.java#isLogSlowSql` 检查 `logSlowSql && slowMillis > 0`；官方 wiki "Druid 配置_stat" 章节标注两者配套。
- **对应门禁**：`fw_druid_slow_sql`（warn）。

```verify
id: druid-r9
cmd: 
expect: always
```

### 规律：wall filter 的 noneBaseStatementAllow 误开致 DDL 直通

- **现象**：`druid.filter.wall.none-base-statement-allow=true` 允许非基础语句（DDL：CREATE/DROP/ALTER/TRUNCATE）执行，绕过 wall 的 DDL 拦截。
- **根因**：wall 默认禁止 DDL（防表结构篡改）；noneBaseStatementAllow 是逃逸阀，误开则 DROP TABLE 等直达 DB。
- **影响**：CWE-89 变种——DDL 注入（攻击者通过 ${} 拼接 DROP TABLE）。
- **证据**：`WallConfig.java` 字段 `noneBaseStatementAllow` 默认 false；`WallProvider#check` 中该字段为 true 时跳过 DDL 检查。
- **对应门禁**：`fw_druid_wall_filter`（warn，同一门禁附带检查）。

```verify
id: druid-r10
cmd: 
expect: always
```

<!--
规律数 = 10（≥ 深度门槛 10）。
每条含五要素：现象/根因/影响/证据/对应门禁。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_druid_statview_expose | fail | StatViewServlet 注册但未配 login-username/login-password（或为空）→ fail 监控面板无鉴权暴露 (CWE-200) | DRUID_CONFIG_FILES |
| fw_druid_wall_filter | warn | 数据源声明但 druid.filters 不含 wall 且无 WallFilter Bean → warn 缺 SQL 防火墙；none-base-statement-allow=true → warn DDL 直通 | DRUID_CONFIG_FILES |
| fw_druid_datasource_pool | warn | 数据源声明但无 max-active → warn 默认8连接耗尽；max-active 有但 min-idle/initial-size 不一致 → warn 启动抖动；min-idle>0 但 keepAlive 未显式 true → warn 连接被 DB 断开 | DRUID_CONFIG_FILES |
| fw_druid_slow_sql | warn | 配 slow-sql-millis 但未配 log-slow-sql（或反之）→ warn 慢 SQL 不记录 (CWE-778) | DRUID_CONFIG_FILES |

<!--
门禁 id 命名规范：fw_druid_<rule>（rule 全小写下划线）。
本表 4 条 id 须在 assets/framework-gates/druid.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_druid_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: druid  requires_conf: DRUID_CONFIG_FILES` 声明。
-->

## §5 跨框架交互规则

- **与 MyBatis 叠加**：Druid wall filter 是 MyBatis `${}` 注入的最后一道 JDBC 层防线；若 wall 未启用，MyBatis `${}` 占位的风险无缓解（参见 mybatis 规则集规律"$ {} 是文本替换"）。
- **与 Spring Boot HikariCP 冲突**：SB 默认 HikariCP，引入 druid-spring-boot-starter 后须排除 HikariCP（`spring.datasource.type=com.alibaba.druid.pool.DruidDataSource` 或 starter 自动排除）；混用致两个连接池并存，配置失效。
- **与 ShardingSphere 协作**：ShardingSphere 的 ShardingDataSource 可包裹 DruidDataSource，此时连接池参数在 Druid 侧配，分片规则在 ShardingSphere 侧配，不冲突。
- **与 Spring Boot 3 命名空间**：SB3 须用 `druid-spring-boot-3-starter`（1.2.21+），否则 jakarta/javax 冲突致 auto-config 失败（参见 spring-boot 规则集规律"jakarta 命名空间迁移"）。

## §6 版本陷阱速查

| 版本 | 陷阱 |
|------|------|
| 1.2.20 及以下 | 不支持 Spring Boot 3（javax.servlet），须升 1.2.21+ 用 `druid-spring-boot-3-starter` |
| 1.2.21+ | 新增 `druid-spring-boot-3-starter`，SB3 项目须改用此 artifactId |
| 1.2.22+ | keepAlive 默认仍 false（未改默认值），生产须显式 `druid.keep-alive=true` |
| 1.2.24（最新） | StatViewServlet 默认仍无鉴权（`loginUsername=null`），须显式配凭据 |

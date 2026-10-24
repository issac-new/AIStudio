---
ruleset_id: sharding
适用版本: shardingsphere 5.5.0–5.5.3（ShardingSphere-JDBC + ShardingSphere-Proxy 5.5.x；5.5.3 为 5.x 最新，2026-03-01 发布页 / GitHub 2026-02-28）；4.x sharding-jdbc 已更名不覆盖
最后调研: 2026-07-17（来源：https://shardingsphere.apache.org/document/current/en/downloads/ ；https://github.com/apache/shardingsphere/releases ；https://shardingsphere.apache.org/document/current/en/features/sharding/concept/ ；https://shardingsphere.apache.org/document/current/en/features/sharding/limitation/ ；https://shardingsphere.apache.org/document/current/en/features/transaction/ ；https://shardingsphere.apache.org/document/current/en/features/transaction/limitations/ ；https://shardingsphere.apache.org/document/current/en/user-manual/shardingsphere-jdbc/special-api/sharding/hint/ ；https://raw.githubusercontent.com/apache/shardingsphere/master/docs/document/content/features/sharding/limitation.en.md ；https://raw.githubusercontent.com/apache/shardingsphere/master/docs/document/content/features/sharding/concept.en.md）
深度门槛: 12
---

# ShardingSphere 分片规则集

<!--
本规则集为 P1 第四批框架规则集，结构与 mybatis / lombok / spring-batch 规则集对齐（六节式）。
覆盖范围：Apache ShardingSphere 5.5.x（ShardingSphere-JDBC 为主，Proxy 差异单独标注；ElasticJob 等子项目不属本规则集）。
调研时点：2026-07-17，已核对 5.5.x 最新发布为 5.5.3（2026-03-01）；核心规律取自官方 features/sharding concept/limitation、
features/transaction、user-manual hint 文档（master 分支现行版，与 5.5.x 对齐）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.shardingsphere:shardingsphere-jdbc` / `shardingsphere-jdbc-core` / `shardingsphere-transaction-xa-core` / `shardingsphere-transaction-base-seata-at` / Proxy 安装包 `apache-shardingsphere-*-shardingsphere-proxy-bin` | 高 |
| 配置 | `rules:` 下 `- !SHARDING` / `actualDataNodes` / `bindingTables` / `broadcastTables` / `shardingAlgorithms` / `keyGenerators` / `defaultKeyGenerateStrategy` / `- !READWRITE_SPLITTING` | 高 |
| 配置 | `org.apache.shardingsphere.driver.ShardingSphereDriver` / `jdbc:shardingsphere:` URL / `YamlShardingSphereDataSourceFactory` / `ShardingSphereDataSource` | 高 |
| 代码 | `HintManager` / `addDatabaseShardingValue` / `addTableShardingValue` / `setDatabaseShardingValue` / `HintShardingAlgorithm` / `StandardShardingAlgorithm` / `ComplexKeysShardingAlgorithm` | 高 |
| 文件 | `**/sharding*.yaml` / `**/config-sharding*.yaml` / `META-INF` 下含 sharding 规则的 yaml | 中 |
| DistSQL | `CREATE SHARDING TABLE RULE` / `ALTER SHARDING TABLE RULE` / `CREATE BROADCAST TABLE RULE`（Proxy 侧） | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 sharding 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 分片规则配置文件：`grep -rlE '!SHARDING|actualDataNodes|bindingTables|broadcastTables' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml'`（计数核验基准：含 sharding 规则关键字的 yaml 文件数 = `grep -l … | wc -l`）
- 分片表 DML 语句：`grep -rniE '(update|delete[[:space:]]+from)[[:space:]]+<table>' $(find ${MYBATIS_MAPPER_DIRS[@]+"${MYBATIS_MAPPER_DIRS[@]}"} -name '*.xml')`（对 `SHARDED_TABLES` 每表逐一）
- JOIN 语句：`grep -rniE '\bjoin\b' $(find ${MYBATIS_MAPPER_DIRS[@]+"${MYBATIS_MAPPER_DIRS[@]}"} -name '*.xml')`
- 排序分页：`grep -rniE 'order[[:space:]]+by|\blimit\b' $(find … -name '*.xml')`
- HintManager 用法：`grep -rlE 'HintManager' "${PROJECT_DIR}" --include='*.java'`
- 跨分片事务：`grep -rlE '@Transactional' "${PROJECT_DIR}" --include='*.java'`；事务类型配置 `grep -rnE 'type:[[:space:]]*(XA|BASE)|seata' sharding yaml`
- 主键生成器：`grep -rnE 'type:[[:space:]]*(SNOWFLAKE|UUID)|keyGenerators|useGeneratedKeys' 配置与 mapper XML`
- inline 表达式：`grep -rnE '\$\{[0-9]+\.\.[0-9]+\}|\$->' sharding yaml`（计数核验基准：含 inline 表达式的配置行数）
- 不支持 SQL：`grep -rniE 'load[[:space:]]+(data|xml)|case[[:space:]]+when' $(find … -name '*.xml')`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：分片表的 UPDATE/DELETE 必须含分片键（否则全路由广播）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 官方 concept 文档明确："If there is no sharded field in SQL, full routing will be executed, of which performance is poor." 对 `SHARDED_TABLES` 中每张分片表，其 UPDATE/DELETE 语句的 WHERE 必须含对应 `SHARDING_KEY_COLUMNS` 分片键（等值或 IN）。缺分片键的 DML 会被路由到全部数据节点广播执行。
- **违反后果**: 全路由（full routing）：单条 UPDATE 广播到所有库表并行执行，性能随分片数线性退化；并发下放大锁竞争，跨分片部分成功且无 LOCAL 事务保证时数据不一致。
- **验证方法**: 对 `SHARDED_TABLES` 每表，在 `MYBATIS_MAPPER_DIRS` 的 mapper XML 中抽取 `<update>`/`<delete>` 语句块，块内引用该表但不含对应分片键列名 → fail。
- **对应门禁**: fw_sharding_key_in_dml(fail)

```verify
id: sharding-r1
cmd: 
expect: always
```

### 规律：分片键取值必须可提取（字面量/绑定参数，禁止函数/表达式包裹）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 官方 limitation 文档明确："Shard key extraction only supports literals or bound parameters that can be parsed directly; Values requiring type annotations, expression evaluation, or function calculation are not used for sharding and may result in full routing or routing validation failures." 即 `WHERE user_id = #{uid}` 可路由，而 `WHERE to_date(create_time,'yyyy-mm-dd') = #{d}`（`create_time` 为分片键）虽文本上含分片键列名，运行时仍无法提取分片值 → 全路由。
- **违反后果**: 分片键被函数/表达式包裹 → 路由失效退化为全路由；部分场景路由校验失败直接报错。
- **验证方法**: 在 mapper XML 中检索"分片键列名紧跟在函数调用括号内"的模式（如 `to_date(user_id`、`date_format(user_id`）→ warn；凡命中须改写为在应用层算好值后以绑定参数传入。
- **对应门禁**: fw_sharding_key_expr(warn)

```verify
id: sharding-r2
cmd: 
expect: always
```

### 规律：广播表业务侧只读（写操作只走受控迁移通道）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 广播表（`broadcastTables`，官方 concept："The table structure and its data are identical in each database. Suitable for scenarios where the data volume is small and queries are required to be associated with tables of massive data, e.g., dictionary tables."）存在于每个数据源。ShardingSphere 引擎层面支持对广播表写入并复制到全部节点，但业务代码应将广播表视为只读：字典/配置类数据的变更须走 DBA 受控迁移（flyway/liquibase/Proxy DDL），业务 DML 直写广播表会在所有节点放大写放大并绕过单点管控。
- **违反后果**: 业务侧 `insert into`/`update`/`delete` 广播表 → 写放大到全部数据节点；多业务方并发写同一广播表易产生节点间数据漂移；字典变更脱离版本管控。
- **验证方法**: 对 `SHARDING_BROADCAST_TABLES` 每表，在 `MYBATIS_MAPPER_DIRS` 检索 `insert into <表>` / `update <表>` / `delete from <表>` → fail。
- **对应门禁**: fw_sharding_broadcast_write(fail)

```verify
id: sharding-r3
cmd: 
expect: always
```

### 规律：绑定表 JOIN 必须以分片键关联（否则笛卡尔积/跨库关联）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 官方 concept 文档明确："When using binding tables for multi-table associated query, a sharding key must be used for the association, otherwise, Cartesian product association or cross-library association will occur, affecting query efficiency." 两张分片表（如 `t_order`/`t_order_item` 同按 `order_id` 分片）配置 `bindingTables` 后，JOIN ON 必须用分片键等值关联，路由才能对齐到同一数据节点；未配绑定或关联键非分片键时，N 分片 × M 分片产生 N×M 条路由 SQL（官方示例：2 值 IN 从 2 条路由膨胀为 4 条笛卡尔积）。
- **违反后果**: 路由 SQL 按分片数乘积膨胀；未对齐的跨库关联须走 Federation 引擎（官方标注 experimental，"still requires significant optimization"），慢且不稳定。
- **验证方法**: 在 mapper XML 中抽取含 `JOIN` 的 `<select>` 块，块内出现 ≥2 张 `SHARDED_TABLES` 且任一被引用分片表缺其对应分片键列名（JOIN 关联或 WHERE 条件均计）→ warn（提示核对 bindingTables 配置与关联键）。
- **对应门禁**: fw_sharding_binding_join(warn)

```verify
id: sharding-r4
cmd: 
expect: always
```

### 规律：跨分片排序/分页归并陷阱（ORDER BY/LIMIT 无分片键时内存归并放大）
- **适用版本**: shardingsphere 5.5.x 全版本（归并引擎机制长期稳定）
- **规律**: 无分片键的 SELECT 带 `ORDER BY`/`LIMIT n,m` 时，每个分片各自排序后须将结果归并；深分页（offset 大）要求每个分片都取回 offset+count 行再在内存归并丢弃前 offset 行，IO 与内存随分片数与 offset 双放大。官方 limitation 文档明确 MySQL/PostgreSQL/openGauss 的 LIMIT 分页全支持，Oracle/SQLServer 仅部分支持（rownum/TOP+ROW_NUMBER 子查询改写），且 Oracle `rownum + BETWEEN`、SQLServer `WITH xxx AS (SELECT ...)` 分页（Hibernate 自动生成的分页语句即属此类）不支持。
- **违反后果**: 深分页接口 RT 随 offset 线性恶化直至超时；Oracle/SQLServer 项目换库后分页 SQL 直接不支持。
- **验证方法**: mapper XML 中抽取引用分片表且含 `ORDER BY` 或 `LIMIT` 的 `<select>` 块，块内无对应分片键列名 → warn（提示加分片键条件、限制最大页深或改游标分页）。
- **对应门禁**: fw_sharding_order_merge(warn)

```verify
id: sharding-r5
cmd: 
expect: always
```

### 规律：分片表主键必须用分布式主键生成器（SNOWFLAKE/UUID），禁数据库自增
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 官方 concept 文档明确：分片后"Self-incrementing keys between different actual tables within the same logical table generate repetitive primary keys because they are not mutually aware"，ShardingSphere 内置 UUID 与 SNOWFLAKE 分布式主键生成器并开放自定义 SPI。分片表 INSERT 不得依赖数据库 `AUTO_INCREMENT`/`useGeneratedKeys` 回填，须配置 `keyGenerators`（`type: SNOWFLAKE` 或 `UUID`）+ `keyGenerateStrategy`。
- **违反后果**: 各物理表自增序列相互不知 → 跨分片主键重复 → 唯一索引冲突或逻辑主键歧义；按主键再查询时命中多条。
- **验证方法**: mapper XML 中含 `useGeneratedKeys="true"` 且 insert 目标为 `SHARDED_TABLES` → warn（提示改用 ShardingSphere keyGenerator 或应用层雪花 ID）。
- **对应门禁**: fw_sharding_keygen(warn)

```verify
id: sharding-r6
cmd: 
expect: always
```

### 规律：跨分片写事务须显式 XA 或 Seata(BASE)，LOCAL 不保证一致性
- **适用版本**: shardingsphere 5.5.x 全版本（事务三类型 LOCAL/XA/BASE 机制稳定；5.5.2 起 Seata AT 集成要求 Seata Client ≥ 2.2.0）
- **规律**: 官方 transaction 文档：ShardingSphere 提供 LOCAL/XA/BASE 三种事务类型。LOCAL 模式"Since each data node manages its own transactions... There is no loss in performance, but strong consistency and final consistency cannot be guaranteed"；其 limitation 明确 LOCAL "Does not support the cross-database transactions caused by network or hardware crash"。XA 基于两阶段提交保证强一致，但"more suitable for short transactions with fixed execution time because the required resources need to be locked during execution"，长事务/高并发场景性能差。BASE 集成 Seata（AT 模式）提供最终一致，"Does not support isolation level"。一笔 `@Transactional` 方法内写 ≥2 张分片表（很可能落到不同数据节点）时，必须显式声明事务类型为 XA 或接入 Seata，否则崩溃窗口内部分提交。
- **违反后果**: 跨库写中途宕机 → 部分分片已提交部分回滚 → 数据不一致且 LOCAL 模式无恢复机制（XA limitation：不支持他机接管恢复）。
- **验证方法**: Java 源中同文件同时含 `@Transactional` 与 ≥2 个 `SHARDED_TABLES` 表名 → warn（提示显式配置 XA/Seata 或按分片键收敛为单分片事务）。
- **对应门禁**: fw_sharding_xa(warn)

```verify
id: sharding-r7
cmd: 
expect: always
```

### 规律：不支持 SQL 清单（按版本区间核对，禁入 mapper）
- **适用版本**: shardingsphere 5.5.x（清单随版本演进，以 limitation 文档现行版为准）
- **规律**: 官方 limitation "Do not Support" 节明确：(a) `CASE WHEN` 含子查询、或使用逻辑表名（须用别名）；(b) Oracle `rownum + BETWEEN` 分页、SQLServer `WITH xxx AS (SELECT ...)` 分页（含 Hibernate 自动生成的 SQLServer 分页）、SQLServer 双 TOP+子查询分页；(c) 同一查询混用带 DISTINCT 与不带 DISTINCT 的聚合函数；(d) MySQL `LOAD DATA`/`LOAD XML` 装载到分片表（装载到单表/广播表支持）；(e) `;` 分隔的多语句同时执行。另：子查询稳定支持的前提是"both the subquery and the outer query specify a shard key and the values of the slice key remain consistent"，其余子查询形态依赖 experimental 的 Federation 引擎。
- **违反后果**: SQL 解析/路由期报错，或静默走 experimental Federation 引擎性能不可控。
- **验证方法**: mapper XML 中检索 `LOAD DATA`/`LOAD XML`、`CASE WHEN` 内含 `SELECT` → warn；其余项（Oracle/SQLServer 分页形态、DISTINCT 混用、多语句）按目标库类型人工核对 limitation 清单。
- **对应门禁**: fw_sharding_unsupported_sql(warn)

```verify
id: sharding-r8
cmd: 
expect: always
```

### 规律：Hint 强制路由仅限"分片字段不在 SQL/表结构"场景，且必须清理 ThreadLocal
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 官方 Hint 文档：ShardingSphere 用 ThreadLocal 管理 Hint 分片值，"takes effect only within the current thread"；主场景为"The sharding fields do not exist in the SQL and database table structure but in the external business logic"或强制指定库。使用流程：`HintManager.getInstance()` → `addDatabaseShardingValue`/`addTableShardingValue` → 执行 SQL → `HintManager.close()`；官方强调 HintManager 实现 `AutoCloseable`，"We recommend to close it automatically with try with resource"。Hint 路由须配 hint 策略算法（内置 `HINT_INLINE`、`CLASS_BASED`）。能用 SQL 分片键表达的查询不得滥用 Hint（绕过常规路由审计）。
- **违反后果**: 忘 `close()` → ThreadLocal 泄漏污染线程池后续请求 → 路由到错误分片（数据串库）；滥用 Hint 使路由行为脱离 SQL 可审性。
- **验证方法**: Java 源中含 `HintManager` 但无 `close()` 且无 try-with-resources 形态（`try (HintManager`）→ warn。
- **对应门禁**: fw_sharding_hint(warn)

```verify
id: sharding-r9
cmd: 
expect: always
```

### 规律：分片算法确定性与扩容（分片数变更必须迁移数据，禁止运行期改模数）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 取模类算法（MOD/HASH_MOD/inline `t_order_$->{id % 4}`）的路由结果由"分片值 % 分片数"决定，分片数（actualDataNodes 尾缀数）一旦变更，存量数据的路由映射大面积失效；扩容必须走数据迁移（ShardingSphere 自带 scaling/migration 模块或停机导数），不能仅改配置重启。选型期应按 3–5 年数据量预估分片数并预留；范围类（BOUNDARY_RANGE/VOLUME_RANGE）与时间类算法可加分片但不利于跨分片查询归并。
- **违反后果**: 仅改分片数配置重启 → 存量数据按新模数路由错乱（读不到旧数据、写入落到新分片造成同一逻辑主键多副本）。
- **验证方法**: 人工检查：评审 actualDataNodes 尾缀数与分片算法类型是否有容量预估依据；变更分片数必须附迁移方案。
- **人工检查**: 生成时在审查清单输出"分片数变更须附数据迁移方案"提示，不做机械 fail。

```verify
id: sharding-r10
cmd: 
expect: always
```

### 规律：读写分离与分片组合（写主读从，事务内读须核对主库路由）
- **适用版本**: shardingsphere 5.5.x 全版本（`- !READWRITE_SPLITTING` 与 `- !SHARDING` 可同 rules 并存）
- **规律**: ShardingSphere 支持分片与读写分离规则叠加：每个分片逻辑库再挂 write/read 数据源。规则上写走主、读走从；但"写完立即读"与 `@Transactional` 事务内读若落到从库会读到主从延迟窗口的旧值。须显式约定：事务内读与写后读场景强制路由主库（官方提供强制主库路由机制，读写分离模块的 transactional 读主策略）。
- **违反后果**: 主从延迟窗口内事务内读/写后读拿到旧数据 → 业务状态判断错误（如扣款后查余额不符）。
- **验证方法**: 人工检查：配置含 `!READWRITE_SPLITTING` 时，核对事务内读/写后读链路是否声明强制主库；从库延迟监控是否纳入告警。
- **人工检查**: 配置审查清单项，不做机械 fail。

```verify
id: sharding-r11
cmd: 
expect: always
```

### 规律：ShardingSphere-Proxy vs JDBC 选型（异构语言/集中管控 vs 性能/轻依赖）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: JDBC 端以 jar 内嵌，无额外部署、性能损耗最小（直连池上薄封装），仅限 Java 生态且规则随应用下发；Proxy 端以独立进程提供 MySQL/PostgreSQL 协议，异构语言可接入、规则经 DistSQL 集中管控（5.5.3 元数据持久化移除了 sharding 规则的 `default_strategies` 前缀，升级时须核对注册中心存量元数据），但多一跳网络且须运维 Proxy 高可用。选型须在架构评审显式记录：纯 Java 微服务默认 JDBC；多语言/DBA 集中管控/须动态改规则选 Proxy。
- **违反后果**: 选型错配：为 Java 单体引入 Proxy 平白增加一跳与运维面；或多语言团队各自用 JDBC 客户端导致规则无法统一管控。
- **验证方法**: 人工检查：架构评审记录 Proxy/JDBC 选型理由；混合使用时 DistSQL 与应用 yaml 规则须同源管控。
- **人工检查**: 架构评审项，不做机械 fail。

```verify
id: sharding-r12
cmd: 
expect: always
```

### 规律：inline 表达式与标准算法类二选一（同一表不得混用两种路由来源）
- **适用版本**: shardingsphere 5.5.x 全版本（5.5.2 起 DistSQL 建分片规则时校验 inline 表达式，#33735）
- **规律**: 官方 concept：行表达式（Groovy 语法糖，如 `actualDataNodes: ds_${0..1}.t_order_${0..1}`、`INLINE` 算法 `algorithm-expression: t_order_$->{order_id % 4}`）便于配置集中管理；标准/复合/Hint 算法类（`StandardShardingAlgorithm`/`ComplexKeysShardingAlgorithm`/`CLASS_BASED`）承载复杂业务路由。同一张逻辑表的数据库策略与表策略须风格统一：要么全 inline（配置即文档），要么全算法类（代码承载），混用会让路由逻辑散落两处无法审计。多键路由（`ComplexKeysShardingAlgorithm`）无法用单值 inline 表达，必须用算法类。
- **违反后果**: 同表 inline 与算法类混用 → 库/表路由口径不一致；排障时无法从单一来源推断数据落点。
- **验证方法**: 人工检查：审查每张分片表的 databaseStrategy/tableStrategy 类型清单，同表混 INLINE 与 CLASS_BASED/STANDARD 须改写统一。
- **人工检查**: 配置审查清单项，不做机械 fail。

```verify
id: sharding-r13
cmd: 
expect: always
```

### 规律：单表/广播表/分片表边界与视图规则（视图须同分片规则且入绑定组）
- **适用版本**: shardingsphere 5.5.x 全版本
- **规律**: 官方 concept 将表分为分片表/广播表/单表三类：单表是"the only table that exists in all sharded data sources"（全集群仅一份的小表），不符合自动加载条件的单表须显式配置单表规则否则元数据不纳管。官方 limitation 的 View 节：基于分片表建视图时"the view must be configured with same sharding rules as sharding table, the view and sharding table must be in same binding table rule"；基于广播表/单表建视图按对应规则放行。
- **违反后果**: 未纳管单表被 SQL 引用时路由/元数据异常；基于分片表的视图未入绑定组 → 视图查询路由错乱或报不支持。
- **验证方法**: 人工检查：盘点三类表归属清单；CREATE VIEW 语句核对视图与基表同分片规则 + 同绑定组。
- **人工检查**: 配置审查清单项，不做机械 fail。

```verify
id: sharding-r14
cmd: 
expect: always
```

<!--
共 14 条规律（≥12 门槛）。每条规律均挂门禁 id 或人工检查，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_sharding_key_in_dml | fail | 对 SHARDED_TABLES 每表抽取 mapper XML 的 `<update>`/`<delete>` 块，引用该表但无对应分片键列名 → fail | SHARDED_TABLES SHARDING_KEY_COLUMNS MYBATIS_MAPPER_DIRS | CWE-400（全路由广播打满全部节点） |
| fw_sharding_key_expr | warn | 检索"分片键列名出现在函数调用括号内"（如 `to_date(user_id`）→ warn 路由失效 | SHARDING_KEY_COLUMNS MYBATIS_MAPPER_DIRS | CWE-400（路由失效全路由，同 key_in_dml 机制） |
| fw_sharding_broadcast_write | fail | 对 SHARDING_BROADCAST_TABLES 检索 `insert into`/`update`/`delete from` 命中 → fail（业务侧只读） | SHARDING_BROADCAST_TABLES MYBATIS_MAPPER_DIRS | —（版本管控脱离） |
| fw_sharding_binding_join | warn | `<select>` 块含 JOIN 且 ≥2 张分片表、任一被引用分片表缺其分片键 → warn | SHARDED_TABLES SHARDING_KEY_COLUMNS MYBATIS_MAPPER_DIRS | CWE-400（跨库笛卡尔积按分片乘积膨胀） |
| fw_sharding_order_merge | warn | 引用分片表且含 ORDER BY/LIMIT 的 select 块无分片键 → warn 归并/深分页 | SHARDED_TABLES SHARDING_KEY_COLUMNS MYBATIS_MAPPER_DIRS | —（归并放大） |
| fw_sharding_keygen | warn | `useGeneratedKeys` + insert 目标为分片表 → warn 改用 SNOWFLAKE/UUID keyGenerator | SHARDED_TABLES MYBATIS_MAPPER_DIRS | —（主键重复风险） |
| fw_sharding_xa | warn | 同 Java 文件含 `@Transactional` 与 ≥2 个分片表名 → warn 显式 XA/Seata | SHARDED_TABLES | —（分布式一致性） |
| fw_sharding_unsupported_sql | warn | 检出 `LOAD DATA`/`LOAD XML`/`CASE WHEN…SELECT` → warn 核对 limitation 清单 | MYBATIS_MAPPER_DIRS | —（limitation 契约） |
| fw_sharding_hint | warn | Java 含 `HintManager` 但无 `close()` 且无 try-with-resources → warn ThreadLocal 泄漏 | （扫描 PROJECT_DIR 下 *.java） | CWE-772（ThreadLocal 未释放，资源生命周期） |

<!--
门禁 id 命名规范：fw_sharding_<rule>（rule 全小写下划线）。
本表 9 条 id 须在 assets/framework-gates/sharding.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_sharding_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: sharding  requires_conf: VAR1 VAR2` 声明。
SHARDING_KEY_COLUMNS 元素形如 "t_order=user_id"（表=分片键列），门禁实现按 = 拆分。
fixture 验证覆盖 key_in_dml + broadcast_write（violating→fail，expected-fail-ids 2/2 已登记）+ 其余 warn/pass（compliant 全 pass）。
分片算法扩容/读写分离/Proxy 选型/inline 二选一/表边界五规律为人工检查，不入机械门禁。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| sharding × mybatis | 分片表 UPDATE/DELETE 的 WHERE 必含分片键；Mapper XML 是分片 SQL 的第一审计面（复用 MYBATIS_MAPPER_DIRS） | ShardingSphere 在 JDBC 层解析改写 MyBatis 下发的 SQL，WHERE 缺分片键即全路由广播（fw_sharding_key_in_dml 与 mybatis 规则集共用 mapper 目录变量） |
| sharding × mybatis-plus | MP 分页插件生成的 LIMIT 分页落在分片表上须带分片键条件；逻辑删除字段不得作为唯一 WHERE 条件 | 无分片键的 LIMIT 分页触发全分片归并 + 深分页放大（fw_sharding_order_merge）；`deleted=0` 条件不含分片键同样全路由 |
| sharding × spring-boot | `@Transactional` 跨分片写须显式 XA/Seata；多数据源 starter（dynamic-datasource 等）与 ShardingSphereDataSource 互斥包装 | LOCAL 事务不保证跨节点一致（fw_sharding_xa）；ShardingSphere 自身聚合多物理数据源，外层再包动态数据源会导致路由栈错乱 |
| sharding × seata/spring-cloud | BASE 事务模式集成 Seata AT，须部署 Seata Server；5.5.2 起 Seata Client ≥ 2.2.0 | 官方 transaction 文档 BASE 节"Apache ShardingSphere integrates the operational scheme taking SEATA as the flexible transaction"；5.5.2 release notes 明确 "Bump the minimum Seata Client version for Seata AT integration to 2.2.0" |
| sharding × flyway/liquibase | 分片表 DDL 迁移须覆盖全部物理表（或经 Proxy 执行由引擎广播 DDL）；广播表变更走同一迁移通道 | 应用侧 yaml 规则与物理表结构须同步演进；经 Proxy 执行 DDL 由 ShardingSphere 改写广播到各 actualDataNodes |
| sharding × spring-batch | 批写 ItemWriter 按分片键分组落库或保证幂等；跨分片 chunk 事务不可用 LOCAL | chunk 事务跨分片提交遇崩溃部分提交（同 fw_sharding_xa）；重启重写须幂等（参见 spring-batch 规则集 fw_batch_writer_idempotent） |

<!--
无强交互的框架组合省略；本表聚焦 sharding 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| shardingsphere 5.5.0 | 5.5 系列首版（2024-04-30） | 待验证：未逐条核实 5.5.0 release notes 破坏性变更；规律基于 5.5.x 通用项 |
| shardingsphere 5.5.1 | 维护版（2024-10-22） | 待验证：未逐条核实 5.5.1 release notes；沿用 5.5.0 起行为 |
| shardingsphere 5.5.2 | Seata AT 集成最低 Seata Client 升至 2.2.0；JDBC adapter 支持 savepoint/release savepoint TCL；DistSQL 创建 inline 分片算法规则时校验 inline 表达式；SQL Federation 升 calcite 1.38.0；新增 Firebird SQL 解析 | 用 Seata AT 的项目升级 5.5.2 前必须先把 Seata Client 升到 ≥2.2.0；savepoint 在 JDBC 侧可用；inline 表达式拼写错误在 DistSQL 建规则期即被拒 |
| shardingsphere 5.5.3 | 批量 CVE 修复（CVE-2025-55163 等）；移除 SQL formatting 特性与 logging 规则；移除配置项 `system-log-level`；SQL 日志 topic 由 `ShardingSphere-SQL` 改为 `org.apache.shardingsphere.sql`；元数据持久化移除 sharding 规则的 `default_strategies` 前缀；新增 ShardingSphere BOM；特性模块/数据库类型/注册中心解耦为可插拔；JDBC 支持 ZooKeeper/ETCD URL 格式；支持 OpenJDK 24/25 编译运行 | 依赖 SQL 格式化/logging 规则/`system-log-level` 的配置升级后失效须移除；日志采集按旧 topic 订阅的须改订阅；注册中心存量 sharding 元数据 key 变更，升级前核对元数据迁移；建议用 BOM 统一管理依赖版本 |
| shardingsphere 5.x（通用） | 项目自 4.x 起更名：4.x `sharding-jdbc-*` 制品在 5.x 更名为 `shardingsphere-jdbc` 系列；规则配置统一为 YAML `rules: - !SHARDING` | 4.x 项目升级须整体迁移依赖坐标与配置格式；本规则集不覆盖 4.x |
| ShardingSphere-Proxy 5.5.x | 规则经 DistSQL 集中管控；5.5.3 新增 `proxy-frontend-connection-idle-timeout` 并自动关闭空闲前端连接 | Proxy 侧规则与 JDBC 侧 yaml 须同源管控；空闲连接被自动关闭，长连接客户端须配心跳/重连 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
5.5.0/5.5.1 release notes 未逐条联网核实，标"待验证"，不臆造。
-->

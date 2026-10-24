---
ruleset_id: tdengine
适用版本: TDengine 3.x（3.0–3.3，现行稳定 3.3.3.0）/ TSDB 时序数据库 / 超级表 + 标签建模
最后调研: 2026-08-26（来源：https://docs.tdengine.com/ ；https://github.com/taosdata/TDengine ；https://docs.tdengine.com/taos-sql/ ；https://docs.tdengine.com/tdengine-reference/ ）
深度门槛: 10
---

# TDengine 规则集

<!--
本规则集覆盖 TDengine 3.x（超级表/子表/标签建模、时序数据保留策略 keep、一写多读架构）。
调研时点：2026-08-26。规律聚焦超级表建模、标签设计、keep 保留策略、一写多读读写分离等核心时序陷阱。

§4 门禁清单的 id 与 assets/framework-gates/tdengine.sh 的 `# gates:` 头注释严格一致。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.taosdata.jdbc:taos-jdbcdriver` / `taos` / `tdengine` / `taospy` / `TDengine` npm | 高 |
| 配置 | `taos.cfg` 含 `firstEp` / `fqdn` / `serverPort=6030` / `keep` / `days` / `rows` | 高 |
| 代码 | `TSDB` / `stmt` / `taos` / `WSConnection` / `TDengine` / `createStable` / `create table using` | 高 |
| SQL | `CREATE STABLE` / `CREATE TABLE ... USING` / `TAGS` / `KEEP` / `DAYS` / `ROWS` | 高 |
| 文件 | `*.sql` 含 `CREATE STABLE` / `taos.cfg` / `*.taos` 脚本 | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md。
detect 信号命中任一高置信度行即可激活 tdengine 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 超级表定义：`grep -rlE 'CREATE STABLE|CREATE TABLE.*TAGS' "${PROJECT_DIR}" --include='*.sql' --include='*.java' --include='*.py' --include='*.go'`（计数核验基准：含超级表定义的文件数）
- 子表创建：`grep -rnE 'CREATE TABLE.*USING.*TAGS|CREATE TABLE.*USING' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：子表创建语句数）
- 标签设计：`grep -rnE 'TAGS *\(' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：标签列定义数）
- keep 保留策略：`grep -rnE 'KEEP|keep' "${PROJECT_DIR}" --include='*.sql' --include='*.cfg' --include='*.yaml' --include='*.yml'`（计数核验基准：命中行数）
- 一写多读配置：`grep -rnE 'firstEp|secondEp|fqdn|serverPort' "${PROJECT_DIR}" --include='*.cfg' --include='*.yaml' --include='*.yml'`（计数核验基准：命中行数）
- 连接串：`grep -rnE 'jdbc:TAOS|jdbc:TAOS-WS|ws://.*:6041|taos://' "${PROJECT_DIR}" --include='*.java' --include='*.py' --include='*.go' --include='*.js'`

<!--
枚举该框架特有的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：未用超级表建模致海量子表元数据膨胀

- **现象**：每个设备一张独立表（`CREATE TABLE d1001 (ts TIMESTAMP, v FLOAT)`），百万设备 = 百万张表，元数据（表 schema + 标签索引）爆炸。
- **根因**：TDengine 设计范式是「一设备一表 + 共享超级表」；未用 `CREATE STABLE` 聚合同类设备，子表靠 `USING` 继承。
- **影响**：meta 节点内存/磁盘压力、建表慢（CWE-400 资源浪费）。
- **证据**：TDengine 官方建模指南：超级表是「同结构设备集合」的模板，子表通过 `CREATE TABLE t1 USING stable TAGS(...)` 继承。
- **对应门禁**：`fw_tdengine_super_table`（fail）。

```verify
id: tdengine-r1
cmd: 
expect: always
```

### 规律：标签列过多/过动态致查询退化为全表扫描

- **现象**：超级表定义 50+ 标签列、或标签含高频变更维度，查询时标签过滤无法有效裁剪子表集。
- **根因**：标签用于子表寻址（TDengine 按 TAGS 值路由子表）；标签数过多使标签索引失效、查询退化。
- **影响**：查询慢（CWE-400 资源浪费）。
- **证据**：TDengine 标签最佳实践：标签数建议 ≤ 8 列、类型用定长（BINARY/NCHAR 不宜过长）。
- **对应门禁**：`fw_tdengine_tag_design`（warn）。

```verify
id: tdengine-r2
cmd: 
expect: always
```

### 规律：未设 KEEP 保留策略致数据无限增长

- **现象**：超级表/子表不配 `KEEP`（或全局 `keep` 未设），历史时序数据永不过期，磁盘线性增长直至满。
- **根因**：TDengine 默认 `keep` 有限，但未显式声明使存储预算不可控；业务须按合规/容量定保留期。
- **影响**：磁盘耗尽、写入失败（CWE-400 资源耗尽）。
- **证据**：TDengine 文档：`KEEP` 参数控制数据保留天数，建表时可覆盖全局 `keep`；缺省依赖全局配置易漂移。
- **对应门禁**：`fw_tdengine_keep`（warn）。

```verify
id: tdengine-r3
cmd: 
expect: always
```

### 规律：一写多读架构未分离写节点与读节点

- **现象**：应用直连单节点既写又读，写入高峰期读请求被写 IO 阻塞，或读放大影响写入吞吐。
- **根因**：TDengine 3.x 推荐「一写多读」（单写节点 + 多读节点/多 vnode 副本）；未分离使读写互相干扰。
- **影响**：读写争用、吞吐下降（CWE-400 资源浪费）。
- **证据**：TDengine 架构文档：3.x 支持「一写多读」集群，写入走 leader、查询可走 follower 副本。
- **对应门禁**：`fw_tdengine_write_read_split`（warn）。

```verify
id: tdengine-r4
cmd: 
expect: always
```

### 规律：时间戳为主键但未用 timestamp 类型致乱序写入

- **现象**：时序数据主键用 `BIGINT` 存 epoch 而非 `TIMESTAMP`，TDengine 无法利用时间分区（`DAYS`）与乱序窗口优化。
- **根因**：TDengine 时序建模要求首列 `TS TIMESTAMP` 作天然排序键；用 BIGINT 失去时间局部性优化。
- **影响**：写入/查询性能下降（CWE-400 资源浪费）。
- **证据**：TDengine 建表规范：首列必须为 `TIMESTAMP` 类型且为隐含主键。
- **对应门禁**：`fw_tdengine_ts_primary`（fail）。

```verify
id: tdengine-r5
cmd: 
expect: always
```

### 规律：子表未绑定标签值致无法按标签查询

- **现象**：`CREATE TABLE t1 USING stable` 但漏写 `TAGS(...)`，子表无标签，按标签过滤（如 `WHERE location='beijing'`）失效。
- **根因**：子表必须随 `USING` 提供标签值；标签是子表寻址的维度。
- **影响**：标签查询无效、全表扫描（CWE-400 资源浪费）。
- **证据**：TDengine 语法：`CREATE TABLE t1 USING stable TAGS(val1, val2)` 必须提供与超级表标签列数一致的值。
- **对应门禁**：`fw_tdengine_subtable_tags`（fail）。

```verify
id: tdengine-r6
cmd: 
expect: always
```

### 规律：块大小 DAYS/ROWS 未调优致小文件碎片

- **现象**：默认值 `DAYS` 或大 `ROWS` 未随数据速率调优，单 vnode 内数据文件碎片多，查询开文件数多。
- **根因**：`DAYS` 控制单数据文件时间跨度、`ROWS` 控制单文件行数；未随数据速率调优产生碎片或过大块。
- **影响**：存储/查询低效（CWE-400 资源浪费）。
- **证据**：TDengine 文档：`DAYS`/`ROWS` 影响数据文件切分策略，须按采集频率设置。
- **对应门禁**：`fw_tdengine_block_size`（warn）。

```verify
id: tdengine-r7
cmd: 
expect: always
```

### 规律：连接用原生 JDBC 而非 WebSocket 致防火墙穿透失败

- **现象**：内网/云环境用 `jdbc:TAOS`（原生 TCP 6030/6041），跨网段/容器网络被防火墙阻断，而 `jdbc:TAOS-WS`（WebSocket 6041）可穿透。
- **根因**：原生连接走私有协议端口，WebSocket 走 HTTP/443 友好端口；云原生部署须用 WS。
- **影响**：连接失败（CWE-754 不当异常处理）。
- **证据**：TDengine 3.x 推荐 WebSocket 连接（`taos-ws`）；原生协议在 NAT/防火墙后不可达。
- **对应门禁**：`fw_tdengine_conn_protocol`（warn）。

```verify
id: tdengine-r8
cmd: 
expect: always
```

### 规律：单条 INSERT 非批量致写入吞吐低

- **现象**：逐行 `INSERT INTO t1 VALUES (now, 1)` 写入百万点，吞吐远低于批量/`stmt` 绑定。
- **根因**：TDengine 写入走 vnode 批量落盘；单条 INSERT 网络+解析开销占比高。
- **影响**：写入慢（CWE-400 资源浪费）。
- **证据**：TDengine 写入优化：建议批量 INSERT 或参数化 `stmt`（taosStmt）提升吞吐。
- **对应门禁**：`fw_tdengine_batch_write`（warn）。

```verify
id: tdengine-r9
cmd: 
expect: always
```

### 规律：未建必要索引（标签索引/时间分区）致查询全 vnode 扫描

- **现象**：高频按某标签查询但未将其设为标签列（而是普通列），TDengine 无法用标签索引，退化为全 vnode 扫。
- **根因**：TDengine 的查询裁剪只走 TAGS 索引与时间分区；普通列不参与路由。
- **影响**：查询慢（CWE-400 资源浪费）。
- **证据**：TDengine 索引文档：仅 TAGS 列参与子表寻址，普通列无索引。
- **对应门禁**：`fw_tdengine_index_design`（warn）。

```verify
id: tdengine-r10
cmd: 
expect: always
```

<!--
规律数 = 10（≥ 深度门槛 10）。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_tdengine_super_table | fail | 检出多设备表建表但无 CREATE STABLE 建模 → 元数据膨胀 fail | TDENGINE_SRC_GLOBS |
| fw_tdengine_ts_primary | fail | 建表首列非 TIMESTAMP 类型 → 时序主键建模错误 fail | TDENGINE_SRC_GLOBS |
| fw_tdengine_subtable_tags | fail | CREATE TABLE ... USING 但无 TAGS 值 → 子表无标签 fail | TDENGINE_SRC_GLOBS |
| fw_tdengine_tag_design | warn | 超级表标签列数 > 8 或标签类型超长 → 查询退化 warn | TDENGINE_SRC_GLOBS |
| fw_tdengine_keep | warn | 超级表/全局未配 KEEP 保留策略 → 数据无限增长 warn | TDENGINE_SRC_GLOBS |
| fw_tdengine_write_read_split | warn | 单节点既写又读（无 firstEp/secondEp 分离） → 读写争用 warn | TDENGINE_SRC_GLOBS |
| fw_tdengine_block_size | warn | DAYS/ROWS 未随数据速率调优（缺省或极端值） → 碎片 warn | TDENGINE_SRC_GLOBS |
| fw_tdengine_conn_protocol | warn | 用 jdbc:TAOS 原生而非 TAOS-WS → 防火墙穿透风险 warn | TDENGINE_SRC_GLOBS |
| fw_tdengine_batch_write | warn | 单条 INSERT 无批量/stmt 迹象 → 写入吞吐低 warn | TDENGINE_SRC_GLOBS |
| fw_tdengine_index_design | warn | 高频过滤列未设为 TAGS → 全 vnode 扫描 warn | TDENGINE_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_tdengine_<rule>。
本表 10 条 id 须在 assets/framework-gates/tdengine.sh 中有同名实现痕迹。
依赖变量 TDENGINE_SRC_GLOBS 在片段头注释声明。
-->

## §5 跨框架交互规则

- **与 Kafka 协作**：Kafka 接流数据后批量写入 TDengine（见规律9），用 `tmq`（TDengine MQ）或外部消费者批量 `stmt` 写入。
- **与 Spark/Flink 协作**：Spark 读 TDengine 做离线分析须用 JDBC/WS 连接器；Flink CDC 可直写超级表子表。
- **与 Grafana 可视化**：Grafana 通过 TDengine 数据源插件查询，标签过滤依赖规律2/10 的标签设计正确。
- **与 MySQL 对照**：TDengine 不替代关系库；标签元数据常冗余存 MySQL，须保证双写一致性。

## §6 版本陷阱速查

| 版本 | 陷阱 |
|------|------|
| 3.0 | 引入「一写多读」架构；原生连接协议端口变更，云部署须用 WS |
| 3.1+ | 超级表标签上限放宽但仍建议 ≤ 8 列；`KEEP` 参数语义稳定 |
| 3.2+ | `tmq`（TDengine MQ）替代旧订阅 API；消费者须用新 API |
| 3.3.x（最新） | 默认 `keep` 依赖全局配置，建表须显式 `KEEP` 避免漂移（规律3） |

---
ruleset_id: doris
适用版本: Apache Doris 2.x（2.0–2.1，现行稳定 2.1.7）/ FE + BE 架构 / 存储计算分离（3.0 预览）
最后调研: 2026-08-26（来源：https://doris.apache.org/ ；https://github.com/apache/doris ；https://doris.apache.org/docs/ ；https://doris.apache.org/docs/data-table/ ）
深度门槛: 10
---

# Doris 规则集

<!--
本规则集覆盖 Apache Doris 2.x（分桶/副本/ROLLUP/物化视图/Colocate Join 等 OLAP 建模与查询优化）。
调研时点：2026-08-26。规律聚焦分桶策略、副本数、ROLLUP/物化视图预聚合、Colocate Join 本地性等核心性能陷阱。

§4 门禁清单的 id 与 assets/framework-gates/doris.sh 的 `# gates:` 头注释严格一致。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.doris:doris-fe-common` / `doris-spark-connector` / `doris-flink-connector` / `mysql-connector-java`（Doris 兼容 MySQL 协议） | 高 |
| 配置 | `fe.conf` 含 `priority_networks` / `meta_dir`；`be.conf` 含 `storage_root_path` / `webserver_port` | 高 |
| 代码 | `DorisStreamLoadClient` / `DorisSource` / `DorisSink` / `insert into` / `SELECT` from `information_schema` | 高 |
| SQL | `DISTRIBUTED BY HASH` / `PROPERTIES("replication_num"` / `ROLLUP` / `MATERIALIZED VIEW` / `COLOCATE WITH` | 高 |
| 文件 | `fe.conf` / `be.conf` / `*.sql` 含 `CREATE TABLE` Doris 语法 | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md。
detect 信号命中任一高置信度行即可激活 doris 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Doris 建表：`grep -rlE 'CREATE TABLE|CREATE MATERIALIZED VIEW' "${PROJECT_DIR}" --include='*.sql' --include='*.java' --include='*.py'`（计数核验基准：建表/物化视图文件数）
- 分桶定义：`grep -rnE 'DISTRIBUTED BY HASH|BUCKETS|BEGIN WITH' "${PROJECT_DIR}" --include='*.sql'`
- 副本数：`grep -rnE 'replication_num|"replication_num"' "${PROJECT_DIR}" --include='*.sql' --include='*.conf'`
- ROLLUP：`grep -rnE 'ROLLUP|ADD ROLLUP|ALTER TABLE.*ROLLUP' "${PROJECT_DIR}" --include='*.sql'`
- 物化视图：`grep -rnE 'MATERIALIZED VIEW|CREATE MATERIALIZED VIEW|REFRESH MATERIALIZED VIEW' "${PROJECT_DIR}" --include='*.sql'`
- Colocate Join：`grep -rnE 'COLOCATE WITH|colocate_with' "${PROJECT_DIR}" --include='*.sql'`
- FE/BE 配置：`find "${PROJECT_DIR}" -name 'fe.conf' -o -name 'be.conf' 2>/dev/null | head`

<!--
枚举该框架特有的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：未分桶或分桶键选择不当致数据倾斜

- **现象**：建表无 `DISTRIBUTED BY HASH(col)` 或分桶键为低基数列（如 gender），数据集中到少数桶，查询长尾。
- **根因**：Doris 按分桶键哈希分布数据到 BE 节点；分桶键须高基数列（如 user_id）；缺分桶则单桶全量。
- **影响**：查询倾斜、BE 负载不均（CWE-400 资源浪费）。
- **证据**：Doris 数据模型文档：分桶键须为高基数列，建议桶数 ≈ BE 节点数 × 1~3。
- **对应门禁**：`fw_doris_bucket`（warn）。

```verify
id: doris-r1
cmd: 
expect: always
```

### 规律：副本数未随集群规模配置致高可用缺失

- **现象**：`replication_num` 默认 3，但单节点测试/小规模集群未下调导致写入失败；或多节点集群误设为 1 失去容灾。
- **根因**：副本数须与 BE 节点数匹配；默认 3 在单 BE 环境建表失败。
- **影响**：建表失败或单点故障数据丢失（CWE-754 不当异常处理）。
- **证据**：Doris 副本文档：单节点须 `replication_num=1`；多节点默认 3，须显式声明。
- **对应门禁**：`fw_doris_replication`（fail）。

```verify
id: doris-r2
cmd: 
expect: always
```

### 规律：高频聚合查询未建 ROLLUP/物化视图致全表扫

- **现象**：固定维度聚合（如按天统计 PV）每次跑 `GROUP BY dt` 全表扫，未用 ROLLUP 预聚合或异步物化视图。
- **根因**：Doris 的 ROLLUP（上卷）与物化视图将聚合结果物化，查询直接命中；缺则重复全表聚合。
- **影响**：查询慢（CWE-400 资源浪费）。
- **证据**：Doris ROLLUP/物化视图文档：预聚合将聚合查询提速数个数量级。
- **对应门禁**：`fw_doris_rollup`（warn）。

```verify
id: doris-r3
cmd: 
expect: always
```

### 规律：大表 Join 未用 Colocate 致跨节点数据 shuffle

- **现象**：两表都按相同分桶键分桶且想本地 join，但缺 `COLOCATE WITH` 声明，查询走网络 shuffle。
- **根因**：Colocate Group 保证同分桶键数据同节点，join 本地化；缺声明则数据重分布。
- **影响**：网络 shuffle 放大、查询慢（CWE-400 资源浪费）。
- **证据**：Doris Colocate Join 文档：须 `PROPERTIES("colocate_with"="group_name")` 且分桶数一致。
- **对应门禁**：`fw_doris_colocate`（warn）。

```verify
id: doris-r4
cmd: 
expect: always
```

### 规律：物化视图未设刷新策略致结果过期

- **现象**：`CREATE MATERIALIZED VIEW` 后未配 `REFRESH` 策略（定时/触发），基表更新后视图数据过期。
- **根因**：Doris 物化视图需显式刷新（异步/定时）；默认不自动随基表更新。
- **影响**：查询结果过期、业务误判（数据一致性缺陷）。
- **证据**：Doris 物化视图文档：须 `REFRESH ASYNC|MANUAL|ON COMMIT` 声明刷新模式。
- **对应门禁**：`fw_doris_mv_refresh`（warn）。

```verify
id: doris-r5
cmd: 
expect: always
```

### 规律：字段类型过宽（VARCHAR 不设长度上限）致存储膨胀

- **现象**：`VARCHAR` 不指定长度或设极大（VARCHAR(65533)），Doris 按最大长度预留，存储/内存浪费。
- **根因**：Doris 的 VARCHAR 实际按内容存但统计/内存估算按声明上限；超宽列影响查询计划。
- **影响**：存储/内存浪费（CWE-400 资源浪费）。
- **证据**：Doris 数据类型文档：VARCHAR 建议按实际最大长度声明，避免默认超宽。
- **对应门禁**：`fw_doris_varchar_width`（warn）。

```verify
id: doris-r6
cmd: 
expect: always
```

### 规律：未用 Bitmap/Dictionary 索引致高基数列点查慢

- **现象**：高基数列（user_id）频繁等值查询但未建 Bitmap 索引，Doris 全列扫。
- **根因**：Doris 的 Bitmap 索引适合高基数列等值/IN 查询；缺则退化为顺序扫。
- **影响**：点查慢（CWE-400 资源浪费）。
- **证据**：Doris 索引文档：Bitmap 索引针对高基数列；Dictionary 针对低基数列。
- **对应门禁**：`fw_doris_index`（warn）。

```verify
id: doris-r7
cmd: 
expect: always
```

### 规律：动态分区未开启致历史分区需手动管理

- **现象**：按天/月增长的数据未开 `dynamic_partition`，历史分区须手动 `ADD PARTITION`，易漏建导致写入失败。
- **根因**：Doris 动态分区自动建/删分区；缺则人工运维负担 + 漏建分区写入报错。
- **影响**：写入失败/运维负担（CWE-754 不当异常处理）。
- **证据**：Doris 动态分区文档：`PROPERTIES("dynamic_partition.enable"="true")` 自动管理。
- **对应门禁**：`fw_doris_dynamic_partition`（warn）。

```verify
id: doris-r8
cmd: 
expect: always
```

### 规律：Stream Load 批次过小致导入吞吐低

- **现象**：逐行 Stream Load 导入，批次 KB 级，BE 导入线程频繁调度，吞吐远低于 MB 级批次。
- **根因**：Doris Stream Load 走 HTTP 批次导入；批次过小调度开销占比高。
- **影响**：导入慢（CWE-400 资源浪费）。
- **证据**：Doris 导入优化：建议批次 100MB~1GB（受 `max_filter_ratio` 与内存约束）。
- **对应门禁**：`fw_doris_stream_load`（warn）。

```verify
id: doris-r9
cmd: 
expect: always
```

### 规律：未设 query timeout / 大查询无资源隔离致雪崩

- **现象**：未配 `query_timeout` 或 Resource Group，单条大查询占满 BE CPU/内存，拖垮集群其他查询。
- **根因**：Doris 须用 Resource Group / `query_timeout` 限制单查询资源；缺则无隔离。
- **影响**：集群雪崩（CWE-400 资源耗尽）。
- **证据**：Doris 资源隔离文档：Resource Group 限制 CPU/内存/IO；`query_timeout` 防长查询挂死。
- **对应门禁**：`fw_doris_resource_group`（warn）。

```verify
id: doris-r10
cmd: 
expect: always
```

<!--
规律数 = 10（≥ 深度门槛 10）。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_doris_bucket | warn | 建表无 DISTRIBUTED BY HASH 或分桶键低基 → 数据倾斜 warn | DORIS_SRC_GLOBS |
| fw_doris_replication | fail | replication_num 与 BE 节点数不匹配（单节点=3 或多节点=1） → 高可用缺失 fail | DORIS_SRC_GLOBS |
| fw_doris_rollup | warn | 高频聚合查询无 ROLLUP/物化视图 → 全表扫 warn | DORIS_SRC_GLOBS |
| fw_doris_colocate | warn | 同分桶键大表 join 无 COLOCATE WITH → 跨节点 shuffle warn | DORIS_SRC_GLOBS |
| fw_doris_mv_refresh | warn | 物化视图无 REFRESH 策略 → 结果过期 warn | DORIS_SRC_GLOBS |
| fw_doris_varchar_width | warn | VARCHAR 不设长度上限（>255 或默认） → 存储膨胀 warn | DORIS_SRC_GLOBS |
| fw_doris_index | warn | 高基数列等值查询未建 Bitmap 索引 → 点查慢 warn | DORIS_SRC_GLOBS |
| fw_doris_dynamic_partition | warn | 按时间增长数据无 dynamic_partition → 手动管理 warn | DORIS_SRC_GLOBS |
| fw_doris_stream_load | warn | Stream Load 批次过小（逐行/KB 级） → 导入慢 warn | DORIS_SRC_GLOBS |
| fw_doris_resource_group | warn | 无 query_timeout/Resource Group → 大查询雪崩 warn | DORIS_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_doris_<rule>。
本表 10 条 id 须在 assets/framework-gates/doris.sh 中有同名实现痕迹。
依赖变量 DORIS_SRC_GLOBS 在片段头注释声明。
-->

## §5 跨框架交互规则

- **与 Spark/Flink 协作**：Spark/Doris connector 批量写须对齐分桶键（规律1）；Flink CDC 直写 Doris 表。
- **与 MySQL 兼容层**：Doris 兼容 MySQL 协议，应用用 mysql-connector 连接；但部分 MySQL 语法/函数不支持须核对。
- **与 Kafka（Routine Load）**：Routine Load 从 Kafka 持续导入，批次/并发配置影响导入吞吐（规律9）。
- **与 Grafana/BI**：BI 查询走物化视图（规律3/5）提速；Resource Group（规律10）隔离 BI 大查询。

## §6 版本陷阱速查

| 版本 | 陷阱 |
|------|------|
| 2.0 | 引入 Merge-on-Write 表；`replication_num` 默认 3，单节点须显式 1 |
| 2.1.x | 存储计算分离预览；Colocate Join 须分桶数严格一致 |
| 2.1.7（最新） | 物化视图 REFRESH 语法稳定；动态分区默认关闭须显式开启 |
| 3.0（预览） | 存储计算分离 GA；部分 2.x 参数语义变更，升级须复核 |

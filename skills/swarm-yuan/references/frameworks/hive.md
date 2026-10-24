---
ruleset_id: hive
适用版本: Apache Hive 3.x（3.0–3.1，现行稳定 3.1.3）/ Hive Metastore 同轨 / Tez 0.10+ / LLAP
最后调研: 2026-08-26（来源：https://cwiki.apache.org/confluence/display/Hive/Home ；https://hive.apache.org/ ；https://cwiki.apache.org/confluence/display/Hive/LanguageManual+DDL ；https://cwiki.apache.org/confluence/display/Hive/Vectorization ）
深度门槛: 10
---

# Hive 规则集

<!--
本规则集覆盖 Apache Hive 3.x（HiveQL / Metastore / 执行引擎 Tez+LLAP / ACID 事务 / 存储格式 ORC）。
调研时点：2026-08-26。规律聚焦分区/分桶、Tez 引擎、ACID 事务、向量化查询、ORC 格式等核心建模与性能陷阱。

§4 门禁清单的 id 与 assets/framework-gates/hive.sh 的 `# gates:` 头注释严格一致。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.hive:hive-exec` / `hive-jdbc` / `hive-metastore` / `hive-service` | 高 |
| 配置 | `hive-site.xml` 含 `javax.jdo.option.ConnectionURL` / `hive.metastore.uris` / `hive.execution.engine` | 高 |
| 代码 | `HiveConf` / `HiveDriver` / `HiveMetastoreClient` / `IMetaStoreClient` / `TezSession` | 高 |
| SQL/HQL | `CREATE TABLE` 含 `PARTITIONED BY` / `CLUSTERED BY ... INTO ... BUCKETS` / `STORED AS ORC` / `TBLPROPERTIES('transactional'='true')` | 高 |
| 文件 | `hive-site.xml` / `hive-env.sh` / `*.hql` / `*.q` / `beeline` 脚本 | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md。
detect 信号命中任一高置信度行即可激活 hive 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Hive 建表 DDL：`grep -rlE 'CREATE TABLE|CREATE EXTERNAL TABLE' "${PROJECT_DIR}" --include='*.hql' --include='*.q' --include='*.sql'`（计数核验基准：建表语句文件数）
- 分区表：`grep -rnE 'PARTITIONED BY' "${PROJECT_DIR}" --include='*.hql' --include='*.q' --include='*.sql'`
- 分桶表：`grep -rnE 'CLUSTERED BY|INTO [0-9]+ BUCKETS' "${PROJECT_DIR}" --include='*.hql' --include='*.q' --include='*.sql'`
- ORC 存储：`grep -rnE 'STORED AS ORC' "${PROJECT_DIR}" --include='*.hql' --include='*.q' --include='*.sql'`
- ACID 事务表：`grep -rnE "TBLPROPERTIES\('transactional'='true'\)" "${PROJECT_DIR}" --include='*.hql' --include='*.q'`
- 执行引擎配置：`grep -rnE 'hive\.execution\.engine|set hive.execution.engine' "${PROJECT_DIR}" --include='*.xml' --include='*.hql' --include='*.q' --include='*.properties'`
- 向量化开关：`grep -rnE 'hive\.vectorized\.execution\.enabled|set hive.vectorized' "${PROJECT_DIR}" --include='*.xml' --include='*.hql'`

<!--
枚举该框架特有的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：大表全量扫描缺分区裁剪致 IO 爆炸

- **现象**：查询不带分区过滤条件（`WHERE dt='2026-08-26'`），Hive 全分区扫描，PB 级表 IO 打满。
- **根因**：表按 `dt` 分区但未在查询谓词使用分区列；未建分区或分区列未被谓词引用 → 无分区裁剪（partition pruning）。
- **影响**：扫描 IO 放大、查询超时（CWE-400 资源浪费）。
- **证据**：Hive 分区裁剪依赖查询谓词命中分区列；`EXPLAIN` 中无 `Partition Filters` 即未裁剪（Hive DDL 指南）。
- **对应门禁**：`fw_hive_partition`（warn）。

```verify
id: hive-r1
cmd: 
expect: always
```

### 规律：分桶表 join 未对齐 bucket 数致 shuffle

- **现象**：两表都 `CLUSTERED BY(key) INTO N BUCKETS`，但 N 不等或 join key 非分桶键，仍走 shuffle 而非 bucket map join。
- **根因**：分桶须 join key 与分桶键一致且 bucket 数成倍数；否则分桶失效退化为普通 shuffle join。
- **影响**：join 性能下降（CWE-400 资源浪费）。
- **证据**：Hive 分桶 join 要求 bucket 列 == join 列且 bucket 数相等或成倍数（LanguageManual Join）。
- **对应门禁**：`fw_hive_bucket`（warn）。

```verify
id: hive-r2
cmd: 
expect: always
```

### 规律：默认执行引擎 MR 未切 Tez 致批处理慢

- **现象**：`hive.execution.engine=mr`（默认）跑复杂 ETL，比 Tez 慢数倍（MR 每 stage 落盘）。
- **根因**：Hive 2.x 起默认引擎仍是 mr；未显式 `set hive.execution.engine=tez`（或 spark）。
- **影响**：ETL 作业长尾（性能缺陷，warn 提示切 Tez/LLAP）。
- **证据**：Hive 官方性能指南：Tez 比 MR 快（DAG 复用容器、无每 stage 落盘）；默认 mr 为兼容旧行为。
- **对应门禁**：`fw_hive_execution_engine`（warn）。

```verify
id: hive-r3
cmd: 
expect: always
```

### 规律：ACID 事务表未开事务管理器致 MERGE 失败

- **现象**：`TBLPROPERTIES('transactional'='true')` 表执行 `MERGE`/`UPDATE`/`DELETE`，但未配 `hive.txn.manager=DbTxnManager` 与 `hive.compactor.*`。
- **根因**：ACID 表须用 `DbTxnManager`（默认 `DummyTxnManager` 不支持事务）；缺则写事务表抛异常。
- **影响**：数据写入失败（CWE-754 不当异常处理）。
- **证据**：Hive 事务文档：ACID 表强制 `hive.txn.manager=org.apache.hadoop.hive.ql.lockmgr.DbTxnManager`，缺则报错。
- **对应门禁**：`fw_hive_acid`（fail）。

```verify
id: hive-r4
cmd: 
expect: always
```

### 规律：未开向量化查询致 CPU 利用率低

- **现象**：`hive.vectorized.execution.enabled=false`（默认 false 在部分版本）跑 Scan/Filter/Agg，单行列处理 CPU 低效。
- **根因**：向量化需 ORC/Parquet 列式格式 + 列式批处理；未开启则逐行解释执行。
- **影响**：查询慢（性能缺陷，warn 提示开启向量化）。
- **证据**：Hive 向量化文档：须 `hive.vectorized.execution.enabled=true` + `hive.vectorized.execution.reduce.enabled=true`，且表为 ORC。
- **对应门禁**：`fw_hive_vectorization`（warn）。

```verify
id: hive-r5
cmd: 
expect: always
```

### 规律：非 ORC 文本格式存储致压缩/读取低效

- **现象**：`STORED AS TEXTFILE`（默认）存大表，无列裁剪、无压缩，查询全列全行扫描。
- **根因**：TEXTFILE 是默认行式格式；未 `STORED AS ORC`（列式 + 压缩 + 谓词下推）。
- **影响**：存储膨胀、查询慢（CWE-400 资源浪费）。
- **证据**：Hive 存储指南：ORC 提供列裁剪/压缩/谓词下推，优于 TEXTFILE/SEQUENCEFILE。
- **对应门禁**：`fw_hive_orc`（warn）。

```verify
id: hive-r6
cmd: 
expect: always
```

### 规律：动态分区无 `hive.exec.dynamic.partition.mode=nonstrict` 致写入拒绝

- **现象**：`INSERT OVERWRITE TABLE ... PARTITION(dt)` 动态分区写入，未设 `nonstrict` 模式，Hive 抛"both static and dynamic partitions"错误。
- **根因**：默认 `strict` 模式禁止全动态分区（防误覆盖），须显式 `set hive.exec.dynamic.partition.mode=nonstrict`。
- **影响**：写入失败（CWE-754 不当异常处理）。
- **证据**：Hive DML 指南：strict 模式要求至少一个静态分区；全动态须 nonstrict。
- **对应门禁**：`fw_hive_dynamic_partition`（fail）。

```verify
id: hive-r7
cmd: 
expect: always
```

### 规律：external table 未配 location 致数据漂移

- **现象**：`CREATE EXTERNAL TABLE` 不指定 `LOCATION`，默认 warehouse 目录，删除表时数据残留或误删其他表数据。
- **根因**：external 表数据由用户管理，须显式 `LOCATION`；缺省落默认 warehouse 易混淆。
- **影响**：数据管理混乱（非安全缺陷，warn 提示显式 LOCATION）。
- **证据**：Hive DDL 指南：external 表 `DROP` 只删元数据不删数据，LOCATION 不明确易误关联。
- **对应门禁**：`fw_hive_external_location`（warn）。

```verify
id: hive-r8
cmd: 
expect: always
```

### 规律：小文件过多致 Metastore 压力与查询慢

- **现象**：频繁 `INSERT` 生成海量小 ORC 文件（<HDFS block），Metastore 元数据膨胀、查询开文件句柄多。
- **根因**：未合并小文件（`hive.merge.*` 参数或定期 compaction）；流式写入尤其明显。
- **影响**：Metastore 压力、查询慢（CWE-400 资源浪费）。
- **证据**：Hive 小文件合并文档：`hive.merge.mapfiles`/`hive.merge.mapredfiles` 控制合并；ACID 表靠 compactor。
- **对应门禁**：人工检查（dev-guide 提示配置 `hive.merge.*`）。

```verify
id: hive-r9
cmd: 
expect: always
```

### 规律：Tez container 内存未调优致 OOM kill

- **现象**：`hive.tez.container.size` 默认与 `hadoop` 容器一致，复杂 UDF/大 shuffle 时 AM/container 被 YARN kill。
- **根因**：Tez 容器内存未随负载调整；默认偏小。
- **影响**：作业失败（CWE-400）。
- **证据**：Tez 调优文档：`hive.tez.container.size` 须 ≥ `hive.tez.java.opts` 堆外，按需放大。
- **对应门禁**：人工检查（dev-guide 提示按负载调 Tez 内存）。

```verify
id: hive-r10
cmd: 
expect: always
```

<!--
规律数 = 10（≥ 深度门槛 10）。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_hive_partition | warn | 建表 PARTITIONED BY 但查询 HQL 无分区列谓词 → 全表扫描 warn | HIVE_SRC_GLOBS |
| fw_hive_bucket | warn | 两表 CLUSTERED BY 但 join key 未对齐 bucket 或 bucket 数不等 → shuffle warn | HIVE_SRC_GLOBS |
| fw_hive_execution_engine | warn | 含 HQL/配置但 hive.execution.engine=mr 或未设 → 未切 Tez warn | HIVE_SRC_GLOBS |
| fw_hive_acid | fail | 事务表 TBLPROPERTIES transactional=true 但 txn.manager 非 DbTxnManager → MERGE 失败 CWE-754 fail | HIVE_SRC_GLOBS |
| fw_hive_vectorization | warn | ORC 表但 vectorized.execution.enabled 非 true → 未向量化 warn | HIVE_SRC_GLOBS |
| fw_hive_orc | warn | 建表 STORED AS TEXTFILE/未 STORED AS ORC → 列式低效 warn | HIVE_SRC_GLOBS |
| fw_hive_dynamic_partition | fail | 动态分区 INSERT 但 dynamic.partition.mode 非 nonstrict → 写入拒绝 CWE-754 fail | HIVE_SRC_GLOBS |
| fw_hive_external_location | warn | CREATE EXTERNAL TABLE 无 LOCATION → 数据漂移 warn | HIVE_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_hive_<rule>。
本表 8 条 id 须在 assets/framework-gates/hive.sh 中有同名实现痕迹。
依赖变量 HIVE_SRC_GLOBS 在片段头注释声明。
-->

## §5 跨框架交互规则

- **与 Spark 叠加**：Spark 直读 Hive 表走 Hive Metastore；Hive 的 ORC/分区策略决定 Spark 读取并行度（`spark.sql.hive.convertMetastoreOrc` 控制转换）。
- **与 Hadoop/YARN**：Tez/MR 容器内存受 YARN 队列上限约束；动态分区小文件数影响 HDFS NameNode 元数据。
- **与 Kafka（流式落 Hive）**：Structured Streaming / Flink 写 Hive 分区表须对齐 `dt` 分区列与 `hive.exec.dynamic.partition.mode`。
- **与 Ranger/Sentry**：Hive 表授权常由外部组件接管；ACID 事务表权限须与 Ranger 策略协同。

## §6 版本陷阱速查

| 版本 | 陷阱 |
|------|------|
| 3.0 | 引入 LLAP、ACID 默认更严格；`hive.txn.manager` 仍默认 DummyTxnManager（事务表须显式切换） |
| 3.1.x | ORC 为默认推荐格式；`hive.vectorized.execution.enabled` 部分版本默认 false，须显式开 |
| 3.1.3（最新） | 默认执行引擎仍 mr（兼容）；生产须 `set hive.execution.engine=tez` |
| 3.x | 外部表 DROP 只删元数据不删数据；LOCATION 不明易误删/误留 |

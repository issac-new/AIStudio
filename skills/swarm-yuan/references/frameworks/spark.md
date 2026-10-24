---
ruleset_id: spark
适用版本: Apache Spark 3.x（3.0–3.5，现行稳定 3.5.3）/ Spark SQL + Structured Streaming 同轨
最后调研: 2026-08-26（来源：https://spark.apache.org/docs/latest/ ；https://spark.apache.org/docs/latest/rdd-programming-guide.html ；https://spark.apache.org/docs/latest/sql-performance-tuning.html ；https://jaceklaskowski.gitbooks.io/mastering-apache-spark/ ）
深度门槛: 10
---

# Spark 规则集

<!--
本规则集覆盖 Apache Spark 3.x（RDD / DataFrame-Dataset / Spark SQL / Structured Streaming）。
调研时点：2026-08-26。规律聚焦作业划分、数据倾斜、shuffle 调优、RDD 持久化、广播变量、
checkpoint 等核心性能与稳定性陷阱。无法确认的版本点已标"待验证"，不臆造。

§4 门禁清单的 id 与 assets/framework-gates/spark.sh 的 `# gates:` 头注释严格一致。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.spark:spark-core_2.12` / `spark-sql_2.12` / `spark-streaming_2.12` / `pyspark` / `spark_*` | 高 |
| 代码 | `SparkSession` / `JavaSparkContext` / `SparkContext` / `SparkConf` / `Dataset` / `RDD` | 高 |
| 配置 | `spark.` 前缀配置（`spark.sql.shuffle.partitions` / `spark.executor.memory` / `spark.default.parallelism`） | 高 |
| 文件 | `*.scala` 含 `import org.apache.spark` / `*.py` 含 `from pyspark` / `*.java` 含 `org.apache.spark` | 高 |
| 注解 | `@transient` / `@volatile`（RDD 闭包共享变量标注） | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md。
detect 信号命中任一高置信度行即可激活 spark 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Spark 作业入口：`grep -rlE 'SparkSession|getOrCreate|SparkContext' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py'`（计数核验基准：含作业入口的文件数）
- RDD 聚合算子：`grep -rnE '\.groupByKey\(|\.reduceByKey\(|groupBy\(' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py'`
- shuffle 配置：`grep -rnE 'spark\.sql\.shuffle\.partitions|spark\.default\.parallelism' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py' --include='*.conf' --include='*.properties'`
- 广播变量：`grep -rnE 'broadcast|sc\.broadcast|Broadcast' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py'`
- 持久化：`grep -rnE '\.persist\(|\.cache\(|persist\(|cache\(' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py'`
- driver 拉取：`grep -rnE '\.collect\(\)|\.collectAsList\(' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py'`
- checkpoint：`grep -rnE 'setCheckpointDir|\.checkpoint\(|Checkpoint' "${PROJECT_DIR}" --include='*.scala' --include='*.java' --include='*.py'`

<!--
枚举该框架特有的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：groupByKey / reduceByKey 未配 repartition/salting 致数据倾斜

- **现象**：对热点 key（如 user_id=0 占 80%）做 `groupByKey`/`reduceByKey`，单分区数据量是其余分区数十倍，该分区 task 长尾拖垮整批作业。
- **根因**：HashPartitioner 按 key 哈希分桶，热点 key 全落同一分区；未用 `repartition` 打散或 `salting`（加随机前缀）分摊。
- **影响**：作业长尾、节点 OOM、整体超时（CWE-400 不可控资源消耗）。
- **证据**：Spark `GroupByKey` 走 `ShuffledRDD`，分区数 = `spark.default.parallelism`；热点 key 不分摊则单分区倾斜是确定性行为（RDD 编程指南）。
- **对应门禁**：`fw_spark_data_skew`（warn）。

```verify
id: spark-r1
cmd: 
expect: always
```

### 规律：未显式配置 spark.sql.shuffle.partitions 致 shuffle 瓶颈

- **现象**：Spark SQL 写 SQL / DataFrame 聚合默认 `spark.sql.shuffle.partitions=200`，小集群 200 分区过碎、大集群 200 分区不够，shuffle 成瓶颈。
- **根因**：该参数默认 200（适配早期集群），未随数据量/集群规模调整；静态默认值不适应动态负载。
- **影响**：shuffle 读写放大、task 调度开销高、作业慢（非功能缺陷，warn 提示调优）。
- **证据**：Spark 官方 Tuning 指南明确该参数默认 200，须按 `总核数 * 2~3` 调整。
- **对应门禁**：`fw_spark_shuffle_partitions`（warn）。

```verify
id: spark-r2
cmd: 
expect: always
```

### 规律：大表 join 小表未 broadcast 致 shuffle 放大

- **现象**：`bigDF.join(smallDF)` 默认走 SortMergeJoin，小表也参与 shuffle；小表（<10MB）应广播避免 shuffle。
- **根因**：未用 `broadcast(smallDF)` 或 `spark.sql.autoBroadcastJoinThreshold` 阈值未覆盖；优化器未选 BroadcastHashJoin。
- **影响**：无谓 shuffle、网络/磁盘 IO 放大、作业慢（CWE-400 资源浪费）。
- **证据**：Spark 源码 `BroadcastHashJoinExec` 仅在小表 ≤ `autoBroadcastJoinThreshold`（默认 10MB）时启用；超阈值须显式 `broadcast()`。
- **对应门禁**：`fw_spark_broadcast`（warn）。

```verify
id: spark-r3
cmd: 
expect: always
```

### 规律：.collect() 全量拉到 driver 致 OOM

- **现象**：`df.collect()` / `rdd.collect()` 把全量数据序列化拉到 driver 单点内存，数据集大即 OOM 崩溃。
- **根因**：collect 是 action，结果全量返回 driver JVM；分布式数据集本不应落单点。
- **影响**：CWE-400——driver OOM 致整个应用失败，无法水平扩展。
- **证据**：Spark `Dataset.collect()` Javadoc 明确"返回全行到 driver"，大数据集禁用；应 `take`/`limit` 或写 sink（`.write`）。
- **对应门禁**：`fw_spark_collect`（fail）；`.limit(N).collect()` / `.take(N)` / `.head(N)` 属有界拉取，门禁豁免。

```verify
id: spark-r4
cmd: 
expect: always
```

### 规律：同一 RDD/DF 多 action 未 persist 致 lineage 重算

- **现象**：同一 RDD 连续 `count()`+`save()`+`take()`，每次 action 重跑整条 lineage（含前面所有 transformation），浪费计算。
- **根因**：Spark 转换惰性，action 触发从头重算；未 `persist()`/`cache()` 物化中间结果。
- **影响**：重复计算、作业时长翻倍（CWE-400 资源浪费）。
- **证据**：Spark 缓存指南：`persist()` 将 RDD 物化到内存/磁盘，后续 action 复用；未持久化则每次重算。
- **对应门禁**：`fw_spark_persist`（warn）。

```verify
id: spark-r5
cmd: 
expect: always
```

### 规律：迭代算法（图计算/ML 训练）未 checkpoint 致 lineage 爆炸

- **现象**：`while`/`for` 循环内反复对 RDD 做 transformation（如 PageRank 迭代），lineage 随迭代次数线性增长，task 失败重算成本指数上升。
- **根因**：RDD 依赖链不截断， lineage 无限增长；未 `setCheckpointDir` + `.checkpoint()` 截断。
- **影响**：失败重算极慢、栈溢出风险（CWE-400）。
- **证据**：Spark `RDD.checkpoint()` 截断 lineage 落可靠存储；官方指南建议长 lineage 迭代算法必 checkpoint。
- **对应门禁**：`fw_spark_checkpoint`（warn）。

```verify
id: spark-r6
cmd: 
expect: always
```

### 规律：广播变量在闭包内被序列化失败（非 Serializable）

- **现象**：`sc.broadcast(largeObj)` 后在大对象含不可序列化成员（Connection/SparkContext）时，task 分发抛 `NotSerializableException`。
- **根因**：广播变量须 `Serializable`；闭包捕获的外部对象默认整对象序列化，非序列化成员致失败。
- **影响**：作业启动即失败（CWE-707 不当初始化）。
- **证据**：Spark `Broadcast` 要求 value 可序列化；闭包序列化规则见 RDD 编程指南"闭包陷阱"。
- **对应门禁**：`fw_spark_broadcast`（warn，同门禁附带序列化检查提示）。

```verify
id: spark-r7
cmd: 
expect: always
```

### 规律：executor 内存未配或过小致频繁 GC / OOM

- **现象**：`spark.executor.memory` 默认 1G，复杂 UDF/大对象场景 GC 停顿长或 OOM 被 YARN kill。
- **根因**：默认内存面向 demo；未随数据规模与 UDF 复杂度调优。
- **影响**：作业慢/失败（CWE-400）。
- **证据**：Spark 默认 `spark.executor.memory=1g`；官方调优建议按数据量配置 + `spark.memory.fraction`。
- **对应门禁**：人工检查（dev-guide 提示按负载配内存）。

```verify
id: spark-r8
cmd: 
expect: always
```

### 规律：DataFrame 用 rdd 转换丢失 Catalyst 优化

- **现象**：`df.rdd.map(...).toDF()` 把结构化数据降级为 RDD，绕过 Catalyst/Wallet 优化与 Tungsten 二进制格式，性能下降。
- **根因**：RDD API 无谓词下推/列裁剪/代码生成；能用 DataFrame/SQL 表达的不该退回 RDD。
- **影响**：性能损失（CWE-400 资源浪费，warn 提示优先 DataFrame API）。
- **证据**：Spark 性能调优指南：DataFrame/Dataset 优于 RDD（Catalyst 优化）；仅无对应 API 才用 RDD。
- **对应门禁**：人工检查（dev-guide 提示优先结构化 API）。

```verify
id: spark-r9
cmd: 
expect: always
```

### 规律：Structured Streaming 未设 watermark 致状态无限增长

- **现象**：`groupBy(window(...))` 流式聚合未配 `.withWatermark()`，状态存储按事件时间无限累积，checkpoint 体积爆炸。
- **根因**：无 watermark 则引擎保留所有历史窗口状态（无过期边界）；状态后端溢出。
- **影响**：状态存储 OOM、checkpoint 膨胀（CWE-400）。
- **证据**：Spark Structured Streaming 指南：watermark 定义状态过期边界；无 watermark 则状态不淘汰。
- **对应门禁**：`fw_spark_streaming_watermark`（warn）。

```verify
id: spark-r10
cmd: 
expect: always
```

<!--
规律数 = 10（≥ 深度门槛 10）。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_spark_data_skew | warn | 检出 groupByKey/reduceByKey/groupBy 但无 repartition/salting → 数据倾斜 warn | SPARK_SRC_GLOBS |
| fw_spark_shuffle_partitions | warn | 未配置 spark.sql.shuffle.partitions → 默认 200 shuffle 瓶颈 warn | SPARK_SRC_GLOBS |
| fw_spark_broadcast | warn | 检出 join 但无 broadcast → 大表×小表未广播 shuffle 放大 warn | SPARK_SRC_GLOBS |
| fw_spark_collect | fail | 检出 .collect()/.collectAsList() 全量拉到 driver → OOM CWE-400 fail | SPARK_SRC_GLOBS |
| fw_spark_persist | warn | 同一 RDD/DF 多 action（≥2）但无 persist/cache → lineage 重算 warn | SPARK_SRC_GLOBS |
| fw_spark_checkpoint | warn | 迭代循环（while/for 含 rdd 转换）无 setCheckpointDir/checkpoint → lineage 爆炸 warn | SPARK_SRC_GLOBS |
| fw_spark_streaming_watermark | warn | 流式 window 聚合无 withWatermark → 状态无限增长 warn | SPARK_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_spark_<rule>（rule 全小写下划线）。
本表 7 条 id 须在 assets/framework-gates/spark.sh 中有同名实现痕迹。
片段头注释 `# gates:` 与本表 id 集合应一致。
依赖变量 SPARK_SRC_GLOBS 在片段头注释 `# ruleset: spark  requires_conf: SPARK_SRC_GLOBS` 声明。
-->

## §5 跨框架交互规则

- **与 Hive 叠加**：Spark 读 Hive 表（`spark.sql` 直查 Hive Metastore）时，Hive 分区/分桶策略影响 Spark 读取并行度；Spark 写出 Hive 表须对齐 Hive 存储格式（ORC/Parquet）。
- **与 Kafka 协作**：Structured Streaming 以 Kafka 为 source/sink，offset 管理依赖 checkpoint 目录；checkpoint 目录须可靠存储（见规律6）。
- **与 Hadoop/YARN 资源调度**：executor 内存/核数须落在 YARN 容器上限内，超出被 kill（见规律8）；动态资源分配 `spark.dynamicAllocation.enabled` 与 YARN 队列配额协同。
- **与 Delta/Iceberg 表格式**：Spark 写湖仓表时 `spark.sql.shuffle.partitions` 影响小文件数（见规律2）；大批量 merge 须控并行度。

## §6 版本陷阱速查

| 版本 | 陷阱 |
|------|------|
| 3.0 | 引入 Adaptive Query Execution（AQE），`spark.sql.adaptive.enabled` 默认开；老代码依赖固定分区数的假设失效 |
| 3.0–3.2 | `spark.sql.shuffle.partitions` 默认仍 200，AQE 下可被 coalesce，但显式调优仍必要 |
| 3.3+ | `spark.sql.adaptive.coalescePartitions.enabled` 默认开，避免小分区碎片；但极端倾斜仍需 salting |
| 3.4+ | Scala 2.13 支持；`groupByKey` 仍走 ShuffledRDD，倾斜行为不变（规律1 跨版本成立） |
| 3.5.x（最新） | Structured Streaming checkpoint 格式向后兼容 3.x；升级须保留 checkpoint 目录 |

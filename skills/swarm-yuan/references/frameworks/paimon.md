---
ruleset_id: paimon
适用版本: Apache Paimon 1.x（1.1–1.4，现行稳定 1.4；1.5-SNAPSHOT 开发中）
最后调研: 2026-07-17（来源：https://paimon.apache.org/docs/master/project/download/ ；https://paimon.apache.org/docs/master/ ）
深度门槛: 10
---

# Paimon 规则集

<!--
本规则集覆盖 Apache Paimon 1.x（现行稳定 1.4，1.5-SNAPSHOT 开发中）。
调研时点：2026-07-17。已核实：1.4 为现行 stable（download 页版本选择器）；引擎 jar 覆盖 Flink 1.16–1.20，
Flink 2.0 引擎 jar 在 1.5-SNAPSHOT 下载页标注 "Not yet released"（即 Paimon×Flink 2.0 协同待验证）。
未联网核实的细节（具体配置默认值如 num-sorted-run 触发阈值、write-buffer-size 默认值、file.format 默认值）
一律标"待验证"，对应门禁统一降 warn。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.apache.paimon:paimon-flink-*` / `paimon-spark-*` / `paimon-bundle` / `paimon-hive-connector` / `paimon-trino` | 高 |
| 配置 | `'connector'\s*=\s*'paimon'` / `catalog-type=paimon` / `warehouse` + `paimon` / `PAIMON` catalog 注册 | 高 |
| 文件 | `**/catalog/*.sql`（含 paimon DDL）/ `warehouse/` 目录下 `*/db.db/*/manifest/` 结构 | 中（须排除他用） |
| 配置项 | `merge-engine` / `changelog-producer` / `bucket` / `snapshot.time-retained` / `scan.mode` | 高 |
| 代码/SQL | `CREATE TABLE ... WITH ('connector'='paimon')` / `MERGE INTO`（paimon spark）/ `sys.compact` 过程调用 | 高 |
| CDC | flink-cdc YAML `sink: connector: paimon` / `PaimonPipeline` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 paimon 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Paimon 表 DDL：`grep -rliE "connector['\"]?[[:space:]]*=[[:space:]]*['\"]?paimon|merge-engine|changelog-producer" "${PROJECT_DIR}" --include='*.sql' --include='*.yaml' --include='*.java'`（计数核验基准：含 paimon 定义的表文件数）
- 主键表：`grep -rliE 'PRIMARY KEY' <上条文件集>`（计数核验基准：主键表 DDL 数）
- 分区表：`grep -rniE 'PARTITIONED BY' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：分区定义行数）
- bucket 配置：`grep -rniE "'bucket'|bucket-key" "${PROJECT_DIR}" --include='*.sql' --include='*.yaml'`（计数核验基准：命中行数）
- 快照保留配置：`grep -rniE 'snapshot\.(time-retained|num-retained)' "${PROJECT_DIR}"`（计数核验基准：命中行数）
- 流读配置：`grep -rniE 'scan\.mode|scan\.snapshot-id|scan\.timestamp' "${PROJECT_DIR}"`（计数核验基准：命中行数）
- Catalog 注册：`grep -rniE "CREATE CATALOG|catalog-type|StoreCatalog|HiveCatalog" "${PROJECT_DIR}"`（计数核验基准：命中行数）
- 快照过期维护：`grep -rniE 'expire_snapshots|sys\.expire|snapshot.expire' "${PROJECT_DIR}"`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：主键表必须显式规划 bucket，禁止裸用默认值
- **适用版本**: Paimon 1.x
- **规律**: 主键表（PRIMARY KEY）按 bucket 分桶组织 LSM 树，bucket 数决定写入并发与 compaction 并行度上限；不显式配置时按默认单 bucket（默认值待验证，1.x 默认 1），大表写入串行化、compaction 无法并行、查询无法分桶裁剪。生产主键表必须按数据量显式 `'bucket'='N'`；总量不可预知时评估 dynamic bucket（`bucket=-1`，须配合 cross-partition upsert 语义，待验证适用边界）。
- **违反后果**: 单 bucket 大表 → 写入瓶颈 + compaction 堆积 + 小文件爆炸；事后改 bucket 须重建表重灌数据。
- **验证方法**: 检出含 `PRIMARY KEY` 的 paimon DDL 但同文件无 `'bucket'`/`bucket-key` → fail。
- **对应门禁**: fw_paimon_pk_bucket(fail)

```verify
id: paimon-r1
cmd: 
expect: always
```

### 规律：主键表 Changelog 语义：+I/-U/+U/-D 四类，下游须按 changelog 消费
- **适用版本**: Paimon 1.x
- **规律**: 主键表写入产生 changelog：+I（插入）/-U（更新前像）/+U（更新后像）/-D（删除）。流读主键表默认消费 changelog；下游（如 Flink SQL 聚合、二级表）必须支持 retract 语义，否则更新被当追加处理 → 结果翻倍。append-only 表仅 +I，无更新语义。
- **违反后果**: 下游按 append 消费主键表 changelog → 聚合结果重复 / 口径翻倍。
- **验证方法**: 人工检查下游消费链路是否支持 retract（Flink SQL 原生支持；DataStream 自定义 sink 须人工确认）。
- **对应门禁**: 人工检查

```verify
id: paimon-r2
cmd: 
expect: always
```

### 规律：主键表必须配 compaction 参数，禁止依赖默认阈值
- **适用版本**: Paimon 1.x
- **规律**: LSM 结构靠 compaction 合并 sorted run 控制读放大与小文件；`num-sorted-run.compaction-trigger`（默认待验证）过小→compaction 频繁拖写入，过大→sorted run 堆积读放大 + 小文件爆炸。生产须按写入速率显式配 `num-sorted-run.compaction-trigger`/`num-sorted-run.stop-trigger` 与 `compaction.max.file-num` 等参数。
- **违反后果**: 默认阈值不适配写入速率 → 查询读放大数十倍 / compaction 追不上写入导致 write stall。
- **验证方法**: 检出主键表 DDL 但无 `num-sorted-run`/`compaction.` 配置 → warn。
- **对应门禁**: fw_paimon_compaction(warn)

```verify
id: paimon-r3
cmd: 
expect: always
```

### 规律：merge-engine 选型须匹配业务：deduplicate/partial-update/aggregation/first-row
- **适用版本**: Paimon 1.x
- **规律**: 主键表 `merge-engine` 决定同 key 多行合并语义：`deduplicate`（默认，保留最新行）/`partial-update`（多流各更新部分列，按 sequence-group 合并）/`aggregation`（按列聚合函数合并）/`first-row`（保留首行，适合去重入）。选型错配业务即数据错：如多流拼宽表误用 deduplicate 会整行覆盖丢列。
- **违反后果**: 多流 partial-update 场景误用 deduplicate → 列被 null 覆盖，数据静默损坏。
- **验证方法**: 检出 `'merge-engine'='(partial-update|aggregation|first-row)'` → warn 人工确认语义匹配；deduplicate 为默认安全项不告警。
- **对应门禁**: fw_paimon_merge_engine(warn)

```verify
id: paimon-r4
cmd: 
expect: always
```

### 规律：流读主键表 changelog 须配 changelog-producer（input/lookup/full-compaction）
- **适用版本**: Paimon 1.x
- **规律**: 主键表下游要拿到完整 -U/+U changelog，表须配 `changelog-producer`：`input`（依赖输入含全部 changelog，如 CDC 摄入）/`lookup`（写入时 lookup 生成前像，开销小）/`full-compaction`（full compaction 时产出，延迟高但写开销低）。不配 changelog-producer 时流读只能拿 +I/+U（缺前像），下游 retract 聚合结果错。
- **违反后果**: 下游 changelog 缺 -U 前像 → 更新场景聚合结果不收敛（旧值不撤）。
- **验证方法**: 检出流读（`scan.mode`）但表 DDL 无 `changelog-producer` → warn。
- **对应门禁**: fw_paimon_changelog_producer(warn)

```verify
id: paimon-r5
cmd: 
expect: always
```

### 规律：流读 scan.mode 选型：latest/compacted/full，禁止不明语义裸用
- **适用版本**: Paimon 1.x
- **规律**: `scan.mode` 决定流读起点与快照粒度：`latest`（默认，只读增量新数据，启动时不扫存量）/`full`（先全量快照后增量）/`compacted`（读 compacted 快照，低延迟场景慎用）。批读另有时空回溯模式（snapshot-id/timestamp）。用 latest 上线补数场景会丢全部存量数据。
- **违反后果**: 补数/回刷场景用 latest → 存量数据静默丢失。
- **验证方法**: 检出 `scan.mode` 配置 → warn 人工确认选型语义；未检出 → pass（默认 latest 已知风险自担）。
- **对应门禁**: fw_paimon_stream_scan_mode(warn)

```verify
id: paimon-r6
cmd: 
expect: always
```

### 规律：快照必须配过期保留策略，否则 storage 无限膨胀
- **适用版本**: Paimon 1.x
- **规律**: 每次 commit 生成快照，默认 `snapshot.time-retained`（默认 1h，待验证）与 `snapshot.num-retained.min/max` 控制过期；不配置时长周期运行下 manifest/数据文件无限膨胀。须显式配 `snapshot.time-retained`（如 24h）+ `snapshot.num-retained.min`，并确认 time travel 诉求落在保留窗口内。
- **违反后果**: 快照无界堆积 → 对象存储成本暴涨 + commit 越来越慢。
- **验证方法**: 检出 paimon 表 DDL 但无 `snapshot.time-retained`/`snapshot.num-retained` → warn。
- **对应门禁**: fw_paimon_snapshot_retention(warn)

```verify
id: paimon-r7
cmd: 
expect: always
```

### 规律：time travel 回溯必须在快照保留窗口内
- **适用版本**: Paimon 1.x
- **规律**: `scan.snapshot-id`/`scan.timestamp-millis` 回溯读依赖目标快照未过期；快照被 `snapshot.time-retained` 过期清理后回溯直接报错。配回溯任务前须确认保留窗口覆盖回溯跨度；长跨度回溯须另配 tag/branch 固化快照。
- **违反后果**: 回溯任务偶发失败（目标快照恰好被清理）→ 数据修复链路不可靠。
- **验证方法**: 检出 `scan.snapshot-id`/`scan.timestamp-millis` → warn 人工确认保留窗口。
- **对应门禁**: fw_paimon_time_travel(warn)

```verify
id: paimon-r8
cmd: 
expect: always
```

### 规律：分区字段须低基数、贴合查询裁剪；主键大表须评估分区
- **适用版本**: Paimon 1.x
- **规律**: 分区按目录组织，分区字段须低基数（dt/hour/region）且与查询过滤条件对齐以获得 partition pruning；高基数字段（user_id）分区会产生海量小分区小文件。主键大表（亿级+）无分区时单表 bucket 压力集中，须评估按业务日期分区或确认小表可免分区。
- **违反后果**: 高基数分区 → 元数据爆炸；大表无分区 → 查询全表扫 + 写入热点。
- **验证方法**: 检出主键表 DDL 无 `PARTITIONED BY` → warn 人工确认数据量级。
- **对应门禁**: fw_paimon_partition(warn)

```verify
id: paimon-r9
cmd: 
expect: always
```

### 规律：bucket-key 须为 primary key 子集，跨 bucket upsert 语义特殊
- **适用版本**: Paimon 1.x
- **规律**: 主键表默认按 primary key 整体分桶；`bucket-key` 可指定按主键子集分桶（同 bucket-key 的记录进同桶），但 bucket-key 必须是 primary key 的子集，否则同 primary key 落多桶、去重语义失效。dynamic bucket（`bucket=-1`）下 cross-partition upsert 须额外评估（待验证语义边界）。
- **违反后果**: bucket-key 非主键子集 → 同 key 记录分散多桶，merge 去重失效产生重复行。
- **验证方法**: 检出 `bucket-key` 配置 → warn 人工核对为主键子集。
- **对应门禁**: fw_paimon_bucket_key(warn)

```verify
id: paimon-r10
cmd: 
expect: always
```

### 规律：维表 lookup join 须配 lookup 缓存与刷新策略
- **适用版本**: Paimon 1.x（flink 引擎）
- **规律**: Paimon 表作 Flink 维表 lookup join 时，lookup 走 rocksdb 缓存 + 定期刷新；须配 `lookup.cache.max-rows`/`lookup.cache.ttl`（选项名待验证）控制内存与新鲜度。不配缓存时每条流记录一次点查，吞吐断崖；缓存 TTL 过长则维表更新不及时。
- **违反后果**: 无缓存 → 维表 join 吞吐断崖反压；TTL 过长 → 口径用旧维度。
- **验证方法**: 检出 `FOR SYSTEM_TIME AS OF`（temporal join）但无 `lookup.cache` → warn。
- **对应门禁**: fw_paimon_lookup_join(warn)

```verify
id: paimon-r11
cmd: 
expect: always
```

### 规律：写性能须评估 write-buffer 与 spill；大写入量禁止默认裸跑
- **适用版本**: Paimon 1.x
- **规律**: 每个 writer 内存 write-buffer 写满后排序落盘（spill），`write-buffer-size`（默认值待验证）与 `write-buffer-spillable` 影响写入吞吐与内存占用；TM 内多 bucket writer 共享 buffer。大写入量作业须按 TM 内存显式调 write-buffer 并确认 spill 开启，否则 OOM 或频繁小文件。
- **违反后果**: buffer 过小 → 频繁 spill 小文件爆炸；过大 → TM OOM。
- **验证方法**: 检出 paimon sink 作业源但无 `write-buffer` 配置 → warn 人工评估。
- **对应门禁**: fw_paimon_write_buffer(warn)

```verify
id: paimon-r12
cmd: 
expect: always
```

### 规律：schema 演进走 ALTER TABLE 增列；列类型变更受限禁止 narrowing
- **适用版本**: Paimon 1.x
- **规律**: Paimon 支持 `ALTER TABLE ADD COLUMN` 安全增列；列类型变更仅支持 widening（如 INT→BIGINT），禁止 narrowing（BIGINT→INT 会截断历史数据）；改列类型须人工确认历史数据兼容。分区列/主键列不可随意变更（须重建表）。
- **违反后果**: narrowing 变更 → 历史数据静默截断；改主键列 → 表结构损坏。
- **验证方法**: 检出 `ALTER TABLE` + `MODIFY`/`CHANGE` COLUMN → warn 人工确认 widening 方向。
- **对应门禁**: fw_paimon_schema_evolution(warn)

```verify
id: paimon-r13
cmd: 
expect: always
```

### 规律：file.format 选型（orc/parquet/avro）须显式确认，勿盲用默认
- **适用版本**: Paimon 1.x
- **规律**: 底层文件格式 `file.format` 可选 orc/parquet/avro（默认 orc，待验证）：分析查询列裁剪 orc/parquet 优；CDC 高频写入 avro 行存写入开销低。跨引擎互操作（Spark/Trino/Hive 读同一表）时格式须全引擎支持。选型后变更须确认存量文件兼容（新旧文件可混存，查询双格式开销）。
- **违反后果**: 盲选格式 → 读性能差 / 跨引擎读失败。
- **验证方法**: 检出 `file.format` 配置 → warn 人工确认选型与跨引擎兼容。
- **对应门禁**: fw_paimon_file_format(warn)

```verify
id: paimon-r14
cmd: 
expect: always
```

### 规律：跨引擎互操作（Flink 写 / Spark、Trino、Hive 读）须统一 warehouse 与 catalog
- **适用版本**: Paimon 1.x
- **规律**: 多引擎共享同一 paimon 表必须指向同一 warehouse 路径且 catalog 类型一致（filesystem/Hive metastore）；Hive catalog 下各引擎经 metastore 互见分区元数据。引擎版本兼容矩阵须人工核对（如 Paimon 1.4 引擎 jar 覆盖 Flink 1.16–1.20，Flink 2.0 jar 未发布——待验证 GA 时点）。
- **违反后果**: catalog 不一致 → 引擎间互相看不见表/分区；版本错配 → 读写失败。
- **验证方法**: 人工检查各引擎 catalog 配置指向同一 warehouse + metastore。
- **对应门禁**: 人工检查

```verify
id: paimon-r15
cmd: 
expect: always
```

<!--
共 15 条规律（≥10 门槛）。13 条挂门禁 id，2 条挂人工检查（changelog 消费语义、跨引擎互操作），无游离规律。
verify-framework-ruleset.sh 扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_paimon_pk_bucket | fail | 主键表 DDL 无 'bucket'/bucket-key → fail 单 bucket 瓶颈 | PAIMON_SRC_GLOBS PAIMON_TABLE_GLOBS | — |
| fw_paimon_compaction | warn | 主键表 DDL 无 num-sorted-run/compaction. → warn 依赖默认阈值 | PAIMON_TABLE_GLOBS | — |
| fw_paimon_merge_engine | warn | 检出非 deduplicate merge-engine → warn 语义匹配确认 | PAIMON_TABLE_GLOBS | — |
| fw_paimon_changelog_producer | warn | 检出 scan.mode 流读但表无 changelog-producer → warn 缺前像 | PAIMON_SRC_GLOBS PAIMON_TABLE_GLOBS | — |
| fw_paimon_stream_scan_mode | warn | 检出 scan.mode 配置 → warn 选型语义确认 | PAIMON_SRC_GLOBS | — |
| fw_paimon_snapshot_retention | warn | 表 DDL 无 snapshot.time-retained/num-retained → warn 快照膨胀 | PAIMON_TABLE_GLOBS | — |
| fw_paimon_time_travel | warn | 检出 scan.snapshot-id/timestamp → warn 回溯须在保留窗口 | PAIMON_SRC_GLOBS | — |
| fw_paimon_partition | warn | 主键表无 PARTITIONED BY → warn 确认数据量级 | PAIMON_TABLE_GLOBS | — |
| fw_paimon_bucket_key | warn | 检出 bucket-key → warn 须为主键子集 | PAIMON_TABLE_GLOBS | — |
| fw_paimon_lookup_join | warn | temporal join 无 lookup.cache → warn 吞吐断崖 | PAIMON_SRC_GLOBS | — |
| fw_paimon_write_buffer | warn | paimon sink 作业无 write-buffer → warn 评估内存/spill | PAIMON_SRC_GLOBS | — |
| fw_paimon_schema_evolution | warn | ALTER TABLE MODIFY/CHANGE COLUMN → warn 禁 narrowing | PAIMON_TABLE_GLOBS | — |
| fw_paimon_file_format | warn | 检出 file.format → warn 选型与跨引擎兼容 | PAIMON_TABLE_GLOBS | — |

<!--
门禁 id 命名规范：fw_paimon_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/paimon.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_paimon_<rule>(level) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: paimon  requires_conf: PAIMON_SRC_GLOBS PAIMON_TABLE_GLOBS` 声明。
fixture 验证覆盖：violating 含主键表无 bucket + 无 compaction → fw_paimon_pk_bucket fail 主触发；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| paimon × flink | Flink 流读 paimon 主键表须表侧 changelog-producer + 作业侧 checkpoint；CDC 摄入 paimon 须 checkpoint 保断点 | changelog 生成在表侧，断点续传在作业侧，缺一不可 |
| paimon × flink-cdc | flink-cdc 3.x YAML `sink: connector: paimon` 摄入主键表，merge-engine 默认 deduplicate 按 CDC 事件覆盖 | 摄入语义即 CDC 行覆盖，partial-update 须显式配 |
| paimon × spark | Spark 写 paimon 须同一 catalog/warehouse；MERGE INTO 仅主键表可用 | append 表无主键无法 merge |
| paimon × hive | Hive catalog 模式下 paimon 表对 Hive/Trino 可见；filesystem catalog 不可见 | 元数据共享依赖 metastore |

<!--
本表聚焦 paimon 生态内高频组合；与 flink 的交互为双向互补（flink.md §5 亦有对应行）。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Paimon 0.4–0.8（孵化期） | API 与表格式快速演进，跨版本读兼容须核对 | 孵化期老表升级 1.x 须人工核对迁移 |
| Paimon 1.x（现行 1.4 stable） | 毕业稳定线；引擎 jar 覆盖 Flink 1.16–1.20 / Spark 3.2–4.1 / Trino 440 | Flink 2.0 引擎 jar 未发布（1.5-SNAPSHOT 页标注 Not yet released，待验证 GA 时点） |
| Paimon 1.x | dynamic bucket（bucket=-1） cross-partition upsert 语义边界 | 待验证：dynamic bucket 下主键跨分区更新行为须人工核对 |
| Paimon 1.x | file.format 默认 orc（待验证）；快照 time-retained 默认 1h（待验证） | 默认值依赖版本，生产须显式配置不依赖默认 |

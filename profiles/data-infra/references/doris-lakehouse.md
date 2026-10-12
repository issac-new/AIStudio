# Doris 湖仓集成与 Agent 数据闭环（Agentic AI 数据闭环 · 查询/写回层）

> **事实源文件**——Doris 集成机制细节的唯一权威载体，SOUL 只引用本文件不复述。
> 来源：微信文章《Apache Doris + Paimon 2.0：构建 Agentic AI 数据闭环》（李文强，2026-09-24）+ Doris roadmap（github.com/apache/doris/issues/66418）+ Kwai 向量检索博客 + Paimon Catalog 官方文档
> 裁决与语境过滤：`workspace/research/agentic-ai-data-loop-20260924/FUSION-REPORT.md`
> ⚠️ 成色：语义落地；**Doris 4.2 未 GA（2026-09-24 时点最新已发布 4.1.4），以下 4.2 能力均为官方 roadmap/博客声明，本机未部署未实测，效力待 4.2 GA 后验证（gap-20260924-001）**

---

## 1. 闭环范式（M1）——为什么数据平台要读+写回

Agentic AI 把企业 AI 从一次性问答推向持续的**「感知—检索—分析—行动—反馈」**。Agent 产生新的分类/摘要/风险评分/工具调用结果/处理状态，人工复核产生最终标签——这些结果若只停留应用侧，下一次分析无法利用最新反馈。因此数据平台必须同时支持读取和写回，且**写入有事务一致性**。

一句话定位：大模型决定 Agent 能理解什么，数据平台决定 Agent 在此时此刻能**知道什么、能相信什么、行动之后能留下什么**。

> 等效印证：Time Travel/增量读取在 Flink 侧已有（data-arch/data-flink 的 changelog/消费 binlog 能力），本文件不重复。

## 2. Doris 深度集成 Paimon 三条路径（M6/M7）

| 路径 | 机制 | Doris 版本要求 |
|------|------|----------------|
| **快照一致读取** | Paimon Catalog 发现库表+缓存元数据，单 SQL 内绑定一致 Snapshot 与 Schema；查询规划理解 Manifest、Primary Key 合并、Deletion Vector、增量范围、Time Travel、Branch/Tag——不把主键表退化为普通文件读取 | 4.1+（读） |
| **向量检索进查询计划** | FE 规划下发 Split → BE 经 **C ABI 调 Paimon Rust Reader** → Vector Index 产 Top-K 候选 → 候选范围下推文件/Row Group/Parquet Page → 只物化命中列 → Arrow C Data Interface 转 Doris Block → **MPP 引擎做标量过滤/跨表 Join/聚合/权限判断/精排/全局 Top-K** | 4.2（外表链路社区共建）；原生 index 下推在 5.0 |
| **标准 SQL 写回** | INSERT INTO SELECT / INSERT OVERWRITE / UPDATE / DELETE / MERGE / CREATE TABLE+Schema 演进 / Variant 读写；BE 并行 Writer 按 Paimon 分区/Bucket 规则生成文件，FE 聚合 Commit Message **原子提交一个 Paimon Snapshot**；失败/重试由提交协调器做终止/清理/去重/幂等恢复 | **4.2**（9 月底 GA，roadmap #65086） |

**核心设计判断（M5）**：向量检索不是 Doris 旁边的孤立系统，而是分布式 SQL 计划中的**候选生成阶段**——Paimon Vector Index 负责找到相关数据，Doris 负责判断这些数据在当前业务上下文中是否有效、是否重要、是否值得行动。「检索只产生候选，业务分析才能产生答案」。

## 3. 版本能力矩阵（官方 roadmap 一手，2026-09-24 抓取）

| 能力 | ≤4.1（当前可用） | 4.2（2026-09 预计 GA） | 5.0（2026-11 预告） |
|------|------------------|------------------------|---------------------|
| Paimon Catalog 读 | ✅ 文件系统/HMS/DLF/JDBC(4.1+)，内置 Paimon **1.0.0** SDK | — | 经 Fluss Catalog 读 tiered 表湖侧 |
| Paimon 写 | ❌ 只读 | ✅ INSERT/UPDATE/DELETE/MERGE/DDL/Variant 读写（#65086） | — |
| Paimon 索引读 | ❌ | ❌ | 📅 直接读 Paimon indexes |
| Lance | ❌ | ✅ 读+向量/全文检索+索引管理（#66340） | — |
| Fluss | ❌ | ❌ | 📅 log/PK/tiered 表读（#66399） |
| Variant | ❌ | ✅ Iceberg/Paimon Variant 读写 | — |
| ANN 索引（内表） | ✅ 4.1.4 起 Merge-on-Write 表支持 ANN 索引、多模态文件 embedding | — | — |

> **与本机栈的关键衔接**：Doris ≤4.1 内置 Paimon SDK 为 1.0.0，本机栈锁定 Paimon **2.0.0**——4.2 的读写集成针对 Paimon 2.0 多模态类型，**升级 Doris 时必须核对内置 Paimon SDK 版本与本机 Paimon 2.0.0 的兼容性**（升级流程见 version-lock.md）。

## 4. 上手 SQL（官方示例，Doris 4.2 口径）

```sql
-- 1) 挂 Paimon Catalog（filesystem 型，指向本机 MinIO）
CREATE CATALOG paimon_catalog PROPERTIES (
  'type' = 'paimon',
  'warehouse' = 's3://paimon-warehouse/warehouse',
  's3.endpoint' = 'http://minio:9000',
  's3.access_key' = '<MINIO_ROOT_USER>',
  's3.secret_key' = '<MINIO_ROOT_PASSWORD>'
);

-- 2) 结构化分析
SELECT device_model, defect_type, COUNT(*) AS defect_count
FROM paimon_catalog.quality.inspection_records
WHERE event_time >= NOW() - INTERVAL 30 DAY
GROUP BY device_model, defect_type
ORDER BY defect_count DESC;

-- 3) 向量 Top-K（社区共建链路语法，4.2 口径，以 GA 文档为准）
SELECT id FROM paimon_catalog.quality.vector_items
ORDER BY l2_distance_approximate(embedding, [...]) LIMIT 100;

-- 4) 分析结果写回 Paimon（闭环关键步）
INSERT INTO paimon_catalog.quality.daily_defect_summary
SELECT DATE(event_time), device_model, defect_type, COUNT(*)
FROM paimon_catalog.quality.inspection_records
GROUP BY DATE(event_time), device_model, defect_type;

-- 5) 主键表 MERGE 合并人工复核/模型新结果
MERGE INTO paimon_catalog.quality.inspection_records AS target
USING review_results AS source ON target.record_id = source.record_id
WHEN MATCHED THEN UPDATE SET review_status = source.review_status, defect_type = source.defect_type
WHEN NOT MATCHED THEN INSERT (record_id, review_status, defect_type)
  VALUES (source.record_id, source.review_status, source.defect_type);
```

> 4.1 时代的 `CREATE CATALOG` 语法相同但**只读**；写语句在 4.2 前执行会报错。向量函数名（`l2_distance_approximate`）以 GA 文档为准，roadmap 阶段可能调整。

## 5. 客户实践要点（Kwai，收缩吸收：规模调优已 DROP，保留架构结论）

- 向量与业务字段**同表内联保存**（PK Table，2048 维），不复制到独立向量库——避免第二份业务数据与同步链路带来的过期/错位。
- IVF-RQ 索引 + 候选下推 + 按需物化（只查业务标识时跳过宽向量物化）。
- 架构结论（保留）：**即使面对亿级高维向量和超大 Top-K，也可以保留 Paimon 中的开放数据，通过 Doris SQL 完成向量召回和业务分析，而不必复制到 Doris 内表或另一套向量数据库。**

## 6. 边界声明（显式不吸收）

- Alluxio 远端缓存加速层、亿级 benchmark 调优、SelectDB/DLF 商业托管路径、Doris 5.0 专属能力——理由见 FUSION-REPORT §三。

## 7. 落点与验证钩子

- **路由落点**：data-orchestrator 路由表新增 Doris/OLAP 查询/SQL 写回关键词
- **建模落点**：data-arch 表设计决策清单新增「向量列内联 vs 独立表」「写回表（Agent 结果/人工复核状态）设计」
- **部署落点**：data-infra compose `doris` 服务（profiles: [doris]，默认不启动，4.2 GA 后激活）
- **效力验证钩子**：gap-20260924-001（Doris 4.2 GA 后部署+读写回环实测）

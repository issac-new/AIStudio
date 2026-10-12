# Paimon 2.0 多模态数据能力（Agentic AI 数据闭环 · 存储层）

> **事实源文件**——多模态类型/演进/索引机制细节的唯一权威载体，SOUL 只引用本文件不复述。
> 来源：微信文章《Apache Doris + Paimon 2.0：构建 Agentic AI 数据闭环》（李文强，2026-09-24）+ Paimon 2.0 官方下载页/文档
> 裁决与语境过滤：`workspace/research/agentic-ai-data-loop-20260924/FUSION-REPORT.md`
> 成色：语义落地（知识与设计规则）；效力待验证（本机 Paimon 2.0.0 jar 已在栈内，但多模态类型实测未做）

---

## 1. 为什么需要（Agentic AI 四大挑战 → 存储层要求）

一条业务记录不再一次生成完成：订单/设备/用户状态先到，图片/视频/日志随后产生，OCR、Caption、Embedding、模型评分、人工标签由不同任务异步补全；模型升级后同一数据还要增加新版本特征。Agent 需要的不是静态宽表，而是**持续增加字段/内容/特征/索引的数据资产**。

与之相关的存储层风险：业务事实分散在湖表/对象存储/向量库/搜索系统时，更新时间/版本/删除状态不一致——已下架商品、已维修设备、已撤回文档仍可能被过期索引召回。

## 2. 多模态类型（M2）

| 类型 | 用途 | 物理布局要点 |
|------|------|--------------|
| **BLOB** | 图片/视频/音频等大对象 | 独立文件承载；查询未选择该列时**不读取对象内容**（延迟物化） |
| **VECTOR&lt;t,n&gt;** | Embedding | 固定维度语义 + 专用存储布局 |
| **VARIANT** | 结构灵活的事件/模型输出/工具调用参数 | 可将常用字段拆解为**类型化子列**（shredded layout） |

### 实测勘误（2026-09-25，本机 Flink 1.20.5 + paimon-flink-1.20-2.0.0.jar）

文章与概念层的 `VECTOR<FLOAT,4>` / `BLOB` / `VARIANT` 字面量 **在 Flink SQL 侧不可直接书写**（Flink parser 不识别），正确写法是列注释指令：

| 概念类型 | Flink 1.20 DDL 正确写法 | 附加要求 |
|---|---|---|
| VECTOR | `embed ARRAY<FLOAT> COMMENT '__VECTOR_FIELD;4'` | + 表选项 `field.embed.vector-dim='4'` |
| BLOB | `img BYTES COMMENT '__BLOB_FIELD'` | — |
| VARIANT | **不可用**（官方要求 Flink 2.0+，本栈 1.20.5） | 需升 Flink |
| 专用向量格式 vortex | 需 `paimon-vortex` jar（未装载） | 未验证 |
| 主键 | **row-tracking/data-evolution 表禁主键**（append-only） | `Cannot define primary-key for row tracking table` |

回环实测（S3 catalog → MinIO）：建表 ✓ / INSERT 作业 FINISHED ✓ / SELECT 读回 VECTOR 2 行 + BLOB 1 行 ✓ / Data Evolution（ALTER TABLE ADD score 后旧行 NULL 保留、新行带值）✓。详细输出存 `workspace/research/agentic-ai-data-loop-20260924/VERIFY-LOG.md`。

### 深水区实测（Global Row ID + BLOB 引用共享，2026-09-25 下午）

| 能力 | Flink 侧用法 | 实测 |
|---|---|---|
| Global Row ID（M4） | `SELECT _ROW_ID, … FROM t表$row_tracking` 系统视图 | ✅ `_ROW_ID` 稳定暴露可引用 |
| BLOB 视图引用（零拷贝） | 下游列 `BYTES COMMENT '__BLOB_VIEW_FIELD'` + 写入 `sys.blob_view('db.t源','列',_ROW_ID)` | ✅ 全链路通；MinIO 物理证据：下游 0 个 .blob 文件 |
| BLOB 描述符模式 | 列 `BYTES COMMENT '__BLOB_DESCRIPTOR_FIELD'` | ⚠️ DDL 可建但 **SQL 侧无 raw→descriptor 转换函数**（写 raw bytes 报 `require values to be a BlobDescriptor or BlobViewStruct`）；需 Java/Python API 通道 |

设计原则：不同模态采用合适的物理布局，同时保持**同一张表、同一个 Snapshot、同一条记录**的语义一致性。

## 3. Data Evolution（M3）

模型只补充或更新**变化的列**，不必反复重写未变化的大对象和业务字段。场景：模型升级产出新版本 Embedding/Caption，只写新列不动 BLOB 列。

## 4. Global Row ID + Global Index（M4）

- **Global Row ID**：数据文件、BLOB、向量、索引、删除状态对齐到**同一条逻辑记录**。
- **Global Index**：标量、全文、向量索引统一纳入湖表的**元数据与快照体系**（Index Manifest 记录索引文件的类型/字段/位置/覆盖范围；与 Data Manifest 同被 Snapshot 引用）。
- **价值**：加索引不需要改变数据布局，同一张表仍支持批处理、流处理、常规 OLAP 读取。

## 5. 向量索引与正确检索（M8/M9）

### 5.1 两种形态 + 五种实现

- **形态**：Global Vector Index（append 表，记录覆盖 Row ID 范围）与 PK Vector Index（主键表，记录覆盖源数据文件）；同一套索引实现与检索模型，建索引与召回行方式不同。
- **五实现选型表**：

| 索引 | 主特征 | 典型权衡 |
|------|--------|----------|
| IVF-Flat | 聚类后存原始向量 | 召回高，索引大 |
| IVF-PQ | 乘积量化 | 索引小，有量化损失 |
| IVF-SQ | 残差 8-bit 标量量化 | 吞吐/召回/存储均衡 |
| IVF-RQ | 旋转残差量化 | 压缩率高，需调质量拐点 |
| DiskANN | 图检索+持久化向量重排 | 适合本地 SSD/全本地缓存 |

### 5.2 正确检索三要素（主键表）

1. **索引检索**（按 Partition,Bucket 组织；bucket 既是数据分片单元也是索引单元）
2. **未覆盖文件精确回退**（索引由后台 compaction 生成，只覆盖已 compaction 数据；新写入 L0 文件不在任何索引中）
3. **Deletion Vector 掩码计算**

另：索引分段仅当其覆盖的源文件集合仍匹配 bucket 当前活跃文件集合时才有效（校验需整个 bucket 的完整文件集）。

### 5.3 新鲜度模式（M9，收缩吸收：仅 Paimon 侧）

新写入数据与索引覆盖范围**可被识别**，通过补建索引或不同查询模式处理新鲜度。Doris 5.0 路线规划 `fast`/`full`/`detail` 新鲜度模式与 Global Index Result 消费——**属未发布能力（Doris 5.0 预计 2026-11），不吸收，仅登记**。

## 6. 边界声明（显式不吸收）

- Alluxio 远端缓存加速层（单机栈无收益）
- 亿级向量 benchmark 调优（IVF 参数调优/Top-K 100 万）——语境外
- Doris 5.0 专属能力（ADBC Catalog/Fluss Catalog/Paimon index 下推/fast-full-detail 模式消费）——未发布
- SelectDB 商业预览版、阿里云 DLF 托管 Paimon 路径

## 7. 落点与验证钩子

- **表设计落点**：data-arch「Paimon 表设计与最佳实践」——多模态列建模决策（BLOB 独立列 vs 行内、VECTOR 维度与索引选型、VARIANT 拆列策略）进 DDL 决策清单
- **写路径落点**：data-flink「Paimon 接入」——Data Evolution 局部列更新（Flink 部分更新语义）
- **效力验证钩子**：gap-20260924-002（多模态类型/向量索引实测）

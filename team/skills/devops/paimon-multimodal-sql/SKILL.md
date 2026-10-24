---
name: paimon-multimodal-sql
description: "Use when Paimon 多模态类型 Flink SQL 写法/验证报 ParseException 时."
version: 1.0.0
metadata:
  hermes:
    tags: [paimon, flink, sql, vector, blob, data-evolution]
    related_skills: [docker-compose-data-stack, data-stack-operations]
---

# paimon-multimodal-sql — Paimon 2.0 多模态类型 Flink SQL 接入与回环验证

> 适用 `paimon-flink-1.20-2.0.0.jar`（本栈锁定）。深度域知识在
> `~/.hermes/profiles/data-orchestrator/references/paimon-2.0-multimodal.md`（四 profile 副本，含实测勘误节）；
> 本 skill 管操作员侧的写法与验证流程。

## 触发条件

- 建 VECTOR/BLOB/VARIANT 列的 Paimon 表，或做 Data Evolution（ALTER ADD 不重写旧数据）
- 多模态 DDL 报 `ParseException`/`Cannot define primary-key`/`vector-dim` 相关错
- 文章/设计文档声称的 `VECTOR<FLOAT,4>` 字面量语法需要落地验证

## 核心铁律：字面量不可用，走注释指令

Flink SQL parser **不识别** `VECTOR<FLOAT,4>`/`BLOB`/`VARIANT` 字面量（概念层口径）。
> Flink 侧接入通道 = 列注释指令 + 表选项。拿到文章口径先转写再测。

## 实测 DDL（回环通过，可直接抄）

```sql
-- 向量列：ARRAY<FLOAT> + 注释指令 + vector-dim 选项（三者缺一不可）
CREATE TABLE t_vec (
  id BIGINT,
  embed ARRAY<FLOAT> COMMENT '__VECTOR_FIELD;4'
) WITH (
  'row-tracking.enabled'='true',
  'data-evolution.enabled'='true',
  'field.embed.vector-dim'='4'
);
INSERT INTO t_vec VALUES (1, ARRAY[1.0, 2.0, 3.0, 4.0]);

-- BLOB 列：BYTES + 注释指令
CREATE TABLE t_blob (
  id BIGINT, name STRING,
  img BYTES COMMENT '__BLOB_FIELD'
) WITH ('row-tracking.enabled'='true', 'data-evolution.enabled'='true');
INSERT INTO t_blob VALUES (1, 'cat', X'89504E470D0A1A0A');

-- Data Evolution：只补变化列，旧数据不重写
ALTER TABLE t_vec ADD score DOUBLE;
INSERT INTO t_vec VALUES (3, ARRAY[9.9, 9.9, 9.9, 9.9], 0.87);
```

## 能力边界（禁超界宣称）

| 能力 | 判定 | 条件 |
|---|---|---|
| VECTOR / BLOB / Data Evolution | ✅ | 注释指令写法 |
| VARIANT | ❌ | 需 Flink 2.0+；Spark 4.0+ 通道可替 |
| vortex 向量格式 | ❌ | 需单独 paimon-vortex jar |
| 向量检索/Global Index 下推 | ❌ | 属 Doris/Spark 引擎侧能力，非 Flink 侧 |

## 回环验证流程（四层判据，缺一不可）

1. **DDL 过**：`[INFO] Execute statement succeeded`（parser+catalog 双过）
2. **作业完成**：`curl -s :8081/jobs/overview` 确认 FINISHED——INSERT 返回≠完成（异步）；
   FAILED 根因在 taskmanager 日志 cause 链**尾部**（JobException 只是外层包装），REST 被截断就不截断重取
3. **读回**：batch 模式 SELECT 行数与值正确
4. **物理级**：`mc ls --recursive <alias>/paimon-warehouse/<db>/` 看到 `.parquet`+`.blob` 分离文件、
   `schema/schema-N` 递增、`snapshot/snapshot-N` 递增

验证残留（探针库/表）保留作复验锚点，不清理。

## 坑（按报错反查）

| 报错 | 根因与修法 |
|---|---|
| `ParseException: Encountered "<"` / `Incorrect syntax near 'BLOB'` | 用了字面量类型→换注释指令 |
| `Cannot define primary-key for row tracking table` | row-tracking/data-evolution 表必须 append-only，去 PRIMARY KEY |
| `you must also set 'field.%s.vector-dim'` | 注释指令外的必选表选项，列名对应 |
| `Could not find any factory for identifier 'vortex'` | 缺 jar；不指定 `vector.file.format` 走默认向量格式 |
| `Cannot get latest schema`（TM 侧） | file:// 仓库 JM/TM 不共享→换 S3(MinIO) catalog |
| SELECT 挂起 | 流模式默认→`SET 'execution.runtime-mode'='batch'` + 容器内 `timeout` 硬保护 |

## 外部依赖能力（如 Doris 4.2 向量检索）

未 GA 前禁入「已落地」表述：登记 gap 挂起；GA 判定双源（Docker Hub tag + 官网 release 页），
勿信文章发布节奏。GA 后先补回环实测再改成色。
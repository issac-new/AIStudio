# 数据团队能力地图 (capability-map)

> **单一事实源**: 数据团队四域(架构/分析/治理/安全)能力与责任分配。
> 依据: `~/hermes-docker-sandbox/workspace/data-team-research/domains/` 四份调研(2026-09-04)。
> 变更本文件必须 kanban_comment 上报 orchestrator。

## 四域 × 角色责任矩阵 (R=执行 A=问责 C=咨询 I=知会)

| 能力项 | data-arch | data-flink | data-infra | data-orchestrator |
|--------|-----------|------------|------------|-------------------|
| **架构域** | | | | |
| 分层建模 ODS/DWD/DWS/ADS | **R/A** | C | I | I |
| 维度建模 (Kimball/Data Vault 选型) | **R/A** | C | — | I |
| 元数据与血缘 (DataHub/OpenMetadata 运行) | **A** | R | R | I |
| 湖仓表设计 (Paimon 主键表/Fluss KV) | **R/A** | C | C | I |
| **分析域** | | | | |
| 指标体系与指标字典 | **R** | C | — | **A** |
| 指标口径管理 (单一口径/血缘对账) | **R** | R | — | **A** |
| AB 实验数据支撑 | C | R(数据管道) | — | **A** |
| 语义层/Headless BI 选型 | **R** | C | C | A |
| **治理域** | | | | |
| 数据标准与命名规范 | **R/A** | C | C | I |
| 数据质量六性门禁 | A | **R**(管道内置) | C | I |
| 表变更通知与影响分析 | **R/A** | R | I | I |
| DCMM 成熟度对标 | **R** | C | C | **A** |
| **安全域** | | | | |
| 分类分级 (GB/T 43698 / JR/T 0197) | **R** | C | C | **A** |
| 脱敏规则 (CDC 管道内置脱敏) | C | **R** | C | I |
| 权限模型 (RBAC/ABAC 落地) | C | C | **R** | A |
| 审计日志与操作留痕 | I | R | **R/A** | I |
| 个人信息合规检查点 (PIPL) | C | R | R | **A** |

## 四域核心标准速查 (详见 domains/*.md)

| 域 | 关键标准/方法论 | 一句话约束 |
|----|----------------|-----------|
| 架构 | DAMA-DMBOK2、Kimball、Data Vault 2.0、华为数据之道、阿里 OneData、DCMM | 分层边界清晰,模型先于代码 |
| 分析 | CRISP-DM、OSM/AARRR、大厂指标中台、语义层 | 指标口径唯一,字典先行 |
| 治理 | DCMM(GB/T 36073)、GB/T 36344 质量六性、华为数据底座、数据资产入表 | 表变更必通知,质量门禁前置 |
| 安全 | 数安法/个保法、GB/T 43698 重要数据、JR/T 0197 分级、GDPR/ISO 27701 | 先分级后入湖,敏感字段必脱敏 |

## 团队级 SOP (固化清单,任务中强制执行)

1. **表变更通知**: 任何 DDL 变更 → arch 产出变更单(影响表清单/下游作业/血缘) → kanban_comment 通知 flink → flink 确认兼容后才可执行
2. **质量门禁**: DWD 及以上层作业必须内置质量规则(行数波动/主键唯一/非空),checkpoint 与质量检查双通过才算作业健康
3. **分类分级检查点**: 新 CDC 管道开工前,arch 必须对源表做字段分级(公开/内部/敏感/个人信息),个人信息字段必须同步脱敏方案
4. **指标口径**: 新指标必须先入指标字典(名称/口径/来源表/责任人),无字典不入代码
5. **审计留痕**: infra 对 mysql/redis/卷的一切变更操作必须在 kanban_comment 留命令+时间

## 产物与引用

- 四域调研全文: `~/hermes-docker-sandbox/workspace/data-team-research/domains/data-{architecture,analysis,governance,security}.md`
- 本文件同步副本: data-orchestrator/references/capability-map.md

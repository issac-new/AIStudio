---
name: asset-topology-graph
description: "Use when a recon engagement accumulates findings across multiple kanban cards and assets/reasoning need separated dual-graph modeling (asset topology table + task reasoning lineage table), ARTEX dual-graph style."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [recon, knowledge-model, asset-graph, lineage, artex]
    source: "ARTEX dual-graph: db/schema.sql:41-262 (T1§2); T4 合并报告矩阵#1"
    target_profile: hack-recon
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# Asset Topology Graph — 双图建模规范（资产拓扑 + 任务推理谱系）

> 对照 ARTEX 全局 Asset Graph（PostgreSQL `assets` 表，7 类型唯一索引）+ 任务级 Exploration Graph（`exploration_nodes/edges`，CHECK 约束硬编码状态机）。本集群基座 = kanban SQLite + target-scoped-workspace，本技能定义**数据模型与读写规范**，不引入新运行时。

## 何时用（触发条件）

- 一个授权渗透/审计任务的 recon 阶段持续 ≥3 天，findings 散落在多张 kanban 卡 body，无法一眼看清「资产全貌」
- 需要回答：「这个目标有哪些资产？哪条推理线走到了哪一步？哪条线是死路？」
- 派卡给 exploit/forensics 前，需要一份机读的资产+谱系摘要作为输入

## 双图数据模型

两张表同库（kanban SQLite 或 engagement 工作区内的 `kb.sqlite`），用 `engagement_id` 关联：

### 表 1：asset_topology（全局资产拓扑）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | `ast-<8hex>` |
| engagement_id | TEXT | 关联 engagement |
| asset_type | TEXT | host / domain / endpoint / credential / service / file / persona（对照 ARTEX 7 类型） |
| value | TEXT | 规范化值（域名小写、IP 去前缀零） |
| attrs | JSON | 端口、技术栈、来源卡号等 |
| first_seen_card | TEXT | kanban task_id（溯源） |
| confidence | TEXT | confirmed / probable / lead |
| created_at | INT | epoch |

唯一约束：`(engagement_id, asset_type, value)` —— 同资产只建一次，重复 recon 命中只更新 attrs。

### 表 2：reasoning_lineage（任务推理谱系）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | `rnode-<8hex>` |
| parent_id | TEXT NULL | 父推理节点（谱系边） |
| engagement_id | TEXT | 同上 |
| card_id | TEXT | 产生该节点的 kanban task_id |
| claim | TEXT | 推理内容（如「/api/v2/users 存在顺序 ID」） |
| status | TEXT | open / supported / refuted / dead_end（CHECK 约束，状态机对齐 ARTEX exploration_nodes） |
| evidence_ref | TEXT | 挂 fp-check / evidence-gate 证据编号 |

CHECK 约束硬编码状态机：`open → supported | refuted | dead_end`（一验即不通可直接判死），`supported/refuted → dead_end`（终态）；`dead_end` 不可复活。

## 标准步骤

1. engagement 开工时建库：`python3 scripts/kb_bootstrap.py --engagement <slug> --db kb.sqlite`（建表+唯一索引+CHECK）
2. 每张 recon 卡产出 findings 后：`python3 scripts/kb_ingest.py --db kb.sqlite --card <task_id> --findings findings.json`（findings.json = 结构化资产+推理声明清单）
3. 卡内遇到「此路不通」结论：把对应推理节点标 `dead_end`（kanban_comment 同步留痕）
4. 派卡给下游前导出：`python3 scripts/kb_export.py --db kb.sqlite --engagement <slug> --format md`（资产清单+活跃推理树+死路列表）

## 陷阱

- 资产规范化最易出错：域名必须小写去尾点、IPv4 去前导零，否则唯一索引漏判重复 → bootstrap 脚本内置 `_normalize()`，禁手写 INSERT
- 推理节点脱离 kanban 卡游离：每个节点必须带 `card_id`，无卡号的推理不入库
- 状态机绕开 CHECK 直接 UPDATE 是 ARTEX 式「规则可删改」反面教材 → 只允许走 `kb_ingest.py --transition` 子命令

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/asset-topology-graph/scripts/accept_asset_topology_graph.py
# 预期输出末行：ALL GREEN asset-topology-graph acceptance exit=0
# 脚本在 mktemp 干净环境自建库自验，含 2 次预期真实拦截：
#   T1 重复资产变体（大小写/尾点/前导零 IP）被唯一索引归并
#   T2 dead_end 终态复活被状态机拒绝（exit=1 后断言拦截成立）
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_asset_topology_graph.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实拦截 1（T1）：重复域名变体（`API.Example.COM.` / `api.example.com`）+ 前导零 IP（`010.0.0.07` / `10.0.0.7`）被唯一索引+`_normalize()` 归并为各 1 行资产。
- 真实拦截 2（T2）：终态 `dead_end` 再转 `supported` 被 `VALID_TRANSITIONS` 状态机拒绝（exit=1，预期拦截断言成立）。
- 开发期修正留痕：状态机首版漏了 `open → dead_end` 直判路径，验收脚本真实拦住了这个设计缺口后修正——门生效的直接证据。

## 与既有机制关系

- 补充 `attack-path-graph`（attack-path-graph 从 recon notes 推攻击路径，本技能管「资产与推理的存取规范」——一个是推理产物，一个是知识底座）
- 对接 `target-scoped-workspace`（kb.sqlite 落在 engagement 工作区内，随工作区归档）

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。

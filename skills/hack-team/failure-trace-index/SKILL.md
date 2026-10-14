---
name: failure-trace-index
description: "Use when a task fails and the same dead-end might recur across cards/workers — index failed attempts (dead-end claims, failing payloads, blocked paths) into a keyword-searchable ledger so 'this path is dead' is reusable."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [recon, knowledge-model, failure-ledger, cross-card, artex]
    source: "ARTEX search_all_worker_traces: agent/tools.go:1871,1983, tools_insert.go:669-678 (T1§5); T4 合并报告矩阵#2"
    target_profile: hack-recon
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# Failure Trace Index — 跨卡失败尝试检索索引

> 对照 ARTEX `search_all_worker_traces`：全局捞取含失败在内的 worker 步骤，让「此路不通」跨任务复用。本集群基座 = kanban SQLite（只读检索）+ engagement 工作区本地 ledger。本技能定义**失败留痕格式 + 检索规范**。

## 何时用（触发条件）

- 卡内某个尝试失败（payload 被拦、路径 404、凭据失效、工具超时），判断这个失败对后续卡有复用价值
- 接手一张卡前，想查「同类目标/同类思路是否已经死过一次」
- 复盘时需要统计某类手法的失败率

## 失败留痕格式（failure ledger 条目）

每条失败尝试写入 engagement 工作区 `failures.jsonl`（一行一 JSON）：

| 字段 | 必填 | 说明 |
|---|---|---|
| id | ✅ | `fail-<8hex>`（内容寻址：sha1(card+claim)） |
| card_id | ✅ | kanban task_id |
| engagement | ✅ | engagement slug |
| category | ✅ | dead-end / blocked / timeout / invalid-assumption / tool-failure |
| claim | ✅ | 一句话结论：「<手法> 对 <目标特征> 不可行，因为 <根因>」 |
| context | – | 触发条件（目标指纹、入口点、所用工具版本） |
| evidence_ref | – | fp-check/evidence-gate 证据编号 |
| created_at | ✅ | epoch |

**铁律**：claim 必须含「因为 <根因>」——无根因的死路条目对复用者无价值，禁止入库。

## 标准步骤

1. 卡内尝试失败且判定可复用 → `python3 scripts/ft_add.py --ledger failures.jsonl --card <task_id> --engagement <slug> --category dead-end --claim "..."`（无「因为」子句会被拒）
2. 新卡开工前检索：`python3 scripts/ft_search.py --ledger failures.jsonl --query "<关键词>"`（claim+context 全文子串匹配，多词 AND）
3. 跨 engagement 汇总：`--ledger ~/.hermes/failures-all.jsonl`（多文件路径逗号分隔）
4. 复盘统计：`python3 scripts/ft_stats.py --ledger failures.jsonl`（按 category/engagement 计数）

## 陷阱

- 只记「失败了」不记根因 → ledger 变噪音堆。`ft_add.py` 机械拒绝无「因为」的 claim
- 死路条目写敏感值（token/密码）→ ledger 是长期资产，写特征描述不写值
- 与 asset-topology-graph 的 `dead_end` 状态混淆：那边是推理节点终态（结构化），这边是自由文本经验索引（检索用）——同一条死路两边都写，用相同 `card_id` 关联

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/failure-trace-index/scripts/accept_failure_trace_index.py
# 预期输出末行：ALL GREEN failure-trace-index acceptance exit=0
# 含 2 次预期真实拦截：
#   T1 无「因为」根因的 claim 被 ft_add 拒绝（exit=1）
#   T2 检索命中写入的死路条目（fixture 三条中按关键词捞回目标条）
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_failure_trace_index.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实拦截 1（T1）：`--claim "MSSQL 枚举不通"`（无根因子句）被 ft_add 拒绝 exit=1。
- 真实拦截 2（T2）：三条 fixture 中按 `saml` 关键词检索精确命中目标条目（另两条不混入）。

## 与既有机制关系

- 补充 `asset-topology-graph`（结构化推理终态 vs 自由文本失败索引，card_id 关联）
- 补充 `session_search`（会话回忆是模糊的、无结构；本 ledger 是 engagement 级精确检索）

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。
